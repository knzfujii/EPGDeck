import * as child_process from 'child_process';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import IEPGUpdateEvent from '../event/IEPGUpdateEvent';
import ILogger from '../ILogger';
import ILoggerModel from '../ILoggerModel';
import IEPGUpdateExecutorManageModel from './IEPGUpdateExecutorManageModel';

@injectable()
export default class EPGUpdateExecutorManageModel implements IEPGUpdateExecutorManageModel {
    private log: ILogger;
    private epgUpdateEvent: IEPGUpdateEvent;
    private currentExecutor: child_process.ChildProcess | null = null;
    private isShuttingDown: boolean = false;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IEPGUpdateEvent') epgUpdateEvent: IEPGUpdateEvent,
    ) {
        this.log = logger.getLogger();
        this.epgUpdateEvent = epgUpdateEvent;

        const onShutdown = () => {
            this.isShuttingDown = true;
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

        const executor = child_process.spawn(process.argv[0], [path.join(__dirname, 'EPGUpdateExecutor.js')], {
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        this.currentExecutor = executor;

        this.log.system.info(`start epg updater pid: ${executor.pid}`);

        // epg 更新完了
        executor.on('message', msg => {
            if ((<any>msg).msg === 'updated') {
                // epg 更新完了イベントを発行
                this.epgUpdateEvent.emitUpdated();
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

        // restart
        this.execute();
    }
}
