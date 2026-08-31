import { and, eq, like, notInArray, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import RecordedTag from '../../db/entities/RecordedTag';
import StrUtil from '../../util/StrUtil';
import IPromiseRetry from '../IPromiseRetry';
import IDrizzleOperator from './IDrizzleOperator';
import IRecordedTagDB from './IRecordedTagDB';

@injectable()
export default class RecordedTagDB implements IRecordedTagDB {
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
    public async restore(items: RecordedTag[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.recordedTags);
                    for (const item of items) {
                        await tx.insert(schema.recordedTags).values({
                            id: item.id,
                            name: item.name,
                            halfWidthName: item.halfWidthName,
                            color: item.color,
                        });
                    }
                });
            } else {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.recordedTags);
                    for (const item of items) {
                        await tx.insert(schema.recordedTags).values({
                            id: item.id,
                            name: item.name,
                            halfWidthName: item.halfWidthName,
                            color: item.color,
                        });
                    }
                });
            }
        });
    }

    /**
     * tag 情報を 1 件挿入
     */
    public async insertOnce(tag: RecordedTag): Promise<apid.RecordedTagId> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const result = await db.insert(schema.recordedTags).values({
                    name: tag.name,
                    halfWidthName: tag.halfWidthName,
                    color: tag.color,
                });
                return Number(result.lastInsertRowid);
            } else {
                const { db, schema } = client;
                const [result] = await db.insert(schema.recordedTags).values({
                    name: tag.name,
                    halfWidthName: tag.halfWidthName,
                    color: tag.color,
                });
                return result.insertId;
            }
        });
    }

    /**
     * tag 更新
     */
    public async updateOnce(tagId: apid.RecordedTagId, name: string, color: string): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const values = {
                name,
                color,
                halfWidthName: StrUtil.toHalf(name),
            };

            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.update(schema.recordedTags).set(values).where(eq(schema.recordedTags.id, tagId));
            } else {
                const { db, schema } = client;
                await db.update(schema.recordedTags).set(values).where(eq(schema.recordedTags.id, tagId));
            }
        });
    }

    /**
     * recorded と tag の関連付け設定
     */
    public async setRelation(tagId: apid.RecordedTagId, recordedId: apid.RecordedId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db
                    .insert(schema.recordedTagsRecordedTag)
                    .values({
                        recordedId,
                        recordedTagId: tagId,
                    })
                    .onConflictDoNothing();
            } else {
                const { db, schema } = client;
                await db
                    .insert(schema.recordedTagsRecordedTag)
                    .values({
                        recordedId,
                        recordedTagId: tagId,
                    })
                    .onDuplicateKeyUpdate({ set: { recordedId } });
            }
        });
    }

    /**
     * recorded と tag の関連付けを削除
     */
    public async deleteRelation(tagId: apid.RecordedTagId, recordedId: apid.RecordedId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db
                    .delete(schema.recordedTagsRecordedTag)
                    .where(
                        and(
                            eq(schema.recordedTagsRecordedTag.recordedId, recordedId),
                            eq(schema.recordedTagsRecordedTag.recordedTagId, tagId),
                        ),
                    );
            } else {
                const { db, schema } = client;
                await db
                    .delete(schema.recordedTagsRecordedTag)
                    .where(
                        and(
                            eq(schema.recordedTagsRecordedTag.recordedId, recordedId),
                            eq(schema.recordedTagsRecordedTag.recordedTagId, tagId),
                        ),
                    );
            }
        });
    }

    /**
     * 指定された recordedId の すべての関連付けを削除する
     */
    public async deleteAllRelation(recordedId: apid.RecordedId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db
                    .delete(schema.recordedTagsRecordedTag)
                    .where(eq(schema.recordedTagsRecordedTag.recordedId, recordedId));
            } else {
                const { db, schema } = client;
                await db
                    .delete(schema.recordedTagsRecordedTag)
                    .where(eq(schema.recordedTagsRecordedTag.recordedId, recordedId));
            }
        });
    }

    /**
     * tagId を指定して削除
     */
    public async deleteOnce(tagId: apid.RecordedTagId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.delete(schema.recordedTags).where(eq(schema.recordedTags.id, tagId));
            } else {
                const { db, schema } = client;
                await db.delete(schema.recordedTags).where(eq(schema.recordedTags.id, tagId));
            }
        });
    }

    /**
     * tagId を指定して tag を取得する
     */
    public async findId(tagId: apid.RecordedTagId): Promise<RecordedTag | null> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db.select().from(schema.recordedTags).where(eq(schema.recordedTags.id, tagId));
                if (rows.length === 0) return null;
                return this.toEntity(rows[0]);
            } else {
                const { db, schema } = client;
                const rows = await db.select().from(schema.recordedTags).where(eq(schema.recordedTags.id, tagId));
                if (rows.length === 0) return null;
                return this.toEntity(rows[0]);
            }
        });
    }

    /**
     * 全件取得
     */
    public async findAll(option: apid.GetRecordedTagOption): Promise<[RecordedTag[], number]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const conditions: any[] = [];

            if (typeof option.excludeTagId !== 'undefined' && option.excludeTagId.length > 0) {
                conditions.push(notInArray(client.schema.recordedTags.id, option.excludeTagId));
            }

            if (typeof option.name !== 'undefined') {
                const names = StrUtil.toHalf(option.name).split(/ /);
                for (const name of names) {
                    if (name.length > 0) {
                        conditions.push(like(client.schema.recordedTags.halfWidthName, `%${name}%`));
                    }
                }
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            if (client.type === 'sqlite') {
                const { db, schema } = client;
                let query = db.select().from(schema.recordedTags);
                if (whereClause) query = query.where(whereClause) as any;
                if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
                if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

                const rows = await query;

                let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.recordedTags);
                if (whereClause) countQuery = countQuery.where(whereClause) as any;
                const countResult = await countQuery;
                const totalCount = countResult[0]?.count || 0;

                return [rows.map(r => this.toEntity(r)), totalCount];
            } else {
                const { db, schema } = client;
                let query = db.select().from(schema.recordedTags);
                if (whereClause) query = query.where(whereClause) as any;
                if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
                if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

                const rows = await query;

                let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.recordedTags);
                if (whereClause) countQuery = countQuery.where(whereClause) as any;
                const countResult = await countQuery;
                const totalCount = countResult[0]?.count || 0;

                return [rows.map(r => this.toEntity(r)), totalCount];
            }
        });
    }

    private toEntity(row: any): RecordedTag {
        const entity = new RecordedTag();
        entity.id = row.id;
        entity.name = row.name;
        entity.halfWidthName = row.halfWidthName;
        entity.color = row.color;
        return entity;
    }
}
