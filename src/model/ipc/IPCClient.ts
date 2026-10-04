import * as events from 'events';
import * as apid from '../../../api.js';
import { OperatorFinishEncodeInfo } from '../event/IOperatorEncodeEvent.js';
import ILogger from '../ILogger.js';
import ILoggerModel from '../ILoggerModel.js';
import { AddVideoFileOption, UploadedVideoFileOption } from '../operator/recorded/IRecordedManageModel.js';
import IEncodeManageModel from '../service/encode/IEncodeManageModel.js';
import ILogManageModel from '../service/log/ILogManageModel.js';
import ISocketIOManageModel from '../service/socketio/ISocketIOManageModel.js';
import IIPCClient, {
    IPCOperatorEncodeEvent,
    IPCRecordedManageModel,
    IPCRecordedTagManageModel,
    IPCRecordingManageModel,
    IPCReservationManageModel,
    IPCRuleManageModel,
    IPCThumbnailManageModel,
} from './IIPCClient.js';
import {
    ClientMessageOption,
    OperatorEncodeEventFunctions,
    ModelName,
    ParentMessage,
    RecordedFunctions,
    RecordedTagFunctions,
    RecordingFunctions,
    ReplyMessage,
    ReservationFunctions,
    RuleFunctions,
    SendMessage,
    ThumbnailFunctions,
} from './IPCMessageDefine.js';

export default class IPCClient implements IIPCClient {
    private socketIO: ISocketIOManageModel;
    private encodeManage: IEncodeManageModel;
    private logManage: ILogManageModel;
    public reservation!: IPCReservationManageModel;
    public recorded!: IPCRecordedManageModel;
    public recordedTag!: IPCRecordedTagManageModel;
    public recording!: IPCRecordingManageModel;
    public rule!: IPCRuleManageModel;
    public thumbnail!: IPCThumbnailManageModel;
    public encodeEvent!: IPCOperatorEncodeEvent;

    private log: ILogger;
    private listener: events.EventEmitter = new events.EventEmitter();
    private messageHandler: ((msg: ReplyMessage | ParentMessage) => Promise<void>) | null = null;
    private static messageSeq: number = 0;

    constructor(
        logger: ILoggerModel,
        socketIO: ISocketIOManageModel,
        encodeManage: IEncodeManageModel,
        logManage: ILogManageModel,
    ) {
        this.log = logger.getLogger();
        this.socketIO = socketIO;
        this.encodeManage = encodeManage;
        this.logManage = logManage;

        if (typeof process.send === 'undefined') {
            this.log.system.fatal('not child process');
        }

        this.ipcInit();
        this.setReservation();
        this.setRecorded();
        this.setRecordedTag();
        this.setRecording();
        this.setRule();
        this.setThumbnail();
        this.setEncodeEvent();
    }

    /**
     * IPC 通信初期設定
     */
    private ipcInit(): void {
        this.messageHandler = async (msg: ReplyMessage | ParentMessage) => {
            if ('id' in msg && typeof msg.id !== 'undefined') {
                // 送信したメッセージの応答
                this.listener.emit(msg.id.toString(10), msg);
            } else if ('type' in msg) {
                switch (msg.type) {
                    case 'notifyClient':
                        // socket.io によるクライアントへの状態更新通知
                        this.socketIO.notifyClient();
                        break;
                    case 'pushEncode':
                        // エンコード依頼
                        await this.encodeManage.push(msg.value);
                        break;
                    case 'pushLog':
                        // 親プロセス（Operator）からのログ集約
                        this.logManage.push(msg.entry);
                        break;
                }
            }
        };

        process.on('message', this.messageHandler);
    }

    /**
     * リソース解放・リスナー解除
     */
    public destroy(): void {
        if (this.messageHandler !== null) {
            process.removeListener('message', this.messageHandler);
            this.messageHandler = null;
        }
        this.listener.removeAllListeners();
    }

    /**
     * IPC 送信
     * @param option: ClientMessageOption
     * @param timeout: number default 5000
     * @return Promise<T>
     */
    private send<T = void>(option: ClientMessageOption, timeout: number = 5000): Promise<T> {
        if (typeof process.send === 'undefined') {
            this.log.system.error('process.send is undefined');
            return Promise.reject(new Error('ProcessSendIsUndefined'));
        }

        const msg: SendMessage = {
            id: ++IPCClient.messageSeq,
            model: option.model,
            func: option.func,
            args: option.args,
        };

        process.nextTick(() => {
            try {
                process.send!(msg);
            } catch (err: any) {
                this.log.system.error(`failed to send IPC message: ${err?.message || err}`);
            }
        });

        return new Promise<T>((resolve, reject) => {
            const eventName = msg.id.toString(10);
            let timerId: NodeJS.Timeout | null = null;

            const onReply = (reply: ReplyMessage<T>) => {
                if (timerId !== null) {
                    clearTimeout(timerId);
                    timerId = null;
                }
                if (typeof reply.error === 'undefined') {
                    resolve(reply.result as T);
                } else {
                    reject(new Error(reply.error));
                }
            };

            this.listener.once(eventName, onReply);

            if (timeout > 0) {
                timerId = setTimeout(() => {
                    timerId = null;
                    this.listener.removeListener(eventName, onReply);
                    reject(new Error('IPCTimeout'));
                }, timeout);
            }
        });
    }

    /**
     * set reservation
     */
    private setReservation(): void {
        this.reservation = {
            getBroadcastStatus: () => {
                return this.send<apid.BroadcastStatus>({
                    model: ModelName.reservation,
                    func: ReservationFunctions.getBroadcastStatus,
                });
            },
            add: (option: apid.ManualReserveOption) => {
                return this.send<apid.ReserveId>({
                    model: ModelName.reservation,
                    func: ReservationFunctions.add,
                    args: {
                        option: option,
                    },
                });
            },
            update: (reserveId: apid.ReserveId) => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.update,
                    args: {
                        reserveId: reserveId,
                    },
                });
            },
            updateRule: (ruleId: apid.RuleId) => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.updateRule,
                    args: {
                        ruleId: ruleId,
                    },
                });
            },
            updateAll: (isUntilComplete: boolean) => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.updateAll,
                    args: {
                        isUntilComplete: isUntilComplete,
                    },
                });
            },
            cancel: (reserveId: apid.ReserveId) => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.cancel,
                    args: {
                        reserveId: reserveId,
                    },
                });
            },
            removeSkip: (reserveId: apid.ReserveId) => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.removeSkip,
                    args: {
                        reserveId: reserveId,
                    },
                });
            },
            removeOverlap: (reserveId: apid.ReserveId) => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.removeOverlap,
                    args: {
                        reserveId: reserveId,
                    },
                });
            },
            edit: (reserveId: apid.ReserveId, option: apid.EditManualReserveOption) => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.edit,
                    args: {
                        reserveId: reserveId,
                        option: option,
                    },
                });
            },
            clean: () => {
                return this.send({
                    model: ModelName.reservation,
                    func: ReservationFunctions.clean,
                });
            },
        };
    }

    /**
     * set recorded
     */
    private setRecorded(): void {
        this.recorded = {
            delete: (recordedId: apid.RecordedId) => {
                this.log.system.info(`delete recorded by ipc: ${recordedId}`);

                return this.send({
                    model: ModelName.recorded,
                    func: RecordedFunctions.delete,
                    args: {
                        recordedId: recordedId,
                    },
                });
            },
            updateVideoFileSize: (videoFileId: apid.VideoFileId) => {
                return this.send({
                    model: ModelName.recorded,
                    func: RecordedFunctions.updateVideoFileSize,
                    args: {
                        videoFileId: videoFileId,
                    },
                });
            },
            addVideoFile: (option: AddVideoFileOption) => {
                return this.send<apid.VideoFileId>({
                    model: ModelName.recorded,
                    func: RecordedFunctions.addVideoFile,
                    args: {
                        option: option,
                    },
                });
            },
            addUploadedVideoFile: (option: UploadedVideoFileOption) => {
                return this.send(
                    {
                        model: ModelName.recorded,
                        func: RecordedFunctions.addUploadedVideoFile,
                        args: {
                            option: option,
                        },
                    },
                    10 * 60 * 1000, // タイムアウトを 10 分に延長
                );
            },
            createNewRecorded: (option: apid.CreateNewRecordedOption, isIgnoreProtection?: boolean) => {
                return this.send<apid.RecordedId>({
                    model: ModelName.recorded,
                    func: RecordedFunctions.createNewRecorded,
                    args: {
                        option: option,
                        isIgnoreProtection: isIgnoreProtection,
                    },
                });
            },
            deleteVideoFile: (videoFileId: apid.VideoFileId) => {
                return this.send({
                    model: ModelName.recorded,
                    func: RecordedFunctions.deleteVideoFile,
                    args: {
                        videoFileId: videoFileId,
                    },
                });
            },
            changeProtect: (recordedId: apid.RecordedId, isProtect: boolean) => {
                return this.send({
                    model: ModelName.recorded,
                    func: RecordedFunctions.changeProtect,
                    args: {
                        recordedId: recordedId,
                        isProtect: isProtect,
                    },
                });
            },
            videoFileCleanup: () => {
                return this.send(
                    {
                        model: ModelName.recorded,
                        func: RecordedFunctions.videoFileCleanup,
                    },
                    0, // タイムアウトなし
                );
            },
            dropLogFileCleanup: () => {
                return this.send(
                    {
                        model: ModelName.recorded,
                        func: RecordedFunctions.dropLogFileCleanup,
                    },
                    0, // タイムアウトなし
                );
            },
            deleteHistory: (recordedId: apid.RecordedId) => {
                return this.send({
                    model: ModelName.recorded,
                    func: RecordedFunctions.deleteHistory,
                    args: {
                        recordedId: recordedId,
                    },
                });
            },
            addHistory: (recordedId: apid.RecordedId) => {
                return this.send({
                    model: ModelName.recorded,
                    func: RecordedFunctions.addHistory,
                    args: {
                        recordedId: recordedId,
                    },
                });
            },
        };
    }

    /**
     * set recordedTag
     */
    private setRecordedTag(): void {
        this.recordedTag = {
            create: (name: string, color: string) => {
                return this.send({
                    model: ModelName.recordedTag,
                    func: RecordedTagFunctions.create,
                    args: {
                        name: name,
                        color: color,
                    },
                });
            },
            update: (tagId: apid.RecordedTagId, name: string, color: string) => {
                return this.send({
                    model: ModelName.recordedTag,
                    func: RecordedTagFunctions.update,
                    args: {
                        tagId: tagId,
                        name: name,
                        color: color,
                    },
                });
            },
            setRelation: (tagId: apid.RecordedTagId, recordedId: apid.RecordedId) => {
                return this.send({
                    model: ModelName.recordedTag,
                    func: RecordedTagFunctions.setRelation,
                    args: {
                        tagId: tagId,
                        recordedId: recordedId,
                    },
                });
            },
            delete: (tagId: apid.RecordedTagId) => {
                return this.send({
                    model: ModelName.recordedTag,
                    func: RecordedTagFunctions.delete,
                    args: {
                        tagId: tagId,
                    },
                });
            },
            deleteRelation: (tagId: apid.RecordedTagId, recordedId: apid.RecordedId) => {
                return this.send({
                    model: ModelName.recordedTag,
                    func: RecordedTagFunctions.deleteRelation,
                    args: {
                        tagId: tagId,
                        recordedId: recordedId,
                    },
                });
            },
        };
    }

    /**
     * set recording
     */
    private setRecording(): void {
        this.recording = {
            resetTimer: () => {
                return this.send({
                    model: ModelName.recording,
                    func: RecordingFunctions.resetTimer,
                });
            },
            finish: (reserveId: apid.ReserveId) => {
                return this.send({
                    model: ModelName.recording,
                    func: RecordingFunctions.finish,
                    args: {
                        reserveId,
                    },
                });
            },
            stop: (reserveId: apid.ReserveId) => {
                return this.send({
                    model: ModelName.recording,
                    func: RecordingFunctions.stop,
                    args: {
                        reserveId,
                    },
                });
            },
            discard: (reserveId: apid.ReserveId) => {
                return this.send({
                    model: ModelName.recording,
                    func: RecordingFunctions.discard,
                    args: {
                        reserveId,
                    },
                });
            },
        };
    }

    /**
     * set rule
     */
    private setRule(): void {
        this.rule = {
            add: (rule: apid.AddRuleOption) => {
                return this.send({
                    model: ModelName.rule,
                    func: RuleFunctions.add,
                    args: {
                        rule: rule,
                    },
                });
            },
            update: (rule: apid.Rule) => {
                return this.send({
                    model: ModelName.rule,
                    func: RuleFunctions.update,
                    args: {
                        rule: rule,
                    },
                });
            },
            enable: (ruleId: apid.RuleId) => {
                return this.send({
                    model: ModelName.rule,
                    func: RuleFunctions.enable,
                    args: {
                        ruleId: ruleId,
                    },
                });
            },
            disable: (ruleId: apid.RuleId) => {
                return this.send({
                    model: ModelName.rule,
                    func: RuleFunctions.disable,
                    args: {
                        ruleId: ruleId,
                    },
                });
            },
            delete: (ruleId: apid.RuleId) => {
                return this.send({
                    model: ModelName.rule,
                    func: RuleFunctions.delete,
                    args: {
                        ruleId: ruleId,
                    },
                });
            },
            deletes: (ruleIds: apid.RuleId[]) => {
                return this.send({
                    model: ModelName.rule,
                    func: RuleFunctions.deletes,
                    args: {
                        ruleIds: ruleIds,
                    },
                });
            },
        };
    }

    /**
     * set thumbnail
     */
    private setThumbnail(): void {
        this.thumbnail = {
            regenerate: () => {
                return this.send(
                    {
                        model: ModelName.thumbnail,
                        func: ThumbnailFunctions.regenerate,
                    },
                    0, // タイムアウトなし
                );
            },
            fileCleanup: () => {
                return this.send(
                    {
                        model: ModelName.thumbnail,
                        func: ThumbnailFunctions.fileCleanup,
                    },
                    0, // タイムアウトなし
                );
            },
            add: (videoFileId, seconds, replace) => {
                return this.send({
                    model: ModelName.thumbnail,
                    func: ThumbnailFunctions.add,
                    args: {
                        videoFileId: videoFileId,
                        seconds: seconds,
                        replace: replace,
                    },
                });
            },
            delete: thumbnailId => {
                return this.send({
                    model: ModelName.thumbnail,
                    func: ThumbnailFunctions.delete,
                    args: {
                        thumbnailId: thumbnailId,
                    },
                });
            },
        };
    }

    /**
     * set encode event
     */
    private setEncodeEvent(): void {
        this.encodeEvent = {
            emitFinishEncode: (info: OperatorFinishEncodeInfo) => {
                return this.send({
                    model: ModelName.encodeEvent,
                    func: OperatorEncodeEventFunctions.emitFinishEncode,
                    args: {
                        info: info,
                    },
                });
            },
        };
    }
}
