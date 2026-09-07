import * as fs from 'fs';
import * as path from 'path';
import { seedTestData } from './seed';

export default async function globalSetup(): Promise<void> {
    process.env.NODE_ENV = 'test';

    const appRootPath = path.join(__dirname, '..', '..');
    const testDbPath = path.join(appRootPath, 'data', 'test_e2e.db');
    const e2eDataDir = path.join(appRootPath, 'data', 'test_e2e_env');

    // テスト残骸をクリーンアップ
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

    // 初期シードデータを投入
    await seedTestData();

    // クライアント静的ファイル（client/dist）の存在確認（ローカル未ビルド時は自動ビルド）
    const clientIndexHtml = path.join(appRootPath, 'client', 'dist', 'index.html');
    if (!fs.existsSync(clientIndexHtml)) {
        console.log('[E2E Setup] Client bundle not found. Building client for E2E tests...');
        const { execSync } = await import('child_process');
        execSync('npm --prefix client run build', { stdio: 'inherit' });
    }
}
