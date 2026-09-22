import 'reflect-metadata';
import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
