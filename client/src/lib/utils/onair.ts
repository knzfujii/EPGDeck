import type * as apid from '../../../../api';

export interface CurrentAndNextPrograms {
    current?: apid.ScheduleProgramItem;
    next?: apid.ScheduleProgramItem;
}

/**
 * チャンネルの番組一覧から現在放映中の番組と次の番組を特定する。
 * 現在放送中の番組が存在しない場合でも、未来の番組があれば current を undefined として返す。
 * 現在番組も次の番組も存在しない場合（過去番組のみ、番組情報なし等）は null を返す。
 */
export function findCurrentAndNextPrograms(
    programs: apid.ScheduleProgramItem[],
    now: number,
): CurrentAndNextPrograms | null {
    if (!programs || programs.length === 0) {
        return null;
    }

    const sorted = programs.slice().sort((a, b) => a.startAt - b.startAt);

    // 現在放映中の番組を特定（startAt <= now < endAt）
    const current = sorted.find(p => p.startAt <= now && p.endAt > now);

    // 次の番組を特定（現在番組がある場合はその終了以降、ない場合は現在時刻以降で最も早い番組）
    const next = current ? sorted.find(p => p.startAt >= current.endAt) : sorted.find(p => p.startAt > now);

    // 現在番組も次の番組も存在しない（過去番組のみ等）場合は null を返す
    if (!current && !next) {
        return null;
    }

    return { current, next };
}

/**
 * 番組の進行度（0〜100%）を算出する。
 */
export function getProgress(startAt: number, endAt: number, now: number): number {
    if (now <= startAt) return 0;
    if (now >= endAt) return 100;
    const duration = endAt - startAt;
    if (duration <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(((now - startAt) / duration) * 100)));
}
