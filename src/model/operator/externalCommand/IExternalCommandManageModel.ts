import Recorded from '../../../db/entities/Recorded.js';
import Reserve from '../../../db/entities/Reserve.js';
import { OperatorFinishEncodeInfo } from '../../event/IOperatorEncodeEvent.js';
import { IReserveUpdateValues } from '../../event/IReserveEvent.js';

export default interface IExternalCommandManageModel {
    addUpdateReserves(diff: IReserveUpdateValues): void;
    addUpdateReseves(diff: IReserveUpdateValues): void; // 旧メソッド名互換エイリアス
    addRecordingPrepStartCmd(reserve: Reserve): void;
    addRecordingPrepRecFailedCmd(reserve: Reserve): void;
    addRecordingStartCmd(recorded: Recorded): void;
    addRecordingFinishCmd(recorded: Recorded): void;
    addRecordingFailedCmd(recorded: Recorded): void;
    addEncodingFinishCmd(info: OperatorFinishEncodeInfo): void;
}
