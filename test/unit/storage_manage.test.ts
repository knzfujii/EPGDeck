import 'reflect-metadata';
import * as fs from 'fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import StorageManageModel from '../../src/model/operator/storage/StorageManageModel.js';

describe('StorageManageModel Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyRecordedManage: any;
    let dummyRecordedDB: any;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyRecordedManage = {
            delete: vi.fn().mockResolvedValue(undefined),
        };
        dummyRecordedDB = {
            findOld: vi.fn(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should not delete recorded files when free storage is above limitThreshold (in MB)', async () => {
        // 100GB = 102400 MB threshold, available free = 150GB (153600 MB)
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    storageCheckIntervalSeconds: 60,
                    directories: [
                        {
                            name: 'recorded',
                            path: '/dummy/recorded',
                            limitThreshold: 102400, // 100GB in MB
                            action: 'remove',
                        },
                    ],
                },
            }),
        };

        // 150 GB in bytes = 150 * 1024 * 1024 * 1024 bytes
        // 1 block = 4096 bytes
        const freeBytes = 150 * 1024 * 1024 * 1024;
        vi.spyOn(fs.promises, 'statfs').mockResolvedValue({
            bavail: freeBytes / 4096,
            bsize: 4096,
        } as any);

        const model = new StorageManageModel(dummyLogger, dummyConfig, dummyRecordedManage, dummyRecordedDB);

        // private check 呼び出し
        await (model as any).check(dummyConfig.getConfig().recording.directories);

        expect(dummyRecordedDB.findOld).not.toHaveBeenCalled();
        expect(dummyRecordedManage.delete).not.toHaveBeenCalled();
    });

    it('should delete recorded files until free storage exceeds limitThreshold (in MB)', async () => {
        // 100GB = 102400 MB threshold
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    storageCheckIntervalSeconds: 60,
                    directories: [
                        {
                            name: 'recorded',
                            path: '/dummy/recorded',
                            limitThreshold: 102400, // 100GB in MB
                            action: 'remove',
                        },
                    ],
                },
            }),
        };

        // 3段階で空き容量が変化:
        // 1回目: 80GB (81920 MB) -> 閾値(102400)以下なので削除対象
        // 2回目(1件削除後): 95GB (97280 MB) -> まだ閾値以下なので2件目削除
        // 3回目(2件削除後): 110GB (112640 MB) -> 閾値を超えたのでループ終了
        const statfsSpy = vi.spyOn(fs.promises, 'statfs');
        statfsSpy
            .mockResolvedValueOnce({
                bavail: (80 * 1024 * 1024 * 1024) / 4096,
                bsize: 4096,
            } as any)
            .mockResolvedValueOnce({
                bavail: (95 * 1024 * 1024 * 1024) / 4096,
                bsize: 4096,
            } as any)
            .mockResolvedValueOnce({
                bavail: (110 * 1024 * 1024 * 1024) / 4096,
                bsize: 4096,
            } as any);

        dummyRecordedDB.findOld
            .mockResolvedValueOnce({ id: 101, name: 'old_recording_1' })
            .mockResolvedValueOnce({ id: 102, name: 'old_recording_2' });

        const model = new StorageManageModel(dummyLogger, dummyConfig, dummyRecordedManage, dummyRecordedDB);

        await (model as any).check(dummyConfig.getConfig().recording.directories);

        expect(dummyRecordedDB.findOld).toHaveBeenCalledTimes(2);
        expect(dummyRecordedManage.delete).toHaveBeenCalledTimes(2);
        expect(dummyRecordedManage.delete).toHaveBeenNthCalledWith(1, 101);
        expect(dummyRecordedManage.delete).toHaveBeenNthCalledWith(2, 102);
    });

    it('should not delete files if action is not remove even when free storage is below limitThreshold', async () => {
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    storageCheckIntervalSeconds: 60,
                    directories: [
                        {
                            name: 'recorded',
                            path: '/dummy/recorded',
                            limitThreshold: 102400,
                            action: 'none',
                        },
                    ],
                },
            }),
        };

        // 50GB (51200 MB)
        vi.spyOn(fs.promises, 'statfs').mockResolvedValue({
            bavail: (50 * 1024 * 1024 * 1024) / 4096,
            bsize: 4096,
        } as any);

        const model = new StorageManageModel(dummyLogger, dummyConfig, dummyRecordedManage, dummyRecordedDB);

        await (model as any).check(dummyConfig.getConfig().recording.directories);

        expect(dummyRecordedDB.findOld).not.toHaveBeenCalled();
        expect(dummyRecordedManage.delete).not.toHaveBeenCalled();
    });

    it('should correctly calculate free size in MB via getFreeSizeMB', async () => {
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    storageCheckIntervalSeconds: 60,
                    directories: [],
                },
            }),
        };

        // 100GB = 100 * 1024 * 1024 * 1024 bytes = 107,374,182,400 bytes
        const bytes = 100 * 1024 * 1024 * 1024;
        vi.spyOn(fs.promises, 'statfs').mockResolvedValue({
            bavail: bytes / 4096,
            bsize: 4096,
        } as any);

        const model = new StorageManageModel(dummyLogger, dummyConfig, dummyRecordedManage, dummyRecordedDB);
        const freeMB = await (model as any).getFreeSizeMB('/dummy/path');

        expect(freeMB).toBe(102400); // exactly 100GB in MB
    });
});
