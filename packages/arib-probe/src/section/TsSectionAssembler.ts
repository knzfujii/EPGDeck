import { calcCrc32Mpeg2 } from '../crc32.js';
import { TsPacket } from '../TsPacket.js';

export interface SectionCallback {
    (tableId: number, section: Uint8Array): void;
}

/**
 * Reassembles PSI/SI sections across TS packets for specific PIDs.
 */
export class TsSectionAssembler {
    private buffer: Uint8Array = new Uint8Array(0);
    private expectedLength: number = 0;

    constructor(private readonly onSection: SectionCallback) {}

    /**
     * Feeds a TS packet that matches this PID assembler
     */
    public pushPacket(packet: TsPacket): void {
        if (packet.transportErrorIndicator) {
            // Discard ongoing assembly if a packet has bit errors
            this.buffer = new Uint8Array(0);
            this.expectedLength = 0;
            return;
        }

        const payload = packet.getPayload();
        if (!payload || payload.length === 0) {
            return;
        }

        let offset = 0;

        if (packet.payloadUnitStartIndicator) {
            const pointerField = payload[0];
            offset = 1;

            // If there was an ongoing section being assembled, finish it with the prefix before pointer
            if (this.buffer.length > 0 && pointerField > 0) {
                const remaining = Math.min(pointerField, Math.max(0, payload.length - offset));
                this.appendChunk(payload.subarray(offset, offset + remaining));
                offset += remaining;

                if (this.expectedLength > 0 && this.buffer.length >= this.expectedLength) {
                    const completeSection = this.buffer.slice(0, this.expectedLength);
                    this.processCompleteSection(completeSection);
                }
            } else if (pointerField > 0) {
                // Discard pointer prefix if we were not actively assembling a section
                offset += Math.min(pointerField, Math.max(0, payload.length - offset));
            }

            // Start assembling new section(s)
            this.buffer = new Uint8Array(0);
            this.expectedLength = 0;

            while (offset < payload.length) {
                // Check for stuffing bytes (0xFF)
                if (payload[offset] === 0xff) {
                    break;
                }

                const remainingBytes = payload.length - offset;
                if (remainingBytes < 3) {
                    // Not enough to read section_length, store partial
                    this.buffer = payload.slice(offset);
                    this.expectedLength = 0;
                    break;
                }

                const sectionLength = ((payload[offset + 1] & 0x0f) << 8) | payload[offset + 2];
                const totalSectionLength = 3 + sectionLength;

                // Max section length in MPEG-2 TS / DVB / ARIB is 4096 bytes (4093 + 3)
                if (totalSectionLength > 4096) {
                    break;
                }

                if (remainingBytes >= totalSectionLength) {
                    // Complete section fits in this packet
                    const completeSection = payload.slice(offset, offset + totalSectionLength);
                    this.processCompleteSection(completeSection);
                    offset += totalSectionLength;
                } else {
                    // Section spans to subsequent packets
                    this.buffer = payload.slice(offset);
                    this.expectedLength = totalSectionLength;
                    break;
                }
            }
        } else {
            // Continuation packet
            if (this.buffer.length === 0) {
                return; // Discard unaligned continuation
            }

            // If we still need to determine the expected length
            if (this.expectedLength === 0 && this.buffer.length + payload.length >= 3) {
                const temp = new Uint8Array(3);
                temp.set(this.buffer.subarray(0, Math.min(3, this.buffer.length)));
                temp.set(payload.subarray(0, 3 - this.buffer.length), this.buffer.length);
                const sectionLength = ((temp[1] & 0x0f) << 8) | temp[2];
                const totalSectionLength = 3 + sectionLength;
                if (totalSectionLength > 4096) {
                    this.buffer = new Uint8Array(0);
                    this.expectedLength = 0;
                    return;
                }
                this.expectedLength = totalSectionLength;
            }

            const needed = this.expectedLength > 0 ? this.expectedLength - this.buffer.length : payload.length;
            const appendSize = Math.min(needed, payload.length);
            this.appendChunk(payload.subarray(0, appendSize));

            if (this.expectedLength > 0 && this.buffer.length >= this.expectedLength) {
                const completeSection = this.buffer.slice(0, this.expectedLength);
                this.processCompleteSection(completeSection);
                this.buffer = new Uint8Array(0);
                this.expectedLength = 0;
            }
        }
    }

    private appendChunk(chunk: Uint8Array): void {
        const next = new Uint8Array(this.buffer.length + chunk.length);
        next.set(this.buffer);
        next.set(chunk, this.buffer.length);
        this.buffer = next;
    }

    private processCompleteSection(section: Uint8Array): void {
        if (section.length < 3) return;

        const tableId = section[0];
        const sectionSyntaxIndicator = (section[1] & 0x80) !== 0;

        // If section_syntax_indicator is 1, section ends with CRC32
        if (sectionSyntaxIndicator && section.length >= 4) {
            const crc = calcCrc32Mpeg2(section);
            if (crc !== 0) {
                return; // Corrupt section, drop
            }
        }

        this.onSection(tableId, section);
    }
}
