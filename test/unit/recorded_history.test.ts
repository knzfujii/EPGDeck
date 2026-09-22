import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecordedManageModel from '../../src/model/operator/recorded/RecordedManageModel.js';

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

    it('should delete history for a recorded item', async () => {
        dummyConfig = {
            getConfig: () => ({
                recording: { historyRetentionDays: 0 },
            }),
        };

        const dummyRecordedDB = {
            findId: vi.fn().mockResolvedValue({
                id: 123,
                channelId: 10001,
                endAt: 1700000000000,
                name: '【字】テスト番組 [新]',
                halfWidthName: '[字]テスト番組 [新]',
            }),
        };
        dummyRecordedHistoryDB.deleteHistory = vi.fn().mockResolvedValue(true);

        const model = new RecordedManageModel(
            dummyLogger,
            dummyConfig,
            dummyRecordedDB as any,
            {} as any,
            {} as any,
            {} as any,
            dummyRecordedHistoryDB,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        );

        await model.deleteHistory(123);

        expect(dummyRecordedDB.findId).toHaveBeenCalledWith(123);
        // StrUtil.deleteBrackets で囲み文字や角括弧が除去されて「テスト番組」になること
        expect(dummyRecordedHistoryDB.deleteHistory).toHaveBeenCalledWith('テスト番組', 10001, 1700000000000);
    });

    it('should throw error when deleting history for non-existent recorded item', async () => {
        dummyConfig = {
            getConfig: () => ({
                recording: { historyRetentionDays: 0 },
            }),
        };

        const dummyRecordedDB = {
            findId: vi.fn().mockResolvedValue(null),
        };

        const model = new RecordedManageModel(
            dummyLogger,
            dummyConfig,
            dummyRecordedDB as any,
            {} as any,
            {} as any,
            {} as any,
            dummyRecordedHistoryDB,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        );

        await expect(model.deleteHistory(999)).rejects.toThrow('RecordedIdIsNotFound');
    });

    it('should add history for a recorded item', async () => {
        dummyConfig = {
            getConfig: () => ({
                recording: { historyRetentionDays: 0 },
            }),
        };

        const dummyRecordedDB = {
            findId: vi.fn().mockResolvedValue({
                id: 123,
                channelId: 10001,
                endAt: 1700000000000,
                name: '【字】テスト番組 [新]',
                halfWidthName: '[字]テスト番組 [新]',
            }),
        };
        dummyRecordedHistoryDB.addHistory = vi.fn().mockResolvedValue(undefined);

        const model = new RecordedManageModel(
            dummyLogger,
            dummyConfig,
            dummyRecordedDB as any,
            {} as any,
            {} as any,
            {} as any,
            dummyRecordedHistoryDB,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        );

        await model.addHistory(123);

        expect(dummyRecordedDB.findId).toHaveBeenCalledWith(123);
        expect(dummyRecordedHistoryDB.addHistory).toHaveBeenCalledWith('テスト番組', 10001, 1700000000000);
    });
});
