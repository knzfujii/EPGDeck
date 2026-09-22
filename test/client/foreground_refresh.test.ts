import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    ForegroundRefreshManager,
    DEFAULT_MIN_REFRESH_INTERVAL_MS,
} from '../../client/src/lib/utils/foregroundRefresh.js';

describe('ForegroundRefreshManager', () => {
    let refreshCount = 0;
    let resumeCount = 0;
    let manager: ForegroundRefreshManager;

    beforeEach(() => {
        vi.useFakeTimers();
        refreshCount = 0;
        resumeCount = 0;
        manager = new ForegroundRefreshManager({
            onRefresh: () => {
                refreshCount++;
            },
            onResume: () => {
                resumeCount++;
            },
            minIntervalMs: 2000,
        });
    });

    afterEach(() => {
        manager.destroy();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('should execute onRefresh when trigger is called', () => {
        const result = manager.trigger();
        expect(result).toBe(true);
        expect(refreshCount).toBe(1);
    });

    it('should throttle frequent trigger calls within minIntervalMs', () => {
        // 1回目のトリガー
        expect(manager.trigger()).toBe(true);
        expect(refreshCount).toBe(1);

        // 1000ms 後（2000ms 未満）はスロットルされてスキップ
        vi.advanceTimersByTime(1000);
        expect(manager.trigger()).toBe(false);
        expect(refreshCount).toBe(1);

        // さらに 1500ms 後（合計 2500ms 経過）は実行される
        vi.advanceTimersByTime(1500);
        expect(manager.trigger()).toBe(true);
        expect(refreshCount).toBe(2);

        // force=true の場合はインターバルに関係なく即時実行
        expect(manager.trigger(true)).toBe(true);
        expect(refreshCount).toBe(3);
    });

    it('should call onResume and trigger refresh on handleResume', () => {
        manager.handleResume();
        expect(resumeCount).toBe(1);
        expect(refreshCount).toBe(1);
    });

    it('should attach and remove event listeners on start and destroy', () => {
        const addEventSpy = vi.fn();
        const removeEventSpy = vi.fn();
        const winAddSpy = vi.fn();
        const winRemoveSpy = vi.fn();

        vi.stubGlobal('document', {
            addEventListener: addEventSpy,
            removeEventListener: removeEventSpy,
            visibilityState: 'visible',
        });
        vi.stubGlobal('window', {
            addEventListener: winAddSpy,
            removeEventListener: winRemoveSpy,
        });

        manager.start();

        expect(addEventSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        expect(winAddSpy).toHaveBeenCalledWith('pageshow', expect.any(Function));

        // visibilitychange ハンドラを取得して検証
        const visibilityHandler = addEventSpy.mock.calls.find((c: any[]) => c[0] === 'visibilitychange')?.[1];
        expect(visibilityHandler).toBeDefined();

        // visibilityState === 'hidden' のときはリフレッシュされない
        (document as any).visibilityState = 'hidden';
        visibilityHandler();
        expect(refreshCount).toBe(0);

        // visibilityState === 'visible' のときはリフレッシュされる
        (document as any).visibilityState = 'visible';
        visibilityHandler();
        expect(refreshCount).toBe(1);
        expect(resumeCount).toBe(1);

        // pageshow ハンドラを取得して検証
        const pageShowHandler = winAddSpy.mock.calls.find((c: any[]) => c[0] === 'pageshow')?.[1];
        expect(pageShowHandler).toBeDefined();

        // 2000ms 進めてから pageshow を発火
        vi.advanceTimersByTime(2500);
        pageShowHandler();
        expect(refreshCount).toBe(2);
        expect(resumeCount).toBe(2);

        manager.destroy();

        expect(removeEventSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        expect(winRemoveSpy).toHaveBeenCalledWith('pageshow', expect.any(Function));
    });

    it('should use DEFAULT_MIN_REFRESH_INTERVAL_MS if not specified', () => {
        const defaultManager = new ForegroundRefreshManager({
            onRefresh: () => {},
        });
        expect(DEFAULT_MIN_REFRESH_INTERVAL_MS).toBe(2000);
        defaultManager.destroy();
    });
});
