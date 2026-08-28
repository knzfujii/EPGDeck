import * as apid from '../../../api';
import Recorded from './Recorded';

export default class VideoFile {
    public id!: apid.VideoFileId;
    public parentDirectoryName!: string;
    public filePath!: string;
    public type!: apid.VideoFileType;
    public name!: string;
    public size: number = 0;
    public recordedId!: apid.RecordedId;
    public recorded?: Recorded;
}
