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
