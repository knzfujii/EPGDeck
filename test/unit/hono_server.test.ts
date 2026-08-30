import { describe, expect, it } from 'vitest';
import createHonoApp from '../../src/model/service/hono/createHonoApp';
import IConfigFile from '../../src/model/IConfigFile';
import ILogger from '../../src/model/ILogger';

describe('Hono Server Endpoints', () => {
    const dummyConfig: IConfigFile = {
        server: {
            port: 8888,
            mirakurun: 'http://localhost:40772',
            apiServers: [],
            isAllowAllCORS: true,
        },
        database: {
            type: 'sqlite',
        },
        log: {
            level: 'info',
            console: true,
            bufferSize: 1000,
        },
        epg: {
            intervalMinutes: 10,
            replaceEnclosingCharacters: true,
        },
        recording: {
            filenameFormat: '%YEAR%_%MONTH%_%DAY%_%HOUR%%MIN%-%TITLE%',
            fileExtension: '.m2ts',
            directories: [{ name: 'recorded', path: '/tmp/recorded' }],
            historyRetentionDays: 90,
            storageCheckIntervalSeconds: 60,
            priority: { conflict: 1, recording: 2, streaming: 0 },
            timeSpecifiedStartMargin: 1,
            timeSpecifiedEndMargin: 2,
            thumbnail: { path: '/tmp/thumbnail', size: '480x270', positionSeconds: 5 },
            dropLog: { path: '/tmp/drop', enabled: true },
            uploadTempDir: '/tmp/upload',
        },
        encode: {
            binaries: { ffmpeg: '/usr/bin/ffmpeg', ffprobe: '/usr/bin/ffprobe' },
            maxProcesses: 4,
            concurrency: 1,
            presets: [],
        },
        streaming: {
            tempDir: '/tmp/streamfiles',
            live: {} as any,
            recorded: {} as any,
        },
    } as any;

    const dummyLog: ILogger = {
        system: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        access: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        stream: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        encode: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
    } as any;

    const app = createHonoApp(dummyConfig, dummyLog);

    it('GET /api/version returns version info', async () => {
        const res = await app.request('/api/version');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('version');
    });

    it('GET /api/docs returns OpenAPI json specification', async () => {
        const res = await app.request('/api/docs');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('openapi');
        expect(data.openapi).toBe('3.0.1');
    });

    it('GET /api-docs returns Swagger UI html', async () => {
        const res = await app.request('/api-docs');
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('SwaggerUIBundle');
    });

    it('GET /api/debug redirects to Swagger UI', async () => {
        const res = await app.request('/api/debug');
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/api-docs/?url=/api/docs');
    });
});

