import { bigint, int, mysqlTable, text } from 'drizzle-orm/mysql-core';

export const recordedHistory = mysqlTable('recorded_history', {
    id: int('id').autoincrement().primaryKey(),
    name: text('name').notNull(),
    channelId: bigint('channelId', { mode: 'number' }).notNull(),
    endAt: bigint('endAt', { mode: 'number' }).notNull(),
});

export type RecordedHistorySelect = typeof recordedHistory.$inferSelect;
export type RecordedHistoryInsert = typeof recordedHistory.$inferInsert;
