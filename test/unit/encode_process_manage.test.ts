import 'reflect-metadata';
import * as events from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EncodeProcessManageModel from '../../src/model/service/encode/EncodeProcessManageModel.js';
import ProcessUtil from '../../src/util/ProcessUtil.js';

describe('EncodeProcessManageModel Tests', () => {
    let dummyConfig: any;
    let dummyConfiguration: any;
    let dummyLogger: any;
    let mockEncodeLog: any;
    let model: EncodeProcessManageModel;

    beforeEach(() => {
        dummyConfig = {
            encode: {
                maxProcesses: 2,
            },
        };
        dummyConfiguration = {
            getConfig: () => dummyConfig,
        };
        mockEncodeLog = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        };
        dummyLogger = {
            getLogger: () => ({
                encode: mockEncodeLog,
            }),
        };

        model = new EncodeProcessManageModel(dummyLogger, dummyConfiguration);
    });

    const createMockChild = (pid: number) => {
        const emitter = new events.EventEmitter() as any;
        emitter.pid = pid;
        emitter.kill = vi.fn();
        emitter.removeAllListeners = vi.fn();
        return emitter;
    };

    describe('create process & priority management', () => {
        it('creates processes up to maxProcesses', async () => {
            const child1 = createMockChild(101);
            const child2 = createMockChild(102);

            let callCount = 0;
            vi.spyOn(model as any, 'buildProcess').mockImplementation((opt: any) => {
                callCount++;
                return {
                    child: callCount === 1 ? child1 : child2,
                    priority: opt.priority,
                    processId: callCount,
                };
            });

            const p1 = await model.create({ cmd: 'cmd1', priority: 1, input: null, output: null });
            const p2 = await model.create({ cmd: 'cmd2', priority: 2, input: null, output: null });

            expect(p1).toBe(child1);
            expect(p2).toBe(child2);
            expect((model as any).childs.length).toBe(2);
        });

        it('throws EncodeProcessManageModelCreateError when limit reached and new priority is lower or equal', async () => {
            const child1 = createMockChild(101);
            const child2 = createMockChild(102);

            let callCount = 0;
            vi.spyOn(model as any, 'buildProcess').mockImplementation((opt: any) => {
                callCount++;
                return {
                    child: callCount === 1 ? child1 : child2,
                    priority: opt.priority,
                    processId: callCount,
                };
            });

            await model.create({ cmd: 'cmd1', priority: 5, input: null, output: null });
            await model.create({ cmd: 'cmd2', priority: 10, input: null, output: null });

            // priority 3 （両方より低い）は拒絶される
            await expect(model.create({ cmd: 'cmd3', priority: 3, input: null, output: null })).rejects.toThrow(
                'EncodeProcessManageModelCreateError',
            );

            // priority 5 （既存の最小 priority と同等）も拒絶される
            await expect(model.create({ cmd: 'cmd4', priority: 5, input: null, output: null })).rejects.toThrow(
                'EncodeProcessManageModelCreateError',
            );
        });

        it('kills lower priority process and creates new process when limit reached', async () => {
            const child1 = createMockChild(101);
            const child2 = createMockChild(102);
            const child3 = createMockChild(103);

            let callCount = 0;
            vi.spyOn(model as any, 'buildProcess').mockImplementation((opt: any) => {
                callCount++;
                const c = callCount === 1 ? child1 : callCount === 2 ? child2 : child3;
                return {
                    child: c,
                    priority: opt.priority,
                    processId: callCount,
                };
            });

            vi.spyOn(ProcessUtil, 'kill').mockImplementation(async () => {
                // プロセス終了イベントを発行してクリーンアップ
                (model as any).listener.emit(EncodeProcessManageModel.KILL_CHILD_EVENT, 1);
            });

            // 優先度 1 と 10 で作成
            await model.create({ cmd: 'cmd1', priority: 1, input: null, output: null });
            await model.create({ cmd: 'cmd2', priority: 10, input: null, output: null });

            // 優先度 5 で作成 ➔ 優先度 1 のプロセスがキルされて作成される
            const p3 = await model.create({ cmd: 'cmd3', priority: 5, input: null, output: null });
            expect(p3).toBe(child3);
        });
    });

    describe('killAll', () => {
        it('kills all active child processes', async () => {
            const child1 = createMockChild(101);
            const child2 = createMockChild(102);

            vi.spyOn(model as any, 'buildProcess')
                .mockReturnValueOnce({ child: child1, priority: 1, processId: 1 })
                .mockReturnValueOnce({ child: child2, priority: 2, processId: 2 });

            const killSpy = vi.spyOn(ProcessUtil, 'kill').mockResolvedValue(undefined);

            await model.create({ cmd: 'cmd1', priority: 1, input: null, output: null });
            await model.create({ cmd: 'cmd2', priority: 2, input: null, output: null });

            await model.killAll();

            expect(killSpy).toHaveBeenCalledTimes(2);
            expect((model as any).childs.length).toBe(0);
        });
    });
});
