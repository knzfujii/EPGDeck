import { describe, it, expect } from 'vitest';
import { findCurrentAndNextPrograms, getProgress } from '../../client/src/lib/utils/onair.js';
import type * as apid from '../../api.js';

describe('onair utils', () => {
    describe('findCurrentAndNextPrograms', () => {
        const createProgram = (id: number, startAt: number, endAt: number, name: string): apid.ScheduleProgramItem => ({
            id,
            channelId: 101,
            startAt,
            endAt,
            isFree: true,
            name,
        });

        it('returns null when programs array is empty', () => {
            expect(findCurrentAndNextPrograms([], Date.now())).toBeNull();
        });

        it('correctly identifies current and next programs during active broadcast', () => {
            const now = 1000000;
            const p1 = createProgram(1, 900000, 1100000, 'Current Program');
            const p2 = createProgram(2, 1100000, 1300000, 'Next Program');
            const p3 = createProgram(3, 1300000, 1500000, 'Later Program');

            const result = findCurrentAndNextPrograms([p3, p1, p2], now);
            expect(result).not.toBeNull();
            expect(result?.current?.id).toBe(1);
            expect(result?.current?.name).toBe('Current Program');
            expect(result?.next?.id).toBe(2);
            expect(result?.next?.name).toBe('Next Program');
        });

        it('returns current program without next when next program is absent', () => {
            const now = 1000000;
            const p1 = createProgram(1, 900000, 1100000, 'Current Program');

            const result = findCurrentAndNextPrograms([p1], now);
            expect(result).not.toBeNull();
            expect(result?.current?.id).toBe(1);
            expect(result?.next).toBeUndefined();
        });

        it('returns undefined current and earliest future program as next when not currently broadcasting (e.g. BS Fuji 182)', () => {
            // 例: BSフジ 182ch のように 2時間半後まで番組がない場合
            const now = 1000000;
            const pFuture1 = createProgram(1, 1500000, 1700000, 'Future Program 1');
            const pFuture2 = createProgram(2, 1700000, 1900000, 'Future Program 2');

            const result = findCurrentAndNextPrograms([pFuture2, pFuture1], now);
            expect(result).not.toBeNull();
            expect(result?.current).toBeUndefined();
            expect(result?.next?.id).toBe(1);
            expect(result?.next?.name).toBe('Future Program 1');
        });

        it('returns null when channel has only past programs (broadcast ended / off-air)', () => {
            const now = 2000000;
            const pPast1 = createProgram(1, 1000000, 1200000, 'Past Program 1');
            const pPast2 = createProgram(2, 1200000, 1400000, 'Past Program 2');

            const result = findCurrentAndNextPrograms([pPast1, pPast2], now);
            expect(result).toBeNull();
        });

        it('respects exact boundary conditions (startAt <= now < endAt)', () => {
            const startAt = 1000;
            const endAt = 2000;
            const p = createProgram(1, startAt, endAt, 'Boundary Program');

            // ちょうど開始時刻 (now === startAt): 放送中
            expect(findCurrentAndNextPrograms([p], startAt)?.current?.id).toBe(1);

            // 終了1ms前: 放送中
            expect(findCurrentAndNextPrograms([p], endAt - 1)?.current?.id).toBe(1);

            // ちょうど終了時刻 (now === endAt): 終了（未来番組もないので null）
            expect(findCurrentAndNextPrograms([p], endAt)).toBeNull();

            // 開始1ms前: 未来番組扱い（current: undefined, next: p）
            const preResult = findCurrentAndNextPrograms([p], startAt - 1);
            expect(preResult?.current).toBeUndefined();
            expect(preResult?.next?.id).toBe(1);
        });
    });

    describe('getProgress', () => {
        const startAt = 10000;
        const endAt = 20000; // duration = 10000

        it('returns 0 when now is before or at startAt', () => {
            expect(getProgress(startAt, endAt, 5000)).toBe(0);
            expect(getProgress(startAt, endAt, startAt)).toBe(0);
        });

        it('returns 100 when now is at or after endAt', () => {
            expect(getProgress(startAt, endAt, endAt)).toBe(100);
            expect(getProgress(startAt, endAt, 25000)).toBe(100);
        });

        it('calculates accurate percentages during program', () => {
            expect(getProgress(startAt, endAt, 15000)).toBe(50);
            expect(getProgress(startAt, endAt, 12500)).toBe(25);
            expect(getProgress(startAt, endAt, 17500)).toBe(75);
        });

        it('handles invalid duration gracefully', () => {
            expect(getProgress(10000, 10000, 10000)).toBe(0);
            expect(getProgress(20000, 10000, 15000)).toBe(0);
        });
    });
});
