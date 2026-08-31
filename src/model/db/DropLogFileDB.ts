import { eq } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import DropLogFile from '../../db/entities/DropLogFile';
import IPromiseRetry from '../IPromiseRetry';
import { DrizzleHelper } from './DrizzleHelper';
import IDropLogFileDB, { UpdateCntOption } from './IDropLogFileDB';
import IDrizzleOperator from './IDrizzleOperator';

@injectable()
export default class DropLogFileDB implements IDropLogFileDB {
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
    public async restore(items: DropLogFile[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                await tx.delete(schema.dropLogFiles);
                for (const item of items) {
                    await tx.insert(schema.dropLogFiles).values({
                        id: item.id,
                        errorCnt: item.errorCnt,
                        dropCnt: item.dropCnt,
                        scramblingCnt: item.scramblingCnt,
                        filePath: item.filePath,
                    });
                }
            });
        });
    }

    /**
     * drop log file 情報を 1 件挿入
     */
    public async insertOnce(dropLogFile: DropLogFile): Promise<apid.DropLogFileId> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const result = await (db as any).insert(schema.dropLogFiles).values({
                errorCnt: dropLogFile.errorCnt,
                dropCnt: dropLogFile.dropCnt,
                scramblingCnt: dropLogFile.scramblingCnt,
                filePath: dropLogFile.filePath,
            });
            return DrizzleHelper.getInsertId(client.type, result);
        });
    }

    /**
     * カウントを更新
     */
    public async updateCnt(updateOption: UpdateCntOption): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const values = {
                errorCnt: updateOption.errorCnt,
                dropCnt: updateOption.dropCnt,
                scramblingCnt: updateOption.scramblingCnt,
            };
            const { db, schema } = client;
            await (db as any)
                .update(schema.dropLogFiles)
                .set(values)
                .where(eq(schema.dropLogFiles.id, updateOption.id));
        });
    }

    /**
     * drop log file 情報を 1 件削除
     */
    public async deleteOnce(dropLogFileId: apid.DropLogFileId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).delete(schema.dropLogFiles).where(eq(schema.dropLogFiles.id, dropLogFileId));
        });
    }

    /**
     * dropLogFileId を指定してドロップログファイル情報を取得
     */
    public async findId(dropLogFileId: apid.DropLogFileId): Promise<DropLogFile | null> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.dropLogFiles)
                .where(eq(schema.dropLogFiles.id, dropLogFileId));
            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<DropLogFile[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.dropLogFiles);
            return rows.map((r: any) => this.toEntity(r));
        });
    }

    private toEntity(row: any): DropLogFile {
        const entity = new DropLogFile();
        entity.id = row.id;
        entity.errorCnt = row.errorCnt;
        entity.dropCnt = row.dropCnt;
        entity.scramblingCnt = row.scramblingCnt;
        entity.filePath = row.filePath;
        return entity;
    }
}
