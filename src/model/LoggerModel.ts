import * as fs from 'fs';
import { injectable } from 'inversify';
import * as log4js from 'log4js';
import * as path from 'path';
import * as util from 'util';
import { LogConfig } from './IConfigFile';
import ILogger, { ILoggerCategory, LogCategory, LogEntry, LogEntryLevel, LogProcess } from './ILogger';
import ILoggerModel from './ILoggerModel';

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
    private fileLogger: log4js.Logger | null = null;

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

        // ファイル出力設定 (log4js)
        if (this.config.file?.enabled && this.config.file.path) {
            try {
                const logDir = path.dirname(this.config.file.path);
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }

                log4js.configure({
                    appenders: {
                        file: {
                            type: 'file',
                            filename: this.config.file.path,
                            maxLogSize: this.config.file.maxSize || 10 * 1024 * 1024,
                            backups: this.config.file.backups || 5,
                            layout: {
                                type: 'pattern',
                                pattern: '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %m',
                            },
                        },
                    },
                    categories: {
                        default: {
                            appenders: ['file'],
                            level: this.config.level || 'info',
                        },
                    },
                });
                this.fileLogger = log4js.getLogger();
            } catch (err) {
                console.error('Failed to configure file logging:', err);
            }
        }

        this.logger = {
            system: this.createCategory('system'),
            access: this.createCategory('access'),
            stream: this.createCategory('stream'),
            encode: this.createCategory('encode'),
        };
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
            const timeStr = this.formatDate(now);
            const pColor = PROCESS_COLORS[this.currentProcess] || '';
            const lColor = LEVEL_COLORS[level] || '';
            const levelUpper = level.toUpperCase().padEnd(5, ' ');
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

        // 2. ファイル出力 (log4js)
        if (this.fileLogger) {
            const logMsg = `[${this.currentProcess}][${category}] ${formattedMsg}`;
            if (level === 'debug') {
                this.fileLogger.debug(logMsg);
            } else if (level === 'info') {
                this.fileLogger.info(logMsg);
            } else if (level === 'warn') {
                this.fileLogger.warn(logMsg);
            } else if (level === 'error') {
                this.fileLogger.error(logMsg);
            } else if (level === 'fatal') {
                this.fileLogger.fatal(logMsg);
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
