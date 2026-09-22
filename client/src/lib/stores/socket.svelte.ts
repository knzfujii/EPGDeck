import { io, Socket } from 'socket.io-client';
import { ForegroundRefreshManager } from '../utils/foregroundRefresh';

export type LogProcess = 'Operator' | 'Service' | 'EPGUpdater';
export type LogCategory = 'system' | 'access' | 'stream' | 'encode';
export type LogEntryLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
    id: number;
    timestamp: number;
    process: LogProcess;
    category: LogCategory;
    level: LogEntryLevel;
    message: string;
}

type SocketEventType = 'updateStatus' | 'updateEncode' | 'connect' | 'disconnect' | 'logs';
type Callback<T = any> = (data: T) => void;

export class SocketStore {
    private socket: Socket | null = null;
    public isConnected = $state(false);
    public statusVersion = $state(0);
    public encodeVersion = $state(0);

    private listeners = new Map<SocketEventType, Set<Callback>>();
    private hasConnectedOnce = false;
    private refreshManager: ForegroundRefreshManager | null = null;

    public init() {
        if (this.socket) return;

        // ブラウザ環境のみで初期化
        if (typeof window === 'undefined') return;

        const protocol = window.location.protocol;
        const host = window.location.host;
        const path = '/socket.io';

        this.socket = io(`${protocol}//${host}`, {
            path,
            transports: ['websocket', 'polling'],
            reconnectionAttempts: Infinity, // 長時間バックグラウンド後も諦めずに再接続
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.emitEvent('connect');
            if (this.listeners.has('logs') && (this.listeners.get('logs')?.size ?? 0) > 0) {
                this.subscribeLogs();
            }

            // 初回接続時は各画面の onMount で初期フェッチを行うためスキップ
            // 2回目以降の再接続時（切断からの復帰）はサーバー側の最新状態と同期
            if (this.hasConnectedOnce) {
                this.triggerRefresh();
            } else {
                this.hasConnectedOnce = true;
            }
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.emitEvent('disconnect');
        });

        this.socket.on('updateStatus', () => {
            this.statusVersion++;
            this.emitEvent('updateStatus');
        });

        this.socket.on('updateEncode', () => {
            this.encodeVersion++;
            this.emitEvent('updateEncode');
        });

        this.socket.on('logs', (entry: LogEntry) => {
            this.emitEvent('logs', entry);
        });

        // タブ復帰 (visibilitychange: visible) や BFCache 復帰 (pageshow) の監視を開始
        this.refreshManager = new ForegroundRefreshManager({
            onResume: () => {
                if (this.socket && !this.socket.connected) {
                    this.socket.connect();
                }
            },
            onRefresh: () => {
                this.statusVersion++;
                this.encodeVersion++;
                this.emitEvent('updateStatus');
                this.emitEvent('updateEncode');
            },
        });
        this.refreshManager.start();
    }

    /**
     * ステータスおよびエンコード更新イベントを発火して各画面をリフレッシュする
     */
    public triggerRefresh(force = false) {
        if (this.refreshManager) {
            this.refreshManager.trigger(force);
        } else {
            this.statusVersion++;
            this.encodeVersion++;
            this.emitEvent('updateStatus');
            this.emitEvent('updateEncode');
        }
    }

    public subscribeLogs() {
        if (this.socket) {
            this.socket.emit('subscribeLogs');
        }
    }

    public unsubscribeLogs() {
        if (this.socket) {
            this.socket.emit('unsubscribeLogs');
        }
    }

    public on<T = any>(event: SocketEventType, cb: Callback<T>): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(cb);

        // ログイベント購読開始時、接続済みならサーバーへ購読リクエスト
        if (event === 'logs') {
            this.subscribeLogs();
        }

        return () => {
            this.listeners.get(event)?.delete(cb);
            if (event === 'logs' && (!this.listeners.get('logs') || this.listeners.get('logs')!.size === 0)) {
                this.unsubscribeLogs();
            }
        };
    }

    private emitEvent<T = any>(event: SocketEventType, data?: T) {
        const cbs = this.listeners.get(event);
        if (cbs) {
            for (const cb of cbs) {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Error in socket listener for ${event}:`, e);
                }
            }
        }
    }

    public destroy() {
        if (this.refreshManager) {
            this.refreshManager.destroy();
            this.refreshManager = null;
        }

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.hasConnectedOnce = false;
            this.listeners.clear();
        }
    }
}

export const socketStore = new SocketStore();
