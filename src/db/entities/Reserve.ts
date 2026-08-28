import * as apid from '../../../api';

export default class Reserve {
    public id!: apid.ReserveId;
    public updateTime!: number;
    public ruleId: apid.RuleId | null = null;
    public ruleUpdateCnt: number | null = null;
    public isSkip: boolean = false;
    public isConflict: boolean = false;
    public allowEndLack: boolean = false;
    public tags: string | null = null;
    public isOverlap: boolean = false;
    public isIgnoreOverlap: boolean = false;
    public isTimeSpecified: boolean = false;
    public isEventRelay: boolean = false;

    public parentDirectoryName: string | null = null;
    public directory: string | null = null;
    public recordedFormat: string | null = null;

    public encodeMode1: string | null = null;
    public encodeParentDirectoryName1: string | null = null;
    public encodeDirectory1: string | null = null;
    public encodeMode2: string | null = null;
    public encodeParentDirectoryName2: string | null = null;
    public encodeDirectory2: string | null = null;
    public encodeMode3: string | null = null;
    public encodeParentDirectoryName3: string | null = null;
    public encodeDirectory3: string | null = null;
    public isDeleteOriginalAfterEncode: boolean = false;

    public programId: apid.ProgramId | null = null;
    public programUpdateTime: number | null = null;
    public channelId!: apid.ChannelId;
    public channel!: string;
    public channelType!: apid.ChannelType;
    public startAt!: apid.UnixtimeMS;
    public endAt!: apid.UnixtimeMS;
    public name!: string;
    public halfWidthName!: string;
    public shortName: string | null = null;
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
}
