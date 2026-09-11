import { describe, it, expect } from 'vitest';
import { extractFirstSearchWord, formatDuration, formatSize } from '../../client/src/lib/utils/format';

describe('format utils', () => {
    describe('extractFirstSearchWord', () => {
        it('should extract the first word removing symbols like [字] or 【新】', () => {
            expect(extractFirstSearchWord('[字][デ]ニュース７ 最新情報')).toBe('ニュース７');
            expect(extractFirstSearchWord('【新】大河ドラマ 光る君へ（１）')).toBe('大河ドラマ');
            expect(extractFirstSearchWord('[解][字]相棒 season22 拡大スペシャル')).toBe('相棒');
            expect(extractFirstSearchWord('名探偵コナン「漆黒の特急」')).toBe('名探偵コナン');
            expect(extractFirstSearchWord('［字］連続テレビ小説　虎に翼')).toBe('連続テレビ小説');
        });

        it('should handle brackets, brackets inside string, and full-width spaces', () => {
            expect(extractFirstSearchWord('〈アニメ〉鬼滅の刃 柱稽古編')).toBe('鬼滅の刃');
            expect(extractFirstSearchWord('《映画》トップガン マーヴェリック')).toBe('トップガン');
            expect(extractFirstSearchWord('『プロ野球中継』 巨人×阪神')).toBe('プロ野球中継');
        });

        it('should fallback to title if empty or only brackets', () => {
            expect(extractFirstSearchWord('')).toBe('');
            expect(extractFirstSearchWord(null)).toBe('');
            expect(extractFirstSearchWord(undefined)).toBe('');
            expect(extractFirstSearchWord('[字]')).toBe('[字]');
        });

        it('should return single word title as is', () => {
            expect(extractFirstSearchWord('ニュース')).toBe('ニュース');
        });
    });

    describe('formatDuration', () => {
        it('should format duration in ms or seconds correctly', () => {
            expect(formatDuration(3600 * 1000)).toBe('1時間');
            expect(formatDuration(3660 * 1000)).toBe('1時間1分');
            expect(formatDuration(45 * 1000)).toBe('45秒');
            expect(formatDuration(60, true)).toBe('1分');
            expect(formatDuration(0)).toBe('0分');
        });
    });

    describe('formatSize', () => {
        it('should format byte sizes correctly', () => {
            expect(formatSize(0)).toBe('0 B');
            expect(formatSize(1024)).toBe('1.00 KB');
            expect(formatSize(1024 * 1024 * 1.5)).toBe('1.50 MB');
            expect(formatSize(1024 * 1024 * 1024 * 2.5)).toBe('2.50 GB');
        });
    });
});
