import { describe, expect, it } from 'vitest';
import {
    calcCrc32Mpeg2,
    decodeMjdBcdTime,
    decodePmtSection,
    decodeTotSection,
    decodeAribString,
    decodeEitSection,
    decodeBcdDuration,
    getStreamTypeName,
    getWellKnownPidName,
    getStreamCategory,
    getAudioComponentTypeName,
    getAudioSamplingRateHz,
    ID3,
    packetizeToTs,
    resolvePidName,
    TsPacket,
    TsPesParser,
    TsProbe,
    TsSectionAssembler,
    TsSubtitleId3Muxer,
} from '../../packages/arib-probe/src/index.js';

describe('arib-probe', () => {
    describe('calcCrc32Mpeg2', () => {
        it('should calculate valid MPEG-2 CRC32 and verify zero remainder on self-check', () => {
            // Test standard PAT section header (8 bytes)
            const data = new Uint8Array([0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xf0, 0x00]);
            const crc = calcCrc32Mpeg2(data);

            const withCrc = new Uint8Array(data.length + 4);
            withCrc.set(data);
            withCrc[data.length] = (crc >> 24) & 0xff;
            withCrc[data.length + 1] = (crc >> 16) & 0xff;
            withCrc[data.length + 2] = (crc >> 8) & 0xff;
            withCrc[data.length + 3] = crc & 0xff;

            // When appending CRC-32 to MPEG-2 data, the CRC-32 of data+crc is 0
            expect(calcCrc32Mpeg2(withCrc)).toBe(0);
        });
    });

    describe('TsPacket', () => {
        it('should parse TS packet header fields correctly', () => {
            const buf = new Uint8Array(188);
            buf[0] = 0x47; // sync_byte
            buf[1] = 0x5f; // TEI=0, PUSI=1, Priority=0, PID high=0x1F
            buf[2] = 0xff; // PID low=0xFF -> PID = 0x1FFF (Null packet)
            buf[3] = 0x1a; // Scramble=00, AFC=01 (payload only), CC=10
            buf.fill(0xaa, 4);

            const packet = new TsPacket(buf);
            expect(packet.syncByte).toBe(0x47);
            expect(packet.transportErrorIndicator).toBe(false);
            expect(packet.payloadUnitStartIndicator).toBe(true);
            expect(packet.transportPriority).toBe(false);
            expect(packet.pid).toBe(0x1fff);
            expect(packet.transportScramblingControl).toBe(0);
            expect(packet.adaptationFieldControl).toBe(1);
            expect(packet.continuityCounter).toBe(10);
            expect(packet.hasPayload).toBe(true);
            expect(packet.hasAdaptationField).toBe(false);
            expect(packet.getPayload()?.length).toBe(184);
        });

        it('should handle adaptation field and discontinuity indicator', () => {
            const buf = new Uint8Array(188);
            buf[0] = 0x47;
            buf[1] = 0x01; // PID = 0x0100
            buf[2] = 0x00;
            buf[3] = 0x35; // AFC=11 (AF + payload), CC=5
            buf[4] = 7; // AF length
            buf[5] = 0x80; // discontinuity_indicator = 1

            const packet = new TsPacket(buf);
            expect(packet.hasAdaptationField).toBe(true);
            expect(packet.hasPayload).toBe(true);
            expect(packet.adaptationFieldLength).toBe(7);
            expect(packet.discontinuityIndicator).toBe(true);
            expect(packet.getPayload()?.length).toBe(188 - 5 - 7);
        });

        it('should decode Program Clock Reference (PCR) correctly', () => {
            const buf = new Uint8Array(188);
            buf[0] = 0x47;
            buf[1] = 0x01; // PID = 0x0100
            buf[2] = 0x00;
            buf[3] = 0x30; // AFC=11 (AF + payload)
            buf[4] = 7; // AF length: 1 flag byte + 6 PCR bytes
            buf[5] = 0x10; // PCR_flag = 1

            // 1秒に相当する PCR:
            // 90,000 base ticks (= 1秒), extension = 0
            // base = 90,000 = 0x00015F90
            // 33-bit base encoded across byte 6..10:
            // base >> 1 = 45000 = 0x0000AFC8 -> b6=0, b7=0, b8=0xaf, b9=0xc8
            // base & 1 = 0 -> b10 top bit = 0
            // ext = 0 -> b10 bottom bit = 0, b11 = 0
            const base = 90000;
            buf[6] = (base >> 25) & 0xff;
            buf[7] = (base >> 17) & 0xff;
            buf[8] = (base >> 9) & 0xff;
            buf[9] = (base >> 1) & 0xff;
            buf[10] = ((base & 1) << 7) | 0x7e; // reserved bits 0x7E
            buf[11] = 0x00;

            const packet = new TsPacket(buf);
            expect(packet.hasPcr).toBe(true);
            expect(packet.pcrBase).toBe(90000);
            expect(packet.pcrExtension).toBe(0);
            expect(packet.pcr27MHz).toBe(27000000n);
            expect(packet.pcrSeconds).toBe(1.0);
        });
    });

    describe('PID & Stream Type Name Resolution', () => {
        it('should resolve well-known PIDs and stream types', () => {
            expect(getWellKnownPidName(0x0000)).toBe('PAT');
            expect(getWellKnownPidName(0x0014)).toBe('TDT/TOT');
            expect(getWellKnownPidName(0x0011)).toBe('SDT/BAT');
            expect(getWellKnownPidName(0x1fff)).toBe('NULL');

            expect(getStreamTypeName(0x02)).toBe('MPEG2 VIDEO');
            expect(getStreamTypeName(0x0f)).toBe('MPEG2 AAC');
            expect(getStreamTypeName(0x06)).toBe('字幕');
            expect(getStreamTypeName(0x1b)).toBe('MPEG4 VIDEO');
            expect(getStreamTypeName(0x24)).toBe('HEVC VIDEO');

            expect(resolvePidName(0x0000)).toBe('PAT');
            expect(resolvePidName(0x0111, 0x02)).toBe('MPEG2 VIDEO');
            expect(resolvePidName(0x0112, 0x0f)).toBe('MPEG2 AAC');
            expect(resolvePidName(0x0999)).toBe('-');
        });
    });

    describe('TOT / TDT Decoder', () => {
        it('should decode MJD + BCD into correct JST Date', () => {
            // MJD: 61315 -> 2026-10-02
            // 2026-10-02:
            // Y=2026, M=10, D=2
            // MJD calculation check
            const mjd = 61315;
            const bcdHour = 0x14; // 14:00:00
            const bcdMin = 0x30;
            const bcdSec = 0x45;

            const timeBytes = new Uint8Array([(mjd >> 8) & 0xff, mjd & 0xff, bcdHour, bcdMin, bcdSec]);

            const date = decodeMjdBcdTime(timeBytes);
            expect(date).not.toBeNull();
            expect(date?.getFullYear()).toBe(2026);
            expect(date?.getMonth()).toBe(9); // 10月 (0-indexed)
            expect(date?.getDate()).toBe(2);
            expect(date?.getHours()).toBe(14);
            expect(date?.getMinutes()).toBe(30);
            expect(date?.getSeconds()).toBe(45);
        });

        it('should decode TOT section payload', () => {
            const mjd = 61315;
            // table_id 0x73, section_syntax 0, length 5
            const totSection = new Uint8Array([0x73, 0x70, 0x05, (mjd >> 8) & 0xff, mjd & 0xff, 0x14, 0x30, 0x45]);
            const date = decodeTotSection(totSection);
            expect(date).not.toBeNull();
            expect(date?.getFullYear()).toBe(2026);
            expect(date?.getHours()).toBe(14);
        });
    });

    describe('PMT Decoder', () => {
        it('should decode PMT section streams and PCR PID', () => {
            // Synthesize minimal PMT section
            // table_id: 0x02, section_syntax_indicator=1, section_length=23
            const pmtBytes = new Uint8Array([
                0x02,
                0xb0,
                0x17, // table_id, syntax & len (23)
                0x00,
                0x01, // program_number = 1
                0xc1, // version_number = 0, current_next=1
                0x00,
                0x00, // section_number = 0, last_section = 0
                0xe1,
                0x00, // PCR_PID = 0x0100
                0xf0,
                0x00, // program_info_length = 0
                // Stream 1: Video (stream_type 0x02, elementary_PID 0x0111)
                0x02,
                0xe1,
                0x11,
                0xf0,
                0x00,
                // Stream 2: Audio (stream_type 0x0F, elementary_PID 0x0112)
                0x0f,
                0xe1,
                0x12,
                0xf0,
                0x00,
                // CRC32 placeholder (4 bytes)
                0x00,
                0x00,
                0x00,
                0x00,
            ]);

            const pmt = decodePmtSection(pmtBytes);
            expect(pmt).not.toBeNull();
            expect(pmt?.program_number).toBe(1);
            expect(pmt?.PCR_PID).toBe(0x0100);
            expect(pmt?.streams.length).toBe(2);
            expect(pmt?.streams[0].stream_type).toBe(0x02);
            expect(pmt?.streams[0].elementary_PID).toBe(0x0111);
            expect(pmt?.streams[1].stream_type).toBe(0x0f);
            expect(pmt?.streams[1].elementary_PID).toBe(0x0112);
        });

        it('should decode PMT with audio_component_descriptor (0xC4) for dual-mono and languages', () => {
            const pmtBytes = new Uint8Array([
                0x02,
                0xb0,
                0x25, // table_id 0x02, section_length 37
                0x00,
                0x01, // program_number 1
                0xc3, // version 1
                0x00,
                0x00, // section 0, last 0
                0xe1,
                0x00, // PCR_PID 0x0100
                0xf0,
                0x00, // program_info_length 0
                // Stream 1: Video (0x02, PID 0x0100)
                0x02,
                0xe1,
                0x00,
                0xf0,
                0x00,
                // Stream 2: Audio (0x0F, PID 0x0110, ES_info_length 14)
                0x0f,
                0xe1,
                0x10,
                0xf0,
                0x0e,
                // audio_component_descriptor: tag 0xC4, len 12
                0xc4,
                0x0c,
                0x02, // stream_content 0x02 (audio)
                0x02, // component_type 0x02 (dual-mono)
                0x10, // component_tag
                0x0f, // stream_type
                0x00, // simulcast_group_tag
                0xce, // es_multi_lingual(1) | main(1) | samplingRate=7 (48kHz)
                0x6a,
                0x70,
                0x6e, // 'jpn'
                0x65,
                0x6e,
                0x67, // 'eng'
                // CRC32
                0x00,
                0x00,
                0x00,
                0x00,
            ]);

            const pmt = decodePmtSection(pmtBytes);
            expect(pmt).not.toBeNull();
            expect(pmt?.streams.length).toBe(2);

            const audioStream = pmt?.streams[1];
            expect(audioStream?.elementary_PID).toBe(0x0110);
            expect(audioStream?.audio).toBeDefined();
            expect(audioStream?.audio?.isDualMono).toBe(true);
            expect(audioStream?.audio?.isSurround).toBe(false);
            expect(audioStream?.audio?.component_type).toBe(0x02);
            expect(audioStream?.audio?.component_type_name).toBe('デュアルモノラル (主/副)');
            expect(audioStream?.audio?.sampling_rate_hz).toBe(48000);
            expect(audioStream?.audio?.languages).toEqual(['jpn', 'eng']);
            expect(audioStream?.audio?.main_component_flag).toBe(true);
        });
    });

    describe('Stream Category & Name Resolution', () => {
        it('should classify stream categories correctly', () => {
            expect(getStreamCategory(0x02)).toBe('video');
            expect(getStreamCategory(0x1b)).toBe('video');
            expect(getStreamCategory(0x24)).toBe('video');
            expect(getStreamCategory(0x0f)).toBe('audio');
            expect(getStreamCategory(0x11)).toBe('audio');
            expect(getStreamCategory(0x06)).toBe('subtitle');
            expect(getStreamCategory(undefined, 0x0000)).toBe('psi');
            expect(getStreamCategory(undefined, 0x0012)).toBe('psi');
            expect(getStreamCategory(0x0d)).toBe('other');
        });

        it('should format resolvePidName with audio information', () => {
            const name = resolvePidName(0x0110, 0x0f, {
                component_type_name: 'デュアルモノラル (主/副)',
                languages: ['jpn', 'eng'],
            });
            expect(name).toBe('MPEG2 AAC (デュアルモノラル (主/副) [jpn/eng])');
        });

        it('should format audio component type names and sampling rates', () => {
            expect(getAudioComponentTypeName(0x01)).toBe('モノラル (1/0)');
            expect(getAudioComponentTypeName(0x03)).toBe('ステレオ (2/0)');
            expect(getAudioComponentTypeName(0x09)).toBe('5.1chサラウンド (3/2+LFE)');
            expect(getAudioSamplingRateHz(7)).toBe(48000);
            expect(getAudioSamplingRateHz(5)).toBe(32000);
        });
    });

    describe('TsProbe Stream Pipeline', () => {
        function createTsPacket(
            pid: number,
            cc: number,
            options: { tei?: boolean; scramble?: number } = {},
        ): Uint8Array {
            const buf = new Uint8Array(188);
            buf[0] = 0x47;
            buf[1] = (options.tei ? 0x80 : 0x00) | ((pid >> 8) & 0x1f);
            buf[2] = pid & 0xff;
            buf[3] = ((options.scramble ?? 0) << 6) | 0x10 | (cc & 0x0f); // payload only
            buf.fill(0x55, 4);
            return buf;
        }

        it('should detect packet continuity drops and count errors', async () => {
            const probe = new TsProbe();
            const drops: { pid: number; counter: number; expected: number }[] = [];
            const errors: number[] = [];
            const scrambles: number[] = [];

            probe.on('packetDrop', (pid, counter, expected) => drops.push({ pid, counter, expected }));
            probe.on('packetError', pid => errors.push(pid));
            probe.on('packetScrambling', pid => scrambles.push(pid));

            // Stream packets:
            // PID 0x0100: CC 0, 1, 2, 4 (drop 3!), 5
            // PID 0x0200: CC 0, error packet, CC 1
            // PID 0x0300: scrambled packet
            const chunks: Uint8Array[] = [
                createTsPacket(0x0100, 0),
                createTsPacket(0x0100, 1),
                createTsPacket(0x0100, 2),
                createTsPacket(0x0100, 4), // Drop! expected 3, got 4
                createTsPacket(0x0100, 5),

                createTsPacket(0x0200, 0),
                createTsPacket(0x0200, 1, { tei: true }), // Error!
                createTsPacket(0x0200, 1),

                createTsPacket(0x0300, 0, { scramble: 2 }), // Scramble!
            ];

            for (const chunk of chunks) {
                probe.write(chunk);
            }
            probe.end();

            await new Promise<void>(resolve => probe.on('finish', resolve));

            expect(drops.length).toBe(1);
            expect(drops[0]).toEqual({ pid: 0x0100, counter: 4, expected: 3 });

            expect(errors.length).toBe(1);
            expect(errors[0]).toBe(0x0200);

            expect(scrambles.length).toBe(1);
            expect(scrambles[0]).toBe(0x0300);

            const result = probe.getResult();
            expect(result[0x0100].packet).toBe(5);
            expect(result[0x0100].drop).toBe(1);
            expect(result[0x0100].error).toBe(0);

            expect(result[0x0200].packet).toBe(3);
            expect(result[0x0200].error).toBe(1);

            expect(result[0x0300].packet).toBe(1);
            expect(result[0x0300].scrambling).toBe(1);
        });

        it('should handle unaligned chunks across write boundaries', async () => {
            const probe = new TsProbe();
            const p1 = createTsPacket(0x0100, 0);
            const p2 = createTsPacket(0x0100, 1);
            const concatenated = new Uint8Array(188 * 2);
            concatenated.set(p1, 0);
            concatenated.set(p2, 188);

            // Split into unaligned 100-byte chunks
            const chunk1 = concatenated.subarray(0, 100);
            const chunk2 = concatenated.subarray(100, 250);
            const chunk3 = concatenated.subarray(250);

            probe.write(chunk1);
            probe.write(chunk2);
            probe.write(chunk3);
            probe.end();

            await new Promise<void>(resolve => probe.on('finish', resolve));

            const result = probe.getResult();
            expect(result[0x0100].packet).toBe(2);
            expect(result[0x0100].drop).toBe(0);
        });

        it('should track PCR elapsed time and format timecode on packet drop', async () => {
            const probe = new TsProbe();
            let capturedTimecode: string | null = null;

            probe.on('packetDrop', (_pid, _counter, _expected, timecode) => {
                capturedTimecode = timecode;
            });

            function createPcrPacket(pid: number, cc: number, pcrSec: number): Uint8Array {
                const buf = new Uint8Array(188);
                buf[0] = 0x47;
                buf[1] = (pid >> 8) & 0x1f;
                buf[2] = pid & 0xff;
                buf[3] = 0x30 | (cc & 0x0f); // AF + payload
                buf[4] = 7;
                buf[5] = 0x10; // PCR flag

                const base = Math.floor(pcrSec * 90000);
                buf[6] = (base >> 25) & 0xff;
                buf[7] = (base >> 17) & 0xff;
                buf[8] = (base >> 9) & 0xff;
                buf[9] = (base >> 1) & 0xff;
                buf[10] = ((base & 1) << 7) | 0x7e;
                buf[11] = 0x00;
                buf.fill(0x55, 12);
                return buf;
            }

            // Packet 1: PCR = 100.0s (start)
            probe.write(createPcrPacket(0x0100, 0, 100.0));
            // Packet 2: PCR = 165.5s (+65.5s = 00:01:05.500), but CC gap (0 -> 2, drop 1!)
            probe.write(createPcrPacket(0x0100, 2, 165.5));
            probe.end();

            await new Promise<void>(resolve => probe.on('finish', resolve));

            expect(capturedTimecode).toBe('00:01:05.500');
            expect(probe.getElapsedSeconds()).toBeCloseTo(65.5, 2);
            expect(probe.getTimecode()).toBe('00:01:05.500');

            const result = probe.getResult();
            expect(result[0x0100].name).toBe('-'); // PMT not registered, falls back to '-'
        });
    });

    describe('TsPesParser', () => {
        it('should assemble PES across TS packets and decode PTS', () => {
            let receivedPes: any = null;
            const parser = new TsPesParser(pes => {
                receivedPes = pes;
            });

            // Synthesize PES packet:
            // 00 00 01 bd (stream_id 0xbd, length 19)
            // 84 80 (flags: PTS only)
            // 05 (header data length: 5 bytes PTS)
            // PTS: 90,000 (= 1.0s) -> 21 00 05 7e 01 (ptsHigh=0, ptsMid=2, ptsLow=3968)
            // Construct PES packet with 200 bytes total (spans 2 TS packets: 184 + 16)
            const payload = new Uint8Array(186); // 186 payload + 14 PES header = 200 bytes
            for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;

            const pesLength = 3 + 5 + payload.length; // 194 bytes (0x00c2)
            const pts = 90000;
            const ptsHigh = Math.floor(pts / 0x40000000) & 0x07;
            const ptsMid = (pts >>> 15) & 0x7fff;
            const ptsLow = pts & 0x7fff;

            const pesData = new Uint8Array(6 + pesLength);
            pesData[0] = 0x00;
            pesData[1] = 0x00;
            pesData[2] = 0x01;
            pesData[3] = 0xbd;
            pesData[4] = (pesLength >> 8) & 0xff;
            pesData[5] = pesLength & 0xff;
            pesData[6] = 0x84;
            pesData[7] = 0x80;
            pesData[8] = 0x05;
            pesData[9] = 0x21 | (ptsHigh << 1);
            pesData[10] = (ptsMid >> 7) & 0xff;
            pesData[11] = 0x01 | ((ptsMid & 0x7f) << 1);
            pesData[12] = (ptsLow >> 7) & 0xff;
            pesData[13] = 0x01 | ((ptsLow & 0x7f) << 1);
            pesData.set(payload, 14);

            // Packetize into TS packets (will produce 2 packets)
            const tsResult = packetizeToTs(pesData, { pid: 0x0115, continuityCounter: 0, isSection: false });
            expect(tsResult.packets.length).toBe(2);

            for (const pkt of tsResult.packets) {
                parser.pushPacket(new TsPacket(pkt));
            }

            expect(receivedPes).not.toBeNull();
            expect(receivedPes.streamId).toBe(0xbd);
            expect(receivedPes.pts).toBe(90000);
            expect(receivedPes.payload.length).toBe(186);
            expect(receivedPes.payload[0]).toBe(0x00);
            expect(receivedPes.payload[185]).toBe(185 & 0xff);
        });
    });

    describe('ID3 Generator & Packetizer', () => {
        it('should generate valid ID3v2 PRIV container', () => {
            const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
            const id3 = ID3.createPrivFrame('aribb24.js', data);

            // Verify header: 'ID3' (3B), version 2.4 (0x04 0x00), flags (0x00)
            expect(id3[0]).toBe(0x49);
            expect(id3[1]).toBe(0x44);
            expect(id3[2]).toBe(0x33);
            expect(id3[3]).toBe(0x04);

            // Find 'PRIV' frame header
            const privIdx = new TextDecoder().decode(id3).indexOf('PRIV');
            expect(privIdx).toBeGreaterThan(0);
        });

        it('should generate metadata descriptors and timed metadata PES', () => {
            const pointerDesc = ID3.createMetadataPointerDescriptor(1);
            expect(pointerDesc[0]).toBe(0x25); // metadata_pointer_descriptor tag
            expect(pointerDesc[1]).toBe(15); // descriptor length
            expect(pointerDesc.length).toBe(17); // 2 header + 15 payload

            const es = ID3.createMetadataElementaryStream(0x1ffe);
            expect(es[0]).toBe(0x15); // stream_type 0x15 (metadata PES)
            expect(((es[1] & 0x1f) << 8) | es[2]).toBe(0x1ffe);

            const pes = ID3.createTimedMetadataPes(90000, new Uint8Array([1, 2, 3]));
            expect(pes[0]).toBe(0x00);
            expect(pes[1]).toBe(0x00);
            expect(pes[2]).toBe(0x01);
            expect(pes[3]).toBe(0xbd); // private_stream_1
        });

        it('should packetize PES data into 188-byte TS packets with proper stuffing', () => {
            const data = new Uint8Array(300);
            data.fill(0x77);

            const result = packetizeToTs(data, {
                pid: 0x01ffe,
                continuityCounter: 0,
            });

            // 300 bytes payload:
            // Packet 1: 184 bytes payload
            // Packet 2: 116 bytes payload + 68 bytes adaptation field stuffing
            expect(result.packets.length).toBe(2);
            expect(result.packets[0].length).toBe(188);
            expect(result.packets[1].length).toBe(188);

            // Packet 0 has PUSI=1, CC=0
            const pkt0 = new TsPacket(result.packets[0]);
            expect(pkt0.payloadUnitStartIndicator).toBe(true);
            expect(pkt0.continuityCounter).toBe(0);
            expect(pkt0.pid).toBe(0x01ffe);

            // Packet 1 has PUSI=0, CC=1, hasAdaptationField=true
            const pkt1 = new TsPacket(result.packets[1]);
            expect(pkt1.payloadUnitStartIndicator).toBe(false);
            expect(pkt1.continuityCounter).toBe(1);
            expect(pkt1.hasAdaptationField).toBe(true);
            expect(result.nextContinuityCounter).toBe(2);
        });
    });

    describe('TsSubtitleId3Muxer', () => {
        it('should inject ID3 metadata stream into PMT and convert subtitle packets', async () => {
            const muxer = new TsSubtitleId3Muxer();
            const outputPackets: TsPacket[] = [];

            muxer.on('data', (chunk: Uint8Array) => {
                for (let offset = 0; offset + 188 <= chunk.length; offset += 188) {
                    outputPackets.push(new TsPacket(chunk.subarray(offset, offset + 188)));
                }
            });

            // 1. Send PAT (PMT PID = 0x0100)
            const patData = new Uint8Array([0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe1, 0x00]);
            const patCrc = calcCrc32Mpeg2(patData);
            const patWithCrc = new Uint8Array(patData.length + 4);
            patWithCrc.set(patData);
            patWithCrc[patData.length] = (patCrc >> 24) & 0xff;
            patWithCrc[patData.length + 1] = (patCrc >> 16) & 0xff;
            patWithCrc[patData.length + 2] = (patCrc >> 8) & 0xff;
            patWithCrc[patData.length + 3] = patCrc & 0xff;

            const patTs = packetizeToTs(patWithCrc, { pid: 0x0000, continuityCounter: 0, isSection: true });
            for (const pkt of patTs.packets) muxer.write(pkt);

            // 2. Send PMT with subtitle stream (elementary_PID = 0x0115, stream_type = 0x06, component_tag = 0x30)
            const pmtData = new Uint8Array([
                0x02,
                0xb0,
                0x15, // table_id 0x02, len 21 (17 body + 4 CRC)
                0x00,
                0x01, // program_number = 1
                0xc1,
                0x00,
                0x00,
                0xe1,
                0x00, // PCR_PID = 0x0100
                0xf0,
                0x00, // program_info_length = 0
                // Stream: Subtitle (stream_type 0x06, PID 0x0115, descriptor: tag 0x52 len 1 comp_tag 0x30)
                0x06,
                0xe1,
                0x15,
                0xf0,
                0x03,
                0x52,
                0x01,
                0x30,
            ]);
            const pmtCrc = calcCrc32Mpeg2(pmtData);
            const pmtWithCrc = new Uint8Array(pmtData.length + 4);
            pmtWithCrc.set(pmtData);
            pmtWithCrc[pmtData.length] = (pmtCrc >> 24) & 0xff;
            pmtWithCrc[pmtData.length + 1] = (pmtCrc >> 16) & 0xff;
            pmtWithCrc[pmtData.length + 2] = (pmtCrc >> 8) & 0xff;
            pmtWithCrc[pmtData.length + 3] = pmtCrc & 0xff;

            const pmtTs = packetizeToTs(pmtWithCrc, { pid: 0x0100, continuityCounter: 0, isSection: true });
            for (const pkt of pmtTs.packets) muxer.write(pkt);

            // 3. Send Subtitle PES packet on PID 0x0115 (Group 0: CaptionManagement - tests FIXME fix!)
            const subPes = new Uint8Array([
                0x00,
                0x00,
                0x01,
                0xbd, // stream_id 0xbd
                0x00,
                0x0f, // len 15
                0x84,
                0x80, // flags
                0x05, // header_data_len
                0x21,
                0x00,
                0x01,
                0x00,
                0x01, // PTS
                // data_group: group 0 (CaptionManagement)
                0x00,
                0x00,
                0x00,
                0x01,
                0x02,
                0x03,
            ]);
            const subTs = packetizeToTs(subPes, { pid: 0x0115, continuityCounter: 0, isSection: false });
            for (const pkt of subTs.packets) muxer.write(pkt);

            muxer.end();
            await new Promise<void>(resolve => muxer.on('finish', resolve));

            // Verify:
            // 1. Output contains rewritten PMT (pid 0x0100)
            const pmtPackets = outputPackets.filter(p => p.pid === 0x0100);
            expect(pmtPackets.length).toBeGreaterThan(0);

            // 2. Output contains ID3 Timed Metadata packets (PID 0x1FFE)
            const id3Packets = outputPackets.filter(p => p.pid === 0x1ffe);
            expect(id3Packets.length).toBeGreaterThan(0);
        });
    });

    describe('ARIB String & EIT Decoder', () => {
        it('should decode ARIB STD-B24 8-unit character strings with Kanji, ASCII, and Gaiji', () => {
            // Hex: '未解決事件 File.18「上智大生殺害放火事件」[字]'
            const hex =
                '4c24327237683b76376f201b7ec6e9ece5aeb1b821563e654352426740383b2633324a7c32503b76376f21571b243b0f7a56';
            const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));

            const decoded = decodeAribString(bytes);
            expect(decoded).toBe('未解決事件 File.18「上智大生殺害放火事件」[字]');
        });

        it('should decode BCD duration correctly into seconds', () => {
            // 0x01 0x30 0x15 -> 1h 30m 15s = 5415s
            const buf = new Uint8Array([0x01, 0x30, 0x15]);
            expect(decodeBcdDuration(buf, 0)).toBe(5415);
        });

        it('should decode EIT present/following section and emit eit event from TsProbe', async () => {
            const probe = new TsProbe();
            let receivedEit: any = null;
            probe.on('eit', eit => {
                receivedEit = eit;
            });

            // Construct minimal valid EIT section for Table ID 0x4E (present)
            // Service ID: 1024 (0x0400), Event ID: 123 (0x007B)
            // Title: 'テスト[字]'
            // Duration: 30m 00s (0x00 0x30 0x00 = 1800s)
            // MJD: 2026-09-11 22:30:00 JST -> MJD 61294 (0xEF6E) + 22:30:00 (0x22 0x30 0x00)
            const titleBytes = Uint8Array.from(Buffer.from('2546253925481b243b0f7a56', 'hex')); // 'テスト[字]'
            const descTag = 0x4d;
            const descPayloadLen = 4 + titleBytes.length + 1; // lang(3) + nameLen(1) + name + textLen(1)
            const descLoopLen = 2 + descPayloadLen;

            const eitBody = new Uint8Array([
                0x4e, // table_id 0x4E
                0xf0, // section_syntax_indicator & length high (filled later)
                0x00, // length low (filled later)
                0x04,
                0x00, // service_id = 1024
                0xc1, // version = 0, current_next = 1
                0x00, // section_number = 0 (present)
                0x01, // last_section_number = 1
                0x7f,
                0x00, // transport_stream_id = 0x7F00
                0x7f,
                0x00, // original_network_id = 0x7F00
                0x01, // segment_last_section_number
                0x4e, // last_table_id
                // Event 1 (12 bytes + descLoopLen)
                0x00,
                0x7b, // event_id = 123
                0xef,
                0x6e,
                0x22,
                0x30,
                0x00, // start_time: 2026-09-11 22:30:00 JST
                0x00,
                0x30,
                0x00, // duration: 30m 00s (1800s)
                0x80 | ((descLoopLen >> 8) & 0x0f),
                descLoopLen & 0xff,
                // short_event_descriptor (tag 0x4D)
                descTag,
                descPayloadLen,
                0x6a,
                0x70,
                0x6e, // 'jpn'
                titleBytes.length,
                ...titleBytes,
                0x00, // text_length = 0
            ]);

            // Set section length: (body.length - 3) + 4 (for CRC)
            const sectionLen = eitBody.length - 3 + 4;
            eitBody[1] = 0xf0 | ((sectionLen >> 8) & 0x0f);
            eitBody[2] = sectionLen & 0xff;

            // Calculate and append CRC32
            const crc = calcCrc32Mpeg2(eitBody);
            const eitWithCrc = new Uint8Array(eitBody.length + 4);
            eitWithCrc.set(eitBody);
            eitWithCrc[eitBody.length] = (crc >> 24) & 0xff;
            eitWithCrc[eitBody.length + 1] = (crc >> 16) & 0xff;
            eitWithCrc[eitBody.length + 2] = (crc >> 8) & 0xff;
            eitWithCrc[eitBody.length + 3] = crc & 0xff;

            // 1. Direct decoder test
            const decoded = decodeEitSection(eitWithCrc);
            expect(decoded).not.toBeNull();
            expect(decoded!.serviceId).toBe(1024);
            expect(decoded!.events.length).toBe(1);
            expect(decoded!.events[0].eventId).toBe(123);
            expect(decoded!.events[0].isCurrent).toBe(true);
            expect(decoded!.events[0].duration).toBe(1800);
            expect(decoded!.events[0].name).toBe('テスト[字]');

            // 2. TsProbe stream emission test
            const eitTs = packetizeToTs(eitWithCrc, { pid: 0x0012, continuityCounter: 0, isSection: true });
            for (const pkt of eitTs.packets) {
                probe.write(pkt);
            }

            expect(receivedEit).not.toBeNull();
            expect(receivedEit.serviceId).toBe(1024);
            expect(receivedEit.events[0].name).toBe('テスト[字]');
        });

        it('should decode event_group_descriptor (tag 0xD6) and extract relay items', () => {
            // EIT section with tag 0xD6 (event relay: group_type = 2, count = 1, serviceId = 1032, eventId = 124)
            const d6Payload = new Uint8Array([
                0xd6, // tag
                0x05, // len: 1 + 4 = 5
                0x21, // group_type 2 (relay), event_count 1
                0x04,
                0x08, // service_id = 1032
                0x00,
                0x7c, // event_id = 124
            ]);

            const descLoopLen = d6Payload.length;
            const eitBody = new Uint8Array([
                0x4e, // table_id 0x4E
                0xf0, // section_syntax_indicator & length high
                0x00, // length low
                0x04,
                0x00, // service_id = 1024
                0xc1, // version = 0, current_next = 1
                0x00, // section_number = 0 (present)
                0x01, // last_section_number = 1
                0x7f,
                0x00, // transport_stream_id = 0x7F00
                0x7f,
                0x00, // original_network_id = 0x7F00
                0x01, // segment_last_section_number
                0x4e, // last_table_id
                // Event 1 (12 bytes + descLoopLen)
                0x00,
                0x7b, // event_id = 123
                0xef,
                0x6e,
                0x22,
                0x30,
                0x00, // start_time
                0x00,
                0x30,
                0x00, // duration: 1800s
                0x80 | ((descLoopLen >> 8) & 0x0f),
                descLoopLen & 0xff,
                ...d6Payload,
            ]);

            const sectionLen = eitBody.length - 3 + 4;
            eitBody[1] = 0xf0 | ((sectionLen >> 8) & 0x0f);
            eitBody[2] = sectionLen & 0xff;

            const crc = calcCrc32Mpeg2(eitBody);
            const eitWithCrc = new Uint8Array(eitBody.length + 4);
            eitWithCrc.set(eitBody);
            eitWithCrc[eitBody.length] = (crc >> 24) & 0xff;
            eitWithCrc[eitBody.length + 1] = (crc >> 16) & 0xff;
            eitWithCrc[eitBody.length + 2] = (crc >> 8) & 0xff;
            eitWithCrc[eitBody.length + 3] = crc & 0xff;

            const decoded = decodeEitSection(eitWithCrc);
            expect(decoded).not.toBeNull();
            expect(decoded!.events[0].relatedItems).toBeDefined();
            expect(decoded!.events[0].relatedItems!.length).toBe(1);
            expect(decoded!.events[0].relatedItems![0]).toEqual({
                type: 'relay',
                serviceId: 1032,
                eventId: 124,
            });
        });

        it('should decode audio_component_descriptor (0xC4) in EIT section', () => {
            // Descriptor 0xC4 (audio_component_descriptor)
            const c4Payload = [
                0xc4,
                0x09, // tag 0xC4, length 9
                0x02, // stream_content = 2
                0x03, // component_type = 3 (stereo)
                0x10, // component_tag = 0x10
                0x0f, // stream_type = 0x0F (AAC)
                0xff, // simulcast_group_tag
                0x4e, // main_component_flag = 1, sampling_rate = 7 (48kHz) -> 0x40 | (7 << 1) = 0x4E
                0x6a,
                0x70,
                0x6e, // 'j', 'p', 'n'
            ];

            const descLoopLen = c4Payload.length;
            const eitBody = new Uint8Array([
                0x4e, // table_id = 0x4E
                0x00,
                0x00, // length placeholder
                0x04,
                0x00, // service_id = 1024
                0xc1, // version = 0, current_next = 1
                0x00, // section_number = 0 (present)
                0x01, // last_section_number = 1
                0x7f,
                0x00, // transport_stream_id = 0x7F00
                0x7f,
                0x00, // original_network_id = 0x7F00
                0x01, // segment_last_section_number
                0x4e, // last_table_id
                // Event 1 (12 bytes + descLoopLen)
                0x00,
                0x7b, // event_id = 123
                0xef,
                0x6e,
                0x22,
                0x30,
                0x00, // start_time
                0x00,
                0x30,
                0x00, // duration: 1800s
                0x80 | ((descLoopLen >> 8) & 0x0f),
                descLoopLen & 0xff,
                ...c4Payload,
            ]);

            const sectionLen = eitBody.length - 3 + 4;
            eitBody[1] = 0xf0 | ((sectionLen >> 8) & 0x0f);
            eitBody[2] = sectionLen & 0xff;

            const crc = calcCrc32Mpeg2(eitBody);
            const eitWithCrc = new Uint8Array(eitBody.length + 4);
            eitWithCrc.set(eitBody);
            eitWithCrc[eitBody.length] = (crc >> 24) & 0xff;
            eitWithCrc[eitBody.length + 1] = (crc >> 16) & 0xff;
            eitWithCrc[eitBody.length + 2] = (crc >> 8) & 0xff;
            eitWithCrc[eitBody.length + 3] = crc & 0xff;

            const decoded = decodeEitSection(eitWithCrc);
            expect(decoded).not.toBeNull();
            expect(decoded!.events[0].audio).toBeDefined();
            expect(decoded!.events[0].audio!.component_type).toBe(0x03);
            expect(decoded!.events[0].audio!.component_type_name).toBe('ステレオ (2/0)');
            expect(decoded!.events[0].audio!.sampling_rate_hz).toBe(48000);
            expect(decoded!.events[0].audio!.languages).toEqual(['jpn']);
            expect(decoded!.events[0].audio!.main_component_flag).toBe(true);
            expect(decoded!.events[0].audios).toHaveLength(1);
        });

        it('should drop packets with transport_error_indicator and clear ongoing buffer', () => {
            const sections: Uint8Array[] = [];
            const assembler = new TsSectionAssembler((_tableId, section) => {
                sections.push(section);
            });

            // Start assembling a multi-packet section
            const p1 = new Uint8Array(188);
            p1[0] = 0x47;
            p1[1] = 0x40 | 0x00; // PUSI = 1, PID 0x0012
            p1[2] = 0x12;
            p1[3] = 0x10; // CC 0
            p1[4] = 0x00; // pointer = 0
            p1[5] = 0x4e; // table_id
            p1[6] = 0xf0; // section_syntax=1, len high = 0
            p1[7] = 200; // section_length = 200 (requires 203 bytes, spans packets)
            p1.fill(0xaa, 8);

            assembler.pushPacket(new TsPacket(p1));
            expect(sections.length).toBe(0);

            // Now send a corrupted packet with TEI = 1
            const pError = new Uint8Array(188);
            pError[0] = 0x47;
            pError[1] = 0x80 | 0x00; // TEI = 1
            pError[2] = 0x12;
            pError[3] = 0x11;
            pError.fill(0xff, 4);

            assembler.pushPacket(new TsPacket(pError));
            // Incomplete buffer should have been discarded
            expect(sections.length).toBe(0);
        });

        it('should discard section when section_length exceeds 4096 bytes', () => {
            const sections: Uint8Array[] = [];
            const assembler = new TsSectionAssembler((_tableId, section) => {
                sections.push(section);
            });

            const p1 = new Uint8Array(188);
            p1[0] = 0x47;
            p1[1] = 0x40 | 0x00; // PUSI = 1
            p1[2] = 0x12;
            p1[3] = 0x10;
            p1[4] = 0x00; // pointer = 0
            p1[5] = 0x4e;
            p1[6] = 0xff; // length high = 0x0f (4095)
            p1[7] = 0xff; // length low = 0xff -> 4095 + 3 = 4098 > 4096!
            p1.fill(0x55, 8);

            assembler.pushPacket(new TsPacket(p1));
            expect(sections.length).toBe(0);
        });

        it('should cleanly handle pointerField > 0 when no prior buffer exists', () => {
            const sections: Uint8Array[] = [];
            const assembler = new TsSectionAssembler((_tableId, section) => {
                sections.push(section);
            });

            // Single packet section starting at offset after pointer
            const sectionData = new Uint8Array([
                0x00, // PAT table_id
                0xb0, // section_syntax=1, len high = 0
                0x0d, // section_length = 13 (total 16 bytes)
                0x00,
                0x01,
                0xc1,
                0x00,
                0x00,
                0x00,
                0x01,
                0xe1,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00, // placeholder for CRC
            ]);
            const crc = calcCrc32Mpeg2(sectionData.subarray(0, 12));
            sectionData[12] = (crc >> 24) & 0xff;
            sectionData[13] = (crc >> 16) & 0xff;
            sectionData[14] = (crc >> 8) & 0xff;
            sectionData[15] = crc & 0xff;

            const p1 = new Uint8Array(188);
            p1[0] = 0x47;
            p1[1] = 0x40; // PUSI = 1
            p1[2] = 0x00;
            p1[3] = 0x10;
            p1[4] = 10; // pointer_field = 10 bytes prefix of abandoned prior section
            p1.fill(0xaa, 5, 15); // abandoned 10 bytes
            p1.set(sectionData, 15); // new section starts at 15
            p1.fill(0xff, 15 + sectionData.length); // stuffing

            assembler.pushPacket(new TsPacket(p1));
            expect(sections.length).toBe(1);
            expect(sections[0].length).toBe(16);
            expect(sections[0][0]).toBe(0x00);
        });
    });
});
