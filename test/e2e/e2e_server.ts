import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { getRequestListener } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';

// 親プロセス（Operator）が存在しないテスト環境向けの IPC モック
if (typeof process.send === 'undefined') {
    (process as any).send = (msg: any) => {
        process.nextTick(() => {
            if (msg && typeof msg.id !== 'undefined') {
                process.emit(
                    'message' as any,
                    {
                        id: msg.id,
                        result: [],
                    } as any,
                );
            }
        });
        return true;
    };
}

// ==============================================================================
// E2E テスト専用の完全隔離環境（既存 config.yml / database.db には絶対に触らない）
// ==============================================================================
process.env.NODE_ENV = 'test';

const appRootPath = path.join(__dirname, '..', '..');
const testDbPath = path.join(appRootPath, 'data', 'test_e2e.db');
const e2eDataDir = path.join(appRootPath, 'data', 'test_e2e_env');

const cleanupTestArtifacts = () => {
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
};

// 起動前に前回のテスト残骸があれば確実にクリーンアップ
cleanupTestArtifacts();

import container from '../../src/model/ModelContainer';
import * as containerSetter from '../../src/model/ModelContainerSetter';
import IConfiguration from '../../src/model/IConfiguration';
import ILoggerModel from '../../src/model/ILoggerModel';
import IChannelDB from '../../src/model/db/IChannelDB';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator';
import { createHonoApp } from '../../src/model/service/hono/createHonoApp';

// DI コンテナの初期化
containerSetter.set(container);

const configModel = container.get<IConfiguration>('IConfiguration');
const config = configModel.getConfig();

const loggerModel = container.get<ILoggerModel>('ILoggerModel');
loggerModel.initialize('Service', config.log);
const log = loggerModel.getLogger();

// DB テーブルの初期化
const drizzleOp = container.get<IDrizzleOperator>('IDrizzleOperator');

async function main() {
    await drizzleOp.checkConnection();

    // E2E テスト用のダミーチャンネルを投入（クリーン環境対策）
    const channelDb = container.get<IChannelDB>('IChannelDB');
    const existingChannels = await channelDb.findAll();
    if (existingChannels.length === 0) {
        await channelDb.insert([
            {
                id: 1,
                serviceId: 1024,
                networkId: 32736,
                name: 'NHK総合1',
                type: 1,
                channel: {
                    type: 'GR',
                    channel: '27',
                },
            } as any,
            {
                id: 2,
                serviceId: 101,
                networkId: 4,
                name: 'NHK BS',
                type: 1,
                channel: {
                    type: 'BS',
                    channel: 'BS15_0',
                },
            } as any,
        ]);
    }

    const honoApp = createHonoApp(config, log);
    const requestListener = getRequestListener(honoApp.fetch);
    const server = http.createServer(requestListener);

    // WebSocket / socket.io サーバーをアタッチ
    const io = new SocketIOServer(server, {
        cors: { origin: '*' },
    });

    io.on('connection', () => {
        // クライアント接続を受け入れ
    });

    const port = config.server.port || 18889;
    server.listen(port, () => {
        console.log(`[E2E Server] Listening on http://localhost:${port} (NODE_ENV=test, DB: ${testDbPath})`);
    });

    const cleanupAndExit = async () => {
        io.close();
        server.close();
        await drizzleOp.closeConnection();
        cleanupTestArtifacts();
        process.exit(0);
    };

    process.on('SIGTERM', cleanupAndExit);
    process.on('SIGINT', cleanupAndExit);
}

main().catch(err => {
    console.error('Failed to start E2E Server:', err);
    process.exit(1);
});
