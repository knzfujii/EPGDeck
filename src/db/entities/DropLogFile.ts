import * as apid from '../../../api';

export default class DropLogFile {
    public id!: apid.DropLogFileId;
    public errorCnt!: number;
    public dropCnt!: number;
    public scramblingCnt!: number;
    public filePath!: string;
}
