import { asc, eq, inArray } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import * as mapid from 'mirakurun/api';
import Channel from '../../db/entities/Channel';
import StrUtil from '../../util/StrUtil';
import IConfiguration from '../IConfiguration';
import IPromiseRetry from '../IPromiseRetry';
import IChannelDB, { ChannelUpdateValues } from './IChannelDB';
import IDrizzleOperator from './IDrizzleOperator';

@injectable()
export default class ChannelDB implements IChannelDB {
    private configuration: IConfiguration;
    private drizzleOp: IDrizzleOperator;
    private promiseRetry: IPromiseRetry;

    constructor(
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('IDrizzleOperator') drizzleOp: IDrizzleOperator,
        @inject('IPromiseRetry') promiseRetry: IPromiseRetry,
    ) {
        this.configuration = configuration;
        this.drizzleOp = drizzleOp;
        this.promiseRetry = promiseRetry;
    }

    /**
     * Mirakurun から取得した channel 情報を DB へ全件挿入する
     */
    public async insert(channels: mapid.Service[], needesDeleted: boolean = true): Promise<void> {
        const values: any[] = [];

        for (const channel of channels) {
            if (typeof channel.channel === 'undefined') {
                continue;
            }

            const name = StrUtil.toDBStr(channel.name);
            values.push({
                id: channel.id,
                serviceId: channel.serviceId,
                networkId: channel.networkId,
                name: name,
                halfWidthName: StrUtil.toHalf(name),
                remoteControlKeyId:
                    typeof channel.remoteControlKeyId === 'undefined' ? null : channel.remoteControlKeyId,
                hasLogoData: !!channel.hasLogoData,
                channelTypeId: this.getChannelTypeId(channel.channel.type),
                channelType: channel.channel.type,
                channel: channel.channel.channel,
                type: typeof (channel as any)['type'] !== 'number' ? null : (channel as any)['type'],
            });
        }

        const client = this.drizzleOp.getDB();

        await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            await (db as any).transaction(async (tx: any) => {
                if (needesDeleted) {
                    await tx.delete(schema.channels);
                }
                for (const value of values) {
                    if (client.type === 'sqlite') {
                        await tx.insert(schema.channels).values(value).onConflictDoUpdate({
                            target: schema.channels.id,
                            set: value,
                        });
                    } else {
                        await tx.insert(schema.channels).values(value).onDuplicateKeyUpdate({
                            set: value,
                        });
                    }
                }
            });
        });
    }

    private getChannelTypeId(type: mapid.ChannelType): number {
        switch (type) {
            case 'GR':
                return 0;
            case 'BS':
                return 1;
            case 'CS':
                return 2;
            case 'SKY':
                return 3;
            default:
                return 4;
        }
    }

    /**
     * event stream 用更新
     */
    public async update(values: ChannelUpdateValues): Promise<void> {
        const channels: mapid.Service[] = [];
        Array.prototype.push.apply(channels, values.insert);
        Array.prototype.push.apply(channels, values.update);

        await this.insert(channels, false);
    }

    /**
     * channel id を指定して検索
     */
    public async findId(channelId: apid.ChannelId): Promise<Channel | null> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any).select().from(schema.channels).where(eq(schema.channels.id, channelId));
            if (rows.length === 0) return null;
            return this.toEntity(rows[0]);
        });
    }

    /**
     * channelType を指定して検索
     */
    public async findChannleTypes(types: apid.ChannelType[], needSort: boolean = false): Promise<Channel[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.channels)
                .where(inArray(schema.channels.channelType, types))
                .orderBy(
                    asc(schema.channels.channelTypeId),
                    asc(schema.channels.remoteControlKeyId),
                    asc(schema.channels.serviceId),
                );
            const results = rows.map((r: any) => this.toEntity(r));
            return needSort ? this.sortChannels(results) : results;
        });
    }

    /**
     * 全件取得
     */
    public async findAll(needSort: boolean = false): Promise<Channel[]> {
        const client = this.drizzleOp.getDB();

        return await this.promiseRetry.run(async () => {
            const { db, schema } = client;
            const rows = await (db as any)
                .select()
                .from(schema.channels)
                .orderBy(
                    asc(schema.channels.channelTypeId),
                    asc(schema.channels.remoteControlKeyId),
                    asc(schema.channels.serviceId),
                );
            const results = rows.map((r: any) => this.toEntity(r));
            return needSort ? this.sortChannels(results) : results;
        });
    }

    private sortChannels(channels: Channel[]): Channel[] {
        const config = this.configuration.getConfig();

        let order: number[] = [];
        let key: string;
        if (typeof config.epg.channelOrder !== 'undefined') {
            order = config.epg.channelOrder;
            key = 'id';
        } else if (typeof config.epg.sidOrder !== 'undefined') {
            order = config.epg.sidOrder;
            key = 'serviceId';
        } else {
            return channels;
        }

        let cnt = 0;
        order.forEach(id => {
            const i = channels.findIndex(c => {
                return (c as any)[key] === id;
            });

            if (i === -1) {
                return;
            }

            const [channel] = channels.splice(i, 1);
            channels.splice(cnt, 0, channel);
            cnt += 1;
        });

        return channels;
    }

    private toEntity(row: any): Channel {
        const entity = new Channel();
        entity.id = row.id;
        entity.serviceId = row.serviceId;
        entity.networkId = row.networkId;
        entity.name = row.name;
        entity.halfWidthName = row.halfWidthName;
        entity.remoteControlKeyId = row.remoteControlKeyId;
        entity.hasLogoData = !!row.hasLogoData;
        entity.channelTypeId = row.channelTypeId;
        entity.channelType = row.channelType;
        entity.channel = row.channel;
        entity.type = row.type;
        return entity;
    }
}
