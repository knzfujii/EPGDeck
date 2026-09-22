import {
    getDefaultRecordingOptionState,
    loadRecordingOptionState,
    buildSaveOption,
    buildEncodeOption,
    type EncodeRow,
    type RecordingOptionState,
} from '../utils/recordingOptions';

/**
 * 録画オプション（保存先・エンコード設定等）のフォーム入力状態を一元管理する Svelte 5 Runes クラス
 */
export class RecordingOptionFormState {
    saveParentDir = $state('');
    saveSubDir = $state('');
    encRows = $state<EncodeRow[]>([{ mode: '', parentDir: '', subDir: '' }]);
    isDeleteOriginal = $state(false);
    allowEndLack = $state(false);

    constructor(initial?: Partial<RecordingOptionState>) {
        if (initial) {
            this.set({ ...getDefaultRecordingOptionState(), ...initial });
        } else {
            this.reset();
        }
    }

    /**
     * フォームをデフォルト状態にリセット
     */
    reset(): void {
        this.set(getDefaultRecordingOptionState());
    }

    /**
     * 既存の予約情報からオプション設定を復元・反映
     * @param reserve 予約情報
     */
    load(reserve: any): void {
        this.set(loadRecordingOptionState(reserve));
    }

    /**
     * 状態オブジェクトを直接反映
     * @param state 録画オプション状態
     */
    set(state: RecordingOptionState): void {
        this.saveParentDir = state.saveParentDir;
        this.saveSubDir = state.saveSubDir;
        this.encRows = state.encRows.map(r => ({ ...r }));
        this.isDeleteOriginal = state.isDeleteOriginal;
        this.allowEndLack = state.allowEndLack;
    }

    /**
     * API 送信用の SaveOption を構築
     */
    buildSaveOption(): ReturnType<typeof buildSaveOption> {
        return buildSaveOption({
            saveParentDir: this.saveParentDir,
            saveSubDir: this.saveSubDir,
        });
    }

    /**
     * API 送信用の EncodeOption を構築
     */
    buildEncodeOption(): ReturnType<typeof buildEncodeOption> {
        return buildEncodeOption({
            encRows: this.encRows,
            isDeleteOriginal: this.isDeleteOriginal,
        });
    }
}
