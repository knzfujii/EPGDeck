import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'http';
import ApiUtil from '../../src/model/api/ApiUtil';
import IConfiguration from '../../src/model/IConfiguration';
import { KodiInfo } from '../../src/model/IConfigFile';

describe('ApiUtil', () => {
    describe('getHost', () => {
        it('should return baseHost when subDirectory is not configured', () => {
            const dummyConfig = {
                getConfig: () => ({
                    server: {},
                }),
            } as unknown as IConfiguration;

            const apiUtil = new ApiUtil(dummyConfig);
            expect(apiUtil.getHost('localhost:8888')).toBe('localhost:8888');
        });

        it('should append subDirectory when configured', () => {
            const dummyConfig = {
                getConfig: () => ({
                    server: {
                        subDirectory: 'epgdeck',
                    },
                }),
            } as unknown as IConfiguration;

            const apiUtil = new ApiUtil(dummyConfig);
            expect(apiUtil.getHost('localhost:8888')).toBe('localhost:8888/epgdeck');
        });
    });

    describe('createM3U8PlayListStr', () => {
        it('should generate valid m3u8 playlist string', () => {
            const dummyConfig = {
                getConfig: () => ({
                    server: {},
                }),
            } as unknown as IConfiguration;

            const apiUtil = new ApiUtil(dummyConfig);
            const playlist = apiUtil.createM3U8PlayListStr({
                name: 'Test Stream',
                duration: 60,
                host: 'localhost:8888',
                isSecure: false,
                baseUrl: '/api/streams/live/1/m3u8',
            });

            expect(playlist).toContain('#EXTM3U');
            expect(playlist).toContain('#EXTINF: 60, Test Stream');
            expect(playlist).toContain('http://localhost:8888/api/streams/live/1/m3u8');
        });
    });

    describe('sendToKodi', () => {
        let server: http.Server;
        let serverPort: number;
        let receivedAuth: string | undefined;
        let receivedBody: any = null;

        beforeAll(async () => {
            server = http.createServer((req, res) => {
                receivedAuth = req.headers['authorization'];
                let body = '';
                req.on('data', chunk => {
                    body += chunk;
                });
                req.on('end', () => {
                    receivedBody = JSON.parse(body);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'OK' }));
                });
            });

            await new Promise<void>(resolve => {
                server.listen(0, '127.0.0.1', () => {
                    const addr = server.address() as any;
                    serverPort = addr.port;
                    resolve();
                });
            });
        });

        afterAll(async () => {
            await new Promise<void>(resolve => {
                server.close(() => resolve());
            });
        });

        it('should send JSON-RPC command to Kodi with basic auth', async () => {
            const dummyConfig = {
                getConfig: () => ({
                    server: {},
                }),
            } as unknown as IConfiguration;

            const apiUtil = new ApiUtil(dummyConfig);
            const kodiInfo: KodiInfo = {
                name: 'test_kodi',
                host: `http://127.0.0.1:${serverPort}`,
                user: 'kodi_user',
                password: 'kodi_password',
            };

            await apiUtil.sendToKodi('http://example.com/video.mp4', kodiInfo);

            expect(receivedAuth).toBe(`Basic ${Buffer.from('kodi_user:kodi_password').toString('base64')}`);
            expect(receivedBody).toEqual({
                jsonrpc: '2.0',
                method: 'Player.Open',
                params: {
                    item: { file: 'http://example.com/video.mp4' },
                },
                id: 1,
            });
        });
    });
});
