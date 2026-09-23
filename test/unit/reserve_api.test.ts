import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Reserve from '../../src/db/entities/Reserve.js';
import ReserveApiModel from '../../src/model/api/reserve/ReserveApiModel.js';

describe('ReserveApiModel Tests', () => {
    let dummyIPC: any;
    let dummyReserveDB: any;
    let model: ReserveApiModel;

    beforeEach(() => {
        dummyIPC = {
            reservation: {
                add: vi.fn(),
                edit: vi.fn(),
                cancel: vi.fn(),
                removeSkip: vi.fn(),
                removeOverlap: vi.fn(),
                updateAll: vi.fn(),
            },
        };
        dummyReserveDB = {
            findId: vi.fn(),
            findAll: vi.fn(),
            findLists: vi.fn(),
        };
        model = new ReserveApiModel(dummyIPC, dummyReserveDB);
    });

    const createDummyReserve = (id: number): Reserve => {
        const r = new Reserve();
        r.id = id;
        r.isSkip = false;
        r.isConflict = false;
        r.isOverlap = false;
        r.allowEndLack = false;
        r.isTimeSpecified = false;
        r.isDeleteOriginalAfterEncode = false;
        r.channelId = 1;
        r.startAt = 1000;
        r.endAt = 2000;
        r.name = 'テスト予約　１';
        r.halfWidthName = 'テスト予約 1';
        r.description = '予約詳細　１';
        r.halfWidthDescription = '予約詳細 1';
        r.tags = JSON.stringify([1, 2]);
        r.ruleId = 10;
        r.programId = 100;
        r.rawExtended = JSON.stringify({ キャスト: 'テスト' });
        r.rawHalfWidthExtended = JSON.stringify({ キャスト: 'テスト' });
        return r;
    };

    describe('IPC delegation methods', () => {
        it('add delegates to ipc.reservation.add', async () => {
            dummyIPC.reservation.add.mockResolvedValue(10);
            const opt: any = { channelId: 1 };
            const id = await model.add(opt);

            expect(id).toBe(10);
            expect(dummyIPC.reservation.add).toHaveBeenCalledWith(opt);
        });

        it('edit delegates to ipc.reservation.edit', async () => {
            dummyIPC.reservation.edit.mockResolvedValue(undefined);
            const opt: any = { name: '変更' };
            await model.edit(5, opt);

            expect(dummyIPC.reservation.edit).toHaveBeenCalledWith(5, opt);
        });

        it('cancel delegates to ipc.reservation.cancel', async () => {
            dummyIPC.reservation.cancel.mockResolvedValue(undefined);
            await model.cancel(12);

            expect(dummyIPC.reservation.cancel).toHaveBeenCalledWith(12);
        });

        it('removeSkip delegates to ipc.reservation.removeSkip', async () => {
            dummyIPC.reservation.removeSkip.mockResolvedValue(undefined);
            await model.removeSkip(15);

            expect(dummyIPC.reservation.removeSkip).toHaveBeenCalledWith(15);
        });

        it('removeOverlap delegates to ipc.reservation.removeOverlap', async () => {
            dummyIPC.reservation.removeOverlap.mockResolvedValue(undefined);
            await model.removeOverlap(20);

            expect(dummyIPC.reservation.removeOverlap).toHaveBeenCalledWith(20);
        });

        it('updateAll delegates to ipc.reservation.updateAll with false', async () => {
            dummyIPC.reservation.updateAll.mockResolvedValue(undefined);
            await model.updateAll();

            expect(dummyIPC.reservation.updateAll).toHaveBeenCalledWith(false);
        });
    });

    describe('get and gets', () => {
        it('get returns null when reserve not found', async () => {
            dummyReserveDB.findId.mockResolvedValue(null);
            const result = await model.get(999, false);

            expect(result).toBeNull();
        });

        it('get returns full-width formatted ReserveItem', async () => {
            const r = createDummyReserve(1);
            dummyReserveDB.findId.mockResolvedValue(r);

            const item = await model.get(1, false);

            expect(item).not.toBeNull();
            expect(item?.id).toBe(1);
            expect(item?.name).toBe('テスト予約　１');
            expect(item?.description).toBe('予約詳細　１');
            expect(item?.tags).toEqual([1, 2]);
            expect(item?.ruleId).toBe(10);
            expect(item?.programId).toBe(100);
            expect(item?.rawExtended).toEqual({ キャスト: 'テスト' });
        });

        it('get returns half-width formatted ReserveItem', async () => {
            const r = createDummyReserve(1);
            dummyReserveDB.findId.mockResolvedValue(r);

            const item = await model.get(1, true);

            expect(item?.name).toBe('テスト予約 1');
            expect(item?.description).toBe('予約詳細 1');
        });

        it('gets returns list of ReserveItems with total count', async () => {
            const r1 = createDummyReserve(1);
            const r2 = createDummyReserve(2);
            dummyReserveDB.findAll.mockResolvedValue([[r1, r2], 2]);

            const result = await model.gets({ isHalfWidth: false });

            expect(result.total).toBe(2);
            expect(result.reserves.length).toBe(2);
            expect(result.reserves[0].id).toBe(1);
            expect(result.reserves[1].id).toBe(2);
        });
    });

    describe('getLists and getCnts', () => {
        it('getLists categorizes reserves into normal, conflicts, skips, overlaps', async () => {
            const rNormal = createDummyReserve(1);
            const rConflict = createDummyReserve(2);
            rConflict.isConflict = true;
            const rSkip = createDummyReserve(3);
            rSkip.isSkip = true;
            const rOverlap = createDummyReserve(4);
            rOverlap.isOverlap = true;

            dummyReserveDB.findLists.mockResolvedValue([rNormal, rConflict, rSkip, rOverlap]);

            const lists = await model.getLists({ startAt: 0, endAt: 10000 });

            expect(lists.normal).toEqual([{ reserveId: 1, programId: 100, ruleId: 10 }]);
            expect(lists.conflicts).toEqual([{ reserveId: 2, programId: 100, ruleId: 10 }]);
            expect(lists.skips).toEqual([{ reserveId: 3, programId: 100, ruleId: 10 }]);
            expect(lists.overlaps).toEqual([{ reserveId: 4, programId: 100, ruleId: 10 }]);
        });

        it('getCnts counts reserves in each category', async () => {
            const rNormal1 = createDummyReserve(1);
            const rNormal2 = createDummyReserve(2);
            const rConflict = createDummyReserve(3);
            rConflict.isConflict = true;
            const rSkip = createDummyReserve(4);
            rSkip.isSkip = true;

            dummyReserveDB.findLists.mockResolvedValue([rNormal1, rNormal2, rConflict, rSkip]);

            const cnts = await model.getCnts();

            expect(cnts).toEqual({
                normal: 2,
                conflicts: 1,
                skips: 1,
                overlaps: 0,
            });
        });
    });
});
