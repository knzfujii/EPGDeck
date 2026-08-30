import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import Configuration from '../../src/model/Configuration';

describe('Structured Config Schema', () => {
    it('should successfully parse config.yml.template into new structured schema', () => {
        const templatePath = path.join(__dirname, '..', '..', 'config', 'config.yml.template');
        const content = fs.readFileSync(templatePath, 'utf-8');
        const parsed = yaml.load(content) as any;

        expect(parsed).toBeDefined();
        expect(parsed.server.port).toBe(8888);
        expect(parsed.server.mirakurun).toBeDefined();
        expect(parsed.database.type).toBe('sqlite');
        expect(parsed.recording.directories).toBeInstanceOf(Array);
        expect(parsed.recording.directories.length).toBeGreaterThan(0);
        expect(parsed.recording.filenameFormat).toBeDefined();
        expect(parsed.encode.presets).toBeInstanceOf(Array);
        expect(parsed.encode.presets.length).toBeGreaterThan(0);
    });

    const dummyLoggerModel: any = {
        getLogger: () => ({
            system: { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, fatal: () => {} },
        }),
    };

    it('should parse and merge default streaming configuration in Configuration model', () => {
        const templatePath = path.join(__dirname, '..', '..', 'config', 'config.yml.template');
        const content = fs.readFileSync(templatePath, 'utf-8');
        const rawConfig = yaml.load(content);
        const configModel = new Configuration(dummyLoggerModel);
        const conf = configModel.formatAndValidateConfig(rawConfig);

        expect(conf.server.port).toBe(8888);
        expect(conf.database.type).toBe('sqlite');
        expect(conf.streaming).toBeDefined();
        expect(conf.streaming.live).toBeDefined();
        expect(conf.streaming.recorded).toBeDefined();
        expect(conf.streaming.tempDir).toBeDefined();
    });

    it('should throw on invalid port in Configuration model', () => {
        const configModel = new Configuration(dummyLoggerModel);
        expect(() => {
            configModel.formatAndValidateConfig({
                server: {
                    port: 99999, // invalid port
                    mirakurun: 'http://localhost:40772',
                },
                database: { type: 'sqlite' },
                recording: {
                    directories: [{ name: 'recorded', path: '/path' }],
                },
            } as any);
        }).toThrow(/Invalid server port/);
    });

    it('should safely deep-merge partial urlscheme configuration', () => {
        const configModel = new Configuration(dummyLoggerModel);
        const conf = configModel.formatAndValidateConfig({
            server: { port: 8888, mirakurun: 'http://localhost:40772' },
            database: { type: 'sqlite' },
            recording: { directories: [{ name: 'rec', path: '/path' }] },
            urlscheme: {
                video: {
                    ios: 'custom-player://play?url=PROTOCOL://ADDRESS',
                },
            },
        } as any);

        expect(conf.urlscheme.video.ios).toBe('custom-player://play?url=PROTOCOL://ADDRESS');
        expect(conf.urlscheme.m2ts.ios).toBe(Configuration.DEFAULT_URL_SCHEME.m2ts.ios);
        expect(conf.urlscheme.download.ios).toBe(Configuration.DEFAULT_URL_SCHEME.download.ios);
    });
});



