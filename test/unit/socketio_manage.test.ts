import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import EventEmitter from 'events';
import SocketIOManageModel from '../../src/model/service/socketio/SocketIOManageModel.js';

// Mock SocketIO.Server
const mockServerInstances: any[] = [];
vi.mock('socket.io', () => {
    function MockServer(this: any, _server: any, options: any) {
        this.options = options;
        this.events = new EventEmitter();
        this.on = vi.fn((event: string, callback: any) => {
            this.events.on(event, callback);
        });
        this.to = vi.fn().mockReturnValue({
            emit: vi.fn(),
        });
        this.sockets = {
            emit: vi.fn(),
        };
        mockServerInstances.push(this);
    }
    return {
        Server: vi.fn().mockImplementation(function (this: any, server: any, options: any) {
            return new (MockServer as any)(server, options);
        }),
    };
});

describe('SocketIOManageModel Unit Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let model: SocketIOManageModel;

    beforeEach(() => {
        vi.useFakeTimers();
        mockServerInstances.length = 0;
        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn() },
            }),
        };
        dummyConfig = {
            getConfig: () => ({
                server: {},
            }),
        };

        model = new SocketIOManageModel(dummyLogger, dummyConfig);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initialize', () => {
        it('initializes socket.io servers with default path and cors', () => {
            const dummyHttpServer: any = {};
            model.initialize([dummyHttpServer]);

            expect(mockServerInstances).toHaveLength(1);
            expect(mockServerInstances[0].options.path).toBe('/socket.io');
            expect(mockServerInstances[0].options.cors).toEqual({ origin: '*' });
        });

        it('joins subDirectory when defined in config', () => {
            dummyConfig.getConfig = () => ({
                server: { subDirectory: '/epgdeck' },
            });
            const customModel = new SocketIOManageModel(dummyLogger, dummyConfig);
            customModel.initialize([{} as any]);

            expect(mockServerInstances[0].options.path).toBe('/epgdeck/socket.io');
        });

        it('registers connection and log subscription handlers on client sockets', () => {
            model.initialize([{} as any]);
            const server = mockServerInstances[0];

            const mockSocket: any = {
                events: new EventEmitter(),
                on(evt: string, fn: any) {
                    this.events.on(evt, fn);
                },
                join: vi.fn(),
                leave: vi.fn(),
            };

            // Trigger connection
            server.events.emit('connection', mockSocket);

            // Trigger subscribeLogs
            mockSocket.events.emit('subscribeLogs');
            expect(mockSocket.join).toHaveBeenCalledWith('logs');

            // Trigger unsubscribeLogs
            mockSocket.events.emit('unsubscribeLogs');
            expect(mockSocket.leave).toHaveBeenCalledWith('logs');
        });
    });

    describe('emitLogs', () => {
        it('broadcasts log entry to the "logs" room across all servers', () => {
            model.initialize([{} as any, {} as any]);
            const entry: any = { level: 'INFO', message: 'test log' };

            model.emitLogs(entry);

            for (const server of mockServerInstances) {
                expect(server.to).toHaveBeenCalledWith('logs');
                const roomEmitter = server.to.mock.results[0].value;
                expect(roomEmitter.emit).toHaveBeenCalledWith('logs', entry);
            }
        });
    });

    describe('notifyClient (debounce)', () => {
        it('debounces updateStatus broadcast over 200ms', () => {
            model.initialize([{} as any]);
            const server = mockServerInstances[0];

            model.notifyClient();
            model.notifyClient();
            model.notifyClient();

            // Not called yet
            expect(server.sockets.emit).not.toHaveBeenCalled();

            // Advance timers by 200ms
            vi.advanceTimersByTime(200);

            expect(server.sockets.emit).toHaveBeenCalledTimes(1);
            expect(server.sockets.emit).toHaveBeenCalledWith('updateStatus');

            // Calling again sets a new debounced timer
            model.notifyClient();
            vi.advanceTimersByTime(200);
            expect(server.sockets.emit).toHaveBeenCalledTimes(2);
        });

        it('throws error if notifyClient timer fires before initialization', () => {
            const uninitModel = new SocketIOManageModel(dummyLogger, dummyConfig);
            uninitModel.notifyClient();

            expect(() => {
                vi.advanceTimersByTime(200);
            }).toThrow('must call SocketIoManageModel initialize');
        });
    });

    describe('notifyUpdateEncodeProgress (debounce)', () => {
        it('debounces updateEncode broadcast over 200ms', () => {
            model.initialize([{} as any]);
            const server = mockServerInstances[0];

            model.notifyUpdateEncodeProgress();
            model.notifyUpdateEncodeProgress();

            expect(server.sockets.emit).not.toHaveBeenCalled();

            vi.advanceTimersByTime(200);

            expect(server.sockets.emit).toHaveBeenCalledTimes(1);
            expect(server.sockets.emit).toHaveBeenCalledWith('updateEncode');
        });

        it('throws error if notifyUpdateEncodeProgress timer fires before initialization', () => {
            const uninitModel = new SocketIOManageModel(dummyLogger, dummyConfig);
            uninitModel.notifyUpdateEncodeProgress();

            expect(() => {
                vi.advanceTimersByTime(200);
            }).toThrow('must call SocketIoManageModel initialize');
        });
    });
});
