/**
 * 188-byte MPEG-2 Transport Stream (TS) Packet Parser
 * Reference: ISO/IEC 13818-1 / ARIB STD-B10
 */
export class TsPacket {
    public static readonly PACKET_SIZE = 188;
    public static readonly SYNC_BYTE = 0x47;

    public readonly buffer: Uint8Array;

    constructor(buffer: Uint8Array) {
        this.buffer = buffer;
    }

    /** 0x47 */
    public get syncByte(): number {
        return this.buffer[0];
    }

    /** transport_error_indicator: 1 bit */
    public get transportErrorIndicator(): boolean {
        return (this.buffer[1] & 0x80) !== 0;
    }

    /** payload_unit_start_indicator: 1 bit */
    public get payloadUnitStartIndicator(): boolean {
        return (this.buffer[1] & 0x40) !== 0;
    }

    /** transport_priority: 1 bit */
    public get transportPriority(): boolean {
        return (this.buffer[1] & 0x20) !== 0;
    }

    /** Packet Identifier (PID): 13 bits (0x0000 - 0x1FFF) */
    public get pid(): number {
        return ((this.buffer[1] & 0x1f) << 8) | this.buffer[2];
    }

    /** transport_scrambling_control: 2 bits (00: not scrambled, 01: reserved, 10: even, 11: odd) */
    public get transportScramblingControl(): number {
        return (this.buffer[3] & 0xc0) >> 6;
    }

    /** adaptation_field_control: 2 bits (01: payload only, 10: AF only, 11: AF + payload) */
    public get adaptationFieldControl(): number {
        return (this.buffer[3] & 0x30) >> 4;
    }

    /** continuity_counter: 4 bits (0-15) */
    public get continuityCounter(): number {
        return this.buffer[3] & 0x0f;
    }

    /** Whether adaptation field exists */
    public get hasAdaptationField(): boolean {
        return (this.adaptationFieldControl & 0x02) !== 0;
    }

    /** Whether payload exists */
    public get hasPayload(): boolean {
        return (this.adaptationFieldControl & 0x01) !== 0;
    }

    /** Length of adaptation field in bytes */
    public get adaptationFieldLength(): number {
        return this.hasAdaptationField ? this.buffer[4] : 0;
    }

    /** discontinuity_indicator in adaptation field (first flag bit) */
    public get discontinuityIndicator(): boolean {
        if (!this.hasAdaptationField || this.adaptationFieldLength < 1) {
            return false;
        }
        return (this.buffer[5] & 0x80) !== 0;
    }

    /** Whether PCR (Program Clock Reference) is present in adaptation field */
    public get hasPcr(): boolean {
        if (!this.hasAdaptationField || this.adaptationFieldLength < 7) {
            return false;
        }
        return (this.buffer[5] & 0x10) !== 0;
    }

    /**
     * Program Clock Reference (PCR) 33-bit base (90kHz ticks).
     * Returns null if PCR is not present.
     */
    public get pcrBase(): number | null {
        if (!this.hasPcr) {
            return null;
        }
        const b0 = this.buffer[6];
        const b1 = this.buffer[7];
        const b2 = this.buffer[8];
        const b3 = this.buffer[9];
        const b4 = this.buffer[10];

        // 33-bit base = 32-bit (b0..b3) * 2 + top bit of b4
        const high32 = (b0 * 0x1000000) + ((b1 << 16) | (b2 << 8) | b3);
        return high32 * 2 + ((b4 & 0x80) ? 1 : 0);
    }

    /**
     * Program Clock Reference (PCR) 9-bit extension (27MHz mod 300 ticks).
     * Returns null if PCR is not present.
     */
    public get pcrExtension(): number | null {
        if (!this.hasPcr) {
            return null;
        }
        return ((this.buffer[10] & 0x01) << 8) | this.buffer[11];
    }

    /**
     * Program Clock Reference in 27MHz clock ticks (BigInt).
     * Returns null if PCR is not present.
     */
    public get pcr27MHz(): bigint | null {
        if (!this.hasPcr) {
            return null;
        }
        const base = BigInt(this.pcrBase!);
        const ext = BigInt(this.pcrExtension!);
        return base * 300n + ext;
    }

    /**
     * Program Clock Reference in fractional seconds (27MHz clock rate).
     * Returns null if PCR is not present.
     */
    public get pcrSeconds(): number | null {
        if (!this.hasPcr) {
            return null;
        }
        return Number(this.pcr27MHz!) / 27_000_000;
    }

    /** Returns payload byte slice, or null if no payload */
    public getPayload(): Uint8Array | null {
        if (!this.hasPayload) {
            return null;
        }
        const offset = this.hasAdaptationField ? 5 + this.adaptationFieldLength : 4;
        if (offset >= TsPacket.PACKET_SIZE) {
            return null;
        }
        return this.buffer.subarray(offset, TsPacket.PACKET_SIZE);
    }
}
