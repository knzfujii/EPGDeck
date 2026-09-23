import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FileUtil from '../../src/util/FileUtil.js';
import HLSFileDeleterModel from '../../src/model/service/stream/util/HLSFileDeleterModel.js';

describe('HLSFileDeleterModel Tests', () => {
    let dummyLogger: any;
    let mockStreamLog: any;
    let model: HLSFileDeleterModel;
    const testTempDir = path.join(__dirname, 'test_hls_temp');

    beforeEach(async () => {
        mockStreamLog = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            fatal: vi.fn(),
        };
        dummyLogger = {
            getLogger: () => ({
                stream: mockStreamLog,
            }),
        };

        await FileUtil.mkdir(testTempDir);
        model = new HLSFileDeleterModel(dummyLogger);
    });

    afterEach(async () => {
        await fs.promises.rm(testTempDir, { recursive: true, force: true });
    });

    it('throws HLSFileDeleterOptionIsNull when option is not set', async () => {
        await expect(model.deleteAllFiles()).rejects.toThrow('HLSFileDeleterOptionIsNull');
    });

    it('deletes target stream files and keeps other stream files and .gitkeep', async () => {
        // テスト用ファイルの作成
        const gitkeep = path.join(testTempDir, '.gitkeep');
        const stream1M3u8 = path.join(testTempDir, 'stream1.m3u8');
        const stream1Ts0 = path.join(testTempDir, 'stream10.ts');
        const stream1Ts1 = path.join(testTempDir, 'stream11.ts');
        const stream2M3u8 = path.join(testTempDir, 'stream2.m3u8');
        const stream2Ts0 = path.join(testTempDir, 'stream20.ts');

        await FileUtil.writeFile(gitkeep, '');
        await FileUtil.writeFile(stream1M3u8, '#EXTM3U');
        await FileUtil.writeFile(stream1Ts0, 'dummy ts');
        await FileUtil.writeFile(stream1Ts1, 'dummy ts');
        await FileUtil.writeFile(stream2M3u8, '#EXTM3U');
        await FileUtil.writeFile(stream2Ts0, 'dummy ts');

        model.setOption({
            streamId: 1,
            streamFilePath: testTempDir,
        });

        await model.deleteAllFiles();

        // stream1 のファイルのみ削除されること
        expect(fs.existsSync(stream1M3u8)).toBe(false);
        expect(fs.existsSync(stream1Ts0)).toBe(false);
        expect(fs.existsSync(stream1Ts1)).toBe(false);

        // .gitkeep および stream2 のファイルは維持されること
        expect(fs.existsSync(gitkeep)).toBe(true);
        expect(fs.existsSync(stream2M3u8)).toBe(true);
        expect(fs.existsSync(stream2Ts0)).toBe(true);

        expect(mockStreamLog.info).toHaveBeenCalledWith('delete all hls files: 1');
        expect(mockStreamLog.info).toHaveBeenCalledWith('deleted stream1.m3u8');
        expect(mockStreamLog.info).toHaveBeenCalledWith('deleted stream10.ts');
        expect(mockStreamLog.info).toHaveBeenCalledWith('deleted stream11.ts');
    });

    it('safely completes when directory has no matching files', async () => {
        const stream2M3u8 = path.join(testTempDir, 'stream2.m3u8');
        await FileUtil.writeFile(stream2M3u8, '#EXTM3U');

        model.setOption({
            streamId: 99,
            streamFilePath: testTempDir,
        });

        await model.deleteAllFiles();

        expect(fs.existsSync(stream2M3u8)).toBe(true);
        expect(mockStreamLog.info).toHaveBeenCalledWith('delete all hls files: 99');
    });
});
