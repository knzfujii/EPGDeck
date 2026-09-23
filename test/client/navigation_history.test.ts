import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    LAST_RECORDED_PATH_KEY,
    saveLastRecordedPath,
    getLastRecordedPath,
    saveLastRecordedTargetId,
    consumeLastRecordedTargetId,
} from '../../client/src/lib/navigationHistory.js';

describe('navigationHistory', () => {
    const mockStorage: Record<string, string> = {};

    beforeEach(() => {
        for (const key of Object.keys(mockStorage)) {
            delete mockStorage[key];
        }

        vi.stubGlobal('sessionStorage', {
            getItem: vi.fn((key: string) => mockStorage[key] ?? null),
            setItem: vi.fn((key: string, value: string) => {
                mockStorage[key] = value;
            }),
            removeItem: vi.fn((key: string) => {
                delete mockStorage[key];
            }),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should return default /recorded when no path is saved', () => {
        expect(getLastRecordedPath()).toBe('/recorded');
    });

    it('should save and get last recorded path with query params', () => {
        const path = '/recorded?keyword=%E3%82%A2%E3%83%8B%E3%83%A1&page=2&genre=7';
        saveLastRecordedPath(path);

        expect(sessionStorage.setItem).toHaveBeenCalledWith(LAST_RECORDED_PATH_KEY, path);
        expect(getLastRecordedPath()).toBe(path);
    });

    it('should not save paths that are not /recorded list paths', () => {
        saveLastRecordedPath('/recorded/detail?recordedId=100');
        expect(getLastRecordedPath()).toBe('/recorded');

        saveLastRecordedPath('/recorded/watch?recordedId=100');
        expect(getLastRecordedPath()).toBe('/recorded');

        saveLastRecordedPath('/guide');
        expect(getLastRecordedPath()).toBe('/recorded');
    });

    it('should fallback to /recorded if stored value is invalid', () => {
        mockStorage[LAST_RECORDED_PATH_KEY] = '/other/page';
        expect(getLastRecordedPath()).toBe('/recorded');
    });

    it('should safely handle sessionStorage exceptions', () => {
        vi.stubGlobal('sessionStorage', {
            getItem: vi.fn(() => {
                throw new Error('Access denied');
            }),
            setItem: vi.fn(() => {
                throw new Error('Quota exceeded');
            }),
            removeItem: vi.fn(() => {
                throw new Error('Access denied');
            }),
        });

        expect(getLastRecordedPath()).toBe('/recorded');
        expect(() => saveLastRecordedPath('/recorded?page=3')).not.toThrow();
    });

    it('should save and consume last recorded target ID (one-time)', () => {
        saveLastRecordedTargetId(9950);
        expect(sessionStorage.setItem).toHaveBeenCalledWith('epgdeck_last_recorded_target_id', '9950');

        // 初回消費でIDが取得できる
        const consumed = consumeLastRecordedTargetId();
        expect(consumed).toBe(9950);
        expect(sessionStorage.removeItem).toHaveBeenCalledWith('epgdeck_last_recorded_target_id');

        // 2回目は削除済みのため null
        expect(consumeLastRecordedTargetId()).toBeNull();
    });

    it('should return null when target ID is not saved or invalid', () => {
        expect(consumeLastRecordedTargetId()).toBeNull();

        mockStorage['epgdeck_last_recorded_target_id'] = 'invalid-number';
        expect(consumeLastRecordedTargetId()).toBeNull();
    });
});
