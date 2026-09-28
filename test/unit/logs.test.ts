import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import LoggerModel from '../../src/model/LoggerModel.js';
import LogManageModel from '../../src/model/service/log/LogManageModel.js';
import { LogEntry } from '../../src/model/ILogger.js';

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

    it('LoggerModel should write formatted logs to file and close safely', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const testDir = `/tmp/epgdeck_test_log_${Date.now()}`;
        const logFilePath = path.join(testDir, 'test.log');

        const loggerModel = new LoggerModel();
        loggerModel.initialize('Operator', {
            level: 'debug',
            console: false,
            file: {
                enabled: true,
                path: logFilePath,
                maxSize: 1024 * 1024,
                backups: 3,
            },
        });

        const log = loggerModel.getLogger();
        log.system.info('File log test message');
        log.stream.warn('Stream warning message');

        // close でストリームを確実にフラッシュ
        await loggerModel.close();

        expect(fs.existsSync(logFilePath)).toBe(true);
        const content = fs.readFileSync(logFilePath, 'utf-8');
        const lines = content.trim().split('\n');
        expect(lines.length).toBe(2);

        // フォーマット検証: YYYY-MM-DD HH:mm:ss.SSS [LEVEL] [Process][category] message
        const logRegex =
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\s+\[(INFO|WARN)\]\s+\[Operator\]\[(system|stream)\]\s+(.*)$/;
        expect(logRegex.test(lines[0])).toBe(true);
        expect(lines[0]).toContain('[INFO] [Operator][system] File log test message');
        expect(logRegex.test(lines[1])).toBe(true);
        expect(lines[1]).toContain('[WARN] [Operator][stream] Stream warning message');

        // LogManageModel での読み込み互換性テスト
        const mockLoggerModel: any = { onLog: () => () => {} };
        const mockConfig: any = {
            getConfig: () => ({
                log: {
                    bufferSize: 10,
                    file: { enabled: true, path: logFilePath },
                },
            }),
        };
        const mockSocketIO: any = { emitLogs: () => {} };
        const logManage = new LogManageModel(mockLoggerModel, mockConfig, mockSocketIO);

        const loadedLogs = logManage.getLogs();
        expect(loadedLogs.length).toBe(2);
        expect(loadedLogs[0].process).toBe('Operator');
        expect(loadedLogs[0].category).toBe('system');
        expect(loadedLogs[0].level).toBe('info');
        expect(loadedLogs[0].message).toBe('File log test message');
        expect(loadedLogs[1].category).toBe('stream');
        expect(loadedLogs[1].level).toBe('warn');
        expect(loadedLogs[1].message).toBe('Stream warning message');

        // cleanup
        fs.unlinkSync(logFilePath);
        fs.rmdirSync(testDir);
    });

    it('LoggerModel circuit breaker should trip on consecutive file errors and recover after timeout', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const testDir = `/tmp/epgdeck_test_cb_${Date.now()}`;
        const logFilePath = path.join(testDir, 'cb_test.log');

        const loggerModel = new LoggerModel();
        loggerModel.maxConsecutiveErrors = 2;
        loggerModel.circuitBreakerTimeoutMs = 100; // 100ms で復帰

        loggerModel.initialize('Operator', {
            level: 'debug',
            console: false,
            file: {
                enabled: true,
                path: logFilePath,
                maxSize: 1024 * 1024,
                backups: 2,
            },
        });

        expect(loggerModel.isCircuitBreakerOpen()).toBe(false);

        // 1回目のエラーをシミュレート
        const fileStream = (loggerModel as any).fileStream;
        expect(fileStream).toBeDefined();

        fileStream.emit('error', new Error('Simulated write error 1'));
        expect(loggerModel.isCircuitBreakerOpen()).toBe(false);

        // 2回目のエラー（maxConsecutiveErrors 到達）
        fileStream.emit('error', new Error('Simulated write error 2'));
        expect(loggerModel.isCircuitBreakerOpen()).toBe(true);

        // サーキットブレーカー開放中もログ出力でクラッシュしない
        const receivedLogs: LogEntry[] = [];
        loggerModel.onLog(entry => receivedLogs.push(entry));

        const log = loggerModel.getLogger();
        log.system.info('Message during circuit breaker open');
        expect(receivedLogs.length).toBe(1);

        // クールダウン（100ms）待機
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(loggerModel.isCircuitBreakerOpen()).toBe(false);

        // クールダウン明けにログを出力すると自動回復（ストリーム再生成）
        log.system.info('Message after circuit breaker cooldown');
        expect(receivedLogs.length).toBe(2);

        await loggerModel.close();

        // cleanup
        if (fs.existsSync(logFilePath)) {
            fs.unlinkSync(logFilePath);
        }
        if (fs.existsSync(testDir)) {
            fs.rmdirSync(testDir);
        }
    });
});
