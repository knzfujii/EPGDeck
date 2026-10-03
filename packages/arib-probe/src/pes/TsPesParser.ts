import { TsPacket } from '../TsPacket.js';

export interface PesPacket {
    streamId: number;
    pts: number | null;
    dts: number | null;
    headerDataLength: number;
    payload: Uint8Array;
    raw: Uint8Array;
}

export type PesCallback = (pes: PesPacket) => void;

/**
 * Reassembles PES (Packetized Elementary Stream) packets across TS packets for a specific PID.
 * Reference: ISO/IEC 13818-1
 */
export class TsPesParser {
    private readonly onPes: PesCallback;
    private chunks: Uint8Array[] = [];
    private totalLength = 0;
    private expectedLength = -1;

    constructor(onPes: PesCallback) {
        this.onPes = onPes;
    }

    public pushPacket(packet: TsPacket): void {
        const payload = packet.getPayload();
        if (!payload || payload.length === 0) {
            return;
        }

        if (packet.payloadUnitStartIndicator) {
            // Flush any previously accumulated PES if complete or on new unit start
            this.flushIfReady();

            this.chunks = [payload];
            this.totalLength = payload.length;

            if (payload.length >= 6) {
                // PES prefix 0x000001
                if (payload[0] === 0x00 && payload[1] === 0x00 && payload[2] === 0x01) {
                    const length = (payload[4] << 8) | payload[5];
                    this.expectedLength = length > 0 ? 6 + length : -1;
                } else {
                    this.expectedLength = -1;
                }
            } else {
                this.expectedLength = -1;
            }
        } else if (this.chunks.length > 0) {
            this.chunks.push(payload);
            this.totalLength += payload.length;
        }

        // If expected length is known and reached, parse immediately
        if (this.expectedLength > 0 && this.totalLength >= this.expectedLength) {
            this.flushIfReady();
        }
    }

    public flush(): void {
        this.flushIfReady();
    }

    private flushIfReady(): void {
        if (this.chunks.length === 0 || this.totalLength < 6) {
            this.chunks = [];
            this.totalLength = 0;
            this.expectedLength = -1;
            return;
        }

        const merged = new Uint8Array(this.totalLength);
        let offset = 0;
        for (const chunk of this.chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }

        this.chunks = [];
        this.totalLength = 0;
        this.expectedLength = -1;

        // Verify PES prefix 0x000001
        if (merged[0] !== 0x00 || merged[1] !== 0x00 || merged[2] !== 0x01) {
            return;
        }

        const streamId = merged[3];
        const pesPacketLength = (merged[4] << 8) | merged[5];
        const targetLen = pesPacketLength > 0 ? 6 + pesPacketLength : merged.length;
        const validSlice = merged.subarray(0, Math.min(merged.length, targetLen));

        // Parse optional PES header (PTS / DTS)
        let pts: number | null = null;
        let dts: number | null = null;
        let headerDataLength = 0;
        let payloadOffset = 6;

        // Streams with PES header extensions (not program_stream_map, padding, private_stream_2, etc.)
        if (
            streamId !== 0xbc &&
            streamId !== 0xbe &&
            streamId !== 0xbf &&
            streamId !== 0xf0 &&
            streamId !== 0xf1 &&
            streamId !== 0xff &&
            streamId !== 0xf2 &&
            streamId !== 0xf8
        ) {
            if (validSlice.length >= 9) {
                const ptsDtsFlags = (validSlice[7] & 0xc0) >> 6;
                headerDataLength = validSlice[8];
                payloadOffset = 9 + headerDataLength;

                if ((ptsDtsFlags & 0x02) !== 0 && validSlice.length >= 14) {
                    // PTS (33 bits)
                    const b0 = validSlice[9];
                    const b1 = validSlice[10];
                    const b2 = validSlice[11];
                    const b3 = validSlice[12];
                    const b4 = validSlice[13];

                    const ptsHigh = (b0 & 0x0e) >> 1;
                    const ptsMid = (b1 << 7) | ((b2 & 0xfe) >> 1);
                    const ptsLow = (b3 << 7) | ((b4 & 0xfe) >> 1);
                    pts = ptsHigh * 0x40000000 + ptsMid * 0x8000 + ptsLow;
                }

                if ((ptsDtsFlags & 0x01) !== 0 && validSlice.length >= 19) {
                    // DTS (33 bits)
                    const b0 = validSlice[14];
                    const b1 = validSlice[15];
                    const b2 = validSlice[16];
                    const b3 = validSlice[17];
                    const b4 = validSlice[18];

                    const dtsHigh = (b0 & 0x0e) >> 1;
                    const dtsMid = (b1 << 7) | ((b2 & 0xfe) >> 1);
                    const dtsLow = (b3 << 7) | ((b4 & 0xfe) >> 1);
                    dts = dtsHigh * 0x40000000 + dtsMid * 0x8000 + dtsLow;
                }
            }
        }

        const payload = payloadOffset <= validSlice.length ? validSlice.subarray(payloadOffset) : new Uint8Array(0);

        this.onPes({
            streamId,
            pts,
            dts,
            headerDataLength,
            payload,
            raw: validSlice,
        });
    }
}
