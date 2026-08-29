import { describe, expect, it } from 'vitest';
import createHonoApp from '../../src/model/service/hono/createHonoApp';
import IConfigFile from '../../src/model/IConfigFile';
import ILogger from '../../src/model/ILogger';

describe('Hono Server Endpoints', () => {
    const dummyConfig: IConfigFile = {
        apiServers: [],
        isAllowAllCORS: true,
        thumbnail: '/tmp/thumbnail',
        streamFilePath: '/tmp/streamfiles',
        uploadTempDir: '/tmp/upload',
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

