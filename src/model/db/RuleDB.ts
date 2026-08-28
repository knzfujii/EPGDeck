import { and, asc, eq, like, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import StrUtil from '../../util/StrUtil';
import IPromiseRetry from '../IPromiseRetry';
import IDrizzleOperator from './IDrizzleOperator';
import IRuleDB, { RuleWithCnt } from './IRuleDB';

@injectable()
export default class RuleDB implements IRuleDB {
    private drizzleOp: IDrizzleOperator;
    private promieRetry: IPromiseRetry;

    constructor(@inject('IDrizzleOperator') drizzleOp: IDrizzleOperator, @inject('IPromiseRetry') promieRetry: IPromiseRetry) {
        this.drizzleOp = drizzleOp;
        this.promieRetry = promieRetry;
    }

    /**
     * バックアップから復元
     */
    public async restore(items: RuleWithCnt[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.rules);
                    for (const item of items) {
                        await tx.insert(schema.rules).values(this.convertRuleToDBRow(item));
                    }
                });
            } else {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.rules);
                    for (const item of items) {
                        await tx.insert(schema.rules).values(this.convertRuleToDBRow(item));
                    }
                });
            }
        });
    }

    /**
     * ルールを1件挿入
     */
    public async insertOnce(rule: apid.Rule | apid.AddRuleOption): Promise<apid.RuleId> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const row = this.convertRuleToDBRow(rule);
            delete row.id;

            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const result = await db.insert(schema.rules).values(row);
                return Number(result.lastInsertRowid);
            } else {
                const { db, schema } = client;
                const [result] = await db.insert(schema.rules).values(row);
                return result.insertId;
            }
        });
    }

    /**
     * ルールを1件更新
     */
    public async updateOnce(newRule: apid.Rule): Promise<void> {
        const oldRule = (await this.findId(newRule.id, true)) as RuleWithCnt | null;
        if (oldRule === null) {
            throw new Error('RuleIsNull');
        }

        const convertedRow = this.convertRuleToDBRow(newRule);
        convertedRow.updateCnt = oldRule.updateCnt + 1;

        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.update(schema.rules).set(convertedRow).where(eq(schema.rules.id, newRule.id));
            } else {
                const { db, schema } = client;
                await db.update(schema.rules).set(convertedRow).where(eq(schema.rules.id, newRule.id));
            }
        });
    }

    /**
     * 指定したルールを1件有効化
     */
    public async enableOnce(ruleId: apid.RuleId): Promise<void> {
        const rule = (await this.findId(ruleId, true)) as RuleWithCnt | null;
        if (rule === null) {
            throw new Error('RuleIsNull');
        }

        if (rule.reserveOption.enable === true) {
            return;
        }

        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const values = {
                enable: true,
                updateCnt: rule.updateCnt + 1,
            };

            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.update(schema.rules).set(values).where(eq(schema.rules.id, ruleId));
            } else {
                const { db, schema } = client;
                await db.update(schema.rules).set(values).where(eq(schema.rules.id, ruleId));
            }
        });
    }

    /**
     * 指定したルールを1件無効化
     */
    public async disableOnce(ruleId: apid.RuleId): Promise<void> {
        const rule = (await this.findId(ruleId, true)) as RuleWithCnt | null;
        if (rule === null) {
            throw new Error('RuleIsNull');
        }

        if (rule.reserveOption.enable === false) {
            return;
        }

        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const values = {
                enable: false,
                updateCnt: rule.updateCnt + 1,
            };

            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.update(schema.rules).set(values).where(eq(schema.rules.id, ruleId));
            } else {
                const { db, schema } = client;
                await db.update(schema.rules).set(values).where(eq(schema.rules.id, ruleId));
            }
        });
    }

    /**
     * 指定したルールを1件削除
     */
    public async deleteOnce(ruleId: apid.RuleId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.delete(schema.rules).where(eq(schema.rules.id, ruleId));
            } else {
                const { db, schema } = client;
                await db.delete(schema.rules).where(eq(schema.rules.id, ruleId));
            }
        });
    }

    /**
     * id を指定して取得
     */
    public async findId(ruleId: apid.RuleId, isNeedCnt: boolean = false): Promise<apid.Rule | RuleWithCnt | null> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            let row: any = null;
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db.select().from(schema.rules).where(eq(schema.rules.id, ruleId));
                if (rows.length > 0) row = rows[0];
            } else {
                const { db, schema } = client;
                const rows = await db.select().from(schema.rules).where(eq(schema.rules.id, ruleId));
                if (rows.length > 0) row = rows[0];
            }

            if (!row) return null;

            const rule = this.convertDBRowToRule(row);
            if (!isNeedCnt) {
                delete (rule as any).updateCnt;
            }
            return rule;
        });
    }

    /**
     * 全件取得
     */
    public async findAll(option: apid.GetRuleOption, isNeedCnt: boolean = false): Promise<[apid.Rule[], number]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const conditions: any[] = [];
                if (typeof option.keyword !== 'undefined') {
                    const names = StrUtil.toHalf(option.keyword).split(/ /);
                    for (const name of names) {
                        if (name.length > 0) {
                            conditions.push(like(schema.rules.halfWidthKeyword, `%${name}%`));
                        }
                    }
                }
                const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
                let query = db.select().from(schema.rules);
                if (whereClause) query = query.where(whereClause) as any;
                query = query.orderBy(asc(schema.rules.id)) as any;
                if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
                if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

                const rows = await query;

                let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.rules);
                if (whereClause) countQuery = countQuery.where(whereClause) as any;
                const countResult = await countQuery;
                const total = countResult[0]?.count || 0;

                return [
                    rows.map(r => {
                        const rule = this.convertDBRowToRule(r);
                        if (!isNeedCnt) delete (rule as any).updateCnt;
                        return rule;
                    }),
                    total,
                ];
            } else {
                const { db, schema } = client;
                const conditions: any[] = [];
                if (typeof option.keyword !== 'undefined') {
                    const names = StrUtil.toHalf(option.keyword).split(/ /);
                    for (const name of names) {
                        if (name.length > 0) {
                            conditions.push(like(schema.rules.halfWidthKeyword, `%${name}%`));
                        }
                    }
                }
                const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
                let query = db.select().from(schema.rules);
                if (whereClause) query = query.where(whereClause) as any;
                query = query.orderBy(asc(schema.rules.id)) as any;
                if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
                if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

                const rows = await query;

                let countQuery = db.select({ count: sql<number>`count(*)` }).from(schema.rules);
                if (whereClause) countQuery = countQuery.where(whereClause) as any;
                const countResult = await countQuery;
                const total = countResult[0]?.count || 0;

                return [
                    rows.map(r => {
                        const rule = this.convertDBRowToRule(r);
                        if (!isNeedCnt) delete (rule as any).updateCnt;
                        return rule;
                    }),
                    total,
                ];
            }
        });
    }

    /**
     * キーワード検索
     */
    public async findKeyword(option: apid.GetRuleOption): Promise<apid.RuleKeywordItem[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const conditions: any[] = [];
                if (typeof option.keyword !== 'undefined') {
                    const names = StrUtil.toHalf(option.keyword).split(/ /);
                    for (const name of names) {
                        if (name.length > 0) {
                            conditions.push(like(schema.rules.halfWidthKeyword, `%${name}%`));
                        }
                    }
                }
                const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
                let query = db.select({ id: schema.rules.id, keyword: schema.rules.keyword }).from(schema.rules);
                if (whereClause) query = query.where(whereClause) as any;
                query = query.orderBy(asc(schema.rules.id)) as any;
                if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
                if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

                const rows = await query;
                return rows.map(r => ({
                    id: r.id,
                    keyword: r.keyword === null ? '' : r.keyword,
                }));
            } else {
                const { db, schema } = client;
                const conditions: any[] = [];
                if (typeof option.keyword !== 'undefined') {
                    const names = StrUtil.toHalf(option.keyword).split(/ /);
                    for (const name of names) {
                        if (name.length > 0) {
                            conditions.push(like(schema.rules.halfWidthKeyword, `%${name}%`));
                        }
                    }
                }
                const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
                let query = db.select({ id: schema.rules.id, keyword: schema.rules.keyword }).from(schema.rules);
                if (whereClause) query = query.where(whereClause) as any;
                query = query.orderBy(asc(schema.rules.id)) as any;
                if (typeof option.offset !== 'undefined') query = query.offset(option.offset) as any;
                if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;

                const rows = await query;
                return rows.map(r => ({
                    id: r.id,
                    keyword: r.keyword === null ? '' : r.keyword,
                }));
            }
        });
    }

    /**
     * rule id を全て取得する
     */
    public async getIds(): Promise<apid.RuleId[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db.select({ id: schema.rules.id }).from(schema.rules).orderBy(asc(schema.rules.id));
                return rows.map(r => r.id);
            } else {
                const { db, schema } = client;
                const rows = await db.select({ id: schema.rules.id }).from(schema.rules).orderBy(asc(schema.rules.id));
                return rows.map(r => r.id);
            }
        });
    }

    private convertRuleToDBRow(rule: RuleWithCnt | apid.Rule | apid.AddRuleOption): any {
        const converted: any = {
            updateCnt: typeof (rule as any).updateCnt === 'number' ? (rule as any).updateCnt : 0,
            isTimeSpecification: rule.isTimeSpecification,
            keyword: typeof rule.searchOption.keyword === 'undefined' ? null : rule.searchOption.keyword,
            halfWidthKeyword:
                typeof rule.searchOption.keyword === 'undefined' ? null : StrUtil.toHalf(rule.searchOption.keyword),
            ignoreKeyword:
                typeof rule.searchOption.ignoreKeyword === 'undefined' ? null : rule.searchOption.ignoreKeyword,
            halfWidthIgnoreKeyword:
                typeof rule.searchOption.ignoreKeyword === 'undefined'
                    ? null
                    : StrUtil.toHalf(rule.searchOption.ignoreKeyword),
            keyCS: !!rule.searchOption.keyCS,
            keyRegExp: !!rule.searchOption.keyRegExp,
            name: !!rule.searchOption.name,
            description: !!rule.searchOption.description,
            extended: !!rule.searchOption.extended,
            ignoreKeyCS: !!rule.searchOption.ignoreKeyCS,
            ignoreKeyRegExp: !!rule.searchOption.ignoreKeyRegExp,
            ignoreName: !!rule.searchOption.ignoreName,
            ignoreDescription: !!rule.searchOption.ignoreDescription,
            ignoreExtended: !!rule.searchOption.ignoreExtended,
            GR: !!rule.searchOption.GR,
            BS: !!rule.searchOption.BS,
            CS: !!rule.searchOption.CS,
            SKY: !!rule.searchOption.SKY,
            channelIds:
                typeof rule.searchOption.channelIds === 'undefined'
                    ? null
                    : JSON.stringify(rule.searchOption.channelIds),
            genres: typeof rule.searchOption.genres === 'undefined' ? null : JSON.stringify(rule.searchOption.genres),
            times: typeof rule.searchOption.times === 'undefined' ? null : JSON.stringify(rule.searchOption.times),
            isFree: !!rule.searchOption.isFree,
            durationMin: typeof rule.searchOption.durationMin === 'undefined' ? null : rule.searchOption.durationMin,
            durationMax: typeof rule.searchOption.durationMax === 'undefined' ? null : rule.searchOption.durationMax,
            searchPeriods:
                typeof rule.searchOption.searchPeriods === 'undefined'
                    ? null
                    : JSON.stringify(rule.searchOption.searchPeriods),
            enable: rule.reserveOption.enable,
            avoidDuplicate: rule.reserveOption.avoidDuplicate,
            periodToAvoidDuplicate:
                typeof rule.reserveOption.periodToAvoidDuplicate === 'undefined'
                    ? null
                    : rule.reserveOption.periodToAvoidDuplicate,
            allowEndLack: rule.reserveOption.allowEndLack,
            tags: typeof rule.reserveOption.tags === 'undefined' ? null : JSON.stringify(rule.reserveOption.tags),
            parentDirectoryName: null,
            directory: null,
            recordedFormat: null,
            mode1: null,
            parentDirectoryName1: null,
            directory1: null,
            mode2: null,
            parentDirectoryName2: null,
            directory2: null,
            mode3: null,
            parentDirectoryName3: null,
            directory3: null,
            isDeleteOriginalAfterEncode: false,
        };

        if (typeof (rule as apid.Rule).id !== 'undefined') {
            converted.id = (rule as apid.Rule).id;
        }

        if (typeof rule.saveOption !== 'undefined') {
            converted.parentDirectoryName =
                typeof rule.saveOption.parentDirectoryName === 'undefined' ? null : rule.saveOption.parentDirectoryName;
            converted.directory =
                typeof rule.saveOption.directory === 'undefined' ? null : rule.saveOption.directory;
            converted.recordedFormat =
                typeof rule.saveOption.recordedFormat === 'undefined' ? null : rule.saveOption.recordedFormat;
        }

        if (typeof rule.encodeOption !== 'undefined') {
            converted.mode1 = typeof rule.encodeOption.mode1 === 'undefined' ? null : rule.encodeOption.mode1;
            converted.parentDirectoryName1 =
                typeof rule.encodeOption.encodeParentDirectoryName1 === 'undefined'
                    ? null
                    : rule.encodeOption.encodeParentDirectoryName1;
            converted.directory1 =
                typeof rule.encodeOption.directory1 === 'undefined' ? null : rule.encodeOption.directory1;
            converted.mode2 = typeof rule.encodeOption.mode2 === 'undefined' ? null : rule.encodeOption.mode2;
            converted.parentDirectoryName2 =
                typeof rule.encodeOption.encodeParentDirectoryName2 === 'undefined'
                    ? null
                    : rule.encodeOption.encodeParentDirectoryName2;
            converted.directory2 =
                typeof rule.encodeOption.directory2 === 'undefined' ? null : rule.encodeOption.directory2;
            converted.mode3 = typeof rule.encodeOption.mode3 === 'undefined' ? null : rule.encodeOption.mode3;
            converted.parentDirectoryName3 =
                typeof rule.encodeOption.encodeParentDirectoryName3 === 'undefined'
                    ? null
                    : rule.encodeOption.encodeParentDirectoryName3;
            converted.directory3 =
                typeof rule.encodeOption.directory3 === 'undefined' ? null : rule.encodeOption.directory3;
            converted.isDeleteOriginalAfterEncode = !!rule.encodeOption.isDeleteOriginalAfterEncode;
        }

        return converted;
    }

    private convertDBRowToRule(row: any): RuleWithCnt {
        const converted: RuleWithCnt = {
            id: row.id,
            updateCnt: row.updateCnt,
            isTimeSpecification: !!row.isTimeSpecification,
            searchOption: {
                keyCS: !!row.keyCS,
                keyRegExp: !!row.keyRegExp,
                name: !!row.name,
                description: !!row.description,
                extended: !!row.extended,
                ignoreKeyCS: !!row.ignoreKeyCS,
                ignoreKeyRegExp: !!row.ignoreKeyRegExp,
                ignoreName: !!row.ignoreName,
                ignoreDescription: !!row.ignoreDescription,
                ignoreExtended: !!row.ignoreExtended,
                GR: !!row.GR,
                BS: !!row.BS,
                CS: !!row.CS,
                SKY: !!row.SKY,
                isFree: !!row.isFree,
            },
            reserveOption: {
                enable: !!row.enable,
                allowEndLack: !!row.allowEndLack,
                avoidDuplicate: !!row.avoidDuplicate,
            },
        };

        if (row.keyword !== null) converted.searchOption.keyword = row.keyword;
        if (row.ignoreKeyword !== null) converted.searchOption.ignoreKeyword = row.ignoreKeyword;
        if (row.channelIds !== null) converted.searchOption.channelIds = JSON.parse(row.channelIds);
        if (row.genres !== null) converted.searchOption.genres = JSON.parse(row.genres);
        if (row.times !== null) converted.searchOption.times = JSON.parse(row.times);
        if (row.durationMin !== null) converted.searchOption.durationMin = row.durationMin;
        if (row.durationMax !== null) converted.searchOption.durationMax = row.durationMax;
        if (row.searchPeriods !== null) converted.searchOption.searchPeriods = JSON.parse(row.searchPeriods);

        if (row.periodToAvoidDuplicate !== null) converted.reserveOption.periodToAvoidDuplicate = row.periodToAvoidDuplicate;
        if (row.tags !== null) converted.reserveOption.tags = JSON.parse(row.tags);

        const saveOption: apid.ReserveSaveOption = {};
        if (row.parentDirectoryName !== null) saveOption.parentDirectoryName = row.parentDirectoryName;
        if (row.directory !== null) saveOption.directory = row.directory;
        if (row.recordedFormat !== null) saveOption.recordedFormat = row.recordedFormat;
        if (Object.keys(saveOption).length > 0) converted.saveOption = saveOption;

        const encodeOption: apid.ReserveEncodedOption = {} as any;
        if (row.mode1 !== null) encodeOption.mode1 = row.mode1;
        if (row.parentDirectoryName1 !== null) encodeOption.encodeParentDirectoryName1 = row.parentDirectoryName1;
        if (row.directory1 !== null) encodeOption.directory1 = row.directory1;
        if (row.mode2 !== null) encodeOption.mode2 = row.mode2;
        if (row.parentDirectoryName2 !== null) encodeOption.encodeParentDirectoryName2 = row.parentDirectoryName2;
        if (row.directory2 !== null) encodeOption.directory2 = row.directory2;
        if (row.mode3 !== null) encodeOption.mode3 = row.mode3;
        if (row.parentDirectoryName3 !== null) encodeOption.encodeParentDirectoryName3 = row.parentDirectoryName3;
        if (row.directory3 !== null) encodeOption.directory3 = row.directory3;
        if (Object.keys(encodeOption).length > 0) {
            encodeOption.isDeleteOriginalAfterEncode = !!row.isDeleteOriginalAfterEncode;
            converted.encodeOption = encodeOption;
        }

        return converted;
    }
}
