import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'stream';
import Reserve from '../../src/db/entities/Reserve.js';
import RecordingStreamCreator from '../../src/model/operator/recording/RecordingStreamCreator.js';
import Util from '../../src/util/Util.js';

describe('RecordingStreamCreator Unit Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyMirakurunClient: any;
    let dummyMirakurunClientModel: any;
    let creator: RecordingStreamCreator;
    let sleepSpy: any;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                recording: {
                    priority: {
                        recording: 10,
                        conflict: 5,
                    },
                    timeSpecifiedStartMargin: 1,
                    timeSpecifiedEndMargin: 2,
                },
            }),
        };

        dummyMirakurunClient = {
            priority: 0,
            getProgramStream: vi.fn(),
            getServiceStream: vi.fn(),
            getProgram: vi.fn(),
        };

        dummyMirakurunClientModel = {
            getClient: () => dummyMirakurunClient,
        };

        sleepSpy = vi.spyOn(Util, 'sleep').mockResolvedValue(undefined);

        creator = new RecordingStreamCreator(dummyLogger, dummyConfig, dummyMirakurunClientModel);
    });

    afterEach(() => {
        sleepSpy.mockRestore();
    });

    const createDummyStream = () => {
        const stream = new PassThrough() as any;
        return stream;
    };

    describe('setTuner', () => {
        it('sets tuners once and ignores subsequent setTuner calls', () => {
            const tuners1: any = [{ types: ['GR'] }];
            const tuners2: any = [{ types: ['BS'] }];

            creator.setTuner(tuners1);
            creator.setTuner(tuners2);

            // Access internal tuners array
            const internalTuners = (creator as any).tuners;
            expect(internalTuners).toHaveLength(1);
            expect(internalTuners[0].types).toEqual(['GR']);
        });
    });

    describe('create with program-specified reservation', () => {
        it('assigns available tuner and fetches program stream with normal recording priority', async () => {
            creator.setTuner([
                { types: ['GR'], isAvailable: true, name: 'GR-1' } as any,
                { types: ['BS'], isAvailable: true, name: 'BS-1' } as any,
            ]);

            const mockStream = createDummyStream();
            dummyMirakurunClient.getProgramStream.mockResolvedValue(mockStream);

            const reserve = new Reserve();
            reserve.id = 100;
            reserve.programId = 12345;
            reserve.channelType = 'GR';
            reserve.channel = 'ch27';
            reserve.isConflict = false;

            const stream = await creator.create(reserve);
            expect(stream).toBe(mockStream);
            expect(dummyMirakurunClient.priority).toBe(10);
            expect(dummyMirakurunClient.getProgramStream).toHaveBeenCalledWith({
                id: 12345,
                decode: true,
                signal: undefined,
            });

            // Tuner status check: GR tuner has 1 program
            const tuners = (creator as any).tuners;
            expect(tuners[0].programs).toHaveLength(1);
            expect(tuners[0].programs[0].reserve.id).toBe(100);

            // Emitting end on stream cleans up tuner program
            mockStream.emit('finish');
            mockStream.emit('close');
            mockStream.destroy();
            expect(tuners[0].programs).toHaveLength(0);
        });

        it('reuses tuner when channel is identical (same transponder/service)', async () => {
            creator.setTuner([{ types: ['GR'] } as any]);

            const mockStream1 = createDummyStream();
            const mockStream2 = createDummyStream();
            dummyMirakurunClient.getProgramStream.mockResolvedValueOnce(mockStream1).mockResolvedValueOnce(mockStream2);

            const r1 = new Reserve();
            r1.id = 1;
            r1.programId = 1001;
            r1.channelType = 'GR';
            r1.channel = 'ch27';
            r1.isConflict = false;

            const r2 = new Reserve();
            r2.id = 2;
            r2.programId = 1002;
            r2.channelType = 'GR';
            r2.channel = 'ch27'; // Same channel
            r2.isConflict = false;

            await creator.create(r1);
            await creator.create(r2);

            const tuners = (creator as any).tuners;
            expect(tuners[0].programs).toHaveLength(2);
            expect(tuners[0].programs[0].reserve.id).toBe(1);
            expect(tuners[0].programs[1].reserve.id).toBe(2);
        });

        it('bypasses tuner allocation for conflict reservation and uses conflict priority', async () => {
            creator.setTuner([{ types: ['GR'] } as any]);

            const mockStream = createDummyStream();
            dummyMirakurunClient.getProgramStream.mockResolvedValue(mockStream);

            const reserve = new Reserve();
            reserve.id = 200;
            reserve.programId = 5555;
            reserve.channelType = 'GR';
            reserve.channel = 'ch27';
            reserve.isConflict = true;

            const stream = await creator.create(reserve);
            expect(stream).toBe(mockStream);
            expect(dummyMirakurunClient.priority).toBe(5);

            // Should not be registered in tuner programs
            const tuners = (creator as any).tuners;
            expect(tuners[0].programs).toHaveLength(0);
        });

        it('falls back to direct stream when no tuner can be assigned', async () => {
            // Tuner only supports BS
            creator.setTuner([{ types: ['BS'] } as any]);

            const mockStream = createDummyStream();
            dummyMirakurunClient.getProgramStream.mockResolvedValue(mockStream);

            const reserve = new Reserve();
            reserve.id = 300;
            reserve.programId = 9999;
            reserve.channelType = 'GR'; // Needs GR
            reserve.channel = 'ch27';
            reserve.isConflict = false;

            const stream = await creator.create(reserve);
            expect(stream).toBe(mockStream);

            const tuners = (creator as any).tuners;
            expect(tuners[0].programs).toHaveLength(0);
        });
    });

    describe('time-specified reservation', () => {
        it('throws TimeSpecifiedStreamTimeoutError if endAt is in the past', async () => {
            creator.setTuner([{ types: ['GR'] } as any]);

            const reserve = new Reserve();
            reserve.id = 400;
            reserve.programId = null; // time specified
            reserve.channelType = 'GR';
            reserve.channel = 'ch27';
            reserve.channelId = 10;
            reserve.startAt = Date.now() - 3600000;
            reserve.endAt = Date.now() - 1800000; // past

            await expect(creator.create(reserve)).rejects.toThrow('TimeSpecifiedStreamTimeoutError');
        });

        it('fetches service stream, waits for start time, and schedules auto-destroy timer', async () => {
            creator.setTuner([{ types: ['GR'] } as any]);

            const mockStream = createDummyStream();
            dummyMirakurunClient.getServiceStream.mockResolvedValue(mockStream);

            const now = Date.now();
            const reserve = new Reserve();
            reserve.id = 401;
            reserve.programId = null; // time specified
            reserve.channelType = 'GR';
            reserve.channel = 'ch27';
            reserve.channelId = 10;
            reserve.startAt = now + 5000; // 5s in future
            reserve.endAt = now + 30000; // 30s in future

            const stream = await creator.create(reserve);
            expect(stream).toBe(mockStream);
            expect(dummyMirakurunClient.getServiceStream).toHaveBeenCalledWith({
                id: 10,
                decode: true,
                signal: undefined,
            });

            // Sleep should be called for future startAt
            expect(sleepSpy).toHaveBeenCalled();

            // Timer should be registered
            const timerIndex = (creator as any).timerIndex;
            expect(timerIndex[401]).toBeDefined();

            // Calling changeEndAt updates the timer
            reserve.endAt = now + 60000;
            creator.changeEndAt(reserve);
            expect(timerIndex[401]).toBeDefined();

            // Destroying stream clears timer
            mockStream.emit('end');
            expect(timerIndex[401]).toBeUndefined();
        });

        it('throws StreamChangeAtError when changeEndAt called on non-time-specified or non-active reserve', () => {
            const reserve = new Reserve();
            reserve.id = 500;
            reserve.programId = 123; // not time-specified
            expect(() => creator.changeEndAt(reserve)).toThrow('StreamChangeAtError');

            reserve.programId = null; // time-specified but not registered
            expect(() => creator.changeEndAt(reserve)).toThrow('StreamChangeAtError');
        });
    });
});
