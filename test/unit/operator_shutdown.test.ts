import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OperatorShutdownModel from '../../src/model/operator/shutdown/OperatorShutdownModel.js';

describe('Operator Graceful Shutdown Sequence Tests', () => {
    let mockLoggerModel: any;
    let mockLog: any;
    let mockStorageManage: any;
    let mockRecordingManage: any;
    let mockDrizzleOperator: any;
    let mockServiceChild: any;
    let exitHandler: any;
    let shutdownModel: OperatorShutdownModel;

    beforeEach(() => {
        vi.restoreAllMocks();

        mockLog = {
            system: {
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            },
        };

        mockLoggerModel = {
            getLogger: () => mockLog,
            close: vi.fn().mockResolvedValue(undefined),
        };

        mockStorageManage = {
            stop: vi.fn(),
        };

        mockRecordingManage = {
            stopAll: vi.fn().mockResolvedValue(undefined),
        };

        mockDrizzleOperator = {
            closeConnection: vi.fn().mockResolvedValue(undefined),
        };

        mockServiceChild = {
            kill: vi.fn(),
            removeAllListeners: vi.fn(),
            once: vi.fn((event, cb) => {
                if (event === 'exit') {
                    setImmediate(cb);
                }
            }),
            exitCode: null,
            signalCode: null,
        };

        exitHandler = vi.fn();

        shutdownModel = new OperatorShutdownModel(
            mockLoggerModel,
            mockStorageManage,
            mockRecordingManage,
            mockDrizzleOperator,
        );
        shutdownModel.exitHandler = exitHandler;
        shutdownModel.serviceChildTimeoutMs = 100;
        shutdownModel.stopAllTimeoutMs = 100;
        shutdownModel.setServiceChild(mockServiceChild);
    });

    it('executes full graceful shutdown in correct sequence', async () => {
        const order: string[] = [];

        mockStorageManage.stop.mockImplementation(() => {
            order.push('storage.stop');
        });

        mockServiceChild.kill.mockImplementation((sig: string) => {
            order.push(`serviceChild.${sig}`);
        });

        mockServiceChild.once.mockImplementation((event: string, cb: () => void) => {
            if (event === 'exit') {
                setTimeout(() => {
                    order.push('serviceChild.exit');
                    cb();
                }, 10);
            }
        });

        mockRecordingManage.stopAll.mockImplementation(async () => {
            order.push('recording.stopAll');
        });

        mockDrizzleOperator.closeConnection.mockImplementation(async () => {
            order.push('drizzle.closeConnection');
        });

        await shutdownModel.shutdown('SIGTERM');

        expect(mockLog.system.info).toHaveBeenCalledWith('received SIGTERM, shutting down gracefully...');
        expect(mockStorageManage.stop).toHaveBeenCalled();
        expect(mockServiceChild.kill).toHaveBeenCalledWith('SIGTERM');
        expect(mockRecordingManage.stopAll).toHaveBeenCalled();
        expect(mockDrizzleOperator.closeConnection).toHaveBeenCalled();
        expect(mockLoggerModel.close).toHaveBeenCalled();
        expect(exitHandler).toHaveBeenCalledWith(0);

        // Verify sequence order
        expect(order).toContain('storage.stop');
        expect(order).toContain('recording.stopAll');
        expect(order).toContain('serviceChild.exit');
        expect(order[order.length - 1]).toBe('drizzle.closeConnection');
    });

    it('handles second signal by triggering immediate exit(1)', async () => {
        // Trigger first signal (simulate in progress)
        mockRecordingManage.stopAll.mockImplementation(() => new Promise(() => {})); // Never resolves
        void shutdownModel.shutdown('SIGINT');

        expect(shutdownModel.isShuttingDown()).toBe(true);

        // Second signal arrives while first is pending
        await shutdownModel.shutdown('SIGINT');

        expect(mockLog.system.warn).toHaveBeenCalledWith('received second SIGINT, forcing immediate exit...');
        expect(exitHandler).toHaveBeenCalledWith(1);
    });

    it('clears serviceRestartTimer on shutdown if configured', async () => {
        const clearer = vi.fn();
        shutdownModel.setServiceRestartTimerClearer(clearer);

        await shutdownModel.shutdown('SIGTERM');

        expect(clearer).toHaveBeenCalledTimes(1);
    });

    it('continues shutdown even if stopAll fails with an error', async () => {
        mockRecordingManage.stopAll.mockRejectedValue(new Error('Flushing failed'));

        await shutdownModel.shutdown('SIGTERM');

        expect(mockLog.system.error).toHaveBeenCalledWith('error while stopping recordings during graceful shutdown:');
        // DB connection must still be closed even if recording flush had errors
        expect(mockDrizzleOperator.closeConnection).toHaveBeenCalled();
        expect(exitHandler).toHaveBeenCalledWith(0);
    });

    it('gracefully handles shutdown when serviceChild is null', async () => {
        shutdownModel.setServiceChild(null);

        await shutdownModel.shutdown('SIGINT');

        expect(mockStorageManage.stop).toHaveBeenCalled();
        expect(mockRecordingManage.stopAll).toHaveBeenCalled();
        expect(mockDrizzleOperator.closeConnection).toHaveBeenCalled();
        expect(exitHandler).toHaveBeenCalledWith(0);
    });

    it('immediately resolves service child wait when child has already exited', async () => {
        mockServiceChild.exitCode = 0; // Already exited

        const startTime = Date.now();
        await shutdownModel.shutdown('SIGTERM');
        const elapsed = Date.now() - startTime;

        // Must not wait or hang
        expect(elapsed).toBeLessThan(100);
        expect(mockServiceChild.kill).not.toHaveBeenCalled();
        expect(exitHandler).toHaveBeenCalledWith(0);
    });

    it('handles stopAll timeout after specified timeout without hanging', async () => {
        mockRecordingManage.stopAll.mockImplementation(
            () => new Promise(resolve => setTimeout(resolve, 500)), // Slower than 100ms timeout
        );

        await shutdownModel.shutdown('SIGTERM');

        expect(mockLog.system.error).toHaveBeenCalledWith('error while stopping recordings during graceful shutdown:');
        expect(mockDrizzleOperator.closeConnection).toHaveBeenCalled();
        expect(exitHandler).toHaveBeenCalledWith(0);
    });
});
