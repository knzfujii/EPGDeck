import type * as apid from '../../../../api';

export type ClientOS = 'ios' | 'android' | 'mac' | 'win' | 'other';

/**
 * ユーザーの OS / デバイス環境を判定する
 */
export function detectClientOS(
    ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
    maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
): ClientOS {
    // iPadOS 13+ はデスクトップ Mac UA を送信するため maxTouchPoints > 1 で判別
    if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh|MacIntel/.test(ua) && maxTouchPoints > 1)) {
        return 'ios';
    }
    if (/Android/.test(ua)) {
        return 'android';
    }
    if (/Macintosh|MacIntel|MacPPC|Mac68K/.test(ua)) {
        return 'mac';
    }
    if (/Win32|Win64|Windows|WinCE/.test(ua)) {
        return 'win';
    }
    return 'other';
}

/**
 * モバイル・タブレット端末（iOS / iPadOS / Android）であるかを判定する
 */
export function isMobileOrTabletDevice(ua?: string, maxTouchPoints?: number): boolean {
    const os = detectClientOS(ua, maxTouchPoints);
    return os === 'ios' || os === 'android';
}

export interface GenerateUrlSchemeOptions {
    category: 'video' | 'm2ts' | 'download';
    path: string; // 例: `/api/videos/12`
    filename?: string;
    token?: string | null;
    config?: apid.Config['urlscheme'];
    os?: ClientOS;
    location?: {
        protocol: string; // 例: 'http:'
        host: string; // 例: '192.168.1.10:4000'
    };
}

/**
 * サーバー設定からデフォルトまたは指定 OS の URL スキームテンプレートを取得する
 */
export function getUrlSchemeTemplate(
    category: 'video' | 'm2ts' | 'download',
    os: ClientOS,
    config?: apid.Config['urlscheme'],
): string | null {
    if (os === 'other') return null;

    const catConfig = config?.[category];
    if (catConfig && typeof catConfig[os] === 'string' && catConfig[os].trim().length > 0) {
        return catConfig[os];
    }

    // デフォルトフォールバック
    if (category === 'm2ts') {
        if (os === 'ios') return 'vlc-x-callback://x-callback-url/stream?url=PROTOCOL%3A%2F%2FADDRESS';
        if (os === 'android') {
            return 'intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end';
        }
    } else if (category === 'video') {
        if (os === 'ios') return 'vlc-x-callback://x-callback-url/stream?url=PROTOCOL%3A%2F%2FADDRESS';
        if (os === 'android') {
            return 'intent://ADDRESS#Intent;action=android.intent.action.VIEW;type=video/*;scheme=PROTOCOL;end';
        }
    } else if (category === 'download') {
        if (os === 'ios') {
            return 'vlc-x-callback://x-callback-url/download?url=PROTOCOL%3A%2F%2FADDRESS&filename=FILENAME';
        }
    }

    return null;
}

/**
 * ストリームの絶対 URL を取得する（ホスト名・パス・トークン含む）
 */
export function getDirectStreamUrl(
    path: string,
    token?: string | null,
    location?: { protocol: string; host: string },
): string {
    const loc =
        location || (typeof window !== 'undefined' ? window.location : { protocol: 'http:', host: 'localhost' });
    const protocol = loc.protocol.replace(':', '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    let fullPath = cleanPath;
    if (token) {
        const separator = fullPath.includes('?') ? '&' : '?';
        fullPath = `${fullPath}${separator}token=${encodeURIComponent(token)}`;
    }

    return `${protocol}://${loc.host}${fullPath}`;
}

/**
 * 外部プレイヤー起動用の URI を生成する
 */
export function generateUrlScheme(options: GenerateUrlSchemeOptions): { url: string; os: ClientOS } | null {
    const os = options.os ?? detectClientOS();
    const loc =
        options.location ||
        (typeof window !== 'undefined' ? window.location : { protocol: 'http:', host: 'localhost' });
    const protocol = loc.protocol.replace(':', '');

    const template = getUrlSchemeTemplate(options.category, os, options.config);
    if (!template) {
        return null;
    }

    let address = loc.host + (options.path.startsWith('/') ? options.path : `/${options.path}`);
    if (options.token) {
        const separator = address.includes('?') ? '&' : '?';
        address = `${address}${separator}token=${encodeURIComponent(options.token)}`;
    }

    const filename = options.filename ? encodeURIComponent(options.filename) : '';

    let url = template
        .replace(/PROTOCOL/g, protocol)
        .replace(/ADDRESS/g, address)
        .replace(/FILENAME/g, filename);

    return { url, os };
}

/**
 * URL スキーム / インテントを発火して外部プレイヤーを起動する
 */
export function launchUrlScheme(url: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const a = document.createElement('a');
        a.href = url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (a.parentNode) {
                a.parentNode.removeChild(a);
            }
        }, 1000);
        return true;
    } catch (e) {
        console.error('Failed to launch URL scheme', e);
        return false;
    }
}

export interface OpenWithExternalPlayerOptions extends GenerateUrlSchemeOptions {
    onClipboardCopied?: () => void;
}

/**
 * 外部プレイヤーで再生を試み、スキーム未設定・未対応時はストリームURLを安全にクリップボードにコピー
 */
export async function openWithExternalPlayer(
    options: OpenWithExternalPlayerOptions,
): Promise<'launched' | 'copied' | 'opened_fallback'> {
    const schemeResult = generateUrlScheme(options);

    if (schemeResult && schemeResult.url) {
        launchUrlScheme(schemeResult.url);
        return 'launched';
    }

    const directUrl = getDirectStreamUrl(options.path, options.token, options.location);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(directUrl);
            options.onClipboardCopied?.();
            return 'copied';
        } catch {
            if (typeof window !== 'undefined') {
                window.open(directUrl, '_blank');
            }
            return 'opened_fallback';
        }
    } else if (typeof window !== 'undefined') {
        window.open(directUrl, '_blank');
        return 'opened_fallback';
    }

    return 'opened_fallback';
}
