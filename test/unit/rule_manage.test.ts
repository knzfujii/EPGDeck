import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as apid from '../../api.js';
import PromiseQueue from '../../src/model/PromiseQueue.js';
import RuleManageModel from '../../src/model/operator/rule/RuleManageModel.js';

describe('RuleManageModel Tests', () => {
    let dummyLogger: any;
    let dummyOptionChecker: any;
    let dummyRuleDB: any;
    let dummyRuleEvent: any;
    let queue: PromiseQueue;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyOptionChecker = {
            checkRuleOption: vi.fn().mockReturnValue(true),
        };
        dummyRuleDB = {
            insertOnce: vi.fn().mockResolvedValue(10),
            findId: vi.fn().mockResolvedValue({ id: 10, searchOption: { keyword: 'test' } }),
            updateOnce: vi.fn().mockResolvedValue(undefined),
            enableOnce: vi.fn().mockResolvedValue(undefined),
            disableOnce: vi.fn().mockResolvedValue(undefined),
            deleteOnce: vi.fn().mockResolvedValue(undefined),
        };
        dummyRuleEvent = {
            emitAdded: vi.fn(),
            emitUpdated: vi.fn(),
            emitEnabled: vi.fn(),
            emitDisabled: vi.fn(),
            emitDeleted: vi.fn(),
        };
        queue = new PromiseQueue();
    });

    const createModel = () => {
        return new RuleManageModel(dummyLogger, dummyOptionChecker, dummyRuleDB, dummyRuleEvent, queue);
    };

    describe('add', () => {
        it('successfully adds a rule and emits event', async () => {
            const model = createModel();
            const option: apid.AddRuleOption = {
                isTimeSpecification: false,
                searchOption: {
                    keyword: '  anime  ',
                    ignoreKeyword: '  rerun  ',
                },
                reserveOption: { enable: true } as any,
            };

            const ruleId = await model.add(option);
            expect(ruleId).toBe(10);
            expect(option.searchOption?.keyword).toBe('anime');
            expect(option.searchOption?.ignoreKeyword).toBe('rerun');
            expect(dummyRuleDB.insertOnce).toHaveBeenCalledWith(option);
            expect(dummyRuleEvent.emitAdded).toHaveBeenCalledWith(10);
        });

        it('deletes empty string keywords in sanitizeRule', async () => {
            const model = createModel();
            const option: apid.AddRuleOption = {
                isTimeSpecification: false,
                searchOption: {
                    keyword: '   ',
                    ignoreKeyword: '   ',
                },
                reserveOption: { enable: true } as any,
            };

            await model.add(option);
            expect(option.searchOption?.keyword).toBeUndefined();
            expect(option.searchOption?.ignoreKeyword).toBeUndefined();
        });

        it('throws AddRuleError when optionChecker fails', async () => {
            dummyOptionChecker.checkRuleOption.mockReturnValue(false);
            const model = createModel();

            await expect(
                model.add({ isTimeSpecification: false, searchOption: {}, reserveOption: {} as any }),
            ).rejects.toThrow('AddRuleError');
            expect(dummyRuleDB.insertOnce).not.toHaveBeenCalled();
            expect(dummyRuleEvent.emitAdded).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('successfully updates a rule and emits event', async () => {
            const model = createModel();
            const rule: apid.Rule = {
                id: 10,
                isTimeSpecification: false,
                searchOption: { keyword: 'news' },
                reserveOption: { enable: true } as any,
            };

            await model.update(rule);
            expect(dummyRuleDB.findId).toHaveBeenCalledWith(10);
            expect(dummyRuleDB.updateOnce).toHaveBeenCalledWith(rule);
            expect(dummyRuleEvent.emitUpdated).toHaveBeenCalledWith(10);
        });

        it('throws RuleIsNotFound when target rule does not exist', async () => {
            dummyRuleDB.findId.mockResolvedValue(null);
            const model = createModel();

            await expect(
                model.update({ id: 999, isTimeSpecification: false, searchOption: {}, reserveOption: {} as any }),
            ).rejects.toThrow('RuleIsNotFound');
            expect(dummyRuleDB.updateOnce).not.toHaveBeenCalled();
        });

        it('throws UpdateRuleError when optionChecker fails', async () => {
            dummyOptionChecker.checkRuleOption.mockReturnValue(false);
            const model = createModel();

            await expect(
                model.update({ id: 10, isTimeSpecification: false, searchOption: {}, reserveOption: {} as any }),
            ).rejects.toThrow('UpdateRuleError');
            expect(dummyRuleDB.updateOnce).not.toHaveBeenCalled();
        });
    });

    describe('enable & disable', () => {
        it('successfully enables a rule', async () => {
            const model = createModel();
            await model.enable(10);
            expect(dummyRuleDB.enableOnce).toHaveBeenCalledWith(10);
            expect(dummyRuleEvent.emitEnabled).toHaveBeenCalledWith(10);
        });

        it('successfully disables a rule', async () => {
            const model = createModel();
            await model.disable(10);
            expect(dummyRuleDB.disableOnce).toHaveBeenCalledWith(10);
            expect(dummyRuleEvent.emitDisabled).toHaveBeenCalledWith(10);
        });
    });

    describe('delete & deletes', () => {
        it('successfully deletes a single rule', async () => {
            const model = createModel();
            await model.delete(10);
            expect(dummyRuleDB.deleteOnce).toHaveBeenCalledWith(10);
            expect(dummyRuleEvent.emitDeleted).toHaveBeenCalledWith(10);
        });

        it('deletes multiple rules and reports failed IDs', async () => {
            dummyRuleDB.deleteOnce.mockImplementation(async (id: number) => {
                if (id === 2) {
                    throw new Error('DB Error');
                }
            });
            const model = createModel();

            const failed = await model.deletes([1, 2, 3]);
            expect(failed).toEqual([2]);
            expect(dummyRuleEvent.emitDeleted).toHaveBeenCalledWith(1);
            expect(dummyRuleEvent.emitDeleted).toHaveBeenCalledWith(3);
        });
    });

    describe('serialization with PromiseQueue', () => {
        it('processes concurrent requests in strict FIFO sequence without throwing concurrency errors', async () => {
            const model = createModel();
            const executionOrder: string[] = [];

            dummyRuleDB.insertOnce.mockImplementation(async () => {
                executionOrder.push('add_start');
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push('add_end');
                return 1;
            });

            dummyRuleDB.enableOnce.mockImplementation(async () => {
                executionOrder.push('enable_start');
                await new Promise(resolve => setTimeout(resolve, 20));
                executionOrder.push('enable_end');
            });

            dummyRuleDB.deleteOnce.mockImplementation(async () => {
                executionOrder.push('delete_start');
                await new Promise(resolve => setTimeout(resolve, 10));
                executionOrder.push('delete_end');
            });

            // 3つの操作を同時に発火
            const p1 = model.add({ isTimeSpecification: false, searchOption: {}, reserveOption: {} as any });
            const p2 = model.enable(1);
            const p3 = model.delete(1);

            await Promise.all([p1, p2, p3]);

            // キューによって直列に並び、前の処理が終わってから次が開始されていること
            expect(executionOrder).toEqual([
                'add_start',
                'add_end',
                'enable_start',
                'enable_end',
                'delete_start',
                'delete_end',
            ]);
        });

        it('continues processing subsequent queue items even if a previous operation throws an error', async () => {
            const model = createModel();
            dummyOptionChecker.checkRuleOption.mockReturnValueOnce(false); // 最初の操作はエラー

            const p1 = model.add({ isTimeSpecification: false, searchOption: {}, reserveOption: {} as any });
            const p2 = model.enable(2);

            await expect(p1).rejects.toThrow('AddRuleError');
            await expect(p2).resolves.toBeUndefined();
            expect(dummyRuleDB.enableOnce).toHaveBeenCalledWith(2);
        });
    });
});
