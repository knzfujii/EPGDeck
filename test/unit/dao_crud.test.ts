import 'reflect-metadata';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { beforeEach, describe, expect, it } from 'vitest';
import * as sqliteSchema from '../../src/db/schema/sqlite';
import Recorded from '../../src/db/entities/Recorded';
import Reserve from '../../src/db/entities/Reserve';
import Channel from '../../src/db/entities/Channel';
import RecordedDB from '../../src/model/db/RecordedDB';
import ReserveDB from '../../src/model/db/ReserveDB';
import RuleDB from '../../src/model/db/RuleDB';
import ChannelDB from '../../src/model/db/ChannelDB';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator';
import IPromiseRetry from '../../src/model/IPromiseRetry';

describe('Drizzle ORM DAO CRUD & Query Operations Tests', () => {
    let client: ReturnType<typeof createClient>;
    let db: ReturnType<typeof drizzle>;
    let recordedDB: RecordedDB;
    let reserveDB: ReserveDB;
    let ruleDB: RuleDB;
    let channelDB: ChannelDB;

    const dummyRetry: IPromiseRetry = {
        run: async <T>(fn: () => Promise<T>) => await fn(),
    } as any;

    beforeEach(async () => {
        client = createClient({ url: 'file::memory:?cache=shared' });
        db = drizzle(client, { schema: sqliteSchema });

        // 各テーブルを個別に作成
        await client.execute(`
            CREATE TABLE IF NOT EXISTS channel (
                id INTEGER PRIMARY KEY,
                serviceId INTEGER NOT NULL,
                networkId INTEGER NOT NULL,
                name TEXT NOT NULL,
                halfWidthName TEXT NOT NULL,
                remoteControlKeyId INTEGER,
                hasLogoData INTEGER NOT NULL DEFAULT 0,
                channelTypeId INTEGER NOT NULL,
                channelType TEXT NOT NULL,
                channel TEXT NOT NULL,
                type INTEGER
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS recorded (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reserveId INTEGER,
                ruleId INTEGER,
                programId INTEGER,
                channelId INTEGER NOT NULL,
                isProtected INTEGER NOT NULL DEFAULT 0,
                startAt INTEGER NOT NULL,
                endAt INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                name TEXT NOT NULL,
                halfWidthName TEXT NOT NULL,
                description TEXT,
                halfWidthDescription TEXT,
                extended TEXT,
                halfWidthExtended TEXT,
                rawExtended TEXT,
                rawHalfWidthExtended TEXT,
                genre1 INTEGER,
                subGenre1 INTEGER,
                genre2 INTEGER,
                subGenre2 INTEGER,
                genre3 INTEGER,
                subGenre3 INTEGER,
                videoType TEXT,
                videoResolution TEXT,
                videoStreamContent INTEGER,
                videoComponentType INTEGER,
                audioSamplingRate INTEGER,
                audioComponentType INTEGER,
                isRecording INTEGER NOT NULL,
                dropLogFileId INTEGER UNIQUE
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS reserve (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                updateTime INTEGER NOT NULL,
                ruleId INTEGER,
                ruleUpdateCnt INTEGER,
                isSkip INTEGER NOT NULL DEFAULT 0,
                isConflict INTEGER NOT NULL DEFAULT 0,
                allowEndLack INTEGER NOT NULL DEFAULT 0,
                tags TEXT,
                isOverlap INTEGER NOT NULL DEFAULT 0,
                isIgnoreOverlap INTEGER NOT NULL DEFAULT 0,
                isTimeSpecified INTEGER NOT NULL DEFAULT 0,
                parentDirectoryName TEXT,
                directory TEXT,
                recordedFormat TEXT,
                encodeMode1 TEXT,
                encodeParentDirectoryName1 TEXT,
                encodeDirectory1 TEXT,
                encodeMode2 TEXT,
                encodeParentDirectoryName2 TEXT,
                encodeDirectory2 TEXT,
                encodeMode3 TEXT,
                encodeParentDirectoryName3 TEXT,
                encodeDirectory3 TEXT,
                isDeleteOriginalAfterEncode INTEGER NOT NULL DEFAULT 0,
                programId INTEGER,
                programUpdateTime INTEGER,
                channelId INTEGER NOT NULL,
                channel TEXT NOT NULL,
                channelType TEXT NOT NULL,
                startAt INTEGER NOT NULL,
                endAt INTEGER NOT NULL,
                name TEXT,
                halfWidthName TEXT,
                shortName TEXT,
                description TEXT,
                halfWidthDescription TEXT,
                extended TEXT,
                halfWidthExtended TEXT,
                rawExtended TEXT,
                rawHalfWidthExtended TEXT,
                genre1 INTEGER,
                subGenre1 INTEGER,
                genre2 INTEGER,
                subGenre2 INTEGER,
                genre3 INTEGER,
                subGenre3 INTEGER,
                videoType TEXT,
                videoResolution TEXT,
                videoStreamContent INTEGER,
                videoComponentType INTEGER,
                audioSamplingRate INTEGER,
                audioComponentType INTEGER,
                isEventRelay INTEGER NOT NULL DEFAULT 0
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS rule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                updateCnt INTEGER NOT NULL DEFAULT 0,
                isTimeSpecification INTEGER NOT NULL DEFAULT 0,
                keyword TEXT,
                halfWidthKeyword TEXT,
                ignoreKeyword TEXT,
                halfWidthIgnoreKeyword TEXT,
                keyCS INTEGER NOT NULL DEFAULT 0,
                keyRegExp INTEGER NOT NULL DEFAULT 0,
                name INTEGER NOT NULL DEFAULT 0,
                description INTEGER NOT NULL DEFAULT 0,
                extended INTEGER NOT NULL DEFAULT 0,
                ignoreKeyCS INTEGER NOT NULL DEFAULT 0,
                ignoreKeyRegExp INTEGER NOT NULL DEFAULT 0,
                ignoreName INTEGER NOT NULL DEFAULT 0,
                ignoreDescription INTEGER NOT NULL DEFAULT 0,
                ignoreExtended INTEGER NOT NULL DEFAULT 0,
                GR INTEGER NOT NULL DEFAULT 0,
                BS INTEGER NOT NULL DEFAULT 0,
                CS INTEGER NOT NULL DEFAULT 0,
                SKY INTEGER NOT NULL DEFAULT 0,
                channelIds TEXT,
                genres TEXT,
                times TEXT,
                isFree INTEGER NOT NULL DEFAULT 0,
                durationMin INTEGER,
                durationMax INTEGER,
                searchPeriods TEXT,
                enable INTEGER NOT NULL DEFAULT 1,
                allowEndLack INTEGER NOT NULL DEFAULT 0,
                avoidDuplicate INTEGER NOT NULL DEFAULT 0,
                periodToAvoidDuplicate INTEGER,
                tags TEXT,
                parentDirectoryName TEXT,
                directory TEXT,
                recordedFormat TEXT,
                mode1 TEXT,
                parentDirectoryName1 TEXT,
                directory1 TEXT,
                mode2 TEXT,
                parentDirectoryName2 TEXT,
                directory2 TEXT,
                mode3 TEXT,
                parentDirectoryName3 TEXT,
                directory3 TEXT,
                isDeleteOriginalAfterEncode INTEGER NOT NULL DEFAULT 0
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS thumbnail (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filePath TEXT NOT NULL,
                recordedId INTEGER NOT NULL
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS video_file (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parentDirectoryName TEXT NOT NULL,
                filePath TEXT NOT NULL,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,
                recordedId INTEGER NOT NULL
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS drop_log_file (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                errorCnt INTEGER NOT NULL,
                dropCnt INTEGER NOT NULL,
                scramblingCnt INTEGER NOT NULL,
                filePath TEXT NOT NULL
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS recorded_tag (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                halfWidthName TEXT NOT NULL,
                color TEXT NOT NULL
            );
        `);
        await client.execute(`
            CREATE TABLE IF NOT EXISTS recorded_tags_recorded_tag (
                recordedId INTEGER NOT NULL,
                recordedTagId INTEGER NOT NULL,
                PRIMARY KEY (recordedId, recordedTagId)
            );
        `);

        // テーブルデータのクリーンアップ
        await client.execute('DELETE FROM recorded_tags_recorded_tag;');
        await client.execute('DELETE FROM recorded_tag;');
        await client.execute('DELETE FROM drop_log_file;');
        await client.execute('DELETE FROM video_file;');
        await client.execute('DELETE FROM thumbnail;');
        await client.execute('DELETE FROM rule;');
        await client.execute('DELETE FROM reserve;');
        await client.execute('DELETE FROM recorded;');
        await client.execute('DELETE FROM channel;');

        const dummyDrizzleOp: IDrizzleOperator = {
            getDB: () => ({
                type: 'sqlite',
                db,
                rawClient: client,
                schema: sqliteSchema,
            }),
        } as any;

        const dummyConfigModel: any = {
            getConfig: () => ({ isAllowAllCORS: true }),
        };

        recordedDB = new RecordedDB(dummyDrizzleOp, dummyRetry);
        reserveDB = new ReserveDB(dummyDrizzleOp, dummyRetry);
        ruleDB = new RuleDB(dummyDrizzleOp, dummyRetry);
        channelDB = new ChannelDB(dummyConfigModel, dummyDrizzleOp, dummyRetry);
    });

    describe('ChannelDB', () => {
        it('inserts and retrieves channels', async () => {
            const service = {
                id: 1001,
                serviceId: 1024,
                networkId: 32736,
                name: 'NHK総合',
                channel: {
                    type: 'GR' as const,
                    channel: '27',
                },
                hasLogoData: true,
            };

            await channelDB.insert([service as any]);

            const channels = await channelDB.findAll();
            expect(channels).toHaveLength(1);
            expect(channels[0].name).toBe('NHK総合');

            const found = await channelDB.findId(1001);
            expect(found).not.toBeNull();
            expect(found?.name).toBe('NHK総合');
        });
    });

    describe('RecordedDB', () => {
        it('performs CRUD, archive date range queries and protect toggle', async () => {
            const columnOption = {
                isNeedVideoFiles: false,
                isNeedThumbnails: false,
                isNeedsDropLog: false,
                isNeedTags: false,
            };

            const r1 = new Recorded();
            r1.channelId = 1001;
            r1.startAt = new Date(2026, 7, 15, 10, 0).getTime();
            r1.endAt = new Date(2026, 7, 15, 11, 0).getTime();
            r1.duration = 3600;
            r1.name = '夏休み特番アニメ';
            r1.halfWidthName = '夏休み特番アニメ';
            r1.genre1 = 7; // アニメ
            r1.isRecording = false;
            r1.isProtected = false;

            const r2 = new Recorded();
            r2.channelId = 1001;
            r2.startAt = new Date(2026, 8, 1, 19, 0).getTime();
            r2.endAt = new Date(2026, 8, 1, 20, 0).getTime();
            r2.duration = 3600;
            r2.name = '秋のドラマSP';
            r2.halfWidthName = '秋のドラマSP';
            r2.genre1 = 3; // ドラマ
            r2.isRecording = false;
            r2.isProtected = false;

            const id1 = await recordedDB.insertOnce(r1);
            const id2 = await recordedDB.insertOnce(r2);

            expect(id1).toBeGreaterThan(0);
            expect(id2).toBeGreaterThan(0);

            // 全件取得
            const [allRecords, allTotal] = await recordedDB.findAll({ isHalfWidth: true }, columnOption);
            expect(allTotal).toBe(2);
            expect(allRecords).toHaveLength(2);

            // キーワード絞り込み検索
            const [kwRecords, kwTotal] = await recordedDB.findAll({
                isHalfWidth: true,
                keyword: 'アニメ',
            }, columnOption);
            expect(kwTotal).toBe(1);
            expect(kwRecords[0].name).toBe('夏休み特番アニメ');

            // ジャンル絞り込み検索 (genre: 7 アニメ)
            const [animeRecords, animeTotal] = await recordedDB.findAll({
                isHalfWidth: true,
                genre: 7,
            }, columnOption);
            expect(animeTotal).toBe(1);
            expect(animeRecords[0].name).toBe('夏休み特番アニメ');

            // 保護フラグのトグル
            await recordedDB.changeProtect(id1, true);
            const protectedItem = await recordedDB.findId(id1, true);
            expect(protectedItem?.isProtected).toBe(true);

            await recordedDB.changeProtect(id1, false);
            const unprotectedItem = await recordedDB.findId(id1, true);
            expect(unprotectedItem?.isProtected).toBe(false);

            // 削除
            await recordedDB.deleteOnce(id1);
            const [, afterDeleteTotal] = await recordedDB.findAll({ isHalfWidth: true }, columnOption);
            expect(afterDeleteTotal).toBe(1);
        });
    });

    describe('RuleDB & ReserveDB', () => {
        it('manages recording rules and aggregates reserve counts per rule', async () => {
            const ruleOption: any = {
                isTimeSpecification: false,
                searchOption: {
                    keyword: 'ニュース7',
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
            expect(ruleId).toBeGreaterThan(0);

            const [rules, total] = await ruleDB.findAll({});
            expect(total).toBe(1);
            expect(rules).toHaveLength(1);
            expect(rules[0].searchOption.keyword).toBe('ニュース7');

            // ルール紐付き予約を2件追加
            const now = Date.now();
            const res1 = new Reserve();
            res1.updateTime = now;
            res1.ruleId = ruleId;
            res1.channelId = 1001;
            res1.channelType = 'GR';
            res1.channel = '27';
            res1.startAt = now + 10000;
            res1.endAt = now + 40000;
            res1.name = 'ニュース7 #1';
            res1.isSkip = false;
            res1.isConflict = false;

            const res2 = new Reserve();
            res2.updateTime = now;
            res2.ruleId = ruleId;
            res2.channelId = 1001;
            res2.channelType = 'GR';
            res2.channel = '27';
            res2.startAt = now + 50000;
            res2.endAt = now + 80000;
            res2.name = 'ニュース7 #2';
            res2.isSkip = false;
            res2.isConflict = false;

            await reserveDB.insertOnce(res1);
            await reserveDB.insertOnce(res2);

            // ルール別実予約数の集計バッジ表示用カウント取得
            const ruleCounts = await reserveDB.countRuleIds([ruleId], 'all');
            expect(ruleCounts).toHaveLength(1);
            expect(ruleCounts[0].ruleId).toBe(ruleId);
            expect(ruleCounts[0].ruleIdCnt).toBe(2);

            // ルールの有効化/無効化
            await ruleDB.disableOnce(ruleId);
            const disabledRule = await ruleDB.findId(ruleId, true);
            expect(disabledRule?.reserveOption.enable).toBe(false);

            await ruleDB.enableOnce(ruleId);
            const enabledRule = await ruleDB.findId(ruleId, true);
            expect(enabledRule?.reserveOption.enable).toBe(true);
        });
    });
});
