/**
 * MPEG-2 TS Program Map Table (PMT) Decoder
 * Reference: ISO/IEC 13818-1 section 2.4.4.8
 */
export interface PmtStreamInfo {
    stream_type: number;
    elementary_PID: number;
    ES_info_length: number;
}

export interface PmtInfo {
    program_number: number;
    version_number: number;
    PCR_PID: number;
    program_info_length: number;
    streams: PmtStreamInfo[];
}

/**
 * Decodes PMT section payload (table_id: 0x02)
 */
export function decodePmtSection(section: Uint8Array): PmtInfo | null {
    if (section.length < 16) {
        return null; // Header too short
    }

    const tableId = section[0];
    if (tableId !== 0x02) {
        return null;
    }

    const sectionLength = ((section[1] & 0x0f) << 8) | section[2];
    if (section.length < sectionLength + 3) {
        return null; // Truncated
    }

    const programNumber = (section[3] << 8) | section[4];
    const versionNumber = (section[5] & 0x3e) >> 1;
    const pcrPid = ((section[8] & 0x1f) << 8) | section[9];
    const programInfoLength = ((section[10] & 0x0f) << 8) | section[11];

    let offset = 12 + programInfoLength;
    const streams: PmtStreamInfo[] = [];

    // The section ends with 4-byte CRC32
    const sectionEnd = 3 + sectionLength - 4;

    while (offset + 5 <= sectionEnd) {
        const streamType = section[offset];
        const elementaryPid = ((section[offset + 1] & 0x1f) << 8) | section[offset + 2];
        const esInfoLength = ((section[offset + 3] & 0x0f) << 8) | section[offset + 4];

        streams.push({
            stream_type: streamType,
            elementary_PID: elementaryPid,
            ES_info_length: esInfoLength,
        });

        offset += 5 + esInfoLength;
    }

    return {
        program_number: programNumber,
        version_number: versionNumber,
        PCR_PID: pcrPid,
        program_info_length: programInfoLength,
        streams,
    };
}
