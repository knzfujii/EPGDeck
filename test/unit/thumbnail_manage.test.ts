import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as sqliteSchema from '../../src/db/schema/sqlite';
import Thumbnail from '../../src/db/entities/Thumbnail';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator';
import ThumbnailDB from '../../src/model/db/ThumbnailDB';
import IPromiseRetry from '../../src/model/IPromiseRetry';
import ThumbnailManageModel from '../../src/model/operator/thumbnail/ThumbnailManageModel';
import FileUtil from '../../src/util/FileUtil';

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
});
