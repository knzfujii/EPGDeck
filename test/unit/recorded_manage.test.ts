import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as apid from '../../api.js';
import DropLogFile from '../../src/db/entities/DropLogFile.js';
import Recorded from '../../src/db/entities/Recorded.js';
import Thumbnail from '../../src/db/entities/Thumbnail.js';
import VideoFile from '../../src/db/entities/VideoFile.js';
import FileUtil from '../../src/util/FileUtil.js';
import RecordedManageModel from '../../src/model/operator/recorded/RecordedManageModel.js';

describe('RecordedManageModel Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyRecordedDB: any;
    let dummyVideoFileDB: any;
    let dummyThumbnailDB: any;
    let dummyDropLogFileDB: any;
    let dummyRecordedHistoryDB: any;
    let dummyRecordingManageModel: any;
    let dummyRecordedEvent: any;
    let dummyVideoUtil: any;
    let dummyRecordingUtilModel: any;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    thumbnail: { path: '/record/thumbnails' },
                    dropLog: { path: '/record/drop', deleteOnNoDrop: true },
                    directories: [{ name: 'rec1', path: '/record/rec1' }],
                    historyRetentionDays: 30,
                },
            }),
        };
        dummyRecordedDB = {
            findId: vi.fn(),
            deleteOnce: vi.fn().mockResolvedValue(undefined),
            insertOnce: vi.fn().mockResolvedValue(100),
            changeProtect: vi.fn().mockResolvedValue(undefined),
            removeRuleId: vi.fn().mockResolvedValue(undefined),
        };
        dummyVideoFileDB = {
            findId: vi.fn(),
            findAll: vi.fn().mockResolvedValue([]),
            deleteOnce: vi.fn().mockResolvedValue(undefined),
            deleteRecordedId: vi.fn().mockResolvedValue(undefined),
            updateSize: vi.fn().mockResolvedValue(undefined),
            insertOnce: vi.fn().mockResolvedValue(501),
        };
        dummyThumbnailDB = {
            deleteRecordedId: vi.fn().mockResolvedValue(undefined),
        };
        dummyDropLogFileDB = {
            findId: vi.fn(),
            findAll: vi.fn().mockResolvedValue([]),
            deleteOnce: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordedHistoryDB = {
            delete: vi.fn().mockResolvedValue(undefined),
            deleteHistory: vi.fn().mockResolvedValue(undefined),
            addHistory: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordingManageModel = {
            hasReserve: vi.fn().mockReturnValue(false),
            cancel: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordedEvent = {
            emitDeleteRecorded: vi.fn(),
            emitDeleteVideoFile: vi.fn(),
            emitCreateNewRecorded: vi.fn(),
            emitChangeProtect: vi.fn(),
            emitUpdateVideoFileSize: vi.fn(),
            emitAddVideoFile: vi.fn(),
        };
        dummyVideoUtil = {
            getFullFilePathFromId: vi.fn().mockResolvedValue('/record/rec1/video.ts'),
            getFullFilePathFromVideoFile: vi.fn().mockReturnValue('/record/rec1/video.ts'),
            getParentDirPath: vi.fn().mockReturnValue('/record/rec1'),
        };
        dummyRecordingUtilModel = {};

        // FileUtil のファイルシステム呼び出しをモック化
        vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined as any);
        vi.spyOn(FileUtil, 'stat').mockResolvedValue({} as any);
        vi.spyOn(FileUtil, 'getFileSize').mockResolvedValue(1024 * 1024);
        vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({ files: [], directories: [] });
        vi.spyOn(FileUtil, 'isEmptyDirectory').mockResolvedValue(true);
        vi.spyOn(FileUtil, 'rmdir').mockResolvedValue(undefined as any);
    });

    const createModel = () => {
        return new RecordedManageModel(
            dummyLogger,
            dummyConfig,
            dummyRecordedDB,
            dummyVideoFileDB,
            dummyThumbnailDB,
            dummyDropLogFileDB,
            dummyRecordedHistoryDB,
            dummyRecordingManageModel,
            dummyRecordedEvent,
            dummyVideoUtil,
            dummyRecordingUtilModel,
        );
    };

    describe('delete', () => {
        it('throws RecordedIdIsNotFound when recorded does not exist', async () => {
            dummyRecordedDB.findId.mockResolvedValue(null);
            const model = createModel();

            await expect(model.delete(999)).rejects.toThrow('RecordedIdIsNotFound');
        });

        it('throws RecordedIsProtected when recorded is protected', async () => {
            const recorded = new Recorded();
            recorded.id = 1;
            recorded.isProtected = true;
            dummyRecordedDB.findId.mockResolvedValue(recorded);
            const model = createModel();

            await expect(model.delete(1)).rejects.toThrow('RecordedIsProtected');
        });

        it('cancels active recording when recorded is currently recording', async () => {
            const recorded = new Recorded();
            recorded.id = 1;
            recorded.isProtected = false;
            recorded.isRecording = true;
            recorded.reserveId = 10;
            dummyRecordedDB.findId.mockResolvedValue(recorded);
            dummyRecordingManageModel.hasReserve.mockReturnValue(true);

            const model = createModel();
            await model.delete(1);

            expect(dummyRecordingManageModel.cancel).toHaveBeenCalledWith(10, true);
        });

        it('deletes thumbnail, video, and dropLog files and removes DB records', async () => {
            const recorded = new Recorded();
            recorded.id = 1;
            recorded.isProtected = false;
            recorded.isRecording = false;

            const thumb = new Thumbnail();
            thumb.id = 10;
            thumb.filePath = 'sub/thumb.jpg';
            recorded.thumbnails = [thumb];

            const video = new VideoFile();
            video.id = 20;
            recorded.videoFiles = [video];

            const dropLog = new DropLogFile();
            dropLog.id = 30;
            dropLog.filePath = 'drop.log';
            recorded.dropLogFile = dropLog;

            dummyRecordedDB.findId.mockResolvedValue(recorded);
            dummyVideoUtil.getFullFilePathFromId.mockResolvedValue('/record/rec1/video.ts');

            const model = createModel();
            await model.delete(1);

            // 実ファイル削除
            expect(FileUtil.unlink).toHaveBeenCalledWith('/record/thumbnails/sub/thumb.jpg');
            expect(FileUtil.unlink).toHaveBeenCalledWith('/record/rec1/video.ts');
            expect(FileUtil.unlink).toHaveBeenCalledWith('/record/drop/drop.log');

            // DB レコード削除
            expect(dummyThumbnailDB.deleteRecordedId).toHaveBeenCalledWith(1);
            expect(dummyVideoFileDB.deleteRecordedId).toHaveBeenCalledWith(1);
            expect(dummyRecordedDB.deleteOnce).toHaveBeenCalledWith(1);
            expect(dummyDropLogFileDB.deleteOnce).toHaveBeenCalledWith(30);

            // イベント通知
            expect(dummyRecordedEvent.emitDeleteRecorded).toHaveBeenCalledWith(recorded);
        });
    });

    describe('deleteVideoFile', () => {
        it('throws VideoFileIsNotFound when video file does not exist', async () => {
            dummyVideoFileDB.findId.mockResolvedValue(null);
            const model = createModel();

            await expect(model.deleteVideoFile(999)).rejects.toThrow('VideoFileIsNotFound');
        });

        it('throws RecordedIsProtected when parent recorded is protected', async () => {
            const video = new VideoFile();
            video.id = 20;
            video.recordedId = 1;
            dummyVideoFileDB.findId.mockResolvedValue(video);

            const recorded = new Recorded();
            recorded.id = 1;
            recorded.isProtected = true;
            dummyRecordedDB.findId.mockResolvedValue(recorded);

            const model = createModel();
            await expect(model.deleteVideoFile(20)).rejects.toThrow('RecordedIsProtected');
        });

        it('deletes video file and cascades deletion of recorded when video files become empty', async () => {
            const video = new VideoFile();
            video.id = 20;
            video.recordedId = 1;
            dummyVideoFileDB.findId.mockResolvedValue(video);

            const recordedBefore = new Recorded();
            recordedBefore.id = 1;
            recordedBefore.isProtected = false;
            recordedBefore.isRecording = false;

            const recordedAfter = new Recorded();
            recordedAfter.id = 1;
            recordedAfter.isProtected = false;
            recordedAfter.isRecording = false;
            recordedAfter.videoFiles = []; // 空になった

            dummyRecordedDB.findId
                .mockResolvedValueOnce(recordedBefore) // 初回プロテクトチェック
                .mockResolvedValueOnce(recordedAfter) // 削除後チェック
                .mockResolvedValueOnce(recordedAfter); // delete() 呼び出し内

            const model = createModel();
            const deleteSpy = vi.spyOn(model, 'delete').mockResolvedValue(undefined);

            await model.deleteVideoFile(20);

            expect(FileUtil.unlink).toHaveBeenCalledWith('/record/rec1/video.ts');
            expect(dummyVideoFileDB.deleteOnce).toHaveBeenCalledWith(20);
            expect(deleteSpy).toHaveBeenCalledWith(1, false);
        });
    });

    describe('createNewRecorded', () => {
        it('throws TimeRangeError when startAt >= endAt', async () => {
            const model = createModel();
            const option: apid.CreateNewRecordedOption = {
                channelId: 1,
                startAt: 10000,
                endAt: 9000,
                name: 'Test Program',
            };

            await expect(model.createNewRecorded(option)).rejects.toThrow('TimeRangeError');
        });

        it('successfully creates new recorded with normalized strings and emits event', async () => {
            const model = createModel();
            const option: apid.CreateNewRecordedOption = {
                channelId: 1,
                startAt: 1000,
                endAt: 3000,
                name: '【新】テスト番組 １',
                description: '詳細 ＡＢＣ',
            };

            const id = await model.createNewRecorded(option);
            expect(id).toBe(100);
            expect(dummyRecordedDB.insertOnce).toHaveBeenCalledWith(
                expect.objectContaining({
                    channelId: 1,
                    startAt: 1000,
                    endAt: 3000,
                    duration: 2000,
                    halfWidthName: expect.stringContaining('1'),
                }),
            );
            expect(dummyRecordedEvent.emitCreateNewRecorded).toHaveBeenCalledWith(100);
        });
    });

    describe('changeProtect & historyCleanup', () => {
        it('updates protect status in DB and emits event', async () => {
            const model = createModel();
            await model.changeProtect(1, true);

            expect(dummyRecordedDB.changeProtect).toHaveBeenCalledWith(1, true);
            expect(dummyRecordedEvent.emitChangeProtect).toHaveBeenCalledWith(1, true);
        });

        it('deletes history older than retentionDays', async () => {
            const model = createModel();
            const now = Date.now();
            vi.useFakeTimers();
            vi.setSystemTime(now);

            await model.historyCleanup();

            const expectedThreshold = now - 30 * 24 * 60 * 60 * 1000;
            expect(dummyRecordedHistoryDB.delete).toHaveBeenCalledWith(expectedThreshold);

            vi.useRealTimers();
        });
    });

    describe('dropLogFileCleanup', () => {
        it('deletes zero-drop log files when deleteOnNoDrop is true', async () => {
            const dropLog = new DropLogFile();
            dropLog.id = 1;
            dropLog.filePath = 'zero.log';
            dropLog.dropCnt = 0;
            dropLog.errorCnt = 0;
            dropLog.scramblingCnt = 0;

            dummyDropLogFileDB.findAll.mockResolvedValue([dropLog]);
            vi.spyOn(FileUtil, 'getFileList').mockResolvedValue({
                files: ['/record/drop/zero.log', '/record/drop/orphan.log'],
                directories: [],
            });

            const model = createModel();
            await model.dropLogFileCleanup();

            // ドロップ0件ログが削除されること
            expect(FileUtil.unlink).toHaveBeenCalledWith('/record/drop/zero.log');
            // DBに紐付かない孤立ログも削除されること
            expect(FileUtil.unlink).toHaveBeenCalledWith('/record/drop/orphan.log');
        });
    });
});
