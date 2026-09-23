import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as apid from '../../api.js';
import EncodeManageModel from '../../src/model/service/encode/EncodeManageModel.js';

describe('EncodeManageModel Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummyExecuteManagementModel: any;
    let dummyEncodeEvent: any;
    let dummyEncoderModelProvider: any;
    let createdEncoders: any[];

    beforeEach(() => {
        createdEncoders = [];
        dummyLogger = {
            getLogger: () => ({
                encode: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyConfig = {
            getConfig: () => ({
                encode: { concurrency: 2 },
            }),
        };
        dummyExecuteManagementModel = {
            getExecution: vi.fn().mockImplementation((priority: number) => Promise.resolve(`exe-${priority}`)),
            unLockExecution: vi.fn(),
        };
        dummyEncodeEvent = {
            emitAddEncode: vi.fn(),
            emitFinishEncode: vi.fn(),
            emitCancelEncode: vi.fn(),
            emitErrorEncode: vi.fn(),
        };

        dummyEncoderModelProvider = vi.fn().mockImplementation(() => {
            let finishCallback: ((isError: boolean, outputFilePath: string | null) => void) | null = null;
            let currentOption: any = null;

            const encoder = {
                setOption: vi.fn().mockImplementation(opt => {
                    currentOption = opt;
                }),
                getEncodeOption: vi.fn().mockImplementation(() => currentOption),
                getEncodeId: vi.fn().mockImplementation(() => currentOption?.encodeId),
                setOnFinish: vi.fn().mockImplementation(cb => {
                    finishCallback = cb;
                }),
                start: vi.fn().mockResolvedValue(undefined),
                cancel: vi.fn().mockResolvedValue(undefined),
                triggerFinish: (isError: boolean, path: string | null) => {
                    if (finishCallback) {
                        finishCallback(isError, path);
                    }
                },
            };
            createdEncoders.push(encoder);
            return Promise.resolve(encoder);
        });
    });

    const createModel = () => {
        return new EncodeManageModel(
            dummyLogger,
            dummyConfig,
            dummyExecuteManagementModel,
            dummyEncoderModelProvider,
            dummyEncodeEvent,
        );
    };

    describe('push & concurrency queueing', () => {
        it('throws ConcurrentEncodeNumIsZero when concurrency is zero or negative', async () => {
            dummyConfig.getConfig = () => ({ encode: { concurrency: 0 } });
            const model = createModel();

            await expect(
                model.push({
                    recordedId: 1,
                    sourceVideoFileId: 10,
                    parentDir: 'default',
                    mode: 'H.264',
                    removeOriginal: false,
                } as any),
            ).rejects.toThrow('ConcurrentEncodeNumIsZero');
        });

        it('pushes encode task and automatically starts execution within concurrency limit', async () => {
            const model = createModel();
            const option: apid.AddEncodeProgramOption = {
                recordedId: 1,
                sourceVideoFileId: 10,
                parentDir: 'default',
                mode: 'H.264',
                removeOriginal: false,
            };

            const encodeId = await model.push(option);
            expect(encodeId).toBe(1);
            expect(dummyEncoderModelProvider).toHaveBeenCalled();
            expect(dummyEncodeEvent.emitAddEncode).toHaveBeenCalledWith(1);

            // queue check が走り encoder.start() が呼ばれること
            const encoder = createdEncoders[0];
            expect(encoder.start).toHaveBeenCalled();
            expect(model.getRecordedIndex()[1]).toEqual([{ encodeId: 1, name: 'H.264' }]);
        });

        it('limits concurrent tasks and advances waitQueue when running task finishes', async () => {
            dummyConfig.getConfig = () => ({ encode: { concurrency: 1 } });
            const model = createModel();

            // 1つ目のタスク
            await model.push({
                recordedId: 1,
                sourceVideoFileId: 10,
                parentDir: 'default',
                mode: 'H.264',
                removeOriginal: false,
            });

            // 2つ目のタスク（concurrency=1 のため待機）
            await model.push({
                recordedId: 2,
                sourceVideoFileId: 20,
                parentDir: 'default',
                mode: 'H.265',
                removeOriginal: false,
            });

            const encoder1 = createdEncoders[0];
            const encoder2 = createdEncoders[1];

            expect(encoder1.start).toHaveBeenCalled();
            expect(encoder2.start).not.toHaveBeenCalled(); // まだ開始されない

            // 1つ目のタスクが終了
            encoder1.triggerFinish(false, '/record/output1.mp4');

            // 非同期でキューがチェックされて2つ目が開始されるのを待つ
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(encoder2.start).toHaveBeenCalled();
            expect(dummyEncodeEvent.emitFinishEncode).toHaveBeenCalledWith(
                expect.objectContaining({ recordedId: 1, mode: 'H.264' }),
            );
        });
    });

    describe('removeOriginal safety protection', () => {
        it('suppresses removeOriginal if another job in queue shares the same sourceVideoFileId', async () => {
            dummyConfig.getConfig = () => ({ encode: { concurrency: 2 } });
            const model = createModel();

            // 同一元TSファイル（sourceVideoFileId: 10）に対する2系統のエンコード
            await model.push({
                recordedId: 1,
                sourceVideoFileId: 10,
                parentDir: 'default',
                mode: 'H.264',
                removeOriginal: true,
            });
            await model.push({
                recordedId: 1,
                sourceVideoFileId: 10,
                parentDir: 'default',
                mode: 'H.265',
                removeOriginal: true,
            });

            const encoder1 = createdEncoders[0];
            const encoder2 = createdEncoders[1];

            // 先に1つ目が終了（2つ目がまだ runningQueue に残っている）
            encoder1.triggerFinish(false, '/record/output1.mp4');

            // 1つ目の終了イベントでは、2系統目のエンコードのために removeOriginal が強制的に false に保護されること！
            expect(dummyEncodeEvent.emitFinishEncode).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: 'H.264',
                    removeOriginal: false,
                }),
            );

            // 1つ目の finalize が runningQueue をクリーンアップするのを待機
            await new Promise(resolve => setTimeout(resolve, 50));

            // 続いて2つ目が終了
            encoder2.triggerFinish(false, '/record/output2.mp4');

            // 2つ目の終了イベントでは、他に同じ元ファイルを待つジョブがないため removeOriginal: true で通知されること！
            expect(dummyEncodeEvent.emitFinishEncode).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: 'H.265',
                    removeOriginal: true,
                }),
            );
        });
    });

    describe('cancel & cancelEncodeByRecordedId', () => {
        it('cancels running encode task', async () => {
            const model = createModel();
            await model.push({
                recordedId: 1,
                sourceVideoFileId: 10,
                parentDir: 'default',
                mode: 'H.264',
                removeOriginal: false,
            });

            const encoder = createdEncoders[0];
            await model.cancel(1);

            expect(encoder.cancel).toHaveBeenCalled();
            expect(dummyEncodeEvent.emitCancelEncode).toHaveBeenCalledWith(1);
        });

        it('cancels all encode tasks associated with a recordedId', async () => {
            dummyConfig.getConfig = () => ({ encode: { concurrency: 1 } });
            const model = createModel();

            await model.push({
                recordedId: 100,
                sourceVideoFileId: 10,
                parentDir: 'default',
                mode: 'H.264',
                removeOriginal: false,
            });
            await model.push({
                recordedId: 100,
                sourceVideoFileId: 10,
                parentDir: 'default',
                mode: 'H.265',
                removeOriginal: false,
            });

            await model.cancelEncodeByRecordedId(100);

            expect(createdEncoders[0].cancel).toHaveBeenCalled();
            expect(dummyEncodeEvent.emitCancelEncode).toHaveBeenCalledWith(1);
            expect(dummyEncodeEvent.emitCancelEncode).toHaveBeenCalledWith(2);
        });
    });
});
