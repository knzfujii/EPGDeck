import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http, { buildUrl, HttpError } from '../../client/src/lib/httpClient';
import { createServer, type Server } from 'node:http';

describe('httpClient', () => {
    describe('buildUrl', () => {
        it('should return untouched url if no params provided', () => {
            expect(buildUrl('/api/test')).toBe('/api/test');
        });

        it('should append params as query string', () => {
            const url = buildUrl('/api/test', { a: 1, b: 'hello', c: true });
            expect(url).toBe('/api/test?a=1&b=hello&c=true');
        });

        it('should merge with existing query parameters', () => {
            const url = buildUrl('/api/test?initial=yes', { extra: 'ok' });
            expect(url).toBe('/api/test?initial=yes&extra=ok');
        });

        it('should handle array parameters and omit null/undefined', () => {
            const url = buildUrl('/api/test', {
                arr: ['x', 'y'],
                skip: undefined,
                skipNull: null,
            });
            expect(url).toBe('/api/test?arr=x&arr=y');
        });

        it('should preserve URL fragment/hash', () => {
            const url = buildUrl('/api/test#section', { key: 'val' });
            expect(url).toBe('/api/test?key=val#section');
        });

        it('should handle URLSearchParams instance', () => {
            const sp = new URLSearchParams();
            sp.append('foo', 'bar');
            expect(buildUrl('/api/test', sp)).toBe('/api/test?foo=bar');
        });
    });

    describe('HTTP requests with test server', () => {
        let server: Server;
        let baseUrl: string;

        beforeAll(async () => {
            server = createServer((req, res) => {
                const url = new URL(req.url || '/', `http://${req.headers.host}`);

                if (url.pathname === '/json-get' && req.method === 'GET') {
                    const q = url.searchParams.get('q');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ receivedQuery: q, success: true }));
                    return;
                }

                if (url.pathname === '/json-post' && req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk;
                    });
                    req.on('end', () => {
                        const parsed = JSON.parse(body);
                        res.writeHead(201, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ created: parsed }));
                    });
                    return;
                }

                if (url.pathname === '/json-put' && req.method === 'PUT') {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk;
                    });
                    req.on('end', () => {
                        const parsed = JSON.parse(body);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ updated: parsed }));
                    });
                    return;
                }

                if (url.pathname === '/delete-item' && req.method === 'DELETE') {
                    res.writeHead(204);
                    res.end();
                    return;
                }

                if (url.pathname === '/text-manifest' && req.method === 'GET') {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('#EXTM3U\n#EXT-X-VERSION:3');
                    return;
                }

                if (url.pathname === '/error-404') {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not found' }));
                    return;
                }

                res.writeHead(500);
                res.end();
            });

            await new Promise<void>(resolve => {
                server.listen(0, '127.0.0.1', () => resolve());
            });

            const addr = server.address() as any;
            baseUrl = `http://127.0.0.1:${addr.port}`;
        });

        afterAll(async () => {
            await new Promise<void>((resolve, reject) => {
                server.close(err => (err ? reject(err) : resolve()));
            });
        });

        it('should perform GET request and parse JSON response', async () => {
            const res = await http.get(`${baseUrl}/json-get`, {
                params: { q: 'epgdeck' },
            });
            expect(res.status).toBe(200);
            expect(res.data).toEqual({ receivedQuery: 'epgdeck', success: true });
        });

        it('should perform POST request with JSON body', async () => {
            const res = await http.post(`${baseUrl}/json-post`, { title: 'Test Rule' });
            expect(res.status).toBe(201);
            expect(res.data).toEqual({ created: { title: 'Test Rule' } });
        });

        it('should perform PUT request with JSON body', async () => {
            const res = await http.put(`${baseUrl}/json-put`, { enabled: true });
            expect(res.status).toBe(200);
            expect(res.data).toEqual({ updated: { enabled: true } });
        });

        it('should perform DELETE request with empty response', async () => {
            const res = await http.delete(`${baseUrl}/delete-item`);
            expect(res.status).toBe(204);
            expect(res.data).toBeNull();
        });

        it('should handle text response (like m3u8 playlist)', async () => {
            const res = await http.get(`${baseUrl}/text-manifest`);
            expect(res.status).toBe(200);
            expect(res.data).toContain('#EXTM3U');
        });

        it('should throw HttpError on 4xx/5xx status by default', async () => {
            try {
                await http.get(`${baseUrl}/error-404`);
                expect.unreachable('Should have thrown HttpError');
            } catch (err: any) {
                expect(err).toBeInstanceOf(HttpError);
                expect(err.response.status).toBe(404);
                expect(err.response.data).toEqual({ error: 'Not found' });
            }
        });

        it('should allow custom validateStatus', async () => {
            const res = await http.get(`${baseUrl}/error-404`, {
                validateStatus: status => status === 404,
            });
            expect(res.status).toBe(404);
            expect(res.data).toEqual({ error: 'Not found' });
        });
    });
});
