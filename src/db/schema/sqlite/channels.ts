import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const channels = sqliteTable('channel', {
    id: integer('id', { mode: 'number' }).primaryKey(),
    serviceId: integer('serviceId').notNull(),
    networkId: integer('networkId').notNull(),
    name: text('name').notNull(),
    halfWidthName: text('halfWidthName').notNull(),
    remoteControlKeyId: integer('remoteControlKeyId'),
    hasLogoData: integer('hasLogoData', { mode: 'boolean' }).notNull().default(false),
    channelTypeId: integer('channelTypeId').notNull(),
    channelType: text('channelType').notNull(),
    channel: text('channel').notNull(),
    type: integer('type'),
});

export type ChannelSelect = typeof channels.$inferSelect;
export type ChannelInsert = typeof channels.$inferInsert;
