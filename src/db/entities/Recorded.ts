import * as apid from '../../../api';
import DropLogFile from './DropLogFile';
import RecordedTag from './RecordedTag';
import Thumbnail from './Thumbnail';
import VideoFile from './VideoFile';

export default class Recorded {
    public id!: apid.RecordedId;
    public reserveId: apid.ReserveId | null = null;
    public ruleId: apid.RuleId | null = null;
    public programId: apid.ProgramId | null = null;
    public channelId!: apid.ChannelId;
    public isProtected: boolean = false;
    public startAt!: apid.UnixtimeMS;
    public endAt!: apid.UnixtimeMS;
    public duration!: number;
    public name!: string;
    public halfWidthName!: string;
    public description: string | null = null;
    public halfWidthDescription: string | null = null;
    public extended: string | null = null;
    public halfWidthExtended: string | null = null;
    public rawExtended: string | null = null;
    public rawHalfWidthExtended: string | null = null;
    public genre1: number | null = null;
    public subGenre1: number | null = null;
    public genre2: number | null = null;
    public subGenre2: number | null = null;
    public genre3: number | null = null;
    public subGenre3: number | null = null;
    public videoType: string | null = null;
    public videoResolution: string | null = null;
    public videoStreamContent: number | null = null;
    public videoComponentType: number | null = null;
    public audioSamplingRate: number | null = null;
    public audioComponentType: number | null = null;
    public isRecording!: boolean;
    public dropLogFileId: apid.DropLogFileId | null = null;

    public videoFiles?: VideoFile[];
    public thumbnails?: Thumbnail[];
    public dropLogFile?: DropLogFile | null;
    public tags?: RecordedTag[];
}
