import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Bug reports submitted from the hosted web app.
 *
 * A local install sends a reporter to a pre-filled GitHub issue instead and
 * stores nothing. On the hosted app the report comes here: the text fields
 * and the issue-style markdown `body` in this row, and the zip the reporter
 * reviewed (attached data and screenshots) in asset storage under
 * `bundle_key`. That key sits under the reporter's `<user_id>/` prefix, so
 * account erasure removes the bytes along with the row.
 */
export const bugReports = sqliteTable(
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
