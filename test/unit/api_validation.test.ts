import 'reflect-metadata';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import createHonoApp from '../../src/model/service/hono/createHonoApp.js';
import IConfigFile from '../../src/model/IConfigFile.js';
import ILogger from '../../src/model/ILogger.js';
import container from '../../src/model/ModelContainer.js';

describe('API Zod Validation Tests', () => {
    const dummyConfig: IConfigFile = {
        server: { port: 8888, mirakurun: 'http://localhost:40772', apiServers: [], isAllowAllCORS: true },
        database: { type: 'sqlite' },
        log: { level: 'info', console: true, bufferSize: 1000 },
        epg: { intervalMinutes: 10, replaceEnclosingCharacters: true },
        recording: {
            filenameFormat: '%TITLE%',
            fileExtension: '.m2ts',
            directories: [{ name: 'recorded', path: '/tmp' }],
            historyRetentionDays: 90,
            storageCheckIntervalSeconds: 60,
            priority: { conflict: 1, recording: 2, streaming: 0 },
            timeSpecifiedStartMargin: 1,
            timeSpecifiedEndMargin: 2,
            thumbnail: { path: '/tmp', size: '480x270', positionSeconds: 5 },
            dropLog: { path: '/tmp', enabled: true },
            uploadTempDir: '/tmp',
        },
        encode: { binaries: { ffmpeg: '', ffprobe: '' }, maxProcesses: 1, concurrency: 1, presets: [] },
        streaming: { tempDir: '/tmp', live: {} as any, recorded: {} as any },
    } as any;

    const dummyLog: ILogger = {
        system: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        access: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        stream: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        encode: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
    } as any;

    let mockReserveApi: { gets: ReturnType<typeof vi.fn>; add: ReturnType<typeof vi.fn> };
    let mockRecordedApi: { gets: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockReserveApi = {
            gets: vi.fn().mockResolvedValue({ reserves: [], total: 0 }),
            add: vi.fn().mockResolvedValue(100),
        };
        mockRecordedApi = {
            gets: vi.fn().mockResolvedValue({ records: [], total: 0 }),
        };

        const rebindOrBind = (symbol: string, value: any) => {
            if (container.isBound(symbol)) {
                container.rebind(symbol).toConstantValue(value);
            } else {
                container.bind(symbol).toConstantValue(value);
            }
        };

        rebindOrBind('IReserveApiModel', mockReserveApi);
        rebindOrBind('IRecordedApiModel', mockRecordedApi);
    });

    it('GET /api/reserves parses valid query parameters and coerces types', async () => {
        const app = createHonoApp(dummyConfig, dummyLog);
        const res = await app.request('/api/reserves?offset=10&limit=20&isHalfWidth=false&ruleId=5');

        expect(res.status).toBe(200);
        expect(mockReserveApi.gets).toHaveBeenCalledWith({
            offset: 10,
            limit: 20,
            isHalfWidth: false,
            ruleId: 5,
        });
    });

    it('GET /api/reserves returns 400 when invalid query parameter is given', async () => {
        const app = createHonoApp(dummyConfig, dummyLog);
        const res = await app.request('/api/reserves?limit=not_a_number');

        expect(res.status).toBe(400);
    });

    it('GET /api/recorded parses valid filter query parameters and coerces types', async () => {
        const app = createHonoApp(dummyConfig, dummyLog);
        const res = await app.request(
            '/api/recorded?offset=5&limit=15&isHalfWidth=true&isReverse=true&ruleId=2&genre=1&keyword=test&hasOriginalFile=true&startAt=1700000000000&endAt=1700003600000',
        );

        expect(res.status).toBe(200);
        expect(mockRecordedApi.gets).toHaveBeenCalledWith({
            offset: 5,
            limit: 15,
            isHalfWidth: true,
            isReverse: true,
            ruleId: 2,
            genre: 1,
            keyword: 'test',
            hasOriginalFile: true,
            startAt: 1700000000000,
            endAt: 1700003600000,
        });
    });

    it('GET /api/recorded returns 400 when startAt is not a number', async () => {
        const app = createHonoApp(dummyConfig, dummyLog);
        const res = await app.request('/api/recorded?startAt=invalid_date');

        expect(res.status).toBe(400);
    });
});
