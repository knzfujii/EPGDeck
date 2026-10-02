import { TsPacket } from '../TsPacket.js';

export interface PacketizeOptions {
    pid: number;
    continuityCounter: number;
    transportErrorIndicator?: boolean;
    transportPriority?: boolean;
    transportScramblingControl?: number;
    isSection?: boolean; // If true, adds pointer_field (0x00) on first packet
}

export interface PacketizeResult {
    packets: Uint8Array[];
    nextContinuityCounter: number;
}

/**
 * Splits a section or PES payload into 188-byte MPEG-2 TS packets.
 */
export function packetizeToTs(data: Uint8Array, options: PacketizeOptions): PacketizeResult {
    const packets: Uint8Array[] = [];
    let cc = options.continuityCounter & 0x0f;
    const pid = options.pid;
    const tei = options.transportErrorIndicator ? 0x80 : 0x00;
    const prio = options.transportPriority ? 0x20 : 0x00;
    const scramble = (options.transportScramblingControl ?? 0) & 0x03;

    let offset = 0;
    const total = data.length;
    let isFirst = true;

    while (offset < total || isFirst) {
        const packet = new Uint8Array(TsPacket.PACKET_SIZE);
        const pusi = isFirst ? 0x40 : 0x00;
        packet[0] = TsPacket.SYNC_BYTE;
        packet[1] = tei | pusi | prio | ((pid >> 8) & 0x1f);
        packet[2] = pid & 0xff;

        // Pointer field for PSI/SI section first packet
        const pointerSize = isFirst && options.isSection ? 1 : 0;
        const maxPayload = TsPacket.PACKET_SIZE - 4 - pointerSize;
        const remaining = total - offset;

        if (remaining >= maxPayload) {
            // Payload fits perfectly without adaptation field stuffing
            packet[3] = (scramble << 6) | 0x10 | cc; // AFC = 01 (payload only)
            let writePos = 4;
            if (pointerSize > 0) {
                packet[writePos++] = 0x00; // pointer_field = 0
            }
            packet.set(data.subarray(offset, offset + maxPayload), writePos);
            offset += maxPayload;
        } else {
            // Need stuffing via Adaptation Field
            const payloadBytes = remaining;
            const availableSpace = TsPacket.PACKET_SIZE - 4 - pointerSize - payloadBytes;

            if (availableSpace === 0) {
                // Exactly fits
                packet[3] = (scramble << 6) | 0x10 | cc;
                let writePos = 4;
                if (pointerSize > 0) {
                    packet[writePos++] = 0x00;
                }
                packet.set(data.subarray(offset, offset + payloadBytes), writePos);
            } else if (availableSpace === 1) {
                // 1 byte AF stuffing: AFC = 11, AF length = 0
                packet[3] = (scramble << 6) | 0x30 | cc;
                packet[4] = 0; // AF length
                let writePos = 5;
                if (pointerSize > 0) {
                    packet[writePos++] = 0x00;
                }
                packet.set(data.subarray(offset, offset + payloadBytes), writePos);
            } else {
                // AF length >= 1: AFC = 11, AF length, flags (0x00), stuffing (0xFF)
                packet[3] = (scramble << 6) | 0x30 | cc;
                const afLen = availableSpace - 1;
                packet[4] = afLen;
                packet[5] = 0x00; // flags = 0
                packet.fill(0xff, 6, 4 + availableSpace);
                let writePos = 4 + availableSpace;
                if (pointerSize > 0) {
                    packet[writePos++] = 0x00;
                }
                packet.set(data.subarray(offset, offset + payloadBytes), writePos);
            }
            offset = total;
        }

        packets.push(packet);
        cc = (cc + 1) & 0x0f;
        isFirst = false;
    }

    return {
        packets,
        nextContinuityCounter: cc,
    };
}
