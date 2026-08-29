import axios from 'axios';

export interface Channel {
    id: number;
    serviceId: number;
    networkId: number;
    name: string;
    halfWidthName: string;
    channelType: 'GR' | 'BS' | 'CS' | 'SKY';
    channel: string;
    hasLogoData: boolean;
}

class ChannelStore {
    channels = $state<Channel[]>([]);
    channelMap = $derived(new Map<number, Channel>(this.channels.map(c => [c.id, c])));
    private isFetched = false;

    public async fetch() {
        if (this.isFetched && this.channels.length > 0) return;
        try {
            const res = await axios.get('/api/channels');
            this.channels = res.data || [];
            this.isFetched = true;
        } catch (e) {
            console.error('Failed to fetch channels', e);
        }
    }

    public getChannel(id: number): Channel | undefined {
        return this.channelMap.get(id);
    }

    public getChannelName(id: number): string {
        const ch = this.channelMap.get(id);
        return ch ? ch.name : `ch:${id}`;
    }
}

export const channelStore = new ChannelStore();

