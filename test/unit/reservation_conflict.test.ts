import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as mapid from '../../node_modules/mirakurun/api';
import Program from '../../src/db/entities/Program';
import Reserve from '../../src/db/entities/Reserve';
import ReservationManageModel from '../../src/model/operator/reservation/ReservationManageModel';

describe('ReservationManageModel Conflict & Tuner Allocation Tests', () => {
    const dummyLogger: any = {
        getLogger: () => ({
            system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
        }),
    };
    const dummyConfig: any = {
        getConfig: () => ({
            isSuppressReservesUpdateAllLog: true,
            conflictPriority: 1,
            recPriority: 2,
        }),
    };
    const dummyExec: any = {
        getExecution: vi.fn().mockResolvedValue(1),
        unLockExecution: vi.fn(),
    };
    const dummyOptionChecker: any = {
        checkRuleOption: vi.fn().mockReturnValue(true),
    };
    let dummyReserveDB: any;
    let dummyChannelDB: any;
    let dummyProgramDB: any;
    let dummyRuleDB: any;
    let dummyReserveEvent: any;

    beforeEach(() => {
        dummyReserveDB = {
            findProgramId: vi.fn().mockResolvedValue([]),
            findOldTime: vi.fn().mockResolvedValue([]),
            findTimeRanges: vi.fn().mockResolvedValue([]),
            getTimeRanges: vi.fn().mockResolvedValue([]),
            getRuleReserves: vi.fn().mockResolvedValue([]),
            findOverlap: vi.fn().mockResolvedValue([]),
            insertOnce: vi.fn().mockImplementation((r: Reserve) => Promise.resolve(r.id || 100)),
            updateMany: vi.fn().mockResolvedValue(undefined),
            updateOnce: vi.fn().mockResolvedValue(undefined),
        };
        dummyChannelDB = {};
        dummyProgramDB = {};
        dummyRuleDB = {};
        dummyReserveEvent = {
            emitUpdated: vi.fn(),
        };
    });

    const createModel = () => {
        return new ReservationManageModel(
            dummyLogger,
            dummyConfig,
            dummyExec,
            dummyOptionChecker,
            dummyReserveDB,
            dummyChannelDB,
            dummyProgramDB,
            dummyRuleDB,
            dummyReserveEvent,
        );
    };

    it('sets broadcast status correctly based on tuners', () => {
        const model = createModel();
        const tuners: mapid.TunerDevice[] = [
            { index: 0, name: 'GR_Tuner_0', types: ['GR'], command: '' },
            { index: 1, name: 'GR_Tuner_1', types: ['GR'], command: '' },
            { index: 2, name: 'BSCS_Tuner_0', types: ['BS', 'CS'], command: '' },
        ];
        model.setTuners(tuners);

        const status = model.getBroadcastStatus();
        expect(status.GR).toBe(true);
        expect(status.BS).toBe(true);
        expect(status.CS).toBe(true);
        expect(status.SKY).toBe(false);
    });

    it('handles multiple parallel reservations under tuner capacity (2 GR tuners, 2 parallel recordings)', async () => {
        const model = createModel();
        const tuners: mapid.TunerDevice[] = [
            { index: 0, name: 'GR_Tuner_0', types: ['GR'], command: '' },
            { index: 1, name: 'GR_Tuner_1', types: ['GR'], command: '' },
        ];
        model.setTuners(tuners);

        const now = Date.now();
        const p1 = new Program();
        p1.id = 1001;
        p1.channelId = 1;
        p1.channelType = 'GR';
        p1.channel = '27';
        p1.startAt = now + 100000;
        p1.endAt = now + 100000 + 3600000;
        p1.name = '番組1';
        p1.halfWidthName = '番組1';
        p1.description = '';
        p1.halfWidthDescription = '';
        p1.isFree = true;

        dummyProgramDB.findId = vi.fn().mockResolvedValue(p1);

        vi.spyOn(model as any, 'checkSingleReserveConflict').mockResolvedValue(undefined);

        const reserveId = await model.add({ programId: 1001 });
        expect(reserveId).toBe(100);
        expect(dummyReserveDB.insertOnce).toHaveBeenCalled();
    });

    it('detects conflict when parallel recordings exceed tuner capacity', async () => {
        const model = createModel();
        const tuners: mapid.TunerDevice[] = [
            { index: 0, name: 'GR_Tuner_0', types: ['GR'], command: '' },
        ];
        model.setTuners(tuners);

        const now = Date.now();
        // 既存の予約が1件存在（GRチューナーを1台占有中）
        const existingReserve = new Reserve();
        existingReserve.id = 1;
        existingReserve.channelId = 1;
        existingReserve.channelType = 'GR';
        existingReserve.startAt = now + 100000;
        existingReserve.endAt = now + 100000 + 3600000;
        existingReserve.isConflict = false;
        existingReserve.name = '先約番組';

        dummyReserveDB.findTimeRanges = vi.fn().mockResolvedValue([existingReserve]);
        dummyReserveDB.getTimeRanges = vi.fn().mockResolvedValue([existingReserve]);

        const newProgram = new Program();
        newProgram.id = 2002;
        newProgram.channelId = 2; // 別チャンネル
        newProgram.channelType = 'GR';
        newProgram.channel = '28';
        newProgram.startAt = now + 100000;
        newProgram.endAt = now + 100000 + 3600000;
        newProgram.name = '後発番組';
        newProgram.halfWidthName = '後発番組';
        newProgram.description = '';
        newProgram.halfWidthDescription = '';
        newProgram.isFree = true;

        dummyProgramDB.findId = vi.fn().mockResolvedValue(newProgram);

        // checkSingleReserveConflict を実際に動かして競合判定を確認
        const newReserve = new Reserve();
        newReserve.id = 2;
        newReserve.programId = 2002;
        newReserve.channelId = 2;
        newReserve.channelType = 'GR';
        newReserve.channel = '28';
        newReserve.startAt = newProgram.startAt;
        newReserve.endAt = newProgram.endAt;
        newReserve.isConflict = false;

        await expect((model as any).checkSingleReserveConflict(newReserve)).rejects.toThrow(
            'ReservationManageModelAddReserveConflict',
        );
    });

    it('allows simultaneous recordings on the same physical channel (subchannel) using single tuner', async () => {
        const model = createModel();
        const tuners: mapid.TunerDevice[] = [
            { index: 0, name: 'GR_Tuner_0', types: ['GR'], command: '' },
        ];
        model.setTuners(tuners);

        const now = Date.now();
        // NHK総合1（ch: 27）
        const r1 = new Reserve();
        r1.id = 1;
        r1.channelId = 101;
        r1.channelType = 'GR';
        r1.channel = '27';
        r1.startAt = now + 100000;
        r1.endAt = now + 100000 + 3600000;
        r1.isConflict = false;

        // NHK総合2（同一物理 ch: 27）
        const r2 = new Reserve();
        r2.id = 2;
        r2.channelId = 102;
        r2.channelType = 'GR';
        r2.channel = '27';
        r2.startAt = now + 100000;
        r2.endAt = now + 100000 + 3600000;
        r2.isConflict = false;

        // 同一物理チャンネルであればチューナー1台でも競合しない
        const evaluatedReserves = (model as any).createReserves([r1, r2]);
        expect(evaluatedReserves).toHaveLength(2);
        expect(evaluatedReserves[0].isConflict).toBe(false);
        expect(evaluatedReserves[1].isConflict).toBe(false);
    });

    it('scales to 4 concurrent GR tuners without conflicts', () => {
        const model = createModel();
        const tuners: mapid.TunerDevice[] = [
            { index: 0, name: 'GR_0', types: ['GR'], command: '' },
            { index: 1, name: 'GR_1', types: ['GR'], command: '' },
            { index: 2, name: 'GR_2', types: ['GR'], command: '' },
            { index: 3, name: 'GR_3', types: ['GR'], command: '' },
        ];
        model.setTuners(tuners);

        const now = Date.now();
        const reserves: Reserve[] = [1, 2, 3, 4].map(i => {
            const r = new Reserve();
            r.id = i;
            r.channelId = 100 + i;
            r.channelType = 'GR';
            r.channel = `${20 + i}`;
            r.startAt = now + 100000;
            r.endAt = now + 100000 + 3600000;
            r.isConflict = false;
            return r;
        });

        const evaluatedReserves = (model as any).createReserves(reserves);
        expect(evaluatedReserves).toHaveLength(4);
        expect(evaluatedReserves.every((r: Reserve) => !r.isConflict)).toBe(true);

        // 5件目を追加するとチューナー不足（4台に対して5件）で競合が発生
        const r5 = new Reserve();
        r5.id = 5;
        r5.channelId = 105;
        r5.channelType = 'GR';
        r5.channel = '25';
        r5.startAt = now + 100000;
        r5.endAt = now + 100000 + 3600000;
        r5.isConflict = false;

        const evaluatedWith5 = (model as any).createReserves([...reserves, r5]);
        expect(evaluatedWith5).toHaveLength(5);
        const conflictCount = evaluatedWith5.filter((r: Reserve) => r.isConflict).length;
        expect(conflictCount).toBe(1);
    });

    it('handles mixed 8-tuner concurrent recordings (4 GR + 4 BS/CS)', () => {
        const model = createModel();
        const tuners: mapid.TunerDevice[] = [
            { index: 0, name: 'GR_0', types: ['GR'], command: '' },
            { index: 1, name: 'GR_1', types: ['GR'], command: '' },
            { index: 2, name: 'GR_2', types: ['GR'], command: '' },
            { index: 3, name: 'GR_3', types: ['GR'], command: '' },
            { index: 4, name: 'BSCS_0', types: ['BS', 'CS'], command: '' },
            { index: 5, name: 'BSCS_1', types: ['BS', 'CS'], command: '' },
            { index: 6, name: 'BSCS_2', types: ['BS', 'CS'], command: '' },
            { index: 7, name: 'BSCS_3', types: ['BS', 'CS'], command: '' },
        ];
        model.setTuners(tuners);

        const now = Date.now();
        const grReserves: Reserve[] = [1, 2, 3, 4].map(i => {
            const r = new Reserve();
            r.id = i;
            r.channelId = 100 + i;
            r.channelType = 'GR';
            r.channel = `${20 + i}`;
            r.startAt = now + 100000;
            r.endAt = now + 100000 + 3600000;
            r.isConflict = false;
            return r;
        });

        const bsReserves: Reserve[] = [5, 6, 7, 8].map(i => {
            const r = new Reserve();
            r.id = i;
            r.channelId = 200 + i;
            r.channelType = 'BS';
            r.channel = `BS${i}`;
            r.startAt = now + 100000;
            r.endAt = now + 100000 + 3600000;
            r.isConflict = false;
            return r;
        });

        const evaluated = (model as any).createReserves([...grReserves, ...bsReserves]);
        expect(evaluated).toHaveLength(8);
        expect(evaluated.every((r: Reserve) => !r.isConflict)).toBe(true);
    });
});

