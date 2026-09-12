/**
 * クライアント共通フォーマッタ
 */

/**
 * UNIX タイムスタンプ（ミリ秒）から "YYYY/MM/DD(曜日)" を生成
 */
export function formatDate(timeMs: number | undefined | null): string {
    if (!timeMs) return '';
    const d = new Date(timeMs);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
    const week = weekNames[d.getDay()];
    return `${year}/${month}/${day}(${week})`;
}

/**
 * UNIX タイムスタンプ（ミリ秒）から "HH:MM" を生成
 */
export function formatTime(timeMs: number | undefined | null): string {
    if (!timeMs) return '';
    const d = new Date(timeMs);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 開始時刻と終了時刻から "YYYY/MM/DD(曜日) HH:MM〜HH:MM" を生成
 */
export function formatTimeRange(startAt: number | undefined | null, endAt: number | undefined | null): string {
    if (!startAt) return '';
    const dateStr = formatDate(startAt);
    const startStr = formatTime(startAt);
    const endStr = endAt ? formatTime(endAt) : '';
    return endStr ? `${dateStr} ${startStr}〜${endStr}` : `${dateStr} ${startStr}〜`;
}

/**
 * ミリ秒単位または秒単位の期間（duration）を "X時間Y分" または "MM:SS" にフォーマット
 */
export function formatDuration(durationMsOrSec: number | undefined | null, isSeconds = false): string {
    if (!durationMsOrSec || durationMsOrSec <= 0) return '0分';
    const totalSec = isSeconds ? Math.floor(durationMsOrSec) : Math.floor(durationMsOrSec / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (hours > 0) {
        return minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
    }
    if (minutes > 0) {
        return `${minutes}分`;
    }
    return `${seconds}秒`;
}

/**
 * 秒数を "HH:MM:SS" または "MM:SS" にフォーマット（動画プレイヤー用）
 */
export function formatPlayerTime(seconds: number | undefined | null): string {
    if (seconds === undefined || seconds === null || isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
        return '00:00';
    }
    const totalSec = Math.floor(seconds);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    const mStr = String(m).padStart(2, '0');
    const sStr = String(s).padStart(2, '0');
    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${mStr}:${sStr}`;
    }
    return `${mStr}:${sStr}`;
}

/**
 * バイト数を "B", "KB", "MB", "GB", "TB" にフォーマット
 */
export function formatSize(bytes: number | undefined | null): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let val = bytes;
    let unitIndex = 0;
    while (val >= 1024 && unitIndex < units.length - 1) {
        val /= 1024;
        unitIndex++;
    }
    return `${val.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

/**
 * ビットレート（bps）を "kbps" または "Mbps" にフォーマット
 */
export function formatBitrate(bps: number | undefined | null): string {
    if (!bps || bps <= 0) return '0 bps';
    if (bps >= 1_000_000) {
        return `${(bps / 1_000_000).toFixed(2)} Mbps`;
    }
    if (bps >= 1_000) {
        return `${(bps / 1_000).toFixed(0)} kbps`;
    }
    return `${bps} bps`;
}

/**
 * 番組タイトルから記号（[字], 【新】, 「」等）を除去し、検索に適した先頭の単語を抽出する（EPGStation互換）
 */
export function extractFirstSearchWord(title: string | undefined | null): string {
    if (!title) return '';
    // [xxx], 【xxx】, (xxx), （xxx） などのメタ情報記号や囲みを除去
    const cleaned = title
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/【[^】]*】/g, ' ')
        .replace(/［[^］]*］/g, ' ')
        .replace(/〈[^〉]*〉/g, ' ')
        .replace(/《[^》]*》/g, ' ')
        .replace(/[「」『』]/g, ' ')
        .trim();

    if (!cleaned) return title.trim();

    // 空白（半角・全角）で分割し、最初の空でないトークンを取得
    const words = cleaned.split(/[\s　]+/);
    return words[0] || title.trim();
}

/**
 * 主要ジャンル番号から日本語名称を取得
 */
export function getGenreName(genre1?: number): string {
    switch (genre1) {
        case 0:
            return 'ニュース';
        case 1:
            return 'スポーツ';
        case 2:
            return '情報';
        case 3:
            return 'ドラマ';
        case 4:
            return '音楽';
        case 5:
            return 'バラエティ';
        case 6:
            return '映画';
        case 7:
            return 'アニメ';
        case 8:
            return 'ドキュメンタリー';
        case 9:
            return '劇場';
        case 10:
            return '趣味・教育';
        case 11:
            return '福祉';
        default:
            return 'その他';
    }
}

/**
 * ジャンル番号に応じたバッジ表示用 Tailwind CSS クラス（ARIB標準カラー準拠）
 */
export function getGenreBadgeClass(genre1?: number): string {
    switch (genre1) {
        case 0:
            return 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60';
        case 1:
            return 'bg-orange-50 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300 border border-orange-200 dark:border-orange-800/60';
        case 2:
            return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60';
        case 3:
            return 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60';
        case 4:
            return 'bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60';
        case 5:
            return 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60';
        case 6:
            return 'bg-green-50 text-green-700 dark:bg-green-950/70 dark:text-green-300 border border-green-200 dark:border-green-800/60';
        case 7:
            return 'bg-pink-50 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300 border border-pink-200 dark:border-pink-800/60';
        case 8:
            return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60';
        case 9:
            return 'bg-violet-50 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300 border border-violet-200 dark:border-violet-800/60';
        case 10:
            return 'bg-lime-50 text-lime-800 dark:bg-lime-950/70 dark:text-lime-300 border border-lime-200 dark:border-lime-800/60';
        case 11:
            return 'bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60';
        default:
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
    }
}

/**
 * 終了時刻までの残り時間を "残り X分" や "残り X時間Y分" にフォーマット
 */
export function formatTimeRemaining(endAt: number | undefined | null, now: number = Date.now()): string {
    if (!endAt) return '';
    const diffMs = endAt - now;
    if (diffMs <= 0) return 'まもなく終了';
    const totalMin = Math.ceil(diffMs / 60000);
    if (totalMin >= 60) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return m > 0 ? `残り ${h}時間${m}分` : `残り ${h}時間`;
    }
    return `残り ${totalMin}分`;
}

/**
 * 放送波種別（GR / BS / CS / SKY）に応じたバッジ表示用 Tailwind CSS クラス
 */
export function getChannelTypeBadgeClass(channelType?: string): string {
    switch (channelType) {
        case 'GR':
            return 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60';
        case 'BS':
            return 'bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60';
        case 'CS':
        case 'SKY':
            return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60';
        default:
            return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
    }
}
