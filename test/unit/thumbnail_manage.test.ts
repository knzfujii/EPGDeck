import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sqliteSchema from '../../src/db/schema/sqlite/index.js';
import Thumbnail from '../../src/db/entities/Thumbnail.js';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator.js';
import ThumbnailDB from '../../src/model/db/ThumbnailDB.js';
import IPromiseRetry from '../../src/model/IPromiseRetry.js';
import ThumbnailManageModel from '../../src/model/operator/thumbnail/ThumbnailManageModel.js';
import FileUtil from '../../src/util/FileUtil.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Thumbnail Management & Sharding Tests', () => {
    describe('getSubDir Sharding Rule', () => {
        it('should correctly calculate 2-digit subdirectory name based on recordedId', () => {
            expect(ThumbnailManageModel.getSubDir(0)).toBe('00');
            expect(ThumbnailManageModel.getSubDir(1)).toBe('01');
            expect(ThumbnailManageModel.getSubDir(9)).toBe('09');
            expect(ThumbnailManageModel.getSubDir(10)).toBe('10');
            expect(ThumbnailManageModel.getSubDir(99)).toBe('99');
            expect(ThumbnailManageModel.getSubDir(100)).toBe('00');
            expect(ThumbnailManageModel.getSubDir(101)).toBe('01');
            expect(ThumbnailManageModel.getSubDir(12345)).toBe('45');
            expect(ThumbnailManageModel.getSubDir(987654)).toBe('54');
        });
    });

    describe('ThumbnailDB CRUD & updateFilePath', () => {
        let client: ReturnType<typeof createClient>;
        let db: ReturnType<typeof drizzle>;
        let thumbnailDB: ThumbnailDB;

        const dummyRetry: IPromiseRetry = {
            run: async <T>(fn: () => Promise<T>) => await fn(),
        } as any;

        beforeEach(async () => {
            client = createClient({ url: 'file::memory:?cache=shared' });
            db = drizzle(client, { schema: sqliteSchema });

            await client.execute(`
                CREATE TABLE IF NOT EXISTS thumbnail (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filePath TEXT NOT NULL,
                    recordedId INTEGER NOT NULL
                );
            `);

            const mockOperator: IDrizzleOperator = {
                getDB: () => ({ db, schema: sqliteSchema, type: 'sqlite' }) as any,
            } as any;

            thumbnailDB = new ThumbnailDB(mockOperator, dummyRetry);
        });

        it('should insert thumbnail and updateFilePath correctly', async () => {
            const thumb = new Thumbnail();
            thumb.filePath = '12345.jpg';
            thumb.recordedId = 12345;

            const insertedId = await thumbnailDB.insertOnce(thumb);
            expect(insertedId).toBeGreaterThan(0);

            const fetched = await thumbnailDB.findId(insertedId);
            expect(fetched).not.toBeNull();
            expect(fetched!.filePath).toBe('12345.jpg');
            expect(fetched!.recordedId).toBe(12345);

            // updateFilePath to sharded relative path
            const newRelativePath = '45/12345.jpg';
            await thumbnailDB.updateFilePath(insertedId, newRelativePath);

            const updated = await thumbnailDB.findId(insertedId);
            expect(updated).not.toBeNull();
            expect(updated!.filePath).toBe('45/12345.jpg');
        });
    });

    describe('Subdirectory cleanup & path structure', () => {
        const testBaseDir = path.join(__dirname, 'test_thumb_dir');

        beforeEach(async () => {
            await FileUtil.mkdir(testBaseDir);
        });

        afterEach(async () => {
            await fs.promises.rm(testBaseDir, { recursive: true, force: true });
        });

        it('should handle subdirectories and file listing accurately', async () => {
            const subDir = path.join(testBaseDir, '45');
            await FileUtil.mkdir(subDir);

            const testFile = path.join(subDir, '12345.jpg');
            await FileUtil.writeFile(testFile, 'dummy image content');

            const list = await FileUtil.getFileList(testBaseDir);
            expect(list.files).toContain(testFile);
            expect(list.directories).toContain(subDir);

            // remove file and test empty directory cleanup
            await FileUtil.unlink(testFile);
            expect(await FileUtil.isEmptyDirectory(subDir)).toBe(true);

            await fs.promises.rmdir(subDir);
            expect(fs.existsSync(subDir)).toBe(false);
        });

        it('should clean empty parent directory via cleanEmptyParentDir', async () => {
            const subDir = path.join(testBaseDir, '99');
            await FileUtil.mkdir(subDir);
            const testFile = path.join(subDir, '9999.jpg');

            // ファイルが存在しない状態（削除直後）で呼び出し
            await ThumbnailManageModel.cleanEmptyParentDir(testFile, testBaseDir);
            expect(fs.existsSync(subDir)).toBe(false);

            // ベースディレクトリ自身は決して削除されないことを確認
            await ThumbnailManageModel.cleanEmptyParentDir(path.join(testBaseDir, 'dummy.jpg'), testBaseDir);
            expect(fs.existsSync(testBaseDir)).toBe(true);
        });
    });

    describe('WebP Format & MIME Types', () => {
        it('should choose correct MIME type based on extension', () => {
            const getMimeType = (filePath: string) => {
                const ext = path.extname(filePath).toLowerCase();
                return ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
            };

            expect(getMimeType('45/12345.webp')).toBe('image/webp');
            expect(getMimeType('45/12345.jpg')).toBe('image/jpeg');
            expect(getMimeType('45/12345.jpeg')).toBe('image/jpeg');
            expect(getMimeType('45/12345.png')).toBe('image/png');
        });
    });

    describe('ThumbnailManageModel Model Tests', () => {
        const testBaseDir = path.join(__dirname, 'test_model_thumb_dir');
        let dummyLogger: any;
        let dummyConfig: any;
        let dummyQueue: any;
        let dummyRecordedDB: any;
        let dummyVideoFileDB: any;
        let dummyThumbnailDB: any;
        let dummyThumbnailEvent: any;
        let dummyVideoUtil: any;

        beforeEach(async () => {
            await FileUtil.mkdir(testBaseDir);

            dummyLogger = {
                getLogger: () => ({
                    system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
                }),
            };

            dummyConfig = {
                getConfig: () => ({
                    recording: {
                        thumbnail: {
                            path: testBaseDir,
                            format: 'jpg',
                            positionSeconds: 5,
                            size: '480x270',
                            cmd: null,
                        },
                    },
                    encode: {
                        binaries: { ffmpeg: '/usr/bin/ffmpeg' },
                    },
                }),
            };

            dummyQueue = {
                add: vi.fn().mockImplementation((task: () => Promise<any>) => void task()),
            };

            dummyRecordedDB = {
                findId: vi.fn().mockResolvedValue(null),
                findAll: vi.fn().mockResolvedValue([[]]),
            };

            dummyVideoFileDB = {
                findId: vi.fn().mockResolvedValue(null),
            };

            dummyThumbnailDB = {
                findId: vi.fn().mockResolvedValue(null),
                findAll: vi.fn().mockResolvedValue([]),
                insertOnce: vi.fn().mockResolvedValue(1),
                deleteOnce: vi.fn().mockResolvedValue(undefined),
            };

            dummyThumbnailEvent = {
                emitAdded: vi.fn(),
                emitDeleted: vi.fn(),
            };

            dummyVideoUtil = {
                getFullFilePathFromId: vi.fn().mockResolvedValue('/video/test.ts'),
            };
        });

        afterEach(async () => {
            await fs.promises.rm(testBaseDir, { recursive: true, force: true });
        });

        const createModel = () => {
            return new ThumbnailManageModel(
                dummyLogger,
                dummyConfig,
                dummyQueue,
                dummyRecordedDB,
                dummyVideoFileDB,
                dummyThumbnailDB,
                dummyThumbnailEvent,
                dummyVideoUtil,
            );
        };

        describe('delete', () => {
            it('throws ThumbnailIsNotFound when thumbnailId does not exist', async () => {
                const model = createModel();
                dummyThumbnailDB.findId.mockResolvedValue(null);

                await expect(model.delete(999)).rejects.toThrow('ThumbnailIsNotFound');
            });

            it('deletes physical file, deletes DB record, removes empty parent dir, and emits deleted event', async () => {
                const model = createModel();
                const subDir = path.join(testBaseDir, '45');
                await FileUtil.mkdir(subDir);
                const filePath = path.join(subDir, '12345.jpg');
                await FileUtil.writeFile(filePath, 'dummy image');

                const thumb = new Thumbnail();
                thumb.id = 10;
                thumb.filePath = '45/12345.jpg';
                thumb.recordedId = 12345;
                dummyThumbnailDB.findId.mockResolvedValue(thumb);

                await model.delete(10);

                expect(dummyThumbnailDB.deleteOnce).toHaveBeenCalledWith(10);
                expect(fs.existsSync(filePath)).toBe(false);
                expect(fs.existsSync(subDir)).toBe(false); // 空になったのでサブディレクトリも削除される
                expect(dummyThumbnailEvent.emitDeleted).toHaveBeenCalledTimes(1);
            });

            it('safely handles missing file (ENOENT) during deletion', async () => {
                const model = createModel();
                const thumb = new Thumbnail();
                thumb.id = 20;
                thumb.filePath = '99/non_existing.jpg';
                thumb.recordedId = 9999;
                dummyThumbnailDB.findId.mockResolvedValue(thumb);

                // 実ファイルが存在しなくてもエラーにならず削除処理が進むこと
                await model.delete(20);

                expect(dummyThumbnailDB.deleteOnce).toHaveBeenCalledWith(20);
                expect(dummyThumbnailEvent.emitDeleted).toHaveBeenCalledTimes(1);
            });
        });

        describe('cleanEmptyParentDir', () => {
            it('does not delete parent dir if another file exists inside', async () => {
                const subDir = path.join(testBaseDir, '12');
                await FileUtil.mkdir(subDir);
                const file1 = path.join(subDir, 'file1.jpg');
                const file2 = path.join(subDir, 'file2.jpg');
                await FileUtil.writeFile(file1, 'data');
                await FileUtil.writeFile(file2, 'data');

                await FileUtil.unlink(file1);
                await ThumbnailManageModel.cleanEmptyParentDir(file1, testBaseDir);

                expect(fs.existsSync(subDir)).toBe(true);
            });

            it('does not delete directory outside baseDir', async () => {
                const outsideDir = path.join(__dirname, 'outside_thumb_dir');
                await FileUtil.mkdir(outsideDir);
                const testFile = path.join(outsideDir, 'test.jpg');

                await ThumbnailManageModel.cleanEmptyParentDir(testFile, testBaseDir);
                expect(fs.existsSync(outsideDir)).toBe(true);

                await fs.promises.rm(outsideDir, { recursive: true, force: true });
            });
        });

        describe('regenerate', () => {
            it('adds videoFile to queue when recorded has no thumbnails', async () => {
                const model = createModel();
                const recordedWithoutThumb: any = {
                    id: 1,
                    videoFiles: [{ id: 101, recordedId: 1 }],
                    thumbnails: [],
                };
                dummyRecordedDB.findAll.mockResolvedValue([[recordedWithoutThumb]]);

                const addSpy = vi.spyOn(model, 'add');
                await model.regenerate();

                expect(addSpy).toHaveBeenCalledWith(101);
            });

            it('skips when recorded has valid thumbnail file', async () => {
                const model = createModel();
                const subDir = path.join(testBaseDir, '01');
                await FileUtil.mkdir(subDir);
                const validFile = path.join(subDir, '1.jpg');
                await FileUtil.writeFile(validFile, 'image data');

                const recordedWithValidThumb: any = {
                    id: 1,
                    videoFiles: [{ id: 101, recordedId: 1 }],
                    thumbnails: [{ id: 5, filePath: '01/1.jpg' }],
                };
                dummyRecordedDB.findAll.mockResolvedValue([[recordedWithValidThumb]]);

                const addSpy = vi.spyOn(model, 'add');
                await model.regenerate();

                expect(addSpy).not.toHaveBeenCalled();
                expect(dummyThumbnailDB.deleteOnce).not.toHaveBeenCalled();
            });

            it('deletes missing thumbnail record and adds to regenerate queue when file is missing', async () => {
                const model = createModel();
                const recordedWithMissingThumb: any = {
                    id: 2,
                    videoFiles: [{ id: 202, recordedId: 2 }],
                    thumbnails: [{ id: 99, filePath: '02/missing.jpg' }],
                };
                dummyRecordedDB.findAll.mockResolvedValue([[recordedWithMissingThumb]]);

                const addSpy = vi.spyOn(model, 'add');
                await model.regenerate();

                expect(dummyThumbnailDB.deleteOnce).toHaveBeenCalledWith(99);
                expect(addSpy).toHaveBeenCalledWith(202);
            });

            it('skips recorded item when it has no videoFiles', async () => {
                const model = createModel();
                const recordedWithoutVideo: any = {
                    id: 3,
                    videoFiles: [],
                    thumbnails: [],
                };
                dummyRecordedDB.findAll.mockResolvedValue([[recordedWithoutVideo]]);

                const addSpy = vi.spyOn(model, 'add');
                await model.regenerate();

                expect(addSpy).not.toHaveBeenCalled();
            });
        });

        describe('fileCleanup', () => {
            it('deletes DB records for missing files, unlinks orphan files, and removes empty dirs', async () => {
                const model = createModel();
                const subDir1 = path.join(testBaseDir, '01');
                const subDir2 = path.join(testBaseDir, '02');
                await FileUtil.mkdir(subDir1);
                await FileUtil.mkdir(subDir2);

                // 1. 正常なファイル & DB レコード
                const validFile = path.join(subDir1, '1.jpg');
                await FileUtil.writeFile(validFile, 'valid image');

                // 2. 孤立ファイル（ファイルはあるが DB レコードなし）
                const orphanFile = path.join(subDir2, 'orphan.jpg');
                await FileUtil.writeFile(orphanFile, 'orphan image');

                // DB 上のレコード（1: 正常ファイル, 2: 実ファイルなし）
                const thumbValid = new Thumbnail();
                thumbValid.id = 1;
                thumbValid.filePath = '01/1.jpg';

                const thumbMissing = new Thumbnail();
                thumbMissing.id = 2;
                thumbMissing.filePath = '03/missing.jpg';

                dummyThumbnailDB.findAll.mockResolvedValue([thumbValid, thumbMissing]);

                await model.fileCleanup();

                // DB 上にファイルがないレコードは削除される
                expect(dummyThumbnailDB.deleteOnce).toHaveBeenCalledWith(2);
                expect(dummyThumbnailDB.deleteOnce).not.toHaveBeenCalledWith(1);

                // 孤立ファイルは削除される
                expect(fs.existsSync(orphanFile)).toBe(false);
                // 正常ファイルは維持される
                expect(fs.existsSync(validFile)).toBe(true);
                // 孤立ファイル削除で空になった subDir2 は削除される
                expect(fs.existsSync(subDir2)).toBe(false);
                // 正常ファイルが残っている subDir1 は維持される
                expect(fs.existsSync(subDir1)).toBe(true);
            });
        });
    });
});
