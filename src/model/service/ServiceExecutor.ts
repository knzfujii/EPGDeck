import 'reflect-metadata';
import { install } from 'source-map-support';
import IConfiguration from '../IConfiguration';
import IIPCClient from '../ipc/IIPCClient';
import ILoggerModel from '../ILoggerModel';
import container from '../ModelContainer';
import * as containerSetter from '../ModelContainerSetter';
import IEncodeFinishModel from './encode/IEncodeFinishModel';
import IServiceServer from './IServiceServer';
install();

containerSetter.set(container);

const config = container.get<IConfiguration>('IConfiguration').getConfig();
const loggerModel = container.get<ILoggerModel>('ILoggerModel');
loggerModel.initialize('Service', config.log);

// IPCClient を取得してメッセージ受信開始
container.get<IIPCClient>('IIPCClient');

const log = loggerModel.getLogger();
process.on('uncaughtException', err => {
    log.system.fatal(`uncaughtException: ${err}`);
});

process.on('unhandledRejection', err => {
    log.system.fatal(`unhandledRejection: ${err}`);
});

// 親プロセス（Operator）が終了・切断されたら自プロセスも即座にクリーン終了する（バックグラウンド残存防止）
process.on('disconnect', () => {
    log.system.info('parent process disconnected, exiting ServiceExecutor');
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});

const encodeFinishModel = container.get<IEncodeFinishModel>('IEncodeFinishModel');
encodeFinishModel.set();

const serviceServer = container.get<IServiceServer>('IServiceServer');
try {
    serviceServer.start();
} catch (err: any) {
    log.system.fatal(err);
    process.exit(1);
}
