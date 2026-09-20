import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import DropLogApiModel from '../../src/model/api/dropLog/DropLogApiModel.js';
import * as path from 'path';
import FileUtil from '../../src/util/FileUtil.js';

describe('DropLogApiModel', () => {
    const dummyConfig: any = {
        getConfig: () => ({
            recording: {
                dropLog: { path: '/tmp/droplogs' },
            },
        }),
    };

    it('getIdFilePath allows access if maxSize is 0 (unlimited) regardless of file size', async () => {
        const dummyDropLogFileDB: any = {
            findId: vi.fn().mockResolvedValue({ id: 1, filePath: 'test.log' }),
        };
        const model = new DropLogApiModel(dummyConfig, dummyDropLogFileDB);

        // Mock FileUtil to return a large size
        vi.spyOn(FileUtil, 'getFileSize').mockResolvedValue(100 * 1024 * 1024); // 100MB

        const filePath = await model.getIdFilePath(1, 0); // maxsize = 0
        expect(filePath).toBe(path.join('/tmp/droplogs', 'test.log'));

        vi.restoreAllMocks();
    });

    it('getIdFilePath throws error if file exceeds maxSize', async () => {
        const dummyDropLogFileDB: any = {
            findId: vi.fn().mockResolvedValue({ id: 2, filePath: 'large.log' }),
        };
        const model = new DropLogApiModel(dummyConfig, dummyDropLogFileDB);

        // 10MB file
        vi.spyOn(FileUtil, 'getFileSize').mockResolvedValue(10 * 1024 * 1024);

        // maxSize = 5MB
        await expect(model.getIdFilePath(2, 5 * 1024)).rejects.toThrow('FileIsTooLarge');

        vi.restoreAllMocks();
    });
});
