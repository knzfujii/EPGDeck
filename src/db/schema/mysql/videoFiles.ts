import { bigint, int, mysqlTable, text } from 'drizzle-orm/mysql-core';

export const videoFiles = mysqlTable('video_file', {
    id: int('id').autoincrement().primaryKey(),
    parentDirectoryName: text('parentDirectoryName').notNull(),
    filePath: text('filePath').notNull(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    recordedId: int('recordedId').notNull(),
});

export type VideoFileSelect = typeof videoFiles.$inferSelect;
export type VideoFileInsert = typeof videoFiles.$inferInsert;
