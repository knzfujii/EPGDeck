import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock fs, http, https
const mockHttpServers: any[] = [];
const mockHttpsServers: any[] = [];
let statSyncError: Error | null = null;
const mkdirCalls: any[] = [];

vi.mock('fs', async importOriginal => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        statSync: vi.fn((_path: any) => {
            if (statSyncError) {
                throw statSyncError;
            }
            return {} as any;
        }),
        mkdirSync: vi.fn((path: any, options: any) => {
            mkdirCalls.push({ path, options });
        }),
        readFileSync: vi.fn((p: any) => `content_of_${p}`),
    };
});

vi.mock('http', async importOriginal => {
    const actual = await importOriginal<typeof import('http')>();
    return {
        ...actual,
        createServer: vi.fn((listener: any) => {
            const server = {
                listener,
                listen: vi.fn((_port: number, cb: () => void) => {
                    cb();
                }),
            };
            mockHttpServers.push(server);
            return server;
        }),
    };
});

vi.mock('https', async importOriginal => {
    const actual = await importOriginal<typeof import('https')>();
    return {
        ...actual,
        createServer: vi.fn((options: any, listener: any) => {
            const server = {
                options,
                listener,
                listen: vi.fn((_port: number, cb: () => void) => {
                    cb();
                }),
            };
            mockHttpsServers.push(server);
            return server;
        }),
    };
});

import ServiceServer from '../../src/model/service/ServiceServer.js';

describe('ServiceServer Unit Tests', () => {
    let dummyLogger: any;
    let dummyConfig: any;
    let dummySocketIoManageModel: any;

    beforeEach(() => {
        statSyncError = null;
        mkdirCalls.length = 0;
        mockHttpServers.length = 0;
        mockHttpsServers.length = 0;

        dummyLogger = {
            getLogger: () => ({
                system: { info: vi.fn(), error: vi.fn() },
            }),
        };

        dummySocketIoManageModel = {
            initialize: vi.fn(),
        };

        dummyConfig = {
            getConfig: () => ({
                server: {
                    port: 8888,
                },
                recording: {
                    uploadTempDir: '/dummy/upload_temp',
                    thumbnail: {
                        path: '/dummy/thumbnail',
                    },
                },
                streaming: {
                    tempDir: '/dummy/streamfiles',
                },
            }),
        };
    });

    it('creates upload temp directory when it does not exist', () => {
        statSyncError = new Error('ENOENT');

        new ServiceServer(dummyLogger, dummyConfig, dummySocketIoManageModel);

        expect(mkdirCalls).toContainEqual({
            path: '/dummy/upload_temp',
            options: { recursive: true },
        });
    });

    it('starts HTTP server and initializes socket.io', () => {
        const server = new ServiceServer(dummyLogger, dummyConfig, dummySocketIoManageModel);
        server.start();

        expect(mockHttpServers).toHaveLength(1);
        expect(mockHttpsServers).toHaveLength(0);
        expect(dummySocketIoManageModel.initialize).toHaveBeenCalledTimes(1);

        const initializedServers = dummySocketIoManageModel.initialize.mock.calls[0][0];
        expect(initializedServers).toHaveLength(1);
        expect(initializedServers[0]).toBe(mockHttpServers[0]);
    });

    it('starts both HTTP and HTTPS servers when HTTPS config is provided', () => {
        dummyConfig.getConfig = () => ({
            server: {
                port: 8888,
                https: {
                    port: 8443,
                    key: '/path/to/key.pem',
                    cert: '/path/to/cert.pem',
                    ca: ['/path/to/ca1.pem', '/path/to/ca2.pem'],
                },
            },
            recording: {
                uploadTempDir: '/dummy/upload_temp',
                thumbnail: {
                    path: '/dummy/thumbnail',
                },
            },
            streaming: {
                tempDir: '/dummy/streamfiles',
            },
        });

        const server = new ServiceServer(dummyLogger, dummyConfig, dummySocketIoManageModel);
        server.start();

        expect(mockHttpServers).toHaveLength(1);
        expect(mockHttpsServers).toHaveLength(1);
        expect(mockHttpsServers[0].options).toEqual({
            key: 'content_of_/path/to/key.pem',
            cert: 'content_of_/path/to/cert.pem',
            ca: ['content_of_/path/to/ca1.pem', 'content_of_/path/to/ca2.pem'],
            requestCert: true,
            rejectUnauthorized: true,
        });

        const initializedServers = dummySocketIoManageModel.initialize.mock.calls[0][0];
        expect(initializedServers).toHaveLength(2);
    });

    it('handles single string CA configuration for HTTPS', () => {
        dummyConfig.getConfig = () => ({
            server: {
                https: {
                    port: 8443,
                    key: '/path/to/key.pem',
                    cert: '/path/to/cert.pem',
                    ca: '/path/to/single_ca.pem',
                },
            },
            recording: {
                uploadTempDir: '/dummy/upload_temp',
                thumbnail: {
                    path: '/dummy/thumbnail',
                },
            },
            streaming: {
                tempDir: '/dummy/streamfiles',
            },
        });

        const server = new ServiceServer(dummyLogger, dummyConfig, dummySocketIoManageModel);
        server.start();

        expect(mockHttpServers).toHaveLength(0);
        expect(mockHttpsServers).toHaveLength(1);
        expect(mockHttpsServers[0].options.ca).toBe('content_of_/path/to/single_ca.pem');
    });
});
