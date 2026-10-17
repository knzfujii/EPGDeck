import * as http from 'node:http';
import { LogEntry } from '../../ILogger.js';

export default interface ISocketIOManageModel {
    initialize(servers: http.Server[]): void;
    notifyClient(): void;
    notifyUpdateEncodeProgress(): void;
    emitLogs(entry: LogEntry): void;
}
