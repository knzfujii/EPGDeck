import 'reflect-metadata';
import { createClient } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { describe, expect, it } from 'vitest';
import * as sqliteSchema from '../../src/db/schema/sqlite';

describe('Drizzle ORM SQLite Schema Tests', () => {
    const client = createClient({ url: ':memory:' });
    const db = drizzle(client, { schema: sqliteSchema });

    it('should create tables, insert and query channels', async () => {
        await client.execute(`
            CREATE TABLE channel (
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

        await db.insert(sqliteSchema.channels).values({
            id: 10001,
            serviceId: 1024,
            networkId: 32736,
            name: 'NHK総合',
            halfWidthName: 'NHK総合',
            channelTypeId: 1,
            channelType: 'GR',
            channel: '27',
            hasLogoData: true,
        });

        const results = await db.select().from(sqliteSchema.channels).where(eq(sqliteSchema.channels.id, 10001));
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('NHK総合');
        expect(results[0].hasLogoData).toBe(true);
        expect(results[0].channelType).toBe('GR');
    });

    it('should insert and query recorded items', async () => {
        await client.execute(`
            CREATE TABLE recorded (
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

        await db.insert(sqliteSchema.recorded).values({
            channelId: 10001,
            startAt: 1700000000000,
            endAt: 1700003600000,
            duration: 3600,
            name: 'テスト録画番組',
            halfWidthName: 'テスト録画番組',
            isRecording: false,
            isProtected: true,
        });

        const recordedList = await db.select().from(sqliteSchema.recorded);
        expect(recordedList).toHaveLength(1);
        expect(recordedList[0].name).toBe('テスト録画番組');
        expect(recordedList[0].isProtected).toBe(true);
        expect(recordedList[0].duration).toBe(3600);
    });

    it('creates and verifies composite indexes on tables safely', async () => {
        // インデックスを安全に作成
        await client.execute('CREATE INDEX IF NOT EXISTS idx_recorded_channel_start ON recorded(channelId, startAt);');
        await client.execute('CREATE INDEX IF NOT EXISTS idx_recorded_start_end ON recorded(startAt, endAt);');
        await client.execute('CREATE INDEX IF NOT EXISTS idx_recorded_rule ON recorded(ruleId);');

        // SQLite のインデックス一覧を確認
        const indexListResult = await client.execute(`
            SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'recorded';
        `);
        const indexNames = indexListResult.rows.map(r => r.name);

        expect(indexNames).toContain('idx_recorded_channel_start');
        expect(indexNames).toContain('idx_recorded_start_end');
        expect(indexNames).toContain('idx_recorded_rule');
    });

    it('initializes all tables and composite indexes via DrizzleOperator.checkConnection()', async () => {
        const dummyConfig: any = {
            getConfig: () => ({
                database: {
                    type: 'sqlite',
                    sqlite: {},
                },
            }),
        };

        const operator = new (await import('../../src/model/db/DrizzleOperator')).default(dummyConfig);
        await operator.checkConnection();

        const dbInstance = operator.getDB();
        expect(dbInstance.type).toBe('sqlite');

        if (dbInstance.type === 'sqlite') {
            const indexCheck = await dbInstance.rawClient.execute(`
                SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%';
            `);
            const createdIndexes = indexCheck.rows.map(r => r.name);

            expect(createdIndexes).toContain('idx_program_channel_time');
            expect(createdIndexes).toContain('idx_program_time');
            expect(createdIndexes).toContain('idx_recorded_channel_start');
            expect(createdIndexes).toContain('idx_recorded_start_end');
            expect(createdIndexes).toContain('idx_recorded_rule');
            expect(createdIndexes).toContain('idx_reserve_start_end');
            expect(createdIndexes).toContain('idx_reserve_rule');
            expect(createdIndexes).toContain('idx_reserve_channel_start');
        }

        await operator.closeConnection();
    });
});
