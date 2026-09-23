import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LiveHLSStreamModel from '../../src/model/service/stream/LiveHLSStreamModel.js';
import LiveStreamModel from '../../src/model/service/stream/LiveStreamModel.js';
import RecordedHLSStreamModel from '../../src/model/service/stream/RecordedHLSStreamModel.js';
import RecordedStreamModel from '../../src/model/service/stream/RecordedStreamModel.js';

describe('Stream Concrete Models Tests', () => {
    let dummyConfig: any;
    let dummyConfiguration: any;
    let dummyLogger: any;
    let mockStreamLog: any;
    let dummyProcessManager: any;
    let dummyFileDeleter: any;
    let dummyMirakurunClientModel: any;
    let dummySocketIO: any;
    let dummyVideoFileDB: any;
    let dummyRecordedDB: any;
    let dummyVideoUtil: any;

    beforeEach(() => {
        dummyConfig = {
            encode: {
                binaries: {
                    ffmpeg: '/usr/bin/ffmpeg',
                },
            },
            streaming: {
                tempDir: '/tmp/stream',
            },
        };
        dummyConfiguration = {
            getConfig: () => dummyConfig,
        };
        mockStreamLog = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            fatal: vi.fn(),
        };
        dummyLogger = {
            getLogger: () => ({
                stream: mockStreamLog,
            }),
        };
        dummyProcessManager = {
            create: vi.fn(),
        };
        dummyFileDeleter = {
            setOption: vi.fn(),
            deleteAllFiles: vi.fn().mockResolvedValue(undefined),
        };
        dummyMirakurunClientModel = {
            getClient: () => ({}),
        };
        dummySocketIO = {
            notifyStreamInfo: vi.fn(),
        };
        dummyVideoFileDB = {
            findId: vi.fn(),
        };
        dummyRecordedDB = {
            findId: vi.fn(),
        };
        dummyVideoUtil = {
            getDuration: vi.fn(),
        };
    });

    describe('LiveStreamModel', () => {
        const createModel = () => {
            return new LiveStreamModel(
                dummyConfiguration,
                dummyLogger,
                dummyProcessManager,
                dummyFileDeleter,
                dummyMirakurunClientModel,
                dummySocketIO,
            );
        };

        it('createProcessOption returns null when cmd is undefined (direct TS stream)', () => {
            const model = createModel();
            model.setOption({ channelId: 1 } as any, 0);

            const poption = (model as any).createProcessOption(10);
            expect(poption).toBeNull();
        });

        it('createProcessOption replaces %FFMPEG% and sets output to null for live stream', () => {
            const model = createModel();
            model.setOption(
                {
                    channelId: 1,
                    cmd: '%FFMPEG% -i pipe:0 -c:v copy pipe:1',
                } as any,
                0,
            );

            const poption = (model as any).createProcessOption(10);
            expect(poption).not.toBeNull();
            expect(poption?.cmd).toBe('/usr/bin/ffmpeg -i pipe:0 -c:v copy pipe:1');
            expect(poption?.output).toBeNull();
        });

        it('createProcessOption throws ProcessOptionIsNull when option is not set', () => {
            const model = createModel();
            expect(() => (model as any).createProcessOption(10)).toThrow('ProcessOptionIsNull');
        });

        it('stop triggers exit callback and cleans up listeners', async () => {
            const model = createModel();
            const exitCallback = vi.fn();

            model.setExitStream(exitCallback);
            await model.stop();

            expect(exitCallback).toHaveBeenCalledTimes(1);

            // 2回目の stop ではコールバックが再発火しないこと（removeAllListeners されているため）
            await model.stop();
            expect(exitCallback).toHaveBeenCalledTimes(1);
        });
    });

    describe('LiveHLSStreamModel', () => {
        const createModel = () => {
            return new LiveHLSStreamModel(
                dummyConfiguration,
                dummyLogger,
                dummyProcessManager,
                dummyFileDeleter,
                dummyMirakurunClientModel,
                dummySocketIO,
            );
        };

        it('createProcessOption replaces %streamFileDir% and %streamNum% with HLS output path', () => {
            const model = createModel();
            model.setOption(
                {
                    channelId: 2,
                    cmd: '%FFMPEG% -i pipe:0 %streamFileDir%/stream%streamNum%.m3u8',
                } as any,
                0,
            );

            const poption = (model as any).createProcessOption(5);
            expect(poption).not.toBeNull();
            expect(poption?.cmd).toBe('/usr/bin/ffmpeg -i pipe:0 /tmp/stream/stream5.m3u8');
            expect(poption?.output).toBe('/tmp/stream/stream5.m3u8');
        });
    });

    describe('RecordedStreamModel & RecordedHLSStreamModel', () => {
        const createRecordedModel = () => {
            return new RecordedStreamModel(
                dummyConfiguration,
                dummyLogger,
                dummyProcessManager,
                dummyFileDeleter,
                dummySocketIO,
                dummyVideoFileDB,
                dummyRecordedDB,
                dummyVideoUtil,
            );
        };

        const createRecordedHLSModel = () => {
            return new RecordedHLSStreamModel(
                dummyConfiguration,
                dummyLogger,
                dummyProcessManager,
                dummyFileDeleter,
                dummySocketIO,
                dummyVideoFileDB,
                dummyRecordedDB,
                dummyVideoUtil,
            );
        };

        it('start throws ProcessOptionIsNull when option is not set', async () => {
            const model = createRecordedModel();
            await expect(model.start(1)).rejects.toThrow('ProcessOptionIsNull');
        });

        it('start throws VideoIsNull when videoFile is not found', async () => {
            const model = createRecordedModel();
            model.setOption({ videoFileId: 999, playPosition: 0 } as any, 0);
            dummyVideoFileDB.findId.mockResolvedValue(null);

            await expect(model.start(1)).rejects.toThrow('VideoIsNull');
        });

        it('start throws RecordedIsNull when recorded item is not found', async () => {
            const model = createRecordedModel();
            model.setOption({ videoFileId: 100, playPosition: 0 } as any, 0);
            dummyVideoFileDB.findId.mockResolvedValue({ id: 100, recordedId: 50 });
            dummyRecordedDB.findId.mockResolvedValue(null);

            await expect(model.start(1)).rejects.toThrow('RecordedIsNull');
        });

        it('start throws OutOfRange when playPosition exceeds duration', async () => {
            const model = createRecordedModel();
            model.setOption({ videoFileId: 100, playPosition: 500 } as any, 0);

            dummyVideoFileDB.findId.mockResolvedValue({
                id: 100,
                recordedId: 10,
                parentDirectoryName: 'storage',
                filePath: 'test.mp4',
                type: 'encoded',
            });
            dummyRecordedDB.findId.mockResolvedValue({
                id: 10,
                isRecording: false,
            });
            dummyVideoUtil.getFullFilePathFromId = vi.fn().mockResolvedValue('/path/to/test.mp4');

            // setVideFileInfo を部分モックして videoFilePath / videoFileInfo を直接セット
            vi.spyOn(model as any, 'setVideFileInfo').mockImplementation(async () => {
                (model as any).videoFilePath = '/path/to/test.mp4';
                (model as any).videoFileInfo = { duration: 300, size: 1000 };
            });

            await expect(model.start(1)).rejects.toThrow('OutOfRange');
        });

        it('RecordedHLSStreamModel preps stream dir before start', async () => {
            const model = createRecordedHLSModel();
            model.setOption({ videoFileId: 100, playPosition: 0 } as any, 0);
            dummyVideoFileDB.findId.mockResolvedValue(null);

            // prepStreamDir 内の処理をスパイまたは検証
            const prepSpy = vi.spyOn(model as any, 'prepStreamDir').mockResolvedValue(undefined);

            await expect(model.start(3)).rejects.toThrow('VideoIsNull');
            expect(prepSpy).toHaveBeenCalledWith(3);
        });

        it('stop cleans up resources and triggers exitStream', async () => {
            const model = createRecordedModel();
            const exitCallback = vi.fn();
            model.setExitStream(exitCallback);

            await model.stop();

            expect(exitCallback).toHaveBeenCalledTimes(1);
        });
    });
});
