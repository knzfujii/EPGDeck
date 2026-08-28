import { int, mysqlTable, text } from 'drizzle-orm/mysql-core';

export const thumbnails = mysqlTable('thumbnail', {
    id: int('id').autoincrement().primaryKey(),
    filePath: text('filePath').notNull(),
    recordedId: int('recordedId').notNull(),
});

export type ThumbnailSelect = typeof thumbnails.$inferSelect;
export type ThumbnailInsert = typeof thumbnails.$inferInsert;
