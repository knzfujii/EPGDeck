import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EncoderModel from '../../src/model/service/encode/EncoderModel.js';
import FileUtil from '../../src/util/FileUtil.js';
import Util from '../../src/util/Util.js';

describe('EncoderModel', () => {
    let mockLogger: any;
    let mockConfigure: any;
    let mockProcessManager: any;
    let mockFileManager: any;
    let mockVideoFileDB: any;
    let mockRecordedDB: any;
    let mockChannelDB: any;
    let mockVideoUtil: any;
    let mockEncodeEvent: any;
    let mockRecordingUtil: any;
    let encoderModel: EncoderModel;
    let mockChildProcess: any;

    beforeEach(() => {
        vi.restoreAllMocks();

        mockLogger = {
            getLogger: vi.fn().mockReturnValue({
                encode: {
                    info: vi.fn(),
                    error: vi.fn(),
                    warn: vi.fn(),
                    debug: vi.fn(),
                },
            }),
        };

        mockConfigure = {
            getConfig: vi.fn().mockReturnValue({
                encode: {
                    presets: [
                        {
                            name: 'H264 crf23',
                            cmd: 'node /path/to/enc_1080p_crf23.js',
                            suffix: '_crf23.mp4',
                            rate: 4.0,
                        },
                    ],
                    binaries: {
                        ffmpeg: '/opt/ffmpeg-custom/bin/ffmpeg',
                        ffprobe: '/opt/ffmpeg-custom/bin/ffprobe',
                    },
                },
            }),
        };

        mockChildProcess = new EventEmitter();
        mockChildProcess.stderr = new EventEmitter();
        mockChildProcess.stdout = new EventEmitter();
        mockChildProcess.pid = 12345;
        mockChildProcess.exitCode = null;
        mockChildProcess.signalCode = null;
        mockChildProcess.kill = vi.fn();

        mockProcessManager = {
            create: vi.fn().mockResolvedValue(mockChildProcess),
        };

        mockFileManager = {
            getFilePath: vi.fn().mockResolvedValue('/path/to/output_crf23.mp4'),
            release: vi.fn(),
        };

        mockVideoFileDB = {
            findId: vi.fn().mockResolvedValue({
                id: 1,
                name: 'test.m2ts',
                filePath: '/path/to/input.m2ts',
            }),
        };

        mockRecordedDB = {
            findId: vi.fn().mockResolvedValue({
                id: 10,
                name: 'テスト番組',
                halfWidthName: 'テスト番組',
                channelId: 101,
                startAt: 1000,
                endAt: 2000,
                duration: 1000,
            }),
        };

        mockChannelDB = {
            findId: vi.fn().mockResolvedValue({
                id: 101,
                name: 'NHK BS',
                halfWidthName: 'NHK BS',
            }),
        };

        mockVideoUtil = {
            getFullFilePathFromId: vi.fn().mockResolvedValue('/path/to/input.m2ts'),
            getParentDirPath: vi.fn().mockReturnValue('/path/to/dir'),
            getInfo: vi.fn().mockResolvedValue({ duration: 1000 }),
        };

        mockEncodeEvent = {};
        mockRecordingUtil = {
            formatFilePathString: vi.fn().mockImplementation(str => str),
        };

        vi.spyOn(FileUtil, 'stat').mockResolvedValue({} as any);
        vi.spyOn(FileUtil, 'mkdir').mockResolvedValue(undefined as any);
        vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined as any);
        vi.spyOn(Util, 'sleep').mockResolvedValue(undefined as any);

        encoderModel = new EncoderModel(
            mockLogger,
            mockConfigure,
            mockProcessManager,
            mockFileManager,
            mockVideoFileDB,
            mockRecordedDB,
            mockChannelDB,
            mockVideoUtil,
            mockEncodeEvent,
            mockRecordingUtil,
        );
    });

    it('should log encodeCmd.cmd and capture FFmpeg command from child stderr', async () => {
        encoderModel.setOption({
            encodeId: 1,
            sourceVideoFileId: 1,
            parentDir: 'recorded',
            recordedId: 10,
            mode: 'H264 crf23',
            directory: '映画',
            removeOriginal: false,
        });

        await encoderModel.start();

        const log = mockLogger.getLogger().encode;

        // encodeCmd.cmd がログに出力されていること
        expect(log.info).toHaveBeenCalledWith('encodeCmd.cmd: node /path/to/enc_1080p_crf23.js');

        // stderr から FFmpeg command: が流れてきたら INFO ログに出力されること
        const ffmpegCmdLine =
            '[enc_helper] FFmpeg command: /opt/ffmpeg-custom/bin/ffmpeg -y -fix_sub_duration -i "/path/to/input.m2ts" "/path/to/output_crf23.mp4"';
        mockChildProcess.stderr.emit('data', Buffer.from(ffmpegCmdLine + '\n'));

        expect(log.info).toHaveBeenCalledWith(ffmpegCmdLine);

        // プロセスがエラー終了した場合、failed ffmpeg command としてエラーログに出力されること
        const onFinishPromise = new Promise<{ isError: boolean; path: string | null }>(resolve => {
            encoderModel.setOnFinish((isError, outputFilePath) => {
                resolve({ isError, path: outputFilePath });
            });
        });

        mockChildProcess.emit('exit', 234, null);
        const result = await onFinishPromise;

        expect(log.error).toHaveBeenCalledWith(`failed ffmpeg command: ${ffmpegCmdLine}`);
        expect(result.isError).toBe(true);
        expect(result.path).toBe('/path/to/output_crf23.mp4');
    });

    it('should disable SUBTITLE when skipSubtitleForSuperimpose is true and program contains 字幕スーパー', async () => {
        // preset に subtitle: true を設定
        mockConfigure.getConfig.mockReturnValue({
            encode: {
                presets: [
                    {
                        name: 'H264 crf23',
                        cmd: 'node /path/to/enc_1080p_crf23.js',
                        suffix: '_crf23.mp4',
                        subtitle: true,
                    },
                ],
                binaries: {
                    ffmpeg: '/opt/ffmpeg-custom/bin/ffmpeg',
                    ffprobe: '/opt/ffmpeg-custom/bin/ffprobe',
                },
                skipSubtitleForSuperimpose: true,
            },
        });

        // 番組名に「字幕スーパー」が含まれる
        mockRecordedDB.findId.mockResolvedValue({
            id: 20,
            name: 'シネマ「グリーンマイル」＜字幕スーパー＞',
            halfWidthName: 'シネマ「グリーンマイル」＜字幕スーパー＞',
            channelId: 101,
            startAt: 1000,
            endAt: 2000,
            duration: 1000,
        });

        encoderModel.setOption({
            encodeId: 2,
            sourceVideoFileId: 1,
            parentDir: 'recorded',
            recordedId: 20,
            mode: 'H264 crf23',
            directory: '映画',
            removeOriginal: false,
        });

        await encoderModel.start();

        const log = mockLogger.getLogger().encode;

        // スキップログが出力されていること
        expect(log.info).toHaveBeenCalledWith(
            expect.stringContaining('skip subtitle embedding: detected "字幕スーパー" in recorded info'),
        );

        // processManager.create に渡された env.SUBTITLE が 'false' になっていること
        expect(mockProcessManager.create).toHaveBeenCalledWith(
            expect.objectContaining({
                spawnOption: expect.objectContaining({
                    env: expect.objectContaining({
                        SUBTITLE: 'false',
                        SKIP_SUBTITLE_FOR_SUPERIMPOSE: 'true',
                    }),
                }),
            }),
        );
    });

    it('should keep SUBTITLE true when program does not contain 字幕スーパー', async () => {
        mockConfigure.getConfig.mockReturnValue({
            encode: {
                presets: [
                    {
                        name: 'H264 crf23',
                        cmd: 'node /path/to/enc_1080p_crf23.js',
                        suffix: '_crf23.mp4',
                        subtitle: true,
                    },
                ],
                binaries: {
                    ffmpeg: '/opt/ffmpeg-custom/bin/ffmpeg',
                    ffprobe: '/opt/ffmpeg-custom/bin/ffprobe',
                },
                skipSubtitleForSuperimpose: true,
            },
        });

        mockRecordedDB.findId.mockResolvedValue({
            id: 21,
            name: '通常のニュース番組[字]',
            halfWidthName: '通常のニュース番組[字]',
            channelId: 101,
            startAt: 1000,
            endAt: 2000,
            duration: 1000,
        });

        encoderModel.setOption({
            encodeId: 3,
            sourceVideoFileId: 1,
            parentDir: 'recorded',
            recordedId: 21,
            mode: 'H264 crf23',
            directory: '',
            removeOriginal: false,
        });

        await encoderModel.start();

        expect(mockProcessManager.create).toHaveBeenCalledWith(
            expect.objectContaining({
                spawnOption: expect.objectContaining({
                    env: expect.objectContaining({
                        SUBTITLE: 'true',
                        SKIP_SUBTITLE_FOR_SUPERIMPOSE: 'true',
                    }),
                }),
            }),
        );
    });

    it('replaces %FFMPEG% and %FFPROBE% macros in cmd passed to processManager.create', async () => {
        mockConfigure.getConfig.mockReturnValue({
            encode: {
                presets: [
                    {
                        name: 'Direct Command Preset',
                        cmd: '%FFMPEG% -y -i %INPUT% -c:v copy %OUTPUT%',
                        suffix: '.mp4',
                    },
                ],
                binaries: {
                    ffmpeg: '/usr/local/bin/ffmpeg',
                    ffprobe: '/usr/local/bin/ffprobe',
                },
            },
        });

        encoderModel.setOption({
            encodeId: 4,
            sourceVideoFileId: 1,
            parentDir: 'recorded',
            recordedId: 10,
            mode: 'Direct Command Preset',
            directory: '',
            removeOriginal: false,
        });

        await encoderModel.start();

        expect(mockProcessManager.create).toHaveBeenCalledWith(
            expect.objectContaining({
                cmd: '/usr/local/bin/ffmpeg -y -i %INPUT% -c:v copy %OUTPUT%',
            }),
        );
    });

    describe('Progress Stall Watchdog (forward progress monitoring)', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should trigger cancel when encoding progress does not advance for stallTimeoutSeconds', async () => {
            mockConfigure.getConfig.mockReturnValue({
                encode: {
                    presets: [
                        {
                            name: 'H264 crf23',
                            cmd: 'node /path/to/enc.js',
                            suffix: '_crf23.mp4',
                            stallTimeoutSeconds: 60, // 60秒進捗が停止したらタイムアウト
                        },
                    ],
                    binaries: {
                        ffmpeg: '/opt/ffmpeg/bin/ffmpeg',
                        ffprobe: '/opt/ffmpeg/bin/ffprobe',
                    },
                },
            });

            const cancelSpy = vi.spyOn(encoderModel, 'cancel').mockResolvedValue(undefined as any);

            encoderModel.setOption({
                encodeId: 10,
                sourceVideoFileId: 1,
                parentDir: 'recorded',
                recordedId: 10,
                mode: 'H264 crf23',
                directory: '',
                removeOriginal: false,
            });

            await encoderModel.start();

            // 最初の進捗 (time=00:00:10, percent: 1.0)
            mockChildProcess.stdout.emit(
                'data',
                Buffer.from(JSON.stringify({ type: 'progress', percent: 1.0, log: 'time=00:00:10.00' }) + '\n'),
            );

            // 30秒経過（まだタイムアウトしない）
            await vi.advanceTimersByTimeAsync(30000);
            expect(cancelSpy).not.toHaveBeenCalled();

            // さらに40秒経過（合計70秒間、進捗が一切前進しない）
            await vi.advanceTimersByTimeAsync(40000);
            expect(cancelSpy).toHaveBeenCalledTimes(1);

            const log = mockLogger.getLogger().encode;
            expect(log.error).toHaveBeenCalledWith(
                expect.stringContaining('encode process is stalled (no forward progress for'),
            );
        });

        it('should trigger cancel when stderr outputs endless errors without advancing forward progress (error loop detection)', async () => {
            mockConfigure.getConfig.mockReturnValue({
                encode: {
                    presets: [
                        {
                            name: 'H264 crf23',
                            cmd: 'node /path/to/enc.js',
                            suffix: '_crf23.mp4',
                            stallTimeoutSeconds: 60,
                        },
                    ],
                    binaries: {
                        ffmpeg: '/opt/ffmpeg/bin/ffmpeg',
                        ffprobe: '/opt/ffmpeg/bin/ffprobe',
                    },
                },
            });

            const cancelSpy = vi.spyOn(encoderModel, 'cancel').mockResolvedValue(undefined as any);

            encoderModel.setOption({
                encodeId: 11,
                sourceVideoFileId: 1,
                parentDir: 'recorded',
                recordedId: 10,
                mode: 'H264 crf23',
                directory: '',
                removeOriginal: false,
            });

            await encoderModel.start();

            // 10秒ごとにエラーログが stderr から激しく出力され続けるが、エンコード進捗 (time= や percent) は一切進まない
            for (let i = 0; i < 7; i++) {
                await vi.advanceTimersByTimeAsync(10000);
                mockChildProcess.stderr.emit('data', Buffer.from('[h264 @ 0x55] corrupt macroblock error loop!\n'));
            }

            // 文字列が出力されていても、進捗が進んでいないため確実にストール判定されて cancel されること！
            expect(cancelSpy).toHaveBeenCalledTimes(1);

            const log = mockLogger.getLogger().encode;
            expect(log.error).toHaveBeenCalledWith(
                expect.stringContaining('encode process is stalled (no forward progress for'),
            );
        });

        it('should NOT trigger cancel when forward progress advances periodically (10-parallel simulation)', async () => {
            mockConfigure.getConfig.mockReturnValue({
                encode: {
                    presets: [
                        {
                            name: 'H264 crf23',
                            cmd: 'node /path/to/enc.js',
                            suffix: '_crf23.mp4',
                            stallTimeoutSeconds: 60, // 60秒進捗停止でタイムアウト
                        },
                    ],
                    binaries: {
                        ffmpeg: '/opt/ffmpeg/bin/ffmpeg',
                        ffprobe: '/opt/ffmpeg/bin/ffprobe',
                    },
                },
            });

            const cancelSpy = vi.spyOn(encoderModel, 'cancel').mockResolvedValue(undefined as any);

            encoderModel.setOption({
                encodeId: 12,
                sourceVideoFileId: 1,
                parentDir: 'recorded',
                recordedId: 10,
                mode: 'H264 crf23',
                directory: '',
                removeOriginal: false,
            });

            await encoderModel.start();

            // 10並列で超低速になり、何時間もかかっている状況をシミュレート
            // 20秒ごとに少しずつ time= が前進し、合計 2時間 (7,200,000ms) 経過させる
            for (let i = 1; i <= 360; i++) {
                await vi.advanceTimersByTimeAsync(20000);
                const s = i * 2;
                const hh = String(Math.floor(s / 3600)).padStart(2, '0');
                const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
                const ss = String(s % 60).padStart(2, '0');
                mockChildProcess.stderr.emit('data', Buffer.from(`frame=${i * 5} fps=0.5 time=${hh}:${mm}:${ss}.00\n`));
            }

            // 進捗が着実に前進しているため、2時間経っても絶対に cancel されないこと！
            expect(cancelSpy).not.toHaveBeenCalled();
        });
    });

    it('should safely start encode even when channel is not found in channelDB (fallback to empty channel name)', async () => {
        // channelDB が null を返す状況（過去のチャンネル再編前の録画や閉局チャンネル）
        mockChannelDB.findId.mockResolvedValue(null);

        encoderModel.setOption({
            encodeId: 99,
            sourceVideoFileId: 1,
            parentDir: 'recorded',
            recordedId: 10,
            mode: 'H264 crf23',
            directory: '映画',
            removeOriginal: false,
        });

        await expect(encoderModel.start()).resolves.not.toThrow();

        // processManager.create に CHANNELNAME: '' が渡されて正常にプロセス生成されること
        expect(mockProcessManager.create).toHaveBeenCalledWith(
            expect.objectContaining({
                spawnOption: expect.objectContaining({
                    env: expect.objectContaining({
                        CHANNELNAME: '',
                        HALF_WIDTH_CHANNELNAME: '',
                    }),
                }),
            }),
        );
    });
});
