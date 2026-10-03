import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'stream';
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
    let mockGetProgram: any;
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
            emitStartPrepRecording: vi.fn(),
            emitStartRecording: vi.fn(),
            emitFinishRecording: vi.fn(),
            emitRecordingFailed: vi.fn(),
            emitEventRelay: vi.fn(),
        };

        mockGetProgram = vi.fn().mockResolvedValue({
            id: 327370103223696,
            serviceId: 1032,
            eventId: 23696,
            startAt: 1000000,
            duration: 3600000,
            networkId: 32737,
            relatedItems: [], // Deliberately empty in Mirakurun REST API to prove TS direct bypass
        });
        dummyMirakurun = {
            getClient: () => ({
                getProgram: mockGetProgram,
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
        expect(mockGetProgram).not.toHaveBeenCalled();
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

    describe('Subsequent Program Protection (Post-Baseball Delay Handling)', () => {
        it('should reschedule timer in prepRecord when subsequent program is delayed by baseball', async () => {
            vi.useFakeTimers();
            const now = 2000000;
            vi.setSystemTime(now);

            const animeReserve = new Reserve();
            animeReserve.id = 2;
            animeReserve.programId = 327370103223697; // anime after baseball
            animeReserve.channelId = 10;
            animeReserve.channelType = 'GR' as any;
            animeReserve.channel = '27';
            animeReserve.startAt = 2000000 + 10000; // scheduled start in 10s
            animeReserve.endAt = animeReserve.startAt + 1800000; // 30min anime
            animeReserve.name = '夜のアニメ';
            animeReserve.halfWidthName = '夜のアニメ';
            animeReserve.isTimeSpecified = false;

            // Broadcaster delayed the anime by 30 minutes due to baseball extension
            const delayedStartAt = animeReserve.startAt + 1800000; // +30min
            const delayedDuration = 1800000;
            mockGetProgram.mockResolvedValueOnce({
                id: animeReserve.programId,
                serviceId: 1032,
                eventId: 23697,
                startAt: delayedStartAt,
                duration: delayedDuration,
                networkId: 32737,
                name: '夜のアニメ',
            });

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

            (recorder as any).reserve = animeReserve;
            const setTimerSpy = vi.spyOn(recorder, 'setTimer').mockReturnValue(true);

            // Call prepRecord
            await (recorder as any).prepRecord();

            // Reserve startAt and endAt should be updated to delayed time
            expect(animeReserve.startAt).toBe(delayedStartAt);
            expect(animeReserve.endAt).toBe(delayedStartAt + delayedDuration);
            expect(dummyReserveDB.updateOnce).toHaveBeenCalledWith(animeReserve);
            // Timer should be rescheduled cleanly without killing the reservation
            expect(setTimerSpy).toHaveBeenCalledWith(animeReserve, false);

            vi.useRealTimers();
        });

        it('should wait for broadcast stream without premature 5s timeout when preceding baseball extends', async () => {
            vi.useFakeTimers();
            const now = 1000000;
            vi.setSystemTime(now);

            const animeReserve = new Reserve();
            animeReserve.id = 3;
            animeReserve.programId = 327370103223697;
            animeReserve.channelId = 10;
            animeReserve.channelType = 'GR' as any;
            animeReserve.channel = '27';
            animeReserve.startAt = now;
            animeReserve.endAt = now + 1800000; // 30min
            animeReserve.name = '夜のアニメ';
            animeReserve.halfWidthName = '夜のアニメ';
            animeReserve.isTimeSpecified = false;

            mockGetProgram.mockResolvedValue({
                id: animeReserve.programId,
                startAt: now,
                duration: 1800000,
            });

            const tmpRecPath = '/tmp/test_rec_stream.m2ts';
            dummyRecordingUtil.getRecPath = vi.fn().mockResolvedValue({
                fullPath: tmpRecPath,
                subDir: '',
                fileName: 'test_rec_stream.m2ts',
                parendDir: { name: 'main' },
            });
            dummyConfig.getConfig = () => ({
                recording: {
                    directories: [{ name: 'main', path: '/tmp' }],
                    filenameFormat: '%TITLE%',
                    fileExtension: '.m2ts',
                    dropLog: { enabled: false },
                },
            });

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

            const stream = new PassThrough();
            (recorder as any).reserve = animeReserve;
            (recorder as any).stream = stream;

            const doRecordPromise = (recorder as any).doRecord();

            // Advance 5 seconds - legacy EPGStation would have killed the recording here!
            await vi.advanceTimersByTimeAsync(5000);

            // Stream must still be intact and waiting
            expect(stream.destroyed).toBe(false);
            expect(dummyRecordingEvent.emitRecordingFailed).not.toHaveBeenCalled();

            // Mirakurun finishes waiting for baseball and begins sending anime TS packets!
            stream.write(Buffer.from([0x47, 0x00, 0x12, 0x10]));
            await vi.advanceTimersByTimeAsync(100);

            await doRecordPromise;

            // Successfully started recording!
            expect(dummyRecordingEvent.emitStartRecording).toHaveBeenCalled();
            expect((recorder as any).isRecording).toBe(true);

            stream.end();
            try {
                const fs = await import('fs');
                if (fs.existsSync(tmpRecPath)) fs.unlinkSync(tmpRecPath);
            } catch {
                // ignore
            }
            vi.useRealTimers();
        });

        it('should reschedule timer when broadcast delay is updated while waiting for stream', async () => {
            vi.useFakeTimers();
            const now = 1000000;
            vi.setSystemTime(now);

            const animeReserve = new Reserve();
            animeReserve.id = 4;
            animeReserve.programId = 327370103223697;
            animeReserve.channelId = 10;
            animeReserve.channelType = 'GR' as any;
            animeReserve.channel = '27';
            animeReserve.startAt = now;
            animeReserve.endAt = now + 1800000;
            animeReserve.name = '夜のアニメ';
            animeReserve.halfWidthName = '夜のアニメ';
            animeReserve.isTimeSpecified = false;

            // Delayed by 30 minutes in Mirakurun
            const delayedStartAt = now + 1800000;
            const delayedDuration = 1800000;
            mockGetProgram.mockResolvedValue({
                id: animeReserve.programId,
                startAt: delayedStartAt,
                duration: delayedDuration,
            });

            const tmpRecPath = '/tmp/test_rec_delay_stream.m2ts';
            dummyRecordingUtil.getRecPath = vi.fn().mockResolvedValue({
                fullPath: tmpRecPath,
                subDir: '',
                fileName: 'test_rec_delay_stream.m2ts',
                parendDir: { name: 'main' },
            });
            dummyConfig.getConfig = () => ({
                recording: {
                    directories: [{ name: 'main', path: '/tmp' }],
                    filenameFormat: '%TITLE%',
                    fileExtension: '.m2ts',
                    dropLog: { enabled: false },
                },
            });

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

            const stream = new PassThrough();
            (recorder as any).reserve = animeReserve;
            (recorder as any).stream = stream;
            const setTimerSpy = vi.spyOn(recorder, 'setTimer').mockReturnValue(true);

            const doRecordPromise = (recorder as any).doRecord();

            // Advance 5 seconds - trigger checkStreamTimeout
            await vi.advanceTimersByTimeAsync(5000);
            await doRecordPromise;

            // Should cleanly update reserve times and reschedule timer to delayed time
            expect(animeReserve.startAt).toBe(delayedStartAt);
            expect(animeReserve.endAt).toBe(delayedStartAt + delayedDuration);
            expect(dummyReserveDB.updateOnce).toHaveBeenCalledWith(animeReserve);
            expect(setTimerSpy).toHaveBeenCalledWith(animeReserve, false);

            // Stream and temporary file should be cleaned up
            expect(stream.destroyed).toBe(true);

            vi.useRealTimers();
        });
    });
});
