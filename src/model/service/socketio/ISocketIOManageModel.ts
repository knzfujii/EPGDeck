import * as http from 'http';
import { LogEntry } from '../../ILogger';

export default interface ISocketIOManageModel {
    initialize(servers: http.Server[]): void;
    notifyClient(): void;
    notifyUpdateEncodeProgress(): void;
    emitLogs(entry: LogEntry): void;
}
