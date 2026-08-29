import * as path from 'path';
import 'reflect-metadata';
import { install } from 'source-map-support';
import ILoggerModel from '../ILoggerModel';
import container from '../ModelContainer';
import * as containerSetter from '../ModelContainerSetter';
import IEncodeFinishModel from './encode/IEncodeFinishModel';
import IServiceServer from './IServiceServer';
install();

containerSetter.set(container);

const loggerModel = container.get<ILoggerModel>('ILoggerModel');
loggerModel.initialize(path.join(__dirname, '..', '..', '..', 'config', 'serviceLogConfig.yml'));

const log = loggerModel.getLogger();
process.on('uncaughtException', err => {
    log.system.fatal(`uncaughtException: ${err}`);
});

process.on('unhandledRejection', err => {
    log.system.fatal(`unhandledRejection: ${err}`);
});

// 親プロセス（Operator）が終了・切断されたら自プロセスも即座にクリーン終了する（孤児化防止）
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
