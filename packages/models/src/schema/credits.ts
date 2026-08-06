import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Credit grants per user. Spend is not written here — it already lives in
 * `nodetool_predictions` — so the balance is one subtraction:
 * sum(grants) - ceil(prediction spend / credit price).
 *
 * Plan grants are idempotent by construction: their row id is
 * `plan:<userId>:<periodKey>`, so re-running the lazy monthly accrual can
 * never double-grant.
 */
export const creditLedger = sqliteTable(
  "nodetool_credit_ledger",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    /** Credits granted (positive) or revoked (negative). */
    delta: integer("delta").notNull(),
    /** "plan_grant" | "topup" | "adjustment" */
    kind: text("kind").notNull(),
    description: text("description"),
    /** Month key ("2026-08") for plan grants; null otherwise. */
    period_key: text("period_key"),
    created_at: text("created_at").notNull()
  },
  (table) => [index("idx_credit_ledger_user").on(table.user_id)]
);

/**
 * One subscription per user. No payment state — a payment provider webhook
 * would flip `plan_id`/`status` here; until then plan switches are instant.
 */
export const userSubscriptions = sqliteTable("nodetool_user_subscriptions", {
  user_id: text("user_id").primaryKey(),
  plan_id: text("plan_id").notNull().default("free"),
  status: text("status").notNull().default("active"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull()
});
