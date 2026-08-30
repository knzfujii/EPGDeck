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
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
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
