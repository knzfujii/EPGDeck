import { lt } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import RecordedHistory from '../../db/entities/RecordedHistory';
import IPromiseRetry from '../IPromiseRetry';
import IDrizzleOperator from './IDrizzleOperator';
import IRecordedHistoryDB from './IRecordedHistoryDB';

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
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.recordedHistory);
                    for (const item of items) {
                        await tx.insert(schema.recordedHistory).values({
                            id: item.id,
                            name: item.name,
                            channelId: item.channelId,
                            endAt: item.endAt,
                        });
                    }
                });
            } else {
                const { db, schema } = client;
                await db.transaction(async tx => {
                    await tx.delete(schema.recordedHistory);
                    for (const item of items) {
                        await tx.insert(schema.recordedHistory).values({
                            id: item.id,
                            name: item.name,
                            channelId: item.channelId,
                            endAt: item.endAt,
                        });
                    }
                });
            }
        });
    }

    /**
     * 録画履歴情報を 1 件挿入
     */
    public async insertOnce(program: RecordedHistory): Promise<apid.RecordedHistoryId> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const result = await db.insert(schema.recordedHistory).values({
                    name: program.name,
                    channelId: program.channelId,
                    endAt: program.endAt,
                });
                return Number(result.lastInsertRowid);
            } else {
                const { db, schema } = client;
                const [result] = await db.insert(schema.recordedHistory).values({
                    name: program.name,
                    channelId: program.channelId,
                    endAt: program.endAt,
                });
                return result.insertId;
            }
        });
    }

    /**
     * 古い録画履歴を削除
     */
    public async delete(time: apid.UnixtimeMS): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.delete(schema.recordedHistory).where(lt(schema.recordedHistory.endAt, time));
            } else {
                const { db, schema } = client;
                await db.delete(schema.recordedHistory).where(lt(schema.recordedHistory.endAt, time));
            }
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<RecordedHistory[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db.select().from(schema.recordedHistory);
                return rows.map(r => this.toEntity(r));
            } else {
                const { db, schema } = client;
                const rows = await db.select().from(schema.recordedHistory);
                return rows.map(r => this.toEntity(r));
            }
        });
    }

    private toEntity(row: any): RecordedHistory {
        const entity = new RecordedHistory();
        entity.id = row.id;
        entity.name = row.name;
        entity.channelId = row.channelId;
        entity.endAt = row.endAt;
        return entity;
    }
}
