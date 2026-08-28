import { bigint, boolean, int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';

export const channels = mysqlTable('channel', {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    serviceId: int('serviceId').notNull(),
    networkId: int('networkId').notNull(),
    name: text('name').notNull(),
    halfWidthName: text('halfWidthName').notNull(),
    remoteControlKeyId: int('remoteControlKeyId'),
    hasLogoData: boolean('hasLogoData').notNull().default(false),
    channelTypeId: int('channelTypeId').notNull(),
    channelType: varchar('channelType', { length: 255 }).notNull(),
    channel: varchar('channel', { length: 255 }).notNull(),
    type: int('type'),
});

export type ChannelSelect = typeof channels.$inferSelect;
export type ChannelInsert = typeof channels.$inferInsert;
