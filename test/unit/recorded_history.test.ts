import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecordedManageModel from '../../src/model/operator/recorded/RecordedManageModel';

describe('RecordedHistory retention & cleanup tests', () => {
    let dummyLogger: any;
    let dummyRecordedHistoryDB: any;
    let dummyConfig: any;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyRecordedHistoryDB = {
            delete: vi.fn().mockResolvedValue(undefined),
            insertOnce: vi.fn().mockResolvedValue(1),
            findAll: vi.fn().mockResolvedValue([]),
        };
    });

    const createModel = () => {
        return new RecordedManageModel(
            dummyLogger,
            dummyConfig,
            {} as any, // recordedDB
            {} as any, // videoFileDB
            {} as any, // thumbnailDB
            {} as any, // dropLogFileDB
            dummyRecordedHistoryDB,
            {} as any, // recordingManageModel
            {} as any, // recordedEvent
            {} as any, // videoUtil
            {} as any, // recordingUtilModel
        );
    };

    it('should skip history cleanup when historyRetentionDays is 0 (unlimited)', async () => {
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    historyRetentionDays: 0,
                },
            }),
        };

        const model = createModel();
        await model.historyCleanup();
        // 0日（無期限保持）の場合は delete が呼ばれないこと
        expect(dummyRecordedHistoryDB.delete).not.toHaveBeenCalled();
    });

    it('should call recordedHistoryDB.delete with correct timestamp when historyRetentionDays > 0', async () => {
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    historyRetentionDays: 90,
                },
            }),
        };

        const model = createModel();
        const before = new Date().getTime();
        await model.historyCleanup();
        const after = new Date().getTime();

        expect(dummyRecordedHistoryDB.delete).toHaveBeenCalledTimes(1);
        const deleteArg = dummyRecordedHistoryDB.delete.mock.calls[0][0];
        const expectedMin = before - 90 * 24 * 60 * 60 * 1000;
        const expectedMax = after - 90 * 24 * 60 * 60 * 1000;
        expect(deleteArg).toBeGreaterThanOrEqual(expectedMin);
        expect(deleteArg).toBeLessThanOrEqual(expectedMax);
    });
});

