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
    fs.mkdirSync(path.join(e2eDataDir, 'recorded'), { recursive: true });
    fs.mkdirSync(path.join(e2eDataDir, 'thumbnail'), { recursive: true });
    fs.mkdirSync(path.join(e2eDataDir, 'drop'), { recursive: true });
    fs.mkdirSync(path.join(e2eDataDir, 'upload'), { recursive: true });

    // 初期シードデータを投入
    await seedTestData();
}
