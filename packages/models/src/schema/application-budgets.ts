import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * The spend ceiling a published app runs under.
 *
 * Runs of a released app execute with the creator's secrets, so the creator
 * needs a hard stop. One budget per application; the period decides the window
 * the ledger is summed over.
 */
export const applicationBudgets = sqliteTable("application_budgets", {
  application_id: text("application_id").primaryKey(),
  /** "day" | "month" | "total" — the window `max_usd` applies to. */
  period: text("period").notNull().default("month"),
  max_usd: real("max_usd"),
  max_invocations: integer("max_invocations"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull()
});

/**
 * One row per run of an application: the spend check's input and the release
 * telemetry, keyed by `(application_id, version, invocation_id)`.
 *
 * `estimated_usd` is what the budget check reserved before the job started;
 * `actual_usd` is filled in from the run's recorded provider costs when it
 * settles. An unsettled row still counts against the budget at its estimate,
 * so a crashed run cannot free spend it may have incurred.
 */
export const applicationInvocations = sqliteTable(
  "application_invocations",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id").notNull(),
    /** Released version this ran against; null for a draft run. */
    version: integer("version"),
    /** Equals the run's `job_id`. */
    invocation_id: text("invocation_id").notNull(),
    operation_id: text("operation_id").notNull().default(""),
    estimated_usd: real("estimated_usd").notNull().default(0),
    actual_usd: real("actual_usd"),
    status: text("status").notNull().default("running"),
    created_at: text("created_at").notNull(),
    settled_at: text("settled_at")
  },
  (table) => [
    index("idx_application_invocation_app").on(table.application_id),
    index("idx_application_invocation_created").on(table.created_at),
    index("idx_application_invocation_invocation").on(table.invocation_id)
  ]
);
