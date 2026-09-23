(globalThis as any).$state = (val: any) => val;

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface LogEntry {
    id: number;
    timestamp: number;
    process: string;
    category: string;
    level: string;
    message: string;
}

describe('SocketStore unit tests', () => {
    let SocketStoreClass: any;
    let store: any;
    let mockSocket: {
        emit: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
        connected: boolean;
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        mockSocket = {
            emit: vi.fn(),
            on: vi.fn(),
            disconnect: vi.fn(),
            connected: true,
        };

        const modulePath = '../../client/src/lib/stores/socket.svelte.js';
        const mod = await import(/* @vite-ignore */ modulePath);
        SocketStoreClass = mod.SocketStore;
        store = new SocketStoreClass();
        (store as any).socket = mockSocket;
    });

    it('registers event listener and invokes it when emitEvent is called', () => {
        const callback = vi.fn();
        const unsubscribe = store.on('updateStatus', callback);

        // emitEvent を呼び出す
        (store as any).emitEvent('updateStatus');
        expect(callback).toHaveBeenCalledTimes(1);

        // 再度発火
        (store as any).emitEvent('updateStatus');
        expect(callback).toHaveBeenCalledTimes(2);

        // 解除後は発火されないこと
        unsubscribe();
        (store as any).emitEvent('updateStatus');
        expect(callback).toHaveBeenCalledTimes(2);
    });

    it('passes payload correctly to logs event listener', () => {
        const logCallback = vi.fn();
        store.on('logs', logCallback);

        const dummyLog: LogEntry = {
            id: 1,
            timestamp: 1700000000000,
            process: 'Operator',
            category: 'system',
            level: 'info',
            message: 'test log payload',
        };

        (store as any).emitEvent('logs', dummyLog);
        expect(logCallback).toHaveBeenCalledTimes(1);
        expect(logCallback).toHaveBeenCalledWith(dummyLog);
    });

    it('automatically subscribes and unsubscribes logs to socket server', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();

        // 1人目のリスナー登録時、socket.emit('subscribeLogs') が呼ばれる
        const unsub1 = store.on('logs', cb1);
        expect(mockSocket.emit).toHaveBeenCalledWith('subscribeLogs');

        mockSocket.emit.mockClear();

        // 2人目のリスナー登録時、既に購読中のため再送信しない
        const unsub2 = store.on('logs', cb2);
        expect(mockSocket.emit).not.toHaveBeenCalled();

        // 1人目解除時、まだ2人目がいるため unsubscribeLogs は呼ばれない
        unsub1();
        expect(mockSocket.emit).not.toHaveBeenCalled();

        // 全員解除時、socket.emit('unsubscribeLogs') が呼ばれる
        unsub2();
        expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribeLogs');
    });

    it('increments version numbers and emits events on triggerRefresh', () => {
        const statusCallback = vi.fn();
        const encodeCallback = vi.fn();

        store.on('updateStatus', statusCallback);
        store.on('updateEncode', encodeCallback);

        const initialStatusVer = store.statusVersion;
        const initialEncodeVer = store.encodeVersion;

        store.triggerRefresh();

        expect(store.statusVersion).toBe(initialStatusVer + 1);
        expect(store.encodeVersion).toBe(initialEncodeVer + 1);
        expect(statusCallback).toHaveBeenCalledTimes(1);
        expect(encodeCallback).toHaveBeenCalledTimes(1);
    });

    it('cleans up resources on destroy', () => {
        store.destroy();

        expect(mockSocket.disconnect).toHaveBeenCalled();
        expect(store.isConnected).toBe(false);
        expect((store as any).socket).toBeNull();
    });
});
