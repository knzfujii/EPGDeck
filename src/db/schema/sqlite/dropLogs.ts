import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const dropLogFiles = sqliteTable('drop_log_file', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    errorCnt: integer('errorCnt', { mode: 'number' }).notNull(),
    dropCnt: integer('dropCnt', { mode: 'number' }).notNull(),
    scramblingCnt: integer('scramblingCnt', { mode: 'number' }).notNull(),
    filePath: text('filePath').notNull(),
});

export type DropLogFileSelect = typeof dropLogFiles.$inferSelect;
export type DropLogFileInsert = typeof dropLogFiles.$inferInsert;
