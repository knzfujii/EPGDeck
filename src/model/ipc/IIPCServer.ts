import { ChildProcess } from 'child_process';
import * as apid from '../../../api.js';
import { LogEntry } from '../ILogger.js';

export default interface IIPCServer {
    register(child: ChildProcess): void;
    notifyClient(): void;
    setEncode(addOption: apid.AddEncodeProgramOption): void;
    pushLog(entry: LogEntry): void;
}
