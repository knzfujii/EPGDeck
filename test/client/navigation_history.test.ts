import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    LAST_RECORDED_PATH_KEY,
    saveLastRecordedPath,
    getLastRecordedPath,
    saveLastRecordedTargetId,
    consumeLastRecordedTargetId,
    LAST_RULE_PATH_KEY,
    saveLastRulePath,
    getLastRulePath,
    saveLastRuleTargetId,
    consumeLastRuleTargetId,
    LAST_RESERVES_PATH_KEY,
    saveLastReservesPath,
    getLastReservesPath,
    saveLastReserveTargetId,
    consumeLastReserveTarget,
    RULE_EDIT_RETURN_PATH_KEY,
    saveRuleEditReturnPath,
    getRuleEditReturnPath,
    consumeRuleEditReturnPath,
    LAST_GUIDE_VIEW_STATE_KEY,
    saveLastGuideViewState,
    consumeLastGuideViewState,
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

    it('should save and get last rule path', () => {
        expect(getLastRulePath()).toBe('/rule');

        saveLastRulePath('/rule?keyword=%E3%82%A2%E3%83%8B%E3%83%A1');
        expect(sessionStorage.setItem).toHaveBeenCalledWith(
            LAST_RULE_PATH_KEY,
            '/rule?keyword=%E3%82%A2%E3%83%8B%E3%83%A1',
        );
        expect(getLastRulePath()).toBe('/rule?keyword=%E3%82%A2%E3%83%8B%E3%83%A1');

        // /rule/edit などのパスは保存しない
        saveLastRulePath('/rule/edit?ruleId=10');
        expect(getLastRulePath()).toBe('/rule?keyword=%E3%82%A2%E3%83%8B%E3%83%A1');
    });

    it('should save and consume last rule target ID (one-time)', () => {
        saveLastRuleTargetId(42);
        expect(sessionStorage.setItem).toHaveBeenCalledWith('epgdeck_last_rule_target_id', '42');

        const consumed = consumeLastRuleTargetId();
        expect(consumed).toBe(42);
        expect(sessionStorage.removeItem).toHaveBeenCalledWith('epgdeck_last_rule_target_id');

        expect(consumeLastRuleTargetId()).toBeNull();
    });

    it('should save and get last reserves path', () => {
        expect(getLastReservesPath()).toBe('/reserves');

        saveLastReservesPath('/reserves?tab=skips');
        expect(sessionStorage.setItem).toHaveBeenCalledWith(LAST_RESERVES_PATH_KEY, '/reserves?tab=skips');
        expect(getLastReservesPath()).toBe('/reserves?tab=skips');

        saveLastReservesPath('/reserves/manual');
        expect(getLastReservesPath()).toBe('/reserves?tab=skips');
    });

    it('should save and consume last reserve target ID with optional ruleId (one-time)', () => {
        saveLastReserveTargetId(501, 12);
        expect(sessionStorage.setItem).toHaveBeenCalledWith('epgdeck_last_reserve_target_id', '501');
        expect(sessionStorage.setItem).toHaveBeenCalledWith('epgdeck_last_reserve_target_rule_id', '12');

        const consumed = consumeLastReserveTarget();
        expect(consumed).toEqual({ reserveId: 501, ruleId: 12 });
        expect(consumeLastReserveTarget()).toBeNull();

        saveLastReserveTargetId(502);
        expect(consumeLastReserveTarget()).toEqual({ reserveId: 502, ruleId: null });
    });

    it('should save, get, and consume rule edit return path', () => {
        expect(getRuleEditReturnPath()).toBeNull();

        saveRuleEditReturnPath('/reserves?tab=conflicts');
        expect(sessionStorage.setItem).toHaveBeenCalledWith(RULE_EDIT_RETURN_PATH_KEY, '/reserves?tab=conflicts');
        expect(getRuleEditReturnPath()).toBe('/reserves?tab=conflicts');

        // /rule/edit は保存しない
        saveRuleEditReturnPath('/rule/edit?ruleId=5');
        expect(getRuleEditReturnPath()).toBe('/reserves?tab=conflicts');

        expect(consumeRuleEditReturnPath()).toBe('/reserves?tab=conflicts');
        expect(getRuleEditReturnPath()).toBeNull();
        expect(consumeRuleEditReturnPath()).toBeNull();
    });

    it('should save and consume last guide view state (one-time)', () => {
        expect(consumeLastGuideViewState()).toBeNull();

        const state = {
            dateTime: 1760700000000,
            selectedType: 'BS' as const,
            scrollTop: 720,
            scrollLeft: 320,
        };
        saveLastGuideViewState(state);
        expect(sessionStorage.setItem).toHaveBeenCalledWith(LAST_GUIDE_VIEW_STATE_KEY, JSON.stringify(state));

        expect(consumeLastGuideViewState()).toEqual(state);
        expect(consumeLastGuideViewState()).toBeNull();
    });
});
