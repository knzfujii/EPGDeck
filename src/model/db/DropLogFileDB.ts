import { eq } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import DropLogFile from '../../db/entities/DropLogFile';
import IPromiseRetry from '../IPromiseRetry';
import IDropLogFileDB, { UpdateCntOption } from './IDropLogFileDB';
import IDrizzleOperator from './IDrizzleOperator';

@injectable()
export default class DropLogFileDB implements IDropLogFileDB {
    private drizzleOp: IDrizzleOperator;
    private promieRetry: IPromiseRetry;

    constructor(
        @inject('IDrizzleOperator') drizzleOp: IDrizzleOperator,
        @inject('IPromiseRetry') promieRetry: IPromiseRetry,
    ) {
        this.drizzleOp = drizzleOp;
        this.promieRetry = promieRetry;
    }

    /**
     * バックアップから復元
     */
    public async restore(items: DropLogFile[]): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.transaction(async tx => {
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
            } else {
                const { db, schema } = client;
                await db.transaction(async tx => {
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
            }
        });
    }

    /**
     * drop log file 情報を 1 件挿入
     */
    public async insertOnce(dropLogFile: DropLogFile): Promise<apid.DropLogFileId> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const result = await db.insert(schema.dropLogFiles).values({
                    errorCnt: dropLogFile.errorCnt,
                    dropCnt: dropLogFile.dropCnt,
                    scramblingCnt: dropLogFile.scramblingCnt,
                    filePath: dropLogFile.filePath,
                });
                return Number(result.lastInsertRowid);
            } else {
                const { db, schema } = client;
                const [result] = await db.insert(schema.dropLogFiles).values({
                    errorCnt: dropLogFile.errorCnt,
                    dropCnt: dropLogFile.dropCnt,
                    scramblingCnt: dropLogFile.scramblingCnt,
                    filePath: dropLogFile.filePath,
                });
                return result.insertId;
            }
        });
    }

    /**
     * カウントを更新
     */
    public async updateCnt(updateOption: UpdateCntOption): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            const values = {
                errorCnt: updateOption.errorCnt,
                dropCnt: updateOption.dropCnt,
                scramblingCnt: updateOption.scramblingCnt,
            };

            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.update(schema.dropLogFiles).set(values).where(eq(schema.dropLogFiles.id, updateOption.id));
            } else {
                const { db, schema } = client;
                await db.update(schema.dropLogFiles).set(values).where(eq(schema.dropLogFiles.id, updateOption.id));
            }
        });
    }

    /**
     * drop log file 情報を 1 件削除
     */
    public async deleteOnce(dropLogFileId: apid.DropLogFileId): Promise<void> {
        const client = this.drizzleOp.getDB();

        await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                await db.delete(schema.dropLogFiles).where(eq(schema.dropLogFiles.id, dropLogFileId));
            } else {
                const { db, schema } = client;
                await db.delete(schema.dropLogFiles).where(eq(schema.dropLogFiles.id, dropLogFileId));
            }
        });
    }

    /**
     * dropLogFileId を指定してドロップログファイル情報を取得
     */
    public async findId(dropLogFileId: apid.DropLogFileId): Promise<DropLogFile | null> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db
                    .select()
                    .from(schema.dropLogFiles)
                    .where(eq(schema.dropLogFiles.id, dropLogFileId));
                if (rows.length === 0) return null;
                return this.toEntity(rows[0]);
            } else {
                const { db, schema } = client;
                const rows = await db
                    .select()
                    .from(schema.dropLogFiles)
                    .where(eq(schema.dropLogFiles.id, dropLogFileId));
                if (rows.length === 0) return null;
                return this.toEntity(rows[0]);
            }
        });
    }

    /**
     * 全件取得
     */
    public async findAll(): Promise<DropLogFile[]> {
        const client = this.drizzleOp.getDB();

        return await this.promieRetry.run(async () => {
            if (client.type === 'sqlite') {
                const { db, schema } = client;
                const rows = await db.select().from(schema.dropLogFiles);
                return rows.map(r => this.toEntity(r));
            } else {
                const { db, schema } = client;
                const rows = await db.select().from(schema.dropLogFiles);
                return rows.map(r => this.toEntity(r));
            }
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
