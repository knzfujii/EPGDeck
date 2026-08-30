import { LogCategory, LogEntry, LogEntryLevel, LogProcess } from '../../ILogger';

export interface GetLogsOption {
    limit?: number;
    level?: LogEntryLevel;
    process?: LogProcess;
    category?: LogCategory;
    search?: string;
}

export default interface ILogManageModel {
    push(entry: LogEntry): void;
    getLogs(option?: GetLogsOption): LogEntry[];
    getLogFilePath(): string | null;
    clear(): void;
    getBufferSize(): number;
}
