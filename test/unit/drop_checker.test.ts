import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import DropCheckerModel from '../../src/model/operator/recording/DropCheckerModel.js';
import ILoggerModel from '../../src/model/ILoggerModel.js';

describe('DropCheckerModel Unit Tests', () => {
    const testDir = path.join(process.cwd(), 'data', 'test_drop_checker');

    const dummyLogger = {
        getLogger: () =>
            ({
                system: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
                stream: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
            }) as any,
        initialize: vi.fn(),
    } as unknown as ILoggerModel;

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(async () => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('should instantiate DropCheckerModel without error and initialize aribts pipeline', () => {
        const dropChecker = new DropCheckerModel(dummyLogger);
        expect(dropChecker).toBeDefined();
    });

    it('should start drop checking pipeline with readable stream and write empty log', async () => {
        const dropChecker = new DropCheckerModel(dummyLogger);

        // 空データを流して即座に終了するダミーストリーム
        const dummyStream = new Readable({
            read() {
                this.push(null);
            },
        });

        await dropChecker.start(testDir, 'test_recording.ts', dummyStream);

        const logPath = dropChecker.getFilePath();
        expect(logPath).toBeDefined();
        expect(logPath).toContain('.log');

        // ストリーム終了後の結果取得
        await dropChecker.stop();
        const result = await dropChecker.getResult();
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
    });
});
