import ILiveStreamBaseModel from './base/ILiveStreamBaseModel.js';
import LiveStreamBaseModel from './base/LiveStreamBaseModel.js';

export default class LiveStreamModel extends LiveStreamBaseModel implements ILiveStreamBaseModel {
    protected getStreamType(): 'LiveStream' {
        return 'LiveStream';
    }
}
