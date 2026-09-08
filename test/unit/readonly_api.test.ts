import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import createHonoApp from '../../src/model/service/hono/createHonoApp';
import IConfigFile from '../../src/model/IConfigFile';
import ILogger from '../../src/model/ILogger';
import container from '../../src/model/ModelContainer';
import { AuthManager } from '../../src/model/service/hono/AuthManager';
import IConfiguration from '../../src/model/IConfiguration';

describe('Read-Only Mode & Auth Integration Tests', () => {
    const createConfig = (readOnly?: IConfigFile['readOnly']): IConfigFile => ({
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
        readOnly,
    } as any);

    const dummyLog: ILogger = {
        system: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        access: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        stream: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        encode: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
    } as any;

    describe('AuthManager', () => {
        it('should generate and verify valid token', () => {
            const password = 'test_password_123';
            const token = AuthManager.generateToken(password);
            expect(token).toBeDefined();
            expect(token.includes('.')).toBe(true);

            expect(AuthManager.verifyToken(token, password)).toBe(true);
            expect(AuthManager.verifyToken(token, 'wrong_password')).toBe(false);
        });

        it('should reject invalid or tampered tokens', () => {
            const password = 'test_password_123';
            expect(AuthManager.verifyToken('', password)).toBe(false);
            expect(AuthManager.verifyToken('invalid', password)).toBe(false);
            expect(AuthManager.verifyToken('12345.tampered_signature', password)).toBe(false);
        });
    });

    describe('API Protection with readOnly enabled', () => {
        let currentConfig: IConfigFile;

        beforeEach(() => {
            currentConfig = createConfig({
                enabled: true,
                password: 'secret_password',
                allowedOperations: ['liveStream'],
            });

            // Mock IConfiguration in container
            const mockConfigModel: IConfiguration = {
                getConfig: () => currentConfig,
            } as any;

            if (container.isBound('IConfiguration')) {
                container.rebind<IConfiguration>('IConfiguration').toConstantValue(mockConfigModel);
            } else {
                container.bind<IConfiguration>('IConfiguration').toConstantValue(mockConfigModel);
            }

            // Mock IVersionApiModel if needed
            if (!container.isBound('IVersionApiModel')) {
                container.bind('IVersionApiModel').toConstantValue({
                    getVersion: () => '1.0.0',
                });
            }

            // Mock IRecordedApiModel
            if (!container.isBound('IRecordedApiModel')) {
                container.bind('IRecordedApiModel').toConstantValue({
                    delete: async () => {},
                });
            }

            // Mock IStreamApiModel
            if (!container.isBound('IStreamApiModel')) {
                container.bind('IStreamApiModel').toConstantValue({
                    keep: async () => {},
                    stop: async () => {},
                    stopAll: async () => {},
                    getStreamInfos: async () => [],
                });
            }

            // Mock IReserveApiModel
            if (!container.isBound('IReserveApiModel')) {
                container.bind('IReserveApiModel').toConstantValue({
                    gets: async () => ({ reserves: [], total: 0 }),
                    cancel: async () => ({}),
                });
            }
        });

        it('should allow public GET endpoints (/api/version)', async () => {
            const app = createHonoApp(currentConfig, dummyLog);
            const res = await app.request('/api/version');
            expect(res.status).toBe(200);
        });

        it('should block DELETE /api/recorded/1 with 403 when unauthenticated', async () => {
            const app = createHonoApp(currentConfig, dummyLog);
            const res = await app.request('/api/recorded/1', {
                method: 'DELETE',
            });
            expect(res.status).toBe(403);
            const data = await res.json();
            expect(data.message).toBe('readOnlyMode');
        });

        it('should reject incorrect password on /api/auth/unlock', async () => {
            const app = createHonoApp(currentConfig, dummyLog);
            const res = await app.request('/api/auth/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'wrong' }),
            });
            expect(res.status).toBe(401);
        });

        it('should unlock successfully and allow DELETE with valid token', async () => {
            const app = createHonoApp(currentConfig, dummyLog);
            // 1. Unlock
            const unlockRes = await app.request('/api/auth/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: 'secret_password' }),
            });
            expect(unlockRes.status).toBe(200);
            const unlockData = await unlockRes.json();
            expect(unlockData.token).toBeDefined();

            // 2. Check auth status
            const statusRes = await app.request('/api/auth/status', {
                headers: { Authorization: `Bearer ${unlockData.token}` },
            });
            expect(statusRes.status).toBe(200);
            const statusData = await statusRes.json();
            expect(statusData.isUnlocked).toBe(true);

            // 3. Perform DELETE with token
            const deleteRes = await app.request('/api/recorded/1', {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${unlockData.token}` },
            });
            // Should not be 403
            expect(deleteRes.status).not.toBe(403);
        });

        it('should check allowedOperations correctly for stream and download', async () => {
            const app = createHonoApp(currentConfig, dummyLog);

            // currentConfig has allowedOperations: ['liveStream']
            // liveStream should pass readOnlyMiddleware (returns 404 or downstream handler, but NOT 403)
            const liveRes = await app.request('/api/streams/live/1');
            expect(liveRes.status).not.toBe(403);

            // recordedStream is NOT in allowedOperations -> 403
            const recRes = await app.request('/api/streams/recorded/1');
            expect(recRes.status).toBe(403);

            // download is NOT in allowedOperations -> 403
            const dlRes = await app.request('/api/videos/1?isDownload=true');
            expect(dlRes.status).toBe(403);

            // direct video playback (/api/videos/1 without isDownload) should be allowed even without recordedStream
            const directPlayRes = await app.request('/api/videos/1');
            expect(directPlayRes.status).not.toBe(403);
        });

        it('should allow stream keep-alive and individual stop when streaming is permitted, but block all-stop', async () => {
            // 1. liveStream is allowed -> keep-alive and individual stop should pass
            currentConfig.readOnly!.allowedOperations = ['liveStream'];
            const app = createHonoApp(currentConfig, dummyLog);

            const keepRes = await app.request('/api/streams/1/keep', { method: 'PUT' });
            expect(keepRes.status).toBe(200);

            const stopRes = await app.request('/api/streams/1', { method: 'DELETE' });
            expect(stopRes.status).toBe(200);

            // DELETE /api/streams (stop all) is admin-only -> 403
            const stopAllRes = await app.request('/api/streams', { method: 'DELETE' });
            expect(stopAllRes.status).toBe(403);

            // 2. Neither liveStream nor recordedStream is allowed -> 403
            currentConfig.readOnly!.allowedOperations = [];
            const appNoStream = createHonoApp(currentConfig, dummyLog);

            const keepBlocked = await appNoStream.request('/api/streams/1/keep', { method: 'PUT' });
            expect(keepBlocked.status).toBe(403);

            const stopBlocked = await appNoStream.request('/api/streams/1', { method: 'DELETE' });
            expect(stopBlocked.status).toBe(403);
        });

        it('should block logs and restrict screens when not allowed in allowedOperations', async () => {
            const app = createHonoApp(currentConfig, dummyLog);

            // 1. Logs: always 403 when unauthenticated
            const logsRes = await app.request('/api/logs');
            expect(logsRes.status).toBe(403);
            expect((await logsRes.json()).message).toContain('restricted to admin');

            // 2. Dashboard (/api/recording): 403 when 'dashboard' is not allowed
            const recRes = await app.request('/api/recording');
            expect(recRes.status).toBe(403);

            // 3. Reserves (/api/reserves): GET is always allowed in read-only mode
            const reservesRes = await app.request('/api/reserves');
            expect(reservesRes.status).toBe(200);

            // Mutation on reserves (POST /api/reserves) is blocked with 403
            const addReserveRes = await app.request('/api/reserves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ programId: 1 }),
            });
            expect(addReserveRes.status).toBe(403);

            // 4. Search (POST /api/schedules/search): 403 when 'search' is not allowed
            const searchRes = await app.request('/api/schedules/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ option: { keyword: 'test' } }),
            });
            expect(searchRes.status).toBe(403);

            // 5. Rules (/api/rules): 403 when 'rules' is not allowed
            const rulesRes = await app.request('/api/rules');
            expect(rulesRes.status).toBe(403);

            // 6. Encode (/api/encode): 403 when 'encode' is not allowed
            const encodeRes = await app.request('/api/encode');
            expect(encodeRes.status).toBe(403);
        });

        it('should permit screen GET requests when allowed in allowedOperations', async () => {
            currentConfig.readOnly!.allowedOperations = [
                'dashboard',
                'search',
                'rules',
                'encode',
            ];
            const app = createHonoApp(currentConfig, dummyLog);

            // When allowed, should pass readOnlyMiddleware (may 200 or 500 depending on mocks, but NOT 403)
            const recRes = await app.request('/api/recording');
            expect(recRes.status).not.toBe(403);

            const rulesRes = await app.request('/api/rules');
            expect(rulesRes.status).not.toBe(403);

            // Rule edit detail (/api/rules/1) is still admin-only -> 403
            const ruleDetailRes = await app.request('/api/rules/1');
            expect(ruleDetailRes.status).toBe(403);
        });

        it('should correctly handle paths with subDirectory prefix', async () => {
            currentConfig.server.subDirectory = '/myprefix';
            currentConfig.readOnly!.allowedOperations = ['liveStream'];
            const app = createHonoApp(currentConfig, dummyLog);

            // subDirectory prefix, e.g. /myprefix/api/streams/1/keep
            const keepRes = await app.request('/myprefix/api/streams/1/keep', { method: 'PUT' });
            expect(keepRes.status).toBe(200);

            // subDirectory prefix for restricted endpoint, e.g. /myprefix/api/logs -> 403
            const logsRes = await app.request('/myprefix/api/logs');
            expect(logsRes.status).toBe(403);
        });
    });
});

