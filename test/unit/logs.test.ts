import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import LoggerModel from '../../src/model/LoggerModel';
import LogManageModel from '../../src/model/service/log/LogManageModel';
import { LogEntry } from '../../src/model/ILogger';

describe('Logger & LogManageModel Tests', () => {
    it('LoggerModel should output logs and notify listeners', () => {
        const loggerModel = new LoggerModel();
        loggerModel.initialize('Operator', {
            level: 'debug',
            console: false,
            file: { enabled: false },
        });

        const receivedLogs: LogEntry[] = [];
        const unsubscribe = loggerModel.onLog(entry => {
            receivedLogs.push(entry);
        });

        const log = loggerModel.getLogger();
        log.system.info('Test system info');
        log.system.warn('Test system warn');
        log.stream.error('Test stream error');

        expect(receivedLogs.length).toBe(3);
        expect(receivedLogs[0].process).toBe('Operator');
        expect(receivedLogs[0].category).toBe('system');
        expect(receivedLogs[0].level).toBe('info');
        expect(receivedLogs[0].message).toBe('Test system info');

        expect(receivedLogs[2].category).toBe('stream');
        expect(receivedLogs[2].level).toBe('error');

        unsubscribe();
        log.system.info('After unsubscribe');
        expect(receivedLogs.length).toBe(3);
    });

    it('LogManageModel should buffer and filter logs properly', () => {
        const mockLoggerModel: any = {
            onLog: () => () => {},
        };
        const mockConfiguration: any = {
            getConfig: () => ({
                log: {
                    bufferSize: 5,
                },
            }),
        };
        const mockSocketIO: any = {
            emitLogs: () => {},
        };

        const logManage = new LogManageModel(mockLoggerModel, mockConfiguration, mockSocketIO);

        // Push 6 logs (buffer limit is 5)
        for (let i = 1; i <= 6; i++) {
            logManage.push({
                id: i,
                timestamp: Date.now() + i,
                process: i % 2 === 0 ? 'Service' : 'Operator',
                category: i === 1 ? 'stream' : 'system',
                level: i === 6 ? 'error' : 'info',
                message: `Log message number ${i}`,
            });
        }

        // Buffer size should be capped at 5
        expect(logManage.getBufferSize()).toBe(5);

        // Should contain id 2 to 6
        const allLogs = logManage.getLogs();
        expect(allLogs.length).toBe(5);
        expect(allLogs[0].id).toBe(2);
        expect(allLogs[4].id).toBe(6);

        // Filter by process
        const serviceLogs = logManage.getLogs({ process: 'Service' });
        expect(serviceLogs.every(l => l.process === 'Service')).toBe(true);

        // Filter by level
        const errorLogs = logManage.getLogs({ level: 'error' });
        expect(errorLogs.length).toBe(1);
        expect(errorLogs[0].level).toBe('error');

        // Search query
        const searched = logManage.getLogs({ search: 'number 4' });
        expect(searched.length).toBe(1);
        expect(searched[0].id).toBe(4);

        // Clear
        logManage.clear();
        expect(logManage.getBufferSize()).toBe(0);
    });
});
