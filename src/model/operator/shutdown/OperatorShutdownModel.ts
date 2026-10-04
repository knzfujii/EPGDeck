import * as child_process from 'child_process';
import IDrizzleOperator from '../../db/IDrizzleOperator.js';
import ILogger from '../../ILogger.js';
import ILoggerModel from '../../ILoggerModel.js';
import IRecordingManageModel from '../recording/IRecordingManageModel.js';
import IStorageManageModel from '../storage/IStorageManageModel.js';
import IOperatorShutdownModel from './IOperatorShutdownModel.js';

export default class OperatorShutdownModel implements IOperatorShutdownModel {
    private log: ILogger;
    private loggerModel: ILoggerModel;
    private storageManageModel: IStorageManageModel;
    private recordingManageModel: IRecordingManageModel;
    private drizzleOperator: IDrizzleOperator;

    private _isShuttingDown: boolean = false;
    private serviceChild: child_process.ChildProcess | null = null;
    private serviceRestartTimerClearer: (() => void) | null = null;

    public exitHandler: (code: number) => void = code => process.exit(code);
    public serviceChildTimeoutMs: number = 5000;
    public stopAllTimeoutMs: number = 10000;

    constructor(
        logger: ILoggerModel,
        storageManageModel: IStorageManageModel,
        recordingManageModel: IRecordingManageModel,
        drizzleOperator: IDrizzleOperator,
    ) {
        this.log = logger.getLogger();
        this.loggerModel = logger;
        this.storageManageModel = storageManageModel;
        this.recordingManageModel = recordingManageModel;
        this.drizzleOperator = drizzleOperator;
    }

    public setServiceChild(child: child_process.ChildProcess | null): void {
        this.serviceChild = child;
    }

    public setServiceRestartTimerClearer(clearer: () => void): void {
        this.serviceRestartTimerClearer = clearer;
    }

    public isShuttingDown(): boolean {
        return this._isShuttingDown;
    }

    public async shutdown(signal: string): Promise<void> {
        if (this._isShuttingDown) {
            try {
                this.log.system.warn(`received second ${signal}, forcing immediate exit...`);
            } catch {
                // ignore
            }
            this.exitHandler(1);
            return;
        }
        this._isShuttingDown = true;

        if (this.serviceRestartTimerClearer !== null) {
            try {
                this.serviceRestartTimerClearer();
            } catch (err: any) {
                this.log.system.error('error clearing serviceRestartTimer:');
                this.log.system.error(err);
            }
        }

        try {
            this.log.system.info(`received ${signal}, shutting down gracefully...`);
        } catch {
            // ignore
        }

        // 1. StorageManageModel の定期チェックを停止
        try {
            this.storageManageModel.stop();
        } catch (err: any) {
            this.log.system.error('failed to stop storageManageModel:');
            this.log.system.error(err);
        }

        // 2. Service 子プロセスの停止（SIGTERM送信）
        const serviceChildPromise = (async () => {
            const child = this.serviceChild;
            this.serviceChild = null;

            if (child !== null) {
                child.removeAllListeners();

                // 既に終了している場合は待機不要
                if (child.exitCode !== null || child.signalCode !== null) {
                    return;
                }

                try {
                    child.kill('SIGTERM');
                } catch {
                    // ignore
                }

                await new Promise<void>(resolve => {
                    if (child.exitCode !== null || child.signalCode !== null) {
                        resolve();
                        return;
                    }

                    let isDone = false;
                    const timeout = setTimeout(() => {
                        if (!isDone) {
                            isDone = true;
                            try {
                                child.kill('SIGKILL');
                            } catch {
                                // ignore
                            }
                            resolve();
                        }
                    }, this.serviceChildTimeoutMs);

                    child.once('exit', () => {
                        if (!isDone) {
                            isDone = true;
                            clearTimeout(timeout);
                            resolve();
                        }
                    });
                });
            }
        })();

        // 3. 録画中ストリーム・ファイルの安全なフラッシュと DB 確定 (Graceful Shutdown)
        try {
            this.log.system.info('stopping active recordings and flushing files...');
            let timeoutId: NodeJS.Timeout | null = null;
            await Promise.race([
                this.recordingManageModel.stopAll(),
                new Promise<void>((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error(`stopAll timeout after ${this.stopAllTimeoutMs}ms`));
                    }, this.stopAllTimeoutMs);
                }),
            ]).finally(() => {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            });
            this.log.system.info('all recordings stopped cleanly.');
        } catch (err: any) {
            this.log.system.error('error while stopping recordings during graceful shutdown:');
            this.log.system.error(err);
        }

        // 4. Service 子プロセスの終了完了を待機
        await serviceChildPromise;

        // 5. DB コネクションのクローズ
        try {
            await this.drizzleOperator.closeConnection();
        } catch (err: any) {
            this.log.system.error('error closing database connection:');
            this.log.system.error(err);
        }

        this.log.system.info('graceful shutdown completed. Exiting.');
        try {
            await this.loggerModel.close();
        } catch {
            // ignore
        }
        this.exitHandler(0);
    }
}
