import type IChannelApiModel from './api/channel/IChannelApiModel.js';
import type IConfigApiModel from './api/config/IConfigApiModel.js';
import type IDropLogApiModel from './api/dropLog/IDropLogApiModel.js';
import type IEncodeApiModel from './api/encode/IEncodeApiModel.js';
import type IApiUtil from './api/IApiUtil.js';
import type IIPTVApiModel from './api/iptv/IIPTVApiModel.js';
import type IRecordedApiModel from './api/recorded/IRecordedApiModel.js';
import type IRecordedItemUtil from './api/IRecordedItemUtil.js';
import type IRecordedTagApiModel from './api/recordedTag/IRecordedTagApiModel.js';
import type IRecordingApiModel from './api/recording/IRecordingApiModel.js';
import type IReserveApiModel from './api/reserve/IReserveApiModel.js';
import type IRuleApiModel from './api/rule/IRuleApiModel.js';
import type IScheduleApiModel from './api/schedule/IScheduleApiModel.js';
import type IStorageApiModel from './api/storage/IStorageApiModel.js';
import type IStreamApiModel from './api/stream/IStreamApiModel.js';
import type IThumbnailApiModel from './api/thumbnail/IThumbnailApiModel.js';
import type IVideoApiModel from './api/video/IVideoApiModel.js';
import type IVideoUtil from './api/video/IVideoUtil.js';
import type IChannelDB from './db/IChannelDB.js';
import type IDrizzleOperator from './db/IDrizzleOperator.js';
import type IDropLogFileDB from './db/IDropLogFileDB.js';
import type IProgramDB from './db/IProgramDB.js';
import type IRecordedDB from './db/IRecordedDB.js';
import type IRecordedHistoryDB from './db/IRecordedHistoryDB.js';
import type IRecordedTagDB from './db/IRecordedTagDB.js';
import type IReserveDB from './db/IReserveDB.js';
import type IRuleDB from './db/IRuleDB.js';
import type IThumbnailDB from './db/IThumbnailDB.js';
import type IVideoFileDB from './db/IVideoFileDB.js';
import type IEPGUpdateExecutorManageModel from './epgUpdater/IEPGUpdateExecutorManageModel.js';
import type IEPGUpdateManageModel from './epgUpdater/IEPGUpdateManageModel.js';
import type IEPGUpdater from './epgUpdater/IEPGUpdater.js';
import type IEncodeEvent from './event/IEncodeEvent.js';
import type IEPGUpdateEvent from './event/IEPGUpdateEvent.js';
import type IEventSetter from './event/IEventSetter.js';
import type IOperatorEncodeEvent from './event/IOperatorEncodeEvent.js';
import type IRecordedEvent from './event/IRecordedEvent.js';
import type IRecordedTagEvent from './event/IRecordedTagEvent.js';
import type IRecordingEvent from './event/IRecordingEvent.js';
import type IReserveEvent from './event/IReserveEvent.js';
import type IRuleEvent from './event/IRuleEvent.js';
import type IThumbnailEvent from './event/IThumbnailEvent.js';
import type IConfiguration from './IConfiguration.js';
import type IConnectionCheckModel from './IConnectionCheckModel.js';
import type IExecutionManagementModel from './IExecutionManagementModel.js';
import type ILoggerModel from './ILoggerModel.js';
import type IMirakurunClientModel from './IMirakurunClientModel.js';
import type IIPCClient from './ipc/IIPCClient.js';
import type IIPCServer from './ipc/IIPCServer.js';
import type { IPromiseQueue } from './IPromiseQueue.js';
import type IPromiseRetry from './IPromiseRetry.js';
import type IExternalCommandManageModel from './operator/externalCommand/IExternalCommandManageModel.js';
import type IReserveOptionChecker from './operator/IReserveOptionChecker.js';
import type IRecordedManageModel from './operator/recorded/IRecordedManageModel.js';
import type IRecordedTagManageModel from './operator/recordedTag/IRecordedTagManageModel.js';
import type IDropCheckerModel from './operator/recording/IDropCheckerModel.js';
import type IRecorderModel from './operator/recording/IRecorderModel.js';
import type { RecorderModelProvider } from './operator/recording/IRecorderModel.js';
import type IRecordingManageModel from './operator/recording/IRecordingManageModel.js';
import type IRecordingStreamCreator from './operator/recording/IRecordingStreamCreator.js';
import type IRecordingUtilModel from './operator/recording/IRecordingUtilModel.js';
import type IReservationManageModel from './operator/reservation/IReservationManageModel.js';
import type IRuleManageModel from './operator/rule/IRuleManageModel.js';
import type IOperatorShutdownModel from './operator/shutdown/IOperatorShutdownModel.js';
import type IStorageManageModel from './operator/storage/IStorageManageModel.js';
import type IThumbnailManageModel from './operator/thumbnail/IThumbnailManageModel.js';
import type IEncodeFileManageModel from './service/encode/IEncodeFileManageModel.js';
import type IEncodeFinishModel from './service/encode/IEncodeFinishModel.js';
import type IEncodeManageModel from './service/encode/IEncodeManageModel.js';
import type { EncoderModelProvider, IEncoderModel } from './service/encode/IEncoderModel.js';
import type IEncodeProcessManageModel from './service/encode/IEncodeProcessManageModel.js';
import type IServiceServer from './service/IServiceServer.js';
import type ILogManageModel from './service/log/ILogManageModel.js';
import type ISocketIOManageModel from './service/socketio/ISocketIOManageModel.js';
import type ILiveStreamBaseModel from './service/stream/base/ILiveStreamBaseModel.js';
import type {
    LiveHLSStreamModelProvider,
    LiveStreamModelProvider,
} from './service/stream/base/ILiveStreamBaseModel.js';
import type IRecordedStreamBaseModel from './service/stream/base/IRecordedStreamBaseModel.js';
import type {
    RecordedHLSStreamModelProvider,
    RecordedStreamModelProvider,
} from './service/stream/base/IRecordedStreamBaseModel.js';
import type IStreamManageModel from './service/stream/manager/IStreamManageModel.js';
import type IHLSFileDeleterModel from './service/stream/util/IHLSFileDeleterModel.js';

export type Factory<T> = (container: ModelContainer) => T;

export interface IBindingOptions {
    singleton?: boolean;
}

/**
 * Pure DI ModelContainer
 * TypeScript ネイティブの型安全な DI コンテナ
 */
export class ModelContainer {
    private factories = new Map<string, { factory: Factory<any>; singleton: boolean }>();
    private singletons = new Map<string, any>();
    private overrides = new Map<string, any>();
    private resolving = new Set<string>();

    public register<T>(name: string, factory: Factory<T>, options: IBindingOptions = {}): this {
        this.singletons.delete(name);
        this.overrides.delete(name);
        this.factories.set(name, {
            factory,
            singleton: options.singleton ?? false,
        });
        return this;
    }

    public registerSingleton<T>(name: string, factory: Factory<T>): this {
        return this.register(name, factory, { singleton: true });
    }

    public registerTransient<T>(name: string, factory: Factory<T>): this {
        return this.register(name, factory, { singleton: false });
    }

    public get<T>(name: string): T {
        if (this.overrides.has(name)) {
            return this.overrides.get(name) as T;
        }
        if (this.singletons.has(name)) {
            return this.singletons.get(name) as T;
        }
        const entry = this.factories.get(name);
        if (!entry) {
            throw new Error(`Model '${name}' is not registered`);
        }
        if (this.resolving.has(name)) {
            throw new Error(`Circular dependency detected while resolving '${name}'`);
        }
        this.resolving.add(name);
        try {
            const instance = entry.factory(this);
            if (entry.singleton) {
                this.singletons.set(name, instance);
            }
            return instance as T;
        } finally {
            this.resolving.delete(name);
        }
    }

    public isBound(name: string): boolean {
        return this.overrides.has(name) || this.singletons.has(name) || this.factories.has(name);
    }

    public bind<T = any>(name: string) {
        return {
            toConstantValue: (val: T) => {
                this.singletons.delete(name);
                this.overrides.set(name, val);
            },
            to: (ctor: new (...args: any[]) => T) => {
                this.singletons.delete(name);
                this.overrides.delete(name);
                this.register(name, () => new ctor(), { singleton: false });
                return {
                    inSingletonScope: () => {
                        this.singletons.delete(name);
                        this.registerSingleton(name, () => new ctor());
                    },
                    inRequestScope: () => {
                        this.singletons.delete(name);
                        this.register(name, () => new ctor(), { singleton: false });
                    },
                };
            },
            toProvider: (providerFactory: (context: { container: ModelContainer }) => any) => {
                this.singletons.delete(name);
                this.overrides.delete(name);
                this.registerSingleton(name, c => providerFactory({ container: c }));
            },
        };
    }

    public rebind<T = any>(name: string) {
        this.overrides.delete(name);
        this.singletons.delete(name);
        return this.bind<T>(name);
    }

    public unbind(name: string): void {
        this.overrides.delete(name);
        this.singletons.delete(name);
        this.factories.delete(name);
        this.resolving.delete(name);
    }

    public reset(): void {
        this.overrides.clear();
        this.singletons.clear();
        this.resolving.clear();
    }

    // Typed Accessors for Pure DI
    public get loggerModel(): ILoggerModel {
        return this.get<ILoggerModel>('ILoggerModel');
    }
    public get configuration(): IConfiguration {
        return this.get<IConfiguration>('IConfiguration');
    }
    public get connectionCheckModel(): IConnectionCheckModel {
        return this.get<IConnectionCheckModel>('IConnectionCheckModel');
    }
    public get promiseQueue(): IPromiseQueue {
        return this.get<IPromiseQueue>('IPromiseQueue');
    }
    public get promiseRetry(): IPromiseRetry {
        return this.get<IPromiseRetry>('IPromiseRetry');
    }
    public get executionManagementModel(): IExecutionManagementModel {
        return this.get<IExecutionManagementModel>('IExecutionManagementModel');
    }
    public get drizzleOperator(): IDrizzleOperator {
        return this.get<IDrizzleOperator>('IDrizzleOperator');
    }
    public get channelDB(): IChannelDB {
        return this.get<IChannelDB>('IChannelDB');
    }
    public get programDB(): IProgramDB {
        return this.get<IProgramDB>('IProgramDB');
    }
    public get recordedDB(): IRecordedDB {
        return this.get<IRecordedDB>('IRecordedDB');
    }
    public get recordedTagDB(): IRecordedTagDB {
        return this.get<IRecordedTagDB>('IRecordedTagDB');
    }
    public get recordedHistoryDB(): IRecordedHistoryDB {
        return this.get<IRecordedHistoryDB>('IRecordedHistoryDB');
    }
    public get reserveDB(): IReserveDB {
        return this.get<IReserveDB>('IReserveDB');
    }
    public get ruleDB(): IRuleDB {
        return this.get<IRuleDB>('IRuleDB');
    }
    public get thumbnailDB(): IThumbnailDB {
        return this.get<IThumbnailDB>('IThumbnailDB');
    }
    public get videoFileDB(): IVideoFileDB {
        return this.get<IVideoFileDB>('IVideoFileDB');
    }
    public get dropLogFileDB(): IDropLogFileDB {
        return this.get<IDropLogFileDB>('IDropLogFileDB');
    }
    public get ipcClient(): IIPCClient {
        return this.get<IIPCClient>('IIPCClient');
    }
    public get ipcServer(): IIPCServer {
        return this.get<IIPCServer>('IIPCServer');
    }
    public get mirakurunClientModel(): IMirakurunClientModel {
        return this.get<IMirakurunClientModel>('IMirakurunClientModel');
    }
    public get recordingManageModel(): IRecordingManageModel {
        return this.get<IRecordingManageModel>('IRecordingManageModel');
    }
    public get recordedManageModel(): IRecordedManageModel {
        return this.get<IRecordedManageModel>('IRecordedManageModel');
    }
    public get recordedTagManageModel(): IRecordedTagManageModel {
        return this.get<IRecordedTagManageModel>('IRecordedTagManageModel');
    }
    public get reservationManageModel(): IReservationManageModel {
        return this.get<IReservationManageModel>('IReservationManageModel');
    }
    public get ruleManageModel(): IRuleManageModel {
        return this.get<IRuleManageModel>('IRuleManageModel');
    }
    public get thumbnailManageModel(): IThumbnailManageModel {
        return this.get<IThumbnailManageModel>('IThumbnailManageModel');
    }
    public get storageManageModel(): IStorageManageModel {
        return this.get<IStorageManageModel>('IStorageManageModel');
    }
    public get operatorShutdownModel(): IOperatorShutdownModel {
        return this.get<IOperatorShutdownModel>('IOperatorShutdownModel');
    }
    public get epgUpdater(): IEPGUpdater {
        return this.get<IEPGUpdater>('IEPGUpdater');
    }
    public get epgUpdateManageModel(): IEPGUpdateManageModel {
        return this.get<IEPGUpdateManageModel>('IEPGUpdateManageModel');
    }
    public get epgUpdateExecutorManageModel(): IEPGUpdateExecutorManageModel {
        return this.get<IEPGUpdateExecutorManageModel>('IEPGUpdateExecutorManageModel');
    }
    public get serviceServer(): IServiceServer {
        return this.get<IServiceServer>('IServiceServer');
    }
    public get socketIOManageModel(): ISocketIOManageModel {
        return this.get<ISocketIOManageModel>('ISocketIOManageModel');
    }
    public get logManageModel(): ILogManageModel {
        return this.get<ILogManageModel>('ILogManageModel');
    }
    public get streamManageModel(): IStreamManageModel {
        return this.get<IStreamManageModel>('IStreamManageModel');
    }
    public get encodeManageModel(): IEncodeManageModel {
        return this.get<IEncodeManageModel>('IEncodeManageModel');
    }
    public get encodeProcessManageModel(): IEncodeProcessManageModel {
        return this.get<IEncodeProcessManageModel>('IEncodeProcessManageModel');
    }
    public get encodeFileManageModel(): IEncodeFileManageModel {
        return this.get<IEncodeFileManageModel>('IEncodeFileManageModel');
    }
    public get encodeFinishModel(): IEncodeFinishModel {
        return this.get<IEncodeFinishModel>('IEncodeFinishModel');
    }
    public get eventSetter(): IEventSetter {
        return this.get<IEventSetter>('IEventSetter');
    }
    public get externalCommandManageModel(): IExternalCommandManageModel {
        return this.get<IExternalCommandManageModel>('IExternalCommandManageModel');
    }
    public get apiUtil(): IApiUtil {
        return this.get<IApiUtil>('IApiUtil');
    }
    public get recordedItemUtil(): IRecordedItemUtil {
        return this.get<IRecordedItemUtil>('IRecordedItemUtil');
    }
    public get videoUtil(): IVideoUtil {
        return this.get<IVideoUtil>('IVideoUtil');
    }
    public get channelApiModel(): IChannelApiModel {
        return this.get<IChannelApiModel>('IChannelApiModel');
    }
    public get configApiModel(): IConfigApiModel {
        return this.get<IConfigApiModel>('IConfigApiModel');
    }
    public get dropLogApiModel(): IDropLogApiModel {
        return this.get<IDropLogApiModel>('IDropLogApiModel');
    }
    public get encodeApiModel(): IEncodeApiModel {
        return this.get<IEncodeApiModel>('IEncodeApiModel');
    }
    public get iptvApiModel(): IIPTVApiModel {
        return this.get<IIPTVApiModel>('IIPTVApiModel');
    }
    public get recordedApiModel(): IRecordedApiModel {
        return this.get<IRecordedApiModel>('IRecordedApiModel');
    }
    public get recordedTagApiModel(): IRecordedTagApiModel {
        return this.get<IRecordedTagApiModel>('IRecordedTagApiModel');
    }
    public get recordingApiModel(): IRecordingApiModel {
        return this.get<IRecordingApiModel>('IRecordingApiModel');
    }
    public get reserveApiModel(): IReserveApiModel {
        return this.get<IReserveApiModel>('IReserveApiModel');
    }
    public get ruleApiModel(): IRuleApiModel {
        return this.get<IRuleApiModel>('IRuleApiModel');
    }
    public get scheduleApiModel(): IScheduleApiModel {
        return this.get<IScheduleApiModel>('IScheduleApiModel');
    }
    public get storageApiModel(): IStorageApiModel {
        return this.get<IStorageApiModel>('IStorageApiModel');
    }
    public get streamApiModel(): IStreamApiModel {
        return this.get<IStreamApiModel>('IStreamApiModel');
    }
    public get thumbnailApiModel(): IThumbnailApiModel {
        return this.get<IThumbnailApiModel>('IThumbnailApiModel');
    }
    public get videoApiModel(): IVideoApiModel {
        return this.get<IVideoApiModel>('IVideoApiModel');
    }

    // Events
    public get ruleEvent(): IRuleEvent {
        return this.get<IRuleEvent>('IRuleEvent');
    }
    public get thumbnailEvent(): IThumbnailEvent {
        return this.get<IThumbnailEvent>('IThumbnailEvent');
    }
    public get recordedEvent(): IRecordedEvent {
        return this.get<IRecordedEvent>('IRecordedEvent');
    }
    public get recordingEvent(): IRecordingEvent {
        return this.get<IRecordingEvent>('IRecordingEvent');
    }
    public get recordedTagEvent(): IRecordedTagEvent {
        return this.get<IRecordedTagEvent>('IRecordedTagEvent');
    }
    public get reserveEvent(): IReserveEvent {
        return this.get<IReserveEvent>('IReserveEvent');
    }
    public get epgUpdateEvent(): IEPGUpdateEvent {
        return this.get<IEPGUpdateEvent>('IEPGUpdateEvent');
    }
    public get operatorEncodeEvent(): IOperatorEncodeEvent {
        return this.get<IOperatorEncodeEvent>('IOperatorEncodeEvent');
    }
    public get encodeEvent(): IEncodeEvent {
        return this.get<IEncodeEvent>('IEncodeEvent');
    }

    // Operator & Service helpers
    public get reserveOptionChecker(): IReserveOptionChecker {
        return this.get<IReserveOptionChecker>('IReserveOptionChecker');
    }
    public get recordingStreamCreator(): IRecordingStreamCreator {
        return this.get<IRecordingStreamCreator>('IRecordingStreamCreator');
    }
    public get recordingUtilModel(): IRecordingUtilModel {
        return this.get<IRecordingUtilModel>('IRecordingUtilModel');
    }
    public get dropCheckerModel(): IDropCheckerModel {
        return this.get<IDropCheckerModel>('IDropCheckerModel');
    }
    public get recorderModel(): IRecorderModel {
        return this.get<IRecorderModel>('IRecorderModel');
    }
    public get recorderModelProvider(): RecorderModelProvider {
        return this.get<RecorderModelProvider>('RecorderModelProvider');
    }
    public get encoderModel(): IEncoderModel {
        return this.get<IEncoderModel>('IEncoderModel');
    }
    public get encoderModelProvider(): EncoderModelProvider {
        return this.get<EncoderModelProvider>('EncoderModelProvider');
    }
    public get hlsFileDeleterModel(): IHLSFileDeleterModel {
        return this.get<IHLSFileDeleterModel>('IHLSFileDeleterModel');
    }
    public get liveStreamModel(): ILiveStreamBaseModel {
        return this.get<ILiveStreamBaseModel>('LiveStreamModel');
    }
    public get liveStreamModelProvider(): LiveStreamModelProvider {
        return this.get<LiveStreamModelProvider>('LiveStreamModelProvider');
    }
    public get liveHLSStreamModel(): ILiveStreamBaseModel {
        return this.get<ILiveStreamBaseModel>('LiveHLSStreamModel');
    }
    public get liveHLSStreamModelProvider(): LiveHLSStreamModelProvider {
        return this.get<LiveHLSStreamModelProvider>('LiveHLSStreamModelProvider');
    }
    public get recordedStreamModel(): IRecordedStreamBaseModel {
        return this.get<IRecordedStreamBaseModel>('RecordedStreamModel');
    }
    public get recordedStreamModelProvider(): RecordedStreamModelProvider {
        return this.get<RecordedStreamModelProvider>('RecordedStreamModelProvider');
    }
    public get recordedHLSStreamModel(): IRecordedStreamBaseModel {
        return this.get<IRecordedStreamBaseModel>('RecordedHLSStreamModel');
    }
    public get recordedHLSStreamModelProvider(): RecordedHLSStreamModelProvider {
        return this.get<RecordedHLSStreamModelProvider>('RecordedHLSStreamModelProvider');
    }
}

export { ModelContainer as Container };

const container = new ModelContainer();

export default container;
