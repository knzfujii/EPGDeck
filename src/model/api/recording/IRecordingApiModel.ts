import * as apid from '../../../../api';

export default interface IRecordingApiModel {
    gets(option: apid.GetRecordedOption): Promise<apid.Records>;
    resetTimer(): Promise<void>;
    finish(reserveId: apid.ReserveId): Promise<void>;
    stop(reserveId: apid.ReserveId): Promise<void>;
    discard(reserveId: apid.ReserveId): Promise<void>;
}
