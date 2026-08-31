import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import Reserve from '../../db/entities/Reserve';
import { IReserveUpdateValues } from '../event/IReserveEvent';
import IPromiseRetry from '../IPromiseRetry';
import { DrizzleHelper } from './DrizzleHelper';
import IDrizzleOperator from './IDrizzleOperator';
import IReserveDB, {
    IFindRuleOption,
    IFindTimeRangesOption,
    IFindTimeSpecificationOption,
    IGetManualIdsOption,
    RuleIdCountResult,
} from './IReserveDB';

@injectable()
export default class ReserveDB implements IReserveDB {
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
    public async restore(items: Reserve[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                await tx.delete(schema.reserves);
                for (const item of items) {
                    await tx.insert(schema.reserves).values(this.toRow(item));
                }
            });
        });
    }

    /**
     * 1つだけ挿入
     */
    public async insertOnce(reserve: Reserve): Promise<apid.ReserveId> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const row = this.toRow(reserve);
            delete row.id;

            const { db, schema } = client;
            const result = await (db as any).insert(schema.reserves).values(row);
            return DrizzleHelper.getInsertId(client.type, result);
        });
    }

    /**
     * 1件更新
     */
    public async updateOnce(reserve: Reserve): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const row = this.toRow(reserve);
            const { db, schema } = client;
            await (db as any).update(schema.reserves).set(row).where(eq(schema.reserves.id, reserve.id));
        });
    }

    /**
     * delete, insert, update をまとめて行う
     */
    public async updateMany(values: IReserveUpdateValues): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                if (values.delete && values.delete.length > 0) {
                    const deleteIds = values.delete.map(d => d.id);
                    await tx.delete(schema.reserves).where(inArray(schema.reserves.id, deleteIds));
                }
                if (values.insert && values.insert.length > 0) {
                    for (const newReserve of values.insert) {
                        const row = this.toRow(newReserve);
                        delete row.id;
                        const result = await tx.insert(schema.reserves).values(row);
                        newReserve.id = DrizzleHelper.getInsertId(client.type, result);
                    }
                }
                if (values.update && values.update.length > 0) {
                    for (const u of values.update) {
                        const row = this.toRow(u);
                        await tx.update(schema.reserves).set(row).where(eq(schema.reserves.id, u.id));
                    }
                }
            });
        });
    }

    /**
     * 指定した id の予約情報を取得する
     */
    public async findId(reserveId: apid.ReserveId): Promise<Reserve | null> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.reserves).where(eq(schema.reserves.id, reserveId));
            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * 全件取得
     */
    public async findAll(option: apid.GetReserveOption): Promise<[Reserve[], number]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const conditions: any[] = [];
            if (option.type === 'normal') {
                conditions.push(eq(schema.reserves.isConflict, false));
                conditions.push(eq(schema.reserves.isSkip, false));
                conditions.push(eq(schema.reserves.isOverlap, false));
            } else if (option.type === 'conflict') {
                conditions.push(eq(schema.reserves.isConflict, true));
                conditions.push(eq(schema.reserves.isSkip, false));
                conditions.push(eq(schema.reserves.isOverlap, false));
            } else if (option.type === 'skip') {
                conditions.push(eq(schema.reserves.isConflict, false));
                conditions.push(eq(schema.reserves.isSkip, true));
                conditions.push(eq(schema.reserves.isOverlap, false));
            } else if (option.type === 'overlap') {
                conditions.push(eq(schema.reserves.isConflict, false));
                conditions.push(eq(schema.reserves.isSkip, false));
                conditions.push(eq(schema.reserves.isOverlap, true));
            }

            if (typeof option.ruleId !== 'undefined') {
                conditions.push(eq(schema.reserves.ruleId, option.ruleId));
            }

            // 終了済み番組を除外
            conditions.push(gt(schema.reserves.endAt, Date.now()));
            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

            let query = (db as any).select().from(schema.reserves);
            if (whereClause) query = query.where(whereClause) as any;
            query = query.orderBy(asc(schema.reserves.startAt)) as any;
            if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
            if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

            const rows = await query;

            let countQuery = (db as any).select({ count: sql<number>`count(*)` }).from(schema.reserves);
            if (whereClause) countQuery = countQuery.where(whereClause) as any;
            const countResult = await countQuery;
            const totalCount = countResult[0]?.count || 0;

            return [rows.map((r: any) => this.toEntity(r)), totalCount];
        });
    }

    /**
     * オプションで指定した時刻間の予約情報を取得する
     */
    public async findLists(option?: apid.GetReserveListsOption): Promise<Reserve[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const conditions: any[] = [];
            if (typeof option !== 'undefined') {
                conditions.push(lte(schema.reserves.startAt, option.endAt));
                conditions.push(gte(schema.reserves.endAt, option.startAt));
            }
            const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
            let query = (db as any).select().from(schema.reserves);
            if (whereClause) query = query.where(whereClause) as any;
            const rows = await query;
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    /**
     * programId を指定して予約情報を取得する
     */
    public async findProgramId(programId: apid.ProgramId): Promise<Reserve[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.reserves)
                .where(eq(schema.reserves.programId, programId));
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    /**
     * 指定された時刻範囲と重複する予約情報を取得する
     */
    public async findTimeRanges(option: IFindTimeRangesOption): Promise<Reserve[]> {
        if (option.times.length === 0) return [];

        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const timeConditions: any[] = [];
            for (const time of option.times) {
                timeConditions.push(
                    and(lt(schema.reserves.startAt, time.endAt), gt(schema.reserves.endAt, time.startAt)),
                );
            }

            const conditions: any[] = [or(...timeConditions)];
            if (option.hasConflict === false) {
                conditions.push(eq(schema.reserves.isConflict, false));
            }
            if (option.hasSkip === false) {
                conditions.push(eq(schema.reserves.isSkip, false));
            }
            if (option.hasOverlap === false) {
                conditions.push(eq(schema.reserves.isOverlap, false));
            }
            if (typeof option.excludeRuleId !== 'undefined') {
                conditions.push(or(isNull(schema.reserves.ruleId), ne(schema.reserves.ruleId, option.excludeRuleId)));
            }
            if (typeof option.excludeReserveId !== 'undefined') {
                conditions.push(ne(schema.reserves.id, option.excludeReserveId));
            }

            const whereClause = and(...conditions);
            const rows = await (db as any).select().from(schema.reserves).where(whereClause);
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    /**
     * ruleId を指定して予約情報を取得する
     */
    public async findRuleId(option: IFindRuleOption): Promise<Reserve[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const conditions: any[] = [eq(schema.reserves.ruleId, option.ruleId)];
            if (option.hasConflict === false) {
                conditions.push(eq(schema.reserves.isConflict, false));
            }
            if (option.hasSkip === false) {
                conditions.push(eq(schema.reserves.isSkip, false));
            }
            if (option.hasOverlap === false) {
                conditions.push(eq(schema.reserves.isOverlap, false));
            }
            if (option.hasEventRelay === false) {
                conditions.push(eq(schema.reserves.isEventRelay, false));
            }

            const whereClause = and(...conditions);
            const rows = await (db as any).select().from(schema.reserves).where(whereClause);
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    /**
     * 指定した時刻より古い予約情報を取得する
     */
    public async findOldTime(baseTime: apid.UnixtimeMS): Promise<Reserve[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.reserves).where(lt(schema.reserves.endAt, baseTime));
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    /**
     * 指定された時刻指定予約情報を取得する
     */
    public async findTimeSpecification(option: IFindTimeSpecificationOption): Promise<Reserve | null> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const whereClause = and(
                eq(schema.reserves.channelId, option.channelId),
                eq(schema.reserves.startAt, option.startAt),
                eq(schema.reserves.endAt, option.endAt),
                isNull(schema.reserves.ruleId),
            );
            const rows = await (db as any).select().from(schema.reserves).where(whereClause);
            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * 手動予約の reserve id を取得する
     */
    public async getManualIds(option: IGetManualIdsOption): Promise<apid.ReserveId[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const conditions: any[] = [isNull(schema.reserves.ruleId)];
            if (option.hasTimeReserve === false) {
                conditions.push(isNotNull(schema.reserves.programId));
            }
            const whereClause = and(...conditions);
            const rows = await (db as any)
                .select({ id: schema.reserves.id })
                .from(schema.reserves)
                .where(whereClause)
                .orderBy(asc(schema.reserves.id));
            return rows.map((r: any) => r.id);
        });
    }

    /**
     * ルール予約によってイベントリレーで予約された reserve id を取得する
     */
    public async getRuleEventRelayIds(): Promise<apid.ReserveId[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const whereClause = and(isNotNull(schema.reserves.ruleId), eq(schema.reserves.isEventRelay, true));
            const rows = await (db as any)
                .select({ id: schema.reserves.id })
                .from(schema.reserves)
                .where(whereClause)
                .orderBy(asc(schema.reserves.id));
            return rows.map((r: any) => r.id);
        });
    }

    /**
     * ruleId を指定して予約数をカウントする
     */
    public async countRuleIds(ruleIds: apid.RuleId[], type: apid.GetReserveType): Promise<RuleIdCountResult[]> {
        if (ruleIds.length === 0) return [];

        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const conditions: any[] = [inArray(schema.reserves.ruleId, ruleIds)];
            if (type === 'normal') {
                conditions.push(eq(schema.reserves.isConflict, false));
                conditions.push(eq(schema.reserves.isSkip, false));
                conditions.push(eq(schema.reserves.isOverlap, false));
            } else if (type === 'conflict') {
                conditions.push(eq(schema.reserves.isConflict, true));
                conditions.push(eq(schema.reserves.isSkip, false));
                conditions.push(eq(schema.reserves.isOverlap, false));
            } else if (type === 'skip') {
                conditions.push(eq(schema.reserves.isConflict, false));
                conditions.push(eq(schema.reserves.isSkip, true));
                conditions.push(eq(schema.reserves.isOverlap, false));
            } else if (type === 'overlap') {
                conditions.push(eq(schema.reserves.isConflict, false));
                conditions.push(eq(schema.reserves.isSkip, false));
                conditions.push(eq(schema.reserves.isOverlap, true));
            }
            const whereClause = and(...conditions);
            const rows = await (db as any)
                .select({
                    ruleId: schema.reserves.ruleId,
                    ruleIdCnt: sql<number>`count(${schema.reserves.ruleId})`,
                })
                .from(schema.reserves)
                .where(whereClause)
                .groupBy(schema.reserves.ruleId);
            return rows.map((r: any) => ({
                ruleId: r.ruleId!,
                ruleIdCnt: Number(r.ruleIdCnt),
            }));
        });
    }

    private toRow(entity: Partial<Reserve>): any {
        const row: any = { ...entity };
        row.updateTime = entity.updateTime || Date.now();
        return row;
    }

    private toEntity(row: any): Reserve {
        const entity = new Reserve();
        Object.assign(entity, row);
        entity.isSkip = !!row.isSkip;
        entity.isConflict = !!row.isConflict;
        entity.allowEndLack = !!row.allowEndLack;
        entity.isOverlap = !!row.isOverlap;
        entity.isIgnoreOverlap = !!row.isIgnoreOverlap;
        entity.isTimeSpecified = !!row.isTimeSpecified;
        entity.isEventRelay = !!row.isEventRelay;
        entity.isDeleteOriginalAfterEncode = !!row.isDeleteOriginalAfterEncode;
        return entity;
    }
}
