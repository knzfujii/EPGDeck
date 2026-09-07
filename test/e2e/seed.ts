import * as fs from 'fs';
import * as path from 'path';
import { createDrizzleClient } from '../../src/db/drizzle';
import { channels } from '../../src/db/schema/sqlite/channels';

export async function seedTestData(): Promise<void> {
    process.env.NODE_ENV = 'test';

    const appRootPath = path.join(__dirname, '..', '..');
    const testDbPath = path.join(appRootPath, 'data', 'test_e2e.db');
    const e2eDataDir = path.join(appRootPath, 'data', 'test_e2e_env');

    // 1. テスト残骸のクリーンアップ
    const files = [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`];
    for (const file of files) {
        if (fs.existsSync(file)) {
            try {
                fs.unlinkSync(file);
            } catch (_) {}
        }
    }
    if (fs.existsSync(e2eDataDir)) {
        try {
            fs.rmSync(e2eDataDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // 2. クライアント静的ファイル（client/dist）の存在確認（未ビルド時は自動ビルド）
    const clientIndexHtml = path.join(appRootPath, 'client', 'dist', 'index.html');
    if (!fs.existsSync(clientIndexHtml)) {
        console.log('[E2E Seed] Client bundle not found. Building client for E2E tests...');
        const { execSync } = await import('child_process');
        execSync('npm --prefix client run build', { stdio: 'inherit' });
    }

    // 3. テスト初期シードの投入
    const client = createDrizzleClient({ database: { type: 'sqlite' } } as any);
    if (client.type !== 'sqlite') {
        return;
    }

    try {
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
        console.log('[E2E Seed] Initial test data seeded successfully.');
    } finally {
        // コネクションをクローズして WAL をフラッシュし、ファイルロックを確実に解放
        client.rawClient.close();
    }
}

// 直接実行された場合はシードを実行
if (require.main === module) {
    seedTestData().catch(err => {
        console.error('[E2E Seed] Failed to seed test data:', err);
        process.exit(1);
    });
}

