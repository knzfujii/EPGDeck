import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const recorded = sqliteTable('recorded', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    reserveId: integer('reserveId'),
    ruleId: integer('ruleId'),
    programId: integer('programId', { mode: 'number' }),
    channelId: integer('channelId', { mode: 'number' }).notNull(),
    isProtected: integer('isProtected', { mode: 'boolean' }).notNull().default(false),
    startAt: integer('startAt', { mode: 'number' }).notNull(),
    endAt: integer('endAt', { mode: 'number' }).notNull(),
    duration: integer('duration').notNull(),
    name: text('name').notNull(),
    halfWidthName: text('halfWidthName').notNull(),
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
    videoType: text('videoType'),
    videoResolution: text('videoResolution'),
    videoStreamContent: integer('videoStreamContent'),
    videoComponentType: integer('videoComponentType'),
    audioSamplingRate: integer('audioSamplingRate'),
    audioComponentType: integer('audioComponentType'),
    isRecording: integer('isRecording', { mode: 'boolean' }).notNull(),
    dropLogFileId: integer('dropLogFileId').unique(),
});

export type RecordedSelect = typeof recorded.$inferSelect;
export type RecordedInsert = typeof recorded.$inferInsert;
