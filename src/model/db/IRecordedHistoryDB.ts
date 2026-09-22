import * as apid from '../../../api.js';
import RecordedHistory from '../../db/entities/RecordedHistory.js';

export default interface IRecordedHistoryDB {
    restore(items: RecordedHistory[]): Promise<void>;
    insertOnce(program: RecordedHistory): Promise<apid.RecordedHistoryId>;
    delete(time: apid.UnixtimeMS): Promise<void>;
    findAll(): Promise<RecordedHistory[]>;
    hasHistory(name: string, channelId: apid.ChannelId, endAt: apid.UnixtimeMS): Promise<boolean>;
    deleteHistory(name: string, channelId: apid.ChannelId, endAt: apid.UnixtimeMS): Promise<boolean>;
    addHistory(name: string, channelId: apid.ChannelId, endAt: apid.UnixtimeMS): Promise<void>;
}
