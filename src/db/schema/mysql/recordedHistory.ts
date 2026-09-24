import { bigint, index, int, mysqlTable, text } from 'drizzle-orm/mysql-core';

export const recordedHistory = mysqlTable(
    'recorded_history',
    {
        id: int('id').autoincrement().primaryKey(),
        name: text('name').notNull(),
        channelId: bigint('channelId', { mode: 'number' }).notNull(),
        endAt: bigint('endAt', { mode: 'number' }).notNull(),
    },
    table => [
        index('idx_recorded_history_channel_end').on(table.channelId, table.endAt),
        index('idx_recorded_history_end_at').on(table.endAt),
    ],
);

export type RecordedHistorySelect = typeof recordedHistory.$inferSelect;
export type RecordedHistoryInsert = typeof recordedHistory.$inferInsert;
