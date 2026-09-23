import { describe, it, expect } from 'vitest';
import DateUtil from '../../src/util/DateUtil.js';

describe('DateUtil Unit Tests', () => {
    describe('format', () => {
        it('formats Date into formatted string using format tokens', () => {
            // 2026-09-23 14:05:09 Wednesday (JST: day 3 = 水)
            const date = new Date(2026, 8, 23, 14, 5, 9);

            expect(DateUtil.format(date, 'yyyy/MM/dd hh:mm:ss')).toBe('2026/09/23 14:05:09');
            expect(DateUtil.format(date, 'YY-MM-dd')).toBe('26-09-23');
            expect(DateUtil.format(date, 'yyyy年MM月dd日(w) hh時mm分ss秒')).toBe('2026年09月23日(水) 14時05分09秒');
        });

        it('correctly maps all days of the week', () => {
            const days = ['日', '月', '火', '水', '木', '金', '土'];
            // 2026-09-20 is Sunday
            for (let i = 0; i < 7; i++) {
                const date = new Date(2026, 8, 20 + i, 12, 0, 0);
                expect(DateUtil.format(date, 'w')).toBe(days[i]);
            }
        });
    });

    describe('getJaDate', () => {
        it('shifts time to UTC+9 (Japan standard time)', () => {
            const date = new Date('2026-09-23T00:00:00.000Z'); // UTC midnight
            const jaDate = DateUtil.getJaDate(date);

            // UTC midnight is 9 AM in JST
            // getJaDate adds timezone offset difference to produce a Date whose local time reflects JST
            expect(jaDate.getTime()).toBe(date.getTime() + date.getTimezoneOffset() * 60 * 1000 + 9 * 3600 * 1000);
        });
    });
});
