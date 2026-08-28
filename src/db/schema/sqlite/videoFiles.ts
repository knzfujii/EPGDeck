import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const videoFiles = sqliteTable('video_file', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    parentDirectoryName: text('parentDirectoryName').notNull(),
    filePath: text('filePath').notNull(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    size: integer('size', { mode: 'number' }).notNull().default(0),
    recordedId: integer('recordedId').notNull(),
});

export type VideoFileSelect = typeof videoFiles.$inferSelect;
export type VideoFileInsert = typeof videoFiles.$inferInsert;
