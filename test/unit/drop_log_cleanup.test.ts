import 'reflect-metadata';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DropLogFile from '../../src/db/entities/DropLogFile';
import Recorded from '../../src/db/entities/Recorded';
import RecordedManageModel from '../../src/model/operator/recorded/RecordedManageModel';
import FileUtil from '../../src/util/FileUtil';

describe('Drop log cleanup and zero-drop retention tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyRecordedDB: any;
    let dummyDropLogFileDB: any;
    let dummyVideoFileDB: any;
    let dummyThumbnailDB: any;
    let dummyRecordedHistoryDB: any;
    let dummyRecordingManageModel: any;
    let dummyRecordedEvent: any;
    let dummyVideoUtil: any;
    let dummyRecordingUtil: any;

    const DROP_DIR = '/mock/drop';

    beforeEach(() => {
        vi.restoreAllMocks();

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                recording: {
                    dropLog: {
                        path: DROP_DIR,
                        enabled: true,
                        deleteOnNoDrop: true,
                    },
                },
            }),
        };

        dummyRecordedDB = {
            removeDropLogFileId: vi.fn().mockResolvedValue(undefined),
            deleteOnce: vi.fn().mockResolvedValue(undefined),
            findId: vi.fn().mockResolvedValue(null),
        };

        dummyDropLogFileDB = {
            findAll: vi.fn().mockResolvedValue([]),
            deleteOnce: vi.fn().mockResolvedValue(undefined),
            findId: vi.fn().mockResolvedValue(null),
        };

        dummyVideoFileDB = {
            deleteRecordedId: vi.fn().mockResolvedValue(undefined),
        };

        dummyThumbnailDB = {
            deleteRecordedId: vi.fn().mockResolvedValue(undefined),
        };

        dummyRecordedHistoryDB = {};
        dummyRecordingManageModel = {};
        dummyRecordedEvent = {
            emitDeleteRecorded: vi.fn(),
        };
        dummyVideoUtil = {};
        dummyRecordingUtil = {};
    });

    const createModel = () => {
        return new RecordedManageModel(
            dummyLogger,
            dummyConfig,
            dummyRecordedDB,
            dummyVideoFileDB,
            dummyThumbnailDB,
            dummyDropLogFileDB,
            dummyRecordedHistoryDB as any,
            dummyRecordingManageModel as any,
            dummyRecordedEvent as any,
            dummyVideoUtil as any,
            dummyRecordingUtil as any,
        );
    };

    it('should delete zero-drop file from disk but retain DB record when deleteOnNoDrop is true', async () => {
        const zeroDropLog: DropLogFile = {
            id: 1,
            dropCnt: 0,
            errorCnt: 0,
            scramblingCnt: 0,
            filePath: 'program_clean.log',
        };

        dummyDropLogFileDB.findAll.mockResolvedValue([zeroDropLog]);

        const fullPath = path.join(DROP_DIR, zeroDropLog.filePath);

        // checkFileExistence (fs.stat) -> true
        vi.spyOn(FileUtil, 'stat').mockResolvedValue({ size: 100 } as any);
        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);
        vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({
            files: [fullPath],
            directories: [],
        });

        const model = createModel();
        await model.dropLogFileCleanup();

        // ドロップ0件のファイルがディスクから削除されたこと
        expect(unlinkSpy).toHaveBeenCalledWith(fullPath);
        // DBレコードは削除されず保持されたこと
        expect(dummyDropLogFileDB.deleteOnce).not.toHaveBeenCalled();
        expect(dummyRecordedDB.removeDropLogFileId).not.toHaveBeenCalled();
    });

    it('should retain zero-drop DB record even if file does not exist on disk', async () => {
        const zeroDropLog: DropLogFile = {
            id: 2,
            dropCnt: 0,
            errorCnt: 0,
            scramblingCnt: 0,
            filePath: 'already_deleted.log',
        };

        dummyDropLogFileDB.findAll.mockResolvedValue([zeroDropLog]);

        // checkFileExistence -> false (getFileSize throws error)
        vi.spyOn(FileUtil, 'stat').mockRejectedValue(new Error('ENOENT'));
        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);
        vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({
            files: [],
            directories: [],
        });

        const model = createModel();
        await model.dropLogFileCleanup();

        // unlink は呼ばれない
        expect(unlinkSpy).not.toHaveBeenCalled();
        // DBレコードも削除されず維持される
        expect(dummyDropLogFileDB.deleteOnce).not.toHaveBeenCalled();
        expect(dummyRecordedDB.removeDropLogFileId).not.toHaveBeenCalled();
    });

    it('should not delete zero-drop file when deleteOnNoDrop is false', async () => {
        dummyConfig.getConfig = () => ({
            recording: {
                dropLog: {
                    path: DROP_DIR,
                    enabled: true,
                    deleteOnNoDrop: false, // 削除しない設定
                },
            },
        });

        const zeroDropLog: DropLogFile = {
            id: 3,
            dropCnt: 0,
            errorCnt: 0,
            scramblingCnt: 0,
            filePath: 'keep_clean.log',
        };

        dummyDropLogFileDB.findAll.mockResolvedValue([zeroDropLog]);

        const fullPath = path.join(DROP_DIR, zeroDropLog.filePath);
        vi.spyOn(FileUtil, 'stat').mockResolvedValue({ size: 100 } as any);
        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);
        vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({
            files: [fullPath],
            directories: [],
        });

        const model = createModel();
        await model.dropLogFileCleanup();

        // deleteOnNoDrop が false なので unlink は呼ばれない
        expect(unlinkSpy).not.toHaveBeenCalled();
        expect(dummyDropLogFileDB.deleteOnce).not.toHaveBeenCalled();
    });

    it('should retain drop log file and DB record when dropCnt > 0 and file exists', async () => {
        const errorDropLog: DropLogFile = {
            id: 4,
            dropCnt: 5,
            errorCnt: 0,
            scramblingCnt: 0,
            filePath: 'has_drops.log',
        };

        dummyDropLogFileDB.findAll.mockResolvedValue([errorDropLog]);

        const fullPath = path.join(DROP_DIR, errorDropLog.filePath);
        vi.spyOn(FileUtil, 'stat').mockResolvedValue({ size: 500 } as any);
        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);
        vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({
            files: [fullPath],
            directories: [],
        });

        const model = createModel();
        await model.dropLogFileCleanup();

        // ドロップがあるファイルは unlink されない
        expect(unlinkSpy).not.toHaveBeenCalled();
        // DBレコードも保持される
        expect(dummyDropLogFileDB.deleteOnce).not.toHaveBeenCalled();
    });

    it('should retain DB record even when dropCnt > 0 and file is missing on disk (history is preserved)', async () => {
        const missingDropLog: DropLogFile = {
            id: 5,
            dropCnt: 10,
            errorCnt: 0,
            scramblingCnt: 0,
            filePath: 'missing_dropped.log',
        };

        dummyDropLogFileDB.findAll.mockResolvedValue([missingDropLog]);

        // checkFileExistence -> false
        vi.spyOn(FileUtil, 'stat').mockRejectedValue(new Error('ENOENT'));
        vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({
            files: [],
            directories: [],
        });

        const model = createModel();
        await model.dropLogFileCleanup();

        // 実ファイルが無くてもドロップ履歴（DBレコード）は保持されること
        expect(dummyRecordedDB.removeDropLogFileId).not.toHaveBeenCalled();
        expect(dummyDropLogFileDB.deleteOnce).not.toHaveBeenCalled();
    });

    it('should delete orphan drop log files not recorded in DB', async () => {
        dummyDropLogFileDB.findAll.mockResolvedValue([]);

        const orphanFile = path.join(DROP_DIR, 'orphan.log');
        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);
        vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({
            files: [orphanFile],
            directories: [],
        });

        const model = createModel();
        await model.dropLogFileCleanup();

        expect(unlinkSpy).toHaveBeenCalledWith(orphanFile);
    });

    it('should safely delete recorded item without throwing when drop log file was already deleted', async () => {
        const recordedItem = new Recorded();
        recordedItem.id = 100;
        recordedItem.dropLogFile = {
            id: 10,
            dropCnt: 0,
            errorCnt: 0,
            scramblingCnt: 0,
            filePath: 'already_deleted.log',
        };

        dummyRecordedDB.findId.mockResolvedValue(recordedItem);

        // ファイル存在確認で false (既に0件で削除済み)
        vi.spyOn(FileUtil, 'stat').mockRejectedValue(new Error('ENOENT'));
        const unlinkSpy = vi.spyOn(FileUtil, 'unlink');

        const model = createModel();
        await model.delete(100);

        // ファイルが存在しないため unlink は呼ばれない
        expect(unlinkSpy).not.toHaveBeenCalled();
        // DBレコードの削除は正常に行われる
        expect(dummyRecordedDB.deleteOnce).toHaveBeenCalledWith(100);
        expect(dummyDropLogFileDB.deleteOnce).toHaveBeenCalledWith(10);
    });
});
