import ILiveStreamBaseModel from './base/ILiveStreamBaseModel.js';
import LiveStreamBaseModel from './base/LiveStreamBaseModel.js';

export default class LiveHLSStreamModel extends LiveStreamBaseModel implements ILiveStreamBaseModel {
    protected getStreamType(): 'LiveHLS' {
        return 'LiveHLS';
    }
}
