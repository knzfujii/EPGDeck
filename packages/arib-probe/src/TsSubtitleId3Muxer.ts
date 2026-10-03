import { Transform, TransformCallback } from 'stream';
import { calcCrc32Mpeg2 } from './crc32.js';
import { ID3 } from './id3/id3.js';
import { TsPesParser } from './pes/TsPesParser.js';
import { packetizeToTs } from './section/TsPacketizer.js';
import { TsSectionAssembler } from './section/TsSectionAssembler.js';
import { TsPacket } from './TsPacket.js';

export interface TsSubtitleId3MuxerOptions {
    /** Target program number to inject ID3 metadata (defaults to first program found) */
    targetProgramNumber?: number;
}

/**
 * Transforms an MPEG-2 TS stream by converting ARIB STD-B24 subtitles
 * into ID3 Timed Metadata PES packets (stream_type: 0x15) for HLS players (e.g. hls.js + aribb24.js).
 *
 * Fixes the upstream node-arib-subtitle-timedmetadater bug where CaptionManagement (Group 0)
 * was dropped, ensuring both CaptionManagement and CaptionStatement are preserved.
 */
export class TsSubtitleId3Muxer extends Transform {
    private readonly targetProgramNumber: number | null;
    private readonly pmtPids: Set<number> = new Set();
    private readonly pmtContinuityCounters: Map<number, number> = new Map();
    private readonly metadataContinuityCounters: Map<number, number> = new Map();

    private readonly pmtSectionAssemblers: Map<number, TsSectionAssembler> = new Map();
    private readonly patAssembler: TsSectionAssembler;

    private readonly subtitlePids: Set<number> = new Set();
    private readonly subtitlePesParsers: Map<number, TsPesParser> = new Map();

    private readonly pmtId3Pids: Map<number, number> = new Map();
    private readonly pmtSubtitlePids: Map<number, number> = new Map();

    private remainder: Uint8Array = new Uint8Array(0);

    constructor(options: TsSubtitleId3MuxerOptions = {}) {
        super({ objectMode: false });
        this.targetProgramNumber = options.targetProgramNumber ?? null;

        this.patAssembler = new TsSectionAssembler((_tableId, section) => {
            this.handlePat(section);
        });
    }

    private handlePat(section: Uint8Array): void {
        if (section.length < 8 || section[0] !== 0x00) return;

        const sectionLength = ((section[1] & 0x0f) << 8) | section[2];
        const sectionEnd = 3 + sectionLength - 4;

        for (let offset = 8; offset + 4 <= sectionEnd; offset += 4) {
            const programNum = (section[offset] << 8) | section[offset + 1];
            const pmtPid = ((section[offset + 2] & 0x1f) << 8) | section[offset + 3];

            if (programNum === 0 || pmtPid === 0x10) continue; // NIT
            if (this.targetProgramNumber !== null && programNum !== this.targetProgramNumber) continue;

            if (!this.pmtPids.has(pmtPid)) {
                this.pmtPids.add(pmtPid);
                this.pmtContinuityCounters.set(pmtPid, 0);

                const assembler = new TsSectionAssembler((_tid, pmtSection) => {
                    this.handlePmt(pmtPid, pmtSection);
                });
                this.pmtSectionAssemblers.set(pmtPid, assembler);
            }
        }
    }

    private handlePmt(pmtPid: number, pmt: Uint8Array): void {
        if (pmt.length < 12 || pmt[0] !== 0x02) return;
        if (calcCrc32Mpeg2(pmt) !== 0) return;

        const programNumber = (pmt[3] << 8) | pmt[4];
        const programInfoLength = ((pmt[10] & 0x0f) << 8) | pmt[11];

        // 1. Scan for subtitle stream and gather existing PIDs
        const usedPids = new Set<number>([0x0000, 0x0001, 0x0010, 0x0011, 0x0012, 0x0014, 0x1fff, pmtPid]);
        let foundSubtitlePid = -1;

        let esOffset = 12 + programInfoLength;
        const pmtLength = ((pmt[1] & 0x0f) << 8) | pmt[2];
        const pmtEnd = 3 + pmtLength - 4; // exclude CRC32

        while (esOffset + 5 <= pmtEnd) {
            const streamType = pmt[esOffset];
            const elementaryPid = ((pmt[esOffset + 1] & 0x1f) << 8) | pmt[esOffset + 2];
            const esInfoLength = ((pmt[esOffset + 3] & 0x0f) << 8) | pmt[esOffset + 4];
            usedPids.add(elementaryPid);

            let descOffset = esOffset + 5;
            const descEnd = descOffset + esInfoLength;
            let isSubtitle = streamType === 0x06;

            while (descOffset + 2 <= descEnd) {
                const tag = pmt[descOffset];
                const len = pmt[descOffset + 1];
                if (tag === 0x52 && len >= 1) {
                    // stream_identifier_descriptor: component_tag
                    const compTag = pmt[descOffset + 2];
                    if ((compTag >= 0x30 && compTag <= 0x37) || compTag === 0x87) {
                        isSubtitle = true;
                    }
                }
                descOffset += 2 + len;
            }

            if (isSubtitle && foundSubtitlePid === -1) {
                foundSubtitlePid = elementaryPid;
            }

            esOffset += 5 + esInfoLength;
        }

        // 2. Allocate an ID3 PID
        let id3Pid = 0x1ffe;
        while (usedPids.has(id3Pid)) {
            id3Pid--;
        }

        this.pmtId3Pids.set(pmtPid, id3Pid);
        if (!this.metadataContinuityCounters.has(id3Pid)) {
            this.metadataContinuityCounters.set(id3Pid, 0);
        }

        // 3. Register subtitle PES parser if subtitle found
        if (foundSubtitlePid >= 0) {
            this.pmtSubtitlePids.set(pmtPid, foundSubtitlePid);
            this.subtitlePids.add(foundSubtitlePid);

            if (!this.subtitlePesParsers.has(foundSubtitlePid)) {
                this.subtitlePesParsers.set(
                    foundSubtitlePid,
                    new TsPesParser(pes => {
                        this.handleSubtitlePes(foundSubtitlePid, pes.pts ?? 0, pes.payload);
                    }),
                );
            }
        }

        // 4. Construct rewritten PMT with metadata_pointer_descriptor and metadata_elementary_stream (0x15)
        const pointerDesc = ID3.createMetadataPointerDescriptor(programNumber);
        const metadataEs = ID3.createMetadataElementaryStream(id3Pid);

        // Program info & ES info
        const origProgramInfo = pmt.subarray(12, 12 + programInfoLength);
        const origEsInfo = pmt.subarray(12 + programInfoLength, pmtEnd);

        const newProgramInfoLength = programInfoLength + pointerDesc.length;
        const newPmtBodyLength = 9 + newProgramInfoLength + origEsInfo.length + metadataEs.length; // 9 = header after section_length
        const totalSectionLength = newPmtBodyLength + 4; // +4 for CRC32

        const newPmt = new Uint8Array(3 + totalSectionLength);
        newPmt[0] = pmt[0];
        newPmt[1] = (pmt[1] & 0xf0) | ((totalSectionLength >> 8) & 0x0f);
        newPmt[2] = totalSectionLength & 0xff;
        newPmt.set(pmt.subarray(3, 10), 3);

        newPmt[10] = (pmt[10] & 0xf0) | ((newProgramInfoLength >> 8) & 0x0f);
        newPmt[11] = newProgramInfoLength & 0xff;

        let writePos = 12;
        newPmt.set(origProgramInfo, writePos);
        writePos += origProgramInfo.length;
        newPmt.set(pointerDesc, writePos);
        writePos += pointerDesc.length;

        newPmt.set(origEsInfo, writePos);
        writePos += origEsInfo.length;
        newPmt.set(metadataEs, writePos);
        writePos += metadataEs.length;

        // Calculate and append CRC32
        const crc = calcCrc32Mpeg2(newPmt.subarray(0, writePos));
        newPmt[writePos] = (crc >> 24) & 0xff;
        newPmt[writePos + 1] = (crc >> 16) & 0xff;
        newPmt[writePos + 2] = (crc >> 8) & 0xff;
        newPmt[writePos + 3] = crc & 0xff;

        // 5. Packetize new PMT and emit
        const currentCc = this.pmtContinuityCounters.get(pmtPid) ?? 0;
        const packetized = packetizeToTs(newPmt, {
            pid: pmtPid,
            continuityCounter: currentCc,
            isSection: true,
        });

        this.pmtContinuityCounters.set(pmtPid, packetized.nextContinuityCounter);
        for (const pkt of packetized.packets) {
            this.push(pkt);
        }
    }

    private handleSubtitlePes(subtitlePid: number, pts: number, payload: Uint8Array): void {
        // Find corresponding ID3 PID
        let targetId3Pid = -1;
        for (const [pmtPid, subPid] of this.pmtSubtitlePids.entries()) {
            if (subPid === subtitlePid) {
                targetId3Pid = this.pmtId3Pids.get(pmtPid) ?? -1;
                break;
            }
        }
        if (targetId3Pid === -1) return;

        // In ARIB STD-B24:
        // payload consists of data_group:
        // byte 0: data_group_id (6 bits) + data_group_version (2 bits)
        // Group 0 = CaptionManagement, Group 1 = CaptionStatement
        // We preserve both without dropping CaptionManagement!
        if (payload.length === 0) return;

        // Package subtitle binary into ID3v2 PRIV ('aribb24.js') container
        const id3 = ID3.createPrivFrame('aribb24.js', payload);
        const timedMetadataPes = ID3.createTimedMetadataPes(pts, id3);

        const currentCc = this.metadataContinuityCounters.get(targetId3Pid) ?? 0;
        const packetized = packetizeToTs(timedMetadataPes, {
            pid: targetId3Pid,
            continuityCounter: currentCc,
            isSection: false,
        });

        this.metadataContinuityCounters.set(targetId3Pid, packetized.nextContinuityCounter);
        for (const pkt of packetized.packets) {
            this.push(pkt);
        }
    }

    public _transform(chunk: Buffer | Uint8Array, _encoding: BufferEncoding, callback: TransformCallback): void {
        let buffer: Uint8Array;
        if (this.remainder.length > 0) {
            const merged = new Uint8Array(this.remainder.length + chunk.length);
            merged.set(this.remainder);
            merged.set(chunk, this.remainder.length);
            buffer = merged;
            this.remainder = new Uint8Array(0);
        } else {
            buffer = chunk;
        }

        let offset = 0;
        const len = buffer.length;

        while (offset + TsPacket.PACKET_SIZE <= len) {
            if (buffer[offset] !== TsPacket.SYNC_BYTE) {
                const nextSync = buffer.indexOf(TsPacket.SYNC_BYTE, offset);
                if (nextSync === -1) {
                    offset = len;
                    break;
                }
                offset = nextSync;
                if (offset + TsPacket.PACKET_SIZE > len) {
                    break;
                }
            }

            const packetSlice = buffer.subarray(offset, offset + TsPacket.PACKET_SIZE);
            const packet = new TsPacket(packetSlice);
            const pid = packet.pid;

            if (pid === 0x0000) {
                // PAT
                this.patAssembler.pushPacket(packet);
                this.push(packetSlice);
            } else if (this.pmtSectionAssemblers.has(pid)) {
                // Intercept and rewrite PMT
                const pmtAssembler = this.pmtSectionAssemblers.get(pid)!;
                pmtAssembler.pushPacket(packet);
            } else if (this.subtitlePids.has(pid)) {
                // Subtitle stream: pass through original packet AND feed to PES parser
                const parser = this.subtitlePesParsers.get(pid);
                if (parser) {
                    parser.pushPacket(packet);
                }
                this.push(packetSlice);
            } else {
                // Normal pass-through
                this.push(packetSlice);
            }

            offset += TsPacket.PACKET_SIZE;
        }

        if (offset < len) {
            this.remainder = buffer.slice(offset);
        }

        callback();
    }

    public _flush(callback: TransformCallback): void {
        this.remainder = new Uint8Array(0);
        for (const parser of this.subtitlePesParsers.values()) {
            parser.flush();
        }
        callback();
    }
}
