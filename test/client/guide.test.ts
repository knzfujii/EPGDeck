import { describe, it, expect } from 'vitest';
import {
    getBaseDate,
    isGuideTimeRange,
    calculateTargetMinutes,
    calculateCurrentTimeTop,
    HOUR_HEIGHT,
    MINUTE_HEIGHT,
    DISPLAY_HOURS,
    GRID_HEIGHT,
    HEADER_HEIGHT,
} from '../../client/src/lib/utils/guide';

describe('guide utils', () => {
    describe('constants', () => {
        it('should have consistent grid dimension constants', () => {
            expect(HOUR_HEIGHT).toBe(180);
            expect(MINUTE_HEIGHT).toBe(3);
            expect(DISPLAY_HOURS).toBe(24);
            expect(GRID_HEIGHT).toBe(4320);
            expect(HEADER_HEIGHT).toBe(48);
        });
    });

    describe('getBaseDate', () => {
        it('should return 4:00 of the same day when current hour is >= 4', () => {
            const daytime = new Date(2026, 8, 10, 14, 30, 0); // 2026-09-10 14:30
            const base = getBaseDate(daytime);

            expect(base.getFullYear()).toBe(2026);
            expect(base.getMonth()).toBe(8);
            expect(base.getDate()).toBe(10);
            expect(base.getHours()).toBe(4);
            expect(base.getMinutes()).toBe(0);
            expect(base.getSeconds()).toBe(0);
        });

        it('should return 4:00 of the previous day during midnight time slot (0:00 - 3:59)', () => {
            const midnight = new Date(2026, 8, 10, 0, 30, 0); // 2026-09-10 00:30
            const base = getBaseDate(midnight);

            expect(base.getFullYear()).toBe(2026);
            expect(base.getMonth()).toBe(8);
            expect(base.getDate()).toBe(9); // 前日
            expect(base.getHours()).toBe(4);
            expect(base.getMinutes()).toBe(0);
        });

        it('should handle boundary 03:59:59 as previous day', () => {
            const before4am = new Date(2026, 8, 10, 3, 59, 59);
            const base = getBaseDate(before4am);

            expect(base.getDate()).toBe(9);
            expect(base.getHours()).toBe(4);
        });

        it('should handle boundary 04:00:00 as current day', () => {
            const at4am = new Date(2026, 8, 10, 4, 0, 0);
            const base = getBaseDate(at4am);

            expect(base.getDate()).toBe(10);
            expect(base.getHours()).toBe(4);
        });
    });

    describe('isGuideTimeRange', () => {
        const startAt = new Date(2026, 8, 9, 4, 0, 0).getTime();
        const endAt = startAt + 24 * 60 * 60 * 1000;

        it('should return true when time is within the 24h guide range', () => {
            const midTime = new Date(2026, 8, 10, 0, 30, 0).getTime(); // 20.5 hours after start
            expect(isGuideTimeRange(midTime, startAt, endAt)).toBe(true);
        });

        it('should return true at exact start time', () => {
            expect(isGuideTimeRange(startAt, startAt, endAt)).toBe(true);
        });

        it('should return false at exact end time and outside', () => {
            expect(isGuideTimeRange(endAt, startAt, endAt)).toBe(false);
            expect(isGuideTimeRange(startAt - 1000, startAt, endAt)).toBe(false);
            expect(isGuideTimeRange(endAt + 1000, startAt, endAt)).toBe(false);
        });
    });

    describe('calculateTargetMinutes', () => {
        const guideStart = new Date(2026, 8, 9, 4, 0, 0).getTime();
        const guideEnd = guideStart + 24 * 60 * 60 * 1000;

        it('should calculate 30 minutes before current time when target is "now" within range', () => {
            // 2026-09-10 00:30 (開始から20時間30分 = 1230分)
            const now = new Date(2026, 8, 10, 0, 30, 0).getTime();
            const targetMinutes = calculateTargetMinutes('now', now, guideStart, guideEnd);

            // 1230 - 30 = 1200分
            expect(targetMinutes).toBe(1200);
        });

        it('should fallback to 19:00 (15 hours from 4:00 = 900 minutes) when target is "now" outside range', () => {
            // 現在時刻が別の日 (範囲外)
            const outsideNow = new Date(2026, 8, 12, 12, 0, 0).getTime();
            const targetMinutes = calculateTargetMinutes('now', outsideNow, guideStart, guideEnd);

            expect(targetMinutes).toBe((19 - 4) * 60); // 900分
        });

        it('should calculate preset hour jumps correctly', () => {
            const now = Date.now();
            expect(calculateTargetMinutes(9, now, guideStart, guideEnd)).toBe((9 - 4) * 60); // 300分
            expect(calculateTargetMinutes(12, now, guideStart, guideEnd)).toBe((12 - 4) * 60); // 480分
            expect(calculateTargetMinutes(19, now, guideStart, guideEnd)).toBe((19 - 4) * 60); // 900分
            expect(calculateTargetMinutes(23, now, guideStart, guideEnd)).toBe((23 - 4) * 60); // 1140分
            // 深夜1時 (翌日1時)
            expect(calculateTargetMinutes(1, now, guideStart, guideEnd)).toBe((1 + 24 - 4) * 60); // 1260分
        });
    });

    describe('calculateCurrentTimeTop', () => {
        const guideStart = new Date(2026, 8, 9, 4, 0, 0).getTime();
        const guideEnd = guideStart + 24 * 60 * 60 * 1000;

        it('should return null when time is outside range', () => {
            const outsideTime = guideEnd + 1000;
            expect(calculateCurrentTimeTop(outsideTime, guideStart, guideEnd)).toBeNull();
        });

        it('should calculate pixel top accurately (1 min = 3px)', () => {
            // 開始から2時間後 (120分)
            const twoHoursAfter = guideStart + 2 * 60 * 60 * 1000;
            expect(calculateCurrentTimeTop(twoHoursAfter, guideStart, guideEnd)).toBe(120 * 3); // 360px

            // 開始から20時間27分後 (1227分)
            const midnightTime = guideStart + (20 * 60 + 27) * 60 * 1000;
            expect(calculateCurrentTimeTop(midnightTime, guideStart, guideEnd)).toBe(1227 * 3); // 3681px
        });
    });
});
