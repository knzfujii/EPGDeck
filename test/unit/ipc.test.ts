import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'events';
import IPCServer from '../../src/model/ipc/IPCServer.js';
import IPCClient from '../../src/model/ipc/IPCClient.js';
import { ModelName, ReservationFunctions, RecordingFunctions } from '../../src/model/ipc/IPCMessageDefine.js';

describe('IPC Subsystem Unit Tests', () => {
    describe('IPCServer', () => {
        let dummyReservationManage: any;
        let dummyRecordedManage: any;
        let dummyRecordedTagManage: any;
        let dummyRecordingManage: any;
        let dummyRuleManage: any;
        let dummyThumbnailManage: any;
        let dummyEncodeEvent: any;
        let dummyRecordedDB: any;
        let dummyReserveDB: any;
        let mockChild: any;
        let server: IPCServer;

        beforeEach(() => {
            dummyReservationManage = {
                cancel: vi.fn().mockResolvedValue(undefined),
                edit: vi.fn().mockResolvedValue(undefined),
                addEventRelay: vi.fn().mockResolvedValue(undefined),
                updateRule: vi.fn().mockResolvedValue(undefined),
            };
            dummyRecordedManage = {
                delete: vi.fn().mockResolvedValue(undefined),
                changeProtect: vi.fn().mockResolvedValue(undefined),
                updateVideoFileSize: vi.fn().mockResolvedValue(undefined),
                addVideoFile: vi.fn().mockResolvedValue(100),
                createNewRecorded: vi.fn().mockResolvedValue(200),
                addUploadedVideoFile: vi.fn().mockResolvedValue(300),
                deleteVideoFile: vi.fn().mockResolvedValue(undefined),
            };
            dummyRecordedTagManage = {
                create: vi.fn().mockResolvedValue(1),
                update: vi.fn().mockResolvedValue(undefined),
                setRelation: vi.fn().mockResolvedValue(undefined),
                delete: vi.fn().mockResolvedValue(undefined),
                deleteRelation: vi.fn().mockResolvedValue(undefined),
            };
            dummyRecordingManage = {
                resetTimer: vi.fn().mockResolvedValue(undefined),
                finish: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn().mockResolvedValue(undefined),
                discard: vi.fn().mockResolvedValue(undefined),
            };
            dummyRuleManage = {
                add: vi.fn().mockResolvedValue(10),
                update: vi.fn().mockResolvedValue(undefined),
                enable: vi.fn().mockResolvedValue(undefined),
                disable: vi.fn().mockResolvedValue(undefined),
                delete: vi.fn().mockResolvedValue(undefined),
            };
            dummyThumbnailManage = {
                regenerate: vi.fn().mockResolvedValue(undefined),
            };
            dummyEncodeEvent = {
                emitFinishEncode: vi.fn(),
            };
            dummyRecordedDB = {};
            dummyReserveDB = {};

            const emitter = new EventEmitter();
            mockChild = Object.assign(emitter, {
                send: vi.fn(),
                connected: true,
            });

            server = new IPCServer(
                dummyReservationManage,
                dummyRecordedManage,
                dummyRecordedTagManage,
                dummyRecordingManage,
                dummyRuleManage,
                dummyThumbnailManage,
                dummyEncodeEvent,
                dummyRecordedDB,
                dummyReserveDB,
            );
            server.register(mockChild);
        });

        it('dispatches client request to target model and sends back result', async () => {
            const req = {
                id: 12345,
                model: ModelName.recording,
                func: RecordingFunctions.finish,
                args: { reserveId: 99 },
            };

            mockChild.emit('message', req);

            // Allow async handler to execute
            await new Promise(r => setTimeout(r, 10));

            expect(dummyRecordingManage.finish).toHaveBeenCalledWith(99);
            expect(mockChild.send).toHaveBeenCalledWith({
                id: 12345,
                result: undefined,
            });
        });

        it('handles execution errors and sends back error reply', async () => {
            dummyReservationManage.cancel.mockRejectedValue(new Error('CancelFailed'));

            const req = {
                id: 12346,
                model: ModelName.reservation,
                func: ReservationFunctions.cancel,
                args: { reserveId: 88 },
            };

            mockChild.emit('message', req);
            await new Promise(r => setTimeout(r, 10));

            expect(mockChild.send).toHaveBeenCalledWith({
                id: 12346,
                error: 'CancelFailed',
            });
        });

        it('returns IPCFunctionError when requested model or function does not exist', async () => {
            const req = {
                id: 12347,
                model: 'unknownModel',
                func: 'unknownFunc',
            };

            mockChild.emit('message', req);
            await new Promise(r => setTimeout(r, 10));

            expect(mockChild.send).toHaveBeenCalledWith({
                id: 12347,
                error: 'IPCFunctionError',
            });
        });

        it('handles return value from RPC call (e.g. reservation.add)', async () => {
            dummyReservationManage.add = vi.fn().mockResolvedValue(999);

            const req = {
                id: 12348,
                model: ModelName.reservation,
                func: ReservationFunctions.add,
                args: { option: { programId: 10 } },
            };

            mockChild.emit('message', req);
            await new Promise(r => setTimeout(r, 10));

            expect(dummyReservationManage.add).toHaveBeenCalledWith({ programId: 10 });
            expect(mockChild.send).toHaveBeenCalledWith({
                id: 12348,
                result: 999,
            });
        });

        it('returns IPCArgsError reply when required argument is missing', async () => {
            const req = {
                id: 12349,
                model: ModelName.reservation,
                func: ReservationFunctions.update,
                // reserveId is intentionally missing
                args: {},
            };

            mockChild.emit('message', req);
            await new Promise(r => setTimeout(r, 10));

            expect(mockChild.send).toHaveBeenCalledWith({
                id: 12349,
                error: 'IPCArgsError',
            });
        });

        it('sends push messages to registered child process', () => {
            server.notifyClient();
            expect(mockChild.send).toHaveBeenCalledWith({ type: 'notifyClient' });

            const encodeOption: any = { recordedId: 1, mode: 'mp4' };
            server.setEncode(encodeOption);
            expect(mockChild.send).toHaveBeenCalledWith({
                type: 'pushEncode',
                value: encodeOption,
            });

            const logEntry: any = { message: 'hello' };
            server.pushLog(logEntry);
            expect(mockChild.send).toHaveBeenCalledWith({
                type: 'pushLog',
                entry: logEntry,
            });
        });

        it('throws ChildIsNull when setEncode called without child process', () => {
            const unregServer = new IPCServer(
                dummyReservationManage,
                dummyRecordedManage,
                dummyRecordedTagManage,
                dummyRecordingManage,
                dummyRuleManage,
                dummyThumbnailManage,
                dummyEncodeEvent,
                dummyRecordedDB,
                dummyReserveDB,
            );

            expect(() => unregServer.setEncode({} as any)).toThrow('ChildIsNull');
        });
    });

    describe('IPCClient', () => {
        let dummyLogger: any;
        let dummySocketIO: any;
        let dummyEncodeManage: any;
        let dummyLogManage: any;
        let originalSend: any;
        let client: IPCClient;

        beforeEach(() => {
            dummyLogger = {
                getLogger: () => ({
                    system: { error: vi.fn(), fatal: vi.fn() },
                }),
            };
            dummySocketIO = {
                notifyClient: vi.fn(),
            };
            dummyEncodeManage = {
                push: vi.fn().mockResolvedValue(1),
            };
            dummyLogManage = {
                push: vi.fn(),
            };

            originalSend = process.send;
            process.send = vi.fn() as any;

            client = new IPCClient(dummyLogger, dummySocketIO, dummyEncodeManage, dummyLogManage);
        });

        afterEach(() => {
            process.send = originalSend;
            client.destroy();
        });

        it('handles parent push messages (notifyClient, pushEncode, pushLog)', async () => {
            (process as any).emit('message', { type: 'notifyClient' } as any);
            expect(dummySocketIO.notifyClient).toHaveBeenCalled();

            const encodeOption = { recordedId: 10 };
            (process as any).emit('message', { type: 'pushEncode', value: encodeOption } as any);
            await new Promise(r => setTimeout(r, 10));
            expect(dummyEncodeManage.push).toHaveBeenCalledWith(encodeOption);

            const logEntry = { message: 'log' };
            (process as any).emit('message', { type: 'pushLog', entry: logEntry } as any);
            expect(dummyLogManage.push).toHaveBeenCalledWith(logEntry);
        });

        it('sends IPC request and resolves on matching reply', async () => {
            const sendPromise = client.recording.finish(100);

            // Wait nextTick for process.send to be called
            await new Promise(r => setTimeout(r, 10));

            expect(process.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: ModelName.recording,
                    func: RecordingFunctions.finish,
                    args: { reserveId: 100 },
                }),
            );

            const sentMsg = (process.send as any).mock.calls[0][0];

            // Simulate parent server reply
            (process as any).emit('message', {
                id: sentMsg.id,
                result: 'ok',
            } as any);

            const result = await sendPromise;
            expect(result).toBe('ok');
        });

        it('rejects on parent server error reply', async () => {
            const sendPromise = client.reservation.cancel(200);

            await new Promise(r => setTimeout(r, 10));

            const sentMsg = (process.send as any).mock.calls[0][0];

            (process as any).emit('message', {
                id: sentMsg.id,
                error: 'CustomError',
            } as any);

            await expect(sendPromise).rejects.toThrow('CustomError');
        });

        it('rejects with IPCTimeout when response times out', async () => {
            // Set short timeout
            const sendPromise = (client as any).send(
                { model: ModelName.recording, func: RecordingFunctions.resetTimer },
                50, // 50ms timeout
            );

            await expect(sendPromise).rejects.toThrow('IPCTimeout');
        });

        it('assigns unique monotonically increasing sequence IDs to concurrent calls', async () => {
            const p1 = client.recording.resetTimer();
            const p2 = client.recording.resetTimer();
            const p3 = client.recording.resetTimer();

            await new Promise(r => setTimeout(r, 10));

            const callCount = (process.send as any).mock.calls.length;
            expect(callCount).toBeGreaterThanOrEqual(3);

            const id1 = (process.send as any).mock.calls[callCount - 3][0].id;
            const id2 = (process.send as any).mock.calls[callCount - 2][0].id;
            const id3 = (process.send as any).mock.calls[callCount - 1][0].id;

            expect(typeof id1).toBe('number');
            expect(typeof id2).toBe('number');
            expect(typeof id3).toBe('number');
            expect(id2).toBe(id1 + 1);
            expect(id3).toBe(id2 + 1);

            // Respond to avoid unhandled timeouts
            (process as any).emit('message', { id: id1, result: undefined });
            (process as any).emit('message', { id: id2, result: undefined });
            (process as any).emit('message', { id: id3, result: undefined });

            await Promise.all([p1, p2, p3]);
        });

        it('immediately rejects when process.send is undefined', async () => {
            process.send = undefined as any;

            await expect(
                (client as any).send({ model: ModelName.recording, func: RecordingFunctions.resetTimer }),
            ).rejects.toThrow('ProcessSendIsUndefined');
        });
    });
});
