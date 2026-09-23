import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import EncodeApiModel from '../../src/model/api/encode/EncodeApiModel.js';

describe('EncodeApiModel Unit Tests', () => {
    let dummyEncodeManage: any;
    let dummyVideoFileDB: any;
    let dummyRecordedDB: any;
    let dummyRecordedItemUtil: any;
    let model: EncodeApiModel;

    beforeEach(() => {
        dummyEncodeManage = {
            getEncodeInfo: vi.fn().mockReturnValue({
                runningQueue: [],
                waitQueue: [],
            }),
            push: vi.fn().mockResolvedValue(999),
            cancel: vi.fn().mockResolvedValue(undefined),
        };
        dummyVideoFileDB = {
            findId: vi.fn().mockResolvedValue(null),
        };
        dummyRecordedDB = {
            findIds: vi.fn().mockResolvedValue([]),
        };
        dummyRecordedItemUtil = {
            convertRecordedToRecordedItem: vi.fn().mockImplementation((r, isHalfWidth) => ({
                id: r.id,
                name: isHalfWidth ? `Half_${r.name}` : r.name,
            })),
        };

        model = new EncodeApiModel(dummyEncodeManage, dummyVideoFileDB, dummyRecordedDB, dummyRecordedItemUtil);
    });

    describe('getAll', () => {
        it('returns empty lists when queues are empty', async () => {
            dummyEncodeManage.getEncodeInfo.mockReturnValue({
                runningQueue: [],
                waitQueue: [],
            });

            const result = await model.getAll(false);
            expect(result).toEqual({
                runningItems: [],
                waitItems: [],
            });
            expect(dummyRecordedDB.findIds).not.toHaveBeenCalled();
        });

        it('aggregates recorded items, maps percent and logs, and handles deduplication', async () => {
            dummyEncodeManage.getEncodeInfo.mockReturnValue({
                runningQueue: [
                    { id: 1, recordedId: 100, mode: 'mp4', percent: 45.5, log: 'frame=100' },
                    { id: 2, recordedId: 102, mode: 'm4a' }, // no percent or log
                ],
                waitQueue: [
                    { id: 3, recordedId: 100, mode: 'webm' }, // duplicate recordedId
                    { id: 4, recordedId: 999, mode: 'mp4' }, // non-existent recordedItem
                ],
            });

            dummyRecordedDB.findIds.mockResolvedValue([
                { id: 100, name: 'Recorded 100' },
                { id: 102, name: 'Recorded 102' },
            ]);

            const result = await model.getAll(true);

            // Deduplication check: should query unique IDs [100, 102, 999]
            expect(dummyRecordedDB.findIds).toHaveBeenCalledWith([100, 102, 999]);

            // Running items
            expect(result.runningItems).toHaveLength(2);
            expect(result.runningItems[0]).toEqual({
                id: 1,
                mode: 'mp4',
                recorded: { id: 100, name: 'Half_Recorded 100' },
                percent: 45.5,
                log: 'frame=100',
            });
            expect(result.runningItems[1]).toEqual({
                id: 2,
                mode: 'm4a',
                recorded: { id: 102, name: 'Half_Recorded 102' },
            });

            // Wait items (id: 4 with non-existent recorded 999 is skipped)
            expect(result.waitItems).toHaveLength(1);
            expect(result.waitItems[0]).toEqual({
                id: 3,
                mode: 'webm',
                recorded: { id: 100, name: 'Half_Recorded 100' },
            });
        });
    });

    describe('add', () => {
        it('throws OptionError when neither parentDir nor isSaveSameDirectory is provided', async () => {
            await expect(
                model.add({
                    recordedId: 10,
                    sourceVideoFileId: 20,
                    mode: 'mp4',
                    removeOriginal: false,
                } as any),
            ).rejects.toThrow('OptionError');
        });

        it('pushes encode job with explicit parentDir and directory', async () => {
            const addOption: any = {
                recordedId: 10,
                sourceVideoFileId: 20,
                parentDir: 'customDir',
                directory: 'subDir',
                mode: 'mp4',
                removeOriginal: true,
            };

            const encodeId = await model.add(addOption);
            expect(encodeId).toBe(999);
            expect(dummyEncodeManage.push).toHaveBeenCalledWith({
                recordedId: 10,
                sourceVideoFileId: 20,
                parentDir: 'customDir',
                directory: 'subDir',
                mode: 'mp4',
                removeOriginal: true,
            });
        });

        it('throws VideoFileIsNotFound when isSaveSameDirectory is true but video not found', async () => {
            dummyVideoFileDB.findId.mockResolvedValue(null);

            await expect(
                model.add({
                    recordedId: 10,
                    sourceVideoFileId: 20,
                    isSaveSameDirectory: true,
                    mode: 'mp4',
                    removeOriginal: false,
                } as any),
            ).rejects.toThrow('VideoFileIsNotFound');
        });

        it('resolves directory from video file path when isSaveSameDirectory is true (nested dir)', async () => {
            dummyVideoFileDB.findId.mockResolvedValue({
                id: 20,
                parentDirectoryName: 'parentStorage',
                filePath: 'anime/2026/test.ts',
            });

            const encodeId = await model.add({
                recordedId: 10,
                sourceVideoFileId: 20,
                isSaveSameDirectory: true,
                mode: 'mp4',
                removeOriginal: false,
            } as any);

            expect(encodeId).toBe(999);
            expect(dummyEncodeManage.push).toHaveBeenCalledWith({
                recordedId: 10,
                sourceVideoFileId: 20,
                parentDir: 'parentStorage',
                directory: 'anime/2026',
                mode: 'mp4',
                removeOriginal: false,
            });
        });

        it('omits directory if video filePath has no subdirectory (dot or root slash)', async () => {
            dummyVideoFileDB.findId.mockResolvedValue({
                id: 20,
                parentDirectoryName: 'parentStorage',
                filePath: 'test.ts', // dirname is '.'
            });

            const encodeId = await model.add({
                recordedId: 10,
                sourceVideoFileId: 20,
                isSaveSameDirectory: true,
                mode: 'mp4',
                removeOriginal: false,
            } as any);

            expect(encodeId).toBe(999);
            expect(dummyEncodeManage.push).toHaveBeenCalledWith({
                recordedId: 10,
                sourceVideoFileId: 20,
                parentDir: 'parentStorage',
                mode: 'mp4',
                removeOriginal: false,
            });
        });
    });

    describe('cancel', () => {
        it('delegates cancellation to encode manager', async () => {
            await model.cancel(123);
            expect(dummyEncodeManage.cancel).toHaveBeenCalledWith(123);
        });
    });
});
