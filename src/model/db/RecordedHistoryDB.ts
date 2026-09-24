import { and, eq, lt } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api.js';
import RecordedHistory from '../../db/entities/RecordedHistory.js';
import IPromiseRetry from '../IPromiseRetry.js';
import { DrizzleHelper } from './DrizzleHelper.js';
import IDrizzleOperator from './IDrizzleOperator.js';
import IRecordedHistoryDB from './IRecordedHistoryDB.js';

@injectable()
export default class RecordedHistoryDB implements IRecordedHistoryDB {
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
    public async restore(items: RecordedHistory[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                await tx.delete(schema.recordedHistory);
                const CHUNK_SIZE = 500;
                for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                    const chunk = items.slice(i, i + CHUNK_SIZE).map(item => ({
                        id: item.id,
                        name: item.name,
                        channelId: item.channelId,
                        endAt: item.endAt,
                    }));
                    if (chunk.length > 0) {
                        await tx.insert(schema.recordedHistory).values(chunk);
                    }
                }
            });
        });
    }

    /**
     * 録画履歴情報を 1 件挿入
     */
    public async insertOnce(history: RecordedHistory): Promise<apid.RecordedHistoryId> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const result = await (db as any).insert(schema.recordedHistory).values({
                name: history.name,
                channelId: history.channelId,
                endAt: history.endAt,
            });
            return DrizzleHelper.getInsertId(client.type, result);
        });
    }

    /**
     * 古い録画履歴を削除
     */
    public async delete(time: apid.UnixtimeMS): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.recordedHistory).where(lt(schema.recordedHistory.endAt, time));
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<RecordedHistory[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.recordedHistory);
            return rows.map((r: { id: number; name: string; channelId: number; endAt: number }) => this.toEntity(r));
        });
    }

    /**
     * 重複判定履歴が存在するか確認
     */
    public async hasHistory(name: string, channelId: apid.ChannelId, endAt: apid.UnixtimeMS): Promise<boolean> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select({ id: schema.recordedHistory.id })
                .from(schema.recordedHistory)
                .where(this.createHistoryCondition(schema, name, channelId, endAt))
                .limit(1);
            return rows.length > 0;
        });
    }

    /**
     * 重複判定履歴から削除
     */
    public async deleteHistory(name: string, channelId: apid.ChannelId, endAt: apid.UnixtimeMS): Promise<boolean> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any)
                .delete(schema.recordedHistory)
                .where(this.createHistoryCondition(schema, name, channelId, endAt));
            return true;
        });
    }

    /**
     * 重複判定履歴へ追加（既に存在する場合は重複追加しない）
     */
    public async addHistory(name: string, channelId: apid.ChannelId, endAt: apid.UnixtimeMS): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select({ id: schema.recordedHistory.id })
                .from(schema.recordedHistory)
                .where(this.createHistoryCondition(schema, name, channelId, endAt))
                .limit(1);

            if (rows.length === 0) {
                await (db as any).insert(schema.recordedHistory).values({
                    name,
                    channelId,
                    endAt,
                });
            }
        });
    }

    /**
     * 重複判定履歴の照合条件を生成
     */
    private createHistoryCondition(schema: any, name: string, channelId: apid.ChannelId, endAt: apid.UnixtimeMS) {
        return and(
            eq(schema.recordedHistory.name, name),
            eq(schema.recordedHistory.channelId, channelId),
            eq(schema.recordedHistory.endAt, endAt),
        );
    }

    private toEntity(row: { id: number; name: string; channelId: number; endAt: number }): RecordedHistory {
        const entity = new RecordedHistory();
        entity.id = row.id;
        entity.name = row.name;
        entity.channelId = row.channelId;
        entity.endAt = row.endAt;
        return entity;
    }
}
