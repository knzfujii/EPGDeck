import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import createHonoApp from '../../src/model/service/hono/createHonoApp';
import IConfigFile from '../../src/model/IConfigFile';
import ILogger from '../../src/model/ILogger';
import container from '../../src/model/ModelContainer';

describe('Hono REST API Integration Tests', () => {
    const dummyConfig: IConfigFile = {
        apiServers: [],
        isAllowAllCORS: true,
        thumbnail: '/tmp/thumbnail',
        streamFilePath: '/tmp/streamfiles',
        uploadTempDir: '/tmp/upload',
        port: 8888,
    } as any;

    const dummyLog: ILogger = {
        system: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        access: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        stream: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        encode: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
    } as any;

    const dummyChannels = [
        { id: 1001, serviceId: 1024, name: 'NHK総合', channelType: 'GR', channel: '27' },
        { id: 1002, serviceId: 1032, name: 'NHKEテレ', channelType: 'GR', channel: '26' },
    ];

    const dummyRules = [
        { id: 1, keyword: 'アニメ', isTimeSpecification: false, enable: true },
        { id: 2, keyword: 'ドラマ', isTimeSpecification: false, enable: true },
    ];

    const dummyReserves = [
        { id: 101, name: 'テスト番組1', startAt: 1700000000000, endAt: 1700003600000, isConflict: false },
    ];

    const dummyRecorded = {
        records: [
            { id: 1, name: '録画済みアニメ', startAt: 1700000000000, endAt: 1700003600000, isProtected: false },
        ],
        total: 1,
    };

    const dummyStorages = [
        { name: 'recorded', total: 1000000000000, used: 400000000000, free: 600000000000 },
    ];

    beforeEach(() => {
        // DI コンテナへモック API モデルを登録
        const rebindOrBind = (symbol: string, value: any) => {
            if (container.isBound(symbol)) {
                container.rebind(symbol).toConstantValue(value);
            } else {
                container.bind(symbol).toConstantValue(value);
            }
        };

        rebindOrBind('IChannelApiModel', {
            getChannels: async () => dummyChannels,
            getLogo: async () => { throw new Error('ChannelLogoNotFound'); },
        });

        rebindOrBind('IConfigApiModel', {
            getConfig: async () => ({
                port: 8888,
                dbtype: 'sqlite',
                isAllowAllCORS: true,
            }),
        });

        rebindOrBind('IRuleApiModel', {
            gets: async () => ({ rules: dummyRules, total: dummyRules.length }),
            get: async (id: number) => dummyRules.find(r => r.id === id) || null,
        });

        rebindOrBind('IReserveApiModel', {
            gets: async () => ({ reserves: dummyReserves, total: dummyReserves.length }),
            get: async (id: number) => dummyReserves.find(r => r.id === id) || null,
        });

        rebindOrBind('IRecordedApiModel', {
            gets: async () => dummyRecorded,
            get: async (id: number) => dummyRecorded.records.find(r => r.id === id) || null,
        });

        rebindOrBind('IStorageApiModel', {
            getInfo: async () => ({ items: dummyStorages }),
        });

        rebindOrBind('IRecordingApiModel', {
            gets: async () => ({ records: [], total: 0 }),
        });
    });

    const app = createHonoApp(dummyConfig, dummyLog);

    it('GET /api/channels returns list of broadcast channels', async () => {
        const res = await app.request('/api/channels');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(2);
        expect(data[0].name).toBe('NHK総合');
    });

    it('GET /api/config returns system configurations', async () => {
        const res = await app.request('/api/config');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('port');
        expect(data.dbtype).toBe('sqlite');
    });

    it('GET /api/storages returns disk storage statistics', async () => {
        const res = await app.request('/api/storages');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('items');
        expect(data.items[0].name).toBe('recorded');
    });

    it('GET /api/rules returns list of recording rules', async () => {
        const res = await app.request('/api/rules');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('rules');
        expect(Array.isArray(data.rules)).toBe(true);
        expect(data.rules).toHaveLength(2);
        expect(data.rules[0].keyword).toBe('アニメ');
    });

    it('GET /api/reserves returns list of reservations', async () => {
        const res = await app.request('/api/reserves');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('reserves');
        expect(data.reserves).toHaveLength(1);
    });

    it('GET /api/recorded returns recorded programs archive with pagination', async () => {
        const res = await app.request('/api/recorded?isHalfWidth=true&limit=10&offset=0');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('records');
        expect(data).toHaveProperty('total');
        expect(data.total).toBe(1);
        expect(data.records[0].name).toBe('録画済みアニメ');
    });

    it('GET /api/recording returns currently active recordings', async () => {
        const res = await app.request('/api/recording');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('records');
    });

    it('returns standard headers including no-cache on JSON responses', async () => {
        const res = await app.request('/api/version');
        expect(res.headers.get('Pragma')).toBe('no-cache');
        expect(res.headers.get('Cache-Control')).toContain('no-cache');
    });
});
