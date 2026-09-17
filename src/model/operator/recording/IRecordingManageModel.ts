import * as apid from '../../../../api.js';
import * as mapid from 'mirakurun/api.js';
import { IReserveUpdateValues } from '../../event/IReserveEvent.js';

export default interface IRecordingManageModel {
    setTuner(tuners: mapid.TunerDevice[]): void;
    cleanup(): Promise<void>;
    update(diff: IReserveUpdateValues): Promise<void>;
    hasReserve(reserveId: apid.ReserveId): boolean;
    cancel(reserveId: apid.ReserveId, isPlanToDelete: boolean): Promise<void>;
    finish(reserveId: apid.ReserveId): Promise<void>;
    resetTimer(): void;
}
