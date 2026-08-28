import { bigint, int, mysqlTable, text } from 'drizzle-orm/mysql-core';

export const dropLogFiles = mysqlTable('drop_log_file', {
    id: int('id').autoincrement().primaryKey(),
    errorCnt: bigint('errorCnt', { mode: 'number' }).notNull(),
    dropCnt: bigint('dropCnt', { mode: 'number' }).notNull(),
    scramblingCnt: bigint('scramblingCnt', { mode: 'number' }).notNull(),
    filePath: text('filePath').notNull(),
});

export type DropLogFileSelect = typeof dropLogFiles.$inferSelect;
export type DropLogFileInsert = typeof dropLogFiles.$inferInsert;
