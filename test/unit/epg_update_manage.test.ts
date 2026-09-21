import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EPGUpdateManageModel from '../../src/model/epgUpdater/EPGUpdateManageModel.js';

describe('EPGUpdateManageModel deleteOldPrograms Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyMirakurunClientModel: any;
    let dummyChannelDB: any;
    let dummyProgramDB: any;

    beforeEach(() => {
        vi.restoreAllMocks();

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };

        dummyConfig = {
            getConfig: () => ({
                epg: {},
                server: { mirakurun: 'http://localhost:40772' },
            }),
        };

        dummyMirakurunClientModel = {
            getClient: () => ({}),
        };

        dummyChannelDB = {};

        dummyProgramDB = {
            deleteOld: vi.fn().mockResolvedValue(undefined),
        };
    });

    it('should delete programs older than 24 hours ago', async () => {
        const model = new EPGUpdateManageModel(
            dummyLogger,
            dummyConfig,
            dummyMirakurunClientModel,
            dummyChannelDB,
            dummyProgramDB,
        );

        const beforeTime = Date.now();
        await model.deleteOldPrograms();
        const afterTime = Date.now();

        expect(dummyProgramDB.deleteOld).toHaveBeenCalledTimes(1);
        const deleteTimeArg = dummyProgramDB.deleteOld.mock.calls[0][0];

        const KEEP_PERIOD_MS = 24 * 60 * 60 * 1000;
        expect(deleteTimeArg).toBeGreaterThanOrEqual(beforeTime - KEEP_PERIOD_MS);
        expect(deleteTimeArg).toBeLessThanOrEqual(afterTime - KEEP_PERIOD_MS);
    });
});
