import { describe, expect, it, vi } from 'vitest';
import ExecutionManagementModel from '../../src/model/ExecutionManagementModel.js';

describe('ExecutionManagementModel Tests', () => {
    const createModel = () => {
        const dummyLogger = {
            system: {
                error: vi.fn(),
            },
        };
        const dummyLoggerModel = {
            getLogger: () => dummyLogger as any,
        };
        return new ExecutionManagementModel(dummyLoggerModel as any);
    };

    it('should acquire execution lock and release it', async () => {
        const model = createModel();

        const exeId = await model.getExecution(10);
        expect(typeof exeId).toBe('string');
        expect(exeId.length).toBeGreaterThan(0);

        // アンロック
        model.unLockExecution(exeId);
    });

    it('should dispatch queued executions in order of priority', async () => {
        const model = createModel();

        // 最初のタスクを取得してロックを保持
        const firstLock = await model.getExecution(10);

        const executionOrder: string[] = [];

        // 異なる優先度のタスクを複数キューイング
        const lowPromise = model.getExecution(5).then(id => {
            executionOrder.push('low');
            model.unLockExecution(id);
        });

        const highPromise = model.getExecution(20).then(id => {
            executionOrder.push('high');
            model.unLockExecution(id);
        });

        const mediumPromise = model.getExecution(10).then(id => {
            executionOrder.push('medium');
            model.unLockExecution(id);
        });

        // 最初のロックを解放
        model.unLockExecution(firstLock);

        await Promise.all([lowPromise, highPromise, mediumPromise]);

        // high (20) -> medium (10) -> low (5) の順序で実行されるべき
        expect(executionOrder).toEqual(['high', 'medium', 'low']);
    });

    it('should ignore duplicate unlock calls with the same execution id', async () => {
        const model = createModel();

        const firstLock = await model.getExecution(10);

        let secondExecuted = 0;
        const secondPromise = model.getExecution(10).then(id => {
            secondExecuted++;
            model.unLockExecution(id);
        });

        // 1回目の正常アンロック -> 2番目のタスクが実行開始される
        model.unLockExecution(firstLock);
        await secondPromise;
        expect(secondExecuted).toBe(1);

        // 2回目の重複アンロック（すでに解放済みの firstLock で再度アンロック）
        // 異常系: キューが空の状態で呼ばれても何も起きないこと
        expect(() => model.unLockExecution(firstLock)).not.toThrow();

        // 新たにタスクを要求した際に正常にロックが取得できること
        const thirdLock = await model.getExecution(10);
        expect(typeof thirdLock).toBe('string');
        model.unLockExecution(thirdLock);
    });

    it('should ignore unlock calls with non-matching execution id', async () => {
        const model = createModel();

        const currentLock = await model.getExecution(10);

        // まったく無関係な ID でアンロックを試みる
        model.unLockExecution('invalid-bogus-id');

        // ロックは解放されていないため、後続のタスクはまだ待機中のはず
        let isSecondDone = false;
        const secondPromise = model.getExecution(10).then(id => {
            isSecondDone = true;
            model.unLockExecution(id);
        });

        // 短い tick を待っても second は完了しない
        await new Promise(r => setTimeout(r, 10));
        expect(isSecondDone).toBe(false);

        // 正しい ID でアンロック
        model.unLockExecution(currentLock);
        await secondPromise;
        expect(isSecondDone).toBe(true);
    });

    it('should reject with GetExecutionTimeoutError when timeout occurs', async () => {
        const model = createModel();

        // 最初のタスクでロックを占有
        const firstLock = await model.getExecution(10);

        // 50ms のタイムアウトを指定して後続タスクを投入
        await expect(model.getExecution(10, 50)).rejects.toThrow('GetExecutionTimeoutError');

        // 後片付け
        model.unLockExecution(firstLock);
    });
});
