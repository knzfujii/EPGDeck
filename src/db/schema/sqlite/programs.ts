import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const programs = sqliteTable(
    'program',
    {
        id: integer('id', { mode: 'number' }).primaryKey(),
        updateTime: integer('updateTime', { mode: 'number' }).notNull(),
        channelId: integer('channelId', { mode: 'number' }).notNull(),
        eventId: integer('eventId', { mode: 'number' }).notNull(),
        serviceId: integer('serviceId').notNull(),
        networkId: integer('networkId').notNull(),
        startAt: integer('startAt', { mode: 'number' }).notNull(),
        endAt: integer('endAt', { mode: 'number' }).notNull(),
        startHour: integer('startHour').notNull(),
        week: integer('week').notNull(),
        duration: integer('duration').notNull(),
        isFree: integer('isFree', { mode: 'boolean' }).notNull(),
        name: text('name').notNull(),
        halfWidthName: text('halfWidthName').notNull(),
        shortName: text('shortName').notNull(),
        description: text('description'),
        halfWidthDescription: text('halfWidthDescription'),
        extended: text('extended'),
        halfWidthExtended: text('halfWidthExtended'),
        rawExtended: text('rawExtended'),
        rawHalfWidthExtended: text('rawHalfWidthExtended'),
        genre1: integer('genre1'),
        subGenre1: integer('subGenre1'),
        genre2: integer('genre2'),
        subGenre2: integer('subGenre2'),
        genre3: integer('genre3'),
        subGenre3: integer('subGenre3'),
        channelType: text('channelType').notNull(),
        channel: text('channel').notNull(),
        videoType: text('videoType'),
        videoResolution: text('videoResolution'),
        videoStreamContent: integer('videoStreamContent'),
        videoComponentType: integer('videoComponentType'),
        audioSamplingRate: integer('audioSamplingRate'),
        audioComponentType: integer('audioComponentType'),
    },
    table => [
        index('idx_program_channel_time').on(table.channelId, table.startAt, table.endAt),
        index('idx_program_time').on(table.startAt, table.endAt),
    ],
);

export type ProgramSelect = typeof programs.$inferSelect;
export type ProgramInsert = typeof programs.$inferInsert;
