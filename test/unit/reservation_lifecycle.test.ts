import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Program from '../../src/db/entities/Program.js';
import Reserve from '../../src/db/entities/Reserve.js';
import ReservationManageModel from '../../src/model/operator/reservation/ReservationManageModel.js';

describe('ReservationManageModel Lifecycle Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyExec: any;
    let dummyOptionChecker: any;
    let dummyReserveDB: any;
    let dummyChannelDB: any;
    let dummyProgramDB: any;
    let dummyRuleDB: any;
    let dummyReserveEvent: any;

    beforeEach(() => {
        vi.restoreAllMocks();

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                isSuppressReservesUpdateAllLog: true,
                conflictPriority: 1,
                recPriority: 2,
            }),
        };

        dummyExec = {
            getExecution: vi.fn().mockResolvedValue(1),
            unLockExecution: vi.fn(),
        };

        dummyOptionChecker = {
            checkRuleOption: vi.fn().mockReturnValue(true),
            checkEncodeOption: vi.fn().mockReturnValue(true),
            checkManualReserveOption: vi.fn().mockReturnValue(true),
        };

        dummyReserveDB = {
            findId: vi.fn().mockResolvedValue(null),
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

        dummyChannelDB = {
            findId: vi.fn().mockResolvedValue({ id: 1, name: 'NHK総合', channel: '27', channelType: 'GR' }),
        };

        dummyProgramDB = {
            findId: vi.fn().mockResolvedValue(null),
        };

        dummyRuleDB = {};

        dummyReserveEvent = {
            emitUpdated: vi.fn(),
        };
    });

    const mockTuner = (index: number, name: string, types: ('GR' | 'BS' | 'CS' | 'SKY')[]): any => {
        return { index, name, types, command: '' };
    };

    const createModel = () => {
        const model = new ReservationManageModel(
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
        model.setTuners([mockTuner(0, 'GR_0', ['GR']), mockTuner(1, 'BSCS_0', ['BS', 'CS'])]);
        return model;
    };

    const createDummyReserve = (overrides: Partial<Reserve> = {}): Reserve => {
        const r = new Reserve();
        r.id = 1;
        r.programId = 100;
        r.ruleId = null;
        r.channelId = 1;
        r.channel = '27';
        r.channelType = 'GR';
        r.name = 'Test Program';
        r.halfWidthName = 'Test Program';
        r.startAt = 1000000;
        r.endAt = 2000000;
        r.isConflict = false;
        r.isSkip = false;
        r.isOverlap = false;
        r.isIgnoreOverlap = false;
        r.isEventRelay = false;
        r.isTimeSpecified = false;
        r.allowEndLack = true;
        return Object.assign(r, overrides);
    };

    describe('cancel', () => {
        it('throws ReservationIsNotFound when reserveId does not exist', async () => {
            const model = createModel();
            dummyReserveDB.findId.mockResolvedValue(null);

            await expect(model.cancel(999)).rejects.toThrow('ReservationIsNotFound');
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('deletes manual reservation physically (diff.delete)', async () => {
            const model = createModel();
            const manualReserve = createDummyReserve({ id: 10, ruleId: null });
            dummyReserveDB.findId.mockResolvedValue(manualReserve);
            dummyReserveDB.findTimeRanges.mockResolvedValue([]);

            await model.cancel(10);

            expect(dummyReserveDB.updateMany).toHaveBeenCalledTimes(1);
            const diff = dummyReserveDB.updateMany.mock.calls[0][0];
            expect(diff.delete).toHaveLength(1);
            expect(diff.delete[0].id).toBe(10);
            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledWith(diff);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('sets isSkip = true and isConflict = false for normal rule reservation instead of deleting', async () => {
            const model = createModel();
            const ruleReserve = createDummyReserve({ id: 20, ruleId: 5, isSkip: false, isConflict: true });
            dummyReserveDB.findId.mockResolvedValue(ruleReserve);
            dummyReserveDB.findTimeRanges.mockResolvedValue([]);

            await model.cancel(20);

            expect(dummyReserveDB.updateMany).toHaveBeenCalledTimes(1);
            const diff = dummyReserveDB.updateMany.mock.calls[0][0];
            expect(diff.delete).toHaveLength(0);
            expect(diff.update).toHaveLength(1);
            expect(diff.update[0].id).toBe(20);
            expect(diff.update[0].isSkip).toBe(true);
            expect(diff.update[0].isConflict).toBe(false);
            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledWith(diff);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('maintains isOverlap = true and isIgnoreOverlap = false for overlapping rule reservation', async () => {
            const model = createModel();
            const overlapReserve = createDummyReserve({
                id: 30,
                ruleId: 5,
                isOverlap: true,
                isIgnoreOverlap: true,
                isConflict: true,
            });
            dummyReserveDB.findId.mockResolvedValue(overlapReserve);
            dummyReserveDB.findTimeRanges.mockResolvedValue([]);

            await model.cancel(30);

            expect(dummyReserveDB.updateMany).toHaveBeenCalledTimes(1);
            const diff = dummyReserveDB.updateMany.mock.calls[0][0];
            expect(diff.update).toHaveLength(1);
            expect(diff.update[0].isOverlap).toBe(true);
            expect(diff.update[0].isIgnoreOverlap).toBe(false);
            expect(diff.update[0].isConflict).toBe(false);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });
    });

    describe('removeSkip', () => {
        it('throws ReservationIsNotFound when reserveId does not exist', async () => {
            const model = createModel();
            dummyReserveDB.findId.mockResolvedValue(null);

            await expect(model.removeSkip(999)).rejects.toThrow('ReservationIsNotFound');
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('does nothing when reservation is not a rule reservation (manual reserve)', async () => {
            const model = createModel();
            const manualReserve = createDummyReserve({ id: 10, ruleId: null });
            dummyReserveDB.findId.mockResolvedValue(manualReserve);

            await model.removeSkip(10);

            expect(dummyReserveDB.updateMany).not.toHaveBeenCalled();
            expect(dummyReserveEvent.emitUpdated).not.toHaveBeenCalled();
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('does nothing when reservation is an event relay reservation', async () => {
            const model = createModel();
            const relayReserve = createDummyReserve({ id: 15, ruleId: 3, isEventRelay: true });
            dummyReserveDB.findId.mockResolvedValue(relayReserve);

            await model.removeSkip(15);

            expect(dummyReserveDB.updateMany).not.toHaveBeenCalled();
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('does nothing when reservation is not currently skipped', async () => {
            const model = createModel();
            const notSkippedReserve = createDummyReserve({ id: 20, ruleId: 5, isSkip: false });
            dummyReserveDB.findId.mockResolvedValue(notSkippedReserve);

            await model.removeSkip(20);

            expect(dummyReserveDB.updateMany).not.toHaveBeenCalled();
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('unsets isSkip and updates reservation diff when currently skipped', async () => {
            const model = createModel();
            const skippedReserve = createDummyReserve({ id: 25, ruleId: 5, isSkip: true });
            dummyReserveDB.findId.mockResolvedValue(skippedReserve);
            dummyReserveDB.findTimeRanges.mockResolvedValue([]);

            await model.removeSkip(25);

            expect(dummyReserveDB.updateMany).toHaveBeenCalledTimes(1);
            const diff = dummyReserveDB.updateMany.mock.calls[0][0];
            expect(diff.update).toHaveLength(1);
            expect(diff.update[0].id).toBe(25);
            expect(diff.update[0].isSkip).toBe(false);
            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledWith(diff);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });
    });

    describe('removeOverlap', () => {
        it('throws ReservationIsNotFound when reserveId does not exist', async () => {
            const model = createModel();
            dummyReserveDB.findId.mockResolvedValue(null);

            await expect(model.removeOverlap(999)).rejects.toThrow('ReservationIsNotFound');
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('does nothing when reservation is not a rule reservation', async () => {
            const model = createModel();
            const manualReserve = createDummyReserve({ id: 10, ruleId: null });
            dummyReserveDB.findId.mockResolvedValue(manualReserve);

            await model.removeOverlap(10);

            expect(dummyReserveDB.updateMany).not.toHaveBeenCalled();
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('does nothing when overlap is already removed (isIgnoreOverlap=true, isOverlap=false)', async () => {
            const model = createModel();
            const alreadyRemoved = createDummyReserve({
                id: 20,
                ruleId: 5,
                isIgnoreOverlap: true,
                isOverlap: false,
            });
            dummyReserveDB.findId.mockResolvedValue(alreadyRemoved);

            await model.removeOverlap(20);

            expect(dummyReserveDB.updateMany).not.toHaveBeenCalled();
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('sets isIgnoreOverlap = true and isOverlap = false when overlapping', async () => {
            const model = createModel();
            const overlapping = createDummyReserve({
                id: 30,
                ruleId: 5,
                isIgnoreOverlap: false,
                isOverlap: true,
            });
            dummyReserveDB.findId.mockResolvedValue(overlapping);
            dummyReserveDB.findTimeRanges.mockResolvedValue([]);

            await model.removeOverlap(30);

            expect(dummyReserveDB.updateMany).toHaveBeenCalledTimes(1);
            const diff = dummyReserveDB.updateMany.mock.calls[0][0];
            expect(diff.update).toHaveLength(1);
            expect(diff.update[0].id).toBe(30);
            expect(diff.update[0].isIgnoreOverlap).toBe(true);
            expect(diff.update[0].isOverlap).toBe(false);
            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledWith(diff);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });
    });

    describe('addEventRelay', () => {
        it('returns null and suppresses duplicate reservation when programId is already reserved', async () => {
            const model = createModel();
            dummyReserveDB.findProgramId.mockResolvedValue([createDummyReserve()]);

            const parentReserve = createDummyReserve({ id: 1 });
            const result = await model.addEventRelay(200, parentReserve);

            expect(result).toBeNull();
            expect(dummyReserveDB.insertOnce).not.toHaveBeenCalled();
            expect(dummyReserveEvent.emitUpdated).not.toHaveBeenCalled();
        });

        it('throws ProgramIsNotFound when target program does not exist', async () => {
            const model = createModel();
            dummyReserveDB.findProgramId.mockResolvedValue([]);
            dummyProgramDB.findId.mockResolvedValue(null);

            const parentReserve = createDummyReserve({ id: 1 });
            await expect(model.addEventRelay(200, parentReserve)).rejects.toThrow('ProgramIsNotFound');
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('inherits rule options, encode options, and directory from parent reserve and inserts new relay reserve', async () => {
            const model = createModel();
            dummyReserveDB.findProgramId.mockResolvedValue([]);

            const relayProgram = new Program();
            relayProgram.id = 300;
            relayProgram.channelId = 1;
            relayProgram.channel = '27';
            relayProgram.channelType = 'GR';
            relayProgram.name = 'Relayed Match Extra Time';
            relayProgram.halfWidthName = 'Relayed Match Extra Time';
            relayProgram.description = '';
            relayProgram.halfWidthDescription = '';
            relayProgram.startAt = 3000000;
            relayProgram.endAt = 4000000;

            dummyProgramDB.findId.mockResolvedValue(relayProgram);
            dummyReserveDB.findTimeRanges.mockResolvedValue([]);
            dummyReserveDB.insertOnce.mockResolvedValue(999);

            const parentReserve = createDummyReserve({
                id: 1,
                ruleId: 77,
                allowEndLack: false,
                tags: '["Sports"]',
                parentDirectoryName: 'storage1',
                directory: 'soccer',
                recordedFormat: '%TITLE%',
                encodeMode1: 'H.264',
                encodeParentDirectoryName1: 'storage2',
                encodeDirectory1: 'encoded',
                isDeleteOriginalAfterEncode: true,
            });

            const insertedId = await model.addEventRelay(300, parentReserve);

            expect(insertedId).toBe(999);
            expect(dummyReserveDB.insertOnce).toHaveBeenCalledTimes(1);

            const insertedReserve: Reserve = dummyReserveDB.insertOnce.mock.calls[0][0];
            expect(insertedReserve.isEventRelay).toBe(true);
            expect(insertedReserve.ruleId).toBe(77);
            expect(insertedReserve.programId).toBe(300);
            expect(insertedReserve.name).toBe('Relayed Match Extra Time');
            expect(insertedReserve.allowEndLack).toBe(false);
            expect(insertedReserve.tags).toBe('["Sports"]');
            expect(insertedReserve.parentDirectoryName).toBe('storage1');
            expect(insertedReserve.directory).toBe('soccer');
            expect(insertedReserve.encodeMode1).toBe('H.264');
            expect(insertedReserve.encodeParentDirectoryName1).toBe('storage2');
            expect(insertedReserve.isDeleteOriginalAfterEncode).toBe(true);

            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledTimes(1);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });
    });

    describe('cleanup', () => {
        it('deletes old reserves and emits updated event when old reserves exist', async () => {
            const model = createModel();
            const oldReserves = [createDummyReserve({ id: 1 }), createDummyReserve({ id: 2 })];
            dummyReserveDB.findOldTime.mockResolvedValue(oldReserves);

            await model.cleanup();

            expect(dummyReserveDB.findOldTime).toHaveBeenCalledTimes(1);
            expect(dummyReserveDB.updateMany).toHaveBeenCalledWith({
                delete: oldReserves,
                isSuppressLog: false,
            });
            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledWith({
                delete: oldReserves,
                isSuppressLog: false,
            });
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('emits updated event even when there are no old reserves to clean up', async () => {
            const model = createModel();
            dummyReserveDB.findOldTime.mockResolvedValue([]);

            await model.cleanup();

            expect(dummyReserveDB.updateMany).toHaveBeenCalledWith({
                delete: [],
                isSuppressLog: false,
            });
            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledWith({
                delete: [],
                isSuppressLog: false,
            });
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });
    });

    describe('edit', () => {
        it('throws ReservationEditError when option checker returns false', async () => {
            const model = createModel();
            dummyOptionChecker.checkEncodeOption.mockReturnValue(false);

            await expect(
                model.edit(1, {
                    allowEndLack: true,
                    encodeOption: {
                        mode1: 'H.264',
                    },
                } as any),
            ).rejects.toThrow('ReservationEditError');
        });

        it('throws ReservationIsNotFound when reserveId does not exist', async () => {
            const model = createModel();
            dummyReserveDB.findId.mockResolvedValue(null);

            await expect(
                model.edit(999, {
                    allowEndLack: true,
                } as any),
            ).rejects.toThrow('ReservationIsNotFound');
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('updates options on a rule reservation as well as manual reservation', async () => {
            const model = createModel();
            const ruleReserve = createDummyReserve({ id: 50, ruleId: 10 });
            dummyReserveDB.findId.mockResolvedValue(ruleReserve);

            await model.edit(50, {
                allowEndLack: false,
            });

            expect(dummyReserveDB.updateOnce).toHaveBeenCalledTimes(1);
            const updated = dummyReserveDB.updateOnce.mock.calls[0][0];
            expect(updated.allowEndLack).toBe(false);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });

        it('updates manual reservation options and emits updated event', async () => {
            const model = createModel();
            const manualReserve = createDummyReserve({ id: 60, ruleId: null, allowEndLack: true });
            dummyReserveDB.findId.mockResolvedValue(manualReserve);

            await model.edit(60, {
                allowEndLack: false,
                tags: [1, 2],
                saveOption: {
                    parentDirectoryName: 'storage_hdd',
                    directory: 'anime',
                },
                encodeOption: {
                    mode1: 'H.264',
                    encodeParentDirectoryName1: 'storage_ssd',
                    directory1: 'h264',
                    isDeleteOriginalAfterEncode: false,
                },
            });

            expect(dummyReserveDB.updateOnce).toHaveBeenCalledTimes(1);
            const updated: Reserve = dummyReserveDB.updateOnce.mock.calls[0][0];
            expect(updated.allowEndLack).toBe(false);
            expect(updated.tags).toBe(JSON.stringify([1, 2]));
            expect(updated.parentDirectoryName).toBe('storage_hdd');
            expect(updated.directory).toBe('anime');
            expect(updated.encodeMode1).toBe('H.264');
            expect(updated.encodeParentDirectoryName1).toBe('storage_ssd');
            expect(updated.encodeDirectory1).toBe('h264');
            expect(updated.isDeleteOriginalAfterEncode).toBe(false);

            expect(dummyReserveEvent.emitUpdated).toHaveBeenCalledTimes(1);
            expect(dummyExec.unLockExecution).toHaveBeenCalledTimes(1);
        });
    });
});
