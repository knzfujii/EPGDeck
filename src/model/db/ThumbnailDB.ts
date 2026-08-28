import { eq } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import Thumbnail from '../../db/entities/Thumbnail';
import IPromiseRetry from '../IPromiseRetry';
import IDrizzleOperator from './IDrizzleOperator';
import IThumbnailDB from './IThumbnailDB';

@injectable()
export default class ThumbnailDB implements IThumbnailDB {
    private drizzleOp: IDrizzleOperator;
    private promieRetry: IPromiseRetry;

    constructor(
        @inject('IDrizzleOperator') drizzleOp: IDrizzleOperator,
        @inject('IPromiseRetry') promieRetry: IPromiseRetry,
    ) {
        this.drizzleOp = drizzleOp;
        this.promieRetry = promieRetry;
    }

    /**
     * バックアップから復元
     */
    public async restore(items: Thumbnail[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.thumbnails);
                    for (const item of items) {
                        await tx.insert(schema.thumbnails).values({
                            id: item.id,
                            filePath: item.filePath,
                            recordedId: item.recordedId,
                        });
                    }
                });
            } else {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.thumbnails);
                    for (const item of items) {
                        await tx.insert(schema.thumbnails).values({
                            id: item.id,
                            filePath: item.filePath,
                            recordedId: item.recordedId,
                        });
                    }
                });
            }
        });
    }

    /**
     * サムネイル情報を 1 件挿入
     */
    public async insertOnce(thumbnail: Thumbnail): Promise<apid.ThumbnailId> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const result = await db.insert(schema.thumbnails).values({
                    filePath: thumbnail.filePath,
                    recordedId: thumbnail.recordedId,
                });
                return Number(result.lastInsertRowid);
            } else {
                const { db, schema } = client;
                const [result] = await db.insert(schema.thumbnails).values({
                    filePath: thumbnail.filePath,
                    recordedId: thumbnail.recordedId,
                });
                return result.insertId;
            }
        });
    }

    /**
     * サムネイル情報を 1 件削除
     */
    public async deleteOnce(thumbnailId: apid.ThumbnailId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.delete(schema.thumbnails).where(eq(schema.thumbnails.id, thumbnailId));
            } else {
                const { db, schema } = client;
                await db.delete(schema.thumbnails).where(eq(schema.thumbnails.id, thumbnailId));
            }
        });
    }

    /**
     * recordedId を指定してサムネイル情報を削除
     */
    public async deleteRecordedId(recordedId: apid.RecordedId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.delete(schema.thumbnails).where(eq(schema.thumbnails.recordedId, recordedId));
            } else {
                const { db, schema } = client;
                await db.delete(schema.thumbnails).where(eq(schema.thumbnails.recordedId, recordedId));
            }
        });
    }

    /**
     * thumbnailId を指定してサムネイル情報を取得
     */
    public async findId(thumbnailId: apid.ThumbnailId): Promise<Thumbnail | null> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db.select().from(schema.thumbnails).where(eq(schema.thumbnails.id, thumbnailId));
                if (rows.length === 0) return null;
                return this.toEntity(rows[0]);
            } else {
                const { db, schema } = client;
                const rows = await db.select().from(schema.thumbnails).where(eq(schema.thumbnails.id, thumbnailId));
                if (rows.length === 0) return null;
                return this.toEntity(rows[0]);
            }
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<Thumbnail[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db.select().from(schema.thumbnails);
                return rows.map(r => this.toEntity(r));
            } else {
                const { db, schema } = client;
                const rows = await db.select().from(schema.thumbnails);
                return rows.map(r => this.toEntity(r));
            }
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
