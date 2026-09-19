export const AUTH_TOKEN_KEY = 'epgdeck_auth_token';

function getStorage(): Storage | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
        }
        if (typeof localStorage !== 'undefined') {
            return localStorage;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * localStorage から認証トークンを取得する
 */
export function getAuthToken(): string | null {
    const storage = getStorage();
    if (!storage) return null;
    try {
        return storage.getItem(AUTH_TOKEN_KEY);
    } catch {
        return null;
    }
}

/**
 * localStorage に認証トークンを保存する
 */
export function setAuthToken(token: string): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
        // ignore
    }
}

/**
 * localStorage から認証トークンを削除する
 */
export function removeAuthToken(): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.removeItem(AUTH_TOKEN_KEY);
    } catch {
        // ignore
    }
}
