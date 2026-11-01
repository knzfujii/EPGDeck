import { api } from '../apiClient';
import { socketStore } from './socket.svelte';
import { generateFaviconSvg, updateFavicon } from '../utils/favicon';
import { ForegroundRefreshManager } from '../utils/foregroundRefresh';
import { readOnlyStore } from './readOnly.svelte';

export class FaviconStore {
    public isRecording = $state(false);
    public isEncoding = $state(false);

    private isInitialized = false;
    private refreshManager: ForegroundRefreshManager | null = null;
    private unsubscribers: Array<() => void> = [];

    public init(): void {
        if (this.isInitialized || typeof window === 'undefined') return;
        this.isInitialized = true;

        // Socket.io イベント購読
        this.unsubscribers.push(
            socketStore.on('updateStatus', () => {
                void this.checkRecording();
            }),
        );
        this.unsubscribers.push(
            socketStore.on('updateEncode', () => {
                void this.checkEncoding();
            }),
        );
        this.unsubscribers.push(
            socketStore.on('connect', () => {
                void this.checkAll();
            }),
        );

        // タブ復帰時（バックグラウンドからの復帰）のリフレッシュ
        this.refreshManager = new ForegroundRefreshManager({
            onRefresh: () => {
                void this.checkAll();
            },
            onResume: () => {
                void this.checkAll();
            },
        });

        // 初回チェック
        void this.checkAll();
    }

    public destroy(): void {
        if (!this.isInitialized) return;
        this.isInitialized = false;

        for (const unsub of this.unsubscribers) {
            unsub();
        }
        this.unsubscribers = [];

        if (this.refreshManager) {
            this.refreshManager.destroy();
            this.refreshManager = null;
        }

        this.isRecording = false;
        this.isEncoding = false;
        updateFavicon(null);
    }

    public async checkAll(): Promise<void> {
        await Promise.all([this.checkRecording(), this.checkEncoding()]);
    }

    public async checkRecording(): Promise<void> {
        if (readOnlyStore.isInitialized && !readOnlyStore.canViewDashboard) {
            if (this.isRecording) {
                this.isRecording = false;
                this.applyFavicon();
            }
            return;
        }
        try {
            const res = await api.recording.$get({
                query: {
                    isHalfWidth: true,
                    limit: 1,
                },
            });
            if (res.ok) {
                const data = await res.json();
                this.isRecording = (data.total ?? data.records?.length ?? 0) > 0;
                this.applyFavicon();
            }
        } catch {
            // 切断時や一時エラー時は直前の状態を維持
        }
    }

    public async checkEncoding(): Promise<void> {
        if (readOnlyStore.isInitialized && !readOnlyStore.canViewEncode) {
            if (this.isEncoding) {
                this.isEncoding = false;
                this.applyFavicon();
            }
            return;
        }
        try {
            const res = await api.encode.$get({
                query: {
                    isHalfWidth: true,
                },
            });
            if (res.ok) {
                const data = await res.json();
                this.isEncoding = (data.runningItems?.length ?? 0) > 0;
                this.applyFavicon();
            }
        } catch {
            // 切断時や一時エラー時は直前の状態を維持
        }
    }

    public applyFavicon(): void {
        const svg = generateFaviconSvg(this.isRecording, this.isEncoding);
        updateFavicon(svg);
    }
}

export const faviconStore = new FaviconStore();
