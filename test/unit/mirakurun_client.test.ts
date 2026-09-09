import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import MirakurunClientModel from '../../src/model/MirakurunClientModel';
import IConfiguration from '../../src/model/IConfiguration';

describe('MirakurunClientModel', () => {
    const createModel = (mirakurunPath: string) => {
        const mockConfig: IConfiguration = {
            getConfig: () =>
                ({
                    server: {
                        mirakurun: mirakurunPath,
                    },
                }) as any,
        } as any;

        return new MirakurunClientModel(mockConfig);
    };

    describe('HTTP and HTTPS URLs', () => {
        it('should configure host, port and basePath for standard HTTP URL', () => {
            const model = createModel('http://127.0.0.1:40772');
            const client = model.getClient();

            expect(client.host).toBe('127.0.0.1');
            expect(client.port).toBe(40772);
            expect(client.basePath).toBe('/api');
        });

        it('should default to port 80 for HTTP URL without explicit port', () => {
            const model = createModel('http://mirakurun-host');
            const client = model.getClient();

            expect(client.host).toBe('mirakurun-host');
            expect(client.port).toBe(80);
            expect(client.basePath).toBe('/api');
        });

        it('should default to port 443 for HTTPS URL without explicit port', () => {
            const model = createModel('https://mirakurun.example.com');
            const client = model.getClient();

            expect(client.host).toBe('mirakurun.example.com');
            expect(client.port).toBe(443);
            expect(client.basePath).toBe('/api');
        });

        it('should respect custom port for HTTPS URL', () => {
            const model = createModel('https://mirakurun.example.com:8443');
            const client = model.getClient();

            expect(client.host).toBe('mirakurun.example.com');
            expect(client.port).toBe(8443);
            expect(client.basePath).toBe('/api');
        });

        it('should append sub-path to basePath when configured with prefix', () => {
            const model = createModel('http://127.0.0.1:40772/prefix');
            const client = model.getClient();

            expect(client.basePath).toBe('/prefix/api');
        });
    });

    describe('UNIX Domain Sockets', () => {
        it('should configure socketPath and basePath for standard http+unix socket format', () => {
            const model = createModel('http+unix://%2Fvar%2Frun%2Fmirakurun.sock');
            const client = model.getClient();

            expect(client.socketPath).toBe('/var/run/mirakurun.sock');
            expect(client.basePath).toBe('/api');
        });

        it('should configure socketPath and basePath for standard http+unix socket format with trailing slash', () => {
            const model = createModel('http+unix://%2Fvar%2Frun%2Fmirakurun.sock/');
            const client = model.getClient();

            expect(client.socketPath).toBe('/var/run/mirakurun.sock');
            expect(client.basePath).toBe('/api');
        });

        it('should configure socketPath for legacy http://unix: format', () => {
            const model = createModel('http://unix:/var/run/mirakurun.sock:');
            const client = model.getClient();

            expect(client.socketPath).toBe('/var/run/mirakurun.sock');
            expect(client.basePath).toBe('/api');
        });
    });

    describe('Windows Named Pipes', () => {
        it('should configure socketPath for Windows named pipe format', () => {
            const model = createModel('\\\\.\\pipe\\mirakurun');
            const client = model.getClient();

            expect(client.socketPath).toBe('\\\\.\\pipe\\mirakurun');
        });
    });

    describe('User-Agent', () => {
        it('should set userAgent based on package.json metadata', () => {
            const model = createModel('http://127.0.0.1:40772/api');
            const client = model.getClient();

            expect(client.userAgent).toMatch(/^epgdeck\//);
        });
    });
});
