import 'reflect-metadata';
import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reserve from '../../src/db/entities/Reserve.js';
import RecorderModel from '../../src/model/operator/recording/RecorderModel.js';
import RecordingUtilModel from '../../src/model/operator/recording/RecordingUtilModel.js';

describe('RecorderModel createRecorded & RecordingUtilModel Tests', () => {
    let dummyLogger: any;
    let dummySystemLog: any;
    let dummyConfig: any;
    let dummyProgramDB: any;
    let dummyChannelDB: any;

    beforeEach(() => {
        vi.restoreAllMocks();

        dummySystemLog = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            fatal: vi.fn(),
        };

        dummyLogger = {
            getLogger: () => ({
                system: dummySystemLog,
                stream: { fatal: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                recording: {
                    directories: [{ name: 'main', path: '/recorded' }],
                    filenameFormat: '%TITLE%',
                    fileExtension: '.m2ts',
                },
            }),
        };

        dummyProgramDB = {
            findChannelIdAndTime: vi.fn(),
        };

        dummyChannelDB = {
            findId: vi.fn().mockResolvedValue({
                id: 1,
                name: 'Ch1',
                halfWidthName: 'Ch1',
                serviceId: 101,
                channelType: 'GR',
                channel: '27',
            }),
        };
    });

    const createRecorder = (reserve: Reserve) => {
        const recorder = new RecorderModel(
            dummyLogger,
            dummyConfig,
            dummyProgramDB,
            {} as any, // reserveDB
            {} as any, // recordedDB
            {} as any, // recordedHistoryDB
            {} as any, // videoFileDB
            {} as any, // dropLogFileDB
            {} as any, // streamCreator
            {
                start: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn().mockResolvedValue(undefined),
                getFilePath: vi.fn().mockReturnValue(null),
                getResult: vi.fn().mockResolvedValue({}),
                on: vi.fn(),
                off: vi.fn(),
            } as any, // dropChecker
            {} as any, // recordingUtil
            {} as any, // recordingEvent
            {} as any, // mirakurunClientModel
        );

        (recorder as any).reserve = reserve;
        (recorder as any).isRecording = false;

        return recorder;
    };

    describe('RecorderModel.createRecorded', () => {
        it('should use program name from EPG when program is found for time-specified reservation', async () => {
            const reserve = new Reserve();
            reserve.id = 1;
            reserve.isTimeSpecified = true;
            reserve.name = 'ユーザー指定タイトル（aaa）';
            reserve.halfWidthName = 'ユーザー指定タイトル（aaa）';
            reserve.channelId = 1;
            reserve.startAt = 1000;
            reserve.endAt = 2000;

            dummyProgramDB.findChannelIdAndTime.mockResolvedValue({
                name: '実際に放送された番組名（ニュース）',
                halfWidthName: '実際に放送された番組名（ニュース）',
                description: '番組詳細',
                halfWidthDescription: '番組詳細',
            });

            const recorder = createRecorder(reserve);
            const recorded = await (recorder as any).createRecorded();

            expect(recorded.name).toBe('実際に放送された番組名（ニュース）');
            expect(recorded.description).toBe('番組詳細');
        });

        it('should fallback to reserve name when program is NOT found in EPG for time-specified reservation', async () => {
            const reserve = new Reserve();
            reserve.id = 2;
            reserve.isTimeSpecified = true;
            reserve.name = 'aaa';
            reserve.halfWidthName = 'aaa';
            reserve.channelId = 1;
            reserve.startAt = 1000;
            reserve.endAt = 2000;

            // EPG に番組が存在しない
            dummyProgramDB.findChannelIdAndTime.mockResolvedValue(null);

            const recorder = createRecorder(reserve);
            const recorded = await (recorder as any).createRecorded();

            // 空文字ではなく予約時のタイトル 'aaa' にフォールバックされること
            expect(recorded.name).toBe('aaa');
            expect(recorded.halfWidthName).toBe('aaa');
        });
    });

    describe('RecordingUtilModel.formatFilePathString', () => {
        it('should fallback to reserve name when program is NOT found in EPG for time-specified reservation', async () => {
            const util = new RecordingUtilModel(
                dummyLogger,
                dummyConfig,
                {} as any,
                dummyChannelDB,
                dummyProgramDB,
                {} as any,
                {} as any,
            );

            const reserve = new Reserve();
            reserve.id = 3;
            reserve.isTimeSpecified = true;
            reserve.name = 'aaa';
            reserve.channelId = 1;
            reserve.startAt = new Date('2026-09-21T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-21T10:30:00+09:00').getTime();

            dummyProgramDB.findChannelIdAndTime.mockResolvedValue(null);

            const formatted = await util.formatFilePathString('%YEAR%_%TITLE%', reserve);
            expect(formatted).toBe('2026_aaa');
        });

        it('should use program name when found in EPG for time-specified reservation', async () => {
            const util = new RecordingUtilModel(
                dummyLogger,
                dummyConfig,
                {} as any,
                dummyChannelDB,
                dummyProgramDB,
                {} as any,
                {} as any,
            );

            const reserve = new Reserve();
            reserve.id = 4;
            reserve.isTimeSpecified = true;
            reserve.name = 'aaa';
            reserve.channelId = 1;
            reserve.startAt = new Date('2026-09-21T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-21T10:30:00+09:00').getTime();

            dummyProgramDB.findChannelIdAndTime.mockResolvedValue({
                name: '実際の番組名',
            });

            const formatted = await util.formatFilePathString('%YEAR%_%TITLE%', reserve);
            expect(formatted).toBe('2026_実際の番組名');
        });
    });

    describe('RecorderModel Lifecycle & Graceful Shutdown (stop, finish, cancel)', () => {
        let dummyReserveDB: any;
        let dummyRecordedDB: any;
        let dummyRecordedHistoryDB: any;
        let dummyRecordingUtil: any;
        let dummyRecordingEvent: any;
        let dummyDropChecker: any;
        let dummyDropLogFileDB: any;

        beforeEach(() => {
            dummyReserveDB = { findId: vi.fn() };
            dummyRecordedDB = {
                removeRecording: vi.fn().mockResolvedValue(undefined),
                findId: vi.fn().mockResolvedValue({
                    id: 10,
                    channelId: 1,
                    endAt: 2000,
                    halfWidthName: 'テスト番組 [二]',
                }),
            };
            dummyRecordedHistoryDB = {
                insertOnce: vi.fn().mockResolvedValue(undefined),
            };
            dummyRecordingUtil = {
                movingFromTmp: vi.fn().mockResolvedValue('/final/path.ts'),
                updateVideoFileSize: vi.fn().mockResolvedValue(undefined),
            };
            dummyRecordingEvent = {
                emitCancelPrepRecording: vi.fn(),
                emitFinishRecording: vi.fn(),
                emitRecordingFailed: vi.fn(),
            };
            dummyDropChecker = {
                stop: vi.fn().mockResolvedValue(undefined),
                getResult: vi.fn().mockResolvedValue({}),
                getFilePath: vi.fn().mockReturnValue(null),
            };
            dummyDropLogFileDB = {
                updateCnt: vi.fn().mockResolvedValue(undefined),
            };
        });

        const createFullRecorder = (reserve: Reserve) => {
            const recorder = new RecorderModel(
                dummyLogger,
                dummyConfig,
                dummyProgramDB,
                dummyReserveDB,
                dummyRecordedDB,
                dummyRecordedHistoryDB,
                {} as any, // videoFileDB
                dummyDropLogFileDB,
                {} as any, // streamCreator
                dummyDropChecker,
                dummyRecordingUtil,
                dummyRecordingEvent,
                {} as any, // mirakurunClientModel
            );

            (recorder as any).reserve = reserve;
            return recorder;
        };

        const createMockStreamAndFile = () => {
            const mockStream = {
                unpipe: vi.fn(),
                destroy: vi.fn(),
                push: vi.fn(),
                removeAllListeners: vi.fn(),
                destroyed: false,
            };
            const mockRecFile = Object.assign(new EventEmitter(), {
                end: vi.fn(function (this: any) {
                    setImmediate(() => {
                        this.emit('finish');
                        this.emit('close');
                    });
                }),
                closed: false,
                destroyed: false,
            });
            return { mockStream, mockRecFile };
        };

        it('stops active recording cleanly on stop() without deleting reservation or emitting failed event', async () => {
            const reserve = new Reserve();
            reserve.id = 100;
            reserve.startAt = Date.now() - 30000;
            reserve.endAt = Date.now() + 60000;

            const recorder = createFullRecorder(reserve);
            const { mockStream, mockRecFile } = createMockStreamAndFile();

            (recorder as any).isRecording = true;
            (recorder as any).actualStartAt = Date.now() - 20000;
            (recorder as any).recordedId = 10;
            (recorder as any).videoFileId = 100;
            (recorder as any).videoFileFulPath = '/path/test.ts';
            (recorder as any).stream = mockStream;
            (recorder as any).recFile = mockRecFile;

            await recorder.stop();

            // Stream and file should be cleanly ended & flushed
            expect(mockStream.unpipe).toHaveBeenCalled();
            expect(mockStream.destroy).toHaveBeenCalled();
            expect(mockRecFile.end).toHaveBeenCalled();

            // DB should be updated with actual duration
            expect(dummyRecordedDB.removeRecording).toHaveBeenCalledWith(
                10,
                expect.any(Number),
                expect.any(Number),
                undefined,
            );
            expect(recorder.isRecording).toBe(false);
            expect(dummyRecordingUtil.updateVideoFileSize).toHaveBeenCalledWith(100);

            // Shutdown/stop must not record history, must not emit failure, and must not trigger finish recording jobs
            expect(dummyRecordedHistoryDB.insertOnce).not.toHaveBeenCalled();
            expect(dummyRecordingEvent.emitRecordingFailed).not.toHaveBeenCalled();
            expect(dummyRecordingEvent.emitFinishRecording).not.toHaveBeenCalled();
        });

        it('saves and marks completed on finish() with history and reservation deletion', async () => {
            const reserve = new Reserve();
            reserve.id = 200;
            reserve.isTimeSpecified = false;
            reserve.isEventRelay = false;
            reserve.startAt = Date.now() - 30000;
            reserve.endAt = Date.now() + 60000;

            const recorder = createFullRecorder(reserve);
            const { mockStream, mockRecFile } = createMockStreamAndFile();

            (recorder as any).isRecording = true;
            (recorder as any).actualStartAt = Date.now() - 20000;
            (recorder as any).recordedId = 20;
            (recorder as any).videoFileId = 200;
            (recorder as any).videoFileFulPath = '/path/test2.ts';
            (recorder as any).stream = mockStream;
            (recorder as any).recFile = mockRecFile;

            await recorder.finish();

            expect(mockStream.unpipe).toHaveBeenCalled();
            expect(mockRecFile.end).toHaveBeenCalled();
            expect(dummyRecordedDB.removeRecording).toHaveBeenCalledWith(
                20,
                expect.any(Number),
                expect.any(Number),
                undefined,
            );
            expect(dummyRecordedHistoryDB.insertOnce).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'テスト番組',
                    channelId: 1,
                    endAt: 2000,
                }),
            );
            expect(dummyRecordingEvent.emitFinishRecording).toHaveBeenCalledWith(
                reserve,
                expect.objectContaining({ id: 10 }),
                true,
            );
        });

        it('instantly cancels retry timer on stop() without hanging', async () => {
            const reserve = new Reserve();
            reserve.id = 250;
            const recorder = createFullRecorder(reserve);

            (recorder as any).isPrepRecording = true;
            (recorder as any).prepRetryTimerId = setTimeout(() => {}, 5000);

            await recorder.stop();

            expect((recorder as any).prepRetryTimerId).toBeNull();
            expect((recorder as any).isPrepRecording).toBe(false);
            expect(dummyRecordingEvent.emitCancelPrepRecording).not.toHaveBeenCalled();
        });

        it('cancels prep recording cleanly on stop() without triggering external hooks', async () => {
            const reserve = new Reserve();
            reserve.id = 300;
            const recorder = createFullRecorder(reserve);

            (recorder as any).isPrepRecording = true;
            const abortMock = vi.fn();
            (recorder as any).abortController = { abort: abortMock };

            const stopPromise = recorder.stop();

            // Simulate cancel event emitted by prepRecord catch/finally
            (recorder as any).eventEmitter.emit(RecorderModel.CANCEL_EVENT);

            await stopPromise;

            expect(abortMock).toHaveBeenCalled();
            expect(dummyRecordingEvent.emitCancelPrepRecording).not.toHaveBeenCalled();
        });

        it('clears timer on stop() when waiting for scheduled time', async () => {
            const reserve = new Reserve();
            reserve.id = 400;
            const recorder = createFullRecorder(reserve);

            (recorder as any).isRecording = false;
            (recorder as any).isPrepRecording = false;
            (recorder as any).timerId = setTimeout(() => {}, 100000);

            await recorder.stop();

            expect((recorder as any).timerId).toBeNull();
        });

        it('deduplicates concurrent stop calls via recEndPromise', async () => {
            const reserve = new Reserve();
            reserve.id = 500;
            reserve.startAt = Date.now() - 30000;
            reserve.endAt = Date.now() + 60000;

            const recorder = createFullRecorder(reserve);
            const { mockStream, mockRecFile } = createMockStreamAndFile();

            (recorder as any).isRecording = true;
            (recorder as any).actualStartAt = Date.now() - 20000;
            (recorder as any).recordedId = 50;
            (recorder as any).videoFileId = 500;
            (recorder as any).videoFileFulPath = '/path/test5.ts';
            (recorder as any).stream = mockStream;
            (recorder as any).recFile = mockRecFile;

            // Two concurrent stop() calls
            await Promise.all([recorder.stop(), recorder.stop()]);

            // DB removeRecording should be called only once
            expect(dummyRecordedDB.removeRecording).toHaveBeenCalledTimes(1);
        });

        it('handles recFile error during closeRecFile without crashing', async () => {
            const reserve = new Reserve();
            reserve.id = 600;
            const recorder = createFullRecorder(reserve);

            const mockRecFile = Object.assign(new EventEmitter(), {
                end: vi.fn(function (this: any) {
                    setImmediate(() => {
                        this.emit('error', new Error('EIO: write error'));
                    });
                }),
                closed: false,
                destroyed: false,
            });

            (recorder as any).isRecording = true;
            (recorder as any).recFile = mockRecFile;
            (recorder as any).recordedId = 60;
            (recorder as any).stream = {
                unpipe: vi.fn(),
                destroy: vi.fn(),
                push: vi.fn(),
                removeAllListeners: vi.fn(),
                destroyed: false,
            };

            await expect(recorder.stop()).resolves.not.toThrow();
            expect(dummySystemLog.error).toHaveBeenCalledWith(
                expect.stringContaining('recFile error during close/flush'),
            );
        });

        it('clears prepRetryTimerId and recordingStartTimeoutId on stop', async () => {
            const reserve = new Reserve();
            reserve.id = 700;
            const recorder = createFullRecorder(reserve);

            (recorder as any).prepRetryTimerId = setTimeout(() => {}, 10000);
            (recorder as any).recordingStartTimeoutId = setTimeout(() => {}, 10000);

            await recorder.stop();

            expect((recorder as any).prepRetryTimerId).toBeNull();
            expect((recorder as any).recordingStartTimeoutId).toBeNull();
        });
    });
});
