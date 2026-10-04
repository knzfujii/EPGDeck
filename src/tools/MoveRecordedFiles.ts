import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import { pipeline } from 'stream/promises';
import { parseArgs } from 'util';
import VideoFile from '../db/entities/VideoFile.js';
import IDrizzleOperator from '../model/db/IDrizzleOperator.js';
import IVideoFileDB from '../model/db/IVideoFileDB.js';
import IConfigFile, { RecordedDirInfo } from '../model/IConfigFile.js';
import IConnectionCheckModel from '../model/IConnectionCheckModel.js';
import ILogger from '../model/ILogger.js';
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
    ext?: string;
    regex?: boolean;
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
export type VideoFileMatcher = (filePath: string) => boolean;

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
                ext: { type: 'string', short: 'e' },
                regex: { type: 'boolean', short: 'E', default: false },
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
            ext: values.ext as string | undefined,
            regex: !!values.regex,
        };
    }

    public static globToRegExp(
        glob: string,
        options: { caseInsensitive?: boolean } = { caseInsensitive: true },
    ): RegExp {
        const escaped = glob
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');
        return new RegExp(`^${escaped}$`, options.caseInsensitive ? 'i' : '');
    }

    public static normalizeExtension(ext?: string): string | undefined {
        const trimmed = ext?.trim().toLowerCase();
        if (!trimmed) {
            return undefined;
        }
        return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
    }

    public static createMatcher(options: { query?: string; ext?: string; regex?: boolean }): VideoFileMatcher {
        const normalizedExt = MoveRecordedFilesCore.normalizeExtension(options.ext);
        const query = options.query?.trim();

        let patternMatcher: ((filePath: string) => boolean) | null = null;

        if (query) {
            if (options.regex) {
                const re = new RegExp(query, 'i');
                patternMatcher = (fp: string) => re.test(fp) || re.test(path.basename(fp));
            } else if (query.includes('*') || query.includes('?')) {
                const hasSlash = query.includes('/');
                const globRe = MoveRecordedFilesCore.globToRegExp(query, { caseInsensitive: true });
                patternMatcher = (fp: string) => {
                    if (hasSlash) {
                        return globRe.test(fp);
                    }
                    return globRe.test(path.basename(fp)) || globRe.test(fp);
                };
            } else {
                const lowerQuery = query.toLowerCase();
                patternMatcher = (fp: string) => fp.toLowerCase().includes(lowerQuery);
            }
        }

        return (filePath: string): boolean => {
            if (normalizedExt) {
                const fileExt = path.extname(filePath).toLowerCase();
                if (fileExt !== normalizedExt) {
                    return false;
                }
            }
            if (patternMatcher) {
                return patternMatcher(filePath);
            }
            return true;
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
        const normalizedRel = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
        return path.posix.join(normalizedRel, fileName);
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
        console.log('  <pattern>                 filePath に対する検索クエリ（位置引数）');
        console.log(
            '  -q, --query <pattern>     検索キーワードまたはワイルドカード (例: キーワード, *キーワード*.mp4)',
        );
        console.log('  -e, --ext <ext>           対象の拡張子で絞り込み (例: mp4, ts / 省略時は全拡張子)');
        console.log('  -E, --regex               クエリを正規表現として解釈');
        console.log('  -s, --src <name|index>    移動元ストレージ名または番号 (1〜N)');
        console.log('  -d, --dst <name|index>    移動先ストレージ名または番号 (1〜N、省略時は移動元と同じ)');
        console.log('  -r, --dest-relpath <path> 移動先相対ディレクトリパス（省略時は元の filePath を維持）');
        console.log('  -n, --dry-run             ファイル移動やDB更新を行わずにシミュレーション');
        console.log('  -y, --yes                 実行前の確認プロンプトをスキップ');
        console.log('  -k, --keep-empty-dirs     移動後に空になった親フォルダを削除せず残す');
        console.log('  -h, --help                ヘルプを表示');
        process.exit(0);
    }

    private initContainer(): void {
        containerSetter.set(container);

        const logger = container.loggerModel;
        logger.initialize();
        this.log = logger.getLogger();

        const configuration = container.configuration;
        this.config = configuration.getConfig();
        this.connectionChecker = container.connectionCheckModel;
        this.drizzleOperator = container.drizzleOperator;
        this.videoFileDB = container.videoFileDB;
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
            this.log.system.error('config.yml に録画ストレージ (recording.directories) が設定されていません。');
            process.exit(1);
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        try {
            // 1. 検索パターンおよび拡張子の取得
            let query = cliOpts.query?.trim();
            let ext = cliOpts.ext;

            if (!query) {
                if (!process.stdin.isTTY) {
                    console.error('エラー: 検索キーワード (-q / --query) の指定は必須です。');
                    process.exit(1);
                } else {
                    while (!query) {
                        const answer = (
                            await rl.question('検索キーワードまたはパターン (必須, 例: キーワード, *キーワード*.mp4): ')
                        ).trim();
                        if (!answer) {
                            console.log('エラー: 検索キーワードの入力は必須です。空欄での全件移動はできません。');
                            continue;
                        }
                        query = answer;
                    }
                }
            }

            if (ext === undefined) {
                if (process.stdin.isTTY && !cliOpts.yes) {
                    const answer = (await rl.question('対象の拡張子 (例: mp4, ts / 未入力で全拡張子): ')).trim();
                    ext = answer.length > 0 ? answer : undefined;
                }
            }

            // 2. 移動元ストレージの取得
            let srcDir: RecordedDirInfo | null = null;
            if (cliOpts.src) {
                srcDir = MoveRecordedFilesCore.resolveParent(cliOpts.src, directories);
                if (!srcDir) {
                    console.error(`エラー: 移動元ストレージが config に見つかりません: ${cliOpts.src}`);
                    this.printAvailableParents(directories);
                    process.exit(1);
                }
            } else {
                if (!process.stdin.isTTY) {
                    console.error('エラー: 非対話モードでは移動元ストレージ (-s) の指定が必要です。');
                    process.exit(1);
                }
                this.printAvailableParents(directories);
                const answer = (await rl.question('移動元ストレージ (番号または名前): ')).trim();
                srcDir = MoveRecordedFilesCore.resolveParent(answer, directories);
                if (!srcDir) {
                    console.error(`エラー: 無効な移動元ストレージです: ${answer}`);
                    process.exit(1);
                }
            }

            // 3. 移動先ストレージの取得
            let dstDir: RecordedDirInfo | null = null;
            if (cliOpts.dst !== undefined) {
                dstDir = MoveRecordedFilesCore.resolveParent(cliOpts.dst, directories);
                if (!dstDir) {
                    console.error(`エラー: 移動先ストレージが config に見つかりません: ${cliOpts.dst}`);
                    this.printAvailableParents(directories);
                    process.exit(1);
                }
            } else if (cliOpts.yes || !process.stdin.isTTY) {
                dstDir = srcDir;
            } else {
                const answer = (await rl.question('移動先ストレージ (未入力で移動元と同じ) [番号または名前]: ')).trim();
                if (!answer) {
                    dstDir = srcDir;
                } else {
                    dstDir = MoveRecordedFilesCore.resolveParent(answer, directories);
                    if (!dstDir) {
                        console.error(`エラー: 無効な移動先ストレージです: ${answer}`);
                        process.exit(1);
                    }
                }
            }

            // 4. 移動先相対パスの取得
            let destRelPath = cliOpts.destRelPath;
            if (destRelPath === undefined) {
                if (cliOpts.yes || !process.stdin.isTTY) {
                    destRelPath = undefined;
                } else {
                    const answer = (await rl.question('移動先サブフォルダ (未入力で元の階層を維持): ')).trim();
                    destRelPath = answer.length > 0 ? answer : undefined;
                }
            }

            // 5. DB 接続確認
            await this.connectionChecker.checkDB();

            // 6. レコード検索とフィルタリング
            const isPlainSubstring = query && !cliOpts.regex && !query.includes('*') && !query.includes('?');
            const dbSearchQuery = isPlainSubstring ? query : '';
            const allCandidateRecords = await this.videoFileDB.findByParentAndQuery(srcDir.name, dbSearchQuery);

            const matcher = MoveRecordedFilesCore.createMatcher({
                query,
                ext,
                regex: cliOpts.regex,
            });
            const matchedRecords = allCandidateRecords.filter(r => matcher(r.filePath));

            if (matchedRecords.length === 0) {
                console.log(`条件に一致する録画ファイルが見つかりませんでした (ストレージ: '${srcDir.name}')`);
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

            console.log(`\n一致したレコード:        ${matchedRecords.length} 件 (移動元: '${srcDir.name}')`);
            console.log(`移動元ルート:            ${srcDir.path}`);
            console.log(`移動先ストレージ:        ${dstDir.name}`);
            console.log(`移動先ルート:            ${dstDir.path}`);
            if (destRelPath) {
                console.log(`移動先サブフォルダ:      ${destRelPath}`);
            } else {
                console.log(`移動先サブフォルダ:      元の階層を維持`);
            }
            if (ext) {
                console.log(`対象拡張子:              ${MoveRecordedFilesCore.normalizeExtension(ext)}`);
            }
            console.log(`空フォルダ自動削除:      ${cliOpts.cleanupEmptyDirs ? '有効' : '無効'}`);

            // 7. Dry-run 判断
            let isDryRun = cliOpts.dryRun;
            if (isDryRun === undefined) {
                if (cliOpts.yes || !process.stdin.isTTY) {
                    isDryRun = false;
                } else {
                    const ans = (await rl.question('\ndry-run (シミュレーション) のみ実行しますか？ [Y/n]: '))
                        .trim()
                        .toLowerCase();
                    isDryRun = ans !== 'n' && ans !== 'no';
                }
            }

            // 8. プレビュー表示（最大10件）
            console.log('\n--- 移動対象プレビュー (最大10件) ---');
            const previewLimit = Math.min(matchedRecords.length, 10);
            for (let i = 0; i < previewLimit; i++) {
                const rec = matchedRecords[i];
                const targetPath = MoveRecordedFilesCore.calculateNewFilePath(rec.filePath, destRelPath);
                console.log(`id=${rec.id} [${srcDir.name}] ${rec.filePath} -> [${dstDir.name}] ${targetPath}`);
            }
            if (matchedRecords.length > 10) {
                console.log(`...他 ${matchedRecords.length - 10} 件`);
            }
            console.log('--------------------------------------\n');

            // 9. 実行確認プロンプト
            if (isDryRun) {
                console.log('【dry-run モード】実際のファイル移動やDB更新は行われません。\n');
            } else {
                console.log('この操作により、ファイルの移動とDBの更新が実行されます。');
                if (!cliOpts.yes) {
                    if (!process.stdin.isTTY) {
                        console.error('エラー: 実行確認が必要です。非対話実行には -y / --yes を指定してください。');
                        process.exit(1);
                    }
                    const ans = (await rl.question('移動処理を実行しますか？ [y/N]: ')).trim().toLowerCase();
                    if (ans !== 'y' && ans !== 'yes') {
                        console.log('処理を中断しました。');
                        process.exit(0);
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
            process.stdin.pause();
            await this.drizzleOperator.closeConnection();
        }
    }

    private printAvailableParents(directories: RecordedDirInfo[]): void {
        console.log('利用可能なストレージ:');
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
                    console.log(`  変更なし: 移動元と移動先が同一です (${originalFilePath})`);
                }
                noOpCount++;
                continue;
            }

            const srcFullPath = path.join(srcDir.path, originalFilePath);
            const dstFullPath = path.join(dstDir.path, newFilePath);
            const isSameResolvedPath = path.resolve(srcFullPath) === path.resolve(dstFullPath);

            // ディスク上の存在確認
            let srcExists = false;
            try {
                await FileUtil.stat(srcFullPath);
                srcExists = true;
            } catch {
                // not found
            }

            let dstExists = false;
            if (!isSameResolvedPath) {
                try {
                    await FileUtil.stat(dstFullPath);
                    dstExists = true;
                } catch {
                    // not found
                }
            }

            // 1. 移動元ファイルが存在しない場合
            if (!srcExists) {
                if (dstExists) {
                    // 自己修復チェック: 移動先ファイルが既に存在する場合
                    if (isDryRun) {
                        console.log(`レコード (id=${rec.id}): ${originalFilePath}`);
                        console.log(
                            `  [dry-run 自己修復] 移動元が見つかりませんが、移動先に既に存在します: '${dstFullPath}'`,
                        );
                        console.log(`  DB更新のみ: parentDirectoryName='${dstDir.name}', filePath='${newFilePath}'`);
                        console.log();
                        selfHealedCount++;
                    } else {
                        try {
                            await this.videoFileDB.updateFilePath({
                                videoFileId: rec.id,
                                parentDirectoryName: dstDir.name,
                                filePath: newFilePath,
                            });
                            this.log.system.info(
                                `[自己修復] DB のパス情報を更新しました (id: ${rec.id}): ${originalFilePath} -> ${newFilePath}`,
                            );
                            selfHealedCount++;
                        } catch (err: any) {
                            this.log.system.error(`自己修復中のDB更新に失敗しました (id: ${rec.id}): ${err.message}`);
                            errorCount++;
                        }
                    }
                    continue;
                }

                if (isDryRun) {
                    console.log(`レコード (id=${rec.id}): ${originalFilePath}`);
                    console.log(`  [dry-run 欠落] 移動元ファイルが存在しません: '${srcFullPath}'`);
                    console.log();
                } else {
                    this.log.system.warn(`警告: 移動元ファイルが存在しません: ${srcFullPath}`);
                }
                missingCount++;
                continue;
            }

            // 2. 移動元ファイルが存在し、実質同一パス（同一実体）の場合（DBの親ディレクトリ名のみ更新等）
            if (isSameResolvedPath) {
                if (isDryRun) {
                    console.log(`レコード (id=${rec.id}): ${originalFilePath}`);
                    console.log(`  [dry-run パス同一] 実ファイルパスが同一のため移動は不要です: '${srcFullPath}'`);
                    console.log(`  DB更新: parentDirectoryName='${dstDir.name}', filePath='${newFilePath}'`);
                    console.log();
                    movedCount++;
                } else {
                    try {
                        await this.videoFileDB.updateFilePath({
                            videoFileId: rec.id,
                            parentDirectoryName: dstDir.name,
                            filePath: newFilePath,
                        });
                        this.log.system.info(
                            `DB の親ストレージ情報を更新しました (id: ${rec.id}): '${originalFilePath}' (DB: ${dstDir.name} / ${newFilePath})`,
                        );
                        movedCount++;
                    } catch (err: any) {
                        this.log.system.error(`同一パスレコードのDB更新に失敗しました (id: ${rec.id}): ${err.message}`);
                        errorCount++;
                    }
                }
                continue;
            }

            // 3. 移動元が存在し、移動先にも既に別のファイルが存在する場合（コリジョン保護）
            if (dstExists) {
                if (isDryRun) {
                    console.log(`レコード (id=${rec.id}): ${originalFilePath}`);
                    console.log(`  [dry-run 衝突] 移動先に同名ファイルが既に存在します: '${dstFullPath}'`);
                    console.log(`  上書きを防ぐためスキップします。`);
                    console.log();
                } else {
                    this.log.system.error(
                        `移動先に同名ファイルが既に存在します (id: ${rec.id}): '${dstFullPath}'。上書きを防ぐためスキップしました。`,
                    );
                }
                errorCount++;
                continue;
            }

            // 4. 通常の移動処理 (isDryRun)
            if (isDryRun) {
                console.log(`レコード (id=${rec.id}): ${originalFilePath}`);
                console.log(`  移動元: ${srcFullPath}`);
                console.log(`  移動先: ${dstFullPath}`);
                console.log(`  DB更新: parentDirectoryName='${dstDir.name}', filePath='${newFilePath}'`);
                console.log(`  ファイル移動: mv '${srcFullPath}' '${dstFullPath}'`);
                if (cleanupEmptyDirs) {
                    console.log(`  掃除予定: 移動後に '${srcDir.path}' 配下の親フォルダが空になれば安全に削除`);
                }
                console.log();
                movedCount++;
                continue;
            }

            // 5. 通常の移動処理 (実行モード)
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
                            `\r[移動中 id=${rec.id}] [${bar}] ${percent.toFixed(1)}% (${formatBytes(transferred)} / ${formatBytes(total)})`,
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
                    this.log.system.error(`DB更新失敗 (id: ${rec.id})。ファイルを元の場所へロールバックします...`);
                    await MoveRecordedFilesCore.moveFile(dstFullPath, srcFullPath).catch(() => {});
                    throw dbErr;
                }

                this.log.system.info(
                    `移動完了 (id: ${rec.id}): '${srcFullPath}' -> '${dstFullPath}' (DB: ${dstDir.name} / ${newFilePath})`,
                );
                movedCount++;

                // 移動元ディレクトリが空になった場合の安全クリーンアップ
                if (cleanupEmptyDirs) {
                    const removed = await MoveRecordedFilesCore.cleanEmptyParentDirectories(srcFullPath, srcDir.path);
                    if (removed.length > 0) {
                        cleanedDirsCount += removed.length;
                        for (const rDir of removed) {
                            this.log.system.info(`空フォルダを掃除しました: ${rDir}`);
                        }
                    }
                }
            } catch (err: any) {
                this.log.system.error(`ファイル処理エラー (id: ${rec.id}, path: ${originalFilePath}): ${err.message}`);
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
        console.log('\n================ 移動サマリー ================');
        if (isDryRun) {
            console.log('実行モード:       シミュレーション (dry-run)');
            console.log(`対象レコード数:   ${summary.totalRecords} 件`);
            console.log(`移動予定:         ${summary.movedCount} 件`);
            console.log(`自己修復:         ${summary.selfHealedCount} 件`);
            console.log(`変更なし:         ${summary.noOpCount} 件`);
            console.log(`ファイル欠落:     ${summary.missingCount} 件`);
            console.log(`衝突・エラー:     ${summary.errorCount} 件`);
        } else {
            console.log('実行モード:       本番実行 (EXECUTE)');
            console.log(`対象レコード数:   ${summary.totalRecords} 件`);
            console.log(`移動＆DB更新:     ${summary.movedCount} 件`);
            console.log(`自己修復:         ${summary.selfHealedCount} 件`);
            console.log(`変更なし:         ${summary.noOpCount} 件`);
            console.log(`ファイル欠落:     ${summary.missingCount} 件`);
            console.log(`エラー:           ${summary.errorCount} 件`);
            console.log(`空フォルダ削除:   ${summary.cleanedDirsCount} 件`);
        }
        console.log('==============================================\n');
    }
}

// 直接実行された場合のエントリポイント
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
    new MoveRecordedFiles()
        .run()
        .then(summary => {
            process.exit(summary.errorCount > 0 ? 1 : 0);
        })
        .catch(err => {
            console.error('Fatal error during move-recorded:', err);
            process.exit(1);
        });
}
