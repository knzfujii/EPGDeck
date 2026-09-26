import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as sqliteSchema from '../../src/db/schema/sqlite/index.js';
import VideoFile from '../../src/db/entities/VideoFile.js';
import VideoFileDB from '../../src/model/db/VideoFileDB.js';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator.js';
import IPromiseRetry from '../../src/model/IPromiseRetry.js';
import MoveRecordedFiles, { MoveRecordedFilesCore } from '../../src/tools/MoveRecordedFiles.js';
import { RecordedDirInfo } from '../../src/model/IConfigFile.js';
import FileUtil from '../../src/util/FileUtil.js';

describe('MoveRecordedFiles', () => {
    describe('MoveRecordedFilesCore CLI Option Parsing', () => {
        it('should parse positional arguments as query', () => {
            const result = MoveRecordedFilesCore.parseCLIOptions(['my_anime']);
            expect(result.query).toBe('my_anime');
            expect(result.dryRun).toBeUndefined();
            expect(result.yes).toBe(false);
        });

        it('should parse --query option', () => {
            const result = MoveRecordedFilesCore.parseCLIOptions(['--query', 'drama']);
            expect(result.query).toBe('drama');
        });

        it('should parse short options: -q, -s, -d, -r, -n, -y, -h', () => {
            const result = MoveRecordedFilesCore.parseCLIOptions([
                '-q',
                'news',
                '-s',
                '1',
                '-d',
                '2',
                '-r',
                'archives',
                '-n',
                '-y',
            ]);
            expect(result.query).toBe('news');
            expect(result.src).toBe('1');
            expect(result.dst).toBe('2');
            expect(result.destRelPath).toBe('archives');
            expect(result.dryRun).toBe(true);
            expect(result.yes).toBe(true);
        });

        it('should parse long options: --src, --dst, --dest-relpath, --dry-run, --yes', () => {
            const result = MoveRecordedFilesCore.parseCLIOptions([
                '--query',
                'movie',
                '--src',
                'recorded',
                '--dst',
                'storage2',
                '--dest-relpath',
                'movies/2026',
                '--dry-run',
                '--yes',
            ]);
            expect(result.query).toBe('movie');
            expect(result.src).toBe('recorded');
            expect(result.dst).toBe('storage2');
            expect(result.destRelPath).toBe('movies/2026');
            expect(result.dryRun).toBe(true);
            expect(result.yes).toBe(true);
        });

        it('should handle help flag', () => {
            const result = MoveRecordedFilesCore.parseCLIOptions(['--help']);
            expect(result.help).toBe(true);
        });

        it('should parse cleanupEmptyDirs option correctly', () => {
            expect(MoveRecordedFilesCore.parseCLIOptions([]).cleanupEmptyDirs).toBe(true);
            expect(MoveRecordedFilesCore.parseCLIOptions(['-k']).cleanupEmptyDirs).toBe(false);
            expect(MoveRecordedFilesCore.parseCLIOptions(['--keep-empty-dirs']).cleanupEmptyDirs).toBe(false);
            expect(MoveRecordedFilesCore.parseCLIOptions(['--cleanup-empty-dirs']).cleanupEmptyDirs).toBe(true);
        });
    });

    describe('MoveRecordedFilesCore Parent Resolution', () => {
        const dirs: RecordedDirInfo[] = [
            { name: 'recorded', path: '/mnt/storage1/recorded' },
            { name: 'archive', path: '/mnt/storage2/archive' },
            { name: 'fast_ssd', path: '/mnt/ssd/recorded' },
        ];

        it('should resolve by 1-based index string', () => {
            expect(MoveRecordedFilesCore.resolveParent('1', dirs)).toEqual(dirs[0]);
            expect(MoveRecordedFilesCore.resolveParent('2', dirs)).toEqual(dirs[1]);
            expect(MoveRecordedFilesCore.resolveParent('3', dirs)).toEqual(dirs[2]);
        });

        it('should resolve by exact name', () => {
            expect(MoveRecordedFilesCore.resolveParent('recorded', dirs)).toEqual(dirs[0]);
            expect(MoveRecordedFilesCore.resolveParent('archive', dirs)).toEqual(dirs[1]);
        });

        it('should return null for out-of-range index or unknown name', () => {
            expect(MoveRecordedFilesCore.resolveParent('0', dirs)).toBeNull();
            expect(MoveRecordedFilesCore.resolveParent('4', dirs)).toBeNull();
            expect(MoveRecordedFilesCore.resolveParent('non_existent', dirs)).toBeNull();
        });
    });

    describe('MoveRecordedFilesCore File Path Calculation', () => {
        it('should preserve original filePath when destRelPath is undefined or empty', () => {
            expect(MoveRecordedFilesCore.calculateNewFilePath('2026/09/sample.mp4', undefined)).toBe(
                '2026/09/sample.mp4',
            );
            expect(MoveRecordedFilesCore.calculateNewFilePath('2026/09/sample.mp4', '')).toBe('2026/09/sample.mp4');
            expect(MoveRecordedFilesCore.calculateNewFilePath('2026/09/sample.mp4', '   ')).toBe('2026/09/sample.mp4');
        });

        it('should prepend destRelPath to the base filename', () => {
            expect(MoveRecordedFilesCore.calculateNewFilePath('2026/09/sample.mp4', 'anime')).toBe('anime/sample.mp4');
            expect(MoveRecordedFilesCore.calculateNewFilePath('sample.ts', 'movies/2026')).toBe(
                'movies/2026/sample.ts',
            );
        });

        it('should normalize Windows backslashes', () => {
            expect(MoveRecordedFilesCore.calculateNewFilePath('sample.mp4', 'anime\\season1')).toBe(
                'anime/season1/sample.mp4',
            );
        });
    });

    describe('VideoFileDB.findByParentAndQuery DB Operations', () => {
        let client: ReturnType<typeof createClient>;
        let db: ReturnType<typeof drizzle>;
        let videoFileDB: VideoFileDB;

        const dummyRetry: IPromiseRetry = {
            run: async <T>(fn: () => Promise<T>) => await fn(),
        } as any;

        beforeEach(async () => {
            client = createClient({ url: 'file::memory:?cache=shared' });
            db = drizzle(client, { schema: sqliteSchema });

            await client.execute(`
                CREATE TABLE IF NOT EXISTS video_file (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    recordedId INTEGER NOT NULL,
                    parentDirectoryName TEXT NOT NULL,
                    filePath TEXT NOT NULL,
                    type TEXT NOT NULL,
                    name TEXT NOT NULL,
                    size INTEGER NOT NULL DEFAULT 0
                );
            `);

            const mockDrizzleOp: IDrizzleOperator = {
                getDB: () => ({
                    type: 'sqlite',
                    db: db as any,
                    rawClient: client,
                    schema: sqliteSchema,
                }),
                checkConnection: vi.fn(),
                closeConnection: vi.fn(),
            };

            videoFileDB = new VideoFileDB(mockDrizzleOp, dummyRetry);

            // テストデータを挿入
            const vf1 = new VideoFile();
            vf1.recordedId = 1;
            vf1.parentDirectoryName = 'recorded';
            vf1.filePath = 'anime/my_favorite_show_ep01.mp4';
            vf1.type = 'encoded';
            vf1.name = '720p';
            vf1.size = 1024000;
            await videoFileDB.insertOnce(vf1);

            const vf2 = new VideoFile();
            vf2.recordedId = 2;
            vf2.parentDirectoryName = 'recorded';
            vf2.filePath = 'drama/sunday_drama_ep01.mp4';
            vf2.type = 'encoded';
            vf2.name = '720p';
            vf2.size = 2048000;
            await videoFileDB.insertOnce(vf2);

            const vf3 = new VideoFile();
            vf3.recordedId = 3;
            vf3.parentDirectoryName = 'archive';
            vf3.filePath = 'anime/archive_favorite_ep02.mp4';
            vf3.type = 'encoded';
            vf3.name = '720p';
            vf3.size = 1536000;
            await videoFileDB.insertOnce(vf3);
        });

        afterEach(async () => {
            await client.execute('DROP TABLE IF EXISTS video_file;');
            client.close();
        });

        it('should find records matching parentDirectoryName and substring query', async () => {
            const results = await videoFileDB.findByParentAndQuery('recorded', 'favorite');
            expect(results.length).toBe(1);
            expect(results[0].filePath).toBe('anime/my_favorite_show_ep01.mp4');
            expect(results[0].parentDirectoryName).toBe('recorded');
        });

        it('should not match records under different parentDirectoryName even if query matches', async () => {
            const results = await videoFileDB.findByParentAndQuery('recorded', 'archive_favorite');
            expect(results.length).toBe(0);

            const archiveResults = await videoFileDB.findByParentAndQuery('archive', 'archive_favorite');
            expect(archiveResults.length).toBe(1);
        });

        it('should return empty array if no match is found', async () => {
            const results = await videoFileDB.findByParentAndQuery('recorded', 'nonexistent_keyword');
            expect(results.length).toBe(0);
        });

        it('should successfully update parentDirectoryName and filePath via updateFilePath', async () => {
            const records = await videoFileDB.findByParentAndQuery('recorded', 'favorite');
            expect(records.length).toBe(1);
            const targetId = records[0].id;

            await videoFileDB.updateFilePath({
                videoFileId: targetId,
                parentDirectoryName: 'archive',
                filePath: 'moved/my_favorite_show_ep01.mp4',
            });

            const updated = await videoFileDB.findId(targetId);
            expect(updated).not.toBeNull();
            expect(updated!.parentDirectoryName).toBe('archive');
            expect(updated!.filePath).toBe('moved/my_favorite_show_ep01.mp4');
        });
    });

    describe('File operations and rollback', () => {
        let tempDir: string;
        let srcDir: string;
        let dstDir: string;

        beforeEach(async () => {
            tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'epgdeck-test-move-'));
            srcDir = path.join(tempDir, 'src');
            dstDir = path.join(tempDir, 'dst');
            await fs.promises.mkdir(srcDir, { recursive: true });
            await fs.promises.mkdir(dstDir, { recursive: true });
        });

        afterEach(async () => {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        });

        it('should move file and create destination directories', async () => {
            const srcFile = path.join(srcDir, 'test.mp4');
            const dstFile = path.join(dstDir, 'nested', 'test.mp4');

            await fs.promises.writeFile(srcFile, 'dummy content');
            expect(fs.existsSync(srcFile)).toBe(true);

            await FileUtil.mkdir(path.dirname(dstFile));
            await FileUtil.move(srcFile, dstFile);

            expect(fs.existsSync(srcFile)).toBe(false);
            expect(fs.existsSync(dstFile)).toBe(true);
            expect(await fs.promises.readFile(dstFile, 'utf-8')).toBe('dummy content');
        });

        it('should rollback file move when error occurs', async () => {
            const srcFile = path.join(srcDir, 'rollback.mp4');
            const dstFile = path.join(dstDir, 'rollback.mp4');

            await fs.promises.writeFile(srcFile, 'important video');

            // 移動実行
            await FileUtil.move(srcFile, dstFile);
            expect(fs.existsSync(srcFile)).toBe(false);
            expect(fs.existsSync(dstFile)).toBe(true);

            // ロールバックシミュレーション
            await FileUtil.move(dstFile, srcFile);
            expect(fs.existsSync(srcFile)).toBe(true);
            expect(fs.existsSync(dstFile)).toBe(false);
            expect(await fs.promises.readFile(srcFile, 'utf-8')).toBe('important video');
        });

        it('should move file with progress tracking via MoveRecordedFilesCore.moveFile', async () => {
            const srcFile = path.join(srcDir, 'progress_test.mp4');
            const dstFile = path.join(dstDir, 'progress_test.mp4');
            await fs.promises.writeFile(srcFile, 'streaming content');

            let progressCalled = false;
            await MoveRecordedFilesCore.moveFile(srcFile, dstFile, (percent, transferred, total) => {
                progressCalled = true;
                expect(percent).toBeGreaterThanOrEqual(0);
                expect(transferred).toBeGreaterThanOrEqual(0);
                expect(total).toBeGreaterThan(0);
            });

            expect(progressCalled).toBe(true);
            expect(fs.existsSync(srcFile)).toBe(false);
            expect(fs.existsSync(dstFile)).toBe(true);
        });

        it('should safely clean empty parent directories and stop at root or non-empty directory', async () => {
            // 構造:
            // srcDir/
            //   ├── anime/
            //   │   ├── keep.mp4          <- 他のファイルが存在
            //   │   └── 2026/
            //   │       └── title/
            //   │           └── target.mp4 <- これを移動
            const targetDir = path.join(srcDir, 'anime', '2026', 'title');
            await fs.promises.mkdir(targetDir, { recursive: true });
            const targetFile = path.join(targetDir, 'target.mp4');
            const keepFile = path.join(srcDir, 'anime', 'keep.mp4');
            await fs.promises.writeFile(targetFile, 'target');
            await fs.promises.writeFile(keepFile, 'keep');

            // target.mp4 を削除（移動完了後の状態）
            await fs.promises.unlink(targetFile);

            // cleanEmptyParentDirectories 実行
            const removedDirs = await MoveRecordedFilesCore.cleanEmptyParentDirectories(targetFile, srcDir);

            // title/ と 2026/ は空なので削除される
            expect(removedDirs).toEqual([
                path.resolve(path.join(srcDir, 'anime', '2026', 'title')),
                path.resolve(path.join(srcDir, 'anime', '2026')),
            ]);

            expect(fs.existsSync(targetDir)).toBe(false);
            expect(fs.existsSync(path.join(srcDir, 'anime', '2026'))).toBe(false);

            // anime/ には keep.mp4 が残っているので削除されない
            expect(fs.existsSync(path.join(srcDir, 'anime'))).toBe(true);
            expect(fs.existsSync(keepFile)).toBe(true);

            // ルート srcDir も絶対に削除されない
            expect(fs.existsSync(srcDir)).toBe(true);
        });
    });

    describe('MoveRecordedFiles.executeMove Integration Tests', () => {
        let tempDir: string;
        let srcDirInfo: RecordedDirInfo;
        let dstDirInfo: RecordedDirInfo;
        let moveRecordedTool: MoveRecordedFiles;
        let mockVideoFileDB: any;
        let mockLogger: any;

        beforeEach(async () => {
            tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'epgdeck-test-exec-'));
            const srcPath = path.join(tempDir, 'recorded1');
            const dstPath = path.join(tempDir, 'recorded2');
            await fs.promises.mkdir(srcPath, { recursive: true });
            await fs.promises.mkdir(dstPath, { recursive: true });

            srcDirInfo = { name: 'recorded1', path: srcPath };
            dstDirInfo = { name: 'recorded2', path: dstPath };

            mockVideoFileDB = {
                updateFilePath: vi.fn().mockResolvedValue(undefined),
            };

            mockLogger = {
                system: {
                    info: vi.fn(),
                    warn: vi.fn(),
                    error: vi.fn(),
                },
            };

            moveRecordedTool = new MoveRecordedFiles();
            moveRecordedTool.setDependenciesForTest({
                log: mockLogger,
                videoFileDB: mockVideoFileDB,
            });
        });

        afterEach(async () => {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        });

        it('should move file, update DB, and report correct summary', async () => {
            const srcFilePath = path.join(srcDirInfo.path, 'anime', 'ep01.mp4');
            await fs.promises.mkdir(path.dirname(srcFilePath), { recursive: true });
            await fs.promises.writeFile(srcFilePath, 'content ep01');

            const record = new VideoFile();
            record.id = 100;
            record.parentDirectoryName = 'recorded1';
            record.filePath = 'anime/ep01.mp4';

            const summary = await moveRecordedTool.executeMove({
                records: [record],
                srcDir: srcDirInfo,
                dstDir: dstDirInfo,
                destRelPath: 'archive',
                isDryRun: false,
            });

            expect(summary.totalRecords).toBe(1);
            expect(summary.movedCount).toBe(1);
            expect(summary.errorCount).toBe(0);
            expect(summary.missingCount).toBe(0);

            // ファイルが移動されたことを確認
            const expectedDstPath = path.join(dstDirInfo.path, 'archive', 'ep01.mp4');
            expect(fs.existsSync(srcFilePath)).toBe(false);
            expect(fs.existsSync(expectedDstPath)).toBe(true);

            // DB が更新されたことを確認
            expect(mockVideoFileDB.updateFilePath).toHaveBeenCalledWith({
                videoFileId: 100,
                parentDirectoryName: 'recorded2',
                filePath: 'archive/ep01.mp4',
            });
        });

        it('should handle dry-run mode without modifying filesystem or DB', async () => {
            const srcFilePath = path.join(srcDirInfo.path, 'anime', 'ep01.mp4');
            await fs.promises.mkdir(path.dirname(srcFilePath), { recursive: true });
            await fs.promises.writeFile(srcFilePath, 'content ep01');

            const record = new VideoFile();
            record.id = 101;
            record.parentDirectoryName = 'recorded1';
            record.filePath = 'anime/ep01.mp4';

            const summary = await moveRecordedTool.executeMove({
                records: [record],
                srcDir: srcDirInfo,
                dstDir: dstDirInfo,
                destRelPath: 'archive',
                isDryRun: true,
            });

            expect(summary.movedCount).toBe(1);
            expect(fs.existsSync(srcFilePath)).toBe(true);
            expect(mockVideoFileDB.updateFilePath).not.toHaveBeenCalled();
        });

        it('should handle no-op when src and dst parent and filePath are identical', async () => {
            const record = new VideoFile();
            record.id = 102;
            record.parentDirectoryName = 'recorded1';
            record.filePath = 'anime/ep01.mp4';

            const summary = await moveRecordedTool.executeMove({
                records: [record],
                srcDir: srcDirInfo,
                dstDir: srcDirInfo,
                destRelPath: undefined,
                isDryRun: false,
            });

            expect(summary.noOpCount).toBe(1);
            expect(summary.movedCount).toBe(0);
            expect(mockVideoFileDB.updateFilePath).not.toHaveBeenCalled();
        });

        it('should perform self-healing if source file is missing but destination file already exists', async () => {
            // 移動先が既に存在している状態
            const dstFilePath = path.join(dstDirInfo.path, 'archive', 'ep01.mp4');
            await fs.promises.mkdir(path.dirname(dstFilePath), { recursive: true });
            await fs.promises.writeFile(dstFilePath, 'already at destination');

            const record = new VideoFile();
            record.id = 103;
            record.parentDirectoryName = 'recorded1';
            record.filePath = 'anime/ep01.mp4';

            const summary = await moveRecordedTool.executeMove({
                records: [record],
                srcDir: srcDirInfo,
                dstDir: dstDirInfo,
                destRelPath: 'archive',
                isDryRun: false,
            });

            expect(summary.selfHealedCount).toBe(1);
            expect(summary.movedCount).toBe(0);
            expect(summary.missingCount).toBe(0);
            expect(mockVideoFileDB.updateFilePath).toHaveBeenCalledWith({
                videoFileId: 103,
                parentDirectoryName: 'recorded2',
                filePath: 'archive/ep01.mp4',
            });
        });

        it('should rollback file move if DB update throws an error', async () => {
            const srcFilePath = path.join(srcDirInfo.path, 'anime', 'ep01.mp4');
            await fs.promises.mkdir(path.dirname(srcFilePath), { recursive: true });
            await fs.promises.writeFile(srcFilePath, 'rollback content');

            mockVideoFileDB.updateFilePath.mockRejectedValueOnce(new Error('DB failure'));

            const record = new VideoFile();
            record.id = 104;
            record.parentDirectoryName = 'recorded1';
            record.filePath = 'anime/ep01.mp4';

            const summary = await moveRecordedTool.executeMove({
                records: [record],
                srcDir: srcDirInfo,
                dstDir: dstDirInfo,
                destRelPath: 'archive',
                isDryRun: false,
            });

            expect(summary.errorCount).toBe(1);
            expect(summary.movedCount).toBe(0);

            // ファイルがロールバックされて元の場所に戻っていることを確認
            expect(fs.existsSync(srcFilePath)).toBe(true);
            const expectedDstPath = path.join(dstDirInfo.path, 'archive', 'ep01.mp4');
            expect(fs.existsSync(expectedDstPath)).toBe(false);
            expect(await fs.promises.readFile(srcFilePath, 'utf-8')).toBe('rollback content');
        });

        it('should clean up empty directories after successful move when cleanupEmptyDirs is true', async () => {
            const nestedDir = path.join(srcDirInfo.path, 'nested', 'subfolder');
            await fs.promises.mkdir(nestedDir, { recursive: true });
            const srcFilePath = path.join(nestedDir, 'clean_me.mp4');
            await fs.promises.writeFile(srcFilePath, 'content');

            const record = new VideoFile();
            record.id = 105;
            record.parentDirectoryName = 'recorded1';
            record.filePath = 'nested/subfolder/clean_me.mp4';

            const summary = await moveRecordedTool.executeMove({
                records: [record],
                srcDir: srcDirInfo,
                dstDir: dstDirInfo,
                destRelPath: 'target',
                isDryRun: false,
                cleanupEmptyDirs: true,
            });

            expect(summary.movedCount).toBe(1);
            expect(summary.cleanedDirsCount).toBe(2); // subfolder と nested が削除される
            expect(fs.existsSync(nestedDir)).toBe(false);
            expect(fs.existsSync(path.join(srcDirInfo.path, 'nested'))).toBe(false);
            expect(fs.existsSync(srcDirInfo.path)).toBe(true); // ルートは残る
        });

        it('should NOT clean up empty directories when cleanupEmptyDirs is false', async () => {
            const nestedDir = path.join(srcDirInfo.path, 'nested_keep', 'subfolder');
            await fs.promises.mkdir(nestedDir, { recursive: true });
            const srcFilePath = path.join(nestedDir, 'clean_me.mp4');
            await fs.promises.writeFile(srcFilePath, 'content');

            const record = new VideoFile();
            record.id = 106;
            record.parentDirectoryName = 'recorded1';
            record.filePath = 'nested_keep/subfolder/clean_me.mp4';

            const summary = await moveRecordedTool.executeMove({
                records: [record],
                srcDir: srcDirInfo,
                dstDir: dstDirInfo,
                destRelPath: 'target',
                isDryRun: false,
                cleanupEmptyDirs: false,
            });

            expect(summary.movedCount).toBe(1);
            expect(summary.cleanedDirsCount).toBe(0);
            expect(fs.existsSync(nestedDir)).toBe(true); // 残る
        });
    });
});
