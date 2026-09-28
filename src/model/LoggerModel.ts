import * as fs from 'fs';
import { injectable } from 'inversify';
import * as path from 'path';
import * as rfs from 'rotating-file-stream';
import * as util from 'util';
import { LogConfig } from './IConfigFile.js';
import ILogger, { ILoggerCategory, LogCategory, LogEntry, LogEntryLevel, LogProcess } from './ILogger.js';
import ILoggerModel from './ILoggerModel.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LEVEL_PRIORITY: Record<LogEntryLevel, number> = {
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    fatal: 5,
};

const PROCESS_COLORS: Record<string, string> = {
    Operator: '\x1b[36m',
    Service: '\x1b[32m',
    EPGUpdater: '\x1b[35m',
};

const LEVEL_COLORS: Record<LogEntryLevel, string> = {
    debug: '\x1b[90m',
    info: '\x1b[34m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    fatal: '\x1b[41m\x1b[97m',
};

const RESET = '\x1b[0m';
const GRAY = '\x1b[90m';

let logSequenceId = 0;

/**
 * Logger
 */
@injectable()
export default class LoggerModel implements ILoggerModel {
    private logger: ILogger | null = null;
    private listeners: Set<(entry: LogEntry) => void> = new Set();
    private currentProcess: LogProcess = 'Operator';
    private config: LogConfig = {
        level: 'info',
        console: true,
        file: {
            enabled: true,
            path: path.join(__dirname, '..', '..', 'logs', 'epgdeck.log'),
            maxSize: 10 * 1024 * 1024,
            backups: 5,
        },
        bufferSize: 1000,
    };
    private fileStream: rfs.RotatingFileStream | null = null;
    private consecutiveFileErrors: number = 0;
    private circuitBreakerOpenUntil: number = 0;
    public maxConsecutiveErrors: number = 3;
    public circuitBreakerTimeoutMs: number = 30000;

    /**
     * 初期設定
     */
    public initialize(processName?: LogProcess | string, logConfig?: LogConfig): void {
        if (typeof processName === 'string') {
            if (processName === 'Service' || processName === 'EPGUpdater' || processName === 'Operator') {
                this.currentProcess = processName;
            }
        }

        if (logConfig) {
            this.config = {
                ...this.config,
                ...logConfig,
                file: {
                    ...this.config.file,
                    ...logConfig.file,
                },
            };
        }

        this.setupFileStream();

        this.logger = {
            system: this.createCategory('system'),
            access: this.createCategory('access'),
            stream: this.createCategory('stream'),
            encode: this.createCategory('encode'),
        };
    }

    /**
     * ファイルストリームの安全な初期化
     */
    private setupFileStream(): void {
        this.safeDestroyFileStream();

        if (!this.config.file?.enabled || !this.config.file.path) {
            return;
        }

        try {
            const logDir = path.dirname(this.config.file.path);
            const logFileName = path.basename(this.config.file.path);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const maxSize = this.config.file.maxSize || 10 * 1024 * 1024;
            const backups = this.config.file.backups || 5;

            const stream = rfs.createStream(logFileName, {
                path: logDir,
                size: `${maxSize}B` as rfs.FileSize,
                rotate: backups,
            });

            stream.on('error', err => {
                this.handleFileError(err);
            });

            this.fileStream = stream;
        } catch (err) {
            this.handleFileError(err);
        }
    }

    /**
     * ファイルストリームの安全な破棄
     */
    private safeDestroyFileStream(): void {
        if (this.fileStream) {
            const stream = this.fileStream;
            this.fileStream = null;
            try {
                stream.removeAllListeners('error');
                stream.on('error', () => {});
                stream.destroy();
            } catch {
                // ignore
            }
        }
    }

    /**
     * ファイルエラー発生時のサーキットブレーカー処理
     */
    private handleFileError(err: any): void {
        this.consecutiveFileErrors++;
        console.error(
            `[LoggerModel] File logging error (${this.consecutiveFileErrors}/${this.maxConsecutiveErrors}):`,
            err?.message || err,
        );

        if (this.consecutiveFileErrors >= this.maxConsecutiveErrors) {
            this.circuitBreakerOpenUntil = Date.now() + this.circuitBreakerTimeoutMs;
            console.error(
                `[LoggerModel] File logging suspended for ${this.circuitBreakerTimeoutMs / 1000}s due to consecutive write errors`,
            );
            this.safeDestroyFileStream();
        }
    }

    /**
     * サーキットブレーカー開放状態の確認
     */
    public isCircuitBreakerOpen(): boolean {
        return this.circuitBreakerOpenUntil > 0 && Date.now() < this.circuitBreakerOpenUntil;
    }

    /**
     * Logger を返す
     */
    public getLogger(): ILogger {
        if (this.logger === null) {
            this.initialize();
        }

        return this.logger!;
    }

    public onLog(listener: (entry: LogEntry) => void): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    public getLogConfig(): LogConfig {
        return this.config;
    }

    private createCategory(category: LogCategory): ILoggerCategory {
        const createLevelMethod = (level: LogEntryLevel) => {
            return (message: any, ...args: any[]) => {
                this.writeLog(category, level, message, args);
            };
        };

        return {
            debug: createLevelMethod('debug'),
            info: createLevelMethod('info'),
            warn: createLevelMethod('warn'),
            error: createLevelMethod('error'),
            fatal: createLevelMethod('fatal'),
            isLevelEnabled: (levelStr: string) => {
                const configLevel = this.config.level || 'info';
                const target = LEVEL_PRIORITY[levelStr.toLowerCase() as LogEntryLevel] || 0;
                const current = LEVEL_PRIORITY[configLevel as LogEntryLevel] || 2;

                return target >= current;
            },
        };
    }

    private writeLog(category: LogCategory, level: LogEntryLevel, message: any, args: any[]): void {
        const configLevel = (this.config.level || 'info').toLowerCase() as LogEntryLevel;
        const currentPriority = LEVEL_PRIORITY[configLevel] || 2;
        const targetPriority = LEVEL_PRIORITY[level] || 2;

        if (targetPriority < currentPriority) {
            return;
        }

        const now = new Date();
        const timeStr = this.formatDate(now);
        const levelUpper = level.toUpperCase();
        const formattedMsg = typeof message === 'string' && args.length === 0 ? message : util.format(message, ...args);

        const entry: LogEntry = {
            id: ++logSequenceId,
            timestamp: now.getTime(),
            process: this.currentProcess,
            category,
            level,
            message: formattedMsg,
        };

        // 1. コンソール出力
        if (this.config.console !== false) {
            const pColor = PROCESS_COLORS[this.currentProcess] || '';
            const lColor = LEVEL_COLORS[level] || '';
            const tag = `${pColor}[${this.currentProcess}]${RESET}${lColor}[${levelUpper}]${RESET} [${category}]`;

            const output = `${GRAY}${timeStr}${RESET} ${tag} ${formattedMsg}`;
            if (level === 'error' || level === 'fatal') {
                console.error(output);
            } else if (level === 'warn') {
                console.warn(output);
            } else {
                console.log(output);
            }
        }

        // 2. ファイル出力 (rotating-file-stream)
        if (this.config.file?.enabled && this.config.file.path) {
            if (this.circuitBreakerOpenUntil > 0) {
                if (Date.now() < this.circuitBreakerOpenUntil) {
                    // サーキットブレーカー開放中（ファイル出力をスキップ）
                } else {
                    // 遮断期間終了：再試行
                    this.circuitBreakerOpenUntil = 0;
                    this.consecutiveFileErrors = 0;
                    this.setupFileStream();
                }
            }

            if (this.fileStream && !this.fileStream.destroyed) {
                const logLine = `${timeStr} [${levelUpper}] [${this.currentProcess}][${category}] ${formattedMsg}\n`;
                try {
                    this.fileStream.write(logLine, err => {
                        if (err) {
                            this.handleFileError(err);
                        } else {
                            this.consecutiveFileErrors = 0;
                        }
                    });
                } catch (err) {
                    this.handleFileError(err);
                }
            }
        }

        // 3. リスナー通知
        for (const listener of this.listeners) {
            try {
                listener(entry);
            } catch {
                // ignore
            }
        }
    }

    /**
     * ファイルストリームを安全に終了・フラッシュ
     */
    public async close(): Promise<void> {
        this.circuitBreakerOpenUntil = 0;
        this.consecutiveFileErrors = 0;
        if (this.fileStream) {
            const stream = this.fileStream;
            this.fileStream = null;
            await new Promise<void>(resolve => {
                try {
                    stream.removeAllListeners('error');
                    stream.on('error', () => resolve());
                    stream.end(() => resolve());
                } catch {
                    resolve();
                }
            });
        }
    }

    private formatDate(d: Date): string {
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        const ms = String(d.getMilliseconds()).padStart(3, '0');

        return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
    }
}
