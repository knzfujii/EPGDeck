import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EitInfo } from 'arib-probe';
import RecorderModel from '../../src/model/operator/recording/RecorderModel.js';
import Reserve from '../../src/db/entities/Reserve.js';

describe('RecorderModel EIT Broadcast Tracking Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyProgramDB: any;
    let dummyReserveDB: any;
    let dummyRecordedDB: any;
    let dummyStreamCreator: any;
    let dummyDropChecker: any;
    let dummyRecordingUtil: any;
    let dummyRecordingEvent: any;
    let dummyMirakurun: any;
    let eitHandler: ((eit: EitInfo) => void) | null = null;

    beforeEach(() => {
        eitHandler = null;

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
                stream: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                recording: {
                    directories: [{ name: 'main', path: '/recorded' }],
                    filenameFormat: '%TITLE%',
                    fileExtension: '.m2ts',
                    dropLog: {
                        enabled: true,
                        path: '/tmp/droplog',
                    },
                },
            }),
        };

        dummyProgramDB = {
            findChannelIdAndTime: vi.fn(),
            findEventRelayProgram: vi.fn().mockResolvedValue({
                id: 327370103323697,
                serviceId: 1033,
                eventId: 23697,
            }),
        };

        dummyReserveDB = {
            updateOnce: vi.fn().mockResolvedValue(undefined),
        };

        dummyRecordedDB = {
            findId: vi.fn(),
            insertOnce: vi.fn().mockResolvedValue(42),
            updateProgramInfo: vi.fn().mockResolvedValue(undefined),
            removeRecording: vi.fn().mockResolvedValue(undefined),
        };

        dummyStreamCreator = {
            changeEndAt: vi.fn(),
        };

        dummyDropChecker = {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined),
            getFilePath: vi.fn().mockReturnValue('/tmp/droplog/test.log'),
            getResult: vi.fn().mockResolvedValue({}),
            on: vi.fn((event: string, handler: any) => {
                if (event === 'eit') {
                    eitHandler = handler;
                }
            }),
            off: vi.fn(),
        };

        dummyRecordingUtil = {
            getRecPath: vi.fn().mockResolvedValue({
                fullPath: '/recorded/test.m2ts',
                subDir: '',
                fileName: 'test.m2ts',
                parendDir: { name: 'main' },
            }),
        };

        dummyRecordingEvent = {
            emitStartRecording: vi.fn(),
            emitFinishRecording: vi.fn(),
            emitRecordingFailed: vi.fn(),
            emitEventRelay: vi.fn(),
        };

        dummyMirakurun = {
            getClient: () => ({
                getProgram: vi.fn().mockResolvedValue({
                    id: 327370103223696,
                    serviceId: 1032,
                    eventId: 23696,
                    startAt: 1000000,
                    duration: 3600000,
                    networkId: 32737,
                    relatedItems: [{ type: 'relay', serviceId: 1033, eventId: 23697 }],
                }),
            }),
        };
    });

    const createReserve = (): Reserve => {
        const r = new Reserve();
        r.id = 1;
        // Mirakurun format: networkId 32737, serviceId 1032 (0x0408), eventId 23696 (0x5C90)
        r.programId = 327370103223696;
        r.channelId = 10;
        r.channelType = 'GR' as any;
        r.channel = '27';
        r.startAt = 1000000;
        r.endAt = 4600000; // 1h duration
        r.name = 'プロ野球中継';
        r.halfWidthName = 'プロ野球中継';
        r.isTimeSpecified = false;
        return r;
    };

    it('should register eit listener and handle program extension from broadcast TS stream', async () => {
        const reserve = createReserve();
        const recorder = new RecorderModel(
            dummyLogger,
            dummyConfig,
            dummyProgramDB,
            dummyReserveDB,
            dummyRecordedDB,
            {} as any,
            { insertOnce: vi.fn().mockResolvedValue(1) } as any,
            { insertOnce: vi.fn().mockResolvedValue(1) } as any,
            dummyStreamCreator,
            dummyDropChecker,
            dummyRecordingUtil,
            dummyRecordingEvent,
            dummyMirakurun,
        );

        // Start recording
        (recorder as any).reserve = reserve;
        (recorder as any).isRecording = true;
        (recorder as any).recordedId = 42;

        // Simulate dropChecker attaching listener
        recorder['dropChecker'].on('eit', (recorder as any).onEit);
        expect(eitHandler).not.toBeNull();

        // Broadcast stream emits EIT present event with extended duration
        // Original: start 1000000, duration 3600s -> end 4600000
        // Extended: start 1000000, duration 5400s -> end 6400000 (+1800s / 30min)
        const extendedEit: EitInfo = {
            serviceId: 1032,
            events: [
                {
                    eventId: 23696,
                    startTime: new Date(1000000),
                    duration: 5400,
                    name: 'プロ野球中継',
                    description: '',
                    isCurrent: true,
                },
            ],
        };

        eitHandler!(extendedEit);

        // Verify reserve.endAt is extended
        expect(reserve.endAt).toBe(6400000);

        // Verify DB updates
        expect(dummyReserveDB.updateOnce).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 1,
                endAt: 6400000,
            }),
        );
        expect(dummyRecordedDB.updateProgramInfo).toHaveBeenCalledWith(42, {
            endAt: 6400000,
            duration: 5400000,
        });
    });

    it('should update title and halfWidthName when EIT event title changes', async () => {
        const reserve = createReserve();
        const recorder = new RecorderModel(
            dummyLogger,
            dummyConfig,
            dummyProgramDB,
            dummyReserveDB,
            dummyRecordedDB,
            {} as any,
            {} as any,
            {} as any,
            dummyStreamCreator,
            dummyDropChecker,
            dummyRecordingUtil,
            dummyRecordingEvent,
            dummyMirakurun,
        );

        (recorder as any).reserve = reserve;
        (recorder as any).isRecording = true;
        (recorder as any).recordedId = 42;

        recorder['dropChecker'].on('eit', (recorder as any).onEit);

        const titleChangeEit: EitInfo = {
            serviceId: 1032,
            events: [
                {
                    eventId: 23696,
                    startTime: new Date(1000000),
                    duration: 3600,
                    name: 'プロ野球中継「巨人×阪神」[延]',
                    description: '',
                    isCurrent: true,
                },
            ],
        };

        eitHandler!(titleChangeEit);

        expect(reserve.name).toBe('プロ野球中継「巨人×阪神」[延]');
        expect(reserve.halfWidthName).toBe('プロ野球中継「巨人×阪神」[延]');
        expect(dummyReserveDB.updateOnce).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'プロ野球中継「巨人×阪神」[延]',
            }),
        );
        expect(dummyRecordedDB.updateProgramInfo).toHaveBeenCalledWith(42, {
            name: 'プロ野球中継「巨人×阪神」[延]',
            halfWidthName: 'プロ野球中継「巨人×阪神」[延]',
        });
    });

    it('should immediately trigger checkEventRelay when EIT descriptor announces relay', async () => {
        const reserve = createReserve();
        const recorder = new RecorderModel(
            dummyLogger,
            dummyConfig,
            dummyProgramDB,
            dummyReserveDB,
            dummyRecordedDB,
            {} as any,
            {} as any,
            {} as any,
            dummyStreamCreator,
            dummyDropChecker,
            dummyRecordingUtil,
            dummyRecordingEvent,
            dummyMirakurun,
        );

        (recorder as any).reserve = reserve;
        (recorder as any).isRecording = true;
        (recorder as any).recordedId = 42;

        recorder['dropChecker'].on('eit', (recorder as any).onEit);

        const relayEit: EitInfo = {
            serviceId: 1032,
            events: [
                {
                    eventId: 23696,
                    startTime: new Date(1000000),
                    duration: 3600,
                    name: 'プロ野球中継',
                    description: '',
                    isCurrent: true,
                    relatedItems: [
                        {
                            type: 'relay',
                            serviceId: 1033,
                            eventId: 23697,
                        },
                    ],
                },
            ],
        };

        eitHandler!(relayEit);

        // checkEventRelay calls dummyRecordingEvent.emitEventRelay asynchronously
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(dummyRecordingEvent.emitEventRelay).toHaveBeenCalledWith([
            expect.objectContaining({
                programId: 327370103323697,
            }),
        ]);
    });

    it('should ignore EIT from different serviceId or eventId', async () => {
        const reserve = createReserve();
        const recorder = new RecorderModel(
            dummyLogger,
            dummyConfig,
            dummyProgramDB,
            dummyReserveDB,
            dummyRecordedDB,
            {} as any,
            {} as any,
            {} as any,
            dummyStreamCreator,
            dummyDropChecker,
            dummyRecordingUtil,
            dummyRecordingEvent,
            dummyMirakurun,
        );

        (recorder as any).reserve = reserve;
        (recorder as any).isRecording = true;
        (recorder as any).recordedId = 42;

        recorder['dropChecker'].on('eit', (recorder as any).onEit);

        // Different service (serviceId 1039 instead of 1032)
        eitHandler!({
            serviceId: 1039,
            events: [
                {
                    eventId: 23696,
                    startTime: new Date(1000000),
                    duration: 7200,
                    name: '別チャンネル番組',
                    description: '',
                    isCurrent: true,
                },
            ],
        });

        // Different eventId (eventId 99999 instead of 23696)
        eitHandler!({
            serviceId: 1032,
            events: [
                {
                    eventId: 99999,
                    startTime: new Date(1000000),
                    duration: 7200,
                    name: '別番組',
                    description: '',
                    isCurrent: true,
                },
            ],
        });

        expect(reserve.endAt).toBe(4600000);
        expect(dummyReserveDB.updateOnce).not.toHaveBeenCalled();
        expect(dummyRecordedDB.updateProgramInfo).not.toHaveBeenCalled();
    });
});
