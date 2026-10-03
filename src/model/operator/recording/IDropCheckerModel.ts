import { DropResult, EitInfo, PmtInfo } from 'arib-probe';
import * as stream from 'stream';

export default interface IDropCheckerModel {
    start(logDirPath: string, srcFilePath: string, readableStream: stream.Readable): Promise<void>;
    stop(): Promise<void>;
    getFilePath(): string | null;
    getResult(): Promise<DropResult>;
    on(event: 'eit', listener: (eit: EitInfo) => void): void;
    off(event: 'eit', listener: (eit: EitInfo) => void): void;
    on(event: 'pmt', listener: (pmt: PmtInfo) => void): void;
    off(event: 'pmt', listener: (pmt: PmtInfo) => void): void;
}
