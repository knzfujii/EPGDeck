import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StreamApiModel from '../../src/model/api/stream/StreamApiModel.js';

describe('StreamApiModel Tests', () => {
    let dummyConfig: any;
    let dummyConfiguration: any;
    let dummyLiveStream: any;
    let dummyLiveHLSStream: any;
    let dummyRecordedStream: any;
    let dummyRecordedHLSStream: any;
    let dummyStreamManageModel: any;
    let dummyProgramDB: any;
    let dummyVideoFileDB: any;
    let dummyRecordedDB: any;
    let dummyChannelDB: any;
    let dummyApiUtil: any;
    let model: StreamApiModel;

    beforeEach(() => {
        dummyConfig = {
            streaming: {
                live: {
                    ts: {
                        m2ts: [{ cmd: 'ffmpeg live m2ts' }],
                    },
                },
            },
        };
        dummyConfiguration = {
            getConfig: () => dummyConfig,
        };

        dummyLiveStream = {
            setOption: vi.fn(),
            getStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
        };
        dummyLiveHLSStream = {
            setOption: vi.fn(),
        };
        dummyRecordedStream = {
            setOption: vi.fn(),
            getStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
        };
        dummyRecordedHLSStream = {
            setOption: vi.fn(),
        };

        dummyStreamManageModel = {
            start: vi.fn().mockResolvedValue(100),
            stop: vi.fn().mockResolvedValue(undefined),
            stopAll: vi.fn().mockResolvedValue(undefined),
            keep: vi.fn(),
            getStreamInfos: vi.fn().mockReturnValue([]),
        };

        dummyProgramDB = {
            findChannelIdAndTime: vi.fn(),
        };
        dummyVideoFileDB = {
            findId: vi.fn(),
        };
        dummyRecordedDB = {
            findId: vi.fn(),
        };
        dummyChannelDB = {
            findId: vi.fn(),
        };
        dummyApiUtil = {};

        model = new StreamApiModel(
            dummyConfiguration,
            (() => dummyLiveStream) as any,
            (() => dummyLiveHLSStream) as any,
            (() => dummyRecordedStream) as any,
            (() => dummyRecordedHLSStream) as any,
            dummyStreamManageModel,
            dummyProgramDB,
            dummyVideoFileDB,
            dummyRecordedDB,
            dummyChannelDB,
            dummyApiUtil,
        );
    });

    describe('startLiveM2TsStream', () => {
        it('starts live stream and returns streamId and readable stream', async () => {
            const result = await model.startLiveM2TsStream({
                channelId: 1,
                mode: 0,
            });

            expect(result.streamId).toBe(100);
            expect(dummyLiveStream.setOption).toHaveBeenCalledWith(
                {
                    channelId: 1,
                    cmd: 'ffmpeg live m2ts',
                },
                0,
            );
            expect(dummyStreamManageModel.start).toHaveBeenCalledWith(dummyLiveStream);
        });

        it('throws ConfigIsUndefined when config mode is missing', async () => {
            await expect(
                model.startLiveM2TsStream({
                    channelId: 1,
                    mode: 99, // 存在しない mode
                }),
            ).rejects.toThrow('ConfigIsUndefined');
        });
    });

    describe('stop, stopAll, keep', () => {
        it('stop delegates to streamManageModel.stop with isForce = false', async () => {
            await model.stop(5);
            expect(dummyStreamManageModel.stop).toHaveBeenCalledWith(5, false);
        });

        it('stopAll delegates to streamManageModel.stopAll', async () => {
            await model.stopAll();
            expect(dummyStreamManageModel.stopAll).toHaveBeenCalledTimes(1);
        });

        it('keep delegates to streamManageModel.keep', () => {
            model.keep(7);
            expect(dummyStreamManageModel.keep).toHaveBeenCalledWith(7);
        });
    });

    describe('getStreamInfos', () => {
        it('returns formatted live stream items with current program information', async () => {
            dummyStreamManageModel.getStreamInfos.mockReturnValue([
                {
                    streamId: 1,
                    info: {
                        type: 'LiveStream',
                        mode: 0,
                        isEnable: true,
                        channelId: 10,
                    },
                },
            ]);

            dummyProgramDB.findChannelIdAndTime.mockResolvedValue({
                name: '現在放映番組',
                halfWidthName: '現在放映番組',
                startAt: 1000,
                endAt: 2000,
                description: '説明',
                halfWidthDescription: '説明',
                extended: '拡張',
                halfWidthExtended: '拡張',
                rawExtended: JSON.stringify({ key: 'val' }),
                rawHalfWidthExtended: JSON.stringify({ key: 'val' }),
            });

            const infos = await model.getStreamInfos(false);

            expect(infos.items.length).toBe(1);
            const item: any = infos.items[0];
            expect(item.streamId).toBe(1);
            expect(item.type).toBe('LiveStream');
            expect(item.name).toBe('現在放映番組');
            expect(item.rawExtended).toEqual({ key: 'val' });
        });

        it('returns formatted video stream items with recorded information', async () => {
            dummyStreamManageModel.getStreamInfos.mockReturnValue([
                {
                    streamId: 2,
                    info: {
                        type: 'RecordedStream',
                        mode: 1,
                        isEnable: true,
                        videoFileId: 50,
                    },
                },
            ]);

            dummyVideoFileDB.findId.mockResolvedValue({
                id: 50,
                recordedId: 200,
            });

            dummyRecordedDB.findId.mockResolvedValue({
                channelId: 5,
                name: '録画番組',
                startAt: 5000,
                endAt: 6000,
                description: '説明',
                halfWidthDescription: '説明',
                extended: '拡張',
                halfWidthExtended: '拡張',
                rawExtended: JSON.stringify({ sub: 'info' }),
                rawHalfWidthExtended: JSON.stringify({ sub: 'info' }),
            });

            const infos = await model.getStreamInfos(false);

            expect(infos.items.length).toBe(1);
            const item: any = infos.items[0];
            expect(item.streamId).toBe(2);
            expect(item.type).toBe('RecordedStream');
            expect(item.recordedId).toBe(200);
            expect(item.name).toBe('録画番組');
            expect(item.viodeFileId).toBe(50);
            expect(item.rawExtended).toEqual({ sub: 'info' });
        });
    });
});
