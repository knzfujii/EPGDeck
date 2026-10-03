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
        expect(markers[0].timecode).toBe('00:05:12');
        expect(markers[0].count).toBe(2);
        expect(markers[0].type).toBe('drop');
        expect(markers[0].description).toContain('2件');

        // Second marker
        expect(markers[1].timecode).toBe('00:15:00');
        expect(markers[1].type).toBe('error');
        expect(markers[1].count).toBe(1);

        // Third marker
        expect(markers[2].timecode).toBe('00:20:00');
        expect(markers[2].type).toBe('scramble');
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
    });

    it('should handle empty or invalid content gracefully', () => {
        expect(parseDropLog('')).toEqual([]);
        expect(parseDropLog('just random text')).toEqual([]);
    });
});
