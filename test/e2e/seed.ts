import { createDrizzleClient } from '../../src/db/drizzle';
import { channels } from '../../src/db/schema/sqlite/channels';

export async function seedTestData(): Promise<void> {
    process.env.NODE_ENV = 'test';
    const client = createDrizzleClient({ database: { type: 'sqlite' } } as any);
    if (client.type !== 'sqlite') {
        return;
    }

    // channel テーブルを作成（存在しない場合）
    await client.rawClient.execute(`CREATE TABLE IF NOT EXISTS channel (
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
    )`);

    const existing = await client.db.select().from(channels);
    if (existing.length === 0) {
        await client.db.insert(channels).values([
            {
                id: 1,
                serviceId: 1024,
                networkId: 32736,
                name: 'NHK総合1',
                halfWidthName: 'NHK総合1',
                channelTypeId: 1,
                channelType: 'GR',
                channel: '27',
                hasLogoData: false,
            },
            {
                id: 2,
                serviceId: 101,
                networkId: 4,
                name: 'NHK BS',
                halfWidthName: 'NHK BS',
                channelTypeId: 2,
                channelType: 'BS',
                channel: 'BS15_0',
                hasLogoData: false,
            },
        ]);
    }
}
