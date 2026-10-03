import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { TsProbe, TsSubtitleId3Muxer } from 'arib-probe';
import { Client as MirakurunClient } from 'mirakurun';
import * as rfs from 'rotating-file-stream';
import * as SocketIO from 'socket.io';
import * as yaml from 'js-yaml';
import StreamBaseModel from '../../src/model/service/stream/base/StreamBaseModel.js';

describe('CJS / ESM Interop Regression Tests', () => {
    describe('TsSubtitleId3Muxer', () => {
        it('should instantiate TsSubtitleId3Muxer stream via StreamBaseModel factory', () => {
            // StreamBaseModel 実装ファクトリの挙動テスト
            class TestStreamModel extends StreamBaseModel<any> {
                public start(): Promise<void> {
                    return Promise.resolve();
                }
                public getStream(): any {
                    return null;
                }
                public getInfo(): any {
                    return {} as any;
                }
                protected getStreamType(): any {
                    return 'LiveHLS';
                }
                public testCreateTransform() {
                    return this.createID3MetadataTransform();
                }
            }

            const dummyConfig = { getConfig: () => ({}) as any };
            const dummyLogger = { getLogger: () => ({}) as any };
            const model = new TestStreamModel(dummyConfig as any, dummyLogger as any, {} as any, {} as any, {} as any);
            const transform = model.testCreateTransform();

            expect(transform).toBeDefined();
            expect(typeof transform.pipe).toBe('function');
            expect(typeof transform.unpipe).toBe('function');
            expect(typeof transform.destroy).toBe('function');
            expect(transform).toBeInstanceOf(TsSubtitleId3Muxer);
        });
    });

    describe('arib-probe', () => {
        it('should instantiate TsProbe stream and verify methods', () => {
            const probe = new TsProbe();
            expect(probe).toBeDefined();
            expect(typeof probe.pipe).toBe('function');
            expect(typeof probe.getResult).toBe('function');
            expect(typeof probe.reset).toBe('function');
        });
    });

    describe('mirakurun', () => {
        it('should instantiate Client as a constructor', () => {
            const client = new MirakurunClient();
            expect(client).toBeDefined();
            expect(typeof client.getChannels).toBe('function');
            expect(typeof client.getPrograms).toBe('function');
            expect(typeof client.getServices).toBe('function');
        });
    });

    describe('rotating-file-stream', () => {
        it('should expose createStream function on namespace import', () => {
            expect(typeof rfs.createStream).toBe('function');
        });
    });

    describe('socket.io', () => {
        it('should expose Server constructor on namespace import', () => {
            expect(typeof SocketIO.Server).toBe('function');
        });
    });

    describe('js-yaml', () => {
        it('should expose load and dump functions on namespace import', () => {
            expect(typeof yaml.load).toBe('function');
            expect(typeof yaml.dump).toBe('function');
            const parsed = yaml.load('key: value') as any;
            expect(parsed).toEqual({ key: 'value' });
        });
    });
});
