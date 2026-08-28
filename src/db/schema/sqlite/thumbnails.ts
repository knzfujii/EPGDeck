import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const thumbnails = sqliteTable('thumbnail', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    filePath: text('filePath').notNull(),
    recordedId: integer('recordedId').notNull(),
});

export type ThumbnailSelect = typeof thumbnails.$inferSelect;
export type ThumbnailInsert = typeof thumbnails.$inferInsert;
