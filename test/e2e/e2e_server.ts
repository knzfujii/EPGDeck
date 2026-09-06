import 'reflect-metadata';
import * as fs from 'fs';
import * as http from 'http';
import { getRequestListener } from '@hono/node-server';
import { Server as SocketIOServer } from 'socket.io';

// 親プロセス（Operator）が存在しないテスト環境向けの IPC モック
if (typeof process.send === 'undefined') {
    (process as any).send = (msg: any) => {
        process.nextTick(() => {
            if (msg && typeof msg.id !== 'undefined') {
                process.emit('message' as any, {
                    id: msg.id,
                    result: [],
                } as any);
            }
        });
        return true;
    };
}

import * as path from 'path';

// 設定ファイル（config.yml）が存在しないテスト環境（CI等）向けのフォールバック作成
const configDir = path.join(__dirname, '..', '..', 'config');
const configPath = path.join(configDir, 'config.yml');
const templatePath = path.join(configDir, 'config.yml.template');
let createdTempConfig = false;

if (!fs.existsSync(configPath) && fs.existsSync(templatePath)) {
    let template = fs.readFileSync(templatePath, 'utf-8');
    // E2E 用ポート 8889 に変更
    template = template.replace(/port:\s*\d+/, 'port: 8889');
    fs.writeFileSync(configPath, template);
    createdTempConfig = true;
}

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

// ディレクトリの事前作成
for (const dir of config.recording.directories) {
    if (!fs.existsSync(dir.path)) {
        fs.mkdirSync(dir.path, { recursive: true });
    }
}
if (config.recording.uploadTempDir && !fs.existsSync(config.recording.uploadTempDir)) {
    fs.mkdirSync(config.recording.uploadTempDir, { recursive: true });
}

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

    const port = 8889;
    config.server.port = port;
    server.listen(port, () => {
        console.log(`[E2E Server] Listening on http://localhost:${port}`);
    });

    const cleanupAndExit = async () => {
        io.close();
        server.close();
        await drizzleOp.closeConnection();
        if (createdTempConfig && fs.existsSync(configPath)) {
            try {
                fs.unlinkSync(configPath);
            } catch (_) {}
        }
        process.exit(0);
    };

    process.on('SIGTERM', cleanupAndExit);
    process.on('SIGINT', cleanupAndExit);
}

main().catch(err => {
    console.error('Failed to start E2E Server:', err);
    process.exit(1);
});
