import { describe, expect, it } from 'vitest';
import { parseDropLog } from '../../client/src/lib/utils/dropLog';

describe('dropLog utility', () => {
    it('should parse drop log lines with timecode format', () => {
        const content = `
drop (pid: 0x0100 (MPEG2 VIDEO), counter: 5, expected: 4, time: 2026-09-11T22:35:12.000+09:00, timecode: 00:05:12.345)
drop (pid: 0x0110 (MPEG2 AAC), counter: 10, expected: 9, time: 2026-09-11T22:35:13.000+09:00, timecode: 00:05:13.000)
error: (pid: 0x0100 (MPEG2 VIDEO), time: 2026-09-11T22:45:00.000+09:00, timecode: 00:15:00.000)
scrambling (pid: 0x0100, time: 2026-09-11T22:50:00.000+09:00, timecode: 00:20:00.000)
`;

        const markers = parseDropLog(content);
        expect(markers.length).toBe(3);

        // First cluster (00:05:12 and 00:05:13 clustered within 2s)
        // Video has higher severity priority than audio, so dominant category is 'video'
        expect(markers[0].timecode).toBe('00:05:12');
        expect(markers[0].count).toBe(2);
        expect(markers[0].type).toBe('drop');
        expect(markers[0].category).toBe('video');
        expect(markers[0].description).toContain('2件');

        // Second marker (Video error)
        expect(markers[1].timecode).toBe('00:15:00');
        expect(markers[1].type).toBe('error');
        expect(markers[1].category).toBe('video');
        expect(markers[1].count).toBe(1);

        // Third marker (0x0100 is video PID)
        expect(markers[2].timecode).toBe('00:20:00');
        expect(markers[2].type).toBe('scramble');
        expect(markers[2].category).toBe('video');
    });

    it('should classify categories from summary table and standard PIDs', () => {
        const content = `
drop (pid: 0x0130, counter: 1, expected: 0, time: 2026-09-11T22:31:00.000+09:00, timecode: 00:01:00.000)
drop (pid: 0x0110, counter: 2, expected: 1, time: 2026-09-11T22:32:00.000+09:00, timecode: 00:02:00.000)

pid: 0x0110, error: 0, drop: 1, scrambling: 0, packet: 500, name: MPEG2 AAC (ステレオ [jpn])
pid: 0x0130, error: 0, drop: 1, scrambling: 0, packet: 100, name: 字幕
`;

        const markers = parseDropLog(content);
        expect(markers.length).toBe(2);

        // First marker: subtitle
        expect(markers[0].timecode).toBe('00:01:00');
        expect(markers[0].category).toBe('subtitle');
        expect(markers[0].pid).toContain('字幕');

        // Second marker: audio
        expect(markers[1].timecode).toBe('00:02:00');
        expect(markers[1].category).toBe('audio');
        expect(markers[1].pid).toContain('MPEG2 AAC');
    });

    it('should fallback to ISO time when timecode is absent', () => {
        const startAt = new Date('2026-09-11T22:30:00.000+09:00').getTime();
        const content = `
drop: (pid: 256, time: 2026-09-11T22:35:00.000+09:00)
`;

        const markers = parseDropLog(content, startAt);
        expect(markers.length).toBe(1);
        expect(markers[0].time).toBe(300); // 5 minutes = 300s
        expect(markers[0].timecode).toBe('00:05:00');
        expect(markers[0].pid).toBe('256');
        expect(markers[0].category).toBe('video'); // 256 = 0x0100 (video)
    });

    it('should correctly parse legacy aribts drop log format', () => {
        const startAt = new Date('2026/09/11 22:30:00').getTime();
        const content = `
time: 2026/09/11 22:35:00, drop, pid: 0x0100
time: 2026/09/11 22:36:00, error, pid: 0x0110
time: 2026/09/11 22:37:00, scrambling, pid: 0x0130
`;

        const markers = parseDropLog(content, startAt);
        expect(markers.length).toBe(3);

        expect(markers[0].type).toBe('drop');
        expect(markers[0].timecode).toBe('00:05:00');
        expect(markers[0].category).toBe('video');

        expect(markers[1].type).toBe('error');
        expect(markers[1].timecode).toBe('00:06:00');
        expect(markers[1].category).toBe('audio');

        expect(markers[2].type).toBe('scramble');
        expect(markers[2].timecode).toBe('00:07:00');
        expect(markers[2].category).toBe('subtitle');
    });

    it('should parse normalized drop log lines with explicit name field and nested parentheses', () => {
        const content = `
drop (pid: 0x0100, name: MPEG2 VIDEO, counter: 5, expected: 4, time: 2026/09/11 22:35:12, timecode: 00:05:12.345)
drop (pid: 0x0110, name: MPEG2 AAC (ステレオ [jpn]), counter: 10, expected: 9, time: 2026/09/11 22:35:12, timecode: 00:05:12.500)
error: (pid: 0x0110, name: MPEG2 AAC (主/副音声 [jpn/eng]), time: 2026/09/11 22:45:00, timecode: 00:15:00.000)
scrambling (pid: 0x0100, name: MPEG2 VIDEO, time: 2026/09/11 22:50:00, timecode: 00:20:00.000)
`;

        const markers = parseDropLog(content);
        expect(markers.length).toBe(3);

        // First cluster at 00:05:12
        expect(markers[0].timecode).toBe('00:05:12');
        expect(markers[0].count).toBe(2);
        expect(markers[0].category).toBe('video');
        expect(markers[0].pid).toContain('0x0100 (MPEG2 VIDEO)');
        expect(markers[0].pid).toContain('0x0110 (MPEG2 AAC (ステレオ [jpn]))');

        // Second marker: nested parens preserved properly
        expect(markers[1].timecode).toBe('00:15:00');
        expect(markers[1].category).toBe('audio');
        expect(markers[1].pid).toBe('0x0110 (MPEG2 AAC (主/副音声 [jpn/eng]))');

        // Third marker
        expect(markers[2].timecode).toBe('00:20:00');
        expect(markers[2].category).toBe('video');
        expect(markers[2].pid).toBe('0x0100 (MPEG2 VIDEO)');
    });

    it('should respect MAX_RAW_ITEMS limit to prevent UI freezing on massive drop logs', () => {
        const dummyLines = [];
        for (let i = 0; i < 6000; i++) {
            dummyLines.push(
                `drop (pid: 0x0100, counter: ${i % 16}, expected: ${(i + 1) % 16}, timecode: 00:01:00.000)`,
            );
        }
        const content = dummyLines.join('\n');
        const markers = parseDropLog(content);
        expect(markers.length).toBe(1);
        expect(markers[0].count).toBe(5000); // Capped at MAX_RAW_ITEMS (5000)
    });

    it('should handle empty or invalid content gracefully', () => {
        expect(parseDropLog('')).toEqual([]);
        expect(parseDropLog('just random text')).toEqual([]);
    });
});
