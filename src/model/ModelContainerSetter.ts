import ApiUtil from './api/ApiUtil.js';
import ChannelApiModel from './api/channel/ChannelApiModel.js';
import type IChannelApiModel from './api/channel/IChannelApiModel.js';
import ConfigApiModel from './api/config/ConfigApiModel.js';
import type IConfigApiModel from './api/config/IConfigApiModel.js';
import DropLogApiModel from './api/dropLog/DropLogApiModel.js';
import type IDropLogApiModel from './api/dropLog/IDropLogApiModel.js';
import EncodeApiModel from './api/encode/EncodeApiModel.js';
import type IEncodeApiModel from './api/encode/IEncodeApiModel.js';
import type IApiUtil from './api/IApiUtil.js';
import type IIPTVApiModel from './api/iptv/IIPTVApiModel.js';
import IPTVApiModel from './api/iptv/IPTVApiModel.js';
import type IRecordedItemUtil from './api/IRecordedItemUtil.js';
import type IRecordedApiModel from './api/recorded/IRecordedApiModel.js';
import RecordedApiModel from './api/recorded/RecordedApiModel.js';
import RecordedItemUtil from './api/RecordedItemUtil.js';
import type IRecordedTagApiModel from './api/recordedTag/IRecordedTagApiModel.js';
import RecordedTagApiModel from './api/recordedTag/RecordedTagApiModel.js';
import type IRecordingApiModel from './api/recording/IRecordingApiModel.js';
import RecordingApiModel from './api/recording/RecordingApiModel.js';
import type IReserveApiModel from './api/reserve/IReserveApiModel.js';
import ReserveApiModel from './api/reserve/ReserveApiModel.js';
import type IRuleApiModel from './api/rule/IRuleApiModel.js';
import RuleApiModel from './api/rule/RuleApiModel.js';
import type IScheduleApiModel from './api/schedule/IScheduleApiModel.js';
import ScheduleApiModel from './api/schedule/ScheduleApiModel.js';
import type IStorageApiModel from './api/storage/IStorageApiModel.js';
import StorageApiModel from './api/storage/StorageApiModel.js';
import type IStreamApiModel from './api/stream/IStreamApiModel.js';
import StreamApiModel from './api/stream/StreamApiModel.js';
import type IThumbnailApiModel from './api/thumbnail/IThumbnailApiModel.js';
import ThumbnailApiModel from './api/thumbnail/ThumbnailApiModel.js';
import type IVideoApiModel from './api/video/IVideoApiModel.js';
import type IVideoUtil from './api/video/IVideoUtil.js';
import VideoApiModel from './api/video/VideoApiModel.js';
import VideoUtil from './api/video/VideoUtil.js';
import Configuration from './Configuration.js';
import ConnectionCheckModel from './ConnectionCheckModel.js';
import ChannelDB from './db/ChannelDB.js';
import DrizzleOperator from './db/DrizzleOperator.js';
import DropLogFileDB from './db/DropLogFileDB.js';
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
import ProgramDB from './db/ProgramDB.js';
import RecordedDB from './db/RecordedDB.js';
import RecordedHistoryDB from './db/RecordedHistoryDB.js';
import RecordedTagDB from './db/RecordedTagDB.js';
import ReserveDB from './db/ReserveDB.js';
import RuleDB from './db/RuleDB.js';
import ThumbnailDB from './db/ThumbnailDB.js';
import VideoFileDB from './db/VideoFileDB.js';
import EPGUpdateExecutorManageModel from './epgUpdater/EPGUpdateExecutorManageModel.js';
import EPGUpdateManageModel from './epgUpdater/EPGUpdateManageModel.js';
import EPGUpdater from './epgUpdater/EPGUpdater.js';
import type IEPGUpdateExecutorManageModel from './epgUpdater/IEPGUpdateExecutorManageModel.js';
import type IEPGUpdateManageModel from './epgUpdater/IEPGUpdateManageModel.js';
import type IEPGUpdater from './epgUpdater/IEPGUpdater.js';
import EncodeEvent from './event/EncodeEvent.js';
import EPGUpdateEvent from './event/EPGUpdateEvent.js';
import EventSetter from './event/EventSetter.js';
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
import OperatorEncodeEvent from './event/OperatorEncodeEvent.js';
import RecordedEvent from './event/RecordedEvent.js';
import RecordedTagEvent from './event/RecordedTagEvent.js';
import RecordingEvent from './event/RecordingEvent.js';
import ReserveEvent from './event/ReserveEvent.js';
import RuleEvent from './event/RuleEvent.js';
import ThumbnailEvent from './event/ThumbnailEvent.js';
import ExecutionManagementModel from './ExecutionManagementModel.js';
import type IConfiguration from './IConfiguration.js';
import type IConnectionCheckModel from './IConnectionCheckModel.js';
import type IExecutionManagementModel from './IExecutionManagementModel.js';
import type ILoggerModel from './ILoggerModel.js';
import type IMirakurunClientModel from './IMirakurunClientModel.js';
import type IIPCClient from './ipc/IIPCClient.js';
import type IIPCServer from './ipc/IIPCServer.js';
import IPCClient from './ipc/IPCClient.js';
import IPCServer from './ipc/IPCServer.js';
import type { IPromiseQueue } from './IPromiseQueue.js';
import type IPromiseRetry from './IPromiseRetry.js';
import LoggerModel from './LoggerModel.js';
import MirakurunClientModel from './MirakurunClientModel.js';
import type { ModelContainer } from './ModelContainer.js';
import ExternalCommandManageModel from './operator/externalCommand/ExternalCommandManageModel.js';
import type IExternalCommandManageModel from './operator/externalCommand/IExternalCommandManageModel.js';
import type IReserveOptionChecker from './operator/IReserveOptionChecker.js';
import type IRecordedManageModel from './operator/recorded/IRecordedManageModel.js';
import RecordedManageModel from './operator/recorded/RecordedManageModel.js';
import type IRecordedTagManageModel from './operator/recordedTag/IRecordedTagManageModel.js';
import RecordedTagManageModel from './operator/recordedTag/RecordedTagManageModel.js';
import DropCheckerModel from './operator/recording/DropCheckerModel.js';
import type IDropCheckerModel from './operator/recording/IDropCheckerModel.js';
import type IRecorderModel from './operator/recording/IRecorderModel.js';
import { type RecorderModelProvider } from './operator/recording/IRecorderModel.js';
import type IRecordingManageModel from './operator/recording/IRecordingManageModel.js';
import type IRecordingStreamCreator from './operator/recording/IRecordingStreamCreator.js';
import type IRecordingUtilModel from './operator/recording/IRecordingUtilModel.js';
import RecorderModel from './operator/recording/RecorderModel.js';
import RecordingManageModel from './operator/recording/RecordingManageModel.js';
import RecordingStreamCreator from './operator/recording/RecordingStreamCreator.js';
import RecordingUtilModel from './operator/recording/RecordingUtilModel.js';
import type IReservationManageModel from './operator/reservation/IReservationManageModel.js';
import ReservationManageModel from './operator/reservation/ReservationManageModel.js';
import ReserveOptionChecker from './operator/ReserveOptionChecker.js';
import type IRuleManageModel from './operator/rule/IRuleManageModel.js';
import RuleManageModel from './operator/rule/RuleManageModel.js';
import type IOperatorShutdownModel from './operator/shutdown/IOperatorShutdownModel.js';
import OperatorShutdownModel from './operator/shutdown/OperatorShutdownModel.js';
import type IStorageManageModel from './operator/storage/IStorageManageModel.js';
import StorageManageModel from './operator/storage/StorageManageModel.js';
import type IThumbnailManageModel from './operator/thumbnail/IThumbnailManageModel.js';
import ThumbnailManageModel from './operator/thumbnail/ThumbnailManageModel.js';
import PromiseQueue from './PromiseQueue.js';
import PromiseRetry from './PromiseRetry.js';
import EncodeFileManageModel from './service/encode/EncodeFileManageModel.js';
import EncodeFinishModel from './service/encode/EncodeFinishModel.js';
import EncodeManageModel from './service/encode/EncodeManageModel.js';
import EncodeProcessManageModel from './service/encode/EncodeProcessManageModel.js';
import EncoderModel from './service/encode/EncoderModel.js';
import type IEncodeFileManageModel from './service/encode/IEncodeFileManageModel.js';
import type IEncodeFinishModel from './service/encode/IEncodeFinishModel.js';
import type IEncodeManageModel from './service/encode/IEncodeManageModel.js';
import type IEncodeProcessManageModel from './service/encode/IEncodeProcessManageModel.js';
import { type EncoderModelProvider, type IEncoderModel } from './service/encode/IEncoderModel.js';
import type IServiceServer from './service/IServiceServer.js';
import ServiceServer from './service/ServiceServer.js';
import type ILogManageModel from './service/log/ILogManageModel.js';
import LogManageModel from './service/log/LogManageModel.js';
import type ISocketIOManageModel from './service/socketio/ISocketIOManageModel.js';
import SocketIOManageModel from './service/socketio/SocketIOManageModel.js';
import type ILiveStreamBaseModel from './service/stream/base/ILiveStreamBaseModel.js';
import {
    type LiveHLSStreamModelProvider,
    type LiveStreamModelProvider,
} from './service/stream/base/ILiveStreamBaseModel.js';
import type IRecordedStreamBaseModel from './service/stream/base/IRecordedStreamBaseModel.js';
import {
    type RecordedHLSStreamModelProvider,
    type RecordedStreamModelProvider,
} from './service/stream/base/IRecordedStreamBaseModel.js';
import LiveHLSStreamModel from './service/stream/LiveHLSStreamModel.js';
import LiveStreamModel from './service/stream/LiveStreamModel.js';
import type IStreamManageModel from './service/stream/manager/IStreamManageModel.js';
import StreamManageModel from './service/stream/manager/StreamManageModel.js';
import RecordedHLSStreamModel from './service/stream/RecordedHLSStreamModel.js';
import RecordedStreamModel from './service/stream/RecordedStreamModel.js';
import HLSFileDeleterModel from './service/stream/util/HLSFileDeleterModel.js';
import type IHLSFileDeleterModel from './service/stream/util/IHLSFileDeleterModel.js';

/**
 * ModelContainer に各 Model のファクトリを登録する (Pure DI)
 */
export const set = (container: ModelContainer): void => {
    // 基礎インフラ
    container.registerSingleton<ILoggerModel>('ILoggerModel', () => new LoggerModel());
    container.registerSingleton<IConfiguration>('IConfiguration', c => new Configuration(c.loggerModel));
    container.registerSingleton<IConnectionCheckModel>(
        'IConnectionCheckModel',
        c => new ConnectionCheckModel(c.loggerModel, c.mirakurunClientModel, c.drizzleOperator),
    );
    container.registerTransient<IPromiseQueue>('IPromiseQueue', () => new PromiseQueue());
    container.registerTransient<IPromiseRetry>('IPromiseRetry', () => new PromiseRetry());
    container.registerTransient<IExecutionManagementModel>(
        'IExecutionManagementModel',
        c => new ExecutionManagementModel(c.loggerModel),
    );

    // プロセス間通信 (IPC)
    container.registerSingleton<IIPCClient>(
        'IIPCClient',
        c => new IPCClient(c.loggerModel, c.socketIOManageModel, c.encodeManageModel, c.logManageModel),
    );
    container.registerSingleton<IIPCServer>(
        'IIPCServer',
        c =>
            new IPCServer(
                c.reservationManageModel,
                c.recordedManageModel,
                c.recordedTagManageModel,
                c.recordingManageModel,
                c.ruleManageModel,
                c.thumbnailManageModel,
                c.operatorEncodeEvent,
                c.recordedDB,
                c.reserveDB,
            ),
    );

    // データベース (DAO)
    container.registerSingleton<IDrizzleOperator>('IDrizzleOperator', c => new DrizzleOperator(c.configuration));
    container.registerSingleton<IChannelDB>(
        'IChannelDB',
        c => new ChannelDB(c.configuration, c.drizzleOperator, c.promiseRetry),
    );
    container.registerSingleton<IProgramDB>(
        'IProgramDB',
        c => new ProgramDB(c.configuration, c.drizzleOperator, c.promiseRetry),
    );
    container.registerSingleton<IRecordedDB>('IRecordedDB', c => new RecordedDB(c.drizzleOperator, c.promiseRetry));
    container.registerSingleton<IRecordedTagDB>(
        'IRecordedTagDB',
        c => new RecordedTagDB(c.drizzleOperator, c.promiseRetry),
    );
    container.registerSingleton<IRecordedHistoryDB>(
        'IRecordedHistoryDB',
        c => new RecordedHistoryDB(c.drizzleOperator, c.promiseRetry),
    );
    container.registerSingleton<IReserveDB>('IReserveDB', c => new ReserveDB(c.drizzleOperator, c.promiseRetry));
    container.registerTransient<IRuleDB>('IRuleDB', c => new RuleDB(c.drizzleOperator, c.promiseRetry));
    container.registerSingleton<IThumbnailDB>('IThumbnailDB', c => new ThumbnailDB(c.drizzleOperator, c.promiseRetry));
    container.registerSingleton<IVideoFileDB>('IVideoFileDB', c => new VideoFileDB(c.drizzleOperator, c.promiseRetry));
    container.registerSingleton<IDropLogFileDB>(
        'IDropLogFileDB',
        c => new DropLogFileDB(c.drizzleOperator, c.promiseRetry),
    );

    // イベント
    container.registerSingleton<IRuleEvent>('IRuleEvent', c => new RuleEvent(c.loggerModel));
    container.registerSingleton<IThumbnailEvent>('IThumbnailEvent', c => new ThumbnailEvent(c.loggerModel));
    container.registerSingleton<IRecordedEvent>('IRecordedEvent', c => new RecordedEvent(c.loggerModel));
    container.registerSingleton<IRecordingEvent>('IRecordingEvent', c => new RecordingEvent(c.loggerModel));
    container.registerSingleton<IRecordedTagEvent>('IRecordedTagEvent', c => new RecordedTagEvent(c.loggerModel));
    container.registerSingleton<IReserveEvent>('IReserveEvent', c => new ReserveEvent(c.loggerModel));
    container.registerSingleton<IEPGUpdateEvent>('IEPGUpdateEvent', c => new EPGUpdateEvent(c.loggerModel));
    container.registerSingleton<IOperatorEncodeEvent>(
        'IOperatorEncodeEvent',
        c => new OperatorEncodeEvent(c.loggerModel),
    );

    // EPG
    container.registerSingleton<IEPGUpdateExecutorManageModel>(
        'IEPGUpdateExecutorManageModel',
        c => new EPGUpdateExecutorManageModel(c.loggerModel, c.epgUpdateEvent, c.ipcServer),
    );
    container.registerSingleton<IReserveOptionChecker>(
        'IReserveOptionChecker',
        c => new ReserveOptionChecker(c.configuration),
    );
    container.registerSingleton<IMirakurunClientModel>(
        'IMirakurunClientModel',
        c => new MirakurunClientModel(c.configuration),
    );
    container.registerSingleton<IEPGUpdateManageModel>(
        'IEPGUpdateManageModel',
        c => new EPGUpdateManageModel(c.loggerModel, c.configuration, c.mirakurunClientModel, c.channelDB, c.programDB),
    );
    container.registerSingleton<IEPGUpdater>(
        'IEPGUpdater',
        c => new EPGUpdater(c.loggerModel, c.configuration, c.epgUpdateManageModel),
    );

    // 予約・録画・管理 (Operator)
    container.registerSingleton<IReservationManageModel>(
        'IReservationManageModel',
        c =>
            new ReservationManageModel(
                c.loggerModel,
                c.configuration,
                c.executionManagementModel,
                c.reserveOptionChecker,
                c.reserveDB,
                c.channelDB,
                c.programDB,
                c.ruleDB,
                c.reserveEvent,
            ),
    );
    container.registerSingleton<IRuleManageModel>(
        'IRuleManageModel',
        c => new RuleManageModel(c.loggerModel, c.reserveOptionChecker, c.ruleDB, c.ruleEvent, c.promiseQueue),
    );
    container.registerSingleton<IRecordingStreamCreator>(
        'IRecordingStreamCreator',
        c => new RecordingStreamCreator(c.loggerModel, c.configuration, c.mirakurunClientModel),
    );
    container.registerSingleton<IRecordingUtilModel>(
        'IRecordingUtilModel',
        c =>
            new RecordingUtilModel(
                c.loggerModel,
                c.configuration,
                c.executionManagementModel,
                c.channelDB,
                c.programDB,
                c.videoFileDB,
                c.videoUtil,
            ),
    );

    container.registerTransient<IDropCheckerModel>('IDropCheckerModel', c => new DropCheckerModel(c.loggerModel));
    container.registerTransient<IRecorderModel>(
        'IRecorderModel',
        c =>
            new RecorderModel(
                c.loggerModel,
                c.configuration,
                c.programDB,
                c.reserveDB,
                c.recordedDB,
                c.recordedHistoryDB,
                c.videoFileDB,
                c.dropLogFileDB,
                c.recordingStreamCreator,
                c.dropCheckerModel,
                c.recordingUtilModel,
                c.recordingEvent,
                c.mirakurunClientModel,
            ),
    );
    container.registerSingleton<RecorderModelProvider>('RecorderModelProvider', c => {
        return () => Promise.resolve(c.recorderModel);
    });

    container.registerSingleton<IRecordedManageModel>(
        'IRecordedManageModel',
        c =>
            new RecordedManageModel(
                c.loggerModel,
                c.configuration,
                c.recordedDB,
                c.videoFileDB,
                c.thumbnailDB,
                c.dropLogFileDB,
                c.recordedHistoryDB,
                c.recordingManageModel,
                c.recordedEvent,
                c.videoUtil,
                c.recordingUtilModel,
            ),
    );
    container.registerSingleton<IRecordingManageModel>(
        'IRecordingManageModel',
        c =>
            new RecordingManageModel(
                c.loggerModel,
                c.configuration,
                c.recorderModelProvider,
                c.recordingEvent,
                c.recordingStreamCreator,
                c.recordedDB,
                c.reserveDB,
                c.recordingUtilModel,
            ),
    );
    container.registerSingleton<IRecordedTagManageModel>(
        'IRecordedTagManageModel',
        c => new RecordedTagManageModel(c.loggerModel, c.recordedTagDB, c.recordedTagEvent),
    );
    container.registerSingleton<IThumbnailManageModel>(
        'IThumbnailManageModel',
        c =>
            new ThumbnailManageModel(
                c.loggerModel,
                c.configuration,
                c.promiseQueue,
                c.recordedDB,
                c.videoFileDB,
                c.thumbnailDB,
                c.thumbnailEvent,
                c.videoUtil,
            ),
    );
    container.registerSingleton<IStorageManageModel>(
        'IStorageManageModel',
        c => new StorageManageModel(c.loggerModel, c.configuration, c.recordedManageModel, c.recordedDB),
    );
    container.registerSingleton<IOperatorShutdownModel>(
        'IOperatorShutdownModel',
        c => new OperatorShutdownModel(c.loggerModel, c.storageManageModel, c.recordingManageModel, c.drizzleOperator),
    );
    container.registerSingleton<IEventSetter>(
        'IEventSetter',
        c =>
            new EventSetter(
                c.loggerModel,
                c.epgUpdateEvent,
                c.operatorEncodeEvent,
                c.ruleEvent,
                c.reserveEvent,
                c.recordingEvent,
                c.recordedTagEvent,
                c.recordedEvent,
                c.thumbnailEvent,
                c.reservationManageModel,
                c.recordingManageModel,
                c.recordedManageModel,
                c.recordedTagManageModel,
                c.thumbnailManageModel,
                c.externalCommandManageModel,
                c.ipcServer,
                c.configuration,
            ),
    );

    // サービス・ログ・ソケット (Service)
    container.registerSingleton<ISocketIOManageModel>(
        'ISocketIOManageModel',
        c => new SocketIOManageModel(c.loggerModel, c.configuration),
    );
    container.registerSingleton<ILogManageModel>(
        'ILogManageModel',
        c => new LogManageModel(c.loggerModel, c.configuration, c.socketIOManageModel),
    );
    container.registerSingleton<IExternalCommandManageModel>(
        'IExternalCommandManageModel',
        c =>
            new ExternalCommandManageModel(
                c.loggerModel,
                c.configuration,
                c.promiseQueue,
                c.channelDB,
                c.recordedDB,
                c.videoUtil,
            ),
    );
    container.registerSingleton<IServiceServer>(
        'IServiceServer',
        c => new ServiceServer(c.loggerModel, c.configuration, c.socketIOManageModel),
    );

    // API ユーティリティ
    container.registerSingleton<IApiUtil>('IApiUtil', c => new ApiUtil(c.configuration));
    container.registerSingleton<IRecordedItemUtil>('IRecordedItemUtil', () => new RecordedItemUtil());
    container.registerSingleton<IVideoUtil>('IVideoUtil', c => new VideoUtil(c.configuration, c.videoFileDB));

    // API モデル
    container.registerSingleton<IConfigApiModel>(
        'IConfigApiModel',
        c => new ConfigApiModel(c.configuration, c.ipcClient),
    );
    container.registerSingleton<IChannelApiModel>(
        'IChannelApiModel',
        c => new ChannelApiModel(c.channelDB, c.mirakurunClientModel),
    );
    container.registerSingleton<IScheduleApiModel>(
        'IScheduleApiModel',
        c => new ScheduleApiModel(c.channelDB, c.programDB),
    );
    container.registerSingleton<IReserveApiModel>(
        'IReserveApiModel',
        c => new ReserveApiModel(c.ipcClient, c.reserveDB),
    );
    container.registerSingleton<IRecordedApiModel>(
        'IRecordedApiModel',
        c =>
            new RecordedApiModel(
                c.ipcClient,
                c.recordedDB,
                c.recordedHistoryDB,
                c.encodeManageModel,
                c.recordedItemUtil,
            ),
    );
    container.registerSingleton<IRecordingApiModel>(
        'IRecordingApiModel',
        c => new RecordingApiModel(c.ipcClient, c.recordedDB, c.recordedItemUtil),
    );
    container.registerSingleton<IRecordedTagApiModel>(
        'IRecordedTagApiModel',
        c => new RecordedTagApiModel(c.ipcClient, c.recordedTagDB),
    );
    container.registerSingleton<IRuleApiModel>(
        'IRuleApiModel',
        c => new RuleApiModel(c.ipcClient, c.ruleDB, c.reserveDB),
    );
    container.registerSingleton<IThumbnailApiModel>(
        'IThumbnailApiModel',
        c => new ThumbnailApiModel(c.ipcClient, c.thumbnailDB, c.configuration),
    );
    container.registerSingleton<IDropLogApiModel>(
        'IDropLogApiModel',
        c => new DropLogApiModel(c.configuration, c.dropLogFileDB),
    );
    container.registerSingleton<IVideoApiModel>(
        'IVideoApiModel',
        c => new VideoApiModel(c.configuration, c.videoFileDB, c.recordedDB, c.apiUtil, c.videoUtil, c.ipcClient),
    );
    container.registerSingleton<IEncodeApiModel>(
        'IEncodeApiModel',
        c => new EncodeApiModel(c.encodeManageModel, c.videoFileDB, c.recordedDB, c.recordedItemUtil),
    );
    container.registerSingleton<IIPTVApiModel>('IIPTVApiModel', c => new IPTVApiModel(c.channelDB, c.programDB));

    // エンコード
    container.registerSingleton<IEncodeEvent>('IEncodeEvent', c => new EncodeEvent(c.loggerModel));
    container.registerSingleton<IEncodeProcessManageModel>(
        'IEncodeProcessManageModel',
        c => new EncodeProcessManageModel(c.loggerModel, c.configuration),
    );
    container.registerSingleton<IEncodeFileManageModel>('IEncodeFileManageModel', () => new EncodeFileManageModel());
    container.registerTransient<IEncoderModel>(
        'IEncoderModel',
        c =>
            new EncoderModel(
                c.loggerModel,
                c.configuration,
                c.encodeProcessManageModel,
                c.encodeFileManageModel,
                c.videoFileDB,
                c.recordedDB,
                c.channelDB,
                c.videoUtil,
                c.encodeEvent,
                c.recordingUtilModel,
            ),
    );
    container.registerSingleton<EncoderModelProvider>('EncoderModelProvider', c => {
        return () => Promise.resolve(c.encoderModel);
    });
    container.registerSingleton<IEncodeManageModel>(
        'IEncodeManageModel',
        c =>
            new EncodeManageModel(
                c.loggerModel,
                c.configuration,
                c.executionManagementModel,
                c.encoderModelProvider,
                c.encodeEvent,
            ),
    );
    container.registerSingleton<IEncodeFinishModel>(
        'IEncodeFinishModel',
        c => new EncodeFinishModel(c.loggerModel, c.socketIOManageModel, c.ipcClient, c.encodeEvent),
    );

    // ストリーミング
    container.registerTransient<ILiveStreamBaseModel>(
        'LiveStreamModel',
        c =>
            new LiveStreamModel(
                c.configuration,
                c.loggerModel,
                c.encodeProcessManageModel,
                c.hlsFileDeleterModel,
                c.mirakurunClientModel,
                c.socketIOManageModel,
            ),
    );
    container.registerSingleton<LiveStreamModelProvider>('LiveStreamModelProvider', c => {
        return () => Promise.resolve(c.liveStreamModel);
    });

    container.registerTransient<IHLSFileDeleterModel>(
        'IHLSFileDeleterModel',
        c => new HLSFileDeleterModel(c.loggerModel),
    );
    container.registerTransient<ILiveStreamBaseModel>(
        'LiveHLSStreamModel',
        c =>
            new LiveHLSStreamModel(
                c.configuration,
                c.loggerModel,
                c.encodeProcessManageModel,
                c.hlsFileDeleterModel,
                c.mirakurunClientModel,
                c.socketIOManageModel,
            ),
    );
    container.registerSingleton<LiveHLSStreamModelProvider>('LiveHLSStreamModelProvider', c => {
        return () => Promise.resolve(c.liveHLSStreamModel);
    });

    container.registerTransient<IRecordedStreamBaseModel>(
        'RecordedStreamModel',
        c =>
            new RecordedStreamModel(
                c.configuration,
                c.loggerModel,
                c.encodeProcessManageModel,
                c.hlsFileDeleterModel,
                c.socketIOManageModel,
                c.videoFileDB,
                c.recordedDB,
                c.videoUtil,
            ),
    );
    container.registerSingleton<RecordedStreamModelProvider>('RecordedStreamModelProvider', c => {
        return () => Promise.resolve(c.recordedStreamModel);
    });

    container.registerTransient<IRecordedStreamBaseModel>(
        'RecordedHLSStreamModel',
        c =>
            new RecordedHLSStreamModel(
                c.configuration,
                c.loggerModel,
                c.encodeProcessManageModel,
                c.hlsFileDeleterModel,
                c.socketIOManageModel,
                c.videoFileDB,
                c.recordedDB,
                c.videoUtil,
            ),
    );
    container.registerSingleton<RecordedHLSStreamModelProvider>('RecordedHLSStreamModelProvider', c => {
        return () => Promise.resolve(c.recordedHLSStreamModel);
    });

    container.registerSingleton<IStreamManageModel>(
        'IStreamManageModel',
        c => new StreamManageModel(c.loggerModel, c.executionManagementModel, c.socketIOManageModel),
    );
    container.registerSingleton<IStreamApiModel>(
        'IStreamApiModel',
        c =>
            new StreamApiModel(
                c.configuration,
                c.liveStreamModelProvider,
                c.liveHLSStreamModelProvider,
                c.recordedStreamModelProvider,
                c.recordedHLSStreamModelProvider,
                c.streamManageModel,
                c.programDB,
                c.videoFileDB,
                c.recordedDB,
                c.channelDB,
                c.apiUtil,
            ),
    );
    container.registerSingleton<IStorageApiModel>('IStorageApiModel', c => new StorageApiModel(c.configuration));
};
