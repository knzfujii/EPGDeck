import * as path from 'path';
import { parseArgs } from 'util';
import 'reflect-metadata';
import IDrizzleOperator from '../model/db/IDrizzleOperator';
import IThumbnailDB from '../model/db/IThumbnailDB';
import IConfigFile from '../model/IConfigFile';
import IConfiguration from '../model/IConfiguration';
import IConnectionCheckModel from '../model/IConnectionCheckModel';
import ILogger from '../model/ILogger';
import ILoggerModel from '../model/ILoggerModel';
import container from '../model/ModelContainer';
import * as containerSetter from '../model/ModelContainerSetter';
import ThumbnailManageModel from '../model/operator/thumbnail/ThumbnailManageModel';
import FileUtil from '../util/FileUtil';

containerSetter.set(container);

class MigrateThumbnails {
    private isDryRun: boolean;
    private log: ILogger;
    private config: IConfigFile;
    private connectionChecker: IConnectionCheckModel;
    private drizzleOperator: IDrizzleOperator;
    private thumbnailDB: IThumbnailDB;

    private static showUsageAndExit(): never {
        console.log('使い方:');
        console.log('  npm run migrate-thumbnails [-- --dry-run]');
        console.log('\nオプション:');
        console.log('  -d, --dry-run    ファイル移動やDB更新を行わずにシミュレーション');
        console.log('  -h, --help       ヘルプを表示');
        process.exit(0);
    }

    constructor() {
        let values: any;
        try {
            const parsed = parseArgs({
                args: process.argv.slice(2),
                options: {
                    'dry-run': {
                        type: 'boolean',
                        short: 'd',
                        default: false,
                    },
                    help: {
                        type: 'boolean',
                        short: 'h',
                        default: false,
                    },
                },
                strict: true,
            });
            values = parsed.values;
        } catch (err: any) {
            console.error(`引数エラー: ${err.message}\n`);
            MigrateThumbnails.showUsageAndExit();
        }

        if (values.help) {
            MigrateThumbnails.showUsageAndExit();
        }

        this.isDryRun = !!values['dry-run'];

        const logger = container.get<ILoggerModel>('ILoggerModel');
        logger.initialize();
        this.log = logger.getLogger();

        const configuration = container.get<IConfiguration>('IConfiguration');
        this.config = configuration.getConfig();
        this.connectionChecker = container.get<IConnectionCheckModel>('IConnectionCheckModel');
        this.drizzleOperator = container.get<IDrizzleOperator>('IDrizzleOperator');
        this.thumbnailDB = container.get<IThumbnailDB>('IThumbnailDB');
    }

    public async run(): Promise<void> {
        this.log.system.info(`--- Thumbnail Migration Start ${this.isDryRun ? '(DRY-RUN)' : ''} ---`);

        try {
            // DB 接続確認
            await this.connectionChecker.checkDB();

            const baseDir = this.config.recording.thumbnail.path;
            this.log.system.info(`Thumbnail directory: ${baseDir}`);

            const thumbnails = await this.thumbnailDB.findAll();
            this.log.system.info(`Total thumbnail records in DB: ${thumbnails.length}`);

            let migratedCount = 0;
            let alreadyMigratedCount = 0;
            let missingFileCount = 0;
            let errorCount = 0;

            for (const thumbnail of thumbnails) {
                const currentFilePath = thumbnail.filePath;

                // 既にサブディレクトリ形式（スラッシュまたはバックスラッシュを含む）の場合はスキップ
                if (currentFilePath.includes('/') || currentFilePath.includes('\\')) {
                    alreadyMigratedCount++;
                    continue;
                }

                const oldFullPath = path.join(baseDir, currentFilePath);
                let exists = false;
                try {
                    await FileUtil.stat(oldFullPath);
                    exists = true;
                } catch (err) {
                    exists = false;
                }

                if (!exists) {
                    this.log.system.warn(
                        `Thumbnail file not found on disk (id: ${thumbnail.id}, recordedId: ${thumbnail.recordedId}): ${oldFullPath}`,
                    );
                    missingFileCount++;
                    continue;
                }

                const subDir = ThumbnailManageModel.getSubDir(thumbnail.recordedId);
                const newRelativePath = path.posix.join(subDir, path.basename(currentFilePath));
                const newFullPath = path.join(baseDir, newRelativePath);

                try {
                    if (this.isDryRun) {
                        this.log.system.info(
                            `[DRY-RUN] Would move ${oldFullPath} -> ${newFullPath} and update DB to ${newRelativePath}`,
                        );
                    } else {
                        await FileUtil.mkdir(path.dirname(newFullPath));
                        await FileUtil.move(oldFullPath, newFullPath);
                        await this.thumbnailDB.updateFilePath(thumbnail.id, newRelativePath);
                        this.log.system.info(
                            `Migrated (id: ${thumbnail.id}): ${currentFilePath} -> ${newRelativePath}`,
                        );
                    }
                    migratedCount++;
                } catch (err: any) {
                    this.log.system.error(`Failed to migrate thumbnail (id: ${thumbnail.id}): ${err.message}`);
                    errorCount++;
                }
            }

            this.log.system.info('--- Thumbnail Migration Summary ---');
            this.log.system.info(`Total records:     ${thumbnails.length}`);
            this.log.system.info(`Migrated:          ${migratedCount}`);
            this.log.system.info(`Already sharded:   ${alreadyMigratedCount}`);
            this.log.system.info(`Missing on disk:   ${missingFileCount}`);
            this.log.system.info(`Errors:            ${errorCount}`);
            this.log.system.info(`--- Thumbnail Migration Completed ${this.isDryRun ? '(DRY-RUN)' : ''} ---`);

            process.exit(errorCount > 0 ? 1 : 0);
        } finally {
            await this.drizzleOperator.closeConnection();
        }
    }
}

new MigrateThumbnails().run().catch(err => {
    console.error('Fatal error during thumbnail migration:', err);
    process.exit(1);
});
