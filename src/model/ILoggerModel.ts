import { LogConfig } from './IConfigFile.js';
import ILogger, { LogEntry, LogProcess } from './ILogger.js';

export default interface ILoggerModel {
    initialize(processName?: LogProcess | string, logConfig?: LogConfig): void;
    getLogger(): ILogger;
    onLog(listener: (entry: LogEntry) => void): () => void;
    getLogConfig(): LogConfig;
}
