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

    it('should parse and merge default streaming configuration in Configuration model', () => {
        const templatePath = path.join(__dirname, '..', '..', 'config', 'config.yml.template');
        const content = fs.readFileSync(templatePath, 'utf-8');
        const rawConfig = yaml.load(content);
        const conf = Configuration.formatAndValidateConfig(rawConfig);

        expect(conf.server.port).toBe(8888);
        expect(conf.database.type).toBe('sqlite');
        expect(conf.streaming).toBeDefined();
        expect(conf.streaming!.live).toBeDefined();
        expect(conf.streaming!.recorded).toBeDefined();
        expect(conf.streaming!.tempDir).toBeDefined();
        expect(conf.encode.binaries.ffmpeg).toBe('/usr/bin/ffmpeg');
        expect(conf.encode.binaries.ffprobe).toBe('/usr/bin/ffprobe');
    });

    it('should throw on invalid port in Configuration model', () => {
        expect(() => {
            Configuration.formatAndValidateConfig({
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
        const conf = Configuration.formatAndValidateConfig({
            server: { port: 8888, mirakurun: 'http://localhost:40772' },
            database: { type: 'sqlite' },
            recording: { directories: [{ name: 'rec', path: '/path' }] },
            urlscheme: {
                video: {
                    ios: 'custom-scheme://play',
                },
            },
        } as any);

        expect(conf.urlscheme).toBeDefined();
        expect(conf.urlscheme!.video.ios).toBe('custom-scheme://play');
        expect(conf.urlscheme!.video.android).toContain('intent://');
        expect(conf.urlscheme!.m2ts.ios).toBe(Configuration.DEFAULT_URL_SCHEME.m2ts.ios);
        expect(conf.urlscheme!.download.ios).toBe(Configuration.DEFAULT_URL_SCHEME.download.ios);
    });

    it('should automatically resolve script property in presets to cmd', () => {
        const conf = Configuration.formatAndValidateConfig({
            server: { port: 8888, mirakurun: 'http://localhost:40772' },
            database: { type: 'sqlite' },
            recording: { directories: [{ name: 'rec', path: '/path' }] },
            encode: {
                presets: [
                    {
                        name: 'H.264-1080p',
                        script: 'enc_1080p.js',
                        suffix: '.mp4',
                    },
                    {
                        name: 'Custom-Command',
                        cmd: 'custom_script.sh',
                        suffix: '.mp4',
                    },
                ],
            },
        } as any);

        expect(conf.encode.presets[0].script).toBe('enc_1080p.js');
        expect(conf.encode.presets[0].cmd).toBe('%NODE% %ROOT%/config/enc_1080p.js');
        expect(conf.encode.presets[1].cmd).toBe('custom_script.sh');
    });

    it('should correctly parse subtitle option in encode presets with global fallback', () => {
        const conf = Configuration.formatAndValidateConfig({
            server: { port: 8888, mirakurun: 'http://localhost:40772' },
            database: { type: 'sqlite' },
            recording: { directories: [{ name: 'rec', path: '/path' }] },
            encode: {
                subtitle: true, // グローバルで有効
                presets: [
                    {
                        name: 'Inherit-Subtitle',
                        script: 'enc_1080p.js',
                        suffix: '.mp4',
                    },
                    {
                        name: 'Explicit-Disable',
                        script: 'enc_720p.js',
                        suffix: '.mp4',
                        subtitle: false,
                    },
                ],
            },
        } as any);

        // グローバル true を継承
        expect(conf.encode.presets[0].subtitle).toBe(true);
        // 個別の false 指定が優先
        expect(conf.encode.presets[1].subtitle).toBe(false);
    });

    it('should throw error when checkDirectories is true and recording directory does not exist', () => {
        expect(() => {
            Configuration.formatAndValidateConfig(
                {
                    server: { port: 8888, mirakurun: 'http://localhost:40772' },
                    database: { type: 'sqlite' },
                    recording: {
                        directories: [
                            { name: 'invalid-dir', path: '/non/existent/path/that/cannot/possibly/exist/epgdeck' },
                        ],
                    },
                } as any,
                { checkDirectories: true },
            );
        }).toThrow(/Recording directory not found/);
    });
});


