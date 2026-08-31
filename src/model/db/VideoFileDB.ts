import { eq } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import VideoFile from '../../db/entities/VideoFile';
import IPromiseRetry from '../IPromiseRetry';
import { DrizzleHelper } from './DrizzleHelper';
import IDrizzleOperator from './IDrizzleOperator';
import IVideoFileDB, { UpdateFilePathOption } from './IVideoFileDB';

@injectable()
export default class VideoFileDB implements IVideoFileDB {
    private drizzleOp: IDrizzleOperator;
    private promiseRetry: IPromiseRetry;

    constructor(
        @inject('IDrizzleOperator') drizzleOp: IDrizzleOperator,
        @inject('IPromiseRetry') promiseRetry: IPromiseRetry,
    ) {
        this.drizzleOp = drizzleOp;
        this.promiseRetry = promiseRetry;
    }

    /**
     * バックアップから復元
     */
    public async restore(items: VideoFile[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                await tx.delete(schema.videoFiles);
                for (const item of items) {
                    await tx.insert(schema.videoFiles).values({
                        id: item.id,
                        recordedId: item.recordedId,
                        parentDirectoryName: item.parentDirectoryName,
                        filePath: item.filePath,
                        type: item.type,
                        name: item.name,
                        size: item.size,
                    });
                }
            });
        });
    }

    /**
     * ビデオファイル情報を 1 件挿入
     */
    public async insertOnce(videoFile: VideoFile): Promise<apid.VideoFileId> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const result = await (db as any).insert(schema.videoFiles).values({
                recordedId: videoFile.recordedId,
                parentDirectoryName: videoFile.parentDirectoryName,
                filePath: videoFile.filePath,
                type: videoFile.type,
                name: videoFile.name,
                size: videoFile.size,
            });
            return DrizzleHelper.getInsertId(client.type, result);
        });
    }

    /**
     * ファイルパスを更新
     */
    public async updateFilePath(option: UpdateFilePathOption): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const values = {
                parentDirectoryName: option.parentDirectoryName,
                filePath: option.filePath,
            };
            const { db, schema } = client;
            await (db as any).update(schema.videoFiles).set(values).where(eq(schema.videoFiles.id, option.videoFileId));
        });
    }

    /**
     * ファイルサイズを更新
     */
    public async updateSize(videoFileId: apid.VideoFileId, size: number): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).update(schema.videoFiles).set({ size }).where(eq(schema.videoFiles.id, videoFileId));
        });
    }

    /**
     * ビデオファイル情報を 1 件削除
     */
    public async deleteOnce(videoFileId: apid.VideoFileId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.videoFiles).where(eq(schema.videoFiles.id, videoFileId));
        });
    }

    /**
     * recordedId を指定してビデオファイル情報を削除
     */
    public async deleteRecordedId(recordedId: apid.RecordedId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.videoFiles).where(eq(schema.videoFiles.recordedId, recordedId));
        });
    }

    /**
     * videoFileId を指定してビデオファイル情報を取得
     */
    public async findId(videoFileId: apid.VideoFileId): Promise<VideoFile | null> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.videoFiles)
                .where(eq(schema.videoFiles.id, videoFileId));
            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<VideoFile[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.videoFiles);
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    private toEntity(row: any): VideoFile {
        const entity = new VideoFile();
        entity.id = row.id;
        entity.parentDirectoryName = row.parentDirectoryName;
        entity.filePath = row.filePath;
        entity.type = row.type;
        entity.name = row.name;
        entity.size = row.size;
        entity.recordedId = row.recordedId;
        return entity;
    }
}
