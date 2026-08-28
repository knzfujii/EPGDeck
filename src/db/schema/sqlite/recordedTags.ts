import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const recordedTags = sqliteTable('recorded_tag', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    halfWidthName: text('halfWidthName').notNull(),
    color: text('color').notNull(),
});

export type RecordedTagSelect = typeof recordedTags.$inferSelect;
export type RecordedTagInsert = typeof recordedTags.$inferInsert;
