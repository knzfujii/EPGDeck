import { integer, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core';

export const recordedTagsRecordedTag = sqliteTable(
    'recorded_tags_recorded_tag',
    {
        recordedId: integer('recordedId', { mode: 'number' }).notNull(),
        recordedTagId: integer('recordedTagId', { mode: 'number' }).notNull(),
    },
    table => ({
        pk: primaryKey({ columns: [table.recordedId, table.recordedTagId] }),
    }),
);

export type RecordedTagsRecordedTagSelect = typeof recordedTagsRecordedTag.$inferSelect;
export type RecordedTagsRecordedTagInsert = typeof recordedTagsRecordedTag.$inferInsert;
