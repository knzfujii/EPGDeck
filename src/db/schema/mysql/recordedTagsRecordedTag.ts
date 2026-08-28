import { int, mysqlTable, primaryKey } from 'drizzle-orm/mysql-core';

export const recordedTagsRecordedTag = mysqlTable(
    'recorded_tags_recorded_tag',
    {
        recordedId: int('recordedId').notNull(),
        recordedTagId: int('recordedTagId').notNull(),
    },
    table => ({
        pk: primaryKey({ columns: [table.recordedId, table.recordedTagId] }),
    }),
);

export type RecordedTagsRecordedTagSelect = typeof recordedTagsRecordedTag.$inferSelect;
export type RecordedTagsRecordedTagInsert = typeof recordedTagsRecordedTag.$inferInsert;
