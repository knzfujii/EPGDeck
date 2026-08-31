import { eq } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import Thumbnail from '../../db/entities/Thumbnail';
import IPromiseRetry from '../IPromiseRetry';
import { DrizzleHelper } from './DrizzleHelper';
import IDrizzleOperator from './IDrizzleOperator';
import IThumbnailDB from './IThumbnailDB';

@injectable()
export default class ThumbnailDB implements IThumbnailDB {
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
    public async restore(items: Thumbnail[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                await tx.delete(schema.thumbnails);
                for (const item of items) {
                    await tx.insert(schema.thumbnails).values({
                        id: item.id,
                        filePath: item.filePath,
                        recordedId: item.recordedId,
                    });
                }
            });
        });
    }

    /**
     * サムネイル情報を 1 件挿入
     */
    public async insertOnce(thumbnail: Thumbnail): Promise<apid.ThumbnailId> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const result = await (db as any).insert(schema.thumbnails).values({
                filePath: thumbnail.filePath,
                recordedId: thumbnail.recordedId,
            });
            return DrizzleHelper.getInsertId(client.type, result);
        });
    }

    /**
     * サムネイル情報を 1 件削除
     */
    public async deleteOnce(thumbnailId: apid.ThumbnailId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.thumbnails).where(eq(schema.thumbnails.id, thumbnailId));
        });
    }

    /**
     * recordedId を指定してサムネイル情報を削除
     */
    public async deleteRecordedId(recordedId: apid.RecordedId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.thumbnails).where(eq(schema.thumbnails.recordedId, recordedId));
        });
    }

    /**
     * thumbnailId を指定してサムネイル情報を取得
     */
    public async findId(thumbnailId: apid.ThumbnailId): Promise<Thumbnail | null> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.thumbnails)
                .where(eq(schema.thumbnails.id, thumbnailId));
            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<Thumbnail[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.thumbnails);
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    private toEntity(row: any): Thumbnail {
        const entity = new Thumbnail();
        entity.id = row.id;
        entity.filePath = row.filePath;
        entity.recordedId = row.recordedId;
        return entity;
    }
}
