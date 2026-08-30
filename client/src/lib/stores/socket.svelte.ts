import { io, Socket } from 'socket.io-client';

type SocketEventType = 'updateStatus' | 'updateEncode' | 'connect' | 'disconnect';
type Callback = () => void;

class SocketStore {
    private socket: Socket | null = null;
    public isConnected = $state(false);
    public statusVersion = $state(0);
    public encodeVersion = $state(0);

    private listeners = new Map<SocketEventType, Set<Callback>>();

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
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.emitEvent('connect');
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
    }

    public on(event: SocketEventType, cb: Callback): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(cb);

        return () => {
            this.listeners.get(event)?.delete(cb);
        };
    }

    private emitEvent(event: SocketEventType) {
        const cbs = this.listeners.get(event);
        if (cbs) {
            for (const cb of cbs) {
                try {
                    cb();
                } catch (e) {
                    console.error(`Error in socket listener for ${event}:`, e);
                }
            }
        }
    }

    public destroy() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.listeners.clear();
        }
    }
}

export const socketStore = new SocketStore();
