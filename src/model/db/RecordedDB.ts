import { and, asc, desc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import DropLogFile from '../../db/entities/DropLogFile';
import Recorded from '../../db/entities/Recorded';
import RecordedTag from '../../db/entities/RecordedTag';
import Thumbnail from '../../db/entities/Thumbnail';
import VideoFile from '../../db/entities/VideoFile';
import StrUtil from '../../util/StrUtil';
import IPromiseRetry from '../IPromiseRetry';
import IDrizzleOperator from './IDrizzleOperator';
import IRecordedDB, { FindAllOption, RecordedColumnOption } from './IRecordedDB';

@injectable()
export default class RecordedDB implements IRecordedDB {
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
    public async restore(items: Recorded[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                await tx.delete(schema.thumbnails);
                await tx.delete(schema.videoFiles);
                await tx.delete(schema.recorded);

                for (const item of items) {
                    await tx.insert(schema.recorded).values(this.toRow(item));
                }
            });
        });
    }

    /**
     * 録画番組情報を 1 件挿入
     */
    public async insertOnce(recorded: Recorded): Promise<apid.RecordedId> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const row = this.toRow(recorded);
            delete row.id;

            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const result = await db.insert(schema.recorded).values(row);
                return Number(result.lastInsertRowid);
            } else {
                const { db, schema } = client;
                const [result] = await db.insert(schema.recorded).values(row);
                return result.insertId;
            }
        });
    }

    /**
     * 録画番組情報の更新
     */
    public async updateOnce(recorded: Recorded): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const row = this.toRow(recorded);
            const { db, schema } = client;
            await (db as any).update(schema.recorded).set(row).where(eq(schema.recorded.id, recorded.id));
        });
    }

    /**
     * 指定した録画情報の isRecording を false に
     */
    public async removeRecording(
        recordedId: apid.RecordedId,
        actualDuration?: number,
        actualEndAt?: number,
    ): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const updateValues: Record<string, any> = { isRecording: false };
            if (typeof actualDuration === 'number' && actualDuration > 0) {
                updateValues.duration = actualDuration;
            }
            if (typeof actualEndAt === 'number' && actualEndAt > 0) {
                updateValues.endAt = actualEndAt;
            }
            await (db as any).update(schema.recorded).set(updateValues).where(eq(schema.recorded.id, recordedId));
        });
    }

    /**
     * 指定した drop log file id を削除する
     */
    public async removeDropLogFileId(dropLogFileId: apid.DropLogFileId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any)
                .update(schema.recorded)
                .set({ dropLogFileId: null })
                .where(eq(schema.recorded.dropLogFileId, dropLogFileId));
        });
    }

    /**
     * 指定した ruleId を削除する
     */
    public async removeRuleId(ruleId: apid.RuleId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).update(schema.recorded).set({ ruleId: null }).where(eq(schema.recorded.ruleId, ruleId));
        });
    }

    /**
     * 保護状態を変更する
     */
    public async changeProtect(recordedId: apid.RecordedId, isProtect: boolean): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any)
                .update(schema.recorded)
                .set({ isProtected: isProtect })
                .where(eq(schema.recorded.id, recordedId));
        });
    }

    /**
     * 指定した録画番組情報を 1 件削除
     */
    public async deleteOnce(recordedId: apid.RecordedId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.recorded).where(eq(schema.recorded.id, recordedId));
        });
    }

    /**
     * id を指定して録画番組情報取得
     */
    public async findId(recordedId: apid.RecordedId): Promise<Recorded | null> {
        const results = await this.findIds([recordedId], undefined, false);
        return results.length === 0 ? null : results[0];
    }

    /**
     * id を複数指定して番組情報を取得する
     */
    public async findIds(
        recordedIds: apid.RecordedId[],
        columnOption?: RecordedColumnOption,
        isReverse?: boolean,
    ): Promise<Recorded[]> {
        if (recordedIds.length === 0) return [];

        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const isNeedVideoFiles = typeof columnOption === 'undefined' || columnOption.isNeedVideoFiles === true;
            const isNeedThumbnails = typeof columnOption === 'undefined' || columnOption.isNeedThumbnails === true;
            const isNeedsDropLog = typeof columnOption !== 'undefined' && columnOption.isNeedsDropLog === true;
            const isNeedTags = typeof columnOption !== 'undefined' && columnOption.isNeedTags === true;

            let records: any[] = [];
            const { db, schema } = client;

            records = await (db as any)
                .select()
                .from(schema.recorded)
                .where(inArray(schema.recorded.id, recordedIds))
                .orderBy(isReverse ? asc(schema.recorded.startAt) : desc(schema.recorded.startAt));

            if (records.length === 0) return [];

            const idList = records.map(r => r.id);

            let videoFileMap = new Map<number, VideoFile[]>();
            if (isNeedVideoFiles) {
                videoFileMap = await this.fetchVideoFiles(client, idList);
            }

            let thumbnailMap = new Map<number, Thumbnail[]>();
            if (isNeedThumbnails) {
                thumbnailMap = await this.fetchThumbnails(client, idList);
            }

            let dropLogMap = new Map<number, DropLogFile>();
            if (isNeedsDropLog) {
                dropLogMap = await this.fetchDropLogs(client, records.map(r => r.dropLogFileId).filter(Boolean));
            }

            let tagsMap = new Map<number, RecordedTag[]>();
            if (isNeedTags) {
                tagsMap = await this.fetchTags(client, idList);
            }

            return records.map(r => {
                const entity = this.toEntity(r);
                if (isNeedVideoFiles) entity.videoFiles = videoFileMap.get(entity.id) || [];
                if (isNeedThumbnails) entity.thumbnails = thumbnailMap.get(entity.id) || [];
                if (isNeedsDropLog)
                    entity.dropLogFile = r.dropLogFileId ? dropLogMap.get(r.dropLogFileId) || null : null;
                if (isNeedTags) entity.tags = tagsMap.get(entity.id) || [];
                return entity;
            });
        });
    }

    /**
     * 全件取得
     */
    public async findAll(option: FindAllOption, columnOption: RecordedColumnOption): Promise<[Recorded[], number]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const conditions: any[] = [];

            if (typeof option.isRecording !== 'undefined') {
                conditions.push(eq(schema.recorded.isRecording, option.isRecording));
            }

            if (typeof option.ruleId !== 'undefined') {
                if (option.ruleId === 0) {
                    conditions.push(isNull(schema.recorded.ruleId));
                } else {
                    conditions.push(eq(schema.recorded.ruleId, option.ruleId));
                }
            }

            if (typeof option.channelId !== 'undefined') {
                conditions.push(eq(schema.recorded.channelId, option.channelId));
            }

            if (typeof option.genre !== 'undefined') {
                conditions.push(
                    or(
                        eq(schema.recorded.genre1, option.genre),
                        eq(schema.recorded.genre2, option.genre),
                        eq(schema.recorded.genre3, option.genre),
                    ),
                );
            }

            if (typeof option.keyword !== 'undefined') {
                const keywords = StrUtil.toHalf(option.keyword).split(/ /);
                for (const kw of keywords) {
                    if (kw.length > 0) {
                        conditions.push(
                            or(
                                like(schema.recorded.halfWidthName, `%${kw}%`),
                                like(schema.recorded.halfWidthDescription, `%${kw}%`),
                            ),
                        );
                    }
                }
            }

            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            let query = (db as any).select().from(schema.recorded);
            if (whereClause) query = query.where(whereClause) as any;
            query = query.orderBy(
                option.isReverse ? asc(schema.recorded.startAt) : desc(schema.recorded.startAt),
            ) as any;
            if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
            if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

            const records: any[] = await query;

            let countQuery = (db as any).select({ count: sql<number>`count(*)` }).from(schema.recorded);
            if (whereClause) countQuery = countQuery.where(whereClause) as any;
            const countResult = await countQuery;
            const totalCount = countResult[0]?.count || 0;

            if (records.length === 0) return [[], totalCount];

            const idList = records.map(r => r.id);

            const isNeedVideoFiles = columnOption.isNeedVideoFiles === true;
            const isNeedThumbnails = columnOption.isNeedThumbnails === true;
            const isNeedsDropLog = columnOption.isNeedsDropLog === true;
            const isNeedTags = columnOption.isNeedTags === true;

            let videoFileMap = new Map<number, VideoFile[]>();
            if (isNeedVideoFiles) {
                videoFileMap = await this.fetchVideoFiles(client, idList);
            }

            let thumbnailMap = new Map<number, Thumbnail[]>();
            if (isNeedThumbnails) {
                thumbnailMap = await this.fetchThumbnails(client, idList);
            }

            let dropLogMap = new Map<number, DropLogFile>();
            if (isNeedsDropLog) {
                dropLogMap = await this.fetchDropLogs(client, records.map(r => r.dropLogFileId).filter(Boolean));
            }

            let tagsMap = new Map<number, RecordedTag[]>();
            if (isNeedTags) {
                tagsMap = await this.fetchTags(client, idList);
            }

            let results = records.map(r => {
                const entity = this.toEntity(r);
                if (isNeedVideoFiles) entity.videoFiles = videoFileMap.get(entity.id) || [];
                if (isNeedThumbnails) entity.thumbnails = thumbnailMap.get(entity.id) || [];
                if (isNeedsDropLog)
                    entity.dropLogFile = r.dropLogFileId ? dropLogMap.get(r.dropLogFileId) || null : null;
                if (isNeedTags) entity.tags = tagsMap.get(entity.id) || [];
                return entity;
            });

            if (isNeedVideoFiles && option.hasOriginalFile === true) {
                results = results.filter(r => r.videoFiles && r.videoFiles.some(vf => vf.type !== 'encoded'));
            }

            return [results, totalCount];
        });
    }

    /**
     * channelIdのリストを返す
     */
    public async findChannelList(): Promise<apid.RecordedChannelListItem[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select({
                    cnt: sql<number>`count(*)`,
                    channelId: schema.recorded.channelId,
                })
                .from(schema.recorded)
                .groupBy(schema.recorded.channelId);
            return rows.map((r: any) => ({ cnt: Number(r.cnt), channelId: r.channelId }));
        });
    }

    /**
     * genreのリストを返す
     */
    public async findGenreList(): Promise<apid.RecordedGenreListItem[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select({
                    cnt: sql<number>`count(*)`,
                    genre: schema.recorded.genre1,
                })
                .from(schema.recorded)
                .where(isNotNull(schema.recorded.genre1))
                .groupBy(schema.recorded.genre1);
            return rows.map((r: any) => ({ cnt: Number(r.cnt), genre: r.genre! }));
        });
    }

    /**
     * 一番古い番組を返す
     */
    public async findOld(): Promise<Recorded | null> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.recorded)
                .where(eq(schema.recorded.isProtected, false))
                .orderBy(asc(schema.recorded.startAt), asc(schema.recorded.id))
                .limit(1);

            if (rows.length === 0) return null;

            const results = await this.findIds([rows[0].id], undefined, false);
            return results.length === 0 ? null : results[0];
        });
    }

    /**
     * 指定した reserveId の録画を返す
     */
    public async findReserveId(reserveId: apid.ReserveId): Promise<Recorded[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.recorded)
                .where(eq(schema.recorded.reserveId, reserveId));

            if (rows.length === 0) return [];
            return await this.findIds(
                rows.map((r: any) => r.id),
                undefined,
                false,
            );
        });
    }

    private async fetchVideoFiles(client: any, recordedIds: number[]): Promise<Map<number, VideoFile[]>> {
        const map = new Map<number, VideoFile[]>();
        const { schema } = client;
        const rows = await client.db
            .select()
            .from(schema.videoFiles)
            .where(inArray(schema.videoFiles.recordedId, recordedIds));

        for (const row of rows) {
            const vf = new VideoFile();
            Object.assign(vf, row);
            if (!map.has(row.recordedId)) map.set(row.recordedId, []);
            map.get(row.recordedId)!.push(vf);
        }
        return map;
    }

    private async fetchThumbnails(client: any, recordedIds: number[]): Promise<Map<number, Thumbnail[]>> {
        const map = new Map<number, Thumbnail[]>();
        const { schema } = client;
        const rows = await client.db
            .select()
            .from(schema.thumbnails)
            .where(inArray(schema.thumbnails.recordedId, recordedIds));

        for (const row of rows) {
            const t = new Thumbnail();
            Object.assign(t, row);
            if (!map.has(row.recordedId)) map.set(row.recordedId, []);
            map.get(row.recordedId)!.push(t);
        }
        return map;
    }

    private async fetchDropLogs(client: any, dropLogIds: number[]): Promise<Map<number, DropLogFile>> {
        const map = new Map<number, DropLogFile>();
        if (dropLogIds.length === 0) return map;

        const { schema } = client;
        const rows = await client.db
            .select()
            .from(schema.dropLogFiles)
            .where(inArray(schema.dropLogFiles.id, dropLogIds));

        for (const row of rows) {
            const dl = new DropLogFile();
            Object.assign(dl, row);
            map.set(row.id, dl);
        }
        return map;
    }

    private async fetchTags(client: any, recordedIds: number[]): Promise<Map<number, RecordedTag[]>> {
        const map = new Map<number, RecordedTag[]>();
        const { schema } = client;

        const rows = await client.db
            .select({
                recordedId: schema.recordedTagsRecordedTag.recordedId,
                tagId: schema.recordedTags.id,
                name: schema.recordedTags.name,
                halfWidthName: schema.recordedTags.halfWidthName,
                color: schema.recordedTags.color,
            })
            .from(schema.recordedTagsRecordedTag)
            .innerJoin(schema.recordedTags, eq(schema.recordedTagsRecordedTag.recordedTagId, schema.recordedTags.id))
            .where(inArray(schema.recordedTagsRecordedTag.recordedId, recordedIds));

        for (const row of rows) {
            const tag = new RecordedTag();
            tag.id = row.tagId;
            tag.name = row.name;
            tag.halfWidthName = row.halfWidthName;
            tag.color = row.color;
            if (!map.has(row.recordedId)) map.set(row.recordedId, []);
            map.get(row.recordedId)!.push(tag);
        }
        return map;
    }

    private toRow(entity: Partial<Recorded>): any {
        const row: any = { ...entity };
        delete row.videoFiles;
        delete row.thumbnails;
        delete row.dropLogFile;
        delete row.tags;
        return row;
    }

    private toEntity(row: any): Recorded {
        const entity = new Recorded();
        Object.assign(entity, row);
        entity.isProtected = !!row.isProtected;
        entity.isRecording = !!row.isRecording;
        entity.videoFiles = [];
        entity.thumbnails = [];
        entity.dropLogFile = null;
        entity.tags = [];
        return entity;
    }
}
