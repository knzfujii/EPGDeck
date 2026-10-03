/**
 * ARIB STD-B10 / EN 300 468 TOT (Time Offset Table) & TDT (Time Date Table) Decoder
 * Converts 16-bit MJD (Modified Julian Date) + 24-bit BCD (JST) into a JavaScript Date.
 */
export function decodeMjdBcdTime(buffer: Uint8Array, offset: number = 0): Date | null {
    if (buffer.length < offset + 5) {
        return null;
    }

    const mjd = (buffer[offset] << 8) | buffer[offset + 1];
    if (mjd === 0xffff) {
        return null; // Undefined / invalid date
    }

    // ARIB STD-B10 Annex C MJD to Year/Month/Day
    const yPrime = Math.floor((mjd - 15078.2) / 365.25);
    const mPrime = Math.floor((mjd - 14956.1 - Math.floor(yPrime * 365.25)) / 30.6001);
    const day = mjd - 14956 - Math.floor(yPrime * 365.25) - Math.floor(mPrime * 30.6001);

    const k = mPrime === 14 || mPrime === 15 ? 1 : 0;
    const year = 1900 + yPrime + k;
    const month = mPrime - 1 - k * 12; // 1-12

    // BCD to Hour, Minute, Second
    const b0 = buffer[offset + 2];
    const b1 = buffer[offset + 3];
    const b2 = buffer[offset + 4];

    const hour = ((b0 >> 4) * 10) + (b0 & 0x0f);
    const min = ((b1 >> 4) * 10) + (b1 & 0x0f);
    const sec = ((b2 >> 4) * 10) + (b2 & 0x0f);

    // Japan Standard Time (UTC+9)
    // Create Date as JST timestamp
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const isoStr = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:${pad(sec)}+09:00`;
    const date = new Date(isoStr);

    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Decodes TOT / TDT section payload
 */
export function decodeTotSection(sectionPayload: Uint8Array): Date | null {
    // sectionPayload starts with table_id (1 byte), section_syntax_indicator & length (2 bytes)
    // TDT / TOT: table_id 0x70 or 0x73
    // JST_time is located at byte offset 3 (5 bytes)
    return decodeMjdBcdTime(sectionPayload, 3);
}
