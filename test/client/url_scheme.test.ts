import { describe, it, expect, vi } from 'vitest';
import {
    detectClientOS,
    isMobileOrTabletDevice,
    getUrlSchemeTemplate,
    generateUrlScheme,
    getDirectStreamUrl,
    openWithExternalPlayer,
} from '../../client/src/lib/utils/urlScheme';

describe('urlScheme.ts utility tests', () => {
    describe('detectClientOS', () => {
        it('should detect iOS devices (iPhone, iPad, iPod)', () => {
            const iPhoneUA =
                'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
            expect(detectClientOS(iPhoneUA, 5)).toBe('ios');

            const iPadLegacyUA =
                'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
            expect(detectClientOS(iPadLegacyUA, 5)).toBe('ios');
        });

        it('should detect iPadOS with desktop Mac user-agent via maxTouchPoints', () => {
            const iPadOSDesktopUA =
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15';
            expect(detectClientOS(iPadOSDesktopUA, 5)).toBe('ios');
            // Desktop Mac without touch points
            expect(detectClientOS(iPadOSDesktopUA, 0)).toBe('mac');
        });

        it('should detect Android devices', () => {
            const androidUA =
                'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
            expect(detectClientOS(androidUA, 5)).toBe('android');
        });

        it('should detect Windows PC', () => {
            const winUA =
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
            expect(detectClientOS(winUA, 0)).toBe('win');
        });

        it('should detect Linux / Other', () => {
            const linuxUA =
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
            expect(detectClientOS(linuxUA, 0)).toBe('other');
        });
    });

    describe('isMobileOrTabletDevice', () => {
        it('should return true for iPhone, iPad, and Android', () => {
            const iPhoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
            expect(isMobileOrTabletDevice(iPhoneUA, 5)).toBe(true);

            const iPadOSUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
            expect(isMobileOrTabletDevice(iPadOSUA, 5)).toBe(true);

            const androidUA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36';
            expect(isMobileOrTabletDevice(androidUA, 5)).toBe(true);
        });

        it('should return false for PC (Mac, Windows, Linux)', () => {
            const macDesktopUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
            expect(isMobileOrTabletDevice(macDesktopUA, 0)).toBe(false);

            const winUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
            expect(isMobileOrTabletDevice(winUA, 0)).toBe(false);

            const linuxUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
            expect(isMobileOrTabletDevice(linuxUA, 0)).toBe(false);
        });
    });

    describe('getUrlSchemeTemplate', () => {
        it('should use custom config when provided', () => {
            const customConfig = {
                video: {
                    android: 'intent://ADDRESS#Intent;package=org.videolan.vlc;type=video/*;scheme=PROTOCOL;end',
                    ios: 'vlc://PROTOCOL://ADDRESS',
                },
                m2ts: {},
                download: {},
            };
            expect(getUrlSchemeTemplate('video', 'android', customConfig)).toBe(
                'intent://ADDRESS#Intent;package=org.videolan.vlc;type=video/*;scheme=PROTOCOL;end',
            );
            expect(getUrlSchemeTemplate('video', 'ios', customConfig)).toBe('vlc://PROTOCOL://ADDRESS');
        });

        it('should fallback to default schemes when not specified in config', () => {
            expect(getUrlSchemeTemplate('video', 'android')).toContain('intent://');
            expect(getUrlSchemeTemplate('video', 'ios')).toContain('vlc-x-callback://');
            expect(getUrlSchemeTemplate('m2ts', 'android')).toContain('intent://');
            expect(getUrlSchemeTemplate('m2ts', 'ios')).toContain('vlc-x-callback://');
        });

        it('should return null for other OS without custom scheme', () => {
            expect(getUrlSchemeTemplate('video', 'other')).toBeNull();
        });
    });

    describe('getDirectStreamUrl', () => {
        it('should construct direct absolute URL', () => {
            const loc = { protocol: 'http:', host: '192.168.1.50:4000' };
            const url = getDirectStreamUrl('/api/videos/123', null, loc);
            expect(url).toBe('http://192.168.1.50:4000/api/videos/123');
        });

        it('should append token parameter when token is provided', () => {
            const loc = { protocol: 'https:', host: 'epgdeck.local' };
            const url = getDirectStreamUrl('/api/videos/123?isDownload=false', 'secret-token', loc);
            expect(url).toBe('https://epgdeck.local/api/videos/123?isDownload=false&token=secret-token');
        });
    });

    describe('generateUrlScheme', () => {
        const mockLocation = { protocol: 'http:', host: '192.168.1.50:4000' };

        it('should generate Android intent URI correctly', () => {
            const result = generateUrlScheme({
                category: 'video',
                path: '/api/videos/42',
                os: 'android',
                location: mockLocation,
            });

            expect(result).not.toBeNull();
            expect(result!.os).toBe('android');
            expect(result!.url).toBe(
                'intent://192.168.1.50:4000/api/videos/42#Intent;action=android.intent.action.VIEW;type=video/*;scheme=http;end',
            );
        });

        it('should generate Android intent URI with authentication token', () => {
            const result = generateUrlScheme({
                category: 'video',
                path: '/api/videos/42',
                token: 'my-auth-token',
                os: 'android',
                location: mockLocation,
            });

            expect(result).not.toBeNull();
            expect(result!.url).toBe(
                'intent://192.168.1.50:4000/api/videos/42?token=my-auth-token#Intent;action=android.intent.action.VIEW;type=video/*;scheme=http;end',
            );
        });

        it('should generate iOS VLC x-callback URI correctly', () => {
            const result = generateUrlScheme({
                category: 'video',
                path: '/api/videos/42',
                os: 'ios',
                location: mockLocation,
            });

            expect(result).not.toBeNull();
            expect(result!.os).toBe('ios');
            expect(result!.url).toBe(
                'vlc-x-callback://x-callback-url/stream?url=http%3A%2F%2F192.168.1.50:4000/api/videos/42',
            );
        });

        it('should replace FILENAME placeholder when provided', () => {
            const result = generateUrlScheme({
                category: 'download',
                path: '/api/videos/42',
                filename: 'テスト番組.mp4',
                os: 'ios',
                location: mockLocation,
            });

            expect(result).not.toBeNull();
            expect(result!.url).toContain('filename=%E3%83%86%E3%82%B9%E3%83%88%E7%95%AA%E7%B5%84.mp4');
        });

        it('should return null when no template matches for OS', () => {
            const result = generateUrlScheme({
                category: 'video',
                path: '/api/videos/42',
                os: 'other',
                location: mockLocation,
            });

            expect(result).toBeNull();
        });
    });

    describe('openWithExternalPlayer', () => {
        const mockLocation = { protocol: 'http:', host: '192.168.1.50:4000' };

        it('should return "launched" when valid scheme exists for OS', async () => {
            const onCopied = vi.fn();
            const result = await openWithExternalPlayer({
                category: 'video',
                path: '/api/videos/42',
                os: 'android',
                location: mockLocation,
                onClipboardCopied: onCopied,
            });

            expect(result).toBe('launched');
            expect(onCopied).not.toHaveBeenCalled();
        });

        it('should copy stream URL to clipboard and return "copied" when no scheme matches', async () => {
            const writeTextMock = vi.fn().mockResolvedValue(undefined);
            const originalClipboard = navigator.clipboard;
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: writeTextMock },
                configurable: true,
            });

            const onCopied = vi.fn();
            const result = await openWithExternalPlayer({
                category: 'video',
                path: '/api/videos/42',
                token: 'token123',
                os: 'other',
                location: mockLocation,
                onClipboardCopied: onCopied,
            });

            expect(result).toBe('copied');
            expect(writeTextMock).toHaveBeenCalledWith('http://192.168.1.50:4000/api/videos/42?token=token123');
            expect(onCopied).toHaveBeenCalledTimes(1);

            Object.defineProperty(navigator, 'clipboard', {
                value: originalClipboard,
                configurable: true,
            });
        });

        it('should fallback and return "opened_fallback" when clipboard fails', async () => {
            const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
            const originalClipboard = navigator.clipboard;
            const originalWindow = (globalThis as any).window;
            const openMock = vi.fn();

            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText: writeTextMock },
                configurable: true,
            });
            (globalThis as any).window = { open: openMock };

            const onCopied = vi.fn();
            const result = await openWithExternalPlayer({
                category: 'video',
                path: '/api/videos/42',
                os: 'other',
                location: mockLocation,
                onClipboardCopied: onCopied,
            });

            expect(result).toBe('opened_fallback');
            expect(openMock).toHaveBeenCalledWith('http://192.168.1.50:4000/api/videos/42', '_blank');
            expect(onCopied).not.toHaveBeenCalled();

            Object.defineProperty(navigator, 'clipboard', {
                value: originalClipboard,
                configurable: true,
            });
            if (originalWindow) {
                (globalThis as any).window = originalWindow;
            } else {
                delete (globalThis as any).window;
            }
        });
    });
});
