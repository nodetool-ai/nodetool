import { pgTable, text, integer, index } from "drizzle-orm/pg-core";

// See the SQLite schema (../schema/credits.ts) for field documentation.

export const creditLedger = pgTable(
  "nodetool_credit_ledger",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    delta: integer("delta").notNull(),
    kind: text("kind").notNull(),
    description: text("description"),
    period_key: text("period_key"),
    created_at: text("created_at").notNull()
  },
  (table) => [index("idx_credit_ledger_user").on(table.user_id)]
);

export const userSubscriptions = pgTable("nodetool_user_subscriptions", {
  user_id: text("user_id").primaryKey(),
  plan_id: text("plan_id").notNull().default("free"),
  status: text("status").notNull().default("active"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull()
});
