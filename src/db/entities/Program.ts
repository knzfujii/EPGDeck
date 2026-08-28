import * as apid from '../../../api';

export default class Program {
    public id!: apid.ProgramId;
    public updateTime!: number;
    public channelId!: apid.ChannelId;
    public eventId!: apid.EventId;
    public serviceId!: apid.ServiceId;
    public networkId!: apid.NetworkId;
    public startAt!: apid.UnixtimeMS;
    public endAt!: apid.UnixtimeMS;
    public startHour!: number;
    public week!: number;
    public duration!: number;
    public isFree!: boolean;
    public name!: string;
    public halfWidthName!: string;
    public shortName!: string;
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
    public channelType!: apid.ChannelType;
    public channel!: string;
    public videoType: string | null = null;
    public videoResolution: string | null = null;
    public videoStreamContent: number | null = null;
    public videoComponentType: number | null = null;
    public audioSamplingRate: number | null = null;
    public audioComponentType: number | null = null;
}
