import 'reflect-metadata';
import * as fs from 'fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as sqliteSchema from '../../src/db/schema/sqlite';
import ProgramDB from '../../src/model/db/ProgramDB';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator';
import IPromiseRetry from '../../src/model/IPromiseRetry';

describe('ProgramDB findRule Tests', () => {
    const testDbFile = 'test_program_db.db';
    let client: ReturnType<typeof createClient>;
    let db: ReturnType<typeof drizzle>;
    let programDB: ProgramDB;

    const dummyRetry: IPromiseRetry = {
        run: async <T>(fn: () => Promise<T>) => await fn(),
    } as any;

    afterAll(() => {
        try {
            if (fs.existsSync(testDbFile)) {
                fs.unlinkSync(testDbFile);
            }
        } catch (_) {}
    });

    beforeEach(async () => {
        client = createClient({ url: `file:${testDbFile}` });
        db = drizzle(client, { schema: sqliteSchema });

        await client.execute('DROP TABLE IF EXISTS program;');
        await client.execute(`
            CREATE TABLE program (
                id INTEGER PRIMARY KEY,
                updateTime INTEGER NOT NULL DEFAULT 0,
                channelId INTEGER NOT NULL,
                eventId INTEGER NOT NULL,
                serviceId INTEGER NOT NULL,
                networkId INTEGER NOT NULL,
                startAt INTEGER NOT NULL,
                endAt INTEGER NOT NULL,
                startHour INTEGER NOT NULL,
                week INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                isFree INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                halfWidthName TEXT NOT NULL,
                shortName TEXT NOT NULL DEFAULT '',
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
                channelType TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT ''
            );
        `);

        const dummyDrizzleOp: IDrizzleOperator = {
            getDB: () => ({
                type: 'sqlite',
                db,
                rawClient: client,
                schema: sqliteSchema,
            }),
        } as any;

        const dummyConfigModel = {
            getConfig: () => ({ isAllowAllCORS: true }),
        } as any;

        programDB = new ProgramDB(dummyConfigModel, dummyDrizzleOp, dummyRetry);

        const futureTime = Date.now() + 100000;
        // 日曜日 (week=0), 19時 (startHour=19)
        await db.insert(sqliteSchema.programs).values({
            id: 1,
            updateTime: 0,
            channelId: 1001,
            eventId: 101,
            serviceId: 1024,
            networkId: 32736,
            startAt: futureTime,
            endAt: futureTime + 3600000,
            startHour: 19,
            week: 0, // 日曜日
            duration: 3600000,
            isFree: true,
            name: '日曜ニュース7',
            halfWidthName: '日曜ニュース7',
            shortName: '日曜ニュース7',
            channelType: 'GR',
            channel: '27',
        });

        // 月曜日 (week=1), 21時 (startHour=21)
        await db.insert(sqliteSchema.programs).values({
            id: 2,
            updateTime: 0,
            channelId: 1001,
            eventId: 102,
            serviceId: 1024,
            networkId: 32736,
            startAt: futureTime + 86400000,
            endAt: futureTime + 86400000 + 3600000,
            startHour: 21,
            week: 1, // 月曜日
            duration: 3600000,
            isFree: true,
            name: '月曜ドラマ',
            halfWidthName: '月曜ドラマ',
            shortName: '月曜ドラマ',
            channelType: 'GR',
            channel: '27',
        });
    });

    it('matches programs with all days of week bitmask (127 / 0x7f)', async () => {
        const results = await programDB.findRule({
            searchOption: {
                times: [
                    {
                        week: 127, // 日〜土すべて
                    },
                ],
            },
        });
        expect(results).toHaveLength(2);
    });

    it('matches programs with specific day of week bitmask (0x01 = Sunday)', async () => {
        const results = await programDB.findRule({
            searchOption: {
                times: [
                    {
                        week: 0x01, // 日曜日のみ
                    },
                ],
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('日曜ニュース7');
    });

    it('matches keyword search with week bitmask combined', async () => {
        const results = await programDB.findRule({
            searchOption: {
                keyword: 'ニュース',
                times: [
                    {
                        week: 127,
                    },
                ],
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('日曜ニュース7');
    });

    it('filters out ignored keywords', async () => {
        const results = await programDB.findRule({
            searchOption: {
                times: [
                    {
                        week: 127,
                    },
                ],
                ignoreKeyword: 'ドラマ',
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('日曜ニュース7');
    });

    it('matches specific start hour range', async () => {
        const results = await programDB.findRule({
            searchOption: {
                times: [
                    {
                        week: 127,
                        start: 18,
                        range: 3, // 18:00〜20:59
                    },
                ],
            },
        });
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('日曜ニュース7');
    });

    it('performs bulk insert and upsert operations correctly', async () => {
        const channelTypes = {
            32736: {
                1024: {
                    id: 1001,
                    type: 'GR',
                    channel: '27',
                },
            },
        };

        const newPrograms: any[] = [
            {
                id: 100,
                eventId: 201,
                serviceId: 1024,
                networkId: 32736,
                startAt: Date.now() + 200000,
                duration: 1800000,
                isFree: true,
                name: '一括挿入番組A',
            },
            {
                id: 101,
                eventId: 202,
                serviceId: 1024,
                networkId: 32736,
                startAt: Date.now() + 200000 + 1800000,
                duration: 1800000,
                isFree: true,
                name: '一括挿入番組B',
            },
        ];

        await programDB.insert(channelTypes as any, newPrograms);

        const foundA = await programDB.findId(100);
        const foundB = await programDB.findId(101);

        expect(foundA).not.toBeNull();
        expect(foundA?.name).toBe('一括挿入番組A');
        expect(foundB).not.toBeNull();
        expect(foundB?.name).toBe('一括挿入番組B');

        // Upsert の検証: 名前を更新して再度 insert
        newPrograms[0].name = '一括更新番組A-改';
        await programDB.insert(channelTypes as any, newPrograms);

        const updatedA = await programDB.findId(100);
        expect(updatedA?.name).toBe('一括更新番組A-改');
    });
});
