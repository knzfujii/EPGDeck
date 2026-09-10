import * as child_process from 'child_process';
import * as path from 'path';
import 'reflect-metadata';
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
let serviceRestartCount: number = 0;
let serviceStartTime: number = 0;
let serviceRestartTimer: NodeJS.Timeout | null = null;

const shutdown = async (signal: string) => {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;

    if (serviceRestartTimer !== null) {
        clearTimeout(serviceRestartTimer);
        serviceRestartTimer = null;
    }

    try {
        const log = container.get<ILoggerModel>('ILoggerModel').getLogger();
        log.system.info(`received ${signal}, shutting down gracefully...`);
    } catch {
        // ignore
    }

    if (serviceChild !== null) {
        const targetChild = serviceChild;
        serviceChild = null;
        targetChild.removeAllListeners();

        try {
            targetChild.kill('SIGTERM');
        } catch {
            // ignore
        }

        // 子プロセスのクリーン終了を最大 5 秒待つ
        await new Promise<void>(resolve => {
            const timeout = setTimeout(() => {
                try {
                    targetChild.kill('SIGKILL');
                } catch {
                    // ignore
                }
                resolve();
            }, 5000);

            targetChild.once('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
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

    serviceStartTime = Date.now();
    const child = child_process.spawn(
        process.argv[0],
        [...process.execArgv, path.join(__dirname, 'model', 'service', 'ServiceExecutor.js')],
        {
            stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        },
    );
    serviceChild = child;

    // 終了したら再起動（バックオフ機構付き）
    const log = container.get<ILoggerModel>('ILoggerModel').getLogger();
    const handleExit = () => {
        serviceChild = null;
        if (isShuttingDown) {
            return;
        }

        // 60秒以上安定稼働していたら連続クラッシュ回数をリセット
        if (Date.now() - serviceStartTime > 60 * 1000) {
            serviceRestartCount = 0;
        }

        serviceRestartCount++;
        // 指数バックオフ: 1秒, 2秒, 4秒... 最大30秒
        const delay = Math.min(1000 * Math.pow(2, serviceRestartCount - 1), 30000);

        log.system.fatal(`service process is down. restarting in ${delay}ms (retry count: ${serviceRestartCount})...`);

        serviceRestartTimer = setTimeout(() => {
            serviceRestartTimer = null;
            void runService();
        }, delay);
    };

    child.once('exit', handleExit);
    child.once('error', handleExit);

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
    await epgUpdateExecutorManageModel.execute();
};

void (async () => {
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
