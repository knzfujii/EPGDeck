import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Reserve from '../../src/db/entities/Reserve.js';
import FileUtil from '../../src/util/FileUtil.js';
import RecordingUtilModel from '../../src/model/operator/recording/RecordingUtilModel.js';

describe('RecordingUtilModel Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyExecuteManagementModel: any;
    let dummyChannelDB: any;
    let dummyProgramDB: any;
    let dummyVideoFileDB: any;
    let dummyVideoUtil: any;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
            }),
        };
        dummyConfig = {
            getConfig: () => ({
                recording: {
                    tempDir: '/record/tmp',
                    directories: [
                        { name: 'default', path: '/record/default' },
                        { name: 'storage2', path: '/record/storage2' },
                    ],
                    filenameFormat: '%TITLE%_%YEAR%%MONTH%%DAY%_%HOUR%%MIN%',
                    fileExtension: '.ts',
                },
            }),
        };
        dummyExecuteManagementModel = {
            getExecution: vi.fn().mockResolvedValue('exe-123'),
            unLockExecution: vi.fn(),
        };
        dummyChannelDB = {
            findId: vi.fn().mockResolvedValue({ id: 1, name: 'NHK総合' }),
        };
        dummyProgramDB = {
            findId: vi.fn().mockResolvedValue(null),
        };
        dummyVideoFileDB = {
            updateFilePath: vi.fn().mockResolvedValue(undefined),
            updateSize: vi.fn().mockResolvedValue(undefined),
        };
        dummyVideoUtil = {
            getFullFilePathFromId: vi.fn().mockResolvedValue('/record/tmp/test.ts'),
        };

        vi.spyOn(FileUtil, 'access').mockResolvedValue(undefined as any);
        vi.spyOn(FileUtil, 'mkdir').mockResolvedValue(undefined as any);
        vi.spyOn(FileUtil, 'stat').mockRejectedValue({ code: 'ENOENT' }); // 重複ファイルなし
        vi.spyOn(FileUtil, 'rename').mockResolvedValue(undefined as any);
        vi.spyOn(FileUtil, 'copyFile').mockResolvedValue(undefined as any);
        vi.spyOn(FileUtil, 'unlink').mockResolvedValue(undefined as any);
        vi.spyOn(FileUtil, 'getFileSize').mockResolvedValue(2048 * 1024);
    });

    const createModel = () => {
        return new RecordingUtilModel(
            dummyLogger,
            dummyConfig,
            dummyExecuteManagementModel,
            dummyChannelDB,
            dummyProgramDB,
            dummyVideoFileDB,
            dummyVideoUtil,
        );
    };

    describe('getRecPath', () => {
        it('uses tempDir when isEnableTmp is true', async () => {
            const model = createModel();
            const reserve = new Reserve();
            reserve.id = 1;
            reserve.channelId = 1;
            reserve.name = 'Test Program';
            reserve.startAt = new Date('2026-09-23T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-23T10:30:00+09:00').getTime();
            reserve.parentDirectoryName = 'storage2';
            reserve.directory = null;
            reserve.recordedFormat = null;

            const res = await model.getRecPath(reserve, true);

            expect(dummyExecuteManagementModel.getExecution).toHaveBeenCalled();
            expect(dummyExecuteManagementModel.unLockExecution).toHaveBeenCalledWith('exe-123');
            expect(res.parendDir.name).toBe('tmp');
            expect(res.parendDir.path).toBe('/record/tmp');
            expect(res.fullPath).toContain('/record/tmp');
        });

        it('selects matched parentDirectory when isEnableTmp is false', async () => {
            const model = createModel();
            const reserve = new Reserve();
            reserve.id = 2;
            reserve.channelId = 1;
            reserve.name = 'Test Program';
            reserve.startAt = new Date('2026-09-23T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-23T10:30:00+09:00').getTime();
            reserve.parentDirectoryName = 'storage2';
            reserve.directory = 'anime';
            reserve.recordedFormat = '%TITLE%';

            const res = await model.getRecPath(reserve, false);

            expect(res.parendDir.name).toBe('storage2');
            expect(res.parendDir.path).toBe('/record/storage2');
            expect(res.subDir).toBe('anime');
            expect(res.fileName).toBe('Test Program.ts');
            expect(res.fullPath).toBe('/record/storage2/anime/Test Program.ts');
        });

        it('falls back to default directory when parentDirectoryName is null', async () => {
            const model = createModel();
            const reserve = new Reserve();
            reserve.id = 3;
            reserve.channelId = 1;
            reserve.name = 'Default Program';
            reserve.startAt = new Date('2026-09-23T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-23T10:30:00+09:00').getTime();
            reserve.parentDirectoryName = null;
            reserve.directory = null;
            reserve.recordedFormat = '%TITLE%';

            const res = await model.getRecPath(reserve, false);

            expect(res.parendDir.name).toBe('default');
            expect(res.parendDir.path).toBe('/record/default');
            expect(res.fileName).toBe('Default Program.ts');
        });
    });

    describe('movingFromTmp', () => {
        it('renames file and updates videoFileDB on success', async () => {
            const model = createModel();
            const reserve = new Reserve();
            reserve.id = 1;
            reserve.channelId = 1;
            reserve.name = 'Move Test';
            reserve.startAt = new Date('2026-09-23T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-23T10:30:00+09:00').getTime();
            reserve.parentDirectoryName = null;
            reserve.directory = null;
            reserve.recordedFormat = '%TITLE%';

            const destPath = await model.movingFromTmp(reserve, 10);

            expect(FileUtil.rename).toHaveBeenCalledWith('/record/tmp/test.ts', '/record/default/Move Test.ts');
            expect(dummyVideoFileDB.updateFilePath).toHaveBeenCalledWith({
                videoFileId: 10,
                parentDirectoryName: 'default',
                filePath: 'Move Test.ts',
            });
            expect(destPath).toBe('/record/default/Move Test.ts');
        });

        it('falls back to copyFile when rename fails', async () => {
            vi.spyOn(FileUtil, 'rename').mockRejectedValueOnce(new Error('EXDEV: cross-device link not permitted'));

            const model = createModel();
            const reserve = new Reserve();
            reserve.id = 1;
            reserve.channelId = 1;
            reserve.name = 'Copy Fallback';
            reserve.startAt = new Date('2026-09-23T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-23T10:30:00+09:00').getTime();
            reserve.parentDirectoryName = null;
            reserve.directory = null;
            reserve.recordedFormat = '%TITLE%';

            await model.movingFromTmp(reserve, 10);

            expect(FileUtil.copyFile).toHaveBeenCalledWith('/record/tmp/test.ts', '/record/default/Copy Fallback.ts');
            expect(dummyVideoFileDB.updateFilePath).toHaveBeenCalled();
        });
    });

    describe('updateVideoFileSize', () => {
        it('updates file size in DB using actual file size', async () => {
            const model = createModel();
            await model.updateVideoFileSize(50);

            expect(dummyVideoUtil.getFullFilePathFromId).toHaveBeenCalledWith(50);
            expect(FileUtil.getFileSize).toHaveBeenCalledWith('/record/tmp/test.ts');
            expect(dummyVideoFileDB.updateSize).toHaveBeenCalledWith(50, 2048 * 1024);
        });

        it('throws VideoFilePathIsNull if file path cannot be resolved', async () => {
            dummyVideoUtil.getFullFilePathFromId.mockResolvedValueOnce(null);
            const model = createModel();

            await expect(model.updateVideoFileSize(999)).rejects.toThrow('VideoFilePathIsNull');
        });
    });
});
