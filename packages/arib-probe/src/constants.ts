/**
 * Well-known MPEG-2 TS & ARIB PID and Stream Type Definitions
 * Reference: ISO/IEC 13818-1 / ARIB STD-B10 / ARIB STD-B24
 */

export const WELL_KNOWN_PIDS: Readonly<Record<number, string>> = {
    0x0000: 'PAT',
    0x0001: 'CAT',
    0x0010: 'NIT',
    0x0011: 'SDT/BAT',
    0x0012: 'EIT',
    0x0013: 'RST',
    0x0014: 'TDT/TOT',
    0x0017: 'DCT',
    0x001e: 'DIT',
    0x001f: 'SIT',
    0x0020: 'LIT',
    0x0021: 'ERT',
    0x0022: 'PCAT',
    0x0023: 'SDTT',
    0x0024: 'BIT',
    0x0025: 'NBIT/LDT',
    0x0026: 'EIT',
    0x0027: 'EIT',
    0x0028: 'SDTT',
    0x0029: 'CDT',
    0x1fff: 'NULL',
};

export const STREAM_TYPES: Readonly<Record<number, string>> = {
    0x00: 'ECM',
    0x01: 'MPEG1 VIDEO',
    0x02: 'MPEG2 VIDEO',
    0x03: 'MPEG1 AUDIO',
    0x04: 'MPEG2 AUDIO',
    0x06: '字幕', // ARIB STD-B24 PES 字幕 / プライベートデータ
    0x0d: 'データカルーセル', // Type D DSM-CC
    0x0f: 'MPEG2 AAC',
    0x11: 'MPEG4 LATM AAC',
    0x1b: 'MPEG4 VIDEO', // H.264 / AVC
    0x24: 'HEVC VIDEO', // H.265 / HEVC
};

/**
 * Returns standard name for well-known PIDs (e.g. PAT, PMT, EIT, TOT).
 */
export function getWellKnownPidName(pid: number): string | null {
    return WELL_KNOWN_PIDS[pid] ?? null;
}

/**
 * Returns standard stream component name (e.g. MPEG2 VIDEO, MPEG2 AAC, 字幕).
 */
export function getStreamTypeName(streamType: number): string | null {
    return STREAM_TYPES[streamType] ?? null;
}

export type StreamCategory = 'video' | 'audio' | 'subtitle' | 'psi' | 'other';

/**
 * Returns stream category for high-level classification.
 */
export function getStreamCategory(streamType?: number, pid?: number): StreamCategory {
    if (typeof pid === 'number') {
        if (pid === 0x0000 || pid === 0x0001 || (pid >= 0x0010 && pid <= 0x0029)) {
            return 'psi';
        }
    }
    if (typeof streamType === 'number') {
        if (streamType === 0x01 || streamType === 0x02 || streamType === 0x1b || streamType === 0x24) {
            return 'video';
        }
        if (streamType === 0x03 || streamType === 0x04 || streamType === 0x0f || streamType === 0x11) {
            return 'audio';
        }
        if (streamType === 0x06) {
            return 'subtitle';
        }
    }
    return 'other';
}

/**
 * Resolves standard name for a given PID.
 */
export function resolvePidName(
    pid: number,
    streamType?: number,
    audioInfo?: { component_type_name?: string; languages?: string[] },
): string {
    const wellKnown = getWellKnownPidName(pid);
    if (wellKnown !== null) {
        return wellKnown;
    }
    if (typeof streamType === 'number') {
        const streamName = getStreamTypeName(streamType);
        if (streamName !== null) {
            if (audioInfo?.component_type_name) {
                const langStr = audioInfo.languages && audioInfo.languages.length > 0 ? ` [${audioInfo.languages.join('/')}]` : '';
                return `${streamName} (${audioInfo.component_type_name}${langStr})`;
            }
            return streamName;
        }
        return `stream_type 0x${('0000' + pid.toString(16)).slice(-4)}`;
    }
    return '-';
}
