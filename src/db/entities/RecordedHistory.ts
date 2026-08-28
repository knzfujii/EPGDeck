import * as apid from '../../../api';

export default class RecordedHistory {
    public id!: apid.RecordedHistoryId;
    public name!: string;
    public channelId!: apid.ChannelId;
    public endAt!: apid.UnixtimeMS;
}
