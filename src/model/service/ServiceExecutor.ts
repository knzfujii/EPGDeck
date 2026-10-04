import container from '../ModelContainer.js';
import * as containerSetter from '../ModelContainerSetter.js';

containerSetter.set(container);

const config = container.configuration.getConfig();
const loggerModel = container.loggerModel;
loggerModel.initialize('Service', config.log);

// IPCClient を取得してメッセージ受信開始
void container.ipcClient;

const log = loggerModel.getLogger();
process.on('uncaughtException', err => {
    log.system.fatal(`uncaughtException: ${err}`);
});

process.on('unhandledRejection', err => {
    log.system.fatal(`unhandledRejection: ${err}`);
});

let isExiting = false;
const cleanExit = async (reason: string) => {
    if (isExiting) {
        return;
    }
    isExiting = true;
    log.system.info(`ServiceExecutor is exiting (${reason}). cleaning up child processes...`);

    try {
        if (container.isBound('IStreamManageModel')) {
            const streamManage = container.streamManageModel;
            await streamManage.stopAll();
        }
    } catch (err: any) {
        log.system.error(`failed to stop all streams: ${err?.message || err}`);
    }

    try {
        if (container.isBound('IEncodeProcessManageModel')) {
            const encodeProcessManage = container.encodeProcessManageModel;
            await encodeProcessManage.killAll();
        }
    } catch (err: any) {
        log.system.error(`failed to kill all encode processes: ${err?.message || err}`);
    }

    try {
        await loggerModel.close();
    } catch {
        // ignore
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

const encodeFinishModel = container.encodeFinishModel;
encodeFinishModel.set();

const serviceServer = container.serviceServer;
try {
    serviceServer.start();
} catch (err: any) {
    log.system.fatal(err);
    process.exit(1);
}
