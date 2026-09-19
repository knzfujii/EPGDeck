import api from '../apiClient';
import type * as apid from '../../../../api';

export interface EncodeMode {
    name: string;
    suffix: string;
}

class ConfigStore {
    config = $state<apid.Config | null>(null);
    isLoading = $state(false);
    isLoaded = $state(false);

    /**
     * エンコードモード一覧（オブジェクト形式に正規化）
     */
    encodeModes = $derived.by<EncodeMode[]>(() => {
        const encList = this.config?.encode || [];
        return encList.map((e: any) => (typeof e === 'string' ? { name: e, suffix: '' } : e));
    });

    /**
     * エンコードモード名一覧
     */
    encodeModeNames = $derived<string[]>(this.encodeModes.map(m => m.name));

    /**
     * 録画保存先親ディレクトリ一覧
     */
    recordedDirs = $derived<string[]>(this.config?.recorded || []);

    /**
     * 検索キーワードをサブディレクトリにコピーするか
     */
    copyKeywordToDirectory = $derived<boolean>(this.config?.copyKeywordToDirectory ?? false);

    /**
     * サーバー設定を取得する（取得済みの場合はキャッシュを即座に返す）
     */
    public async fetch(force = false): Promise<apid.Config | null> {
        if (this.isLoaded && !force && this.config) {
            return this.config;
        }
        this.isLoading = true;
        try {
            const res = await api.config.$get();
            if (res.ok) {
                this.config = (await res.json()) as unknown as apid.Config;
                this.isLoaded = true;
                return this.config;
            }
        } catch (e) {
            console.error('Failed to fetch server config', e);
        } finally {
            this.isLoading = false;
        }
        return this.config;
    }
}

export const configStore = new ConfigStore();
