import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import IConfigFile from '../../IConfigFile';
import IConfiguration from '../../IConfiguration';
import { LogCategory, LogEntry, LogEntryLevel, LogProcess } from '../../ILogger';
import ILoggerModel from '../../ILoggerModel';
import ISocketIOManageModel from '../socketio/ISocketIOManageModel';
import ILogManageModel, { GetLogsOption } from './ILogManageModel';

const LEVEL_PRIORITY: Record<LogEntryLevel, number> = {
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
    fatal: 5,
};

let bufferIdSeq = 0;

@injectable()
export default class LogManageModel implements ILogManageModel {
    private buffer: LogEntry[] = [];
    private maxBufferSize: number = 1000;
    private logFilePath: string | null = null;
    private socketIO: ISocketIOManageModel;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('ISocketIOManageModel') socketIO: ISocketIOManageModel,
    ) {
        this.socketIO = socketIO;
        const config: IConfigFile = configuration.getConfig();
        if (config.log?.bufferSize) {
            this.maxBufferSize = config.log.bufferSize;
        }
        if (config.log?.file?.enabled !== false && config.log?.file?.path) {
            this.logFilePath = config.log.file.path;
        }

        // 既存のログファイルがあれば初期ロード
        this.loadExistingLogFile();

        // Service プロセス自身のログをバッファに流し込む
        logger.onLog(entry => {
            this.push(entry);
        });
    }

    private loadExistingLogFile(): void {
        if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
            return;
        }

        try {
            const content = fs.readFileSync(this.logFilePath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            const tailLines = lines.slice(Math.max(0, lines.length - this.maxBufferSize));

            const logRegex =
                /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?)\s+\[([A-Z]+)\]\s*(?:\[(Operator|Service|EPGUpdater)\])?(?:\[(system|access|stream|encode)\])?\s*(.*)$/;

            for (const line of tailLines) {
                const match = line.match(logRegex);
                if (match) {
                    const [, timeStr, levelStr, processStr, categoryStr, message] = match;
                    const date = new Date(timeStr.replace(' ', 'T'));
                    const timestamp = isNaN(date.getTime()) ? Date.now() : date.getTime();
                    const level = (levelStr.toLowerCase() as LogEntryLevel) || 'info';
                    const process = (processStr as LogProcess) || 'Operator';
                    const category = (categoryStr as LogCategory) || 'system';

                    this.buffer.push({
                        id: ++bufferIdSeq,
                        timestamp,
                        process,
                        category,
                        level,
                        message: message || '',
                    });
                } else {
                    // 通常の行として追加
                    this.buffer.push({
                        id: ++bufferIdSeq,
                        timestamp: Date.now(),
                        process: 'Operator',
                        category: 'system',
                        level: 'info',
                        message: line,
                    });
                }
            }
        } catch {
            // ignore
        }
    }

    public push(entry: LogEntry): void {
        const unifiedEntry: LogEntry = {
            ...entry,
            id: ++bufferIdSeq,
        };
        this.buffer.push(unifiedEntry);
        if (this.buffer.length > this.maxBufferSize) {
            this.buffer.shift();
        }

        // 購読中のクライアントへ配信
        this.socketIO.emitLogs(unifiedEntry);
    }

    public getLogs(option?: GetLogsOption): LogEntry[] {
        let result = [...this.buffer];

        if (option?.process) {
            result = result.filter(e => e.process === option.process);
        }

        if (option?.category) {
            result = result.filter(e => e.category === option.category);
        }

        if (option?.level) {
            const minPriority = LEVEL_PRIORITY[option.level] || 1;
            result = result.filter(e => (LEVEL_PRIORITY[e.level] || 1) >= minPriority);
        }

        if (option?.search) {
            const query = option.search.toLowerCase();
            result = result.filter(e => e.message.toLowerCase().includes(query));
        }

        if (option?.limit && option.limit > 0) {
            if (result.length > option.limit) {
                result = result.slice(result.length - option.limit);
            }
        }

        return result;
    }

    public getLogFilePath(): string | null {
        return this.logFilePath;
    }

    public clear(): void {
        this.buffer = [];
    }

    public getBufferSize(): number {
        return this.buffer.length;
    }
}
