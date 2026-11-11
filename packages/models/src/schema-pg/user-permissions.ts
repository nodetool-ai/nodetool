import { pgTable, text } from "drizzle-orm/pg-core";

/** PostgreSQL twin of `schema/user-permissions.ts`. */
export const userPermissions = pgTable("nodetool_user_permissions", {
  user_id: text("user_id").primaryKey(),
  /** JSON object of flag name to boolean. */
  flags: text("flags").notNull().default("{}"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  /** The admin who last changed the row. */
  updated_by: text("updated_by")
});
