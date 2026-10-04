import { describe, expect, it } from 'vitest';
import { ModelContainer } from '../../src/model/ModelContainer.js';
import * as containerSetter from '../../src/model/ModelContainerSetter.js';
import ILoggerModel from '../../src/model/ILoggerModel.js';

describe('Pure DI ModelContainer Tests', () => {
    it('should register and resolve singleton instances', () => {
        const container = new ModelContainer();
        let callCount = 0;
        class DummyService {
            public id = ++callCount;
        }

        container.registerSingleton('DummyService', () => new DummyService());
        expect(container.isBound('DummyService')).toBe(true);

        const instance1 = container.get<DummyService>('DummyService');
        const instance2 = container.get<DummyService>('DummyService');

        expect(instance1).toBe(instance2);
        expect(instance1.id).toBe(1);
        expect(callCount).toBe(1);
    });

    it('should register and resolve transient instances', () => {
        const container = new ModelContainer();
        let callCount = 0;
        class DummyTransient {
            public id = ++callCount;
        }

        container.registerTransient('DummyTransient', () => new DummyTransient());
        expect(container.isBound('DummyTransient')).toBe(true);

        const instance1 = container.get<DummyTransient>('DummyTransient');
        const instance2 = container.get<DummyTransient>('DummyTransient');

        expect(instance1).not.toBe(instance2);
        expect(instance1.id).toBe(1);
        expect(instance2.id).toBe(2);
        expect(callCount).toBe(2);
    });

    it('should throw an informative error when resolving unregistered model', () => {
        const container = new ModelContainer();
        expect(container.isBound('NonExistent')).toBe(false);
        expect(() => container.get('NonExistent')).toThrow("Model 'NonExistent' is not registered");
    });

    it('should support rebind and bind with toConstantValue (for tests)', () => {
        const container = new ModelContainer();
        container.registerSingleton('ValueService', () => 'original');

        expect(container.get('ValueService')).toBe('original');

        container.rebind('ValueService').toConstantValue('mocked');
        expect(container.get('ValueService')).toBe('mocked');

        container.bind('NewMock').toConstantValue(42);
        expect(container.get('NewMock')).toBe(42);
    });

    it('should support rebind with to().inSingletonScope()', () => {
        const container = new ModelContainer();
        class OriginalClass {
            public name = 'original';
        }
        class MockClass {
            public name = 'mock';
        }

        container.registerSingleton('Service', () => new OriginalClass());
        expect(container.get<OriginalClass>('Service').name).toBe('original');

        container.rebind('Service').to(MockClass).inSingletonScope();
        expect(container.get<MockClass>('Service').name).toBe('mock');
    });

    it('should support unbind and reset', () => {
        const container = new ModelContainer();
        container.registerSingleton('Service', () => ({ val: 1 }));
        container.bind('Mock').toConstantValue('test');

        expect(container.isBound('Service')).toBe(true);
        expect(container.isBound('Mock')).toBe(true);

        container.unbind('Mock');
        expect(container.isBound('Mock')).toBe(false);

        container.rebind('Service').toConstantValue('overridden');
        expect(container.get('Service')).toBe('overridden');

        container.reset();
        // After reset, override is cleared and original factory is invoked again
        expect(container.get<{ val: number }>('Service').val).toBe(1);
    });

    it('should detect circular dependency and throw descriptive error', () => {
        const container = new ModelContainer();
        container.registerSingleton('ServiceA', c => c.get('ServiceB'));
        container.registerSingleton('ServiceB', c => c.get('ServiceA'));

        expect(() => container.get('ServiceA')).toThrow("Circular dependency detected while resolving 'ServiceA'");
    });

    it('should evaluate toProvider lazily and resolve provider', async () => {
        const container = new ModelContainer();
        let providerFactoryCallCount = 0;

        container.registerSingleton('Dependency', () => 'dep_value');
        container.bind('LazyProvider').toProvider(context => {
            providerFactoryCallCount++;
            return () => Promise.resolve(context.container.get<string>('Dependency') + '_result');
        });

        // toProvider must be lazy: factory not called during registration
        expect(providerFactoryCallCount).toBe(0);

        const provider = container.get<() => Promise<string>>('LazyProvider');
        expect(providerFactoryCallCount).toBe(1);
        expect(typeof provider).toBe('function');
        expect(await provider()).toBe('dep_value_result');
    });

    it('should clear cached singleton when re-registering or binding new constructor', () => {
        const container = new ModelContainer();
        class InitialService {
            public value = 'initial';
        }
        class ReplacedService {
            public value = 'replaced';
        }

        container.registerSingleton('Service', () => new InitialService());
        expect(container.get<InitialService>('Service').value).toBe('initial');

        // bind.to should clear stale singleton cache
        container.bind('Service').to(ReplacedService);
        expect(container.get<ReplacedService>('Service').value).toBe('replaced');
    });

    it('should initialize full dependency graph via containerSetter.set and resolve all typed accessors', () => {
        const container = new ModelContainer();
        containerSetter.set(container);

        // Core singletons must be bound
        expect(container.isBound('ILoggerModel')).toBe(true);
        expect(container.isBound('IConfiguration')).toBe(true);
        expect(container.isBound('IDrizzleOperator')).toBe(true);
        expect(container.isBound('IRecordedDB')).toBe(true);
        expect(container.isBound('IReservationManageModel')).toBe(true);
        expect(container.isBound('IRecordedManageModel')).toBe(true);
        expect(container.isBound('IServiceServer')).toBe(true);

        // Typed getter works
        const logger = container.loggerModel;
        expect(logger).toBeDefined();
        expect(typeof logger.initialize).toBe('function');

        // Same singleton instance returned
        expect(container.get<ILoggerModel>('ILoggerModel')).toBe(logger);

        // Events typed accessors
        expect(container.ruleEvent).toBeDefined();
        expect(container.thumbnailEvent).toBeDefined();
        expect(container.recordedEvent).toBeDefined();
        expect(container.recordingEvent).toBeDefined();
        expect(container.recordedTagEvent).toBeDefined();
        expect(container.reserveEvent).toBeDefined();
        expect(container.epgUpdateEvent).toBeDefined();
        expect(container.operatorEncodeEvent).toBeDefined();
        expect(container.encodeEvent).toBeDefined();

        // Helper typed accessors
        expect(container.reserveOptionChecker).toBeDefined();
        expect(container.recordingStreamCreator).toBeDefined();
        expect(container.recordingUtilModel).toBeDefined();
        expect(container.dropCheckerModel).toBeDefined();
        expect(typeof container.recorderModelProvider).toBe('function');
        expect(typeof container.encoderModelProvider).toBe('function');
        expect(typeof container.liveStreamModelProvider).toBe('function');
        expect(typeof container.liveHLSStreamModelProvider).toBe('function');
        expect(typeof container.recordedStreamModelProvider).toBe('function');
        expect(typeof container.recordedHLSStreamModelProvider).toBe('function');
        expect(container.hlsFileDeleterModel).toBeDefined();
        expect(container.eventSetter).toBeDefined();
    });
});
