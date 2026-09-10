import * as child_process from 'child_process';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import IEPGUpdateEvent from '../event/IEPGUpdateEvent';
import IIPCServer from '../ipc/IIPCServer';
import ILogger from '../ILogger';
import ILoggerModel from '../ILoggerModel';
import IEPGUpdateExecutorManageModel from './IEPGUpdateExecutorManageModel';

@injectable()
export default class EPGUpdateExecutorManageModel implements IEPGUpdateExecutorManageModel {
    private log: ILogger;
    private epgUpdateEvent: IEPGUpdateEvent;
    private ipcServer: IIPCServer;
    private currentExecutor: child_process.ChildProcess | null = null;
    private isShuttingDown: boolean = false;
    private restartCount: number = 0;
    private lastStartTime: number = 0;
    private restartTimer: NodeJS.Timeout | null = null;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IEPGUpdateEvent') epgUpdateEvent: IEPGUpdateEvent,
        @inject('IIPCServer') ipcServer: IIPCServer,
    ) {
        this.log = logger.getLogger();
        this.epgUpdateEvent = epgUpdateEvent;
        this.ipcServer = ipcServer;

        const onShutdown = () => {
            this.isShuttingDown = true;
            if (this.restartTimer !== null) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
            if (this.currentExecutor !== null) {
                this.currentExecutor.removeAllListeners();
                try {
                    this.currentExecutor.kill('SIGTERM');
                } catch {
                    // ignore
                }
                this.currentExecutor = null;
            }
        };

        process.on('SIGINT', onShutdown);
        process.on('SIGTERM', onShutdown);
        process.on('exit', onShutdown);
    }

    /**
     * EPGUpdateExecutor を実行する
     */
    public async execute(): Promise<void> {
        if (this.isShuttingDown) {
            return;
        }

        this.lastStartTime = Date.now();
        const executor = child_process.spawn(
            process.argv[0],
            [...process.execArgv, path.join(__dirname, 'EPGUpdateExecutor.js')],
            {
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            },
        );
        this.currentExecutor = executor;

        this.log.system.info(`start epg updater pid: ${executor.pid}`);

        // epg 更新完了 & ログ受信
        executor.on('message', msg => {
            if ((<any>msg).msg === 'updated') {
                // epg 更新完了イベントを発行
                this.epgUpdateEvent.emitUpdated();
            } else if ((<any>msg).msg === 'log' && (<any>msg).entry) {
                this.ipcServer.pushLog((<any>msg).entry);
            }
        });
        /**
         * エラー処理
         */
        executor.once('exit', () => {
            this.currentExecutor = null;
            if (this.isShuttingDown) {
                return;
            }
            this.log.system.fatal('epg updater is abort');
            this.restart(executor);
        });
        executor.once('disconnect', () => {
            this.currentExecutor = null;
            if (this.isShuttingDown) {
                return;
            }
            this.log.system.fatal('epg updater is disconnected');
            try {
                executor.kill('SIGINT');
            } catch {
                // ignore
            }
            this.restart(executor);
        });
        executor.once('close', () => {
            this.currentExecutor = null;
            if (this.isShuttingDown) {
                return;
            }
            this.log.system.fatal('epg update is closed');
            this.restart(executor);
        });
        executor.once('error', err => {
            this.currentExecutor = null;
            if (this.isShuttingDown) {
                return;
            }
            this.log.system.fatal('epg updater is error');
            this.log.system.error(err);
            this.restart(executor);
        });

        // buffer が埋まらないようにする
        if (executor.stdout !== null) {
            executor.stdout.on('data', () => {});
        }
        if (executor.stderr !== null) {
            executor.stderr.on('data', () => {});
        }

        // TODO ping pong
    }

    /**
     * executor 再スタート
     * @param executor child_process.ChildProcess
     */
    private restart(executor: child_process.ChildProcess): void {
        if (this.isShuttingDown) {
            return;
        }

        executor.removeAllListeners();
        if (executor.stdout !== null) {
            executor.stdout.removeAllListeners();
        }
        if (executor.stderr !== null) {
            executor.stderr.removeAllListeners();
        }

        // 60秒以上安定稼働していたらリトライ回数をリセット
        if (Date.now() - this.lastStartTime > 60 * 1000) {
            this.restartCount = 0;
        }

        this.restartCount++;
        const delay = Math.min(1000 * Math.pow(2, this.restartCount - 1), 30000);

        this.log.system.warn(`epg updater will restart in ${delay}ms (retry count: ${this.restartCount})...`);

        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            this.execute().catch(err => {
                this.log.system.error('failed to restart epg updater');
                this.log.system.error(err);
            });
        }, delay);
    }
}
