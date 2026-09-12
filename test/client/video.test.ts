import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import {
    getPlaybackPreference,
    savePlaybackPreference,
    getProtocolOptions,
    getAvailableStreamModes,
    parseStreamResolution,
    getStreamModeDescription,
    PREF_KEY_PREFIX,
    type PlaybackPreference,
} from '../../client/src/lib/utils/video';

describe('video.ts playback preference tests', () => {
    let mockStorage: Record<string, string> = {};

    beforeAll(() => {
        const localStorageMock = {
            getItem: (key: string) => mockStorage[key] ?? null,
            setItem: (key: string, value: string) => {
                mockStorage[key] = String(value);
            },
            removeItem: (key: string) => {
                delete mockStorage[key];
            },
            clear: () => {
                mockStorage = {};
            },
        };
        (globalThis as any).window = { localStorage: localStorageMock };
        (globalThis as any).localStorage = localStorageMock;
    });

    afterAll(() => {
        delete (globalThis as any).window;
        delete (globalThis as any).localStorage;
    });

    beforeEach(() => {
        mockStorage = {};
    });

    it('returns default preferences when nothing is stored', () => {
        expect(getPlaybackPreference('live')).toEqual({ streamType: 'm2tsll', mode: 0 });
        expect(getPlaybackPreference('recorded_mp4')).toEqual({ streamType: 'direct', mode: 0 });
        expect(getPlaybackPreference('recorded_ts')).toEqual({ streamType: 'hls', mode: 0 });
    });

    it('saves and retrieves preferences correctly for each target', () => {
        const livePref: PlaybackPreference = { streamType: 'hls', mode: 1 };
        savePlaybackPreference('live', livePref);
        expect(getPlaybackPreference('live')).toEqual(livePref);
        // other targets remain untouched
        expect(getPlaybackPreference('recorded_mp4')).toEqual({ streamType: 'direct', mode: 0 });
        expect(getPlaybackPreference('recorded_ts')).toEqual({ streamType: 'hls', mode: 0 });

        const mp4Pref: PlaybackPreference = { streamType: 'webm', mode: 2 };
        savePlaybackPreference('recorded_mp4', mp4Pref);
        expect(getPlaybackPreference('recorded_mp4')).toEqual(mp4Pref);

        const tsPref: PlaybackPreference = { streamType: 'webm', mode: 1 };
        savePlaybackPreference('recorded_ts', tsPref);
        expect(getPlaybackPreference('recorded_ts')).toEqual(tsPref);
    });

    it('handles corrupted or invalid localStorage data gracefully', () => {
        mockStorage[PREF_KEY_PREFIX + 'live'] = 'invalid-json';
        expect(getPlaybackPreference('live')).toEqual({ streamType: 'm2tsll', mode: 0 });

        mockStorage[PREF_KEY_PREFIX + 'live'] = JSON.stringify({ streamType: 'unknown_proto', mode: 0 });
        expect(getPlaybackPreference('live')).toEqual({ streamType: 'm2tsll', mode: 0 });

        mockStorage[PREF_KEY_PREFIX + 'recorded_mp4'] = JSON.stringify({ streamType: 'direct', mode: -1 });
        expect(getPlaybackPreference('recorded_mp4')).toEqual({ streamType: 'direct', mode: 0 });
    });

    describe('stream resolution parsing and descriptions', () => {
        it('parses resolution numbers correctly', () => {
            expect(parseStreamResolution('1080p')).toBe(1080);
            expect(parseStreamResolution('720p')).toBe(720);
            expect(parseStreamResolution('480p')).toBe(480);
            expect(parseStreamResolution('360p')).toBe(360);
            expect(parseStreamResolution('無変換')).toBe(9999);
            expect(parseStreamResolution('original')).toBe(9999);
            expect(parseStreamResolution('custom')).toBe(0);

            expect(getStreamModeDescription('1080p', 1080)).toBe('最高画質');
            expect(getStreamModeDescription('720p', 720)).toBe('高画質・標準');
            expect(getStreamModeDescription('480p', 480)).toBe('中画質・節約');
            expect(getStreamModeDescription('無変換', 9999)).toBe('元画質・無劣化');
            expect(getStreamModeDescription('audio_only', 0)).toBe('カスタム');
        });
    });

    describe('getProtocolOptions', () => {
        it('configures options for live broadcast properly', () => {
            const options = getProtocolOptions({
                channelId: 1,
                recordedId: null,
                isCurrentFileMp4: false,
                hasSelectedFile: false,
                canLiveStream: true,
                canRecordedStream: true,
            });

            const direct = options.find(o => o.type === 'direct')!;
            const m2tsll = options.find(o => o.type === 'm2tsll')!;
            const webm = options.find(o => o.type === 'webm')!;
            const hls = options.find(o => o.type === 'hls')!;

            expect(direct.isAvailable).toBe(false);
            expect(direct.subText).toBe('オンエアー非対応');

            expect(m2tsll.isAvailable).toBe(true);
            expect(m2tsll.subText).toBe('低遅延 (1-2秒)');
            expect(m2tsll.badge).toBeUndefined();

            expect(webm.isAvailable).toBe(true);
            expect(webm.badge).toBe('字幕非対応');

            expect(hls.isAvailable).toBe(true);
            expect(hls.badge).toBeUndefined();
        });

        it('configures options for recorded MP4 properly', () => {
            const options = getProtocolOptions({
                channelId: null,
                recordedId: 10,
                isCurrentFileMp4: true,
                hasSelectedFile: true,
                canLiveStream: true,
                canRecordedStream: true,
            });

            const direct = options.find(o => o.type === 'direct')!;
            const m2tsll = options.find(o => o.type === 'm2tsll')!;
            const webm = options.find(o => o.type === 'webm')!;
            const hls = options.find(o => o.type === 'hls')!;

            expect(direct.isAvailable).toBe(true);
            expect(direct.subText).toBe('即時再生');

            expect(m2tsll.isAvailable).toBe(false);
            expect(m2tsll.subText).toBe('オンエアー専用');

            expect(webm.isAvailable).toBe(true);
            expect(hls.isAvailable).toBe(true);
        });

        it('configures options for recorded TS properly', () => {
            const options = getProtocolOptions({
                channelId: null,
                recordedId: 10,
                isCurrentFileMp4: false,
                hasSelectedFile: true,
                canLiveStream: true,
                canRecordedStream: true,
            });

            const direct = options.find(o => o.type === 'direct')!;
            expect(direct.isAvailable).toBe(false);
            expect(direct.subText).toBe('MP4のみ');
        });

        it('handles read-only restrictions properly', () => {
            const options = getProtocolOptions({
                channelId: 1,
                recordedId: null,
                isCurrentFileMp4: false,
                hasSelectedFile: false,
                canLiveStream: false,
                canRecordedStream: false,
            });

            const m2tsll = options.find(o => o.type === 'm2tsll')!;
            const webm = options.find(o => o.type === 'webm')!;
            const hls = options.find(o => o.type === 'hls')!;

            expect(m2tsll.isAvailable).toBe(false);
            expect(m2tsll.subText).toBe('🔒 制限中');
            expect(webm.isAvailable).toBe(false);
            expect(webm.subText).toBe('🔒 制限中');
            expect(hls.isAvailable).toBe(false);
            expect(hls.subText).toBe('🔒 制限中');
        });
    });

    describe('getAvailableStreamModes', () => {
        it('returns empty list for direct playback', () => {
            expect(getAvailableStreamModes({ streamType: 'direct' })).toEqual([]);
        });

        it('sorts resolution modes in descending order preserving id', () => {
            const mockConfig = {
                live: {
                    ts: {
                        m2tsll: ['720p', '1080p', '480p'],
                    },
                },
            };

            const modes = getAvailableStreamModes({
                streamType: 'm2tsll',
                channelId: 1,
                streamConfig: mockConfig as any,
            });

            expect(modes.map(m => m.label)).toEqual(['1080p', '720p', '480p']);
            expect(modes[0]).toEqual({
                id: 1, // index in original array
                label: '1080p',
                desc: '最高画質',
                numericRes: 1080,
            });
            expect(modes[1]).toEqual({
                id: 0,
                label: '720p',
                desc: '高画質・標準',
                numericRes: 720,
            });
            expect(modes[2]).toEqual({
                id: 2,
                label: '480p',
                desc: '中画質・節約',
                numericRes: 480,
            });
        });
    });
});
