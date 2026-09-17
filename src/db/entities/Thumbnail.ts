import * as apid from '../../../api.js';
import Recorded from './Recorded.js';

export default class Thumbnail {
    public id!: apid.ThumbnailId;
    public filePath!: string;
    public recordedId!: apid.RecordedId;
    public recorded?: Recorded;
}
