import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Reserve from '../../src/db/entities/Reserve';
import RecordingManageModel from '../../src/model/operator/recording/RecordingManageModel';

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
            getConfig: () => ({}),
        };
        dummyRecordedDB = {
            findReserveId: vi.fn().mockResolvedValue([]),
        };
        dummyReserveDB = {
            findId: vi.fn().mockResolvedValue(null),
        };
        dummyStreamCreator = {};
        dummyRecordingUtil = {};
        recordingEvents = {};

        dummyRecordingEvent = {
            setCancelPrepRecording: vi.fn((fn: any) => { recordingEvents.cancelPrep = fn; }),
            setPrepRecordingFailed: vi.fn((fn: any) => { recordingEvents.prepFailed = fn; }),
            setRecordingFailed: vi.fn((fn: any) => { recordingEvents.recordingFailed = fn; }),
            setFinishRecording: vi.fn((fn: any) => { recordingEvents.finish = fn; }),
            emitRecordingRetryOver: vi.fn(),
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
        const model = createModel();

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
        const model = createModel();

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
});
