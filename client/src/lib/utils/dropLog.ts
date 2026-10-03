export interface DropMarker {
    time: number; // 経過秒数 (再生位置)
    timecode: string; // "HH:MM:SS"
    type: 'drop' | 'error' | 'scramble';
    pid: string;
    count: number;
    description: string;
}

/**
 * Parses drop log text content into structured drop markers with playback positions.
 * @param content The raw text content of the drop log
 * @param startAtMs Optional recording start timestamp (epoch ms) to fallback when timecode is absent
 */
export function parseDropLog(content: string, startAtMs?: number): DropMarker[] {
    if (!content) return [];

    const lines = content.split('\n');
    const rawItems: { time: number; timecode: string; type: 'drop' | 'error' | 'scramble'; pid: string }[] = [];

    // Regex for timecode: timecode: 00:15:23.456
    const tcRegex = /timecode:\s*(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/;
    // Regex for ISO time: time: 2026-09-11T22:30:15.000+09:00
    const timeRegex = /time:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?)/;
    // Regex for PID: pid: 0x0100 (映像) or pid: 256
    const pidRegex = /pid:\s*([^,\)]+)/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let type: 'drop' | 'error' | 'scramble' | null = null;
        if (trimmed.startsWith('drop')) type = 'drop';
        else if (trimmed.startsWith('error')) type = 'error';
        else if (trimmed.startsWith('scrambling') || trimmed.startsWith('scramble')) type = 'scramble';
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
        const pid = pidMatch ? pidMatch[1].trim() : 'Unknown';

        rawItems.push({
            time: timeSec,
            timecode: timecodeStr,
            type,
            pid,
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

        clustered.push({
            time: first.time,
            timecode: first.timecode,
            type,
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
