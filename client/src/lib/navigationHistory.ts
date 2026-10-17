export const LAST_RECORDED_PATH_KEY = 'epgdeck_last_recorded_path';

function getSessionStorage(): Storage | null {
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            return window.sessionStorage;
        }
        if (typeof sessionStorage !== 'undefined') {
            return sessionStorage;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * 録画一覧画面（/recorded?...）のパスをセッションストレージに保存する。
 * 詳細画面（/recorded/detail）や再生画面（/recorded/watch）など、一覧以外のパスは保存しない。
 */
export function saveLastRecordedPath(path: string): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        // パス名が /recorded で始まっており、/recorded/detail や /recorded/watch でないことを検証
        const pathname = path.split('?')[0];
        if (pathname === '/recorded') {
            storage.setItem(LAST_RECORDED_PATH_KEY, path);
        }
    } catch {
        // ignore
    }
}

/**
 * セッションストレージから直前に訪問した録画一覧画面のパスを取得する。
 * 未保存または不正な値の場合はデフォルトの '/recorded' を返す。
 */
export function getLastRecordedPath(): string {
    const storage = getSessionStorage();
    if (!storage) return '/recorded';

    try {
        const saved = storage.getItem(LAST_RECORDED_PATH_KEY);
        if (saved) {
            const pathname = saved.split('?')[0];
            if (pathname === '/recorded') {
                return saved;
            }
        }
    } catch {
        // ignore
    }

    return '/recorded';
}

export const LAST_RECORDED_TARGET_ID_KEY = 'epgdeck_last_recorded_target_id';

/**
 * 録画一覧から詳細画面等へ遷移する際に対象番組の ID を一時保存する。
 */
export function saveLastRecordedTargetId(id: number): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        storage.setItem(LAST_RECORDED_TARGET_ID_KEY, String(id));
    } catch {
        // ignore
    }
}

/**
 * 録画一覧へ復帰した際に対象番組 ID を取得し、次回以降の重複スクロールを防ぐため即座に消費（削除）する。
 */
export function consumeLastRecordedTargetId(): number | null {
    const storage = getSessionStorage();
    if (!storage) return null;

    try {
        const saved = storage.getItem(LAST_RECORDED_TARGET_ID_KEY);
        if (saved) {
            storage.removeItem(LAST_RECORDED_TARGET_ID_KEY);
            const parsed = parseInt(saved, 10);
            return Number.isNaN(parsed) ? null : parsed;
        }
    } catch {
        // ignore
    }

    return null;
}

export const LAST_RULE_PATH_KEY = 'epgdeck_last_rule_path';

/**
 * ルール一覧画面（/rule?...）のパスをセッションストレージに保存する。
 * 編集画面（/rule/edit）などのパスは保存しない。
 */
export function saveLastRulePath(path: string): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        const pathname = path.split('?')[0];
        if (pathname === '/rule') {
            storage.setItem(LAST_RULE_PATH_KEY, path);
        }
    } catch {
        // ignore
    }
}

/**
 * セッションストレージから直前に訪問したルール一覧画面のパスを取得する。
 * 未保存または不正な値の場合はデフォルトの '/rule' を返す。
 */
export function getLastRulePath(): string {
    const storage = getSessionStorage();
    if (!storage) return '/rule';

    try {
        const saved = storage.getItem(LAST_RULE_PATH_KEY);
        if (saved) {
            const pathname = saved.split('?')[0];
            if (pathname === '/rule') {
                return saved;
            }
        }
    } catch {
        // ignore
    }

    return '/rule';
}

export const LAST_RULE_TARGET_ID_KEY = 'epgdeck_last_rule_target_id';

/**
 * ルール一覧から編集画面等へ遷移する際に対象ルールIDを一時保存する。
 */
export function saveLastRuleTargetId(id: number): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        storage.setItem(LAST_RULE_TARGET_ID_KEY, String(id));
    } catch {
        // ignore
    }
}

/**
 * ルール一覧へ復帰した際に対象ルールIDを取得し、次回以降の重複スクロールを防ぐため即座に消費（削除）する。
 */
export function consumeLastRuleTargetId(): number | null {
    const storage = getSessionStorage();
    if (!storage) return null;

    try {
        const saved = storage.getItem(LAST_RULE_TARGET_ID_KEY);
        if (saved) {
            storage.removeItem(LAST_RULE_TARGET_ID_KEY);
            const parsed = parseInt(saved, 10);
            return Number.isNaN(parsed) ? null : parsed;
        }
    } catch {
        // ignore
    }

    return null;
}

export const LAST_RESERVES_PATH_KEY = 'epgdeck_last_reserves_path';

/**
 * 予約一覧画面（/reserves?...）のパスをセッションストレージに保存する。
 * 手動予約画面（/reserves/manual）などのパスは保存しない。
 */
export function saveLastReservesPath(path: string): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        const pathname = path.split('?')[0];
        if (pathname === '/reserves') {
            storage.setItem(LAST_RESERVES_PATH_KEY, path);
        }
    } catch {
        // ignore
    }
}

/**
 * セッションストレージから直前に訪問した予約一覧画面のパスを取得する。
 * 未保存または不正な値の場合はデフォルトの '/reserves' を返す。
 */
export function getLastReservesPath(): string {
    const storage = getSessionStorage();
    if (!storage) return '/reserves';

    try {
        const saved = storage.getItem(LAST_RESERVES_PATH_KEY);
        if (saved) {
            const pathname = saved.split('?')[0];
            if (pathname === '/reserves') {
                return saved;
            }
        }
    } catch {
        // ignore
    }

    return '/reserves';
}

export const LAST_RESERVE_TARGET_ID_KEY = 'epgdeck_last_reserve_target_id';
export const LAST_RESERVE_TARGET_RULE_ID_KEY = 'epgdeck_last_reserve_target_rule_id';

/**
 * 予約一覧からルール編集画面等へ遷移する際に対象予約ID（およびフォールバック用ルールID）を一時保存する。
 */
export function saveLastReserveTargetId(id: number, ruleId?: number): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        storage.setItem(LAST_RESERVE_TARGET_ID_KEY, String(id));
        if (ruleId !== undefined) {
            storage.setItem(LAST_RESERVE_TARGET_RULE_ID_KEY, String(ruleId));
        } else {
            storage.removeItem(LAST_RESERVE_TARGET_RULE_ID_KEY);
        }
    } catch {
        // ignore
    }
}

/**
 * 予約一覧へ復帰した際に対象予約ID（およびフォールバック用ルールID）を取得し、即座に消費（削除）する。
 */
export function consumeLastReserveTarget(): { reserveId: number; ruleId: number | null } | null {
    const storage = getSessionStorage();
    if (!storage) return null;

    try {
        const savedId = storage.getItem(LAST_RESERVE_TARGET_ID_KEY);
        const savedRuleId = storage.getItem(LAST_RESERVE_TARGET_RULE_ID_KEY);
        storage.removeItem(LAST_RESERVE_TARGET_ID_KEY);
        storage.removeItem(LAST_RESERVE_TARGET_RULE_ID_KEY);

        if (savedId) {
            const reserveId = parseInt(savedId, 10);
            if (!Number.isNaN(reserveId)) {
                const parsedRuleId = savedRuleId ? parseInt(savedRuleId, 10) : NaN;
                return {
                    reserveId,
                    ruleId: Number.isNaN(parsedRuleId) ? null : parsedRuleId,
                };
            }
        }
    } catch {
        // ignore
    }

    return null;
}

export const RULE_EDIT_RETURN_PATH_KEY = 'epgdeck_rule_edit_return_path';

/**
 * ルール編集画面（/rule/edit）から戻る際の遷移元パス（/reserves?... や /rule?... 等）を保存する。
 */
export function saveRuleEditReturnPath(path: string): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        const pathname = path.split('?')[0];
        if (pathname.startsWith('/') && pathname !== '/rule/edit') {
            storage.setItem(RULE_EDIT_RETURN_PATH_KEY, path);
        }
    } catch {
        // ignore
    }
}

/**
 * 保存されているルール編集画面からの戻り先パスを参照する（消費しない）。
 */
export function getRuleEditReturnPath(): string | null {
    const storage = getSessionStorage();
    if (!storage) return null;

    try {
        const saved = storage.getItem(RULE_EDIT_RETURN_PATH_KEY);
        if (saved) {
            const pathname = saved.split('?')[0];
            if (pathname.startsWith('/') && pathname !== '/rule/edit') {
                return saved;
            }
        }
    } catch {
        // ignore
    }

    return null;
}

/**
 * 保存されているルール編集画面からの戻り先パスを取得し、即座に消費（削除）する。
 */
export function consumeRuleEditReturnPath(): string | null {
    const storage = getSessionStorage();
    if (!storage) return null;

    try {
        const saved = storage.getItem(RULE_EDIT_RETURN_PATH_KEY);
        if (saved) {
            storage.removeItem(RULE_EDIT_RETURN_PATH_KEY);
            const pathname = saved.split('?')[0];
            if (pathname.startsWith('/') && pathname !== '/rule/edit') {
                return saved;
            }
        }
    } catch {
        // ignore
    }

    return null;
}

export const LAST_GUIDE_VIEW_STATE_KEY = 'epgdeck_last_guide_view_state';

export interface GuideViewState {
    dateTime: number;
    selectedType: 'all' | 'GR' | 'BS' | 'CS' | 'SKY';
    scrollTop: number;
    scrollLeft: number;
}

const VALID_GUIDE_TYPES = new Set(['all', 'GR', 'BS', 'CS', 'SKY']);

/**
 * 番組表（/guide）からルール編集画面等へ遷移する際、選択日時・放送波タブ・スクロール位置を保存する。
 */
export function saveLastGuideViewState(state: GuideViewState): void {
    const storage = getSessionStorage();
    if (!storage) return;

    try {
        storage.setItem(LAST_GUIDE_VIEW_STATE_KEY, JSON.stringify(state));
    } catch {
        // ignore
    }
}

/**
 * 番組表へ復帰した際に保存済みの表示状態・スクロール位置を取得し、即座に消費（削除）する。
 */
export function consumeLastGuideViewState(): GuideViewState | null {
    const storage = getSessionStorage();
    if (!storage) return null;

    try {
        const raw = storage.getItem(LAST_GUIDE_VIEW_STATE_KEY);
        storage.removeItem(LAST_GUIDE_VIEW_STATE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<GuideViewState>;
        if (
            typeof parsed.dateTime === 'number' &&
            Number.isFinite(parsed.dateTime) &&
            typeof parsed.selectedType === 'string' &&
            VALID_GUIDE_TYPES.has(parsed.selectedType) &&
            typeof parsed.scrollTop === 'number' &&
            Number.isFinite(parsed.scrollTop) &&
            typeof parsed.scrollLeft === 'number' &&
            Number.isFinite(parsed.scrollLeft)
        ) {
            return {
                dateTime: parsed.dateTime,
                selectedType: parsed.selectedType as GuideViewState['selectedType'],
                scrollTop: Math.max(0, parsed.scrollTop),
                scrollLeft: Math.max(0, parsed.scrollLeft),
            };
        }
    } catch {
        // ignore
    }

    return null;
}
