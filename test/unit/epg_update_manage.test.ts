import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EPGUpdateManageModel from '../../src/model/epgUpdater/EPGUpdateManageModel.js';
import { EPGUpdateEvent, TunerServerType } from '../../src/model/epgUpdater/IEPGUpdateManageModel.js';

describe('EPGUpdateManageModel Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyMirakurunClient: any;
    let dummyMirakurunClientModel: any;
    let dummyChannelDB: any;
    let dummyProgramDB: any;

    beforeEach(() => {
        vi.restoreAllMocks();

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                epg: {},
                server: { mirakurun: 'http://localhost:40772' },
            }),
        };

        dummyMirakurunClient = {
            getServices: vi.fn().mockResolvedValue([]),
            getPrograms: vi.fn().mockResolvedValue([]),
            getServerConfig: vi.fn().mockResolvedValue({}),
            getEventsStream: vi.fn().mockResolvedValue({
                once: vi.fn(),
                on: vi.fn(),
                destroy: vi.fn(),
                push: vi.fn(),
                removeAllListeners: vi.fn(),
            }),
        };

        dummyMirakurunClientModel = {
            getClient: () => dummyMirakurunClient,
        };

        dummyChannelDB = {
            insert: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        dummyProgramDB = {
            deleteOld: vi.fn().mockResolvedValue(undefined),
            insert: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };
    });

    const createModel = (configOverrides: any = {}) => {
        dummyConfig.getConfig = () => ({
            epg: {},
            server: { mirakurun: 'http://localhost:40772' },
            ...configOverrides,
        });
        return new EPGUpdateManageModel(
            dummyLogger,
            dummyConfig,
            dummyMirakurunClientModel,
            dummyChannelDB,
            dummyProgramDB,
        );
    };

    describe('deleteOldPrograms', () => {
        it('should delete programs older than 24 hours ago', async () => {
            const model = createModel();
            const beforeTime = Date.now();
            await model.deleteOldPrograms();
            const afterTime = Date.now();

            expect(dummyProgramDB.deleteOld).toHaveBeenCalledTimes(1);
            const deleteTimeArg = dummyProgramDB.deleteOld.mock.calls[0][0];

            const KEEP_PERIOD_MS = 24 * 60 * 60 * 1000;
            expect(deleteTimeArg).toBeGreaterThanOrEqual(beforeTime - KEEP_PERIOD_MS);
            expect(deleteTimeArg).toBeLessThanOrEqual(afterTime - KEEP_PERIOD_MS);
        });
    });

    describe('isMainProgram', () => {
        it('returns true when relatedItems is undefined or empty', () => {
            const model = createModel();
            const isMain = (model as any).isMainProgram.bind(model);

            expect(isMain({ id: 1, eventId: 100, serviceId: 10 } as any)).toBe(true);
            expect(isMain({ id: 1, eventId: 100, serviceId: 10, relatedItems: [] } as any)).toBe(true);
        });

        it('returns true when related item type is undefined (Mirakurun <= 3.8 compatibility)', () => {
            const model = createModel();
            const isMain = (model as any).isMainProgram.bind(model);

            expect(
                isMain({
                    id: 1,
                    eventId: 100,
                    serviceId: 10,
                    relatedItems: [{ networkId: 1, serviceId: 10, eventId: 100 }],
                } as any),
            ).toBe(true);
        });

        it('returns true when related item type is movement', () => {
            const model = createModel();
            const isMain = (model as any).isMainProgram.bind(model);

            expect(
                isMain({
                    id: 1,
                    eventId: 100,
                    serviceId: 10,
                    relatedItems: [{ type: 'movement', networkId: 1, serviceId: 10, eventId: 100 }],
                } as any),
            ).toBe(true);
        });

        it('returns true when related item is only relay', () => {
            const model = createModel();
            const isMain = (model as any).isMainProgram.bind(model);

            expect(
                isMain({
                    id: 1,
                    eventId: 100,
                    serviceId: 10,
                    relatedItems: [{ type: 'relay', networkId: 1, serviceId: 20, eventId: 200 }],
                } as any),
            ).toBe(true);
        });

        it('returns true for main program when shared type matches own eventId and serviceId', () => {
            const model = createModel();
            const isMain = (model as any).isMainProgram.bind(model);

            expect(
                isMain({
                    id: 1,
                    eventId: 100,
                    serviceId: 10,
                    relatedItems: [{ type: 'shared', networkId: 1, serviceId: 10, eventId: 100 }],
                } as any),
            ).toBe(true);
        });

        it('returns false for sub-channel program when shared type points to different serviceId/eventId', () => {
            const model = createModel();
            const isMain = (model as any).isMainProgram.bind(model);

            expect(
                isMain({
                    id: 2,
                    eventId: 101,
                    serviceId: 11, // サブチャンネル側
                    relatedItems: [{ type: 'shared', networkId: 1, serviceId: 10, eventId: 100 }], // メイン側を参照
                } as any),
            ).toBe(false);
        });

        it('returns false when related items contain both relay and non-matching shared', () => {
            const model = createModel();
            const isMain = (model as any).isMainProgram.bind(model);

            expect(
                isMain({
                    id: 2,
                    eventId: 101,
                    serviceId: 11,
                    relatedItems: [
                        { type: 'relay', networkId: 1, serviceId: 30, eventId: 300 },
                        { type: 'shared', networkId: 1, serviceId: 10, eventId: 100 },
                    ],
                } as any),
            ).toBe(false);
        });
    });

    describe('updateChannels', () => {
        it('fetches services, filters excluded channels/sids, and updates channelDB and index', async () => {
            const model = createModel({
                epg: {
                    excludeChannels: [99],
                    excludeSids: [999],
                },
            });

            const dummyServices = [
                {
                    id: 1,
                    serviceId: 101,
                    networkId: 32736,
                    name: 'NHK総合',
                    channel: { type: 'GR', channel: '27' },
                },
                {
                    id: 99, // excludeChannels に該当
                    serviceId: 102,
                    networkId: 32736,
                    name: 'Excluded Ch',
                    channel: { type: 'GR', channel: '27' },
                },
                {
                    id: 2,
                    serviceId: 999, // excludeSids に該当
                    networkId: 32736,
                    name: 'Excluded Sid',
                    channel: { type: 'GR', channel: '28' },
                },
            ];

            dummyMirakurunClient.getServices.mockResolvedValue(dummyServices);

            await model.updateChannels();

            expect(dummyMirakurunClient.getServices).toHaveBeenCalledTimes(1);
            expect(dummyChannelDB.insert).toHaveBeenCalledTimes(1);

            const inserted = dummyChannelDB.insert.mock.calls[0][0];
            expect(inserted).toHaveLength(1);
            expect(inserted[0].id).toBe(1);

            // channelIndex の検証
            const channelIndex = (model as any).channelIndex;
            expect(channelIndex[32736][101]).toEqual({
                id: 1,
                type: 'GR',
                channel: '27',
            });
            expect(channelIndex[32736][102]).toBeUndefined();
        });

        it('throws when getServices fails', async () => {
            const model = createModel();
            dummyMirakurunClient.getServices.mockRejectedValue(new Error('NetworkError'));

            await expect(model.updateChannels()).rejects.toThrow('NetworkError');
        });
    });

    describe('updateAll', () => {
        it('updates channels and inserts only main programs into programDB', async () => {
            const model = createModel();
            dummyMirakurunClient.getServices.mockResolvedValue([]);

            const mainProgram = {
                id: 1001,
                eventId: 1,
                serviceId: 101,
                name: 'Main News',
            };
            const subProgram = {
                id: 1002,
                eventId: 2,
                serviceId: 102,
                name: 'Sub Broadcast',
                relatedItems: [{ type: 'shared', eventId: 1, serviceId: 101 }],
            };

            dummyMirakurunClient.getPrograms.mockResolvedValue([mainProgram, subProgram]);

            await model.updateAll();

            expect(dummyProgramDB.insert).toHaveBeenCalledTimes(1);
            const insertedPrograms = dummyProgramDB.insert.mock.calls[0][1];
            expect(insertedPrograms).toHaveLength(1);
            expect(insertedPrograms[0].id).toBe(1001);
        });

        it('throws and propagates error when getPrograms fails', async () => {
            const model = createModel();
            dummyMirakurunClient.getServices.mockResolvedValue([]);
            dummyMirakurunClient.getPrograms.mockRejectedValue(new Error('GetProgramsFailed'));

            await expect(model.updateAll()).rejects.toThrow('GetProgramsFailed');
        });
    });

    describe('checkTunerServerType', () => {
        it('identifies mirakurun when getServerConfig succeeds and caches the result', async () => {
            const model = createModel();
            dummyMirakurunClient.getServerConfig.mockResolvedValue({ version: '3.9.0' });

            const type1 = await model.checkTunerServerType();
            expect(type1).toBe(TunerServerType.mirakurun);

            const type2 = await model.checkTunerServerType();
            expect(type2).toBe(TunerServerType.mirakurun);
            expect(dummyMirakurunClient.getServerConfig).toHaveBeenCalledTimes(1); // キャッシュされる
        });

        it('falls back to mirakc when getServerConfig throws', async () => {
            const model = createModel();
            dummyMirakurunClient.getServerConfig.mockRejectedValue(new Error('404 Not Found'));

            const type = await model.checkTunerServerType();
            expect(type).toBe(TunerServerType.mirakc);
        });
    });

    describe('saveProgram', () => {
        it('does nothing when programQueue is empty', async () => {
            const model = createModel();
            await model.saveProgram();

            expect(dummyProgramDB.update).not.toHaveBeenCalled();
        });

        it('processes and reconciles create, update, and remove events when timeThreshold is 0', async () => {
            const model = createModel();
            const programUpdatedListener = vi.fn();
            model.on(EPGUpdateEvent.PROGRAM_UPDATED, programUpdatedListener);

            // イベントをキューに注入
            (model as any).programQueue = [
                {
                    type: 'create',
                    data: { id: 101, eventId: 1, serviceId: 10, name: 'Program 1', startAt: 1000 },
                },
                {
                    type: 'update',
                    data: { id: 101, eventId: 1, serviceId: 10, name: 'Program 1 Updated', startAt: 1000 },
                },
                {
                    type: 'create',
                    data: { id: 102, eventId: 2, serviceId: 10, name: 'Program 2', startAt: 2000 },
                },
                {
                    type: 'remove',
                    data: { id: 102 },
                },
            ];

            await model.saveProgram(0);

            expect(dummyProgramDB.update).toHaveBeenCalledTimes(1);
            const updateArg = dummyProgramDB.update.mock.calls[0][1];

            // 101 は update に残り、102 は remove されたため delete に入る
            expect(updateArg.update).toHaveLength(1);
            expect(updateArg.update[0].id).toBe(101);
            expect(updateArg.update[0].name).toBe('Program 1 Updated');

            expect(updateArg.delete).toHaveLength(1);
            expect(updateArg.delete[0]).toBe(102);

            expect(programUpdatedListener).toHaveBeenCalledTimes(1);
            expect((model as any).programQueue).toHaveLength(0);
        });

        it('re-queues items when timeThreshold is specified and programs start after the threshold', async () => {
            const model = createModel();

            (model as any).programQueue = [
                {
                    type: 'create',
                    data: { id: 201, eventId: 1, serviceId: 10, name: 'Future Program', startAt: 50000 },
                },
            ];

            // timeThreshold = 10000（startAt 50000 は閾値より未来なので保存せずキューに戻す）
            await model.saveProgram(10000);

            expect(dummyProgramDB.update).not.toHaveBeenCalled();
            expect((model as any).programQueue).toHaveLength(1);
            expect((model as any).programQueue[0].data.id).toBe(201);
        });

        it('restores queue when programDB.update throws an error', async () => {
            const model = createModel();
            dummyProgramDB.update.mockRejectedValue(new Error('DBWriteError'));

            const initialQueue = [
                {
                    type: 'create',
                    data: { id: 301, eventId: 1, serviceId: 10, name: 'Failing Program', startAt: 1000 },
                },
            ];
            (model as any).programQueue = [...initialQueue];

            await expect(model.saveProgram(0)).rejects.toThrow('DBWriteError');

            // キューが元に戻されていること
            expect((model as any).programQueue).toHaveLength(1);
            expect((model as any).programQueue[0].data.id).toBe(301);
        });
    });

    describe('saveService', () => {
        it('does nothing when serviceQueue is empty', async () => {
            const model = createModel();
            await model.saveService();

            expect(dummyChannelDB.update).not.toHaveBeenCalled();
        });

        it('attaches hasLogoData from getServices and updates channelDB', async () => {
            const model = createModel();
            const serviceUpdatedListener = vi.fn();
            model.on(EPGUpdateEvent.SERVICE_UPDATED, serviceUpdatedListener);

            dummyMirakurunClient.getServices.mockResolvedValue([{ id: 1, serviceId: 101, hasLogoData: true }]);

            (model as any).serviceQueue = [
                {
                    type: 'create',
                    data: { id: 1, serviceId: 101, networkId: 32736, name: 'NHK総合' },
                },
            ];

            await model.saveService();

            expect(dummyChannelDB.update).toHaveBeenCalledTimes(1);
            const updateArg = dummyChannelDB.update.mock.calls[0][0];

            expect(updateArg.insert).toHaveLength(1);
            expect(updateArg.insert[0].hasLogoData).toBe(true);
            expect(serviceUpdatedListener).toHaveBeenCalledTimes(1);
            expect((model as any).serviceQueue).toHaveLength(0);
        });
    });

    describe('start and error resilience', () => {
        it('handles getEventsStream failure safely without TypeError and throws original error', async () => {
            const model = createModel();
            dummyMirakurunClient.getServerConfig.mockResolvedValue({});
            dummyMirakurunClient.getEventsStream.mockRejectedValue(new Error('ConnectionRefused'));

            // TypeError: Cannot read properties of undefined (reading 'destroy') が出ずに
            // 元の ConnectionRefused が throw されることを検証
            await expect(model.start()).rejects.toThrow('ConnectionRefused');
        });
    });
});
