import { pgTable, text, integer, index } from "drizzle-orm/pg-core";

/**
 * PostgreSQL twin of `schema/bug-reports.ts`. See that file for what is
 * stored and where the attached bundle lives.
 */
export const bugReports = pgTable(
  "nodetool_bug_reports",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    steps: text("steps"),
    expected: text("expected"),
    body: text("body").notNull(),
    bundle_key: text("bundle_key"),
    bundle_size: integer("bundle_size"),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_bug_report_user_created").on(table.user_id, table.created_at),
    index("idx_bug_report_created").on(table.created_at)
  ]
);
