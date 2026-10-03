export type DropCategory = 'video' | 'audio' | 'subtitle' | 'psi' | 'other';

export interface DropMarker {
    time: number; // 経過秒数 (再生位置)
    timecode: string; // "HH:MM:SS"
    type: 'drop' | 'error' | 'scramble';
    category: DropCategory;
    pid: string;
    count: number;
    description: string;
}

export function getDropCategoryLabel(category: DropCategory): string {
    switch (category) {
        case 'video':
            return '映像';
        case 'audio':
            return '音声';
        case 'subtitle':
            return '字幕';
        case 'psi':
            return '制御情報';
        default:
            return 'その他';
    }
}

export function inferCategory(nameOrPid: string): DropCategory {
    const upper = nameOrPid.toUpperCase();
    if (upper.includes('VIDEO') || upper.includes('映像')) {
        return 'video';
    }
    if (upper.includes('AAC') || upper.includes('AUDIO') || upper.includes('音声')) {
        return 'audio';
    }
    if (upper.includes('字幕') || upper.includes('SUBTITLE')) {
        return 'subtitle';
    }
    if (
        upper.includes('PAT') ||
        upper.includes('PMT') ||
        upper.includes('EIT') ||
        upper.includes('TOT') ||
        upper.includes('TDT') ||
        upper.includes('NIT') ||
        upper.includes('SDT') ||
        upper.includes('BAT') ||
        upper.includes('CDT')
    ) {
        return 'psi';
    }

    // Check numerical PID (hex or dec)
    const hexMatch = nameOrPid.match(/0x([0-9a-fA-F]+)/);
    const pidNum = hexMatch ? parseInt(hexMatch[1], 16) : parseInt(nameOrPid, 10);
    if (!Number.isNaN(pidNum)) {
        if (pidNum === 0x0100) return 'video';
        if (pidNum >= 0x0110 && pidNum <= 0x011f) return 'audio';
        if (pidNum >= 0x0130 && pidNum <= 0x013f) return 'subtitle';
        if (pidNum <= 0x002f) return 'psi';
    }

    return 'other';
}

function getCategoryPriority(cat: DropCategory): number {
    switch (cat) {
        case 'video':
            return 5;
        case 'audio':
            return 4;
        case 'subtitle':
            return 3;
        case 'other':
            return 2;
        case 'psi':
            return 1;
        default:
            return 0;
    }
}

/**
 * Parses drop log text content into structured drop markers with playback positions.
 * @param content The raw text content of the drop log
 * @param startAtMs Optional recording start timestamp (epoch ms) to fallback when timecode is absent
 */
export function parseDropLog(content: string, startAtMs?: number): DropMarker[] {
    if (!content) return [];

    const lines = content.split('\n');
    const summaryMap = new Map<string, string>(); // pid -> streamName from summary table at bottom

    // First pass: extract PID to stream name mappings from summary table
    const summaryRegex = /pid:\s*(0x[0-9a-fA-F]+|\d+).*?name:\s*([^\r\n]+)/;
    for (const line of lines) {
        const sMatch = line.match(summaryRegex);
        if (sMatch) {
            summaryMap.set(sMatch[1].toLowerCase(), sMatch[2].trim());
        }
    }

    const rawItems: {
        time: number;
        timecode: string;
        type: 'drop' | 'error' | 'scramble';
        category: DropCategory;
        pid: string;
    }[] = [];

    const MAX_RAW_ITEMS = 5000;

    // Regex for timecode: timecode: 00:15:23.456
    const tcRegex = /timecode:\s*(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/;
    // Regex for ISO time: time: 2026-09-11T22:30:15.000+09:00, or old format: time: 2026/09/11 22:30:15
    const timeRegex = /time:\s*(\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)/;
    // Regex for PID: matches clean hex (0x0100) or decimal (256)
    const pidRegex = /pid:\s*(0x[0-9a-fA-F]+|\d+)/i;
    // Regex for explicit name field if present on the line: name: MPEG2 VIDEO
    const nameRegex = /name:\s*(.+?)(?:,\s*(?:counter|expected|time|timecode|\d)|\)\s*$|$)/;

    for (const line of lines) {
        if (rawItems.length >= MAX_RAW_ITEMS) break;

        const trimmed = line.trim();
        if (!trimmed) continue;

        let type: 'drop' | 'error' | 'scramble' | null = null;
        if (trimmed.startsWith('drop') || trimmed.includes(', drop,')) type = 'drop';
        else if (trimmed.startsWith('error') || trimmed.includes(', error,')) type = 'error';
        else if (
            trimmed.startsWith('scrambling') ||
            trimmed.startsWith('scramble') ||
            trimmed.includes(', scrambling,')
        )
            type = 'scramble';
        if (!type) continue;

        let timeSec: number | null = null;
        let timecodeStr = '';

        // 1. Try parsing timecode (preferred)
        const tcMatch = trimmed.match(tcRegex);
        if (tcMatch) {
            const h = parseInt(tcMatch[1], 10);
            const m = parseInt(tcMatch[2], 10);
            const s = parseInt(tcMatch[3], 10);
            const ms = tcMatch[4] ? parseInt(tcMatch[4].slice(0, 3).padEnd(3, '0'), 10) : 0;
            timeSec = h * 3600 + m * 60 + s + ms / 1000;
            timecodeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } else if (startAtMs) {
            // 2. Fallback to calculating elapsed from ISO time
            const timeMatch = trimmed.match(timeRegex);
            if (timeMatch) {
                const logTimeMs = new Date(timeMatch[1]).getTime();
                if (!Number.isNaN(logTimeMs) && logTimeMs >= startAtMs) {
                    timeSec = Math.max(0, (logTimeMs - startAtMs) / 1000);
                    const h = Math.floor(timeSec / 3600);
                    const m = Math.floor((timeSec % 3600) / 60);
                    const s = Math.floor(timeSec % 60);
                    timecodeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
            }
        }

        if (timeSec === null) continue;

        const pidMatch = trimmed.match(pidRegex);
        const pidHex = pidMatch ? pidMatch[1] : 'Unknown';
        const cleanPidKey = pidHex.toLowerCase();

        // Check if stream name is on line, or lookup from summaryMap
        const nameMatch = trimmed.match(nameRegex);
        const streamName = nameMatch ? nameMatch[1].trim() : summaryMap.get(cleanPidKey);

        const pidDisplay = streamName && streamName !== '-' ? `${pidHex} (${streamName})` : pidHex;
        const category = inferCategory(streamName ? `${pidHex} ${streamName}` : pidHex);

        rawItems.push({
            time: timeSec,
            timecode: timecodeStr,
            type,
            category,
            pid: pidDisplay,
        });
    }

    if (rawItems.length === 0) return [];

    // Sort by time
    rawItems.sort((a, b) => a.time - b.time);

    // Cluster items within 2 seconds window
    const clustered: DropMarker[] = [];
    let currentCluster: (typeof rawItems)[0][] = [];

    const flushCluster = () => {
        if (currentCluster.length === 0) return;
        const first = currentCluster[0];
        const count = currentCluster.length;
        const pids = [...new Set(currentCluster.map(c => c.pid))].join(', ');
        const type = currentCluster.some(c => c.type === 'drop')
            ? 'drop'
            : currentCluster.some(c => c.type === 'error')
              ? 'error'
              : 'scramble';

        // Choose dominant category based on severity priority
        let dominantCategory: DropCategory = first.category;
        let maxPriority = getCategoryPriority(first.category);
        for (const item of currentCluster) {
            const prio = getCategoryPriority(item.category);
            if (prio > maxPriority) {
                maxPriority = prio;
                dominantCategory = item.category;
            }
        }

        clustered.push({
            time: first.time,
            timecode: first.timecode,
            type,
            category: dominantCategory,
            pid: pids,
            count,
            description: count > 1 ? `${pids} (${count}件)` : pids,
        });
        currentCluster = [];
    };

    for (const item of rawItems) {
        if (currentCluster.length === 0) {
            currentCluster.push(item);
        } else {
            const first = currentCluster[0];
            if (item.time - first.time <= 2.0) {
                currentCluster.push(item);
            } else {
                flushCluster();
                currentCluster.push(item);
            }
        }
    }
    flushCluster();

    return clustered;
}
