import { ChildProcess } from 'node:child_process';
import * as events from 'node:events';
import * as path from 'node:path';
import * as apid from '../../../../api.js';
import FileUtil from '../../../util/FileUtil.js';
import ProcessUtil from '../../../util/ProcessUtil.js';
import Util from '../../../util/Util.js';
import IVideoUtil, { VideoInfo } from '../../api/video/IVideoUtil.js';
import IChannelDB from '../../db/IChannelDB.js';
import IRecordedDB from '../../db/IRecordedDB.js';
import IVideoFileDB from '../../db/IVideoFileDB.js';
import IEncodeEvent from '../../event/IEncodeEvent.js';
import IConfiguration from '../../IConfiguration.js';
import ILogger from '../../ILogger.js';
import ILoggerModel from '../../ILoggerModel.js';
import IEncodeFileManageModel from './IEncodeFileManageModel.js';
import IEncodeProcessManageModel from './IEncodeProcessManageModel.js';
import { EncodeOption, EncodeProgressInfo, IEncoderModel } from './IEncoderModel.js';
import IRecordingUtilModel from '../../operator/recording/IRecordingUtilModel.js';

class EncoderModel implements IEncoderModel {
    private log: ILogger;
    private configure: IConfiguration;
    private processManager: IEncodeProcessManageModel;
    private fileManager: IEncodeFileManageModel;
    private videoFileDB: IVideoFileDB;
    private recordedDB: IRecordedDB;
    private channelDB: IChannelDB;
    private videoUtil: IVideoUtil;
    private encodeEvent: IEncodeEvent;
    private recordingUtil: IRecordingUtilModel;

    private listener: events.EventEmitter = new events.EventEmitter();

    private encodeOption: EncodeOption | null = null; // エンコード情報
    private childProcess: ChildProcess | null = null; // エンコードプロセス
    private watchdogTimerId: NodeJS.Timeout | null = null; // 進捗ストール監視タイマー
    private lastProgressAt: number = 0; // 最終進捗前進時刻
    private lastProgressPercent: number = -1; // 前回の進捗パーセント
    private lastEncodedSeconds: number = -1; // 前回のエンコード済み動画秒数 (time=)
    private isCanceled: boolean = false; // キャンセルが呼び出されたか?
    private progressInfo: EncodeProgressInfo | null = null;
    private ffmpegCommand: string | null = null; // 実行されたFFmpegコマンドライン

    constructor(
        logger: ILoggerModel,
        configure: IConfiguration,
        processManager: IEncodeProcessManageModel,
        fileManager: IEncodeFileManageModel,
        videoFileDB: IVideoFileDB,
        recordedDB: IRecordedDB,
        channelDB: IChannelDB,
        videoUtil: IVideoUtil,
        encodeEvent: IEncodeEvent,
        recordingUtil: IRecordingUtilModel,
    ) {
        this.log = logger.getLogger();
        this.configure = configure;
        this.processManager = processManager;
        this.fileManager = fileManager;
        this.videoFileDB = videoFileDB;
        this.recordedDB = recordedDB;
        this.channelDB = channelDB;
        this.videoUtil = videoUtil;
        this.encodeEvent = encodeEvent;
        this.recordingUtil = recordingUtil;
    }

    /**
     * エンコードに必要な設定をセットする
     * @param encodeOption: EncodeOption
     */
    public setOption(encodeOption: EncodeOption): void {
        if (this.encodeOption !== null) {
            this.log.encode.error('encodeOption is not null');
            throw new Error('EncodeSetOptionError');
        }

        this.encodeOption = encodeOption;
    }

    /**
     * エンコード終了イベント登録
     * @param callback
     */
    public setOnFinish(callback: (isError: boolean, outputFilePath: string | null) => void): void {
        this.listener.once(EncoderModel.ENCODE_FINISH_EVENT, (isError: boolean, outputFilePath: string | null) => {
            callback(isError, outputFilePath);
        });
    }

    /**
     * エンコード開始
     */
    public async start(): Promise<void> {
        if (this.encodeOption === null) {
            this.log.encode.error('encodeOption is null');
            throw new Error('EncodeOptionIsNull');
        }

        // エンコード元ファイルの情報を取得
        const video = await this.videoFileDB.findId(this.encodeOption.sourceVideoFileId);
        if (video === null) {
            throw new Error('VideoFileIdIsNotFound');
        }

        // 番組情報を取得する
        const recorded = await this.recordedDB.findId(this.encodeOption.recordedId);
        if (recorded === null) {
            throw new Error('RecordedIsNotFound');
        }

        // 放送局情報を取得する (見つからない場合でもエンコードは続行)
        const channel = await this.channelDB.findId(recorded.channelId);

        // ソースビデオファイルのファイルパスを生成する
        const inputFilePath = await this.videoUtil.getFullFilePathFromId(this.encodeOption.sourceVideoFileId);
        if (inputFilePath === null) {
            throw new Error('VideoPathIsNotFound');
        }

        // ソースビデオファイルの存在を確認
        try {
            await FileUtil.stat(inputFilePath);
        } catch (err: any) {
            this.log.encode.error(`video file is not found: ${inputFilePath}`);
            throw err;
        }

        // エンコードコマンド設定を探す
        const encodeCmd = this.configure.getConfig().encode.presets.find(enc => {
            return enc.name === this.encodeOption?.mode;
        });
        if (typeof encodeCmd === 'undefined') {
            throw new Error('EncodeCommandIsNotFound');
        }

        // 出力先ディレクトリパスを取得する
        const outputDirPath = typeof encodeCmd.suffix === 'undefined' ? null : await this.getDirPath(this.encodeOption);

        // 出力先ディレクトリの存在確認 & 作成
        if (outputDirPath !== null) {
            try {
                await FileUtil.stat(outputDirPath);
            } catch (e: any) {
                // ディレクトリが存在しなければ作成する
                this.log.encode.info(`mkdirp: ${outputDirPath}`);
                await FileUtil.mkdir(outputDirPath);
            }
        }

        // 出力先をファイルパスを生成する
        const outputFilePath =
            outputDirPath === null || typeof encodeCmd.suffix === 'undefined'
                ? null
                : await this.fileManager.getFilePath(outputDirPath, inputFilePath, encodeCmd.suffix);

        const config = this.configure.getConfig();

        // DIR
        let dir: string = '';
        if (typeof encodeCmd.suffix === 'undefined' && typeof this.encodeOption.directory !== 'undefined') {
            dir = this.encodeOption.directory;
        } else if (outputFilePath !== null) {
            dir = outputFilePath;
        }

        // エンコード開始
        this.log.encode.info(
            `encode start. mode: ${this.encodeOption.mode} name: ${recorded.name} file: ${inputFilePath} -> ${outputFilePath}`,
        );
        this.log.encode.info(`encodeId: ${this.encodeOption.encodeId}`);
        this.log.encode.info(`encodeCmd.cmd: ${encodeCmd.cmd}`);
        this.log.encode.info(`encodeCmd.suffix: ${encodeCmd.suffix}`);
        if (typeof this.encodeOption.directory !== 'undefined') {
            this.log.encode.info(`queueItem.directory: ${this.encodeOption.directory}`);
        }
        this.log.encode.info(`outputFilePath: ${outputFilePath}`);

        // 字幕埋め込みフラグの判定 (「字幕スーパー」検出時はスキップ)
        let isSubtitleEnabled = !!encodeCmd.subtitle;
        if (isSubtitleEnabled && config.encode.skipSubtitleForSuperimpose) {
            const fullText = `${recorded.name} ${recorded.description || ''} ${recorded.extended || ''}`;
            if (fullText.includes('字幕スーパー')) {
                isSubtitleEnabled = false;
                this.log.encode.info(
                    `skip subtitle embedding: detected "字幕スーパー" in recorded info (encodeId: ${this.encodeOption.encodeId}, recordedId: ${recorded.id})`,
                );
            }
        }

        // cmd 内の %FFMPEG%, %FFPROBE% マクロを置換
        const cmd = encodeCmd.cmd
            .replace(/%FFMPEG%/g, config.encode.binaries.ffmpeg)
            .replace(/%FFPROBE%/g, config.encode.binaries.ffprobe);

        // プロセスの生成
        this.childProcess = await this.processManager.create({
            input: inputFilePath,
            output: outputFilePath,
            cmd,
            priority: EncoderModel.ENCODE_PRIPORITY,
            spawnOption: {
                env: {
                    ...process.env,
                    RECORDEDID: recorded.id.toString(10),
                    INPUT: inputFilePath,
                    OUTPUT: outputFilePath === null ? '' : outputFilePath,
                    DIR: dir,
                    SUBDIR: this.encodeOption.directory || '',
                    FFMPEG: config.encode.binaries.ffmpeg,
                    FFPROBE: config.encode.binaries.ffprobe,
                    NAME: recorded.name,
                    HALF_WIDTH_NAME: recorded.halfWidthName,
                    DESCRIPTION: recorded.description || '',
                    HALF_WIDTH_DESCRIPTION: recorded.halfWidthDescription || '',
                    EXTENDED: recorded.extended || '',
                    HALF_WIDTH_EXTENDED: recorded.halfWidthExtended || '',
                    VIDEOTYPE: recorded.videoType || '',
                    VIDEORESOLUTION: recorded.videoResolution || '',
                    VIDEOSTREAMCONTENT:
                        typeof recorded.videoStreamContent === 'number' ? recorded.videoStreamContent.toString(10) : '',
                    VIDEOCOMPONENTTYPE:
                        typeof recorded.videoComponentType === 'number' ? recorded.videoComponentType.toString(10) : '',
                    AUDIOSAMPLINGRATE:
                        typeof recorded.audioSamplingRate === 'number' ? recorded.audioSamplingRate.toString(10) : '',
                    AUDIOCOMPONENTTYPE:
                        typeof recorded.audioComponentType === 'number' ? recorded.audioComponentType.toString(10) : '',
                    CHANNELID: typeof recorded.channelId === 'number' ? recorded.channelId.toString(10) : '',
                    CHANNELNAME: channel !== null && typeof channel.name === 'string' ? channel.name : '',
                    HALF_WIDTH_CHANNELNAME:
                        channel !== null && typeof channel.halfWidthName === 'string' ? channel.halfWidthName : '',
                    GENRE1: typeof recorded.genre1 === 'number' ? recorded.genre1.toString(10) : '',
                    SUBGENRE1: typeof recorded.subGenre1 === 'number' ? recorded.subGenre1.toString(10) : '',
                    GENRE2: typeof recorded.genre2 === 'number' ? recorded.genre2.toString(10) : '',
                    SUBGENRE2: typeof recorded.subGenre2 === 'number' ? recorded.subGenre2.toString(10) : '',
                    GENRE3: typeof recorded.genre3 === 'number' ? recorded.genre3.toString(10) : '',
                    SUBGENRE3: typeof recorded.subGenre3 === 'number' ? recorded.subGenre3.toString(10) : '',
                    START_AT: recorded.startAt.toString(10),
                    END_AT: recorded.endAt.toString(10),
                    DROPLOG_ID: recorded.dropLogFile?.id.toString(10) || '',
                    DROPLOG_PATH: recorded.dropLogFile?.filePath || '',
                    ERROR_CNT: recorded.dropLogFile?.errorCnt.toString(10) || '',
                    DROP_CNT: recorded.dropLogFile?.dropCnt.toString(10) || '',
                    SCRAMBLING_CNT: recorded.dropLogFile?.scramblingCnt.toString(10) || '',
                    SUBTITLE: isSubtitleEnabled ? 'true' : 'false',
                    SKIP_SUBTITLE_FOR_SUPERIMPOSE: config.encode.skipSubtitleForSuperimpose ? 'true' : 'false',
                },
            },
        });

        this.lastProgressAt = Date.now();
        this.lastProgressPercent = -1;
        this.lastEncodedSeconds = -1;

        // 進捗ストール監視（Progress Watchdog）
        // 10並列エンコード等で極端に低速化しても、進捗（percent または time=）が前進している限り絶対にキャンセルしない。
        // 進捗が一定時間（デフォルト: 10分）一度も前進しなくなった場合のみ、ハングアップまたは無限ループと判定して安全に回収。
        const stallTimeoutSeconds =
            encodeCmd.stallTimeoutSeconds ??
            config.encode.stallTimeoutSeconds ??
            EncoderModel.DEFAULT_STALL_TIMEOUT_MS / 1000;
        const stallTimeoutMs = Math.max(stallTimeoutSeconds * 1000, 60000); // 最低1分保証

        this.watchdogTimerId = setInterval(async () => {
            if (this.encodeOption === null || this.isCanceled) {
                return;
            }

            const elapsedSinceProgress = Date.now() - this.lastProgressAt;
            if (elapsedSinceProgress >= stallTimeoutMs) {
                const elapsedMin = (elapsedSinceProgress / 60000).toFixed(1);
                this.log.encode.error(
                    `encode process is stalled (no forward progress for ${elapsedMin}min >= ${Math.round(stallTimeoutMs / 60000)}min, percent: ${this.progressInfo?.percent ?? 0}%, lastSeconds: ${this.lastEncodedSeconds}s): ${this.encodeOption.encodeId} ${outputFilePath}`,
                );
                await this.cancel();
            }
        }, EncoderModel.WATCHDOG_CHECK_INTERVAL_MS);

        /**
         * プロセスの設定
         */
        // debug 用 & エラー時ログ用バッファ
        const stderrBuffer: string[] = [];
        if (this.childProcess.stderr !== null) {
            this.childProcess.stderr.on('data', data => {
                const str = String(data);
                this.log.encode.debug(str);
                stderrBuffer.push(str);
                if (stderrBuffer.length > 50) stderrBuffer.shift();

                // stderr からエンコード時間進捗 (time=) を検知して前進を記録
                const sec = this.parseTimeSeconds(str);
                if (sec !== null) {
                    this.markProgressForward(undefined, sec);
                }

                // FFmpeg 実行コマンド行を検知して INFO ログに記録
                if (str.includes('FFmpeg command:')) {
                    const lines = str.split('\n');
                    for (const line of lines) {
                        if (line.includes('FFmpeg command:')) {
                            this.ffmpegCommand = line.trim();
                            this.log.encode.info(this.ffmpegCommand);
                        }
                    }
                }
            });
        }

        // 進捗情報更新用
        if (this.childProcess.stdout !== null) {
            let videoInfo: VideoInfo | null = null;
            try {
                videoInfo = await this.videoUtil.getInfo(inputFilePath);
            } catch (err: any) {
                this.log.encode.error(`get encode vidoe file info: ${inputFilePath}`);
                this.log.encode.error(err);
            }

            // エンコードプロセスの標準出力から進捗情報を取り出す
            this.childProcess.stdout.on('data', data => {
                if (videoInfo !== null) {
                    try {
                        this.updateEncodingProgressInfo(data);
                    } catch (err: any) {
                        // error
                    }
                }
            });
        }

        // プロセス終了処理
        this.childProcess.on('exit', async (code, signal) => {
            await this.childEndProcessing(code, signal, outputFilePath, stderrBuffer);
        });

        // プロセスの即時終了対応
        if (ProcessUtil.isExited(this.childProcess) === true) {
            await this.childEndProcessing(
                this.childProcess.exitCode,
                this.childProcess.signalCode,
                outputFilePath,
                stderrBuffer,
            );
            this.childProcess.removeAllListeners();
        }
    }

    /**
     * queueItem で指定された dir パスを取得する
     * @param queueItem: EncodeOption
     * @return string
     */
    private async getDirPath(queueItem: EncodeOption): Promise<string> {
        const parentDir = this.videoUtil.getParentDirPath(queueItem.parentDir);
        if (parentDir === null) {
            this.log.encode.error(`parent dir config is not found: ${queueItem.parentDir}`);
            throw new Error('parentDirIsNotFound');
        }

        if (typeof queueItem.directory !== 'undefined' && queueItem.directory.length > 0) {
            const recorded = await this.recordedDB.findId(queueItem.recordedId);
            if (recorded !== null) {
                queueItem.directory = await this.recordingUtil.formatFilePathString(queueItem.directory, recorded);
            }
        }

        return typeof queueItem.directory === 'undefined' ? parentDir : path.join(parentDir, queueItem.directory);
    }

    /**
     * FFmpeg ログ行から time=HH:MM:SS.ms を秒数(float)にパースする
     */
    private parseTimeSeconds(logText: string): number | null {
        const match = logText.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (match) {
            const h = parseFloat(match[1]) || 0;
            const m = parseFloat(match[2]) || 0;
            const s = parseFloat(match[3]) || 0;
            return h * 3600 + m * 60 + s;
        }
        return null;
    }

    /**
     * 進捗前進を検知してストール監視タイマーをリセット
     * @param percent 進捗パーセント
     * @param encodedSeconds エンコード済み動画秒数 (time=)
     */
    private markProgressForward(percent?: number, encodedSeconds?: number | null): void {
        let isForward = false;
        if (typeof percent === 'number' && percent > this.lastProgressPercent) {
            this.lastProgressPercent = percent;
            isForward = true;
        }
        if (typeof encodedSeconds === 'number' && encodedSeconds > this.lastEncodedSeconds) {
            this.lastEncodedSeconds = encodedSeconds;
            isForward = true;
        }
        if (isForward) {
            this.lastProgressAt = Date.now();
        }
    }

    /**
     * エンコード進捗情報更新
     * @param data: エンコードプロセスの標準出力
     * @param encodeId: apid.EncodeId
     */
    private updateEncodingProgressInfo(data: any): void {
        if (this.encodeOption === null) {
            return;
        }

        const logs = String(data).split('\n');
        for (let j = 0; j < logs.length; j++) {
            if (logs[j] != '') {
                try {
                    const log = JSON.parse(String(logs[j]));
                    this.log.encode.debug(log);
                    if (log.type === 'progress' && typeof log.percent === 'number' && typeof log.log === 'string') {
                        this.progressInfo = {
                            percent: log.percent,
                            log: log.log,
                        };

                        // 進捗パーセントまたは time= の前進を検知してストールタイマーをリセット
                        this.markProgressForward(log.percent, this.parseTimeSeconds(log.log));

                        // エンコード進捗変更通知
                        this.encodeEvent.emitUpdateEncodeProgress();
                    }
                } catch {
                    // JSON parse error
                }
            }
        }
    }

    /**
     * エンコードプロセス終了処理
     * @param code number | null
     * @param signal NodeJS.Signals | null
     * @param outputFilePath 出力先をファイルパス
     * @param queueItem EncodeQueueItem
     */
    private async childEndProcessing(
        code: number | null,
        signal: NodeJS.Signals | null,
        outputFilePath: string | null,
        stderrBuffer?: string[],
    ): Promise<void> {
        // exit code
        this.log.encode.info(`exit code: ${code}, signal: ${signal}`);

        // タイムアウトタイマークリア
        this.clearTimers();

        // ファイルパスの登録を削除
        if (outputFilePath !== null) {
            this.fileManager.release(outputFilePath);
        }

        if (this.encodeOption === null) {
            this.log.encode.error('encodeOptionIsNull');

            return;
        }

        let isError = true;
        if (this.isCanceled === true) {
            // キャンセルされた
            this.log.encode.info(`canceled encode: ${this.encodeOption.encodeId}`);
        } else if (code !== 0) {
            // エンコードが正常終了しなかった
            this.log.encode.error(`encode failed: ${this.encodeOption.encodeId} ${outputFilePath}`);
            if (this.ffmpegCommand !== null) {
                this.log.encode.error(`failed ffmpeg command: ${this.ffmpegCommand}`);
            }
            if (stderrBuffer && stderrBuffer.length > 0) {
                this.log.encode.error(`encode error output:\n${stderrBuffer.join('')}`);
            }
        } else {
            // エンコード正常終了
            this.log.encode.info(`Successfully encode: ${this.encodeOption.encodeId} ${outputFilePath}`);

            isError = false;
        }

        if (isError === true) {
            // 出力ファイルを削除
            if (outputFilePath !== null) {
                this.log.encode.info(`delete encode output file: ${outputFilePath}`);
                await Util.sleep(1000);

                await FileUtil.unlink(outputFilePath).catch(err => {
                    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
                        this.log.encode.error(`delete encode output file failed: ${outputFilePath}`);
                        this.log.encode.error(err);
                    }
                });
            }
        }

        // エンコードプロセスの終了を通知
        this.listener.emit(EncoderModel.ENCODE_FINISH_EVENT, isError, outputFilePath);
        this.listener.removeAllListeners();
    }

    /**
     * キャンセル処理
     */
    public async cancel(): Promise<void> {
        if (this.encodeOption === null) {
            return;
        }

        this.clearTimers();
        this.log.encode.info(`cancel encode: ${this.encodeOption.encodeId}`);

        // プロセスが実行されていれば削除する
        if (this.childProcess !== null) {
            this.log.encode.info(
                `kill encode process encodeId: ${this.encodeOption.encodeId}, pid: ${this.childProcess.pid}`,
            );

            this.isCanceled = true;
            await ProcessUtil.kill(this.childProcess).catch(err => {
                this.log.encode.error(`kill encode process failed: ${this.encodeOption?.encodeId}`);
                this.log.encode.error(err);
            });
        }
    }

    /**
     * 動作中の監視タイマー (ストール監視・絶対時間上限) を解除する
     */
    private clearTimers(): void {
        if (this.watchdogTimerId !== null) {
            clearInterval(this.watchdogTimerId);
            this.watchdogTimerId = null;
        }
    }

    /**
     * セットされたエンコードオプションを返す
     * @returns EncodeOption | null
     */
    public getEncodeOption(): EncodeOption | null {
        return this.encodeOption;
    }

    /**
     * エンコードの進捗情報を返す
     * @returns EncodeProgressInfo | null
     */
    public getProgressInfo(): EncodeProgressInfo | null {
        return this.progressInfo;
    }

    /**
     * encodeId を返す
     * @returns apid.EncodeId | null
     */
    public getEncodeId(): apid.EncodeId | null {
        return this.encodeOption === null ? null : this.encodeOption.encodeId;
    }
}

namespace EncoderModel {
    export const ENCODE_FINISH_EVENT = 'encodeFinishEvent';
    export const ENCODE_PRIPORITY = 10;
    /** 進捗ストール検知のデフォルト閾値 (ミリ秒): 10分 */
    export const DEFAULT_STALL_TIMEOUT_MS = 10 * 60 * 1000;
    /** ウォッチドッグの監視チェック周期 (ミリ秒): 30秒 */
    export const WATCHDOG_CHECK_INTERVAL_MS = 30 * 1000;
}

export default EncoderModel;
