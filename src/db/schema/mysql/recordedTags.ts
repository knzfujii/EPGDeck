import { int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';

export const recordedTags = mysqlTable('recorded_tag', {
    id: int('id').autoincrement().primaryKey(),
    name: text('name').notNull(),
    halfWidthName: text('halfWidthName').notNull(),
    color: varchar('color', { length: 255 }).notNull(),
});

export type RecordedTagSelect = typeof recordedTags.$inferSelect;
export type RecordedTagInsert = typeof recordedTags.$inferInsert;
