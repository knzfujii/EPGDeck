import * as child_process from 'child_process';
import * as path from 'path';
import container from './model/ModelContainer.js';
import * as containerSetter from './model/ModelContainerSetter.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

containerSetter.set(container);

/**
 * 初期処理
 */
const init = async () => {
    const config = container.configuration.getConfig();
    const logger = container.loggerModel;
    logger.initialize('Operator', config.log);

    const ipcServer = container.ipcServer;
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
    const connectionChecker = container.connectionCheckModel;
    // wait mirakurun
    await connectionChecker.checkMirakurun();

    // wait DB
    await connectionChecker.checkDB();
};

/**
 * Operator 機能起動処理
 */
const runOperator = async () => {
    const client = container.mirakurunClientModel.getClient();

    const eventSetter = container.eventSetter;
    eventSetter.set();

    const reservationManageModel = container.reservationManageModel;
    const recordingManager = container.recordingManageModel;

    const tuners = await client.getTuners();
    reservationManageModel.setTuners(tuners);
    recordingManager.setTuner(tuners);

    const storageManageModel = container.storageManageModel;
    storageManageModel.start();

    // 起動時に孤立・0件ドロップログファイルをバックグラウンドでクリーンアップ
    const recordedManageModel = container.recordedManageModel;
    void recordedManageModel.dropLogFileCleanup().catch(err => {
        const logger = container.loggerModel;
        logger.getLogger().system.error('initial dropLogFileCleanup failed');
        logger.getLogger().system.error(err);
    });
};

let serviceChild: child_process.ChildProcess | null = null;
let serviceRestartCount: number = 0;
let serviceStartTime: number = 0;
let serviceRestartTimer: NodeJS.Timeout | null = null;

const operatorShutdown = container.operatorShutdownModel;
operatorShutdown.setServiceRestartTimerClearer(() => {
    if (serviceRestartTimer !== null) {
        clearTimeout(serviceRestartTimer);
        serviceRestartTimer = null;
    }
});

process.on('SIGINT', () => void operatorShutdown.shutdown('SIGINT'));
process.on('SIGTERM', () => void operatorShutdown.shutdown('SIGTERM'));
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
    if (operatorShutdown.isShuttingDown()) {
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
    operatorShutdown.setServiceChild(child);

    // 終了したら再起動（バックオフ機構付き）
    const log = container.loggerModel.getLogger();
    const handleExit = () => {
        serviceChild = null;
        operatorShutdown.setServiceChild(null);
        if (operatorShutdown.isShuttingDown()) {
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
    const ipcServer = container.ipcServer;
    ipcServer.register(child);

    log.system.info(`start service pid: ${child.pid}`);

    // TODO ping pong
};

/**
 * クリーンアップ処理
 */
const cleanup = async () => {
    const reservationManageModel = container.reservationManageModel;
    const recordingManager = container.recordingManageModel;

    await recordingManager.cleanup();
    await reservationManageModel.cleanup();
};

/**
 * EPGUpdater 起動処理
 */
const runEPGUpdater = async () => {
    const epgUpdateExecutorManageModel = container.epgUpdateExecutorManageModel;
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
