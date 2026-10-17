import { sql } from 'drizzle-orm';

/**
 * Drizzle ORM の SQLite / MySQL 方言差を吸収する共通ヘルパー
 */
export namespace DrizzleHelper {
    /**
     * INSERT 実行結果から auto-increment 生成された ID を取得する
     */
    export const getInsertId = (clientType: 'sqlite' | 'mysql', result: any): number => {
        if (clientType === 'sqlite') {
            return Number(result.lastInsertRowid);
        }
        if (Array.isArray(result)) {
            return Number(result[0]?.insertId);
        }
        return Number(result.insertId);
    };

    const PROGRAM_UPSERT_COLUMNS = [
        'updateTime',
        'channelId',
        'eventId',
        'serviceId',
        'networkId',
        'startAt',
        'endAt',
        'startHour',
        'week',
        'duration',
        'isFree',
        'name',
        'halfWidthName',
        'shortName',
        'description',
        'halfWidthDescription',
        'extended',
        'halfWidthExtended',
        'rawExtended',
        'rawHalfWidthExtended',
        'genre1',
        'subGenre1',
        'genre2',
        'subGenre2',
        'genre3',
        'subGenre3',
        'channelType',
        'channel',
        'videoType',
        'videoResolution',
        'videoStreamContent',
        'videoComponentType',
        'audioSamplingRate',
        'audioComponentType',
    ] as const;

    const sqliteProgramUpdateSet = Object.fromEntries(
        PROGRAM_UPSERT_COLUMNS.map(col => [col, sql.raw(`excluded.${col}`)]),
    );

    const mysqlProgramUpdateSet = Object.fromEntries(
        PROGRAM_UPSERT_COLUMNS.map(col => [col, sql.raw(`VALUES(\`${col}\`)`)]),
    );

    /**
     * 番組データをチャンク分割して SQLite / MySQL それぞれの構文で Bulk Upsert
     */
    export const upsertPrograms = async (
        clientType: 'sqlite' | 'mysql',
        dbOrTx: any,
        schema: any,
        rows: any[],
        chunkSize: number = 100,
    ): Promise<void> => {
        for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            if (chunk.length === 0) continue;

            if (clientType === 'sqlite') {
                await dbOrTx.insert(schema.programs).values(chunk).onConflictDoUpdate({
                    target: schema.programs.id,
                    set: sqliteProgramUpdateSet,
                });
            } else {
                await dbOrTx.insert(schema.programs).values(chunk).onDuplicateKeyUpdate({
                    set: mysqlProgramUpdateSet,
                });
            }
        }
    };

    /**
     * チャンネルデータを SQLite / MySQL それぞれの構文で Upsert
     */
    export const upsertChannels = async (
        clientType: 'sqlite' | 'mysql',
        dbOrTx: any,
        schema: any,
        channels: any[],
    ): Promise<void> => {
        for (const value of channels) {
            if (clientType === 'sqlite') {
                await dbOrTx.insert(schema.channels).values(value).onConflictDoUpdate({
                    target: schema.channels.id,
                    set: value,
                });
            } else {
                await dbOrTx.insert(schema.channels).values(value).onDuplicateKeyUpdate({
                    set: value,
                });
            }
        }
    };

    /**
     * 録画とタグのリレーションを SQLite (onConflictDoNothing) / MySQL (onDuplicateKeyUpdate) で関連付け
     */
    export const setTagRelation = async (
        clientType: 'sqlite' | 'mysql',
        dbOrTx: any,
        schema: any,
        recordedId: number,
        recordedTagId: number,
    ): Promise<void> => {
        if (clientType === 'sqlite') {
            await dbOrTx
                .insert(schema.recordedTagsRecordedTag)
                .values({
                    recordedId,
                    recordedTagId,
                })
                .onConflictDoNothing();
        } else {
            await dbOrTx
                .insert(schema.recordedTagsRecordedTag)
                .values({
                    recordedId,
                    recordedTagId,
                })
                .onDuplicateKeyUpdate({
                    set: { recordedId },
                });
        }
    };
}
