import 'reflect-metadata';
import * as http from 'http';
import { getRequestListener } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';

// ==============================================================================
// E2E テスト専用の完全隔離環境（既存 config.yml / database.db には絶対に触らない）
// ==============================================================================
process.env.NODE_ENV = 'test';

import container from '../../src/model/ModelContainer';
import * as containerSetter from '../../src/model/ModelContainerSetter';
import IConfiguration from '../../src/model/IConfiguration';
import ILoggerModel from '../../src/model/ILoggerModel';
import IDrizzleOperator from '../../src/model/db/IDrizzleOperator';
import IIPCClient from '../../src/model/ipc/IIPCClient';
import IMirakurunClientModel from '../../src/model/IMirakurunClientModel';
import MockIPCClient from './MockIPCClient';
import MockMirakurunClientModel from './MockMirakurunClientModel';
import { createHonoApp } from '../../src/model/service/hono/createHonoApp';

// DI コンテナの初期化
containerSetter.set(container);

// IPC クライアントおよび Mirakurun クライアントを安全なモックにリバインド（完全密閉 E2E テスト環境）
container.rebind<IIPCClient>('IIPCClient').to(MockIPCClient).inSingletonScope();
container.rebind<IMirakurunClientModel>('IMirakurunClientModel').to(MockMirakurunClientModel).inSingletonScope();

const configModel = container.get<IConfiguration>('IConfiguration');
const config = configModel.getConfig();

const loggerModel = container.get<ILoggerModel>('ILoggerModel');
loggerModel.initialize('Service', config.log);
const log = loggerModel.getLogger();

// DB テーブルの初期化
const drizzleOp = container.get<IDrizzleOperator>('IDrizzleOperator');

async function main() {
    await drizzleOp.checkConnection();

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
        console.log(`[E2E Server] Listening on http://localhost:${port} (NODE_ENV=test)`);
    });

    const cleanupAndExit = async () => {
        io.close();
        server.close();
        await drizzleOp.closeConnection();
        process.exit(0);
    };

    process.on('SIGTERM', cleanupAndExit);
    process.on('SIGINT', cleanupAndExit);
}

main().catch(err => {
    console.error('Failed to start E2E Server:', err);
    process.exit(1);
});
