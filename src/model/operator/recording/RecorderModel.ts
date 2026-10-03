import * as events from 'events';
import * as fs from 'fs';
import * as http from 'http';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as stream from 'stream';
import { EitInfo, type EitRelatedItem } from 'arib-probe';
import * as mapid from 'mirakurun/api.js';
import * as apid from '../../../../api.js';
import DropLogFile from '../../../db/entities/DropLogFile.js';
import Recorded from '../../../db/entities/Recorded.js';
import RecordedHistory from '../../../db/entities/RecordedHistory.js';
import Reserve from '../../../db/entities/Reserve.js';
import VideoFile from '../../../db/entities/VideoFile.js';
import FileUtil from '../../../util/FileUtil.js';
import StrUtil from '../../../util/StrUtil.js';
import IDropLogFileDB from '../../db/IDropLogFileDB.js';
import IProgramDB from '../../db/IProgramDB.js';
import IRecordedDB from '../../db/IRecordedDB.js';
import IRecordedHistoryDB from '../../db/IRecordedHistoryDB.js';
import IReserveDB from '../../db/IReserveDB.js';
import IVideoFileDB from '../../db/IVideoFileDB.js';
import IRecordingEvent from '../../event/IRecordingEvent.js';
import IConfigFile from '../../IConfigFile.js';
import IConfiguration from '../../IConfiguration.js';
import ILogger from '../../ILogger.js';
import ILoggerModel from '../../ILoggerModel.js';
import IMirakurunClientModel from '../../IMirakurunClientModel.js';
import IDropCheckerModel from './IDropCheckerModel.js';
import IRecorderModel from './IRecorderModel.js';
import IRecordingStreamCreator from './IRecordingStreamCreator.js';
import IRecordingUtilModel, { RecFilePathInfo } from './IRecordingUtilModel.js';

/**
 * Recorder
 */
@injectable()
class RecorderModel implements IRecorderModel {
    private log: ILogger;
    private config: IConfigFile;
    private programDB: IProgramDB;
    private reserveDB: IReserveDB;
    private recordedDB: IRecordedDB;
    private recordedHistoryDB: IRecordedHistoryDB;
    private videoFileDB: IVideoFileDB;
    private dropLogFileDB: IDropLogFileDB;
    private streamCreator: IRecordingStreamCreator;
    private dropChecker: IDropCheckerModel;
    private recordingUtil: IRecordingUtilModel;
    private recordingEvent: IRecordingEvent;
    private mirakurunClientModel: IMirakurunClientModel;

    private _reserve!: Reserve;
    public get reserve(): Reserve {
        return this._reserve;
    }
    private set reserve(value: Reserve) {
        this._reserve = value;
    }
    private recordedId: apid.RecordedId | null = null;
    private videoFileId: apid.VideoFileId | null = null;
    private videoFileFulPath: string | null = null;
    private timerId: NodeJS.Timeout | null = null;
    private stream: http.IncomingMessage | null = null;
    private recFile: fs.WriteStream | null = null;
    private isStopPrepRec: boolean = false;
    private isNeedDeleteReservation: boolean = true;
    private isPrepRecording: boolean = false;
    private _isRecording: boolean = false;
    public get isRecording(): boolean {
        return this._isRecording;
    }
    private set isRecording(value: boolean) {
        this._isRecording = value;
    }
    private isPlanToDelete: boolean = false;
    private isCanceledCallingFinished: boolean = false; // mirakurun の stream の終了検知をキャンセルするか
    private eventEmitter = new events.EventEmitter();

    private dropLogFileId: apid.DropLogFileId | null = null;
    private actualStartAt: number | null = null;

    private abortController: AbortController | null = null;

    // イベントリレータイマー
    private eventRelayTimerId: NodeJS.Timeout | null = null;
    private hasHandledEitRelay: boolean = false;
    private prepRetryTimerId: NodeJS.Timeout | null = null;
    private recordingStartTimeoutId: NodeJS.Timeout | null = null;
    private currentRecFilePath: string | null = null;
    private recEndPromise: Promise<void> | null = null;
    private isShutdownStop: boolean = false;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('IProgramDB') programDB: IProgramDB,
        @inject('IReserveDB') reserveDB: IReserveDB,
        @inject('IRecordedDB') recordedDB: IRecordedDB,
        @inject('IRecordedHistoryDB') recordedHistoryDB: IRecordedHistoryDB,
        @inject('IVideoFileDB') videoFileDB: IVideoFileDB,
        @inject('IDropLogFileDB') dropLogFileDB: IDropLogFileDB,
        @inject('IRecordingStreamCreator')
        streamCreator: IRecordingStreamCreator,
        @inject('IDropCheckerModel') dropChecker: IDropCheckerModel,
        @inject('IRecordingUtilModel') recordingUtil: IRecordingUtilModel,
        @inject('IRecordingEvent') recordingEvent: IRecordingEvent,
        @inject('IMirakurunClientModel') mirakurunClientModel: IMirakurunClientModel,
    ) {
        this.log = logger.getLogger();
        this.config = configuration.getConfig();
        this.programDB = programDB;
        this.reserveDB = reserveDB;
        this.recordedDB = recordedDB;
        this.recordedHistoryDB = recordedHistoryDB;
        this.videoFileDB = videoFileDB;
        this.dropLogFileDB = dropLogFileDB;
        this.streamCreator = streamCreator;
        this.dropChecker = dropChecker;
        this.recordingUtil = recordingUtil;
        this.recordingEvent = recordingEvent;
        this.mirakurunClientModel = mirakurunClientModel;
    }

    /**
     * タイマーをセットする
     * @param reserve: Reserve 予約情報
     * @param isSuppressLog: boolean ログ出力を抑えるか
     * @return boolean セットに成功したら true を返す
     */
    public setTimer(reserve: Reserve, isSuppressLog: boolean): boolean {
        this.reserve = reserve;

        // 除外, 重複しているものはタイマーをセットしない
        if (this.reserve.isSkip === true || this.reserve.isOverlap === true) {
            return false;
        }

        const now = new Date().getTime();
        if (now >= this.reserve.endAt) {
            return false;
        }

        // 待機時間を計算
        let time = this.reserve.startAt - now - IRecordingStreamCreator.PREP_TIME;
        if (time < 0) {
            time = 0;
        }

        // タイマーをセット
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
        }

        if (isSuppressLog === false) {
            this.log.system.info(`set timer: ${this.reserve.id}, ${time}`);
        }
        this.timerId = setTimeout(async () => {
            try {
                await this.prepRecord();
            } catch (err: any) {
                this.log.system.error(`failed prep record: ${this.reserve.id}`);
            }
        }, time);

        return true;
    }

    /**
     * 録画準備
     */
    private async prepRecord(retry: number = 0): Promise<void> {
        if (this.isStopPrepRec === true) {
            this.isPlanToDelete = false;
            this.emitCancelEvent();

            return;
        }

        this.log.system.info(`preprec: ${this.reserve.id}`);

        this.isPrepRecording = true;
        this.isRecording = false;
        this.isPlanToDelete = false;

        // 番組ストリームを取得する
        try {
            if (this.reserve.programId) {
                // Mirakurun から最新の番組情報を取得して開始繰り下げ（野球延長等）を確認
                let latestProgram: any = null;
                try {
                    const mirakurun = this.mirakurunClientModel.getClient();
                    latestProgram = await mirakurun.getProgram(this.reserve.programId);
                } catch (err: any) {
                    this.log.system.debug(
                        `failed to get latest program info from mirakurun in prepRecord: ${this.reserve.programId}`,
                    );
                }

                if (latestProgram !== null) {
                    const latestStartAt = latestProgram.startAt;
                    const latestEndAt = latestProgram.startAt + latestProgram.duration;
                    const now = new Date().getTime();

                    // 番組開始時刻が未来に繰り下げられている場合
                    if (latestStartAt > this.reserve.startAt) {
                        const oldStartAt = this.reserve.startAt;
                        const oldEndAt = this.reserve.endAt;
                        this.log.system.info(
                            `program start delayed (prepRecord): reserveId: ${this.reserve.id}, original: ${new Date(this.reserve.startAt).toISOString()} -> delayed: ${new Date(latestStartAt).toISOString()}`,
                        );
                        this.reserve.startAt = latestStartAt;
                        this.reserve.endAt = latestEndAt;
                        await this.reserveDB.updateOnce(this.reserve);

                        // スライド元とスライド先の時間帯のチューナー競合（isConflict）を即時再調停
                        this.recordingEvent.emitRecheckConflicts([
                            { startAt: oldStartAt, endAt: oldEndAt },
                            { startAt: latestStartAt, endAt: latestEndAt },
                        ]);

                        // 準備時間（15秒）以上先ならタイマーを再設定して待機し直す（外部コマンドや準備通知の発行を抑止）
                        if (latestStartAt - now > IRecordingStreamCreator.PREP_TIME) {
                            this.isPrepRecording = false;
                            this.setTimer(this.reserve, false);
                            return;
                        }
                    }
                }

                const program = await this.programDB.findId(this.reserve.programId);
                if (program === null && latestProgram === null) {
                    this.log.system.warn(
                        `the program data does not found in database or mirakurun. retry later, (reserveId: ${this.reserve.id}, programId: ${this.reserve.programId})`,
                    );
                    this.emitCancelEvent();
                    return;
                }
            }

            if (retry === 0) {
                // 録画準備開始通知（繰り下げリスケジュールが発生しなかった場合のみ発行）
                this.recordingEvent.emitStartPrepRecording(this.reserve);
            }

            this.abortController = new AbortController();
            this.stream = await this.streamCreator.create(this.reserve, this.abortController.signal);

            // 録画準備のキャンセル or ストリーム取得中に予約が削除されていないかチェック
            if ((await this.reserveDB.findId(this.reserve.id)) === null) {
                this.log.system.error(`canceled preprec: ${this.reserve.id}`);
                this.destroyStream();
                this.emitCancelEvent();
            } else {
                await this.doRecord();
            }
        } catch (err: any) {
            // NOTE: await 中に外部から stopPrepRecord() で更新される可能性があるためナローイングを解除
            if ((this.isStopPrepRec as boolean) === true) {
                this.destroyStream();
                this.emitCancelEvent();
                return;
            }

            this.log.system.error(`preprec failed: ${this.reserve.id}`);
            this.log.system.error(err);
            if (retry < 3) {
                // retry
                this.prepRetryTimerId = setTimeout(() => {
                    this.prepRetryTimerId = null;
                    void this.prepRecord(retry + 1);
                }, 1000 * 5);
            } else {
                this.isPrepRecording = false;
                // 録画準備失敗を通知
                this.recordingEvent.emitPrepRecordingFailed(this.reserve);
            }
        } finally {
            this.abortController = null;
        }
    }

    /**
     * 録画準備キャンセル完了時に発行するイベント
     */
    private emitCancelEvent(): void {
        this.isStopPrepRec = false;
        this.isPrepRecording = false;
        this.isRecording = false;

        this.eventEmitter.emit(RecorderModel.CANCEL_EVENT);
    }

    /**
     * strem 破棄
     * @param needesUnpip: boolean
     */
    private destroyStream(needesUnpip: boolean = true): void {
        if (this.recordingStartTimeoutId !== null) {
            clearTimeout(this.recordingStartTimeoutId);
            this.recordingStartTimeoutId = null;
        }

        if (this.prepRetryTimerId !== null) {
            clearTimeout(this.prepRetryTimerId);
            this.prepRetryTimerId = null;
        }

        // stop stream
        if (this.stream !== null) {
            try {
                if (needesUnpip === true) {
                    this.stream.unpipe();
                }
                if (!this.stream.destroyed) {
                    this.stream.push(null); // eof 通知
                    this.stream.destroy();
                }
                this.stream.removeAllListeners('data');
                this.stream = null;
            } catch (err: any) {
                this.log.system.error(`destroy stream error: ${this.reserve.id}`);
                this.log.system.error(err);
            }
        }

        // stop drop check
        if (typeof this.dropChecker.off === 'function') {
            this.dropChecker.off('eit', this.onEit);
        }
        if (this.dropLogFileId !== null) {
            this.dropChecker.stop().catch(err => {
                this.log.system.error(`dropChecker stop error: ${this.reserve.id}`);
                this.log.system.error(err);
            });
        }
    }

    /**
     * recFile の書き込み完了・クローズを待機する
     */
    private async closeRecFile(): Promise<void> {
        if (this.recFile === null) {
            return;
        }

        const file = this.recFile;
        this.recFile = null;
        file.removeAllListeners('error');

        await new Promise<void>(resolve => {
            if (file.closed || file.destroyed) {
                resolve();
                return;
            }

            let isResolved = false;
            let timeoutId: NodeJS.Timeout | null = null;

            const onDone = () => {
                if (!isResolved) {
                    isResolved = true;
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    if (typeof file.removeListener === 'function') {
                        file.removeListener('finish', onDone);
                        file.removeListener('close', onDone);
                        file.removeListener('error', onError);
                    }
                    resolve();
                }
            };

            const onError = (err: any) => {
                this.log.system.error(`recFile error during close/flush: ${this.reserve.id}`);
                this.log.system.error(err);
                onDone();
            };

            timeoutId = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    this.log.system.warn(`closeRecFile timeout for reserveId: ${this.reserve.id}`);
                    try {
                        file.destroy();
                    } catch {
                        // ignore
                    }
                    resolve();
                }
            }, 5000);

            if (typeof file.once === 'function') {
                file.once('finish', onDone);
                file.once('close', onDone);
                file.once('error', onError);
            } else {
                onDone();
            }

            try {
                file.end();
            } catch {
                onDone();
            }
        });
    }

    /**
     * 録画処理
     */
    private async doRecord(): Promise<void> {
        if (this.stream === null) {
            return;
        }

        // 録画キャンセル
        if (this.isStopPrepRec === true) {
            this.log.system.error(`cancel recording: ${this.reserve.id}`);
            this.destroyStream();
            this.emitCancelEvent();

            return;
        }

        this.isPrepRecording = false;
        this.isRecording = true;

        // 録画開始内部イベント発行
        // 時刻指定予約で録画準備中に endAt を変えようとした場合にこのイベントを受信してから変える
        this.eventEmitter.emit(RecorderModel.START_RECORDING_EVENT);

        // 保存先を取得
        const recPath = await this.recordingUtil.getRecPath(this.reserve, true);
        this.currentRecFilePath = recPath.fullPath;

        this.log.system.info(`recording: ${this.reserve.id} ${recPath.fullPath}`);

        // save stream
        this.recFile = fs.createWriteStream(recPath.fullPath, { flags: 'a' });
        this.recFile.once('error', async err => {
            // 書き込みエラー発生
            this.log.system.error(`recFile error reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}`);
            this.log.system.error(err);
            if (this.stream === null) {
                await this.cancel(false);
            } else {
                this.isCanceledCallingFinished = true; // mirakurun の stream の終了処理を行わないようにセット
                await this.recFailed(err).catch(err => {
                    this.log.system.fatal(
                        `Unexpected recFailed error: reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}`,
                    );
                    this.log.system.fatal(err);
                });
            }
        });
        this.stream.pipe(this.recFile);

        // drop checker
        if (this.config.recording.dropLog.enabled === true) {
            let dropFilePath: string | null = null;
            try {
                await this.dropChecker.start(this.config.recording.dropLog.path, recPath.fullPath, this.stream);
                dropFilePath = this.dropChecker.getFilePath();
                if (typeof this.dropChecker.on === 'function') {
                    this.dropChecker.on('eit', this.onEit);
                }
            } catch (err: any) {
                this.log.system.error(`drop check error: ${recPath.fullPath}`);
                this.log.system.error(err);
            }

            // drop 情報を DB へ反映
            if (dropFilePath !== null) {
                const dropLogFile = new DropLogFile();
                dropLogFile.errorCnt = 0;
                dropLogFile.dropCnt = 0;
                dropLogFile.scramblingCnt = 0;
                dropLogFile.filePath = path.basename(dropFilePath);
                this.log.system.info(`add drop log file: ${dropFilePath}`);
                try {
                    this.dropLogFileId = await this.dropLogFileDB.insertOnce(dropLogFile);
                } catch (err: any) {
                    this.dropLogFileId = null;
                    this.log.system.error(`add drop log file error: ${dropFilePath}`);
                    this.log.system.error(err);
                }
            }
        }

        return new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
            if (this.stream === null) {
                reject(new Error('StreamIsNull'));

                return;
            }

            // stream データ受信のタイムアウト設定
            let isDataReceived = false;
            let isStreamTimeout = false; // stream データ受信がタイムアウトした場合は true

            const checkStreamTimeout = async () => {
                if (isDataReceived || this.stream === null) {
                    return;
                }

                // 番組指定予約の場合、前番組延長（野球等）による放送待ちの可能性を検証
                if (this.reserve.programId !== null) {
                    const now = new Date().getTime();

                    // 1. Mirakurun から最新の番組情報を取得
                    let latestProgram: any = null;
                    try {
                        const mirakurun = this.mirakurunClientModel.getClient();
                        latestProgram = await mirakurun.getProgram(this.reserve.programId);
                    } catch (err: any) {
                        this.log.system.debug(
                            `failed to get latest program info while waiting stream: ${this.reserve.programId}`,
                        );
                    }

                    if (latestProgram !== null) {
                        const latestStartAt = latestProgram.startAt;
                        const latestEndAt = latestProgram.startAt + latestProgram.duration;

                        // 開始繰り下げを検知した場合
                        if (latestStartAt > this.reserve.startAt) {
                            const oldStartAt = this.reserve.startAt;
                            const oldEndAt = this.reserve.endAt;
                            this.reserve.startAt = latestStartAt;
                            this.reserve.endAt = latestEndAt;
                            await this.reserveDB.updateOnce(this.reserve);

                            // スライド元とスライド先の時間帯のチューナー競合（isConflict）を即時再調停
                            this.recordingEvent.emitRecheckConflicts([
                                { startAt: oldStartAt, endAt: oldEndAt },
                                { startAt: latestStartAt, endAt: latestEndAt },
                            ]);

                            // 準備時間（15秒）以上先ならストリームを解放してタイマー再設定
                            if (latestStartAt - now > IRecordingStreamCreator.PREP_TIME) {
                                this.log.system.info(
                                    `program start delayed while waiting stream: reserveId: ${this.reserve.id}, delaying timer to ${new Date(latestStartAt).toISOString()}`,
                                );

                                if (this.stream !== null) {
                                    this.stream.removeListener('data', onData);
                                    this.destroyStream();
                                }
                                await this.closeRecFile();
                                await FileUtil.unlink(recPath.fullPath).catch(() => {});

                                this.isRecording = false;
                                this.isPrepRecording = false;
                                this.setTimer(this.reserve, false);
                                resolve();
                                return;
                            }
                        }

                        // 番組終了予定時刻前、かつストリーム接続が生きていれば番組開始を継続待機
                        if (now < latestEndAt && !this.stream.destroyed) {
                            this.log.system.info(
                                `waiting for program broadcast to start (eventId: ${this.reserve.programId}, reserve: ${this.reserve.id})`,
                            );
                            this.recordingStartTimeoutId = setTimeout(checkStreamTimeout, 5000);
                            return;
                        }
                    } else if (now < this.reserve.endAt && !this.stream.destroyed) {
                        // Mirakurunから最新情報が取れなくても、予約終了時刻前かつストリームが生きていれば待機継続
                        this.log.system.info(`waiting for program broadcast stream: reserveId: ${this.reserve.id}`);
                        this.recordingStartTimeoutId = setTimeout(checkStreamTimeout, 5000);
                        return;
                    }
                }

                this.recordingStartTimeoutId = null;
                isStreamTimeout = true;
                this.log.system.error(`recording failed: ${this.reserve.id}`);

                if (this.stream !== null) {
                    this.stream.removeListener('data', onData); // stream データ受信時のコールバックの登録を削除
                    this.destroyStream();
                    await this.closeRecFile();

                    // delete file
                    await FileUtil.unlink(recPath.fullPath).catch(err => {
                        this.log.system.error(`delete error: ${this.reserve.id} ${recPath.fullPath}`);
                        this.log.system.error(err);
                    });
                }

                reject(new Error('recordingStartError'));
            };

            this.recordingStartTimeoutId = setTimeout(checkStreamTimeout, 1000 * 5);

            // stream データ受診時のコールバック関数定義
            const onData = async () => {
                isDataReceived = true;
                if (this.recordingStartTimeoutId !== null) {
                    clearTimeout(this.recordingStartTimeoutId);
                    this.recordingStartTimeoutId = null;
                }

                if (isStreamTimeout === true) {
                    // timeout が発生していたため何もしない
                    this.log.system.error(`stream is timeouted. reserveId: ${this.reserve.id}`);

                    return;
                }

                this.actualStartAt = new Date().getTime();

                // 番組情報追加
                const recorded = await this.addRecorded(recPath);

                // 終了処理セット
                if (this.stream !== null) {
                    this.setEndProcess(this.stream);
                } else {
                    reject(new Error('StreamIsNull'));

                    return;
                }

                // 録画開始を通知
                this.recordingEvent.emitStartRecording(this.reserve, recorded);

                // program id が指定されていればイベントリレーの確認を行う
                if (this.reserve.programId !== null) {
                    // イベントリレーを確認するために番組終了時間間近にタイマーをセットする
                    this.setEventRelayTimer(this.reserve);
                }

                resolve();
            };

            // stream データ受診時のコールバック設定
            this.stream.once('data', onData);
        }).catch(err => {
            // 予想外の録画失敗エラー
            this.destroyStream();
            throw err;
        });
    }

    /**
     * 録画開始時の録画番組情報追加処理
     * @param recPath: RecFilePathInfo
     * @returns Promise<Recorded>
     */
    private async addRecorded(recPath: RecFilePathInfo): Promise<Recorded> {
        this.log.system.info(`add recorded ${this.reserve.id} ${recPath.fullPath}`);
        try {
            const recorded = await this.createRecorded();
            this.recordedId = await this.recordedDB.insertOnce(recorded);
            recorded.id = this.recordedId;
            this.log.system.info(`recording added reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}`);

            // add video file
            const videoFile = new VideoFile();
            videoFile.parentDirectoryName = recPath.parendDir.name;
            videoFile.filePath = path.join(recPath.subDir, recPath.fileName);
            videoFile.type = 'ts';
            videoFile.name = 'TS';
            videoFile.recordedId = this.recordedId;
            this.log.system.info(`create video file: ${videoFile.filePath}`);
            this.videoFileId = await this.videoFileDB.insertOnce(videoFile);
            this.videoFileFulPath = recPath.fullPath;

            recorded.videoFiles = [videoFile];

            return recorded;
        } catch (err: any) {
            // DB 登録エラー
            this.log.system.error('add recorded DB error');
            this.log.system.error(err);
            this.destroyStream();

            // delete file
            await FileUtil.unlink(recPath.fullPath).catch(err => {
                this.log.system.error(`delete error: ${this.reserve.id} ${recPath.fullPath}`);
                this.log.system.error(err);
            });

            throw new Error('AddRecordedDBError');
        }
    }

    /**
     * 終了処理追加
     * @param s: Mirakurun からのストリーム
     */
    private setEndProcess(s: http.IncomingMessage): void {
        this.log.system.info(`set stream.finished: reserveId: ${this.reserve.id} recordedId: ${this.recordedId}`);
        stream.finished(s, {}, async err => {
            // 終了処理が呼ばれていたら無視する
            if (this.isCanceledCallingFinished === true) {
                return;
            }

            if (err) {
                this.log.system.error(
                    `stream.finished error: reserveId: ${this.reserve.id} recordedId: ${this.recordedId}`,
                );
                await this.recFailed(err);
            } else {
                await this.recEnd().catch(e => {
                    this.log.system.fatal(
                        `unexpected recEnd error: reserveId: ${this.reserve.id} recordedId: ${this.recordedId}`,
                    );
                    this.log.system.fatal(e);
                });
            }
        });
    }

    /**
     * 録画失敗処理
     * @param err: Error
     */
    private async recFailed(err: Error): Promise<void> {
        this.destroyStream();
        this.log.system.error(`recording end error reserveId: ${this.reserve.id} recordedId: ${this.recordedId}`);
        this.log.system.error(err);

        // 録画終了処理
        this.isNeedDeleteReservation = false;
        await this.recEnd().catch(e => {
            this.log.system.error(`recEnd error reserveId: ${this.reserve.id} recordedId: ${this.recordedId}`);
            this.log.system.error(e);
        });

        // 録画終了処理失敗を通知
        let recorded: Recorded | null = null;
        if (this.recordedId !== null) {
            try {
                recorded = await this.recordedDB.findId(this.recordedId);
            } catch (e: any) {
                this.log.system.error(`reocrded is deleted: ${this.recordedId}`);
                recorded = null;
            }
        }
        this.recordingEvent.emitRecordingFailed(this.reserve, recorded);
    }

    /**
     * this.reserve から Recorded を生成する
     * @return Promise<Recorded>
     */
    private async createRecorded(): Promise<Recorded> {
        const recorded = new Recorded();
        if (this.recordedId !== null) {
            recorded.id = this.recordedId;
        }
        recorded.isRecording = this.isRecording;
        recorded.reserveId = this.reserve.id;
        recorded.ruleId = this.reserve.ruleId;
        recorded.programId = this.reserve.programId;
        recorded.channelId = this.reserve.channelId;
        recorded.startAt = this.reserve.startAt;
        recorded.endAt = this.reserve.endAt;
        recorded.duration = this.reserve.endAt - this.reserve.startAt;

        if (this.reserve.isTimeSpecified === true) {
            // 時刻指定予約なので channelId と 録画期間 (startAt 〜 endAt) を元に最長番組情報を取得する
            const program = await this.programDB.findChannelIdAndTime(
                this.reserve.channelId,
                this.reserve.startAt,
                this.reserve.endAt,
            );
            if (program === null) {
                // 番組情報が取れなかった場合: 予約時のタイトル（およびメタ情報）をフォールバックとして採用
                this.log.system.warn(
                    `get program info warn channelId: ${this.reserve.channelId}, startAt: ${this.reserve.startAt}`,
                );
                recorded.name = this.reserve.name || '';
                recorded.halfWidthName = this.reserve.halfWidthName || this.reserve.name || '';
                recorded.description = this.reserve.description;
                recorded.halfWidthDescription = this.reserve.halfWidthDescription;
                recorded.extended = this.reserve.extended;
                recorded.halfWidthExtended = this.reserve.halfWidthExtended;
                recorded.rawExtended = this.reserve.rawExtended;
                recorded.rawHalfWidthExtended = this.reserve.rawHalfWidthExtended;
                recorded.genre1 = this.reserve.genre1;
                recorded.subGenre1 = this.reserve.subGenre1;
                recorded.genre2 = this.reserve.genre2;
                recorded.subGenre2 = this.reserve.subGenre2;
                recorded.genre3 = this.reserve.genre3;
                recorded.subGenre3 = this.reserve.subGenre3;
                recorded.videoType = this.reserve.videoType;
                recorded.videoResolution = this.reserve.videoResolution;
                recorded.videoStreamContent = this.reserve.videoStreamContent;
                recorded.videoComponentType = this.reserve.videoComponentType;
                recorded.audioSamplingRate = this.reserve.audioSamplingRate;
                recorded.audioComponentType = this.reserve.audioComponentType;
            } else {
                recorded.name = program.name;
                recorded.halfWidthName = program.halfWidthName;
                recorded.description = program.description;
                recorded.halfWidthDescription = program.halfWidthDescription;
                recorded.extended = program.extended;
                recorded.halfWidthExtended = program.halfWidthExtended;
                recorded.rawExtended = program.rawExtended;
                recorded.rawHalfWidthExtended = program.rawHalfWidthExtended;
                recorded.genre1 = program.genre1;
                recorded.subGenre1 = program.subGenre1;
                recorded.genre2 = program.genre2;
                recorded.subGenre2 = program.subGenre2;
                recorded.genre3 = program.genre3;
                recorded.subGenre3 = program.subGenre3;
                recorded.videoType = program.videoType;
                recorded.videoResolution = program.videoResolution;
                recorded.videoStreamContent = program.videoStreamContent;
                recorded.videoComponentType = program.videoComponentType;
                recorded.audioSamplingRate = program.audioSamplingRate;
                recorded.audioComponentType = program.audioComponentType;
            }
        } else if (this.reserve.name !== null && this.reserve.halfWidthName !== null) {
            recorded.name = this.reserve.name;
            recorded.halfWidthName = this.reserve.halfWidthName;
            recorded.description = this.reserve.description;
            recorded.halfWidthDescription = this.reserve.halfWidthDescription;
            recorded.extended = this.reserve.extended;
            recorded.halfWidthExtended = this.reserve.halfWidthExtended;
            recorded.rawExtended = this.reserve.rawExtended;
            recorded.rawHalfWidthExtended = this.reserve.rawHalfWidthExtended;
            recorded.genre1 = this.reserve.genre1;
            recorded.subGenre1 = this.reserve.subGenre1;
            recorded.genre2 = this.reserve.genre2;
            recorded.subGenre2 = this.reserve.subGenre2;
            recorded.genre3 = this.reserve.genre3;
            recorded.subGenre3 = this.reserve.subGenre3;
            recorded.videoType = this.reserve.videoType;
            recorded.videoResolution = this.reserve.videoResolution;
            recorded.videoStreamContent = this.reserve.videoStreamContent;
            recorded.videoComponentType = this.reserve.videoComponentType;
            recorded.audioSamplingRate = this.reserve.audioSamplingRate;
            recorded.audioComponentType = this.reserve.audioComponentType;
        } else {
            // 時刻指定予約ではないのに、name が null
            throw new Error('CreateRecordedError');
        }

        if (this.dropLogFileId !== null) {
            recorded.dropLogFileId = this.dropLogFileId;
        }

        return recorded;
    }

    /**
     * 録画終了処理
     */
    private async recEnd(): Promise<void> {
        if (this.recEndPromise !== null) {
            return this.recEndPromise;
        }

        this.recEndPromise = (async () => {
            this.log.system.info(`start recEnd reserveId: ${this.reserve.id} recordedId: ${this.recordedId}`);

            // stream 停止
            this.destroyStream();
            await this.closeRecFile();

            // イベントリレーのチェック用タイマーをクリア
            if (this.eventRelayTimerId !== null) {
                clearTimeout(this.eventRelayTimerId);
                this.eventRelayTimerId = null;
            }

            // 削除予定か?
            if (this.isPlanToDelete === true) {
                this.log.system.info(`plan to delete reserveId: ${this.reserve.id} recordedId: ${this.recordedId}`);

                if (this.dropLogFileId !== null) {
                    await this.dropChecker.stop().catch(err => {
                        this.log.system.error(`stop drop checker error: ${this.dropLogFileId}`);
                        this.log.system.error(err);
                    });
                }

                return;
            }

            if (this.recordedId !== null) {
                // remove recording flag & update actual duration
                this.log.system.info(`remove recording flag: ${this.recordedId}`);
                const actualEndAt = new Date().getTime();
                const actualDuration =
                    this.actualStartAt !== null ? Math.max(0, actualEndAt - this.actualStartAt) : undefined;
                // 録画開始が予定時刻より30秒以上遅れて開始した場合（途中録画・チューナー競合等）、startAt を実測開始時刻で補正
                const actualStartAt =
                    this.actualStartAt !== null && this.actualStartAt - this.reserve.startAt > 30 * 1000
                        ? this.actualStartAt
                        : undefined;
                try {
                    await this.recordedDB.removeRecording(this.recordedId, actualDuration, actualEndAt, actualStartAt);
                } finally {
                    this.isRecording = false;
                }

                // tmp に録画していた場合は移動する
                if (typeof this.config.recording.tempDir !== 'undefined' && this.videoFileId !== null) {
                    try {
                        const newVdeoFileFulPath = await this.recordingUtil.movingFromTmp(
                            this.reserve,
                            this.videoFileId,
                        );
                        this.videoFileFulPath = newVdeoFileFulPath;
                    } catch (err: any) {
                        this.log.system.fatal(`movingFromTmp error: ${this.videoFileId}`);
                        this.log.system.fatal(err);
                    }
                }

                // update video file size
                if (this.videoFileId !== null && this.videoFileFulPath !== null) {
                    await this.recordingUtil.updateVideoFileSize(this.videoFileId).catch(err => {
                        this.log.system.error(`update file size error: ${this.videoFileId}`);
                        this.log.system.error(err);
                    });
                }

                // drop 情報更新
                await this.updateDropFileLog().catch(err => {
                    this.log.system.fatal(`updateDropFileLog error: ${this.dropLogFileId}`);
                    this.log.stream.fatal(err);
                });

                // recorded 情報取得
                const recorded = await this.recordedDB.findId(this.recordedId);

                // Recorded history 追加
                if (
                    this.reserve.isTimeSpecified === false &&
                    this.reserve.isEventRelay === false &&
                    this.isNeedDeleteReservation === true
                ) {
                    // 番組指定予約(ルール予約および手動個別予約)の場合に記録する
                    try {
                        if (recorded !== null) {
                            this.log.system.info(`add recorded history: ${this.recordedId}`);
                            const history = new RecordedHistory();
                            history.name = StrUtil.deleteBrackets(recorded.halfWidthName);
                            history.channelId = recorded.channelId;
                            history.endAt = recorded.endAt;
                            await this.recordedHistoryDB.insertOnce(history);
                        }
                    } catch (err: any) {
                        this.log.system.error(`add recorded history error: ${this.recordedId}`);
                        this.log.system.error(err);
                    }
                }

                // 録画完了の通知（シャットダウン・中断保存時はエンコード等の不要な後続ジョブ発火を抑止）
                if (recorded !== null && this.isShutdownStop === false) {
                    this.log.system.info(
                        `emit finish recording reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}, isNeedDeleteReservation: ${this.isNeedDeleteReservation}`,
                    );
                    this.recordingEvent.emitFinishRecording(this.reserve, recorded, this.isNeedDeleteReservation);
                }
            } else {
                this.log.system.info('failed to recording: recorded id is null');
                this.isRecording = false;
                if (this.currentRecFilePath !== null) {
                    await FileUtil.unlink(this.currentRecFilePath).catch(() => {});
                    this.currentRecFilePath = null;
                }
            }

            this.log.system.info(
                `recording finish reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}, videoFileFulPath: ${this.videoFileFulPath}`,
            );
        })();

        return this.recEndPromise;
    }

    /**
     * drop log file 情報を更新する
     * @return Promise<void>
     */
    private async updateDropFileLog(): Promise<void> {
        if (this.dropLogFileId === null) {
            return;
        }

        // ドロップ情報カウント
        let error = 0;
        let drop = 0;
        let scrambling = 0;
        try {
            const dropResult = await this.dropChecker.getResult();
            for (const pid in dropResult) {
                error += dropResult[pid].error;
                drop += dropResult[pid].drop;
                scrambling += dropResult[pid].scrambling;
            }
        } catch (err: any) {
            this.log.system.error(`get drop result error: ${this.dropLogFileId}`);
            this.log.system.error(err);
            await this.dropChecker.stop().catch(() => {});

            return;
        }

        // ドロップ数をログに残す
        this.log.system.info({
            recordedId: this.recordedId,
            error: error,
            drop: drop,
            scrambling: scrambling,
        });

        // ドロップ・エラー・スクランブルがすべて0件の場合、設定に応じてログ実ファイルを削除して肥大化を防止
        if (this.config.recording.dropLog.deleteOnNoDrop !== false && error === 0 && drop === 0 && scrambling === 0) {
            const dropFilePath = this.dropChecker.getFilePath();
            if (dropFilePath !== null) {
                this.log.system.info(`zero drop/error detected, deleting drop log file: ${dropFilePath}`);
                await FileUtil.unlink(dropFilePath).catch(err => {
                    this.log.system.warn(`failed to delete zero-drop log file: ${dropFilePath}`);
                    this.log.system.warn(err);
                });
            }
        }

        // DB へ反映
        await this.dropLogFileDB
            .updateCnt({
                id: this.dropLogFileId,
                errorCnt: error,
                dropCnt: drop,
                scramblingCnt: scrambling,
            })
            .catch(err => {
                this.log.system.error(`update drop cnt error: ${this.dropLogFileId}`);
                this.log.system.error(err);
            });

        // dropChecker リソース解放を確実に完了させる
        await this.dropChecker.stop().catch(err => {
            this.log.system.error(`stop drop checker error: ${this.dropLogFileId}`);
            this.log.system.error(err);
        });
    }

    /**
     * 予約のキャンセル（タイマー解除または prepRecord のアボート）
     */
    private async _cancel(): Promise<void> {
        if (this.recordingStartTimeoutId !== null) {
            clearTimeout(this.recordingStartTimeoutId);
            this.recordingStartTimeoutId = null;
        }

        if (this.prepRetryTimerId !== null) {
            clearTimeout(this.prepRetryTimerId);
            this.prepRetryTimerId = null;
            this.isPrepRecording = false;
            this.isStopPrepRec = false;
            return;
        }

        if (this.isPrepRecording === false && this.isRecording === false) {
            // 録画処理が開始されていない
            if (this.timerId !== null) {
                clearTimeout(this.timerId);
                this.timerId = null;
            }
        } else if (this.isPrepRecording === true) {
            this.log.system.info(`cancel preprec: ${this.reserve.id}`);

            // 録画準備中
            return new Promise<void>((resolve: () => void, reject: (err: Error) => void) => {
                // タイムアウト設定
                const timerId = setTimeout(() => {
                    reject(new Error('PrepRecCancelTimeoutError'));
                }, 60 * 1000);

                // 録画準備中
                this.isStopPrepRec = true;
                if (this.abortController !== null) {
                    this.abortController.abort();
                }
                this.eventEmitter.once(RecorderModel.CANCEL_EVENT, () => {
                    clearTimeout(timerId);
                    // prep rec キャンセル完了
                    resolve();
                });
            });
        }
    }

    /**
     * 予約のキャンセル
     * @param isPlanToDelete: boolean ファイルが削除される予定か
     */
    public async cancel(isPlanToDelete: boolean): Promise<void> {
        this.log.system.info(
            `recording cancel reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}, isPlanToDelete: ${isPlanToDelete}`,
        );

        this.isPlanToDelete = isPlanToDelete;
        this.isNeedDeleteReservation = false;

        if (this.isPrepRecording === true) {
            await this._cancel();
            // 録画準備失敗を通知
            this.recordingEvent.emitCancelPrepRecording(this.reserve);
        } else if (this.isRecording === true) {
            this.isCanceledCallingFinished = true;
            await this.recEnd();
        } else {
            await this._cancel();
        }
    }

    /**
     * 録画を途中完了として終了する（保存して正常完了シーケンスを実行）
     */
    public async finish(): Promise<void> {
        this.log.system.info(
            `recording finish requested reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}`,
        );

        this.isPlanToDelete = false;
        this.isNeedDeleteReservation = true;

        if (this.isPrepRecording === true) {
            await this._cancel();
            // 録画準備失敗を通知
            this.recordingEvent.emitCancelPrepRecording(this.reserve);
        } else if (this.isRecording === true) {
            this.isCanceledCallingFinished = true;
            await this.recEnd();
        } else {
            await this._cancel();
        }
    }

    /**
     * 録画を安全に停止・フラッシュして保存する（シャットダウン・中断保存用）
     */
    public async stop(): Promise<void> {
        this.log.system.info(`recording stop requested reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}`);

        this.isPlanToDelete = false;
        this.isNeedDeleteReservation = false;
        this.isShutdownStop = true;

        if (this.isPrepRecording === true) {
            await this._cancel();
        } else if (this.isRecording === true) {
            this.isCanceledCallingFinished = true;
            await this.recEnd();
        } else {
            await this._cancel();
        }
    }

    /**
     * 予約情報を更新する
     * @param newReserve: 新しい予約情報
     * @param isSuppressLog: boolean ログ出力を抑えるか
     */
    public async update(newReserve: Reserve, isSuppressLog: boolean): Promise<void> {
        if (newReserve.isSkip === true || newReserve.isOverlap === true) {
            // skip されたかチェック
            this.log.system.info(
                `cancel recording by skip or overlap reserveId: ${this.reserve.id}, recordedId: ${this.recordedId}`,
            );
            await this.cancel(false).catch(err => {
                this.log.system.error(`cancel recording error: ${newReserve.id}`);
                this.log.system.error(err);
            });
        } else if (this.reserve.startAt !== newReserve.startAt || this.reserve.endAt !== newReserve.endAt) {
            // 時刻に変更がないか確認
            // 録画処理が実行されていない場合
            if (this.isPrepRecording === false && this.isRecording === false) {
                this.setTimer(newReserve, isSuppressLog);
            } else {
                // 録画準備中 or 録画中
                if (this.reserve.programId === null) {
                    // 時間指定予約で時刻に変更があった
                    // TODO 現時点では時刻指定で時間変更を受け入れられるようにな api になっていない
                    // TODO 録画中 or 録画準備中の開始時刻変更にも対応していない
                    if (this.reserve.endAt !== newReserve.endAt) {
                        // 時間指定予約で終了時刻に変更があった
                        this.log.system.info(`change recording endAt: ${newReserve.id}`);

                        if (this.isPrepRecording === true) {
                            // 録画準備中なら録画中になるまで待つ
                            await new Promise<void>((resolve: () => void, reject: (err: Error) => void) => {
                                this.log.system.debug(`wait change endAt: ${newReserve.id}`);
                                // タイムアウト設定
                                const timeoutId = setTimeout(() => {
                                    reject(new Error('ChangeEndAtTimeoutError'));
                                }, IRecordingStreamCreator.PREP_TIME);

                                // 録画開始内部イベント発行街
                                this.eventEmitter.once(RecorderModel.START_RECORDING_EVENT, () => {
                                    clearTimeout(timeoutId);
                                    resolve();
                                });
                            });
                        }

                        // 終了時刻変更
                        try {
                            this.streamCreator.changeEndAt(newReserve);
                        } catch (err: any) {
                            this.log.system.error(`change recording endAt: ${newReserve.id}`);
                            this.log.system.error(err);
                        }
                    }
                } else {
                    // 録画中に終了時間が変更されたらイベントリレーの確認タイマーも再設定する
                    if (this.reserve.endAt !== newReserve.endAt && this.isRecording === true) {
                        this.setEventRelayTimer(newReserve);
                    }

                    if (this.reserve.startAt < newReserve.startAt) {
                        // 開始時刻が遅くなった
                        if (this.isRecording === false) {
                            // まだ録画準備中なのでキャンセルしてタイマーを再セット
                            this.log.system.info(
                                `cancel prepare recording.`,
                                `(reserveId: ${this.reserve.id}, programId: ${this.reserve.programId}, recordedId: ${this.recordedId})`,
                            );
                            await this._cancel().catch(err => {
                                this.log.system.error(
                                    `cancel recording error: (reserveId: ${newReserve.id}, programId: ${this.reserve.programId})`,
                                );
                                this.log.system.error(err);
                            });
                            // NOTE: キャンセルエラーが発生したとしてもタイマーを再セット
                            this.setTimer(newReserve, isSuppressLog);
                        } else {
                            // 録画中
                            // NOTE:
                            //  EPGstationがスケジュール変更を遅れて把握した可能性がある
                            //  一度ストリームを開始した番組の開始時刻が変更されることはないのでここでは何もしない
                            this.log.system.info(
                                `Ignores schedule changes because this program is already recording.`,
                                ` (reserveId: ${this.reserve.id}, programId: ${this.reserve.programId}, recordedId: ${this.recordedId})`,
                            );
                        }
                    }
                }
            }
        }

        this.reserve = newReserve;

        // update recorded DB
        if (this.isRecording === true && this.recordedId !== null) {
            const recorded = await this.createRecorded();
            this.log.system.info(`update reocrded: ${this.recordedId}`);
            await this.recordedDB.updateOnce(recorded);
        }
    }

    /**
     * イベントリレーをチェックするためのタイマーをセットする
     * @param reserve: Reserve 予約情報
     */
    private setEventRelayTimer(reserve: Reserve): void {
        // 除外, 重複しているものはタイマーをセットしない
        if (reserve.isSkip === true || reserve.isOverlap === true) {
            return;
        }

        // 待機時間を計算
        const now = new Date().getTime();
        if (now >= reserve.endAt) {
            return;
        }
        let time = reserve.endAt - RecorderModel.EVENT_RELAY_CHECK_TIME - now;
        if (time < 0) {
            time = 0;
        }
        if (time > 2147483647) {
            time = 2147483647;
        }

        // タイマーをセットする
        if (this.eventRelayTimerId !== null) {
            clearTimeout(this.eventRelayTimerId);
        }
        this.eventRelayTimerId = setTimeout(async () => {
            await this.checkEventRelay();
        }, time);
    }

    /**
     * イベントリレーの対象となる予約情報の確認を行う
     * @param relatedItemsFromEit: TS 放送波の EIT から直接取得した関連番組情報（指定時は Mirakurun REST API 問い合わせをバイパス）
     */
    private async checkEventRelay(relatedItemsFromEit?: EitRelatedItem[]): Promise<void> {
        // ProgramId の指定がない場合は何もしない
        if (this.reserve.programId === null) {
            return;
        }

        this.log.system.debug(
            `check event relay program. reserveId: ${this.reserve.id}, programId: ${this.reserve.programId}`,
        );

        const parentNetworkId = Math.floor(this.reserve.programId / 10000000000);
        let relayItems: { networkId: number; serviceId: number; eventId: number }[] = [];

        if (relatedItemsFromEit && relatedItemsFromEit.length > 0) {
            // 放送波 TS の EIT から直接得られたリレー情報を優先利用（Mirakurun REST API 遅延のバイパス）
            relayItems = relatedItemsFromEit
                .filter(item => item.type === 'relay')
                .map(item => ({
                    networkId: item.networkId ?? parentNetworkId,
                    serviceId: item.serviceId,
                    eventId: item.eventId,
                }));
        } else {
            const mirakurun = this.mirakurunClientModel.getClient();

            // program 情報の取得
            let parentProgram: mapid.Program;
            try {
                parentProgram = await mirakurun.getProgram(this.reserve.programId);
                this.log.system.debug(parentProgram);
            } catch (err: any) {
                this.log.system.error(
                    `failed to get event relay info. reserveId: ${this.reserve.id}, programId: ${this.reserve.programId}`,
                );
                return;
            }

            // event relay の設定の有無を調べる
            if (typeof parentProgram.relatedItems === 'undefined') {
                this.log.system.debug(
                    `event relay porgram does not exist. reserveId: ${this.reserve.id}, programId: ${this.reserve.programId}`,
                );
                return;
            }

            for (const relatedItem of parentProgram.relatedItems) {
                if (relatedItem.type !== 'relay') {
                    continue;
                }
                let networkId = relatedItem.networkId;
                if (typeof networkId === 'undefined' || networkId === null) {
                    networkId = parentProgram.networkId ?? parentNetworkId;
                }
                relayItems.push({
                    networkId,
                    serviceId: relatedItem.serviceId,
                    eventId: relatedItem.eventId,
                });
            }
        }

        // event relay 対象の ProgramId のリストを作成する
        const reserveProgramIds: { programId: apid.ProgramId; parentReserve: Reserve }[] = [];
        for (const item of relayItems) {
            // networkId, serviceId, eventId から該当する番組情報を検索する
            const reserveProgram = await this.programDB.findEventRelayProgram(
                item.networkId,
                item.serviceId,
                item.eventId,
            );
            if (reserveProgram === null) {
                this.log.system.warn(
                    `event relay program is not found. networkId: ${item.networkId}, serviceId: ${item.serviceId}, eventId: ${item.eventId}`,
                );
                continue;
            }

            // 予約に必要な情報を詰める
            // parentReserve は deep copy して渡す
            reserveProgramIds.push({ programId: reserveProgram.id, parentReserve: Object.assign({}, this.reserve) });
            this.log.system.info(
                `set event relay program. programId ${this.reserve.programId} -> ${reserveProgram.id}`,
            );
        }

        // イベントリレーの ProgramId が存在するなら予約を依頼する
        if (reserveProgramIds.length > 0) {
            this.recordingEvent.emitEventRelay(reserveProgramIds);
        }
    }

    /**
     * TS ストリーム内の EIT (present/following) 受信時のハンドラ
     * 放送波からのリアルタイム番組延長・タイトル変更・イベントリレーの即時検知を行う
     * @param eit: EitInfo
     */
    private onEit = (eit: EitInfo): void => {
        if (this.isRecording === false || this.reserve.programId === null) {
            return;
        }

        const targetServiceId = Math.floor(this.reserve.programId / 100000) % 100000;
        const targetEventId = this.reserve.programId % 100000;

        // 対象サービスの EIT かどうか確認
        if (eit.serviceId !== targetServiceId) {
            return;
        }

        const event = eit.events.find(e => e.eventId === targetEventId);
        if (!event) {
            return;
        }

        // 1. 番組延長検知
        if (event.startTime !== null && event.duration > 0) {
            const streamEndAt = event.startTime.getTime() + event.duration * 1000;
            if (streamEndAt > this.reserve.endAt) {
                const oldEndAt = this.reserve.endAt;
                const diffSec = Math.round((streamEndAt - this.reserve.endAt) / 1000);
                this.log.system.info(
                    `[EIT] Program extension detected via TS for reserveId: ${this.reserve.id} (${this.reserve.name}): ` +
                        `endAt extended by +${diffSec}s (new endAt: ${new Date(streamEndAt).toISOString()})`,
                );
                this.reserve.endAt = streamEndAt;

                // DB 上の予約情報を更新
                void this.reserveDB.updateOnce(this.reserve).catch(err => {
                    this.log.system.error(`[EIT] failed to update reserve endAt: ${this.reserve.id}`);
                    this.log.system.error(err);
                });

                // 延長された時間帯について後続予約とのチューナー競合（isConflict）を即時再調停
                this.recordingEvent.emitRecheckConflicts([
                    {
                        startAt: oldEndAt,
                        endAt: streamEndAt,
                    },
                ]);

                // 録画中レコードの endAt と duration を更新
                if (this.recordedId !== null) {
                    const newDuration = Math.max(0, streamEndAt - this.reserve.startAt);
                    void this.recordedDB
                        .updateProgramInfo(this.recordedId, {
                            endAt: streamEndAt,
                            duration: newDuration,
                        })
                        .catch(err => {
                            this.log.system.error(`[EIT] failed to update recorded endAt: ${this.recordedId}`);
                            this.log.system.error(err);
                        });
                }

                // イベントリレー確認タイマーを新しい終了時刻に合わせて再設定
                this.setEventRelayTimer(this.reserve);
            }
        }

        // 2. 番組タイトル更新検知
        if (event.name && event.name !== this.reserve.name) {
            this.log.system.info(
                `[EIT] Program title updated via TS for reserveId: ${this.reserve.id}: '${this.reserve.name}' -> '${event.name}'`,
            );
            this.reserve.name = event.name;
            this.reserve.halfWidthName = StrUtil.toHalf(event.name);

            void this.reserveDB.updateOnce(this.reserve).catch(err => {
                this.log.system.error(`[EIT] failed to update reserve name: ${this.reserve.id}`);
                this.log.system.error(err);
            });

            if (this.recordedId !== null) {
                void this.recordedDB
                    .updateProgramInfo(this.recordedId, {
                        name: this.reserve.name,
                        halfWidthName: this.reserve.halfWidthName,
                    })
                    .catch(err => {
                        this.log.system.error(`[EIT] failed to update recorded name: ${this.recordedId}`);
                        this.log.system.error(err);
                    });
            }
        }

        // 3. イベントリレー（他チャンネル・マルチ編成への移行）検知
        if (event.relatedItems && event.relatedItems.some(item => item.type === 'relay')) {
            if (this.hasHandledEitRelay !== true) {
                this.hasHandledEitRelay = true;
                if (this.eventRelayTimerId !== null) {
                    clearTimeout(this.eventRelayTimerId);
                    this.eventRelayTimerId = null;
                }
                this.log.system.info(`[EIT] Event relay descriptor detected via TS for reserveId: ${this.reserve.id}`);
                const relayItems = event.relatedItems.filter(item => item.type === 'relay');
                void this.checkEventRelay(relayItems);
            }
        }
    };

    /**
     * タイマーを再設定する
     * @return boolean セットに成功したら true を返す
     */
    public resetTimer(): boolean {
        // 録画中ならイベントリレーのチェック用のタイマーを再設定
        if (this.isRecording === true) {
            if (this.eventRelayTimerId !== null) {
                this.setEventRelayTimer(this.reserve);
            }
            return true;
        }

        return this.setTimer(this.reserve, false);
    }
}

namespace RecorderModel {
    export const CANCEL_EVENT = 'RecordingCancelEvent';
    export const START_RECORDING_EVENT = 'StartRecordingEvent';
    export const EVENT_RELAY_CHECK_TIME = 20 * 1000; // イベントリレーの確認時間 20秒
}

export default RecorderModel;
