import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigApiModel from '../../src/model/api/config/ConfigApiModel.js';

describe('ConfigApiModel Tests', () => {
    let dummyConfig: any;
    let dummyConfiguration: any;
    let dummyIPC: any;
    let model: ConfigApiModel;

    beforeEach(() => {
        dummyConfig = {
            server: {
                port: 8888,
                https: {
                    port: 8443,
                },
            },
            recording: {
                directories: [
                    { name: 'storage1', path: '/path1' },
                    { name: 'storage2', path: '/path2' },
                ],
                copyKeywordToDirectory: true,
            },
            encode: {
                presets: [
                    { name: 'H.264', cmd: 'ffmpeg...' },
                    { name: 'H.265', cmd: 'ffmpeg...' },
                ],
            },
            urlscheme: {
                m2ts: { ios: 'vlc-x-callback://', android: 'intent://', mac: 'vlc://', win: 'potplayer://' },
                video: { ios: 'vlc-x-callback://', android: 'intent://', mac: 'vlc://', win: 'potplayer://' },
                download: { ios: 'vlc-x-callback://', android: 'intent://', mac: 'vlc://', win: 'potplayer://' },
            },
            streaming: {
                live: {
                    ts: {
                        m2ts: [
                            { name: 'direct', cmd: undefined },
                            { name: 'transcode', cmd: 'ffmpeg' },
                        ],
                        m2tsll: [{ name: 'lowlatency' }],
                        webm: [{ name: 'webm-live' }],
                        mp4: [{ name: 'mp4-live' }],
                        hls: [{ name: 'hls-live' }],
                    },
                },
                recorded: {
                    ts: {
                        webm: [{ name: 'webm-ts' }],
                        mp4: [{ name: 'mp4-ts' }],
                        hls: [{ name: 'hls-ts' }],
                    },
                    encoded: {
                        webm: [{ name: 'webm-enc' }],
                        mp4: [{ name: 'mp4-enc' }],
                        hls: [{ name: 'hls-enc' }],
                    },
                },
            },
            kodi: [{ name: 'Living Kodi' }],
            readOnly: {
                enabled: true,
                allowedOperations: ['GET /api/schedules', 'GET /api/recorded'],
            },
        };

        dummyConfiguration = {
            getConfig: () => dummyConfig,
        };

        dummyIPC = {
            reservation: {
                getBroadcastStatus: vi.fn().mockResolvedValue({ GR: true, BS: true, CS: true, SKY: false }),
            },
        };

        model = new ConfigApiModel(dummyConfiguration, dummyIPC);
    });

    describe('getConfig (HTTP)', () => {
        it('returns client config for HTTP request', async () => {
            const config = await model.getConfig(false);

            expect(config.socketIOPort).toBe(8888);
            expect(config.recorded).toEqual(['storage1', 'storage2']);
            expect(config.encode).toEqual(['H.264', 'H.265']);
            expect(config.copyKeywordToDirectory).toBe(true);
            expect(config.broadcast).toEqual({ GR: true, BS: true, CS: true, SKY: false });
            expect(config.isEnableTSLiveStream).toBe(true);
            expect(config.isEnableTSRecordedStream).toBe(true);
            expect(config.isEnableEncodedRecordedStream).toBe(true);
            expect(config.streamConfig?.live?.ts?.m2ts).toEqual([
                { name: 'direct', isUnconverted: true },
                { name: 'transcode', isUnconverted: false },
            ]);
            expect(config.kodiHosts).toEqual(['Living Kodi']);
            expect(config.readOnly).toEqual({
                enabled: true,
                allowedOperations: ['GET /api/schedules', 'GET /api/recorded'],
            });
            expect(config.urlscheme.m2ts.mac).toBe('vlc://');
        });

        it('throws httpConfigError when server.port is undefined', async () => {
            delete dummyConfig.server.port;

            await expect(model.getConfig(false)).rejects.toThrow('httpConfigError');
        });
    });

    describe('getConfig (HTTPS)', () => {
        it('returns client config with HTTPS port when isSecure is true', async () => {
            const config = await model.getConfig(true);

            expect(config.socketIOPort).toBe(8443);
        });

        it('throws httpsConfigError when server.https is undefined and isSecure is true', async () => {
            delete dummyConfig.server.https;

            await expect(model.getConfig(true)).rejects.toThrow('httpsConfigError');
        });
    });

    describe('getConfig without optional features', () => {
        it('handles missing urlscheme, streaming, kodi and readOnly gracefully', async () => {
            dummyConfig.urlscheme = undefined;
            dummyConfig.streaming = undefined;
            dummyConfig.kodi = undefined;
            dummyConfig.readOnly = undefined;
            dummyConfig.recording.copyKeywordToDirectory = undefined;

            const config = await model.getConfig(false);

            expect(config.urlscheme).toEqual({});
            expect(config.isEnableTSLiveStream).toBe(false);
            expect(config.isEnableTSRecordedStream).toBe(false);
            expect(config.isEnableEncodedRecordedStream).toBe(false);
            expect(config.copyKeywordToDirectory).toBe(false);
            expect(config.kodiHosts).toBeUndefined();
            expect(config.readOnly).toBeUndefined();
        });
    });
});
