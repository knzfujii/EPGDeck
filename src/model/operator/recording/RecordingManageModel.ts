import * as apid from '../../../../api.js';
import * as mapid from 'mirakurun/api.js';
import IRecordedDB from '../../db/IRecordedDB.js';
import IReserveDB from '../../db/IReserveDB.js';
import IRecordingEvent from '../../event/IRecordingEvent.js';
import { IReserveUpdateValues } from '../../event/IReserveEvent.js';
import IConfigFile from '../../IConfigFile.js';
import IConfiguration from '../../IConfiguration.js';
import ILogger from '../../ILogger.js';
import ILoggerModel from '../../ILoggerModel.js';
import IRecorderModel, { RecorderModelProvider } from './IRecorderModel.js';
import IRecordingManageModel from './IRecordingManageModel.js';
import IRecordingStreamCreator from './IRecordingStreamCreator.js';
import IRecordingUtilModel from './IRecordingUtilModel.js';

interface RecordingIndex {
    [key: number]: IRecorderModel;
}

class RecordingManageModel implements IRecordingManageModel {
    private log: ILogger;
    private config: IConfigFile;
    private provider: RecorderModelProvider;
    private streamCreator: IRecordingStreamCreator;
    private recordedDB: IRecordedDB;
    private reserveDB: IReserveDB;
    private recordingUtil: IRecordingUtilModel;
    private recordingEvent: IRecordingEvent;
    private recordingIndex: RecordingIndex = {};
    private isStopped: boolean = false;

    constructor(
        logger: ILoggerModel,
        configuration: IConfiguration,
        provider: RecorderModelProvider,
        recordingEvent: IRecordingEvent,
        streamCreator: IRecordingStreamCreator,
        recordedDB: IRecordedDB,
        reserveDB: IReserveDB,
        recordingUtil: IRecordingUtilModel,
    ) {
        this.log = logger.getLogger();
        this.config = configuration.getConfig();
        this.provider = provider;
        this.recordingEvent = recordingEvent;
        this.streamCreator = streamCreator;
        this.recordedDB = recordedDB;
        this.reserveDB = reserveDB;
        this.recordingUtil = recordingUtil;

        this.setEvents(); // イベント設定
    }

    /**
     * 録画関連イベントに登録
     */
    private setEvents(): void {
        this.recordingEvent.setCancelPrepRecording(reserve => {
            this.deleteRecording(reserve.id);
        });

        this.recordingEvent.setPrepRecordingFailed(reserve => {
            this.deleteRecording(reserve.id);
        });

        this.recordingEvent.setRecordingFailed(async reserve => {
            this.deleteRecording(reserve.id);

            if (this.isStopped) {
                return;
            }

            const recordeds = await this.recordedDB.findReserveId(reserve.id);

            if (recordeds.length < 3) {
                // 録画を再設定
                const recorder = await this.provider();
                if (recorder.setTimer(reserve, false) === true) {
                    this.log.system.info(`readd recording: ${reserve.id}`);
                    this.recordingIndex[reserve.id] = recorder;
                } else {
                    this.log.system.error(`readd recording error: ${reserve.id}`);
                }
            } else {
                // リトライ回数オーバー
                this.log.system.error(`recording retry over: ${reserve.id}`);
                this.recordingEvent.emitRecordingRetryOver(reserve);
            }
        });

        this.recordingEvent.setFinishRecording(reserve => {
            this.deleteRecording(reserve.id);
        });
    }

    /**
     * 録画終了時に呼ばれる
     * @param reserveId: Reserve Id
     */
    private deleteRecording(reserveId: apid.ReserveId): void {
        this.log.system.debug(`delete recording index: ${reserveId}`);
        delete this.recordingIndex[reserveId];
    }

    /**
     * tuner 情報セット
     * @param tuners: mapid.TunerDevice[]
     */
    public setTuner(tuners: mapid.TunerDevice[]): void {
        this.streamCreator.setTuner(tuners);
    }

    /**
     * 起動時に録画中に停止してしまった録画情報を録画中から録画済みに移行させる
     * @return Promise<void>
     */
    public async cleanup(): Promise<void> {
        this.log.system.info('start recordings cleanup ');

        // 録画中になっている番組を取り出す
        const [records] = await this.recordedDB.findAll(
            {
                isHalfWidth: false,
                isRecording: true,
            },
            {
                isNeedVideoFiles: true,
                isNeedThumbnails: false,
                isNeedsDropLog: false,
                isNeedTags: false,
            },
        );

        for (const r of records) {
            // 録画中から録画済みへ変更
            try {
                await this.recordedDB.removeRecording(r.id);
            } catch (err: any) {
                this.log.system.error(`failed to remove recording: ${r.id}`);
                this.log.system.error(err);
                continue;
            }

            // reserveId がなかった
            if (r.reserveId === null) {
                this.log.system.warn(`reserveId is null: ${r.reserveId}`);
                continue;
            }

            // 予約情報取得
            const reserve = await this.reserveDB.findId(r.reserveId).catch(err => {
                this.log.system.error(`get reserve error: ${r.reserveId}`);
                this.log.system.error(err);
            });

            // 予約情報が取れなかった
            if (typeof reserve === 'undefined' || reserve === null) {
                this.log.system.warn(`reserveId is not found: ${r.reserveId}`);
                continue;
            }

            // video file 処理
            if (typeof r.videoFiles !== 'undefined') {
                for (const videoFile of r.videoFiles) {
                    // recordedTmp が有効な場合は正規の場所に移動させる
                    if (
                        videoFile.parentDirectoryName === 'tmp' &&
                        typeof this.config.recording.tempDir !== 'undefined'
                    ) {
                        await this.recordingUtil.movingFromTmp(reserve, videoFile.id).catch(err => {
                            this.log.system.fatal(`movingFromTmp error: ${videoFile.id}`);
                            this.log.system.fatal(err);
                        });
                    }

                    // update file size
                    await this.recordingUtil.updateVideoFileSize(videoFile.id).catch(err => {
                        this.log.system.error(`update file size error: ${videoFile.id}`);
                        this.log.system.error(err);
                    });
                }
            }

            // 終了処理
            const newRecorded = await this.recordedDB.findId(r.id);
            if (newRecorded !== null) {
                this.recordingEvent.emitFinishRecording(reserve, newRecorded, true);
            }
        }

        this.log.system.info('finish recordings cleanup ');
    }

    /**
     * 予約情報の更新
     * @param diff: IReserveUpdateValues
     */
    public async update(diff: IReserveUpdateValues): Promise<void> {
        if (this.isStopped) {
            return;
        }

        // 新規追加
        if (typeof diff.insert !== 'undefined') {
            for (const reserve of diff.insert) {
                // 除外, 重複しているものはタイマーをセットしない
                if (reserve.isSkip === true || reserve.isOverlap === true) {
                    continue;
                }

                // 同一チャンネルかつ重複する時間帯ですでに録画中のレコーダーが存在する場合は二重起動を抑止
                const isAlreadyRecordingSameSlot = Object.values(this.recordingIndex).some(rec => {
                    return (
                        rec.isRecording &&
                        rec.reserve &&
                        rec.reserve.channelId === reserve.channelId &&
                        Math.abs(rec.reserve.startAt - reserve.startAt) < 60000 &&
                        Math.abs(rec.reserve.endAt - reserve.endAt) < 60000
                    );
                });
                if (isAlreadyRecordingSameSlot) {
                    this.log.system.warn(
                        `skip adding recording timer for duplicate active slot: reserveId=${reserve.id}, name=${reserve.name}`,
                    );
                    continue;
                }

                const recorder = await this.provider();
                if (recorder.setTimer(reserve, diff.isSuppressLog) === true) {
                    this.log.system.debug(`add recording: ${reserve.id}`);
                    this.recordingIndex[reserve.id] = recorder;
                } else {
                    this.log.system.error(`add recording error: ${reserve.id}`);
                }
            }
        }

        // 更新
        if (typeof diff.update !== 'undefined') {
            for (const reserve of diff.update) {
                const recorder = this.recordingIndex[reserve.id];
                if (typeof recorder === 'undefined') {
                    if (reserve.isSkip === true || reserve.isOverlap === true) {
                        continue;
                    }
                    // recorder がなかった
                    this.log.system.debug(`create new recorder: ${reserve.id}`);
                    const newRecorder = await this.provider();
                    if (newRecorder.setTimer(reserve, diff.isSuppressLog) === true) {
                        this.recordingIndex[reserve.id] = newRecorder;
                    }
                } else {
                    this.log.system.debug(`update recording: ${reserve.id}`);
                    await recorder.update(reserve, diff.isSuppressLog).catch(err => {
                        this.log.system.error(`update recording error: ${reserve.id}`);
                        this.log.system.error(err);
                    });
                    if (reserve.isSkip === true || reserve.isOverlap === true) {
                        this.deleteRecording(reserve.id);
                    }
                }
            }
        }

        // 削除
        if (typeof diff.delete !== 'undefined') {
            for (const reserve of diff.delete) {
                const recorder = this.recordingIndex[reserve.id];
                if (typeof recorder !== 'undefined') {
                    // 録画中の予約は強制キャンセルしない（EPG更新や他ルール重複調停による録画中断を防止）
                    if (recorder.isRecording) {
                        this.log.system.warn(`skip deleting active recording: ${reserve.id}`);
                        continue;
                    }
                    this.log.system.debug(`delete recording: ${reserve.id}`);
                    await this.cancel(reserve.id, false).catch(err => {
                        this.log.system.error(`delete recording error: ${reserve.id}`);
                        this.log.system.error(err);
                    });
                }
            }
        }
    }

    /**
     * 指定された reserve id がセットされているか
     * @param reserveId: ReserveId
     * @return boolean
     */
    public hasReserve(reserveId: apid.ReserveId): boolean {
        return typeof this.recordingIndex[reserveId] !== 'undefined';
    }

    /**
     * 指定された reserve id の録画をキャンセルする
     * @param reserveId: ReserveId
     * @param isPlanToDelete: boolean 録画ファイルが削除される予定か
     * @return Promise<void>
     */
    public async cancel(reserveId: apid.ReserveId, isPlanToDelete: boolean): Promise<void> {
        const recording = this.recordingIndex[reserveId];
        if (typeof recording === 'undefined') {
            // 存在しないのでスルー
            return;
        }

        this.deleteRecording(reserveId);

        this.log.system.info(`cancel recording reserveId: ${reserveId}, isPlanToDelete: ${isPlanToDelete}`);
        return recording.cancel(isPlanToDelete);
    }

    /**
     * 指定された reserve id の録画を途中完了する
     * @param reserveId: ReserveId
     * @return Promise<void>
     */
    public async finish(reserveId: apid.ReserveId): Promise<void> {
        const recording = this.recordingIndex[reserveId];
        if (typeof recording === 'undefined') {
            // 存在しないのでスルー
            return;
        }

        this.deleteRecording(reserveId);

        this.log.system.info(`finish recording reserveId: ${reserveId}`);
        return recording.finish();
    }

    /**
     * 指定された reserve id の録画を中断して保存する
     * @param reserveId: ReserveId
     * @return Promise<void>
     */
    public async stop(reserveId: apid.ReserveId): Promise<void> {
        const recording = this.recordingIndex[reserveId];
        if (typeof recording === 'undefined') {
            return;
        }

        this.deleteRecording(reserveId);

        this.log.system.info(`stop recording reserveId: ${reserveId}`);
        return recording.stop();
    }

    /**
     * 全ての録画およびタイマーを安全に停止・フラッシュする（Graceful Shutdown用）
     * @return Promise<void>
     */
    public async stopAll(): Promise<void> {
        this.isStopped = true;
        this.log.system.info('start stopAll recordings');

        const activeRecorders = Object.values(this.recordingIndex);
        this.recordingIndex = {};

        const results = await Promise.allSettled(
            activeRecorders.map(async recorder => {
                const reserveId = recorder.reserve?.id;
                this.log.system.info(`stopping recorder reserveId: ${reserveId}`);
                await recorder.stop();
            }),
        );

        let failedCount = 0;
        for (const [index, result] of results.entries()) {
            if (result.status === 'rejected') {
                failedCount++;
                const reserveId = activeRecorders[index]?.reserve?.id;
                this.log.system.error(`failed to stop recorder reserveId: ${reserveId}`);
                this.log.system.error(result.reason);
            }
        }

        if (failedCount > 0) {
            this.log.system.warn(`stopAll finished with ${failedCount} errors out of ${activeRecorders.length}`);
        } else {
            this.log.system.info(`stopAll successfully stopped ${activeRecorders.length} recordings`);
        }
    }

    /**
     * タイマーを再設定する
     */
    public resetTimer(): void {
        if (this.isStopped) {
            return;
        }

        this.log.system.info('reset timer');

        for (const key in this.recordingIndex) {
            this.recordingIndex[key].resetTimer();
        }
    }
}

export default RecordingManageModel;
