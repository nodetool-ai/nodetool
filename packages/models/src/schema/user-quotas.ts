import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

/**
 * Spend limits on a self-hosted server, set by an admin.
 *
 * The row with `user_id` "*" is the default every user gets. A row for one
 * user replaces the default for that user as a whole, so a null limit on it
 * means unlimited, not "inherit". Only spend on the server's own provider keys
 * counts against a limit: work a user runs on keys they saved themselves is
 * theirs to pay for (see `key_source` on `nodetool_predictions`).
 */
export const userQuotas = sqliteTable("nodetool_user_quotas", {
  user_id: text("user_id").primaryKey(),
  /** "day" | "month": the window the limits apply to, in UTC. */
  period: text("period").notNull().default("month"),
  /** Language-model tokens (input plus output). Null is unlimited. */
  token_limit: integer("token_limit"),
  /** Image, video, audio and 3D generation, in USD. Null is unlimited. */
  media_usd_limit: real("media_usd_limit"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  /** The admin who last changed the row. */
  updated_by: text("updated_by")
});
