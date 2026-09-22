import Reserve from '../../../db/entities/Reserve.js';

export type RecorderModelProvider = () => Promise<IRecorderModel>;

export default interface IRecorderModel {
    readonly isRecording: boolean;
    readonly reserve: Reserve;
    setTimer(reserve: Reserve, isSuppressLog: boolean): boolean;
    cancel(isPlanToDelete: boolean): Promise<void>;
    finish(): Promise<void>;
    update(newReserve: Reserve, isSuppressLog: boolean): Promise<void>;
    resetTimer(): boolean;
}
