import http from '../httpClient';
import type * as apid from '../../../../api';

const TOKEN_KEY = 'epgdeck_auth_token';

class ReadOnlyStore {
    enabled = $state(false);
    unlocked = $state(false);
    isInitialized = $state(false);
    allowedOperations = $state<apid.ReadOnlyOperation[]>([]);
    token = $state<string | null>(null);
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
        if (typeof window !== 'undefined') {
            this.token = localStorage.getItem(TOKEN_KEY);
        }
    }

    async init() {
        if (typeof window === 'undefined') return;

        try {
            // サーバーのコンフィグ取得
            const res = await http.get<apid.Config>('/api/config');
            if (res.data.readOnly && res.data.readOnly.enabled) {
                this.enabled = true;
                this.allowedOperations = res.data.readOnly.allowedOperations || [];

                // 保存済みトークンの有効性確認
                if (this.token) {
                    try {
                        const statusRes = await http.get<{
                            isUnlocked: boolean;
                            isReadOnlyEnabled: boolean;
                        }>('/api/auth/status');
                        if (statusRes.data.isUnlocked) {
                            this.unlocked = true;
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
        const res = await http.post<{ token: string }>('/api/auth/unlock', {
            password,
        });
        if (res.data && res.data.token) {
            this.token = res.data.token;
            this.unlocked = true;
            this.isModalOpen = false;
            try {
                localStorage.setItem(TOKEN_KEY, res.data.token);
            } catch (e) {
                // ignore
            }
        }
    }

    async lock(): Promise<void> {
        try {
            await http.post('/api/auth/lock');
        } catch {
            // ignore
        }
        this.clearToken();
    }

    private clearToken() {
        this.token = null;
        this.unlocked = false;
        if (typeof window !== 'undefined') {
            try {
                localStorage.removeItem(TOKEN_KEY);
            } catch (e) {
                // ignore
            }
        }
    }
}

export const readOnlyStore = new ReadOnlyStore();
