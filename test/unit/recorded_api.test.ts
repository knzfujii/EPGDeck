import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Recorded from '../../src/db/entities/Recorded.js';
import RecordedApiModel from '../../src/model/api/recorded/RecordedApiModel.js';

describe('RecordedApiModel Tests', () => {
    let dummyIPC: any;
    let dummyRecordedDB: any;
    let dummyRecordedHistoryDB: any;
    let dummyEncodeManage: any;
    let dummyRecordedItemUtil: any;
    let model: RecordedApiModel;

    beforeEach(() => {
        dummyIPC = {
            recorded: {
                delete: vi.fn(),
                changeProtect: vi.fn(),
                videoFileCleanup: vi.fn(),
                dropLogFileCleanup: vi.fn(),
                addUploadedVideoFile: vi.fn(),
                createNewRecorded: vi.fn(),
                deleteHistory: vi.fn(),
                addHistory: vi.fn(),
            },
        };
        dummyRecordedDB = {
            findAll: vi.fn(),
            findId: vi.fn(),
            findChannelList: vi.fn(),
            findGenreList: vi.fn(),
        };
        dummyRecordedHistoryDB = {
            hasHistory: vi.fn(),
        };
        dummyEncodeManage = {
            getRecordedIndex: vi.fn().mockReturnValue(new Map()),
            cancelEncodeByRecordedId: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordedItemUtil = {
            convertRecordedToRecordedItem: vi.fn().mockImplementation((r, isHalfWidth) => ({
                id: r.id,
                name: isHalfWidth ? r.halfWidthName : r.name,
            })),
        };

        model = new RecordedApiModel(
            dummyIPC,
            dummyRecordedDB,
            dummyRecordedHistoryDB,
            dummyEncodeManage,
            dummyRecordedItemUtil,
        );
    });

    const createDummyRecorded = (id: number): Recorded => {
        const r = new Recorded();
        r.id = id;
        r.name = '録画番組　１';
        r.halfWidthName = '[字]録画番組 1';
        r.channelId = 10;
        r.endAt = 2000;
        return r;
    };

    describe('gets', () => {
        it('fetches recorded items and maps with recordedItemUtil', async () => {
            const r1 = createDummyRecorded(1);
            const r2 = createDummyRecorded(2);
            dummyRecordedDB.findAll.mockResolvedValue([[r1, r2], 2]);

            const result = await model.gets({ isHalfWidth: false });

            expect(result.total).toBe(2);
            expect(result.records.length).toBe(2);
            expect(result.records[0].id).toBe(1);
            expect(result.records[1].id).toBe(2);
            expect(dummyRecordedDB.findAll).toHaveBeenCalledWith(expect.objectContaining({ isRecording: false }), {
                isNeedVideoFiles: true,
                isNeedThumbnails: true,
                isNeedsDropLog: true,
                isNeedTags: false,
            });
        });
    });

    describe('get', () => {
        it('returns null when recorded item not found', async () => {
            dummyRecordedDB.findId.mockResolvedValue(null);

            const result = await model.get(999, false);
            expect(result).toBeNull();
        });

        it('returns recorded item with duplicate history check', async () => {
            const r = createDummyRecorded(1);
            dummyRecordedDB.findId.mockResolvedValue(r);
            dummyRecordedHistoryDB.hasHistory.mockResolvedValue(true);

            const result = await model.get(1, true);

            expect(result).not.toBeNull();
            expect(result?.id).toBe(1);
            expect(result?.hasDuplicateHistory).toBe(true);
            // [字] が除去された shortName ('録画番組 1') で履歴チェックされること
            expect(dummyRecordedHistoryDB.hasHistory).toHaveBeenCalledWith('録画番組 1', 10, 2000);
        });
    });

    describe('getSearchOptionList', () => {
        it('returns channels and genres', async () => {
            dummyRecordedDB.findChannelList.mockResolvedValue([{ id: 1, name: 'NHK' }]);
            dummyRecordedDB.findGenreList.mockResolvedValue([{ genre: 1 }]);

            const result = await model.getSearchOptionList();

            expect(result.channels).toEqual([{ id: 1, name: 'NHK' }]);
            expect(result.genres).toEqual([{ genre: 1 }]);
        });
    });

    describe('delete and encode control', () => {
        it('delete cancels encode first and delegates to ipc.recorded.delete', async () => {
            dummyIPC.recorded.delete.mockResolvedValue(undefined);

            await model.delete(5);

            expect(dummyEncodeManage.cancelEncodeByRecordedId).toHaveBeenCalledWith(5);
            expect(dummyIPC.recorded.delete).toHaveBeenCalledWith(5);
        });

        it('stopEncode delegates to encodeManage.cancelEncodeByRecordedId', async () => {
            await model.stopEncode(10);

            expect(dummyEncodeManage.cancelEncodeByRecordedId).toHaveBeenCalledWith(10);
        });

        it('changeProtect delegates to ipc.recorded.changeProtect', async () => {
            dummyIPC.recorded.changeProtect.mockResolvedValue(undefined);

            await model.changeProtect(8, true);

            expect(dummyIPC.recorded.changeProtect).toHaveBeenCalledWith(8, true);
        });
    });

    describe('fileCleanup and uploads', () => {
        it('fileCleanup runs videoFileCleanup and dropLogFileCleanup sequentially', async () => {
            dummyIPC.recorded.videoFileCleanup.mockResolvedValue(undefined);
            dummyIPC.recorded.dropLogFileCleanup.mockResolvedValue(undefined);

            await model.fileCleanup();

            expect(dummyIPC.recorded.videoFileCleanup).toHaveBeenCalledTimes(1);
            expect(dummyIPC.recorded.dropLogFileCleanup).toHaveBeenCalledTimes(1);
        });

        it('addUploadedVideoFile delegates to ipc', async () => {
            dummyIPC.recorded.addUploadedVideoFile.mockResolvedValue(undefined);
            const opt: any = { recordedId: 1, filePath: '/tmp/test.mp4' };

            await model.addUploadedVideoFile(opt);
            expect(dummyIPC.recorded.addUploadedVideoFile).toHaveBeenCalledWith(opt);
        });

        it('createNewRecorded delegates to ipc', async () => {
            dummyIPC.recorded.createNewRecorded.mockResolvedValue(100);
            const opt: any = { name: '新規録画' };

            const id = await model.createNewRecorded(opt);
            expect(id).toBe(100);
            expect(dummyIPC.recorded.createNewRecorded).toHaveBeenCalledWith(opt);
        });
    });

    describe('history operations', () => {
        it('deleteHistory delegates to ipc', async () => {
            dummyIPC.recorded.deleteHistory.mockResolvedValue(undefined);
            await model.deleteHistory(5);
            expect(dummyIPC.recorded.deleteHistory).toHaveBeenCalledWith(5);
        });

        it('addHistory delegates to ipc', async () => {
            dummyIPC.recorded.addHistory.mockResolvedValue(undefined);
            await model.addHistory(5);
            expect(dummyIPC.recorded.addHistory).toHaveBeenCalledWith(5);
        });

        it('getHistory returns false when item not found', async () => {
            dummyRecordedDB.findId.mockResolvedValue(null);
            const result = await model.getHistory(999);
            expect(result).toEqual({ hasHistory: false });
        });

        it('getHistory returns history existence', async () => {
            const r = createDummyRecorded(1);
            dummyRecordedDB.findId.mockResolvedValue(r);
            dummyRecordedHistoryDB.hasHistory.mockResolvedValue(true);

            const result = await model.getHistory(1);
            expect(result).toEqual({ hasHistory: true });
        });
    });
});
