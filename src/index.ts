import * as child_process from 'child_process';
import * as path from 'path';
import 'reflect-metadata';
import { install } from 'source-map-support';
import IEPGUpdateExecutorManageModel from './model/epgUpdater/IEPGUpdateExecutorManageModel';
import IEventSetter from './model/event/IEventSetter';
import IConfiguration from './model/IConfiguration';
import IConnectionCheckModel from './model/IConnectionCheckModel';
import ILoggerModel from './model/ILoggerModel';
import IMirakurunClientModel from './model/IMirakurunClientModel';
import IIPCServer from './model/ipc/IIPCServer';
import container from './model/ModelContainer';
import * as containerSetter from './model/ModelContainerSetter';
import IRecordingManageModel from './model/operator/recording/IRecordingManageModel';
import IReservationManageModel from './model/operator/reservation/IReservationManageModel';
import IStorageManageModel from './model/operator/storage/IStorageManageModel';
install();

containerSetter.set(container);

/**
 * 初期処理
 */
const init = async () => {
    const config = container.get<IConfiguration>('IConfiguration').getConfig();
    const logger = container.get<ILoggerModel>('ILoggerModel');
    logger.initialize('Operator', config.log);

    const ipcServer = container.get<IIPCServer>('IIPCServer');
    logger.onLog(entry => {
        ipcServer.pushLog(entry);
    });

    const log = logger.getLogger();
    process.on('uncaughtException', err => {
        log.system.fatal(`uncaughtException: ${err.message}`);
        log.system.fatal(err);
    });

    process.on('unhandledRejection', err => {
        log.system.fatal('unhandledRejection');
        log.system.fatal(err);
    });

    // set uid & gid
    if (process.platform !== 'win32' && typeof process.getuid !== 'undefined' && process.getuid() === 0) {
        // gid
        if (typeof process.setgid !== 'undefined') {
            if (typeof config.server.gid === 'string' || typeof config.server.gid === 'number') {
                process.setgid(config.server.gid);
            } else {
                process.setgid('video');
            }
        }

        // uid
        if (typeof process.setuid !== 'undefined') {
            if (typeof config.server.uid === 'string' || typeof config.server.uid === 'number') {
                process.setuid(config.server.uid);
            }
        }
    }

    // 接続確認
    const connectionChecker = container.get<IConnectionCheckModel>('IConnectionCheckModel');
    // wait mirakurun
    await connectionChecker.checkMirakurun();

    // wait DB
    await connectionChecker.checkDB();
};

/**
 * Operator 機能起動処理
 */
const runOperator = async () => {
    const client = container.get<IMirakurunClientModel>('IMirakurunClientModel').getClient();

    const eventSetter = container.get<IEventSetter>('IEventSetter');
    eventSetter.set();

    const reservationManageModel = container.get<IReservationManageModel>('IReservationManageModel');
    const recordingManager = container.get<IRecordingManageModel>('IRecordingManageModel');

    const tuners = await client.getTuners();
    reservationManageModel.setTuners(tuners);
    recordingManager.setTuner(tuners);

    const storageManageModel = container.get<IStorageManageModel>('IStorageManageModel');
    storageManageModel.start();
};

let serviceChild: child_process.ChildProcess | null = null;
let isShuttingDown: boolean = false;

const shutdown = (signal: string) => {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    try {
        const log = container.get<ILoggerModel>('ILoggerModel').getLogger();
        log.system.info(`received ${signal}, shutting down gracefully...`);
    } catch {
        // ignore
    }

    if (serviceChild !== null) {
        serviceChild.removeAllListeners();
        try {
            serviceChild.kill('SIGTERM');
        } catch {
            // ignore
        }
        serviceChild = null;
    }

    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => {
    if (serviceChild !== null) {
        serviceChild.removeAllListeners();
        try {
            serviceChild.kill('SIGTERM');
        } catch {
            // ignore
        }
        serviceChild = null;
    }
});

/**
 * Service 起動処理
 */
const runService = async () => {
    if (isShuttingDown) {
        return;
    }

    const child = child_process.spawn(
        process.argv[0],
        [path.join(__dirname, 'model', 'service', 'ServiceExecutor.js')],
        {
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        },
    );
    serviceChild = child;

    // 終了したら再起動
    const log = container.get<ILoggerModel>('ILoggerModel').getLogger();
    child.once('exit', () => {
        serviceChild = null;
        if (isShuttingDown) {
            return;
        }
        log.system.fatal('service process is down');
        log.system.fatal('restart service');
        runService();
    });
    child.once('error', () => {
        serviceChild = null;
        if (isShuttingDown) {
            return;
        }
        runService();
    });

    // buffer が埋まらないようにする
    if (child.stdout !== null) {
        child.stdout.on('data', () => {});
    }
    if (child.stderr !== null) {
        child.stderr.on('data', () => {});
    }

    // IPC 通信設定
    const ipcServer = container.get<IIPCServer>('IIPCServer');
    ipcServer.register(child);

    log.system.info(`start service pid: ${child.pid}`);

    // TODO ping pong
};

/**
 * クリーンアップ処理
 */
const cleanup = async () => {
    const reservationManageModel = container.get<IReservationManageModel>('IReservationManageModel');
    const recordingManager = container.get<IRecordingManageModel>('IRecordingManageModel');

    await recordingManager.cleanup();
    await reservationManageModel.cleanup();
};

/**
 * EPGUpdater 起動処理
 */
const runEPGUpdater = async () => {
    const epgUpdateExecutorManageModel = container.get<IEPGUpdateExecutorManageModel>('IEPGUpdateExecutorManageModel');
    epgUpdateExecutorManageModel.execute();
};

(async () => {
    try {
        await init();
    } catch (err: any) {
        console.error('initialize error');
        console.error(err);
        process.exit(1);
    }

    await runOperator();

    await runService();

    await cleanup();

    await runEPGUpdater();
})();
