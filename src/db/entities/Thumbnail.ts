import * as apid from '../../../api';
import Recorded from './Recorded';

export default class Thumbnail {
    public id!: apid.ThumbnailId;
    public filePath!: string;
    public recordedId!: apid.RecordedId;
    public recorded?: Recorded;
}
