import 'reflect-metadata';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as sqliteSchema from '../../src/db/schema/sqlite/index.js';
import RecordedTag from '../../src/db/entities/RecordedTag.js';
import RecordedTagApiModel from '../../src/model/api/recordedTag/RecordedTagApiModel.js';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator.js';
import RecordedTagDB from '../../src/model/db/RecordedTagDB.js';
import RecordedTagManageModel from '../../src/model/operator/recordedTag/RecordedTagManageModel.js';
import IPromiseRetry from '../../src/model/IPromiseRetry.js';

describe('RecordedTag Full Stack Tests', () => {
    describe('RecordedTagManageModel', () => {
        let dummyLogger: any;
        let mockSysLog: any;
        let dummyRecordedTagDB: any;
        let dummyRecordedTagEvent: any;
        let model: RecordedTagManageModel;

        beforeEach(() => {
            mockSysLog = {
                info: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
                debug: vi.fn(),
            };
            dummyLogger = {
                getLogger: () => ({
                    system: mockSysLog,
                }),
            };
            dummyRecordedTagDB = {
                insertOnce: vi.fn(),
                updateOnce: vi.fn(),
                setRelation: vi.fn(),
                deleteOnce: vi.fn(),
                deleteRelation: vi.fn(),
            };
            dummyRecordedTagEvent = {
                emitCreated: vi.fn(),
                emitUpdated: vi.fn(),
                emitRelated: vi.fn(),
                emitDeleted: vi.fn(),
                emitDeletedRelation: vi.fn(),
            };
            model = new RecordedTagManageModel(dummyLogger, dummyRecordedTagDB, dummyRecordedTagEvent);
        });

        describe('create', () => {
            it('creates a tag with halfWidthName and emits created event', async () => {
                dummyRecordedTagDB.insertOnce.mockResolvedValue(42);

                const tagId = await model.create('アニメ　１', '#ff0000');

                expect(tagId).toBe(42);
                expect(dummyRecordedTagDB.insertOnce).toHaveBeenCalledTimes(1);
                const insertedTag: RecordedTag = dummyRecordedTagDB.insertOnce.mock.calls[0][0];
                expect(insertedTag.name).toBe('アニメ　１');
                expect(insertedTag.halfWidthName).toBe('アニメ 1');
                expect(insertedTag.color).toBe('#ff0000');
                expect(dummyRecordedTagEvent.emitCreated).toHaveBeenCalledWith(insertedTag);
            });

            it('logs system error and throws when insertOnce fails', async () => {
                const error = new Error('DB insert failed');
                dummyRecordedTagDB.insertOnce.mockRejectedValue(error);

                await expect(model.create('ドラマ', '#00ff00')).rejects.toThrow('DB insert failed');
                const sysLog = dummyLogger.getLogger().system;
                expect(sysLog.error).toHaveBeenCalledWith('create tag error: ドラマ');
                expect(dummyRecordedTagEvent.emitCreated).not.toHaveBeenCalled();
            });
        });

        describe('update', () => {
            it('updates tag and emits updated event', async () => {
                dummyRecordedTagDB.updateOnce.mockResolvedValue(undefined);

                await model.update(10, 'ニュース', '#0000ff');

                expect(dummyRecordedTagDB.updateOnce).toHaveBeenCalledWith(10, 'ニュース', '#0000ff');
                expect(dummyRecordedTagEvent.emitUpdated).toHaveBeenCalledWith(10);
            });

            it('logs system error and throws when updateOnce fails', async () => {
                const error = new Error('DB update failed');
                dummyRecordedTagDB.updateOnce.mockRejectedValue(error);

                await expect(model.update(10, 'バラエティ', '#ffff00')).rejects.toThrow('DB update failed');
                const sysLog = dummyLogger.getLogger().system;
                expect(sysLog.error).toHaveBeenCalledWith('update tag error tagId: 10 name: バラエティ');
                expect(dummyRecordedTagEvent.emitUpdated).not.toHaveBeenCalled();
            });
        });

        describe('setRelation', () => {
            it('sets relation between tag and recorded and emits related event', async () => {
                dummyRecordedTagDB.setRelation.mockResolvedValue(undefined);

                await model.setRelation(5, 100);

                expect(dummyRecordedTagDB.setRelation).toHaveBeenCalledWith(5, 100);
                expect(dummyRecordedTagEvent.emitRelated).toHaveBeenCalledWith(5, 100);
            });

            it('logs system error and throws when setRelation fails', async () => {
                const error = new Error('DB setRelation failed');
                dummyRecordedTagDB.setRelation.mockRejectedValue(error);

                await expect(model.setRelation(5, 100)).rejects.toThrow('DB setRelation failed');
                const sysLog = dummyLogger.getLogger().system;
                expect(sysLog.error).toHaveBeenCalledWith('set tag relation error tagId: 5 recordedId: 100');
                expect(dummyRecordedTagEvent.emitRelated).not.toHaveBeenCalled();
            });
        });

        describe('delete', () => {
            it('deletes tag and emits deleted event', async () => {
                dummyRecordedTagDB.deleteOnce.mockResolvedValue(undefined);

                await model.delete(7);

                expect(dummyRecordedTagDB.deleteOnce).toHaveBeenCalledWith(7);
                expect(dummyRecordedTagEvent.emitDeleted).toHaveBeenCalledWith(7);
            });

            it('logs system error with correct tagId and throws when deleteOnce fails', async () => {
                const error = new Error('DB delete failed');
                dummyRecordedTagDB.deleteOnce.mockRejectedValue(error);

                await expect(model.delete(7)).rejects.toThrow('DB delete failed');
                const sysLog = dummyLogger.getLogger().system;
                expect(sysLog.error).toHaveBeenCalledWith('delete tag error: 7');
                expect(dummyRecordedTagEvent.emitDeleted).not.toHaveBeenCalled();
            });
        });

        describe('deleteRelation', () => {
            it('deletes relation between tag and recorded and emits deletedRelation event', async () => {
                dummyRecordedTagDB.deleteRelation.mockResolvedValue(undefined);

                await model.deleteRelation(3, 200);

                expect(dummyRecordedTagDB.deleteRelation).toHaveBeenCalledWith(3, 200);
                expect(dummyRecordedTagEvent.emitDeletedRelation).toHaveBeenCalledWith(3, 200);
            });

            it('logs system error and throws when deleteRelation fails', async () => {
                const error = new Error('DB deleteRelation failed');
                dummyRecordedTagDB.deleteRelation.mockRejectedValue(error);

                await expect(model.deleteRelation(3, 200)).rejects.toThrow('DB deleteRelation failed');
                const sysLog = dummyLogger.getLogger().system;
                expect(sysLog.error).toHaveBeenCalledWith('delete tag relation error tagId: 3 recordedId: 200');
                expect(dummyRecordedTagEvent.emitDeletedRelation).not.toHaveBeenCalled();
            });
        });
    });

    describe('RecordedTagApiModel', () => {
        let dummyIPC: any;
        let dummyRecordedTagDB: any;
        let apiModel: RecordedTagApiModel;

        beforeEach(() => {
            dummyIPC = {
                recordedTag: {
                    create: vi.fn(),
                    update: vi.fn(),
                    setRelation: vi.fn(),
                    delete: vi.fn(),
                    deleteRelation: vi.fn(),
                },
            };
            dummyRecordedTagDB = {
                findAll: vi.fn(),
            };
            apiModel = new RecordedTagApiModel(dummyIPC, dummyRecordedTagDB);
        });

        it('create delegates to ipc.recordedTag.create', async () => {
            dummyIPC.recordedTag.create.mockResolvedValue(123);

            const result = await apiModel.create('アニメ', '#ff0000');
            expect(result).toBe(123);
            expect(dummyIPC.recordedTag.create).toHaveBeenCalledWith('アニメ', '#ff0000');
        });

        it('update delegates to ipc.recordedTag.update', async () => {
            dummyIPC.recordedTag.update.mockResolvedValue(undefined);

            await apiModel.update(10, 'ドラマ', '#00ff00');
            expect(dummyIPC.recordedTag.update).toHaveBeenCalledWith(10, 'ドラマ', '#00ff00');
        });

        it('setRelation delegates to ipc.recordedTag.setRelation', async () => {
            dummyIPC.recordedTag.setRelation.mockResolvedValue(undefined);

            await apiModel.setRelation(5, 50);
            expect(dummyIPC.recordedTag.setRelation).toHaveBeenCalledWith(5, 50);
        });

        it('delete delegates to ipc.recordedTag.delete', async () => {
            dummyIPC.recordedTag.delete.mockResolvedValue(undefined);

            await apiModel.delete(8);
            expect(dummyIPC.recordedTag.delete).toHaveBeenCalledWith(8);
        });

        it('deleteRelation delegates to ipc.recordedTag.deleteRelation', async () => {
            dummyIPC.recordedTag.deleteRelation.mockResolvedValue(undefined);

            await apiModel.deleteRelation(8, 80);
            expect(dummyIPC.recordedTag.deleteRelation).toHaveBeenCalledWith(8, 80);
        });

        it('gets formats records returned from DB', async () => {
            const tag1 = new RecordedTag();
            tag1.id = 1;
            tag1.name = 'Tag 1';
            tag1.color = '#111';
            tag1.halfWidthName = 'Tag 1';

            const tag2 = new RecordedTag();
            tag2.id = 2;
            tag2.name = 'Tag 2';
            tag2.color = '#222';
            tag2.halfWidthName = 'Tag 2';

            dummyRecordedTagDB.findAll.mockResolvedValue([[tag1, tag2], 2]);

            const result = await apiModel.gets({ limit: 10 });
            expect(result).toEqual({
                tags: [
                    { id: 1, name: 'Tag 1', color: '#111' },
                    { id: 2, name: 'Tag 2', color: '#222' },
                ],
                total: 2,
            });
            expect(dummyRecordedTagDB.findAll).toHaveBeenCalledWith({ limit: 10 });
        });
    });

    describe('RecordedTagDB (In-Memory SQLite)', () => {
        let client: ReturnType<typeof createClient>;
        let db: ReturnType<typeof drizzle>;
        let tagDB: RecordedTagDB;

        const dummyRetry: IPromiseRetry = {
            run: async <T>(fn: () => Promise<T>) => await fn(),
        } as any;

        beforeEach(async () => {
            client = createClient({ url: 'file::memory:?cache=shared' });
            db = drizzle(client, { schema: sqliteSchema });

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

            await client.execute('DELETE FROM recorded_tags_recorded_tag;');
            await client.execute('DELETE FROM recorded_tag;');

            const drizzleOp: IDrizzleOperator = {
                getDB: () => ({
                    type: 'sqlite',
                    db: db as any,
                    rawClient: client,
                    schema: sqliteSchema,
                }),
                checkConnection: async () => {},
                closeConnection: async () => {},
            };

            tagDB = new RecordedTagDB(drizzleOp, dummyRetry);
        });

        it('insertOnce, findId and updateOnce work correctly', async () => {
            const tag = new RecordedTag();
            tag.name = 'アニメ映画　１';
            tag.halfWidthName = 'アニメ映画 1';
            tag.color = '#ff00aa';

            const tagId = await tagDB.insertOnce(tag);
            expect(tagId).toBeGreaterThan(0);

            const found = await tagDB.findId(tagId);
            expect(found).not.toBeNull();
            expect(found?.name).toBe('アニメ映画　１');
            expect(found?.halfWidthName).toBe('アニメ映画 1');
            expect(found?.color).toBe('#ff00aa');

            // 存在しない ID の検索
            const notFound = await tagDB.findId(999999);
            expect(notFound).toBeNull();

            // updateOnce
            await tagDB.updateOnce(tagId, '劇場版アニメ　２', '#112233');
            const updated = await tagDB.findId(tagId);
            expect(updated?.name).toBe('劇場版アニメ　２');
            expect(updated?.halfWidthName).toBe('劇場版アニメ 2');
            expect(updated?.color).toBe('#112233');
        });

        it('setRelation, deleteRelation and deleteAllRelation work correctly', async () => {
            const tag = new RecordedTag();
            tag.name = 'テストタグ';
            tag.halfWidthName = 'ﾃｽﾄﾀｸﾞ';
            tag.color = '#ffffff';
            const tagId = await tagDB.insertOnce(tag);

            const tag2 = new RecordedTag();
            tag2.name = 'サブタグ';
            tag2.halfWidthName = 'ｻﾌﾞﾀｸﾞ';
            tag2.color = '#000000';
            const tagId2 = await tagDB.insertOnce(tag2);

            // setRelation
            await tagDB.setRelation(tagId, 100);
            await tagDB.setRelation(tagId2, 100);

            // リレーション確認
            let relations = await client.execute({
                sql: 'SELECT * FROM recorded_tags_recorded_tag WHERE recordedId = ?',
                args: [100],
            });
            expect(relations.rows.length).toBe(2);

            // 重複 setRelation の安全実行（エラーにならないこと）
            await tagDB.setRelation(tagId, 100);
            relations = await client.execute({
                sql: 'SELECT * FROM recorded_tags_recorded_tag WHERE recordedId = ?',
                args: [100],
            });
            expect(relations.rows.length).toBe(2);

            // deleteRelation
            await tagDB.deleteRelation(tagId, 100);
            relations = await client.execute({
                sql: 'SELECT * FROM recorded_tags_recorded_tag WHERE recordedId = ?',
                args: [100],
            });
            expect(relations.rows.length).toBe(1);
            expect(relations.rows[0].recordedTagId).toBe(tagId2);

            // deleteAllRelation
            await tagDB.deleteAllRelation(100);
            relations = await client.execute({
                sql: 'SELECT * FROM recorded_tags_recorded_tag WHERE recordedId = ?',
                args: [100],
            });
            expect(relations.rows.length).toBe(0);
        });

        it('findAll supports search filters, excludeTagId and pagination', async () => {
            const tagsToInsert = [
                { name: '映画 アクション', color: '#f00' },
                { name: '映画 SF', color: '#0f0' },
                { name: 'アニメ ドラマ', color: '#00f' },
                { name: 'ニュース 報道', color: '#fff' },
            ];

            const createdIds: number[] = [];
            for (const t of tagsToInsert) {
                const tag = new RecordedTag();
                tag.name = t.name;
                tag.halfWidthName = t.name; // 簡単のため
                tag.color = t.color;
                const id = await tagDB.insertOnce(tag);
                createdIds.push(id);
            }

            // 全件取得
            const [all, allTotal] = await tagDB.findAll({});
            expect(all.length).toBe(4);
            expect(allTotal).toBe(4);

            // name フィルタ（部分一致）
            const [movies, movieTotal] = await tagDB.findAll({ name: '映画' });
            expect(movies.length).toBe(2);
            expect(movieTotal).toBe(2);

            // excludeTagId フィルタ
            const [excluded, excludeTotal] = await tagDB.findAll({ excludeTagId: [createdIds[0], createdIds[1]] });
            expect(excluded.length).toBe(2);
            expect(excludeTotal).toBe(2);
            expect(excluded.map(t => t.id)).toEqual([createdIds[2], createdIds[3]]);

            // pagination (limit / offset)
            const [paged, pagedTotal] = await tagDB.findAll({ offset: 1, limit: 2 });
            expect(paged.length).toBe(2);
            expect(pagedTotal).toBe(4);
            expect(paged[0].id).toBe(createdIds[1]);
            expect(paged[1].id).toBe(createdIds[2]);
        });

        it('deleteOnce removes the tag record', async () => {
            const tag = new RecordedTag();
            tag.name = '削除対象タグ';
            tag.halfWidthName = '削除対象ﾀｸﾞ';
            tag.color = '#ccc';
            const tagId = await tagDB.insertOnce(tag);

            await tagDB.deleteOnce(tagId);
            const found = await tagDB.findId(tagId);
            expect(found).toBeNull();
        });

        it('restore clears existing tags and inserts provided items', async () => {
            const initialTag = new RecordedTag();
            initialTag.name = '初期タグ';
            initialTag.halfWidthName = '初期ﾀｸﾞ';
            initialTag.color = '#111';
            await tagDB.insertOnce(initialTag);

            const newTags = [
                { id: 10, name: '復元タグ1', halfWidthName: '復元ﾀｸﾞ1', color: '#aaa' },
                { id: 20, name: '復元タグ2', halfWidthName: '復元ﾀｸﾞ2', color: '#bbb' },
            ].map(item => {
                const t = new RecordedTag();
                t.id = item.id;
                t.name = item.name;
                t.halfWidthName = item.halfWidthName;
                t.color = item.color;
                return t;
            });

            await tagDB.restore(newTags);

            const [restored, total] = await tagDB.findAll({});
            expect(total).toBe(2);
            expect(restored.find(t => t.id === 10)?.name).toBe('復元タグ1');
            expect(restored.find(t => t.id === 20)?.name).toBe('復元タグ2');
        });
    });
});
