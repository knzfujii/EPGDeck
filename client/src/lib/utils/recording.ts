/**
 * 録画状態関連のユーティリティ関数
 */

export interface ReserveLike {
    programId?: number | null;
    channelId: number;
    startAt: number;
    endAt: number;
    isConflict?: boolean;
    isOverlap?: boolean;
    isSkip?: boolean;
}

export interface RecordingLike {
    programId?: number | null;
    channelId?: number;
    startAt?: number;
    endAt?: number;
}

/**
 * 予約が現在録画中かどうかを判定する
 *
 * 1. 録画中リスト（/api/recording）に一致するプロセスが存在する場合は true
 * 2. 一致しない場合、時間帯（startAt <= now < endAt）かつ
 *    競合(isConflict)・重複(isOverlap)・スキップ(isSkip)でない場合に true
 *
 * @param reserve 判定対象の予約情報
 * @param recordingList 現在録画中の番組リスト
 * @param now 判定基準時刻 (Unixミリ秒, デフォルト: Date.now())
 */
export function isReserveCurrentlyRecording(
    reserve: ReserveLike,
    recordingList?: RecordingLike[] | null,
    now: number = Date.now(),
): boolean {
    if (recordingList && recordingList.length > 0) {
        const isMatched = recordingList.some(
            rec =>
                (rec.programId != null && reserve.programId != null && rec.programId === reserve.programId) ||
                (rec.channelId === reserve.channelId &&
                    rec.startAt != null &&
                    rec.endAt != null &&
                    Math.abs(rec.startAt - reserve.startAt) < 60000 &&
                    Math.abs(rec.endAt - reserve.endAt) < 60000),
        );
        if (isMatched) {
            return true;
        }
    }

    // 録画リストに一致しない場合のフォールバック（時間帯判定）
    // 競合（チューナー不足）、重複無効、手動スキップは録画されない
    if (reserve.isConflict || reserve.isOverlap || reserve.isSkip) {
        return false;
    }

    return reserve.startAt <= now && now < reserve.endAt;
}
