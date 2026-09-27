import * as apid from '../../../api.js';
import { OperatorFinishEncodeInfo } from '../event/IOperatorEncodeEvent.js';
import { LogEntry } from '../ILogger.js';
import { AddVideoFileOption, UploadedVideoFileOption } from '../operator/recorded/IRecordedManageModel.js';

export type MessageId = number;

/**
 * 親プロセスから子プロセスへの通知メッセージ
 */
export interface NotifyClientMessage {
    type: 'notifyClient';
}

export interface PushEncodeMessage {
    type: 'pushEncode';
    value: apid.AddEncodeProgramOption;
}

export interface PushLogMessage {
    type: 'pushLog';
    entry: LogEntry;
}

export type ParentMessage = NotifyClientMessage | PushEncodeMessage | PushLogMessage;

/**
 * モデル名
 */
export enum ModelName {
    recorded = 'recorded',
    recording = 'recording',
    recordedTag = 'recordedTag',
    reservation = 'reservation',
    rule = 'rule',
    thumbnail = 'thumbnail',
    encodeEvent = 'encodeEvent',
}

/**
 * reservation の関数定義
 */
export enum ReservationFunctions {
    getBroadcastStatus = 'getBroadcastStatus',
    add = 'add',
    update = 'update',
    updateRule = 'updateRule',
    updateAll = 'updateAll',
    cancel = 'cancel',
    removeSkip = 'removeSkip',
    removeOverlap = 'removeOverlap',
    edit = 'edit',
    clean = 'clean',
}

/**
 * recorded の関数定義
 */
export enum RecordedFunctions {
    delete = 'delete',
    updateVideoFileSize = 'updateVideoFileSize',
    addVideoFile = 'addVideoFile',
    addUploadedVideoFile = 'addUploadedVideoFile',
    createNewRecorded = 'createNewRecorded',
    deleteVideoFile = 'deleteVideoFile',
    changeProtect = 'changeProtect',
    videoFileCleanup = 'videoFileCleanup',
    dropLogFileCleanup = 'dropLogFileCleanup',
    deleteHistory = 'deleteHistory',
    addHistory = 'addHistory',
}

/**
 * recordedTag の関数定義
 */
export enum RecordedTagFunctions {
    create = 'create',
    update = 'update',
    setRelation = 'setRelation',
    delete = 'delete',
    deleteRelation = 'deleteRelation',
}

/**
 * Recording の関数定義
 */
export enum RecordingFunctions {
    resetTimer = 'resetTimer',
    finish = 'finish',
    stop = 'stop',
    discard = 'discard',
}

/**
 * Rule の関数定義
 */
export enum RuleFunctions {
    add = 'add',
    update = 'update',
    enable = 'enable',
    disable = 'disable',
    delete = 'delete',
    deletes = 'deletes',
}

/**
 * Thumbnail の関数定義
 */
export enum ThumbnailFunctions {
    regenerate = 'regenerate',
    fileCleanup = 'fileCleanup',
    add = 'add',
    delete = 'delete',
}

/**
 * encode event の関数定義
 */
export enum OperatorEncodeEventFunctions {
    emitFinishEncode = 'emitFinishEncode',
}

/**
 * 各 IPC 関数の引数型マップ
 */
export interface IPCArgsMap {
    [ModelName.reservation]: {
        [ReservationFunctions.getBroadcastStatus]: undefined;
        [ReservationFunctions.add]: { option: apid.ManualReserveOption };
        [ReservationFunctions.update]: { reserveId: apid.ReserveId };
        [ReservationFunctions.updateRule]: { ruleId: apid.RuleId };
        [ReservationFunctions.updateAll]: { isUntilComplete: boolean };
        [ReservationFunctions.cancel]: { reserveId: apid.ReserveId };
        [ReservationFunctions.removeSkip]: { reserveId: apid.ReserveId };
        [ReservationFunctions.removeOverlap]: { reserveId: apid.ReserveId };
        [ReservationFunctions.edit]: { reserveId: apid.ReserveId; option: apid.EditManualReserveOption };
        [ReservationFunctions.clean]: undefined;
    };
    [ModelName.recorded]: {
        [RecordedFunctions.delete]: { recordedId: apid.RecordedId };
        [RecordedFunctions.updateVideoFileSize]: { videoFileId: apid.VideoFileId };
        [RecordedFunctions.addVideoFile]: { option: AddVideoFileOption };
        [RecordedFunctions.addUploadedVideoFile]: { option: UploadedVideoFileOption };
        [RecordedFunctions.createNewRecorded]: { option: apid.CreateNewRecordedOption };
        [RecordedFunctions.deleteVideoFile]: { videoFileId: apid.VideoFileId; isIgnoreProtection?: boolean };
        [RecordedFunctions.changeProtect]: { recordedId: apid.RecordedId; isProtect: boolean };
        [RecordedFunctions.videoFileCleanup]: undefined;
        [RecordedFunctions.dropLogFileCleanup]: undefined;
        [RecordedFunctions.deleteHistory]: { recordedId: apid.RecordedId };
        [RecordedFunctions.addHistory]: { recordedId: apid.RecordedId };
    };
    [ModelName.recordedTag]: {
        [RecordedTagFunctions.create]: { name: string; color: string };
        [RecordedTagFunctions.update]: { tagId: apid.RecordedTagId; name: string; color: string };
        [RecordedTagFunctions.setRelation]: { tagId: apid.RecordedTagId; recordedId: apid.RecordedId };
        [RecordedTagFunctions.delete]: { tagId: apid.RecordedTagId };
        [RecordedTagFunctions.deleteRelation]: { tagId: apid.RecordedTagId; recordedId: apid.RecordedId };
    };
    [ModelName.recording]: {
        [RecordingFunctions.resetTimer]: undefined;
        [RecordingFunctions.finish]: { reserveId: apid.ReserveId };
        [RecordingFunctions.stop]: { reserveId: apid.ReserveId };
        [RecordingFunctions.discard]: { reserveId: apid.ReserveId };
    };
    [ModelName.rule]: {
        [RuleFunctions.add]: { rule: apid.AddRuleOption };
        [RuleFunctions.update]: { rule: apid.Rule };
        [RuleFunctions.enable]: { ruleId: apid.RuleId };
        [RuleFunctions.disable]: { ruleId: apid.RuleId };
        [RuleFunctions.delete]: { ruleId: apid.RuleId };
        [RuleFunctions.deletes]: { ruleIds: apid.RuleId[] };
    };
    [ModelName.thumbnail]: {
        [ThumbnailFunctions.regenerate]: undefined;
        [ThumbnailFunctions.fileCleanup]: undefined;
        [ThumbnailFunctions.add]: { videoFileId: apid.VideoFileId; seconds?: number; replace?: boolean };
        [ThumbnailFunctions.delete]: { thumbnailId: apid.ThumbnailId };
    };
    [ModelName.encodeEvent]: {
        [OperatorEncodeEventFunctions.emitFinishEncode]: { info: OperatorFinishEncodeInfo };
    };
}

/**
 * 各 IPC 関数の戻り値型マップ
 */
export interface IPCResponseMap {
    [ModelName.reservation]: {
        [ReservationFunctions.getBroadcastStatus]: apid.BroadcastStatus;
        [ReservationFunctions.add]: apid.ReserveId;
        [ReservationFunctions.update]: void;
        [ReservationFunctions.updateRule]: void;
        [ReservationFunctions.updateAll]: void;
        [ReservationFunctions.cancel]: void;
        [ReservationFunctions.removeSkip]: void;
        [ReservationFunctions.removeOverlap]: void;
        [ReservationFunctions.edit]: void;
        [ReservationFunctions.clean]: void;
    };
    [ModelName.recorded]: {
        [RecordedFunctions.delete]: void;
        [RecordedFunctions.updateVideoFileSize]: void;
        [RecordedFunctions.addVideoFile]: apid.VideoFileId;
        [RecordedFunctions.addUploadedVideoFile]: void;
        [RecordedFunctions.createNewRecorded]: apid.RecordedId;
        [RecordedFunctions.deleteVideoFile]: void;
        [RecordedFunctions.changeProtect]: void;
        [RecordedFunctions.videoFileCleanup]: void;
        [RecordedFunctions.dropLogFileCleanup]: void;
        [RecordedFunctions.deleteHistory]: void;
        [RecordedFunctions.addHistory]: void;
    };
    [ModelName.recordedTag]: {
        [RecordedTagFunctions.create]: apid.RecordedTagId;
        [RecordedTagFunctions.update]: void;
        [RecordedTagFunctions.setRelation]: void;
        [RecordedTagFunctions.delete]: void;
        [RecordedTagFunctions.deleteRelation]: void;
    };
    [ModelName.recording]: {
        [RecordingFunctions.resetTimer]: void;
        [RecordingFunctions.finish]: void;
        [RecordingFunctions.stop]: void;
        [RecordingFunctions.discard]: void;
    };
    [ModelName.rule]: {
        [RuleFunctions.add]: apid.RuleId;
        [RuleFunctions.update]: void;
        [RuleFunctions.enable]: void;
        [RuleFunctions.disable]: void;
        [RuleFunctions.delete]: void;
        [RuleFunctions.deletes]: apid.RuleId[];
    };
    [ModelName.thumbnail]: {
        [ThumbnailFunctions.regenerate]: void;
        [ThumbnailFunctions.fileCleanup]: void;
        [ThumbnailFunctions.add]: void;
        [ThumbnailFunctions.delete]: void;
    };
    [ModelName.encodeEvent]: {
        [OperatorEncodeEventFunctions.emitFinishEncode]: void;
    };
}

/**
 * 子プロセスからメッセージ送信時に使用するオプション
 */
export interface ClientMessageOption<M extends ModelName = any, F extends string = any> {
    model: M;
    func: F;
    args?: M extends ModelName ? (F extends keyof IPCArgsMap[M] ? IPCArgsMap[M][F] : unknown) : unknown;
}

/**
 * 子プロセスから送信されるリクエストメッセージ
 */
export interface SendMessage<M extends ModelName = any, F extends string = any> extends ClientMessageOption<M, F> {
    id: MessageId;
}

/**
 * 送信されたリクエストに対する応答メッセージ
 */
export interface ReplyMessage<T = unknown> {
    id: MessageId;
    result?: T;
    error?: string;
}
