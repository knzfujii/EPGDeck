import 'reflect-metadata';
import { install } from 'source-map-support';
import IConfiguration from '../IConfiguration';
import ILoggerModel from '../ILoggerModel';
import container from '../ModelContainer';
import * as containerSetter from '../ModelContainerSetter';
import IEPGUpdater from './IEPGUpdater';

install();

containerSetter.set(container);

const config = container.get<IConfiguration>('IConfiguration').getConfig();
const loggerModel = container.get<ILoggerModel>('ILoggerModel');
loggerModel.initialize('EPGUpdater', config.log);

loggerModel.onLog(entry => {
    if (typeof process.send !== 'undefined') {
        try {
            process.send({ msg: 'log', entry });
        } catch {
            // ignore
        }
    }
});

const log = loggerModel.getLogger();
process.on('uncaughtException', err => {
    log.system.fatal(`uncaughtException: ${err}`);
});

process.on('unhandledRejection', err => {
    log.system.fatal(`unhandledRejection: ${err}`);
});

// 親プロセス（Operator）が終了・切断されたら自プロセスも即座にクリーン終了する（バックグラウンド残存防止）
process.on('disconnect', () => {
    log.system.info('parent process disconnected, exiting EPGUpdateExecutor');
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});

process.on('SIGINT', () => {
    process.exit(0);
});

const updater = container.get<IEPGUpdater>('IEPGUpdater');

(async () => {
    // 初回更新 or event stream 更新時にエラーが発生する
    await updater.start().catch(() => {
        process.exit(1);
    });
})();
