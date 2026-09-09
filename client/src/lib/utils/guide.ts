// タイムスケール定数 (1時間 = 180px, 1分 = 3px)
export const HOUR_HEIGHT = 180;
export const MINUTE_HEIGHT = HOUR_HEIGHT / 60; // 3px
export const DISPLAY_HOURS = 24; // 24時間
export const GRID_HEIGHT = DISPLAY_HOURS * HOUR_HEIGHT; // 4320px
export const HEADER_HEIGHT = 48; // 局名・時刻ヘッダーの高さ (h-12 = 48px)
export const MAX_DAYS_AHEAD = 8; // 今日から最大8日先まで (計9日間)

/**
 * 番組表の基準日 (朝 4:00) を取得
 * 深夜 0:00〜3:59 は前日の 4:00 を基準日とする
 */
export function getBaseDate(now: Date = new Date()): Date {
    const d = new Date(now);
    if (d.getHours() < 4) {
        d.setDate(d.getDate() - 1);
    }
    d.setHours(4, 0, 0, 0);
    return d;
}

/**
 * 指定の時刻が表示中の番組表の 24 時間範囲内にあるかを判定
 */
export function isGuideTimeRange(now: number, guideStartAt: number, guideEndAt: number): boolean {
    return now >= guideStartAt && now < guideEndAt;
}

/**
 * ターゲット時間 (または 'now') に対応するスクロール対象の経過分数 (開始時刻からの分) を計算
 */
export function calculateTargetMinutes(
    target: string | number,
    now: number,
    guideStartAt: number,
    guideEndAt: number,
): number {
    if (target === 'now') {
        if (isGuideTimeRange(now, guideStartAt, guideEndAt)) {
            const diffMs = now - guideStartAt;
            return Math.max(0, diffMs / 60000 - 30); // 現在時刻の30分前を表示
        }
        return (19 - 4) * 60; // 表示範囲外 (他の日) は夜19時を初期表示
    }

    const h = typeof target === 'number' ? target : parseInt(target, 10);
    const baseHour = new Date(guideStartAt).getHours();
    const diffHours = h >= baseHour ? h - baseHour : h + 24 - baseHour;
    return diffHours * 60;
}

/**
 * 現在時刻線の top 位置 (px) を計算
 */
export function calculateCurrentTimeTop(
    now: number,
    guideStartAt: number,
    guideEndAt: number,
    minuteHeight: number = MINUTE_HEIGHT,
): number | null {
    if (!isGuideTimeRange(now, guideStartAt, guideEndAt)) {
        return null;
    }
    return ((now - guideStartAt) / 60000) * minuteHeight;
}
