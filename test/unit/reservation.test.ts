import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import Program from '../../src/db/entities/Program';
import ReservationManageModel from '../../src/model/operator/reservation/ReservationManageModel';

describe('ReservationManageModel', () => {
    const dummyLogger: any = {
        getLogger: () => ({
            system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
        }),
    };
    const dummyConfig: any = {
        getConfig: () => ({ isSuppressReservesUpdateAllLog: true }),
    };
    const dummyExec: any = {
        getExecution: vi.fn().mockResolvedValue(1),
        unLockExecution: vi.fn(),
    };
    const dummyOptionChecker: any = {
        checkRuleOption: vi.fn().mockReturnValue(true),
    };
    const dummyReserveDB: any = {
        findProgramId: vi.fn().mockResolvedValue([]),
        findOldTime: vi.fn().mockResolvedValue([]),
        findTimeRanges: vi.fn().mockResolvedValue([]),
        getTimeRanges: vi.fn().mockResolvedValue([]),
        getRuleReserves: vi.fn().mockResolvedValue([]),
        findOverlap: vi.fn().mockResolvedValue([]),
        insertOnce: vi.fn().mockResolvedValue(100),
        updateMany: vi.fn().mockResolvedValue(undefined),
    };
    const dummyChannelDB: any = {};
    const dummyRuleDB: any = {};
    const dummyReserveEvent: any = {
        emitUpdated: vi.fn(),
    };

    it('should reject manual reservation if program is already ended', async () => {
        const now = Date.now();
        const endedProgram = new Program();
        endedProgram.id = 12345;
        endedProgram.channelId = 1;
        endedProgram.startAt = now - 3600000;
        endedProgram.endAt = now - 60000; // 1分前に終了
        endedProgram.name = 'Ended Program';
        endedProgram.halfWidthName = 'Ended Program';
        endedProgram.description = '';
        endedProgram.halfWidthDescription = '';

        const dummyProgramDB: any = {
            findId: vi.fn().mockResolvedValue(endedProgram),
        };

        const reservationModel = new ReservationManageModel(
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

        await expect(
            reservationModel.add({
                programId: 12345,
            } as any),
        ).rejects.toThrow('ProgramIsAlreadyEnded');
    });

    it('should allow manual reservation if program is currently broadcasting or in future', async () => {
        const now = Date.now();
        const futureProgram = new Program();
        futureProgram.id = 67890;
        futureProgram.channelId = 1;
        futureProgram.startAt = now + 3600000;
        futureProgram.endAt = now + 7200000; // 2時間後に終了
        futureProgram.name = 'Future Program';
        futureProgram.halfWidthName = 'Future Program';
        futureProgram.description = '';
        futureProgram.halfWidthDescription = '';
        futureProgram.rawExtended = null;
        futureProgram.genre1 = null;
        futureProgram.subGenre1 = null;
        futureProgram.genre2 = null;
        futureProgram.subGenre2 = null;
        futureProgram.genre3 = null;
        futureProgram.subGenre3 = null;
        futureProgram.videoType = null;
        futureProgram.videoResolution = null;
        futureProgram.videoStreamContent = null;
        futureProgram.videoComponentType = null;
        futureProgram.audioSamplingRate = null;
        futureProgram.audioComponentType = null;
        futureProgram.isFree = true;

        const dummyProgramDB: any = {
            findId: vi.fn().mockResolvedValue(futureProgram),
        };

        const dummyReserveDBWithMock: any = {
            ...dummyReserveDB,
            getRuleReserves: vi.fn().mockResolvedValue([]),
            getTimeRanges: vi.fn().mockResolvedValue([]),
            findOverlap: vi.fn().mockResolvedValue([]),
        };

        const reservationModel = new ReservationManageModel(
            dummyLogger,
            dummyConfig,
            dummyExec,
            dummyOptionChecker,
            dummyReserveDBWithMock,
            dummyChannelDB,
            dummyProgramDB,
            dummyRuleDB,
            dummyReserveEvent,
        );

        vi.spyOn(reservationModel as any, 'checkSingleReserveConflict').mockResolvedValue(undefined);

        const reserveId = await reservationModel.add({
            programId: 67890,
        } as any);

        expect(reserveId).toBe(100);
    });
});
