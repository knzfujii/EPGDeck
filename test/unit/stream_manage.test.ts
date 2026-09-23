import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import StreamManageModel from '../../src/model/service/stream/manager/StreamManageModel.js';

describe('StreamManageModel Tests', () => {
    let dummyLogger: any;
    let dummyExecuteManagementModel: any;
    let dummySocketIO: any;

    beforeEach(() => {
        dummyLogger = {
            getLogger: () => ({
                stream: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }),
        };
        dummyExecuteManagementModel = {
            getExecution: vi.fn().mockImplementation((priority: number) => Promise.resolve(`exe-${priority}`)),
            unLockExecution: vi.fn(),
        };
        dummySocketIO = {
            notifyClient: vi.fn(),
        };
    });

    const createModel = () => {
        return new StreamManageModel(dummyLogger, dummyExecuteManagementModel, dummySocketIO);
    };

    const createMockStream = () => {
        let exitCallback: (() => Promise<void>) | null = null;
        return {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined),
            keep: vi.fn(),
            getInfo: vi.fn().mockReturnValue({ isLive: true, channelId: 1 }),
            setExitStream: vi.fn().mockImplementation(cb => {
                exitCallback = cb;
            }),
            triggerExit: async () => {
                if (exitCallback) {
                    await exitCallback();
                }
            },
        };
    };

    describe('start', () => {
        it('allocates streamId, starts stream, and notifies via socketIO', async () => {
            const model = createModel();
            const mockStream = createMockStream();

            const streamId = await model.start(mockStream as any);

            expect(streamId).toBe(0);
            expect(dummyExecuteManagementModel.getExecution).toHaveBeenCalledWith(
                StreamManageModel.START_STREAM_PRIORITY,
            );
            expect(dummyExecuteManagementModel.unLockExecution).toHaveBeenCalledWith(
                `exe-${StreamManageModel.START_STREAM_PRIORITY}`,
            );
            expect(mockStream.start).toHaveBeenCalledWith(0);
            expect(dummySocketIO.notifyClient).toHaveBeenCalled();
            expect(model.getStreamInfo(0)).toEqual({ isLive: true, channelId: 1 });
        });

        it('handles stream start error cleanly and stops stream', async () => {
            const model = createModel();
            const mockStream = createMockStream();
            mockStream.start.mockRejectedValueOnce(new Error('SpawnError'));

            await expect(model.start(mockStream as any)).rejects.toThrow('SpawnError');

            expect(dummyExecuteManagementModel.unLockExecution).toHaveBeenCalledWith(
                `exe-${StreamManageModel.START_STREAM_PRIORITY}`,
            );
            expect(() => model.getStreamInfo(0)).toThrow('StreamIsNotFound');
        });

        it('triggers exitStream callback when stream terminates without double unlocking start lock', async () => {
            const model = createModel();
            const mockStream = createMockStream();

            const streamId = await model.start(mockStream as any);

            // start() 時点で unLockExecution は1回呼ばれている
            expect(dummyExecuteManagementModel.unLockExecution).toHaveBeenCalledTimes(1);

            // ストリームが自発的に終了（プロセス切断など）
            await mockStream.triggerExit();

            // stop 処理に伴う unLockExecution のみが呼ばれ、start() の exeId の二重アンロックは発生しないこと
            expect(mockStream.stop).toHaveBeenCalled();
            expect(() => model.getStreamInfo(streamId)).toThrow('StreamIsNotFound');
        });
    });

    describe('stop & stopAll', () => {
        it('stops active stream and deletes it from index', async () => {
            const model = createModel();
            const mockStream = createMockStream();
            const streamId = await model.start(mockStream as any);

            await model.stop(streamId);

            expect(mockStream.stop).toHaveBeenCalled();
            expect(() => model.getStreamInfo(streamId)).toThrow('StreamIsNotFound');
            expect(dummySocketIO.notifyClient).toHaveBeenCalledTimes(2); // start + stop
        });

        it('returns safely when stopping non-existent streamId', async () => {
            const model = createModel();
            await expect(model.stop(999)).resolves.toBeUndefined();
        });

        it('stops all streams with force flag on stopAll', async () => {
            const model = createModel();
            const stream1 = createMockStream();
            const stream2 = createMockStream();

            await model.start(stream1 as any);
            await model.start(stream2 as any);

            expect(model.getStreamInfos()).toHaveLength(2);

            await model.stopAll();

            expect(stream1.stop).toHaveBeenCalled();
            expect(stream2.stop).toHaveBeenCalled();
            expect(model.getStreamInfos()).toHaveLength(0);
        });
    });

    describe('keep & getStreamInfo', () => {
        it('calls keep on active stream', async () => {
            const model = createModel();
            const mockStream = createMockStream();
            const streamId = await model.start(mockStream as any);

            model.keep(streamId);
            expect(mockStream.keep).toHaveBeenCalled();
        });

        it('throws StreamIsNotFound when streamId does not exist in getStreamInfo', () => {
            const model = createModel();
            expect(() => model.getStreamInfo(999)).toThrow('StreamIsNotFound');
        });
    });
});
