import * as events from 'events';
import IExecutionManagementModel, { ExecutionId } from './IExecutionManagementModel.js';
import ILogger from './ILogger.js';
import ILoggerModel from './ILoggerModel.js';

interface ExeQueueData {
    id: string;
    priority: number;
}

class ExecutionManagementModel implements IExecutionManagementModel {
    private log: ILogger;

    private lockId: string | null = null;
    private exeQueue: ExeQueueData[] = [];
    private exeEventEmitter: events.EventEmitter = new events.EventEmitter();

    constructor(logger: ILoggerModel) {
        this.log = logger.getLogger();
    }

    public getExecution(priority: number, timeout: number = 1000 * 60): Promise<ExecutionId> {
        const exeQueueData: ExeQueueData = {
            id: new Date().getTime().toString(16) + Math.floor(1000 * Math.random()).toString(16),
            priority: priority,
        };

        // queue に挿入
        let position = 0;
        const len = this.exeQueue.length;
        for (; position < len; position++) {
            const q = this.exeQueue[position];
            if (q.priority < exeQueueData.priority) {
                break;
            }
        }
        this.exeQueue.splice(position, 0, exeQueueData);

        return new Promise<string>((resolve: (value: string) => void, reject: (err: Error) => void) => {
            // タイムアウト設定
            const timerId = setTimeout(() => {
                this.log.system.error(`get execution error: ${priority}`);
                // listener から削除
                this.exeEventEmitter.removeListener(ExecutionManagementModel.UNLOCK_EVENT, onDone);

                reject(new Error('GetExecutionTimeoutError'));
            }, timeout);

            const onDone = (id: string) => {
                if (id !== exeQueueData.id) {
                    return;
                }

                // タイマー停止
                clearTimeout(timerId);

                // 実行権が取得できた
                resolve(exeQueueData.id);

                // listener から削除
                this.exeEventEmitter.removeListener(ExecutionManagementModel.UNLOCK_EVENT, onDone);
            };

            // unlock されるたびに発行される
            this.exeEventEmitter.on(ExecutionManagementModel.UNLOCK_EVENT, onDone);

            /**
             * キューからタスクを取り出して実行権を割り当てる
             */
            this.dispatch();
        });
    }

    public unLockExecution(id: ExecutionId): void {
        if (this.lockId !== id) {
            return;
        }

        // アンロック
        this.lockId = null;
        this.dispatch();
    }

    /**
     * キューの先頭タスクを取り出し、ロックを割り当てて実行を通知する
     */
    private dispatch(): void {
        if (this.lockId !== null) {
            return;
        }

        const q = this.exeQueue.shift();
        if (typeof q !== 'undefined') {
            this.lockId = q.id;
            this.exeEventEmitter.emit(ExecutionManagementModel.UNLOCK_EVENT, q.id);
        }
    }
}

namespace ExecutionManagementModel {
    export const UNLOCK_EVENT = 'ExeUnlock';
}

export default ExecutionManagementModel;
