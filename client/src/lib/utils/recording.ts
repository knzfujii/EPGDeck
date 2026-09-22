/**
 * 録画状態関連のユーティリティ関数
 */
import api from '../apiClient.js';

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

export type RecordingActionType = 'finish' | 'stop' | 'discard';

export interface RecordingActionTarget {
    id: number;
    name: string;
    channelId?: number;
    startAt?: number;
    endAt?: number;
    isRecording?: boolean;
}

export type ActionNotificationColor = 'success' | 'info' | 'warning' | 'error';

export interface ActionNotifier {
    open: (options: { text: string; color: ActionNotificationColor }) => void;
}

/**
 * 録画中番組に対する操作（完了として保存・中断して保存・取り消して破棄）を実行する
 *
 * @param target 操作対象の番組（id, name）
 * @param action 操作種別（'finish' | 'stop' | 'discard'）
 * @param notifier 通知先（snackbar等）
 * @returns 処理が成功した場合は true、失敗した場合は false
 */
export async function executeRecordingAction(
    target: RecordingActionTarget,
    action: RecordingActionType,
    notifier?: ActionNotifier,
): Promise<boolean> {
    try {
        if (action === 'finish') {
            await api.recording[':reserveId'].finish.$post({ param: { reserveId: String(target.id) } });
            notifier?.open({ text: `「${target.name}」を完了として保存しました`, color: 'success' });
        } else if (action === 'stop') {
            await api.recording[':reserveId'].stop.$post({ param: { reserveId: String(target.id) } });
            notifier?.open({ text: `「${target.name}」を中断して保存しました（未完了扱い）`, color: 'info' });
        } else if (action === 'discard') {
            await api.recording[':reserveId'].discard.$post({ param: { reserveId: String(target.id) } });
            notifier?.open({ text: `「${target.name}」の録画を取り消し、ファイルを破棄しました`, color: 'warning' });
        }
        return true;
    } catch (e: any) {
        console.error(`Failed to execute recording action: ${action}`, e);
        const msg = e.message || '録画操作の実行に失敗しました';
        notifier?.open({ text: msg, color: 'error' });
        return false;
    }
}
