import { DropResult, EitInfo, PmtInfo, TsProbe } from 'arib-probe';
import * as events from 'events';
import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as stream from 'stream';
import DateUtil from '../../../util/DateUtil.js';
import FileUtil from '../../../util/FileUtil.js';
import ILogger from '../../ILogger.js';
import ILoggerModel from '../../ILoggerModel.js';
import IDropCheckerModel from './IDropCheckerModel.js';

@injectable()
class DropCheckerModel implements IDropCheckerModel {
    private log: ILogger;
    private listener: events.EventEmitter = new events.EventEmitter();
    private dest: string | null = null;
    private result: DropResult | null = null;
    private time: Date | null = null;
    private hasError: boolean = false; // パケットチェック中にエラーを検知したか？
    private isFinished: boolean = false; // 終了処理が終わっているか？
    private onFinishPromise: Promise<void> | null = null; // 終了処理の待機用 Promise

    private tsProbe: TsProbe | null = null;

    constructor(@inject('ILoggerModel') logger: ILoggerModel) {
        this.log = logger.getLogger();
    }

    /**
     * チェック開始
     * @param logDirPath: string ログファイル保存先ディレクトリパス
     * @param srcFilePath: string ソースファイル ログファイル名生成に使用する
     * @param readableStream: stream.Readable drop をチェックするストリーム
     * @return Promise<void>
     */
    public async start(logDirPath: string, srcFilePath: string, readableStream: stream.Readable): Promise<void> {
        this.dest = await this.getLogFilePath(logDirPath, srcFilePath);

        // 空ファイル生成
        await FileUtil.touchFile(this.dest);

        this.tsProbe = new TsProbe();

        this.tsProbe.on('packetError', (pid, timecode) => {
            const streamName = this.tsProbe?.getPidName(pid);
            const nameStr = streamName && streamName !== '-' ? `, name: ${streamName}` : '';
            const tcStr = timecode !== null && typeof timecode !== 'undefined' ? `, timecode: ${timecode}` : '';
            void this.appendFile(
                `error: (pid: ${this.pidToString(pid)}${nameStr}, time: ${this.getTime()}${tcStr})\n`,
            ).catch(err => {
                this.log.system.error(`append error: ${this.dest}`);
                this.log.system.error(err);
            });
            this.hasError = true;
        });

        this.tsProbe.on('packetDrop', (pid, counter, expected, timecode) => {
            const streamName = this.tsProbe?.getPidName(pid);
            const nameStr = streamName && streamName !== '-' ? `, name: ${streamName}` : '';
            const tcStr = timecode !== null ? `, timecode: ${timecode}` : '';
            void this.appendFile(
                `drop (pid: ${this.pidToString(pid)}${nameStr}, counter: ${counter}, expected: ${expected}, time: ${this.getTime()}${tcStr})\n`,
            ).catch(err => {
                this.log.system.error(`append error: ${this.dest}`);
                this.log.system.error(err);
            });
            this.hasError = true;
        });

        this.tsProbe.on('packetScrambling', (pid, timecode) => {
            const streamName = this.tsProbe?.getPidName(pid);
            const nameStr = streamName && streamName !== '-' ? `, name: ${streamName}` : '';
            const tcStr = timecode !== null && typeof timecode !== 'undefined' ? `, timecode: ${timecode}` : '';
            void this.appendFile(
                `scrambling (pid: ${this.pidToString(pid)}${nameStr}, time: ${this.getTime()}${tcStr})\n`,
            ).catch(err => {
                this.log.system.error(`append error: ${this.dest}`);
                this.log.system.error(err);
            });
            this.hasError = true;
        });

        this.tsProbe.on('time', time => {
            this.time = time;
        });

        this.tsProbe.on('eit', eit => {
            this.listener.emit('eit', eit);
        });

        this.tsProbe.on('pmt', pmt => {
            this.listener.emit('pmt', pmt);
        });

        this.tsProbe.on('finish', () => {
            void this.onFinish();
        });

        readableStream.pipe(this.tsProbe);

        // readableStream がエラーで終了したら停止
        stream.finished(readableStream, {}, async err => {
            if (err) {
                this.log.system.error(`drop log check stream error: ${srcFilePath}`);
                await this.stop();
            }
        });
    }

    /**
     * 終了処理
     * @returns Promise<void>
     */
    private onFinish(): Promise<void> {
        if (this.onFinishPromise !== null) {
            return this.onFinishPromise;
        }

        this.onFinishPromise = (async () => {
            if (this.isFinished === true) {
                return;
            }
            this.isFinished = true;

            if (this.tsProbe === null) {
                return;
            }
            this.tsProbe.removeAllListeners('finish');

            const result = this.tsProbe.getResult();

            if (this.hasError) {
                await this.appendFile('\n').catch(err => {
                    this.log.system.error(`append error: ${this.dest}`);
                    this.log.system.error(err);
                });
            }
            for (const pid of Object.keys(result)) {
                const pidNum = parseInt(pid, 10);
                const stat = result[pidNum];
                await this.appendFile(
                    `pid: ${this.pidToString(pidNum)}, error: ${stat.error}, drop: ${stat.drop}, scrambling: ${
                        stat.scrambling
                    }, packet: ${stat.packet}, name: ${stat.name}\n`,
                ).catch(err => {
                    this.log.system.error(`append error: ${this.dest}`);
                    this.log.system.error(err);
                });
            }

            this.result = result;
            this.listener.emit(DropCheckerModel.FINISH_EVENT);
        })();

        return this.onFinishPromise;
    }

    /**
     * ログファイル保存先を取得する
     * @param logDirPath: string ログファイル保存先ディレクトリパス
     * @param srcFilePath: string ソースファイル ログファイル名生成に使用する
     * @param conflict: number 重複数
     * @return Promise<string>
     */
    private async getLogFilePath(logDirPath: string, srcFilePath: string, conflict: number = 0): Promise<string> {
        let filePath = path.join(logDirPath, path.basename(srcFilePath));
        if (conflict > 0) {
            filePath += `(${conflict})`;
        }
        filePath += '.log';

        // ディレクトリが存在するか確認
        try {
            await FileUtil.access(logDirPath, fs.constants.R_OK | fs.constants.W_OK);
        } catch (err: any) {
            if (typeof err.code !== 'undefined' && err.code === 'ENOENT') {
                // ディレクトリが存在しないので作成する
                this.log.system.info(`mkdirp: ${logDirPath}`);
                await FileUtil.mkdir(logDirPath);
            } else {
                // アクセス権に Read or Write が無い
                this.log.system.fatal(`dir permission error: ${logDirPath}`);
                this.log.system.fatal(err);
                throw err;
            }
        }

        // 同名のファイル名が存在するか確認
        try {
            await FileUtil.stat(filePath);

            return this.getLogFilePath(logDirPath, srcFilePath, conflict + 1);
        } catch (err: any) {
            return filePath;
        }
    }

    /**
     * log 追記
     * @param str
     * @return Promise<void>
     */
    private async appendFile(str: string): Promise<void> {
        if (this.dest === null) {
            throw new Error('LogFilePathIsNull');
        }

        await FileUtil.appendFile(this.dest, str);
    }

    /**
     * pid を文字列に変換
     * @param pid: number
     * @return string
     */
    private pidToString(pid: number): string {
        return '0x' + `${('000' + pid.toString(16)).slice(-4)}`.toUpperCase();
    }

    /**
     * get time
     * @return string
     */
    private getTime(): string {
        return this.time === null ? '-' : DateUtil.format(this.time, 'yyyy/MM/dd hh:mm:ss');
    }

    /**
     * 削除
     */
    public async stop(): Promise<void> {
        this.log.system.info(`stop drop check: ${this.dest}`);

        // 終了処理
        await this.onFinish().catch(err => {
            this.log.system.error(`finish drop check error: ${this.dest}`);
            this.log.system.error(err);
        });

        if (this.tsProbe !== null) {
            this.tsProbe.removeAllListeners();
            this.tsProbe = null;
        }
    }

    /**
     * ログファイルパス返す
     * @return string | null
     */
    public getFilePath(): string | null {
        return this.dest;
    }

    /**
     * 結果の取得
     * @return Promise<DropResult>
     */
    public async getResult(): Promise<DropResult> {
        if (this.dest === null) {
            throw new Error('DestIsNull');
        }

        await this.setResult();
        if (this.result === null) {
            throw new Error('GetDropResultError');
        }

        return this.result;
    }

    /**
     * EIT / PMT などのイベントリスナーを登録
     */
    public on(event: 'eit', listener: (eit: EitInfo) => void): void;
    public on(event: 'pmt', listener: (pmt: PmtInfo) => void): void;
    public on(event: string, listener: (...args: any[]) => void): void {
        this.listener.on(event, listener);
    }

    /**
     * EIT / PMT などのイベントリスナーを解除
     */
    public off(event: 'eit', listener: (eit: EitInfo) => void): void;
    public off(event: 'pmt', listener: (pmt: PmtInfo) => void): void;
    public off(event: string, listener: (...args: any[]) => void): void {
        this.listener.off(event, listener);
    }

    /**
     * finish を待って結果を result へ格納する
     */
    private async setResult(): Promise<void> {
        if (this.result !== null) {
            return;
        }

        if (this.onFinishPromise !== null) {
            await this.onFinishPromise;

            return;
        }

        await new Promise<void>((resolve, reject) => {
            if (this.result !== null) {
                resolve();

                return;
            }

            this.listener.once(DropCheckerModel.FINISH_EVENT, () => {
                resolve();
            });

            setTimeout(() => {
                this.listener.removeAllListeners();
                reject(new Error('GetResultTimeout'));
            }, 10 * 1000);
        });
    }
}

namespace DropCheckerModel {
    export const FINISH_EVENT = 'finish_event';
}

export default DropCheckerModel;
