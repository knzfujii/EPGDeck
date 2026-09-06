import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as sqliteSchema from '../../src/db/schema/sqlite';
import { DrizzleHelper } from '../../src/model/db/DrizzleHelper';

describe('DrizzleHelper', () => {
    const testDbFile = 'test_drizzle_helper.db';
    let client: ReturnType<typeof createClient>;
    let db: ReturnType<typeof drizzle>;

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

        await client.execute('DROP TABLE IF EXISTS channel;');
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

        await client.execute('DROP TABLE IF EXISTS recorded_tags_recorded_tag;');
        await client.execute(`
            CREATE TABLE recorded_tags_recorded_tag (
                recordedId INTEGER NOT NULL,
                recordedTagId INTEGER NOT NULL,
                PRIMARY KEY (recordedId, recordedTagId)
            );
        `);
    });

    describe('getInsertId', () => {
        it('should extract lastInsertRowid for SQLite', () => {
            const res = { lastInsertRowid: 42n };
            expect(DrizzleHelper.getInsertId('sqlite', res)).toBe(42);
        });

        it('should extract insertId for MySQL single object', () => {
            const res = { insertId: 99 };
            expect(DrizzleHelper.getInsertId('mysql', res)).toBe(99);
        });

        it('should extract insertId for MySQL array result', () => {
            const res = [{ insertId: 123 }];
            expect(DrizzleHelper.getInsertId('mysql', res)).toBe(123);
        });
    });

    describe('upsertPrograms', () => {
        it('should insert and update programs on SQLite', async () => {
            const row1 = {
                id: 100,
                updateTime: 1000,
                channelId: 1,
                eventId: 10,
                serviceId: 101,
                networkId: 1,
                startAt: 1000,
                endAt: 2000,
                startHour: 10,
                week: 1,
                duration: 1000,
                isFree: 1,
                name: 'Initial Name',
                halfWidthName: 'Initial Name',
                shortName: '',
                channel: '1',
                channelType: 'GR',
            };

            await DrizzleHelper.upsertPrograms('sqlite', db, sqliteSchema, [row1]);

            let queried = await (db as any).select().from(sqliteSchema.programs);
            expect(queried.length).toBe(1);
            expect(queried[0].name).toBe('Initial Name');

            // Update row1
            const updatedRow1 = {
                ...row1,
                name: 'Updated Name',
                halfWidthName: 'Updated Name',
                updateTime: 2000,
            };

            await DrizzleHelper.upsertPrograms('sqlite', db, sqliteSchema, [updatedRow1]);

            queried = await (db as any).select().from(sqliteSchema.programs);
            expect(queried.length).toBe(1);
            expect(queried[0].name).toBe('Updated Name');
            expect(queried[0].updateTime).toBe(2000);
        });
    });

    describe('upsertChannels', () => {
        it('should insert and update channels on SQLite', async () => {
            const channel1 = {
                id: 1,
                serviceId: 101,
                networkId: 1,
                name: 'Channel 1',
                halfWidthName: 'Channel 1',
                remoteControlKeyId: 1,
                hasLogoData: 0,
                channelTypeId: 0,
                channelType: 'GR',
                channel: '1',
            };

            await DrizzleHelper.upsertChannels('sqlite', db, sqliteSchema, [channel1]);

            let queried = await (db as any).select().from(sqliteSchema.channels);
            expect(queried.length).toBe(1);
            expect(queried[0].name).toBe('Channel 1');

            // Update channel
            const channel1Updated = {
                ...channel1,
                name: 'Channel 1 Mod',
                halfWidthName: 'Channel 1 Mod',
            };

            await DrizzleHelper.upsertChannels('sqlite', db, sqliteSchema, [channel1Updated]);

            queried = await (db as any).select().from(sqliteSchema.channels);
            expect(queried.length).toBe(1);
            expect(queried[0].name).toBe('Channel 1 Mod');
        });
    });

    describe('setTagRelation', () => {
        it('should insert tag relation and ignore conflict on SQLite', async () => {
            await DrizzleHelper.setTagRelation('sqlite', db, sqliteSchema, 10, 20);

            let queried = await (db as any).select().from(sqliteSchema.recordedTagsRecordedTag);
            expect(queried.length).toBe(1);
            expect(queried[0].recordedId).toBe(10);
            expect(queried[0].recordedTagId).toBe(20);

            // Duplicate insert should not throw and keep single record
            await DrizzleHelper.setTagRelation('sqlite', db, sqliteSchema, 10, 20);
            queried = await (db as any).select().from(sqliteSchema.recordedTagsRecordedTag);
            expect(queried.length).toBe(1);
        });
    });
});
