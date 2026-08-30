import { and, asc, eq, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import * as mapid from '../../../node_modules/mirakurun/api';
import Program from '../../db/entities/Program';
import DateUtil from '../../util/DateUtil';
import StrUtil from '../../util/StrUtil';
import IConfigFile from '../IConfigFile';
import IConfiguration from '../IConfiguration';
import IPromiseRetry from '../IPromiseRetry';
import IChannelTypeIndex from './IChannelTypeHash';
import IDrizzleOperator from './IDrizzleOperator';
import IProgramDB, {
    FindRuleOption,
    FindScheduleIdOption,
    FindScheduleOption,
    ProgramUpdateValues,
    ProgramWithOverlap,
} from './IProgramDB';

@injectable()
export default class ProgramDB implements IProgramDB {
    private config: IConfigFile;
    private drizzleOp: IDrizzleOperator;
    private promieRetry: IPromiseRetry;

    constructor(
        @inject('IConfiguration') conf: IConfiguration,
        @inject('IDrizzleOperator') drizzleOp: IDrizzleOperator,
        @inject('IPromiseRetry') promieRetry: IPromiseRetry,
    ) {
        this.config = conf.getConfig();
        this.drizzleOp = drizzleOp;
        this.promieRetry = promieRetry;
    }

    /**
     * 全件削除 & 挿入（Bulk Upsert 最適化）
     */
    public async insert(
        channelTypes: IChannelTypeIndex,
        programs: mapid.Program[],
        deleteChannelIds: mapid.ServiceId[] = [],
    ): Promise<void> {
        const updateTime = new Date().getTime();
        const rows: any[] = [];

        for (const program of programs) {
            const value = this.createProgramValue(channelTypes, program, updateTime);
            if (value !== null) {
                rows.push(value);
            }
        }

        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                if (deleteChannelIds.length > 0) {
                    await tx.delete(schema.programs).where(inArray(schema.programs.channelId, deleteChannelIds));
                }

                const chunkSize = 100;
                for (let i = 0; i < rows.length; i += chunkSize) {
                    const chunk = rows.slice(i, i + chunkSize);
                    if (chunk.length === 0) continue;

                    if (client.type === 'sqlite') {
                        await tx
                            .insert(schema.programs)
                            .values(chunk)
                            .onConflictDoUpdate({
                                target: schema.programs.id,
                                set: {
                                    updateTime: sql`excluded.updateTime`,
                                    channelId: sql`excluded.channelId`,
                                    eventId: sql`excluded.eventId`,
                                    serviceId: sql`excluded.serviceId`,
                                    networkId: sql`excluded.networkId`,
                                    startAt: sql`excluded.startAt`,
                                    endAt: sql`excluded.endAt`,
                                    startHour: sql`excluded.startHour`,
                                    week: sql`excluded.week`,
                                    duration: sql`excluded.duration`,
                                    isFree: sql`excluded.isFree`,
                                    name: sql`excluded.name`,
                                    halfWidthName: sql`excluded.halfWidthName`,
                                    shortName: sql`excluded.shortName`,
                                    description: sql`excluded.description`,
                                    halfWidthDescription: sql`excluded.halfWidthDescription`,
                                    extended: sql`excluded.extended`,
                                    halfWidthExtended: sql`excluded.halfWidthExtended`,
                                    rawExtended: sql`excluded.rawExtended`,
                                    rawHalfWidthExtended: sql`excluded.rawHalfWidthExtended`,
                                    genre1: sql`excluded.genre1`,
                                    subGenre1: sql`excluded.subGenre1`,
                                    genre2: sql`excluded.genre2`,
                                    subGenre2: sql`excluded.subGenre2`,
                                    genre3: sql`excluded.genre3`,
                                    subGenre3: sql`excluded.subGenre3`,
                                    channelType: sql`excluded.channelType`,
                                    channel: sql`excluded.channel`,
                                    videoType: sql`excluded.videoType`,
                                    videoResolution: sql`excluded.videoResolution`,
                                    videoStreamContent: sql`excluded.videoStreamContent`,
                                    videoComponentType: sql`excluded.videoComponentType`,
                                    audioSamplingRate: sql`excluded.audioSamplingRate`,
                                    audioComponentType: sql`excluded.audioComponentType`,
                                },
                            });
                    } else {
                        await tx
                            .insert(schema.programs)
                            .values(chunk)
                            .onDuplicateKeyUpdate({
                                set: {
                                    updateTime: sql`VALUES(\`updateTime\`)`,
                                    channelId: sql`VALUES(\`channelId\`)`,
                                    eventId: sql`VALUES(\`eventId\`)`,
                                    serviceId: sql`VALUES(\`serviceId\`)`,
                                    networkId: sql`VALUES(\`networkId\`)`,
                                    startAt: sql`VALUES(\`startAt\`)`,
                                    endAt: sql`VALUES(\`endAt\`)`,
                                    startHour: sql`VALUES(\`startHour\`)`,
                                    week: sql`VALUES(\`week\`)`,
                                    duration: sql`VALUES(\`duration\`)`,
                                    isFree: sql`VALUES(\`isFree\`)`,
                                    name: sql`VALUES(\`name\`)`,
                                    halfWidthName: sql`VALUES(\`halfWidthName\`)`,
                                    shortName: sql`VALUES(\`shortName\`)`,
                                    description: sql`VALUES(\`description\`)`,
                                    halfWidthDescription: sql`VALUES(\`halfWidthDescription\`)`,
                                    extended: sql`VALUES(\`extended\`)`,
                                    halfWidthExtended: sql`VALUES(\`halfWidthExtended\`)`,
                                    rawExtended: sql`VALUES(\`rawExtended\`)`,
                                    rawHalfWidthExtended: sql`VALUES(\`rawHalfWidthExtended\`)`,
                                    genre1: sql`VALUES(\`genre1\`)`,
                                    subGenre1: sql`VALUES(\`subGenre1\`)`,
                                    genre2: sql`VALUES(\`genre2\`)`,
                                    subGenre2: sql`VALUES(\`subGenre2\`)`,
                                    genre3: sql`VALUES(\`genre3\`)`,
                                    subGenre3: sql`VALUES(\`subGenre3\`)`,
                                    channelType: sql`VALUES(\`channelType\`)`,
                                    channel: sql`VALUES(\`channel\`)`,
                                    videoType: sql`VALUES(\`videoType\`)`,
                                    videoResolution: sql`VALUES(\`videoResolution\`)`,
                                    videoStreamContent: sql`VALUES(\`videoStreamContent\`)`,
                                    videoComponentType: sql`VALUES(\`videoComponentType\`)`,
                                    audioSamplingRate: sql`VALUES(\`audioSamplingRate\`)`,
                                    audioComponentType: sql`VALUES(\`audioComponentType\`)`,
                                },
                            });
                    }
                }
            });
        });
    }

    /**
     * 部分更新（Bulk Upsert 最適化）
     */
    public async update(channelTypes: IChannelTypeIndex, values: ProgramUpdateValues): Promise<void> {
        const updateTime = new Date().getTime();
        const client = this.drizzleOp.getDB();

        const insertValues: any[] = [];
        for (const program of values.insert) {
            const value = this.createProgramValue(channelTypes, program, updateTime);
            if (value !== null) insertValues.push(value);
        }
        for (const program of values.update) {
            const value = this.createProgramValue(channelTypes, program, updateTime);
            if (value !== null) insertValues.push(value);
        }

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                if (values.delete.length > 0) {
                    await tx.delete(schema.programs).where(inArray(schema.programs.id, values.delete));
                }

                const chunkSize = 100;
                for (let i = 0; i < insertValues.length; i += chunkSize) {
                    const chunk = insertValues.slice(i, i + chunkSize);
                    if (chunk.length === 0) continue;

                    if (client.type === 'sqlite') {
                        await tx
                            .insert(schema.programs)
                            .values(chunk)
                            .onConflictDoUpdate({
                                target: schema.programs.id,
                                set: {
                                    updateTime: sql`excluded.updateTime`,
                                    channelId: sql`excluded.channelId`,
                                    eventId: sql`excluded.eventId`,
                                    serviceId: sql`excluded.serviceId`,
                                    networkId: sql`excluded.networkId`,
                                    startAt: sql`excluded.startAt`,
                                    endAt: sql`excluded.endAt`,
                                    startHour: sql`excluded.startHour`,
                                    week: sql`excluded.week`,
                                    duration: sql`excluded.duration`,
                                    isFree: sql`excluded.isFree`,
                                    name: sql`excluded.name`,
                                    halfWidthName: sql`excluded.halfWidthName`,
                                    shortName: sql`excluded.shortName`,
                                    description: sql`excluded.description`,
                                    halfWidthDescription: sql`excluded.halfWidthDescription`,
                                    extended: sql`excluded.extended`,
                                    halfWidthExtended: sql`excluded.halfWidthExtended`,
                                    rawExtended: sql`excluded.rawExtended`,
                                    rawHalfWidthExtended: sql`excluded.rawHalfWidthExtended`,
                                    genre1: sql`excluded.genre1`,
                                    subGenre1: sql`excluded.subGenre1`,
                                    genre2: sql`excluded.genre2`,
                                    subGenre2: sql`excluded.subGenre2`,
                                    genre3: sql`excluded.genre3`,
                                    subGenre3: sql`excluded.subGenre3`,
                                    channelType: sql`excluded.channelType`,
                                    channel: sql`excluded.channel`,
                                    videoType: sql`excluded.videoType`,
                                    videoResolution: sql`excluded.videoResolution`,
                                    videoStreamContent: sql`excluded.videoStreamContent`,
                                    videoComponentType: sql`excluded.videoComponentType`,
                                    audioSamplingRate: sql`excluded.audioSamplingRate`,
                                    audioComponentType: sql`excluded.audioComponentType`,
                                },
                            });
                    } else {
                        await tx
                            .insert(schema.programs)
                            .values(chunk)
                            .onDuplicateKeyUpdate({
                                set: {
                                    updateTime: sql`VALUES(\`updateTime\`)`,
                                    channelId: sql`VALUES(\`channelId\`)`,
                                    eventId: sql`VALUES(\`eventId\`)`,
                                    serviceId: sql`VALUES(\`serviceId\`)`,
                                    networkId: sql`VALUES(\`networkId\`)`,
                                    startAt: sql`VALUES(\`startAt\`)`,
                                    endAt: sql`VALUES(\`endAt\`)`,
                                    startHour: sql`VALUES(\`startHour\`)`,
                                    week: sql`VALUES(\`week\`)`,
                                    duration: sql`VALUES(\`duration\`)`,
                                    isFree: sql`VALUES(\`isFree\`)`,
                                    name: sql`VALUES(\`name\`)`,
                                    halfWidthName: sql`VALUES(\`halfWidthName\`)`,
                                    shortName: sql`VALUES(\`shortName\`)`,
                                    description: sql`VALUES(\`description\`)`,
                                    halfWidthDescription: sql`VALUES(\`halfWidthDescription\`)`,
                                    extended: sql`VALUES(\`extended\`)`,
                                    halfWidthExtended: sql`VALUES(\`halfWidthExtended\`)`,
                                    rawExtended: sql`VALUES(\`rawExtended\`)`,
                                    rawHalfWidthExtended: sql`VALUES(\`rawHalfWidthExtended\`)`,
                                    genre1: sql`VALUES(\`genre1\`)`,
                                    subGenre1: sql`VALUES(\`subGenre1\`)`,
                                    genre2: sql`VALUES(\`genre2\`)`,
                                    subGenre2: sql`VALUES(\`subGenre2\`)`,
                                    genre3: sql`VALUES(\`genre3\`)`,
                                    subGenre3: sql`VALUES(\`subGenre3\`)`,
                                    channelType: sql`VALUES(\`channelType\`)`,
                                    channel: sql`VALUES(\`channel\`)`,
                                    videoType: sql`VALUES(\`videoType\`)`,
                                    videoResolution: sql`VALUES(\`videoResolution\`)`,
                                    videoStreamContent: sql`VALUES(\`videoStreamContent\`)`,
                                    videoComponentType: sql`VALUES(\`videoComponentType\`)`,
                                    audioSamplingRate: sql`VALUES(\`audioSamplingRate\`)`,
                                    audioComponentType: sql`VALUES(\`audioComponentType\`)`,
                                },
                            });
                    }
                }
            });
        });
    }

    /**
     * 古い番組の削除
     */
    public async deleteOld(time: apid.UnixtimeMS): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.programs).where(lt(schema.programs.endAt, time));
        });
    }

    /**
     * programId を指定して番組を取得する
     */
    public async findId(programId: apid.ProgramId): Promise<Program | null> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.programs).where(eq(schema.programs.id, programId));

            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * イベントリレー用番組検索
     */
    public async findEventRelayProgram(
        networkId: apid.NetworkId,
        serviceId: apid.ServiceId,
        eventId: apid.EventId,
    ): Promise<Program | null> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.programs)
                .where(
                    and(
                        eq(schema.programs.networkId, networkId),
                        eq(schema.programs.serviceId, serviceId),
                        eq(schema.programs.eventId, eventId),
                    ),
                );

            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * ルールマッチング用検索
     */
    public async findRule(option: FindRuleOption): Promise<ProgramWithOverlap[]> {
        const searchOption = option.searchOption;
        const now = new Date().getTime();
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const conditions: any[] = [gte(client.schema.programs.endAt, now)];

            // キーワード検索
            if (typeof searchOption.keyword !== 'undefined') {
                const keywords = StrUtil.toHalf(searchOption.keyword).split(/ /);
                for (const kw of keywords) {
                    if (kw.length > 0) {
                        const kwPattern = `%${kw}%`;
                        const kwOr: any[] = [];
                        if (searchOption.name) {
                            kwOr.push(sql`COALESCE(${client.schema.programs.halfWidthName}, '') LIKE ${kwPattern}`);
                        }
                        if (searchOption.description) {
                            kwOr.push(
                                sql`COALESCE(${client.schema.programs.halfWidthDescription}, '') LIKE ${kwPattern}`,
                            );
                        }
                        if (searchOption.extended) {
                            kwOr.push(sql`COALESCE(${client.schema.programs.halfWidthExtended}, '') LIKE ${kwPattern}`);
                        }
                        if (kwOr.length === 0) {
                            kwOr.push(
                                sql`COALESCE(${client.schema.programs.halfWidthName}, '') LIKE ${kwPattern}`,
                                sql`COALESCE(${client.schema.programs.halfWidthDescription}, '') LIKE ${kwPattern}`,
                                sql`COALESCE(${client.schema.programs.halfWidthExtended}, '') LIKE ${kwPattern}`,
                            );
                        }
                        conditions.push(or(...kwOr));
                    }
                }
            }

            // 除外キーワード検索
            if (typeof searchOption.ignoreKeyword !== 'undefined') {
                const ignoreKeywords = StrUtil.toHalf(searchOption.ignoreKeyword).split(/ /);
                for (const kw of ignoreKeywords) {
                    if (kw.length > 0) {
                        const kwPattern = `%${kw}%`;
                        const ignoreOr: any[] = [];
                        if (searchOption.ignoreName) {
                            ignoreOr.push(sql`COALESCE(${client.schema.programs.halfWidthName}, '') LIKE ${kwPattern}`);
                        }
                        if (searchOption.ignoreDescription) {
                            ignoreOr.push(
                                sql`COALESCE(${client.schema.programs.halfWidthDescription}, '') LIKE ${kwPattern}`,
                            );
                        }
                        if (searchOption.ignoreExtended) {
                            ignoreOr.push(
                                sql`COALESCE(${client.schema.programs.halfWidthExtended}, '') LIKE ${kwPattern}`,
                            );
                        }
                        if (ignoreOr.length === 0) {
                            ignoreOr.push(
                                sql`COALESCE(${client.schema.programs.halfWidthName}, '') LIKE ${kwPattern}`,
                                sql`COALESCE(${client.schema.programs.halfWidthDescription}, '') LIKE ${kwPattern}`,
                                sql`COALESCE(${client.schema.programs.halfWidthExtended}, '') LIKE ${kwPattern}`,
                            );
                        }
                        // NOT LIKE (COALESCE しているので NULL にならず確実に判定)
                        conditions.push(sql`NOT (${or(...ignoreOr)})`);
                    }
                }
            }

            // チャンネル指定
            if (typeof searchOption.channelIds !== 'undefined' && searchOption.channelIds.length > 0) {
                conditions.push(inArray(client.schema.programs.channelId, searchOption.channelIds));
            } else {
                const channelTypes: string[] = [];
                if (searchOption.GR) channelTypes.push('GR');
                if (searchOption.BS) channelTypes.push('BS');
                if (searchOption.CS) channelTypes.push('CS');
                if (searchOption.SKY) channelTypes.push('SKY');
                if (channelTypes.length > 0) {
                    conditions.push(inArray(client.schema.programs.channelType, channelTypes));
                }
            }

            // ジャンル指定
            if (typeof searchOption.genres !== 'undefined' && searchOption.genres.length > 0) {
                const genreConditions: any[] = [];
                for (const g of searchOption.genres) {
                    const gOr: any[] = [];
                    if (typeof g.subGenre === 'undefined') {
                        gOr.push(eq(client.schema.programs.genre1, g.genre));
                        gOr.push(eq(client.schema.programs.genre2, g.genre));
                        gOr.push(eq(client.schema.programs.genre3, g.genre));
                    } else {
                        gOr.push(
                            and(
                                eq(client.schema.programs.genre1, g.genre),
                                eq(client.schema.programs.subGenre1, g.subGenre),
                            ),
                        );
                        gOr.push(
                            and(
                                eq(client.schema.programs.genre2, g.genre),
                                eq(client.schema.programs.subGenre2, g.subGenre),
                            ),
                        );
                        gOr.push(
                            and(
                                eq(client.schema.programs.genre3, g.genre),
                                eq(client.schema.programs.subGenre3, g.subGenre),
                            ),
                        );
                    }
                    genreConditions.push(or(...gOr));
                }
                conditions.push(or(...genreConditions));
            }

            // 時間帯指定
            if (typeof searchOption.times !== 'undefined' && searchOption.times.length > 0) {
                const timeConditions: any[] = [];
                for (const t of searchOption.times) {
                    const tAnd: any[] = [];

                    // 曜日ビットマスク判定 (0x01=日, 0x02=月, 0x04=火, 0x08=水, 0x10=木, 0x20=金, 0x40=土)
                    const weeks: number[] = [];
                    if ((t.week & 0x01) !== 0) weeks.push(0); // 日
                    if ((t.week & 0x02) !== 0) weeks.push(1); // 月
                    if ((t.week & 0x04) !== 0) weeks.push(2); // 火
                    if ((t.week & 0x08) !== 0) weeks.push(3); // 水
                    if ((t.week & 0x10) !== 0) weeks.push(4); // 木
                    if ((t.week & 0x20) !== 0) weeks.push(5); // 金
                    if ((t.week & 0x40) !== 0) weeks.push(6); // 土

                    if (weeks.length > 0) {
                        tAnd.push(inArray(client.schema.programs.week, weeks));
                    }

                    if (typeof t.start === 'number' && typeof t.range === 'number') {
                        const startHours: number[] = [];
                        for (let h = t.start; h < t.start + t.range; h++) {
                            startHours.push(h % 24);
                        }
                        if (startHours.length > 0) {
                            tAnd.push(inArray(client.schema.programs.startHour, startHours));
                        }
                    }
                    if (tAnd.length > 0) {
                        timeConditions.push(and(...tAnd));
                    }
                }
                if (timeConditions.length > 0) {
                    conditions.push(or(...timeConditions));
                }
            }

            // 検索期間指定
            if (typeof searchOption.searchPeriods !== 'undefined' && searchOption.searchPeriods.length > 0) {
                const periodConditions: any[] = [];
                for (const p of searchOption.searchPeriods) {
                    periodConditions.push(
                        and(
                            gte(client.schema.programs.startAt, p.startAt),
                            lte(client.schema.programs.startAt, p.endAt),
                        ),
                    );
                }
                conditions.push(or(...periodConditions));
            }

            if (searchOption.isFree) {
                conditions.push(eq(client.schema.programs.isFree, true));
            }

            if (typeof searchOption.durationMin !== 'undefined') {
                conditions.push(gte(client.schema.programs.duration, searchOption.durationMin * 1000));
            }
            if (typeof searchOption.durationMax !== 'undefined') {
                conditions.push(lte(client.schema.programs.duration, searchOption.durationMax * 1000));
            }

            const whereClause = and(...conditions);
            const { db, schema } = client;

            let query = (db as any)
                .select()
                .from(schema.programs)
                .where(whereClause)
                .orderBy(asc(schema.programs.startAt));
            if (typeof option.limit !== 'undefined') query = query.limit(option.limit) as any;
            const rows: any[] = await query;

            // avoidDuplicate (重複判定)
            const avoidDuplicate = option.reserveOption?.avoidDuplicate === true;
            const periodToAvoidDuplicate = option.reserveOption?.periodToAvoidDuplicate;
            const overlapSet = new Set<number>();

            if (avoidDuplicate && rows.length > 0) {
                const period =
                    typeof periodToAvoidDuplicate !== 'undefined' && periodToAvoidDuplicate > 0
                        ? periodToAvoidDuplicate * 24 * 60 * 60 * 1000
                        : 0;

                const shortNames = rows.map(r => r.shortName).filter(Boolean);
                const channelIds = rows.map(r => r.channelId);

                const histConditions: any[] = [
                    inArray(schema.recordedHistory.name, shortNames),
                    inArray(schema.recordedHistory.channelId, channelIds),
                ];
                if (period > 0) {
                    histConditions.push(
                        gte(schema.recordedHistory.endAt, now - period),
                        lte(schema.recordedHistory.endAt, now),
                    );
                } else {
                    histConditions.push(lte(schema.recordedHistory.endAt, now));
                }

                const histRows = await (db as any)
                    .select({ name: schema.recordedHistory.name, channelId: schema.recordedHistory.channelId })
                    .from(schema.recordedHistory)
                    .where(and(...histConditions));

                const histKeySet = new Set(histRows.map((h: any) => `${h.name}_${h.channelId}`));
                for (const r of rows) {
                    if (histKeySet.has(`${r.shortName}_${r.channelId}`)) {
                        overlapSet.add(r.id);
                    }
                }
            }

            return rows.map(r => {
                const entity = this.toEntity(r) as ProgramWithOverlap;
                entity.overlap = overlapSet.has(r.id);
                return entity;
            });
        });
    }

    /**
     * channelId, startAt で番組を特定
     */
    public async findChannelIdAndTime(channelId: apid.ChannelId, startAt: apid.UnixtimeMS): Promise<Program | null> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.programs)
                .where(and(eq(schema.programs.channelId, channelId), eq(schema.programs.startAt, startAt)));

            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<Program[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.programs).orderBy(asc(schema.programs.startAt));

            return rows.map((r: any) => this.toEntity(r));
        });
    }

    /**
     * 番組表データ取得
     */
    public async findSchedule(option: FindScheduleOption | FindScheduleIdOption): Promise<Program[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const conditions: any[] = [
                lte(schema.programs.startAt, option.endAt),
                gte(schema.programs.endAt, option.startAt),
            ];

            if ('channelId' in option && typeof option.channelId !== 'undefined') {
                conditions.push(eq(schema.programs.channelId, option.channelId));
            } else if ('types' in option && option.types.length > 0) {
                conditions.push(inArray(schema.programs.channelType, option.types));
            }

            if (option.isFree) {
                conditions.push(eq(schema.programs.isFree, true));
            }

            const rows = await (db as any)
                .select()
                .from(schema.programs)
                .where(and(...conditions))
                .orderBy(asc(schema.programs.startAt));

            return rows.map((r: any) => this.toEntity(r, option.isHalfWidth));
        });
    }

    /**
     * 放映中の番組取得
     */
    public async findBroadcasting(option: apid.BroadcastingScheduleOption): Promise<Program[]> {
        let time = new Date().getTime();
        if (typeof option.time !== 'undefined') {
            time += option.time;
        }
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            const { db, schema } = client;
            const whereClause = and(lte(schema.programs.startAt, time), gte(schema.programs.endAt, time));

            const rows = await (db as any)
                .select()
                .from(schema.programs)
                .where(whereClause)
                .orderBy(asc(schema.programs.startAt));

            return rows.map((r: any) => this.toEntity(r, option.isHalfWidth));
        });
    }

    private createProgramValue(
        channelTypes: IChannelTypeIndex,
        program: mapid.Program,
        updateTime: number,
    ): any | null {
        if (typeof program.name === 'undefined') {
            return null;
        }

        if (
            typeof channelTypes[program.networkId] === 'undefined' ||
            typeof channelTypes[program.networkId][program.serviceId] === 'undefined'
        ) {
            return null;
        }

        const channelInfo = channelTypes[program.networkId][program.serviceId];
        const channelId = channelInfo.id;
        const channelType = channelInfo.type;
        const channel = channelInfo.channel;

        let genre1: number | null = null;
        let subGenre1: number | null = null;
        let genre2: number | null = null;
        let subGenre2: number | null = null;
        let genre3: number | null = null;
        let subGenre3: number | null = null;
        if (typeof program.genres !== 'undefined') {
            if (program.genres[0] && program.genres[0].lv1 < 0xe) {
                genre1 = program.genres[0].lv1;
                subGenre1 = typeof program.genres[0].lv2 === 'undefined' ? null : program.genres[0].lv2;
            }
            if (program.genres.length > 1 && program.genres[1] && program.genres[1].lv1 < 0xe) {
                genre2 = program.genres[1].lv1;
                subGenre2 = typeof program.genres[1].lv2 === 'undefined' ? null : program.genres[1].lv2;
            }
            if (program.genres.length > 2 && program.genres[2] && program.genres[2].lv1 < 0xe) {
                genre3 = program.genres[2].lv1;
                subGenre3 = typeof program.genres[2].lv2 === 'undefined' ? null : program.genres[2].lv2;
            }
        }

        const jaDate = DateUtil.getJaDate(new Date(program.startAt));

        const name =
            this.config.epg.replaceEnclosingCharacters === true
                ? StrUtil.toDBStr(StrUtil.replaceEnclosedCharacters(program.name))
                : StrUtil.toDBStr(program.name);
        const halfWidthName = StrUtil.toHalf(name);

        const value: any = {
            id: program.id,
            updateTime: updateTime,
            channelId: channelId,
            eventId: program.eventId,
            serviceId: program.serviceId,
            networkId: program.networkId,
            startAt: program.startAt,
            endAt: program.startAt + program.duration,
            startHour: jaDate.getHours(),
            week: jaDate.getDay(),
            duration: program.duration,
            isFree: program.isFree,
            name: name,
            halfWidthName: halfWidthName,
            shortName: StrUtil.deleteBrackets(halfWidthName),
            genre1: genre1,
            subGenre1: subGenre1,
            genre2: genre2,
            subGenre2: subGenre2,
            genre3: genre3,
            subGenre3: subGenre3,
            channelType: channelType,
            channel: channel,
            videoType: null,
            videoResolution: null,
            videoStreamContent: null,
            videoComponentType: null,
            audioSamplingRate: null,
            audioComponentType: null,
        };

        if (typeof program.description === 'undefined' || program.description.length === 0) {
            value.description = null;
            value.halfWidthDescription = null;
        } else {
            const description =
                this.config.epg.replaceEnclosingCharacters === true
                    ? StrUtil.toDBStr(StrUtil.replaceEnclosedCharacters(program.description))
                    : StrUtil.toDBStr(program.description);
            value.description = description;
            value.halfWidthDescription = StrUtil.toHalf(description);
        }

        if (typeof program.extended === 'undefined') {
            value.extended = null;
            value.halfWidthExtended = null;
            value.rawExtended = null;
            value.rawHalfWidthExtended = null;
        } else {
            const extended = this.createExtendedStr(program.extended);
            value.extended = extended;
            value.halfWidthExtended = StrUtil.toHalf(extended);

            value.rawExtended = JSON.stringify(program.extended);
            const halfRawExtended: { [key: string]: string } = {};
            for (const key in program.extended) {
                halfRawExtended[StrUtil.toHalf(key)] = StrUtil.toHalf(program.extended[key]);
            }
            value.rawHalfWidthExtended = JSON.stringify(halfRawExtended);
        }

        if (typeof program.video !== 'undefined') {
            value.videoType = program.video.type;
            value.videoResolution = program.video.resolution;
            value.videoStreamContent = program.video.streamContent;
            value.videoComponentType = program.video.componentType;
        }

        if (typeof (program as any).audio !== 'undefined') {
            value.audioSamplingRate = (program as any).audio.samplingRate;
            value.audioComponentType = (program as any).audio.componentType;
        }

        if (typeof (program as any).audios !== 'undefined') {
            for (const audio of (program as any).audios) {
                if (audio.isMain === false) continue;
                value.audioSamplingRate = audio.samplingRate;
                value.audioComponentType = audio.componentType;
            }
        }

        return value;
    }

    private createExtendedStr(extended: { [key: string]: string }): string {
        let str = '';
        for (const key in extended) {
            str += `${key}\n${extended[key]}\n\n`;
        }
        return str;
    }

    private toEntity(row: any, isHalfWidth: boolean = false): Program {
        const entity = new Program();
        Object.assign(entity, row);
        entity.isFree = !!row.isFree;
        if (isHalfWidth) {
            entity.name = row.halfWidthName || row.name;
            entity.description = row.halfWidthDescription || row.description;
            entity.extended = row.halfWidthExtended || row.extended;
        }
        return entity;
    }
}
