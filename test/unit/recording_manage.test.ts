import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Reserve from '../../src/db/entities/Reserve.js';
import RecordingManageModel from '../../src/model/operator/recording/RecordingManageModel.js';

describe('RecordingManageModel Lifecycle Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyRecordedDB: any;
    let dummyReserveDB: any;
    let dummyStreamCreator: any;
    let dummyRecordingUtil: any;
    let recordingEvents: Record<string, (arg: any) => any>;
    let dummyRecordingEvent: any;
    let dummyRecorderProvider: any;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    tempDir: '/record/tmp',
                },
            }),
        };
        dummyRecordedDB = {
            findReserveId: vi.fn().mockResolvedValue([]),
            findAll: vi.fn().mockResolvedValue([[], 0]),
            removeRecording: vi.fn().mockResolvedValue(undefined),
            findId: vi.fn().mockResolvedValue(null),
        };
        dummyReserveDB = {
            findId: vi.fn().mockResolvedValue(null),
        };
        dummyStreamCreator = {
            setTuner: vi.fn(),
        };
        dummyRecordingUtil = {
            movingFromTmp: vi.fn().mockResolvedValue('/record/dest/video.ts'),
            updateVideoFileSize: vi.fn().mockResolvedValue(undefined),
        };
        recordingEvents = {};

        dummyRecordingEvent = {
            setCancelPrepRecording: vi.fn((fn: any) => {
                recordingEvents.cancelPrep = fn;
            }),
            setPrepRecordingFailed: vi.fn((fn: any) => {
                recordingEvents.prepFailed = fn;
            }),
            setRecordingFailed: vi.fn((fn: any) => {
                recordingEvents.recordingFailed = fn;
            }),
            setFinishRecording: vi.fn((fn: any) => {
                recordingEvents.finish = fn;
            }),
            emitRecordingRetryOver: vi.fn(),
            emitFinishRecording: vi.fn(),
        };

        dummyRecorderProvider = vi.fn().mockImplementation(() => {
            return {
                setTimer: vi.fn().mockReturnValue(true),
                cancel: vi.fn(),
            };
        });
    });

    const createModel = () => {
        return new RecordingManageModel(
            dummyLogger,
            dummyConfig,
            dummyRecorderProvider,
            dummyRecordingEvent,
            dummyStreamCreator,
            dummyRecordedDB,
            dummyReserveDB,
            dummyRecordingUtil,
        );
    };

    it('initializes and registers recording event listeners', () => {
        createModel();
        expect(dummyRecordingEvent.setCancelPrepRecording).toHaveBeenCalled();
        expect(dummyRecordingEvent.setPrepRecordingFailed).toHaveBeenCalled();
        expect(dummyRecordingEvent.setRecordingFailed).toHaveBeenCalled();
        expect(dummyRecordingEvent.setFinishRecording).toHaveBeenCalled();
    });

    it('tracks multiple concurrent active recording instances', async () => {
        const model = createModel();

        const r1 = new Reserve();
        r1.id = 101;
        const r2 = new Reserve();
        r2.id = 102;
        const r3 = new Reserve();
        r3.id = 103;

        const recorderMock1 = { cancel: vi.fn() };
        const recorderMock2 = { cancel: vi.fn() };
        const recorderMock3 = { cancel: vi.fn() };

        // 内部の recordingIndex に複数同時録画をセット
        (model as any).recordingIndex[101] = recorderMock1;
        (model as any).recordingIndex[102] = recorderMock2;
        (model as any).recordingIndex[103] = recorderMock3;

        expect(Object.keys((model as any).recordingIndex)).toHaveLength(3);

        // 録画101が正常終了
        recordingEvents.finish(r1);
        expect((model as any).recordingIndex[101]).toBeUndefined();
        expect((model as any).recordingIndex[102]).toBeDefined();
        expect((model as any).recordingIndex[103]).toBeDefined();

        // 録画102がキャンセル
        recordingEvents.cancelPrep(r2);
        expect((model as any).recordingIndex[102]).toBeUndefined();
        expect((model as any).recordingIndex[103]).toBeDefined();
    });

    it('retries recording up to 3 times on recording failure', async () => {
        createModel();

        const reserve = new Reserve();
        reserve.id = 201;

        // 過去の録画試行回数: 1回
        dummyRecordedDB.findReserveId.mockResolvedValue([{}]);

        await recordingEvents.recordingFailed(reserve);

        // プロバイダーから新しい Recorder を取得して再設定
        expect(dummyRecorderProvider).toHaveBeenCalled();
        expect(dummyRecordingEvent.emitRecordingRetryOver).not.toHaveBeenCalled();
    });

    it('emits recording retry over when failure exceeds 3 attempts', async () => {
        createModel();

        const reserve = new Reserve();
        reserve.id = 202;

        // 過去の録画試行回数: 3回
        dummyRecordedDB.findReserveId.mockResolvedValue([{}, {}, {}]);

        await recordingEvents.recordingFailed(reserve);

        // リトライ回数オーバーが発火すること
        expect(dummyRecordingEvent.emitRecordingRetryOver).toHaveBeenCalledWith(reserve);
    });

    it('scales up to 8 concurrent active recording tasks and cleans up cleanly', () => {
        const model = createModel();

        // 8 件の同時録画タスクを登録
        for (let i = 1; i <= 8; i++) {
            (model as any).recordingIndex[i] = { cancel: vi.fn() };
        }
        expect(Object.keys((model as any).recordingIndex)).toHaveLength(8);

        // 奇数IDの録画が順次終了
        [1, 3, 5, 7].forEach(id => {
            const r = new Reserve();
            r.id = id;
            recordingEvents.finish(r);
        });

        expect(Object.keys((model as any).recordingIndex)).toHaveLength(4);
        expect((model as any).recordingIndex[2]).toBeDefined();
        expect((model as any).recordingIndex[4]).toBeDefined();
        expect((model as any).recordingIndex[6]).toBeDefined();
        expect((model as any).recordingIndex[8]).toBeDefined();
    });

    it('skips deleting active recording when reserve is included in diff.delete', async () => {
        const model = createModel();

        const activeCancelFn = vi.fn().mockResolvedValue(undefined);
        const inactiveCancelFn = vi.fn().mockResolvedValue(undefined);

        // 録画中のレコーダー
        (model as any).recordingIndex[100] = {
            isRecording: true,
            cancel: activeCancelFn,
            update: vi.fn(),
        };
        // 待機中のレコーダー
        (model as any).recordingIndex[101] = {
            isRecording: false,
            cancel: inactiveCancelFn,
            update: vi.fn(),
        };

        const reserve100 = new Reserve();
        reserve100.id = 100;
        const reserve101 = new Reserve();
        reserve101.id = 101;

        await model.update({
            delete: [reserve100, reserve101],
            isSuppressLog: true,
        });

        // 録画中のレコーダーは cancel されずスキップされること
        expect(activeCancelFn).not.toHaveBeenCalled();
        // 待機中のレコーダーは正常に cancel されること
        expect(inactiveCancelFn).toHaveBeenCalledWith(false);
    });

    it('skips adding duplicate recording timer when same slot is already recording', async () => {
        const model = createModel();

        const now = Date.now();
        const activeReserve = new Reserve();
        activeReserve.id = 200;
        activeReserve.channelId = 3273701032;
        activeReserve.startAt = now - 10000;
        activeReserve.endAt = now + 50000;

        (model as any).recordingIndex[200] = {
            isRecording: true,
            reserve: activeReserve,
            cancel: vi.fn(),
        };

        // 同一スロット（同一局・同時間帯）の新規予約
        const newReserve = new Reserve();
        newReserve.id = 201;
        newReserve.name = 'Duplicate Slot Program';
        newReserve.channelId = 3273701032;
        newReserve.startAt = now - 10000;
        newReserve.endAt = now + 50000;

        await model.update({
            insert: [newReserve],
            isSuppressLog: true,
        });

        // すでに録画中のため新規レコーダーのタイマーはセットされないこと
        expect(dummyRecorderProvider).not.toHaveBeenCalled();
        expect((model as any).recordingIndex[201]).toBeUndefined();
    });

    describe('cleanup', () => {
        it('cleans up interrupted recordings on startup and moves files from tmp', async () => {
            const model = createModel();

            const dummyReserve = new Reserve();
            dummyReserve.id = 1;

            const dummyRecorded = {
                id: 10,
                reserveId: 1,
                videoFiles: [
                    { id: 100, parentDirectoryName: 'tmp' },
                    { id: 101, parentDirectoryName: 'recorded' },
                ],
            };

            dummyRecordedDB.findAll.mockResolvedValue([[dummyRecorded], 1]);
            dummyReserveDB.findId.mockResolvedValue(dummyReserve);
            dummyRecordedDB.findId.mockResolvedValue({ id: 10, isRecording: false });

            await model.cleanup();

            expect(dummyRecordedDB.removeRecording).toHaveBeenCalledWith(10);
            expect(dummyRecordingUtil.movingFromTmp).toHaveBeenCalledWith(dummyReserve, 100);
            expect(dummyRecordingUtil.updateVideoFileSize).toHaveBeenCalledWith(100);
            expect(dummyRecordingUtil.updateVideoFileSize).toHaveBeenCalledWith(101);
            expect(dummyRecordingEvent.emitFinishRecording).toHaveBeenCalledWith(
                dummyReserve,
                expect.objectContaining({ id: 10 }),
                true,
            );
        });
    });

    describe('finish & resetTimer', () => {
        it('calls finish on recorder and removes from recordingIndex', async () => {
            const model = createModel();
            const finishFn = vi.fn().mockResolvedValue(undefined);
            (model as any).recordingIndex[50] = {
                finish: finishFn,
            };

            expect(model.hasReserve(50)).toBe(true);
            await model.finish(50);

            expect(finishFn).toHaveBeenCalled();
            expect(model.hasReserve(50)).toBe(false);
        });

        it('resets timer on all active recorders', () => {
            const model = createModel();
            const reset1 = vi.fn();
            const reset2 = vi.fn();
            (model as any).recordingIndex[1] = { resetTimer: reset1 };
            (model as any).recordingIndex[2] = { resetTimer: reset2 };

            model.resetTimer();

            expect(reset1).toHaveBeenCalled();
            expect(reset2).toHaveBeenCalled();
        });
    });

    describe('update handling', () => {
        it('cancels and removes existing recorder if reserve becomes skip or overlap during update', async () => {
            const model = createModel();
            const updateFn = vi.fn().mockResolvedValue(undefined);
            (model as any).recordingIndex[300] = {
                update: updateFn,
            };

            const updatedReserve = new Reserve();
            updatedReserve.id = 300;
            updatedReserve.isSkip = true;

            await model.update({
                update: [updatedReserve],
                isSuppressLog: false,
            });

            expect(updateFn).toHaveBeenCalledWith(updatedReserve, false);
            expect(model.hasReserve(300)).toBe(false);
        });
    });
});
