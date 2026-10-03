/**
 * MPEG-2 CRC-32 (Polynomial: 0x04C11DB7, Initial: 0xFFFFFFFF)
 * Used in MPEG-2 TS PSI/SI section data validation.
 */
const CRC_TABLE = new Uint32Array(256);

// Pre-compute CRC table
for (let i = 0; i < 256; i++) {
    let crc = i << 24;
    for (let j = 0; j < 8; j++) {
        if ((crc & 0x80000000) !== 0) {
            crc = ((crc << 1) ^ 0x04c11db7) >>> 0;
        } else {
            crc = (crc << 1) >>> 0;
        }
    }
    CRC_TABLE[i] = crc >>> 0;
}

/**
 * Calculates MPEG-2 CRC-32 of a given buffer slice.
 */
export function calcCrc32Mpeg2(buffer: Uint8Array, start: number = 0, end: number = buffer.length): number {
    let crc = 0xffffffff;
    for (let i = start; i < end; i++) {
        crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ buffer[i]) & 0xff]) >>> 0;
    }
    return crc >>> 0;
}
