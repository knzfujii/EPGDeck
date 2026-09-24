import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const recordedHistory = sqliteTable(
    'recorded_history',
    {
        id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        channelId: integer('channelId', { mode: 'number' }).notNull(),
        endAt: integer('endAt', { mode: 'number' }).notNull(),
    },
    table => [
        index('idx_recorded_history_channel_end').on(table.channelId, table.endAt),
        index('idx_recorded_history_end_at').on(table.endAt),
    ],
);

export type RecordedHistorySelect = typeof recordedHistory.$inferSelect;
export type RecordedHistoryInsert = typeof recordedHistory.$inferInsert;
