import * as apid from '../../../../../api.js';
import IStreamBaseModel from './IStreamBaseModel.js';

export type LiveStreamModelProvider = () => Promise<ILiveStreamBaseModel>;
export type LiveHLSStreamModelProvider = () => Promise<ILiveStreamBaseModel>;

export interface LiveStreamOption {
    channelId: apid.ChannelId;
    cmd?: string;
}

export default interface ILiveStreamBaseModel extends IStreamBaseModel<LiveStreamOption> {
    setOption(option: LiveStreamOption, mode: number): void;
}
