import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * What a user of a self-hosted server may do, set by an admin.
 *
 * The row with `user_id` "*" is the default every user gets. A row for one
 * user overrides single flags: a flag missing from its `flags` follows the
 * default. A flag missing from both is allowed.
 */
export const userPermissions = sqliteTable("nodetool_user_permissions", {
  user_id: text("user_id").primaryKey(),
  /** JSON object of flag name to boolean. */
  flags: text("flags").notNull().default("{}"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  /** The admin who last changed the row. */
  updated_by: text("updated_by")
});
