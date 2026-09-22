/**
 * 連続したフォアグラウンド復帰・リフレッシュ要求を抑制するデフォルトの最小間隔 (ミリ秒)
 */
export const DEFAULT_MIN_REFRESH_INTERVAL_MS = 2000;

export interface ForegroundRefreshOptions {
    /** 復帰・リフレッシュ実行時のコールバック */
    onRefresh: () => void;
    /** 最小リフレッシュ間隔（ミリ秒）。デフォルト 2000ms */
    minIntervalMs?: number;
    /** 復帰時にリフレッシュに先立って実行する前処理（例: Socket再接続など） */
    onResume?: () => void;
}

/**
 * モバイルブラウザのタブ復帰 (visibilitychange: visible) や BFCache 復帰 (pageshow) を検知し、
 * レートリミット（スロットリング）をかけつつ画面データのリフレッシュを調整するマネージャー
 */
export class ForegroundRefreshManager {
    private onRefresh: () => void;
    private onResume?: () => void;
    private minIntervalMs: number;
    private lastRefreshTime = 0;
    private isAttached = false;

    constructor(options: ForegroundRefreshOptions) {
        this.onRefresh = options.onRefresh;
        this.onResume = options.onResume;
        this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_REFRESH_INTERVAL_MS;
    }

    private handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            this.handleResume();
        }
    };

    private handlePageShow = () => {
        this.handleResume();
    };

    /**
     * ブラウザイベントリスナーを登録して監視を開始する
     */
    public start() {
        if (this.isAttached || typeof window === 'undefined') return;

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }
        window.addEventListener('pageshow', this.handlePageShow);
        this.isAttached = true;
    }

    /**
     * フォアグラウンド復帰時の処理を実行する
     */
    public handleResume() {
        if (this.onResume) {
            this.onResume();
        }
        this.trigger();
    }

    /**
     * リフレッシュコールバックを実行する。
     * 直近の実行から minIntervalMs 未満の場合はスキップされる（force=true の場合を除く）。
     * @returns 実行された場合は true、スロットルされた場合は false
     */
    public trigger(force = false): boolean {
        const now = Date.now();
        if (!force && now - this.lastRefreshTime < this.minIntervalMs) {
            return false;
        }
        this.lastRefreshTime = now;
        this.onRefresh();
        return true;
    }

    /**
     * 監視を停止し、イベントリスナーを破棄する
     */
    public destroy() {
        if (this.isAttached && typeof window !== 'undefined') {
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', this.handleVisibilityChange);
            }
            window.removeEventListener('pageshow', this.handlePageShow);
            this.isAttached = false;
        }
    }
}
