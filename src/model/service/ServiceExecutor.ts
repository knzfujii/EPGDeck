import 'reflect-metadata';
import IConfiguration from '../IConfiguration';
import IIPCClient from '../ipc/IIPCClient';
import ILoggerModel from '../ILoggerModel';
import container from '../ModelContainer';
import * as containerSetter from '../ModelContainerSetter';
import IEncodeFinishModel from './encode/IEncodeFinishModel';
import IServiceServer from './IServiceServer';

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

import IEncodeProcessManageModel from './encode/IEncodeProcessManageModel';
import IStreamManageModel from './stream/manager/IStreamManageModel';

let isExiting = false;
const cleanExit = async (reason: string) => {
    if (isExiting) {
        return;
    }
    isExiting = true;
    log.system.info(`ServiceExecutor is exiting (${reason}). cleaning up child processes...`);

    try {
        if (container.isBound('IStreamManageModel')) {
            const streamManage = container.get<IStreamManageModel>('IStreamManageModel');
            await streamManage.stopAll();
        }
    } catch (err: any) {
        log.system.error(`failed to stop all streams: ${err?.message || err}`);
    }

    try {
        if (container.isBound('IEncodeProcessManageModel')) {
            const encodeProcessManage = container.get<IEncodeProcessManageModel>('IEncodeProcessManageModel');
            await encodeProcessManage.killAll();
        }
    } catch (err: any) {
        log.system.error(`failed to kill all encode processes: ${err?.message || err}`);
    }

    process.exit(0);
};

// 親プロセス（Operator）が終了・切断されたら自プロセスも即座にクリーン終了する（バックグラウンド残存防止）
process.on('disconnect', () => {
    void cleanExit('disconnect');
});

process.on('SIGTERM', () => {
    void cleanExit('SIGTERM');
});

process.on('SIGINT', () => {
    void cleanExit('SIGINT');
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
