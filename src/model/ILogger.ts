export type LogProcess = 'Operator' | 'Service' | 'EPGUpdater';
export type LogCategory = 'system' | 'access' | 'stream' | 'encode';
export type LogEntryLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
    id: number;
    timestamp: number;
    process: LogProcess;
    category: LogCategory;
    level: LogEntryLevel;
    message: string;
}

export interface ILoggerCategory {
    debug(message: any, ...args: any[]): void;
    info(message: any, ...args: any[]): void;
    warn(message: any, ...args: any[]): void;
    error(message: any, ...args: any[]): void;
    fatal(message: any, ...args: any[]): void;
    isLevelEnabled?(level: string): boolean;
}

export default interface ILogger {
    system: ILoggerCategory;
    access: ILoggerCategory;
    stream: ILoggerCategory;
    encode: ILoggerCategory;
}
