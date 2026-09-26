import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import { pipeline } from 'stream/promises';
import { parseArgs } from 'util';
import 'reflect-metadata';
import VideoFile from '../db/entities/VideoFile.js';
import IDrizzleOperator from '../model/db/IDrizzleOperator.js';
import IVideoFileDB from '../model/db/IVideoFileDB.js';
import IConfigFile, { RecordedDirInfo } from '../model/IConfigFile.js';
import IConfiguration from '../model/IConfiguration.js';
import IConnectionCheckModel from '../model/IConnectionCheckModel.js';
import ILogger from '../model/ILogger.js';
import ILoggerModel from '../model/ILoggerModel.js';
import container from '../model/ModelContainer.js';
import * as containerSetter from '../model/ModelContainerSetter.js';
import FileUtil from '../util/FileUtil.js';

export interface MoveRecordedCLIOptions {
    query?: string;
    src?: string;
    dst?: string;
    destRelPath?: string;
    dryRun?: boolean;
    yes?: boolean;
    help?: boolean;
    cleanupEmptyDirs?: boolean;
}

export interface MoveRecordedSummary {
    totalRecords: number;
    movedCount: number;
    selfHealedCount: number;
    noOpCount: number;
    missingCount: number;
    errorCount: number;
    cleanedDirsCount: number;
}

export type ProgressCallback = (percent: number, transferred: number, total: number) => void;

export class MoveRecordedFilesCore {
    public static parseCLIOptions(args: string[]): MoveRecordedCLIOptions {
        const { values, positionals } = parseArgs({
            args,
            options: {
                query: { type: 'string', short: 'q' },
                src: { type: 'string', short: 's' },
                dst: { type: 'string', short: 'd' },
                'dest-relpath': { type: 'string', short: 'r' },
                'dry-run': { type: 'boolean', short: 'n' },
                yes: { type: 'boolean', short: 'y', default: false },
                help: { type: 'boolean', short: 'h', default: false },
                'cleanup-empty-dirs': { type: 'boolean', short: 'c' },
                'keep-empty-dirs': { type: 'boolean', short: 'k', default: false },
            },
            allowPositionals: true,
            strict: false,
        });

        const query = (values.query as string | undefined) ?? (positionals.length > 0 ? positionals[0] : undefined);
        const keepEmptyDirs = !!values['keep-empty-dirs'];
        const cleanupFlag = values['cleanup-empty-dirs'] as boolean | undefined;
        const cleanupEmptyDirs = keepEmptyDirs ? false : (cleanupFlag ?? true);

        return {
            query,
            src: values.src as string | undefined,
            dst: values.dst as string | undefined,
            destRelPath: values['dest-relpath'] as string | undefined,
            dryRun: values['dry-run'] as boolean | undefined,
            yes: !!values.yes,
            help: !!values.help,
            cleanupEmptyDirs,
        };
    }

    public static resolveParent(input: string, directories: RecordedDirInfo[]): RecordedDirInfo | null {
        const trimmed = input.trim();
        if (/^\d+$/.test(trimmed)) {
            const idx = parseInt(trimmed, 10) - 1;
            if (idx >= 0 && idx < directories.length) {
                return directories[idx];
            }
            return null;
        }

        const found = directories.find(d => d.name === trimmed);
        return found ?? null;
    }

    public static calculateNewFilePath(originalFilePath: string, destRelPath?: string): string {
        const trimmed = destRelPath?.trim();
        if (!trimmed) {
            return originalFilePath;
        }
        const fileName = path.basename(originalFilePath);
        return path.posix.join(trimmed.replace(/\\/g, '/'), fileName);
    }

    /**
     * 高速 rename を優先し、別ドライブ間（EXDEV）なら進捗通知付きストリームコピーにフォールバックして移動
     */
    public static async moveFile(src: string, dst: string, onProgress?: ProgressCallback): Promise<void> {
        try {
            // 同一ファイルシステム内なら rename で瞬時に完了
            await fs.promises.rename(src, dst);
            if (onProgress) {
                const stat = await fs.promises.stat(dst);
                onProgress(100, stat.size, stat.size);
            }
            return;
        } catch (err: any) {
            if (err.code !== 'EXDEV') {
                throw err;
            }
        }

        // 異なるファイルシステム間の場合はストリームコピー + 進捗更新
        const srcStat = await fs.promises.stat(src);
        const totalBytes = srcStat.size;
        let transferredBytes = 0;

        const readStream = fs.createReadStream(src);
        const writeStream = fs.createWriteStream(dst);

        readStream.on('data', chunk => {
            transferredBytes += chunk.length;
            if (onProgress) {
                const percent = totalBytes > 0 ? Math.min(100, (transferredBytes / totalBytes) * 100) : 100;
                onProgress(percent, transferredBytes, totalBytes);
            }
        });

        try {
            await pipeline(readStream, writeStream);
        } catch (copyErr) {
            await fs.promises.unlink(dst).catch(() => {});
            throw copyErr;
        }

        // コピー成功後に移動元ファイルを安全に削除
        await fs.promises.unlink(src);
    }

    /**
     * 移動元ファイルがあった親ディレクトリを遡り、完全に空である限り安全に削除 (rmdir)
     * ルートディレクトリ（rootDirPath）は絶対に削除しない
     */
    public static async cleanEmptyParentDirectories(fileFullPath: string, rootDirPath: string): Promise<string[]> {
        const removedDirs: string[] = [];
        const normalizedRoot = path.resolve(rootDirPath);
        let currentDir = path.dirname(path.resolve(fileFullPath));

        // currentDir が rootDir の真のサブディレクトリである間のみループ
        while (currentDir !== normalizedRoot && currentDir.startsWith(normalizedRoot + path.sep)) {
            try {
                // rmdir はディレクトリが完全に空（エントリ0件）のときだけ成功する
                await fs.promises.rmdir(currentDir);
                removedDirs.push(currentDir);
                currentDir = path.dirname(currentDir);
            } catch {
                // ディレクトリに他のファイルが存在する（ENOTEMPTY）などの場合は安全に停止
                break;
            }
        }

        return removedDirs;
    }
}

export default class MoveRecordedFiles {
    private log!: ILogger;
    private config!: IConfigFile;
    private connectionChecker!: IConnectionCheckModel;
    private drizzleOperator!: IDrizzleOperator;
    private videoFileDB!: IVideoFileDB;

    public static showUsageAndExit(): never {
        console.log('使い方:');
        console.log('  npm run move-recorded [-- [<pattern>] [options]]');
        console.log('\nオプション:');
        console.log('  <pattern>                 filePath に対する部分一致検索クエリ（位置引数）');
        console.log('  -q, --query <pattern>     検索クエリ');
        console.log('  -s, --src <name|index>    移動元親ディレクトリ名または番号 (1〜N)');
        console.log('  -d, --dst <name|index>    移動先親ディレクトリ名または番号 (1〜N、省略時は移動元と同じ)');
        console.log('  -r, --dest-relpath <path> 移動先相対ディレクトリパス（省略時は元の filePath を維持）');
        console.log('  -n, --dry-run             ファイル移動やDB更新を行わずにシミュレーション');
        console.log('  -y, --yes                 実行前の確認プロンプトをスキップ');
        console.log('  -k, --keep-empty-dirs     移動後に空になった親フォルダを削除せず残す');
        console.log('  -h, --help                ヘルプを表示');
        process.exit(0);
    }

    private initContainer(): void {
        containerSetter.set(container);

        const logger = container.get<ILoggerModel>('ILoggerModel');
        logger.initialize();
        this.log = logger.getLogger();

        const configuration = container.get<IConfiguration>('IConfiguration');
        this.config = configuration.getConfig();
        this.connectionChecker = container.get<IConnectionCheckModel>('IConnectionCheckModel');
        this.drizzleOperator = container.get<IDrizzleOperator>('IDrizzleOperator');
        this.videoFileDB = container.get<IVideoFileDB>('IVideoFileDB');
    }

    public setDependenciesForTest(deps: { log: ILogger; videoFileDB: IVideoFileDB }): void {
        this.log = deps.log;
        this.videoFileDB = deps.videoFileDB;
    }

    public async run(args: string[] = process.argv.slice(2)): Promise<MoveRecordedSummary> {
        this.initContainer();

        const cliOpts = MoveRecordedFilesCore.parseCLIOptions(args);
        if (cliOpts.help) {
            MoveRecordedFiles.showUsageAndExit();
        }

        const directories = this.config.recording.directories;
        if (!directories || directories.length === 0) {
            this.log.system.error('No recording directories configured in config.yml (recording.directories).');
            process.exit(1);
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        try {
            // 1. 検索パターンの取得
            let query = cliOpts.query;
            if (!query) {
                query = (await rl.question('Search pattern for filePath: ')).trim();
                if (!query) {
                    console.error('Error: query pattern is required.');
                    process.exit(1);
                }
            }

            // 2. 移動元親ディレクトリの取得
            let srcDir: RecordedDirInfo | null = null;
            if (cliOpts.src) {
                srcDir = MoveRecordedFilesCore.resolveParent(cliOpts.src, directories);
                if (!srcDir) {
                    console.error(`Error: source parent not found in config: ${cliOpts.src}`);
                    this.printAvailableParents(directories);
                    process.exit(1);
                }
            } else {
                this.printAvailableParents(directories);
                const answer = (await rl.question('Source parent (name or number): ')).trim();
                srcDir = MoveRecordedFilesCore.resolveParent(answer, directories);
                if (!srcDir) {
                    console.error(`Error: invalid source parent: ${answer}`);
                    process.exit(1);
                }
            }

            // 3. 移動先親ディレクトリの取得
            let dstDir: RecordedDirInfo | null = null;
            if (cliOpts.dst !== undefined) {
                dstDir = MoveRecordedFilesCore.resolveParent(cliOpts.dst, directories);
                if (!dstDir) {
                    console.error(`Error: destination parent not found in config: ${cliOpts.dst}`);
                    this.printAvailableParents(directories);
                    process.exit(1);
                }
            } else {
                const answer = (
                    await rl.question('Destination parent (leave empty to use same as source) [name or number]: ')
                ).trim();
                if (!answer) {
                    dstDir = srcDir;
                } else {
                    dstDir = MoveRecordedFilesCore.resolveParent(answer, directories);
                    if (!dstDir) {
                        console.error(`Error: invalid destination parent: ${answer}`);
                        process.exit(1);
                    }
                }
            }

            // 4. 移動先相対パスの取得
            let destRelPath = cliOpts.destRelPath;
            if (destRelPath === undefined) {
                const answer = (
                    await rl.question('Destination relative path (leave blank to preserve original filePath): ')
                ).trim();
                destRelPath = answer.length > 0 ? answer : undefined;
            }

            // 5. DB 接続確認
            await this.connectionChecker.checkDB();

            // 6. レコード検索
            const matchedRecords = await this.videoFileDB.findByParentAndQuery(srcDir.name, query);
            if (matchedRecords.length === 0) {
                console.log(`No matching records found for query '${query}' under parent '${srcDir.name}'.`);
                return {
                    totalRecords: 0,
                    movedCount: 0,
                    selfHealedCount: 0,
                    noOpCount: 0,
                    missingCount: 0,
                    errorCount: 0,
                    cleanedDirsCount: 0,
                };
            }

            console.log(`\nFound ${matchedRecords.length} matching records under parent '${srcDir.name}'.`);
            console.log(`Source root:             ${srcDir.path}`);
            console.log(`Destination parent:      ${dstDir.name}`);
            console.log(`Destination root:        ${dstDir.path}`);
            if (destRelPath) {
                console.log(`Destination relative:    ${destRelPath}`);
            } else {
                console.log(`Destination relative:    preserve original filePath`);
            }
            console.log(`Cleanup empty folders:   ${cliOpts.cleanupEmptyDirs ? 'Yes' : 'No'}`);

            // 7. Dry-run 判断
            let isDryRun = cliOpts.dryRun;
            if (isDryRun === undefined) {
                if (cliOpts.yes) {
                    isDryRun = false;
                } else {
                    const ans = (await rl.question('\nExecute as dry-run only? [Y/n]: ')).trim().toLowerCase();
                    isDryRun = ans !== 'n' && ans !== 'no';
                }
            }

            // 8. プレビュー表示（最大10件）
            console.log('\n--- Preview (up to 10 records) ---');
            const previewLimit = Math.min(matchedRecords.length, 10);
            for (let i = 0; i < previewLimit; i++) {
                const rec = matchedRecords[i];
                console.log(`id=${rec.id} filePath=${rec.filePath}`);
            }
            if (matchedRecords.length > 10) {
                console.log(`...and ${matchedRecords.length - 10} more rows.`);
            }
            console.log('----------------------------------\n');

            // 9. 実行確認プロンプト
            if (isDryRun) {
                console.log('Dry-run mode: no changes will be applied.\n');
            } else {
                console.log('This operation will move files and update the DB.');
                if (!cliOpts.yes) {
                    const ans = (await rl.question('Proceed? [y/N]: ')).trim().toLowerCase();
                    if (ans !== 'y' && ans !== 'yes') {
                        console.log('Aborted.');
                        process.exit(1);
                    }
                }
            }

            // 10. ファイル移動 & DB更新ループ
            const summary = await this.executeMove({
                records: matchedRecords,
                srcDir,
                dstDir,
                destRelPath,
                isDryRun,
                cleanupEmptyDirs: cliOpts.cleanupEmptyDirs ?? true,
            });

            this.printSummary(summary, isDryRun);
            if (!isDryRun && summary.errorCount > 0) {
                process.exit(1);
            }
            return summary;
        } finally {
            rl.close();
            await this.drizzleOperator.closeConnection();
        }
    }

    private printAvailableParents(directories: RecordedDirInfo[]): void {
        console.log('Available parents:');
        directories.forEach((d, i) => {
            console.log(`  ${i + 1}: ${d.name} (${d.path})`);
        });
    }

    public async executeMove(options: {
        records: VideoFile[];
        srcDir: RecordedDirInfo;
        dstDir: RecordedDirInfo;
        destRelPath?: string;
        isDryRun: boolean;
        cleanupEmptyDirs?: boolean;
    }): Promise<MoveRecordedSummary> {
        const { records, srcDir, dstDir, destRelPath, isDryRun, cleanupEmptyDirs = true } = options;
        let movedCount = 0;
        let selfHealedCount = 0;
        let noOpCount = 0;
        let missingCount = 0;
        let errorCount = 0;
        let cleanedDirsCount = 0;

        for (const rec of records) {
            const originalFilePath = rec.filePath;
            const newFilePath = MoveRecordedFilesCore.calculateNewFilePath(originalFilePath, destRelPath);

            const changedParent = srcDir.name !== dstDir.name;
            const changedFilePath = originalFilePath !== newFilePath;

            if (!changedParent && !changedFilePath) {
                if (isDryRun) {
                    console.log(`  no-op: same parent and same filePath (${originalFilePath})`);
                }
                noOpCount++;
                continue;
            }

            const srcFullPath = path.join(srcDir.path, originalFilePath);
            const dstFullPath = path.join(dstDir.path, newFilePath);

            if (isDryRun) {
                console.log(`Record (id=${rec.id}): ${originalFilePath}`);
                console.log(`  src: ${srcFullPath}`);
                console.log(`  dst: ${dstFullPath}`);
                console.log(`  DB update: parentDirectoryName='${dstDir.name}', filePath='${newFilePath}'`);
                console.log(`  file move: mv '${srcFullPath}' '${dstFullPath}'`);
                if (cleanupEmptyDirs) {
                    console.log(`  cleanup: would remove empty parent folders under '${srcDir.path}' if empty`);
                }
                console.log();
                movedCount++;
                continue;
            }

            // 実行モード
            let srcExists = false;
            try {
                await FileUtil.stat(srcFullPath);
                srcExists = true;
            } catch {
                // not found
            }

            if (!srcExists) {
                // 自己修復チェック: 移動先ファイルが既に存在するか確認
                let dstExists = false;
                try {
                    await FileUtil.stat(dstFullPath);
                    dstExists = true;
                } catch {
                    // not found
                }

                if (dstExists) {
                    try {
                        await this.videoFileDB.updateFilePath({
                            videoFileId: rec.id,
                            parentDirectoryName: dstDir.name,
                            filePath: newFilePath,
                        });
                        this.log.system.info(
                            `[Self-Heal] Updated DB (id: ${rec.id}): ${originalFilePath} -> ${newFilePath}`,
                        );
                        selfHealedCount++;
                    } catch (err: any) {
                        this.log.system.error(
                            `Failed to update DB during self-healing (id: ${rec.id}): ${err.message}`,
                        );
                        errorCount++;
                    }
                    continue;
                }

                this.log.system.warn(`Warning: source file missing: ${srcFullPath}`);
                missingCount++;
                continue;
            }

            try {
                await FileUtil.mkdir(path.dirname(dstFullPath));

                // 進捗表示付き移動
                let hasProgressOutput = false;
                await MoveRecordedFilesCore.moveFile(srcFullPath, dstFullPath, (percent, transferred, total) => {
                    if (process.stdout.isTTY) {
                        hasProgressOutput = true;
                        const formatBytes = (b: number): string => {
                            if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                            return `${(b / (1024 * 1024)).toFixed(1)} MB`;
                        };
                        const barWidth = 20;
                        const filled = Math.min(barWidth, Math.round((percent / 100) * barWidth));
                        const empty = barWidth - filled;
                        const bar =
                            '='.repeat(filled) +
                            (filled < barWidth ? '>' : '') +
                            ' '.repeat(Math.max(0, empty - (filled < barWidth ? 1 : 0)));
                        process.stdout.write(
                            `\r[Moving id=${rec.id}] [${bar}] ${percent.toFixed(1)}% (${formatBytes(transferred)} / ${formatBytes(total)})`,
                        );
                    }
                });

                if (hasProgressOutput) {
                    process.stdout.write('\n');
                }

                try {
                    await this.videoFileDB.updateFilePath({
                        videoFileId: rec.id,
                        parentDirectoryName: dstDir.name,
                        filePath: newFilePath,
                    });
                } catch (dbErr: any) {
                    // ロールバック: DB更新失敗時はファイルを元の場所に戻す
                    this.log.system.error(`DB update failed for id: ${rec.id}. Rolling back file move...`);
                    await MoveRecordedFilesCore.moveFile(dstFullPath, srcFullPath).catch(() => {});
                    throw dbErr;
                }

                this.log.system.info(
                    `Moved (id: ${rec.id}): '${srcFullPath}' -> '${dstFullPath}' (DB: ${dstDir.name} / ${newFilePath})`,
                );
                movedCount++;

                // 移動元ディレクトリが空になった場合の安全クリーンアップ
                if (cleanupEmptyDirs) {
                    const removed = await MoveRecordedFilesCore.cleanEmptyParentDirectories(srcFullPath, srcDir.path);
                    if (removed.length > 0) {
                        cleanedDirsCount += removed.length;
                        for (const rDir of removed) {
                            this.log.system.info(`Cleaned up empty directory: ${rDir}`);
                        }
                    }
                }
            } catch (err: any) {
                this.log.system.error(
                    `Error processing file (id: ${rec.id}, path: ${originalFilePath}): ${err.message}`,
                );
                errorCount++;
            }
        }

        return {
            totalRecords: records.length,
            movedCount,
            selfHealedCount,
            noOpCount,
            missingCount,
            errorCount,
            cleanedDirsCount,
        };
    }

    private printSummary(summary: MoveRecordedSummary, isDryRun: boolean): void {
        console.log('\n================ Move Summary ================');
        if (isDryRun) {
            console.log('Mode:             DRY-RUN (no actual changes applied)');
            console.log(`Matched records:  ${summary.totalRecords}`);
            console.log(`Planned moves:    ${summary.movedCount}`);
            console.log(`No-op (no change):${summary.noOpCount}`);
        } else {
            console.log('Mode:             EXECUTE');
            console.log(`Matched records:  ${summary.totalRecords}`);
            console.log(`Moved & updated:  ${summary.movedCount}`);
            console.log(`Self-healed:      ${summary.selfHealedCount}`);
            console.log(`No-op (no change):${summary.noOpCount}`);
            console.log(`Missing files:    ${summary.missingCount}`);
            console.log(`Errors:           ${summary.errorCount}`);
            console.log(`Empty dirs cleaned:${summary.cleanedDirsCount}`);
        }
        console.log('==============================================\n');
    }
}

// 直接実行された場合のエントリポイント
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
    new MoveRecordedFiles().run().catch(err => {
        console.error('Fatal error during move-recorded:', err);
        process.exit(1);
    });
}
