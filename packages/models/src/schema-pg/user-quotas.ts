import { pgTable, text, integer, real } from "drizzle-orm/pg-core";

/** PostgreSQL twin of `schema/user-quotas.ts`. */
export const userQuotas = pgTable("nodetool_user_quotas", {
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
