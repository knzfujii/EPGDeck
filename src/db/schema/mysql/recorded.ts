import { bigint, boolean, int, mysqlTable, text } from 'drizzle-orm/mysql-core';

export const recorded = mysqlTable('recorded', {
    id: int('id').autoincrement().primaryKey(),
    reserveId: int('reserveId'),
    ruleId: int('ruleId'),
    programId: bigint('programId', { mode: 'number' }),
    channelId: bigint('channelId', { mode: 'number' }).notNull(),
    isProtected: boolean('isProtected').notNull().default(false),
    startAt: bigint('startAt', { mode: 'number' }).notNull(),
    endAt: bigint('endAt', { mode: 'number' }).notNull(),
    duration: int('duration').notNull(),
    name: text('name').notNull(),
    halfWidthName: text('halfWidthName').notNull(),
    description: text('description'),
    halfWidthDescription: text('halfWidthDescription'),
    extended: text('extended'),
    halfWidthExtended: text('halfWidthExtended'),
    rawExtended: text('rawExtended'),
    rawHalfWidthExtended: text('rawHalfWidthExtended'),
    genre1: int('genre1'),
    subGenre1: int('subGenre1'),
    genre2: int('genre2'),
    subGenre2: int('subGenre2'),
    genre3: int('genre3'),
    subGenre3: int('subGenre3'),
    videoType: text('videoType'),
    videoResolution: text('videoResolution'),
    videoStreamContent: int('videoStreamContent'),
    videoComponentType: int('videoComponentType'),
    audioSamplingRate: int('audioSamplingRate'),
    audioComponentType: int('audioComponentType'),
    isRecording: boolean('isRecording').notNull(),
    dropLogFileId: int('dropLogFileId').unique(),
});

export type RecordedSelect = typeof recorded.$inferSelect;
export type RecordedInsert = typeof recorded.$inferInsert;
