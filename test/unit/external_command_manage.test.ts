import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Recorded from '../../src/db/entities/Recorded.js';
import Reserve from '../../src/db/entities/Reserve.js';
import ProcessUtil from '../../src/util/ProcessUtil.js';
import PromiseQueue from '../../src/model/PromiseQueue.js';
import ExternalCommandManageModel from '../../src/model/operator/externalCommand/ExternalCommandManageModel.js';

const spawnedCommands = vi.hoisted(() => [] as any[]);
vi.mock('child_process', () => ({
    spawn: vi.fn((bin: any, args: any, options: any) => {
        spawnedCommands.push({ bin, args, options });
        const mockChild: any = {
            exitCode: 0,
            on: vi.fn((event: string, cb: () => void) => {
                if (event === 'exit') {
                    cb();
                }
            }),
            removeAllListeners: vi.fn(),
        };
        return mockChild;
    }),
}));

describe('ExternalCommandManageModel Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyChannelDB: any;
    let dummyRecordedDB: any;
    let dummyVideoUtil: any;
    let queue: PromiseQueue;

    beforeEach(() => {
        spawnedCommands.length = 0;
        vi.spyOn(ProcessUtil, 'parseCmdStr').mockImplementation((cmd: string) => {
            const parts = cmd.split(' ');
            return {
                bin: parts[0],
                args: parts.slice(1),
            };
        });
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyConfig = {
            getConfig: () => ({
                hooks: {
                    reserveNewAddition: '/usr/local/bin/hook_reserve_add %NAME%',
                    reserveUpdate: '/usr/local/bin/hook_reserve_update',
                    reserveDeleted: '/usr/local/bin/hook_reserve_delete',
                    recordingStart: '/usr/local/bin/hook_rec_start',
                    recordingFinish: '/usr/local/bin/hook_rec_finish',
                    recordingFailed: '/usr/local/bin/hook_rec_failed',
                    encodingFinish: '/usr/local/bin/hook_enc_finish',
                },
            }),
        };
        dummyChannelDB = {
            findId: vi.fn().mockResolvedValue({ id: 1, name: 'NHK総合', halfWidthName: 'NHK総合' }),
        };
        dummyRecordedDB = {
            findId: vi.fn(),
        };
        dummyVideoUtil = {
            getFullFilePathFromId: vi.fn().mockResolvedValue('/record/video.mp4'),
        };
        queue = new PromiseQueue();
    });

    const createModel = () => {
        return new ExternalCommandManageModel(
            dummyLogger,
            dummyConfig,
            queue,
            dummyChannelDB,
            dummyRecordedDB,
            dummyVideoUtil,
        );
    };

    describe('addUpdateReserves', () => {
        it('executes reserveNewAddition hook on diff.insert with correct env vars', async () => {
            const model = createModel();
            const reserve = new Reserve();
            reserve.id = 10;
            reserve.channelId = 1;
            reserve.name = 'Test Reserve';
            reserve.halfWidthName = 'Test Reserve';
            reserve.startAt = new Date('2026-09-23T10:00:00+09:00').getTime();
            reserve.endAt = new Date('2026-09-23T10:30:00+09:00').getTime();

            model.addUpdateReserves({
                insert: [reserve],
                isSuppressLog: false,
            });

            // queue が完了するのを待つ
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(spawnedCommands).toHaveLength(1);
            expect(spawnedCommands[0].bin).toBe('/usr/local/bin/hook_reserve_add');
            expect(spawnedCommands[0].options.env.RESERVEID).toBe(10);
            expect(spawnedCommands[0].options.env.NAME).toBe('Test Reserve');
            expect(spawnedCommands[0].options.env.CHANNELNAME).toBe('NHK総合');
        });

        it('works via addUpdateReseves backward-compatible alias', async () => {
            const model = createModel();
            const reserve = new Reserve();
            reserve.id = 20;
            reserve.channelId = 1;
            reserve.name = 'Alias Test';
            reserve.startAt = 1000;
            reserve.endAt = 2000;

            model.addUpdateReseves({
                update: [reserve],
                isSuppressLog: false,
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(spawnedCommands).toHaveLength(1);
            expect(spawnedCommands[0].bin).toBe('/usr/local/bin/hook_reserve_update');
            expect(spawnedCommands[0].options.env.RESERVEID).toBe(20);
        });

        it('does nothing when hooks are not configured', async () => {
            dummyConfig.getConfig = () => ({ hooks: {} });
            const model = createModel();

            model.addUpdateReserves({
                insert: [new Reserve()],
                update: [new Reserve()],
                delete: [new Reserve()],
                isSuppressLog: false,
            });

            await new Promise(resolve => setTimeout(resolve, 50));
            expect(spawnedCommands).toHaveLength(0);
        });
    });

    describe('recording & encoding hooks', () => {
        it('executes recordingFinish hook with recorded metadata', async () => {
            const model = createModel();
            const recorded = new Recorded();
            recorded.id = 100;
            recorded.channelId = 1;
            recorded.name = 'Finish Show';
            recorded.halfWidthName = 'Finish Show';
            recorded.startAt = 1000;
            recorded.endAt = 2000;

            model.addRecordingFinishCmd(recorded);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(spawnedCommands).toHaveLength(1);
            expect(spawnedCommands[0].bin).toBe('/usr/local/bin/hook_rec_finish');
            expect(spawnedCommands[0].options.env.RECORDEDID).toBe(100);
            expect(spawnedCommands[0].options.env.NAME).toBe('Finish Show');
        });

        it('executes encodingFinish hook with output file path', async () => {
            const model = createModel();
            const recorded = new Recorded();
            recorded.id = 100;
            recorded.channelId = 1;
            recorded.name = 'Encode Show';
            dummyRecordedDB.findId.mockResolvedValue(recorded);

            model.addEncodingFinishCmd({
                recordedId: 100,
                videoFileId: 50,
                mode: 'H.264',
            } as any);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(spawnedCommands).toHaveLength(1);
            expect(spawnedCommands[0].bin).toBe('/usr/local/bin/hook_enc_finish');
            expect(spawnedCommands[0].options.env.RECORDEDID).toBe(100);
            expect(spawnedCommands[0].options.env.OUTPUTPATH).toBe('/record/video.mp4');
            expect(spawnedCommands[0].options.env.MODE).toBe('H.264');
        });
    });
});
