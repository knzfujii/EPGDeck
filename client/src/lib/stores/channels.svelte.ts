import http from '@/lib/httpClient';

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
    activeChannelTypes = $derived.by(() => {
        if (this.channels.length === 0) {
            return ['GR', 'BS', 'CS', 'SKY'] as ('GR' | 'BS' | 'CS' | 'SKY')[];
        }
        const available = new Set(this.channels.map(c => c.channelType));
        const types: ('GR' | 'BS' | 'CS' | 'SKY')[] = [];
        for (const t of ['GR', 'BS', 'CS', 'SKY'] as const) {
            if (available.has(t)) {
                types.push(t);
            }
        }
        return types.length > 0 ? types : (['GR', 'BS', 'CS', 'SKY'] as ('GR' | 'BS' | 'CS' | 'SKY')[]);
    });
    private isFetched = false;

    public async fetch() {
        if (this.isFetched && this.channels.length > 0) return;
        try {
            const res = await http.get('/api/channels');
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
