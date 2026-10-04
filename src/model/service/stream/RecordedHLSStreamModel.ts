import IRecordedStreamBaseModel from './base/IRecordedStreamBaseModel.js';
import RecordedStreamBaseModel from './base/RecordedStreamBaseModel.js';

export default class RecordedHLSStreamModel extends RecordedStreamBaseModel implements IRecordedStreamBaseModel {
    protected getStreamType(): 'RecordedHLS' {
        return 'RecordedHLS';
    }
}
