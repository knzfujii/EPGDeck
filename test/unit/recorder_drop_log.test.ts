import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecorderModel from '../../src/model/operator/recording/RecorderModel';
import FileUtil from '../../src/util/FileUtil';

describe('RecorderModel Drop Log Handling Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyDropLogFileDB: any;
    let dummyDropChecker: any;

    const MOCK_DROP_FILE = '/mock/drop/rec_test.log';

    beforeEach(() => {
        vi.restoreAllMocks();

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
                stream: { fatal: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                recording: {
                    dropLog: {
                        path: '/mock/drop',
                        enabled: true,
                        deleteOnNoDrop: true,
                    },
                },
            }),
        };

        dummyDropLogFileDB = {
            updateCnt: vi.fn().mockResolvedValue(undefined),
        };

        dummyDropChecker = {
            getResult: vi.fn(),
            getFilePath: vi.fn().mockReturnValue(MOCK_DROP_FILE),
            stop: vi.fn().mockResolvedValue(undefined),
        };
    });

    const createRecorder = (deleteOnNoDrop = true) => {
        dummyConfig.getConfig = () => ({
            recording: {
                dropLog: {
                    path: '/mock/drop',
                    enabled: true,
                    deleteOnNoDrop,
                },
            },
        });

        const recorder = new RecorderModel(
            dummyLogger,
            dummyConfig,
            {} as any, // programDB
            {} as any, // reserveDB
            {} as any, // recordedDB
            {} as any, // recordedHistoryDB
            {} as any, // videoFileDB
            dummyDropLogFileDB,
            {} as any, // streamCreator
            dummyDropChecker,
            {} as any, // recordingUtil
            {} as any, // recordingEvent
            {} as any, // mirakurunClientModel
        );

        // テスト用に内部プロパティをセット
        (recorder as any).dropLogFileId = 42;
        (recorder as any).recordedId = 100;

        return recorder;
    };

    it('should delete drop log file on zero drops when deleteOnNoDrop is true', async () => {
        const recorder = createRecorder(true);

        // ドロップ0件
        dummyDropChecker.getResult.mockResolvedValue({
            0x0100: { error: 0, drop: 0, scrambling: 0, packet: 1000 },
            0x0110: { error: 0, drop: 0, scrambling: 0, packet: 500 },
        });

        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);

        await (recorder as any).updateDropFileLog();

        // ログ実ファイルが削除されたこと
        expect(unlinkSpy).toHaveBeenCalledWith(MOCK_DROP_FILE);
        // DB上のカウントは0で更新されたこと
        expect(dummyDropLogFileDB.updateCnt).toHaveBeenCalledWith({
            id: 42,
            errorCnt: 0,
            dropCnt: 0,
            scramblingCnt: 0,
        });
    });

    it('should retain drop log file when dropCnt > 0 even if deleteOnNoDrop is true', async () => {
        const recorder = createRecorder(true);

        // ドロップあり
        dummyDropChecker.getResult.mockResolvedValue({
            0x0100: { error: 1, drop: 2, scrambling: 0, packet: 1000 },
        });

        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);

        await (recorder as any).updateDropFileLog();

        // ドロップがあるので unlink は呼ばれない
        expect(unlinkSpy).not.toHaveBeenCalled();
        // DB上のカウントが反映されたこと
        expect(dummyDropLogFileDB.updateCnt).toHaveBeenCalledWith({
            id: 42,
            errorCnt: 1,
            dropCnt: 2,
            scramblingCnt: 0,
        });
    });

    it('should retain drop log file on zero drops when deleteOnNoDrop is false', async () => {
        const recorder = createRecorder(false);

        // ドロップ0件
        dummyDropChecker.getResult.mockResolvedValue({
            0x0100: { error: 0, drop: 0, scrambling: 0, packet: 1000 },
        });

        const unlinkSpy = vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined);

        await (recorder as any).updateDropFileLog();

        // deleteOnNoDrop が false なので unlink は呼ばれない
        expect(unlinkSpy).not.toHaveBeenCalled();
        expect(dummyDropLogFileDB.updateCnt).toHaveBeenCalledWith({
            id: 42,
            errorCnt: 0,
            dropCnt: 0,
            scramblingCnt: 0,
        });
    });
});
