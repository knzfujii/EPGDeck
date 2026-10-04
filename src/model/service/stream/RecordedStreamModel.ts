import IRecordedStreamBaseModel from './base/IRecordedStreamBaseModel.js';
import RecordedStreamBaseModel from './base/RecordedStreamBaseModel.js';

export default class RecordedStreamModel extends RecordedStreamBaseModel implements IRecordedStreamBaseModel {
    protected getStreamType(): 'RecordedStream' {
        return 'RecordedStream';
    }
}
