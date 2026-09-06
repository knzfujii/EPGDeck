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

    const sqliteProgramUpdateSet = {
        updateTime: sql`excluded.updateTime`,
        channelId: sql`excluded.channelId`,
        eventId: sql`excluded.eventId`,
        serviceId: sql`excluded.serviceId`,
        networkId: sql`excluded.networkId`,
        startAt: sql`excluded.startAt`,
        endAt: sql`excluded.endAt`,
        startHour: sql`excluded.startHour`,
        week: sql`excluded.week`,
        duration: sql`excluded.duration`,
        isFree: sql`excluded.isFree`,
        name: sql`excluded.name`,
        halfWidthName: sql`excluded.halfWidthName`,
        shortName: sql`excluded.shortName`,
        description: sql`excluded.description`,
        halfWidthDescription: sql`excluded.halfWidthDescription`,
        extended: sql`excluded.extended`,
        halfWidthExtended: sql`excluded.halfWidthExtended`,
        rawExtended: sql`excluded.rawExtended`,
        rawHalfWidthExtended: sql`excluded.rawHalfWidthExtended`,
        genre1: sql`excluded.genre1`,
        subGenre1: sql`excluded.subGenre1`,
        genre2: sql`excluded.genre2`,
        subGenre2: sql`excluded.subGenre2`,
        genre3: sql`excluded.genre3`,
        subGenre3: sql`excluded.subGenre3`,
        channelType: sql`excluded.channelType`,
        channel: sql`excluded.channel`,
        videoType: sql`excluded.videoType`,
        videoResolution: sql`excluded.videoResolution`,
        videoStreamContent: sql`excluded.videoStreamContent`,
        videoComponentType: sql`excluded.videoComponentType`,
        audioSamplingRate: sql`excluded.audioSamplingRate`,
        audioComponentType: sql`excluded.audioComponentType`,
    };

    const mysqlProgramUpdateSet = {
        updateTime: sql`VALUES(\`updateTime\`)`,
        channelId: sql`VALUES(\`channelId\`)`,
        eventId: sql`VALUES(\`eventId\`)`,
        serviceId: sql`VALUES(\`serviceId\`)`,
        networkId: sql`VALUES(\`networkId\`)`,
        startAt: sql`VALUES(\`startAt\`)`,
        endAt: sql`VALUES(\`endAt\`)`,
        startHour: sql`VALUES(\`startHour\`)`,
        week: sql`VALUES(\`week\`)`,
        duration: sql`VALUES(\`duration\`)`,
        isFree: sql`VALUES(\`isFree\`)`,
        name: sql`VALUES(\`name\`)`,
        halfWidthName: sql`VALUES(\`halfWidthName\`)`,
        shortName: sql`VALUES(\`shortName\`)`,
        description: sql`VALUES(\`description\`)`,
        halfWidthDescription: sql`VALUES(\`halfWidthDescription\`)`,
        extended: sql`VALUES(\`extended\`)`,
        halfWidthExtended: sql`VALUES(\`halfWidthExtended\`)`,
        rawExtended: sql`VALUES(\`rawExtended\`)`,
        rawHalfWidthExtended: sql`VALUES(\`rawHalfWidthExtended\`)`,
        genre1: sql`VALUES(\`genre1\`)`,
        subGenre1: sql`VALUES(\`subGenre1\`)`,
        genre2: sql`VALUES(\`genre2\`)`,
        subGenre2: sql`VALUES(\`subGenre2\`)`,
        genre3: sql`VALUES(\`genre3\`)`,
        subGenre3: sql`VALUES(\`subGenre3\`)`,
        channelType: sql`VALUES(\`channelType\`)`,
        channel: sql`VALUES(\`channel\`)`,
        videoType: sql`VALUES(\`videoType\`)`,
        videoResolution: sql`VALUES(\`videoResolution\`)`,
        videoStreamContent: sql`VALUES(\`videoStreamContent\`)`,
        videoComponentType: sql`VALUES(\`videoComponentType\`)`,
        audioSamplingRate: sql`VALUES(\`audioSamplingRate\`)`,
        audioComponentType: sql`VALUES(\`audioComponentType\`)`,
    };

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
