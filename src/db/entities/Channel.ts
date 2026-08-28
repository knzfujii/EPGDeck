import * as apid from '../../../api';

export default class Channel {
    public id!: apid.ChannelId;
    public serviceId!: apid.ServiceId;
    public networkId!: apid.NetworkId;
    public name!: string;
    public halfWidthName!: string;
    public remoteControlKeyId: number | null = null;
    public hasLogoData: boolean = false;
    public channelTypeId!: number;
    public channelType!: apid.ChannelType;
    public channel!: string;
    public type!: number;
}
