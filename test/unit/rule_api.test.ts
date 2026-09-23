import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RuleApiModel from '../../src/model/api/rule/RuleApiModel.js';

describe('RuleApiModel Tests', () => {
    let dummyIPC: any;
    let dummyRuleDB: any;
    let dummyReserveDB: any;
    let model: RuleApiModel;

    beforeEach(() => {
        dummyIPC = {
            rule: {
                add: vi.fn(),
                update: vi.fn(),
                enable: vi.fn(),
                disable: vi.fn(),
                delete: vi.fn(),
                deletes: vi.fn(),
            },
        };
        dummyRuleDB = {
            findId: vi.fn(),
            findAll: vi.fn(),
            findKeyword: vi.fn(),
        };
        dummyReserveDB = {
            countRuleIds: vi.fn(),
        };

        model = new RuleApiModel(dummyIPC, dummyRuleDB, dummyReserveDB);
    });

    describe('IPC delegation methods', () => {
        it('add delegates to ipc.rule.add', async () => {
            dummyIPC.rule.add.mockResolvedValue(10);
            const opt: any = { searchOption: { keyword: 'テスト' } };

            const id = await model.add(opt);
            expect(id).toBe(10);
            expect(dummyIPC.rule.add).toHaveBeenCalledWith(opt);
        });

        it('update delegates to ipc.rule.update', async () => {
            dummyIPC.rule.update.mockResolvedValue(undefined);
            const rule: any = { id: 1, reservesCnt: 0 };

            await model.update(rule);
            expect(dummyIPC.rule.update).toHaveBeenCalledWith(rule);
        });

        it('enable delegates to ipc.rule.enable', async () => {
            await model.enable(1);
            expect(dummyIPC.rule.enable).toHaveBeenCalledWith(1);
        });

        it('disable delegates to ipc.rule.disable', async () => {
            await model.disable(2);
            expect(dummyIPC.rule.disable).toHaveBeenCalledWith(2);
        });

        it('delete delegates to ipc.rule.delete', async () => {
            await model.delete(3);
            expect(dummyIPC.rule.delete).toHaveBeenCalledWith(3);
        });

        it('deletes delegates to ipc.rule.deletes and returns failed ids', async () => {
            dummyIPC.rule.deletes.mockResolvedValue([5]);

            const failed = await model.deletes([4, 5]);
            expect(failed).toEqual([5]);
            expect(dummyIPC.rule.deletes).toHaveBeenCalledWith([4, 5]);
        });
    });

    describe('get and gets', () => {
        it('get delegates to ruleDB.findId with isRaw = false', async () => {
            dummyRuleDB.findId.mockResolvedValue({ id: 1, searchOption: {} });

            const result = await model.get(1);
            expect(result).toEqual({ id: 1, searchOption: {} });
            expect(dummyRuleDB.findId).toHaveBeenCalledWith(1, false);
        });

        it('gets returns rules without reservesCnt when option.type is undefined', async () => {
            dummyRuleDB.findAll.mockResolvedValue([[{ id: 1 }, { id: 2 }], 2]);

            const result = await model.gets({});
            expect(result.total).toBe(2);
            expect(result.rules.length).toBe(2);
            expect(dummyReserveDB.countRuleIds).not.toHaveBeenCalled();
        });

        it('gets attaches reservesCnt when option.type is provided', async () => {
            const rule1: any = { id: 1 };
            const rule2: any = { id: 2 };
            dummyRuleDB.findAll.mockResolvedValue([[rule1, rule2], 2]);
            dummyReserveDB.countRuleIds.mockResolvedValue([
                { ruleId: 1, ruleIdCnt: 5 },
                // rule2 はカウントなし（0件）
            ]);

            const result = await model.gets({ type: 'all' as any });

            expect(result.total).toBe(2);
            expect(dummyReserveDB.countRuleIds).toHaveBeenCalledWith([1, 2], 'all');
            expect(rule1.reservesCnt).toBe(5);
            expect(rule2.reservesCnt).toBe(0);
        });
    });

    describe('searchKeyword', () => {
        it('delegates to ruleDB.findKeyword', async () => {
            dummyRuleDB.findKeyword.mockResolvedValue([{ keyword: 'アニメ' }]);

            const result = await model.searchKeyword({ keyword: 'ア' } as any);
            expect(result).toEqual([{ keyword: 'アニメ' }]);
            expect(dummyRuleDB.findKeyword).toHaveBeenCalledWith({ keyword: 'ア' });
        });
    });
});
