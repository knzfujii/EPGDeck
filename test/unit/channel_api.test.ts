import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Channel from '../../src/db/entities/Channel.js';
import ChannelApiModel from '../../src/model/api/channel/ChannelApiModel.js';
import { IChannelApiModelError } from '../../src/model/api/channel/IChannelApiModel.js';

describe('ChannelApiModel Tests', () => {
    let dummyChannelDB: any;
    let dummyMirakurunClient: any;
    let dummyMirakurunClientModel: any;
    let model: ChannelApiModel;

    beforeEach(() => {
        dummyChannelDB = {
            findId: vi.fn(),
            findAll: vi.fn(),
        };
        dummyMirakurunClient = {
            getLogoImage: vi.fn(),
        };
        dummyMirakurunClientModel = {
            getClient: () => dummyMirakurunClient,
        };
        model = new ChannelApiModel(dummyChannelDB, dummyMirakurunClientModel);
    });

    const createDummyChannel = (id: number): Channel => {
        const c = new Channel();
        c.id = id;
        c.serviceId = 100 + id;
        c.networkId = 1;
        c.name = `NHK総合${id}`;
        c.halfWidthName = `NHK総合${id}`;
        c.hasLogoData = true;
        c.channelType = 'GR' as any;
        c.channel = `${id}`;
        c.type = 1;
        c.remoteControlKeyId = 1;
        return c;
    };

    describe('getChannels', () => {
        it('returns all enabled channels mapped to ChannelItem', async () => {
            const ch1 = createDummyChannel(1);
            const ch2 = createDummyChannel(2);
            ch2.remoteControlKeyId = null; // null の場合は除外されること
            ch2.halfWidthName = null as any; // null の場合は StrUtil.toHalf でフォールバックすること
            ch2.name = 'Ｅテレ２';

            dummyChannelDB.findAll.mockResolvedValue([ch1, ch2]);

            const channels = await model.getChannels();

            expect(dummyChannelDB.findAll).toHaveBeenCalledWith(true);
            expect(channels.length).toBe(2);

            expect(channels[0]).toEqual({
                id: 1,
                serviceId: 101,
                networkId: 1,
                name: 'NHK総合1',
                halfWidthName: 'NHK総合1',
                hasLogoData: true,
                channelType: 'GR',
                channel: '1',
                type: 1,
                remoteControlKeyId: 1,
            });

            expect(channels[1]).toEqual({
                id: 2,
                serviceId: 102,
                networkId: 1,
                name: 'Ｅテレ２',
                halfWidthName: 'Eテレ2', // 全角英数が半角に変換されたこと
                hasLogoData: true,
                channelType: 'GR',
                channel: '2',
                type: 1,
            });
            expect(channels[1].remoteControlKeyId).toBeUndefined();
        });
    });

    describe('getLogo', () => {
        it('throws NOT_FOUND when channel is not found', async () => {
            dummyChannelDB.findId.mockResolvedValue(null);

            await expect(model.getLogo(999)).rejects.toThrow(IChannelApiModelError.NOT_FOUND);
            expect(dummyChannelDB.findId).toHaveBeenCalledWith(999);
            expect(dummyMirakurunClient.getLogoImage).not.toHaveBeenCalled();
        });

        it('throws NOT_FOUND when channel has no logo data', async () => {
            const ch = createDummyChannel(1);
            ch.hasLogoData = false;
            dummyChannelDB.findId.mockResolvedValue(ch);

            await expect(model.getLogo(1)).rejects.toThrow(IChannelApiModelError.NOT_FOUND);
            expect(dummyMirakurunClient.getLogoImage).not.toHaveBeenCalled();
        });

        it('fetches and returns logo buffer from mirakurunClient when logo exists', async () => {
            const ch = createDummyChannel(1);
            ch.hasLogoData = true;
            dummyChannelDB.findId.mockResolvedValue(ch);

            const dummyBuffer = Buffer.from('fake logo image data');
            dummyMirakurunClient.getLogoImage.mockResolvedValue(dummyBuffer);

            const result = await model.getLogo(1);

            expect(result).toBe(dummyBuffer);
            expect(dummyMirakurunClient.getLogoImage).toHaveBeenCalledWith(1);
        });
    });
});
