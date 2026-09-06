import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Channel from '../../src/db/entities/Channel';
import Recorded from '../../src/db/entities/Recorded';
import Reserve from '../../src/db/entities/Reserve';
import ChannelDB from '../../src/model/db/ChannelDB';
import DrizzleOperator from '../../src/model/db/DrizzleOperator';
import ProgramDB from '../../src/model/db/ProgramDB';
import RecordedDB from '../../src/model/db/RecordedDB';
import ReserveDB from '../../src/model/db/ReserveDB';
import RuleDB from '../../src/model/db/RuleDB';
import IConfigFile from '../../src/model/IConfigFile';
import IConfiguration from '../../src/model/IConfiguration';
import IPromiseRetry from '../../src/model/IPromiseRetry';

const isMySQLTest = process.env.TEST_MYSQL === 'true';

describe.skipIf(!isMySQLTest)('MySQL / MariaDB Integration Tests', () => {
    let operator: DrizzleOperator;
    let channelDB: ChannelDB;
    let recordedDB: RecordedDB;
    let reserveDB: ReserveDB;
    let ruleDB: RuleDB;
    let programDB: ProgramDB;

    const host = process.env.MYSQL_HOST || '127.0.0.1';
    const port = Number(process.env.MYSQL_PORT || 13306);
    const user = process.env.MYSQL_USER || 'epgdeck';
    const password = process.env.MYSQL_PASSWORD || 'epgdeck';
    const database = process.env.MYSQL_DATABASE || 'epgdeck';

    const mockConfig: IConfigFile = {
        server: {
            mirakurun: 'http://localhost:40772',
            isAllowAllCORS: true,
        },
        database: {
            type: 'mysql',
            mysql: {
                host,
                port,
                user,
                password,
                database,
            },
        },
        epg: {
            intervalMinutes: 10,
            replaceEnclosingCharacters: false,
        },
        recording: {} as any,
        encode: {} as any,
    };

    const mockConfiguration: IConfiguration = {
        getConfig: () => mockConfig,
    } as any;

    const dummyRetry: IPromiseRetry = {
        run: async <T>(fn: () => Promise<T>) => await fn(),
    } as any;

    beforeAll(async () => {
        operator = new DrizzleOperator(mockConfiguration);
        // DDL とインデックスの初期化
        await operator.checkConnection();

        channelDB = new ChannelDB(mockConfiguration, operator, dummyRetry);
        recordedDB = new RecordedDB(operator, dummyRetry);
        reserveDB = new ReserveDB(operator, dummyRetry);
        ruleDB = new RuleDB(operator, dummyRetry);
        programDB = new ProgramDB(mockConfiguration, operator, dummyRetry);

        // テスト前クリーンアップ
        const dbInstance = operator.getDB();
        if (dbInstance.type === 'mysql') {
            await dbInstance.pool.query('DELETE FROM recorded_tags_recorded_tag;');
            await dbInstance.pool.query('DELETE FROM recorded_tag;');
            await dbInstance.pool.query('DELETE FROM drop_log_file;');
            await dbInstance.pool.query('DELETE FROM video_file;');
            await dbInstance.pool.query('DELETE FROM thumbnail;');
            await dbInstance.pool.query('DELETE FROM rule;');
            await dbInstance.pool.query('DELETE FROM reserve;');
            await dbInstance.pool.query('DELETE FROM recorded;');
            await dbInstance.pool.query('DELETE FROM channel;');
            await dbInstance.pool.query('DELETE FROM program;');
        }
    });

    afterAll(async () => {
        if (operator) {
            const dbInstance = operator.getDB();
            if (dbInstance.type === 'mysql') {
                await dbInstance.pool.query('DELETE FROM recorded_tags_recorded_tag;');
                await dbInstance.pool.query('DELETE FROM recorded_tag;');
                await dbInstance.pool.query('DELETE FROM drop_log_file;');
                await dbInstance.pool.query('DELETE FROM video_file;');
                await dbInstance.pool.query('DELETE FROM thumbnail;');
                await dbInstance.pool.query('DELETE FROM rule;');
                await dbInstance.pool.query('DELETE FROM reserve;');
                await dbInstance.pool.query('DELETE FROM recorded;');
                await dbInstance.pool.query('DELETE FROM channel;');
                await dbInstance.pool.query('DELETE FROM program;');
            }
            await operator.closeConnection();
        }
    });

    it('creates all tables and indexes successfully via checkConnection', async () => {
        const dbInstance = operator.getDB();
        expect(dbInstance.type).toBe('mysql');

        if (dbInstance.type === 'mysql') {
            // テーブル存在確認
            const [tables]: any = await dbInstance.pool.query(
                'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
                [database],
            );
            const tableNames = tables.map((t: any) => t.TABLE_NAME.toLowerCase());
            expect(tableNames).toContain('channel');
            expect(tableNames).toContain('recorded');
            expect(tableNames).toContain('reserve');
            expect(tableNames).toContain('rule');
            expect(tableNames).toContain('program');
            expect(tableNames).toContain('video_file');
            expect(tableNames).toContain('thumbnail');

            // 複合インデックス存在確認
            const [indexes]: any = await dbInstance.pool.query(
                'SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ?',
                [database],
            );
            const indexNames = indexes.map((i: any) => i.INDEX_NAME);
            expect(indexNames).toContain('idx_recorded_channel_start');
            expect(indexNames).toContain('idx_recorded_start_end');
            expect(indexNames).toContain('idx_reserve_start_end');
            expect(indexNames).toContain('idx_reserve_rule');
            expect(indexNames).toContain('idx_program_channel_time');
        }
    });

    it('performs CRUD operations on ChannelDB in MySQL', async () => {
        const service = {
            id: 2001,
            serviceId: 1024,
            networkId: 32736,
            name: 'NHK総合・東京',
            channel: {
                type: 'GR' as const,
                channel: '27',
            },
            hasLogoData: true,
        };

        await channelDB.insert([service as any]);

        const channels = await channelDB.findAll();
        expect(channels.length).toBeGreaterThanOrEqual(1);
        const target = channels.find(c => c.id === 2001);
        expect(target).toBeDefined();
        expect(target?.name).toBe('NHK総合・東京');

        const found = await channelDB.findId(2001);
        expect(found).not.toBeNull();
        expect(found?.name).toBe('NHK総合・東京');
    });

    it('performs CRUD, protect toggle and ID generation on RecordedDB in MySQL', async () => {
        const columnOption = {
            isNeedVideoFiles: false,
            isNeedThumbnails: false,
            isNeedsDropLog: false,
            isNeedTags: false,
        };

        const rec = new Recorded();
        rec.channelId = 2001;
        rec.startAt = new Date(2026, 8, 6, 12, 0).getTime();
        rec.endAt = new Date(2026, 8, 6, 13, 0).getTime();
        rec.duration = 3600;
        rec.name = '日曜特番アーカイブ';
        rec.halfWidthName = '日曜特番アーカイブ';
        rec.genre1 = 1;
        rec.isRecording = false;
        rec.isProtected = false;

        // insertOnce と Auto-Increment ID の正常取得検証 (DrizzleHelper.getInsertId)
        const id = await recordedDB.insertOnce(rec);
        expect(id).toBeTypeOf('number');
        expect(id).toBeGreaterThan(0);

        // findId による検索
        const item = await recordedDB.findId(id, true);
        expect(item).not.toBeNull();
        expect(item?.name).toBe('日曜特番アーカイブ');
        expect(item?.isProtected).toBe(false);

        // 保護状態のトグル
        await recordedDB.changeProtect(id, true);
        const protectedItem = await recordedDB.findId(id, true);
        expect(protectedItem?.isProtected).toBe(true);

        // キーワード検索
        const [foundRecords, total] = await recordedDB.findAll(
            { isHalfWidth: true, keyword: '日曜特番' },
            columnOption,
        );
        expect(total).toBeGreaterThanOrEqual(1);
        expect(foundRecords.some(r => r.id === id)).toBe(true);

        // 削除
        await recordedDB.deleteOnce(id);
        const afterDelete = await recordedDB.findId(id, true);
        expect(afterDelete).toBeNull();
    });

    it('manages RuleDB and ReserveDB with rule count aggregations in MySQL', async () => {
        const ruleOption: any = {
            isTimeSpecification: false,
            searchOption: {
                keyword: '定時ニュース',
                GR: true,
                BS: false,
                CS: false,
                SKY: false,
            },
            reserveOption: {
                enable: true,
                avoidDuplicate: false,
                allowEndLack: true,
            },
            saveOption: {},
            encodeOption: {},
        };

        const ruleId = await ruleDB.insertOnce(ruleOption);
        expect(ruleId).toBeTypeOf('number');
        expect(ruleId).toBeGreaterThan(0);

        const now = Date.now();
        const res = new Reserve();
        res.updateTime = now;
        res.ruleId = ruleId;
        res.channelId = 2001;
        res.channelType = 'GR';
        res.channel = '27';
        res.startAt = now + 60000;
        res.endAt = now + 120000;
        res.name = '定時ニュース';
        res.isSkip = false;
        res.isConflict = false;

        const resId = await reserveDB.insertOnce(res);
        expect(resId).toBeTypeOf('number');
        expect(resId).toBeGreaterThan(0);

        // ルール別予約数の集計検証
        const counts = await reserveDB.countRuleIds([ruleId], 'all');
        expect(counts).toHaveLength(1);
        expect(counts[0].ruleId).toBe(ruleId);
        expect(counts[0].ruleIdCnt).toBe(1);

        // ルール無効化と有効化
        await ruleDB.disableOnce(ruleId);
        const disabled = await ruleDB.findId(ruleId, true);
        expect(disabled?.reserveOption.enable).toBe(false);

        await ruleDB.enableOnce(ruleId);
        const enabled = await ruleDB.findId(ruleId, true);
        expect(enabled?.reserveOption.enable).toBe(true);
    });
});

