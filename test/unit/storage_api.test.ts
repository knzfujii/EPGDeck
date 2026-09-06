import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import StorageApiModel from '../../src/model/api/storage/StorageApiModel';
import IConfiguration from '../../src/model/IConfiguration';

describe('StorageApiModel', () => {
    describe('getInfo', () => {
        it('should get valid disk storage information', async () => {
            const dummyConfig = {
                getConfig: () => ({
                    recording: {
                        directories: [
                            {
                                name: 'root',
                                path: process.cwd(),
                            },
                        ],
                    },
                }),
            } as unknown as IConfiguration;

            const storageApiModel = new StorageApiModel(dummyConfig);
            const info = await storageApiModel.getInfo();

            expect(info.items).toHaveLength(1);
            const item = info.items[0];
            expect(item.name).toBe('root');
            expect(typeof item.total).toBe('number');
            expect(item.total).toBeGreaterThan(0);
            expect(typeof item.available).toBe('number');
            expect(item.available).toBeGreaterThan(0);
            expect(typeof item.used).toBe('number');
            expect(item.used).toBeGreaterThanOrEqual(0);
        });
    });
});
