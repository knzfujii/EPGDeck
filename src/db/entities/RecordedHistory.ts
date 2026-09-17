import * as apid from '../../../api.js';

export default class RecordedHistory {
    public id!: apid.RecordedHistoryId;
    public name!: string;
    public channelId!: apid.ChannelId;
    public endAt!: apid.UnixtimeMS;
}
