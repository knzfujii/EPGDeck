import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import ID3MetadataTransform from 'arib-subtitle-timedmetadater';
import * as aribtsNamespace from 'aribts';
import { Client as MirakurunClient } from 'mirakurun';
import log4js from 'log4js';
import * as SocketIO from 'socket.io';
import * as yaml from 'js-yaml';
import StreamBaseModel from '../../src/model/service/stream/base/StreamBaseModel.js';

describe('CJS / ESM Interop Regression Tests', () => {
    describe('arib-subtitle-timedmetadater', () => {
        it('should safely unwrap and instantiate ID3MetadataTransform stream', () => {
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
        });

        it('should unwrap constructor even when imported as default object', () => {
            const Ctor = ((ID3MetadataTransform as any).default || ID3MetadataTransform) as typeof ID3MetadataTransform;
            const instance = new Ctor();
            expect(instance).toBeDefined();
            expect(instance.constructor.name).toBe('MetadataTransform');
        });
    });

    describe('aribts', () => {
        it('should safely unwrap aribts namespace and instantiate all parser components', () => {
            const aribtsCtor = ((aribtsNamespace as any).default || aribtsNamespace) as typeof aribtsNamespace;

            expect(typeof aribtsCtor.TsReadableConnector).toBe('function');
            expect(typeof aribtsCtor.TsPacketParser).toBe('function');
            expect(typeof aribtsCtor.TsPacketAnalyzer).toBe('function');
            expect(typeof aribtsCtor.TsSectionParser).toBe('function');
            expect(typeof aribtsCtor.TsSectionAnalyzer).toBe('function');
            expect(typeof aribtsCtor.TsSectionUpdater).toBe('function');
            expect(typeof aribtsCtor.TsPacketSelector).toBe('function');

            const connector = new aribtsCtor.TsReadableConnector();
            const parser = new aribtsCtor.TsPacketParser();
            const analyzer = new aribtsCtor.TsPacketAnalyzer();
            const sParser = new aribtsCtor.TsSectionParser();
            const sAnalyzer = new aribtsCtor.TsSectionAnalyzer();
            const sUpdater = new aribtsCtor.TsSectionUpdater();
            const selector = new aribtsCtor.TsPacketSelector({ pids: [], programNumbers: [] });

            expect(connector).toBeDefined();
            expect(parser).toBeDefined();
            expect(analyzer).toBeDefined();
            expect(sParser).toBeDefined();
            expect(sAnalyzer).toBeDefined();
            expect(sUpdater).toBeDefined();
            expect(selector).toBeDefined();
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

    describe('log4js', () => {
        it('should expose configure function on default import', () => {
            expect(typeof log4js.configure).toBe('function');
            expect(typeof log4js.getLogger).toBe('function');
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
