import api from '../apiClient';
import type * as apid from '../../../../api';
import { getAuthToken, setAuthToken, removeAuthToken } from '../authStorage';
import { configStore } from './config.svelte';

class ReadOnlyStore {
    enabled = $state(false);
    unlocked = $state(false);
    isInitialized = $state(false);
    allowedOperations = $state<apid.ReadOnlyOperation[]>([]);
    token = $state<string | null>(null);
    serverConfig = $state<apid.Config | null>(null);
    isModalOpen = $state(false);

    get isReadOnly(): boolean {
        return this.enabled && !this.unlocked;
    }

    get canLiveStream(): boolean {
        return !this.isReadOnly || this.allowedOperations.includes('liveStream');
    }

    get canRecordedStream(): boolean {
        return !this.isReadOnly || this.allowedOperations.includes('recordedStream');
    }

    get canDownload(): boolean {
        return !this.isReadOnly || this.allowedOperations.includes('download');
    }

    get canViewDashboard(): boolean {
        return !this.isReadOnly || this.allowedOperations.includes('dashboard');
    }

    get canViewReserves(): boolean {
        return true;
    }

    get canViewSearch(): boolean {
        return !this.isReadOnly || this.allowedOperations.includes('search');
    }

    get canViewRules(): boolean {
        return !this.isReadOnly || this.allowedOperations.includes('rules');
    }

    get canViewEncode(): boolean {
        return !this.isReadOnly || this.allowedOperations.includes('encode');
    }

    /**
     * エンコード済み（MP4等直接再生可能）ファイルが存在するか判定
     */
    hasEncodedFile(videoFiles?: Array<{ type: string; name?: string }>): boolean {
        if (!videoFiles || videoFiles.length === 0) return false;
        return videoFiles.some(f => f.type === 'encoded' || (f.name && f.name.toLowerCase().includes('mp4')));
    }

    /**
     * 録画番組を再生可能か判定（MP4直接再生は常時許可、TSトランスコードは recordedStream 許可時のみ）
     */
    canPlayRecorded(videoFiles?: Array<{ type: string; name?: string }>): boolean {
        if (!this.isReadOnly) return true;
        if (this.canRecordedStream) return true;
        // トランスコードが禁止されていても、MP4 直接再生可能ファイルがあれば再生可能
        return this.hasEncodedFile(videoFiles);
    }

    constructor() {
        this.token = getAuthToken();
    }

    async init() {
        if (typeof window === 'undefined') return;

        try {
            // サーバーのコンフィグ取得（キャッシュ有効）
            const configData = await configStore.fetch();
            if (configData) {
                this.serverConfig = configData;
                if (configData.readOnly && configData.readOnly.enabled) {
                    this.enabled = true;
                    this.allowedOperations = configData.readOnly.allowedOperations || [];

                    // 保存済みトークンの有効性確認
                    if (this.token) {
                        try {
                            const statusRes = await api.auth.status.$get();
                            if (statusRes.ok) {
                                const statusData = await statusRes.json();
                                if (statusData.isUnlocked) {
                                    this.unlocked = true;
                                } else {
                                    this.clearToken();
                                }
                            } else {
                                this.clearToken();
                            }
                        } catch {
                            this.clearToken();
                        }
                    }
                } else {
                    this.enabled = false;
                    this.unlocked = true;
                    this.allowedOperations = ['liveStream', 'recordedStream', 'download'];
                }
            }
        } catch (e) {
            console.error('Failed to init readOnlyStore', e);
        } finally {
            this.isInitialized = true;
        }
    }

    openUnlockModal() {
        this.isModalOpen = true;
    }

    closeUnlockModal() {
        this.isModalOpen = false;
    }

    async unlock(password: string): Promise<void> {
        const res = await api.auth.unlock.$post({
            json: { password },
        });
        if (res.ok) {
            const data = await res.json();
            if ('token' in data && data.token) {
                this.token = data.token;
                this.unlocked = true;
                this.isModalOpen = false;
                setAuthToken(data.token);
            }
        }
    }

    async lock(): Promise<void> {
        try {
            await api.auth.lock.$post();
        } catch {
            // ignore
        }
        this.clearToken();
    }

    private clearToken() {
        this.token = null;
        this.unlocked = false;
        removeAuthToken();
    }
}

export const readOnlyStore = new ReadOnlyStore();
