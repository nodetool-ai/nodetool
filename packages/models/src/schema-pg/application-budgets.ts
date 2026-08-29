import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  real,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";

import { applications } from "./applications.js";

/** See the SQLite schema for the column semantics. */
export const applicationBudgets = pgTable("application_budgets", {
  application_id: text("application_id")
    .primaryKey()
    .references(() => applications.id, { onDelete: "cascade" }),
  period: text("period").notNull().default("month"),
  max_usd: real("max_usd"),
  max_invocations: integer("max_invocations"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull()
});

export const applicationInvocations = pgTable(
  "application_invocations",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    user_id: text("user_id"),
    version: integer("version"),
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
    index("idx_application_invocation_invocation").on(table.invocation_id),
    uniqueIndex("idx_application_invocation_app_invocation").on(
      table.application_id,
      table.invocation_id
    )
  ]
);

export type ApplicationBudgetRow = InferSelectModel<typeof applicationBudgets>;
export type NewApplicationBudget = InferInsertModel<typeof applicationBudgets>;
export type ApplicationInvocationRow = InferSelectModel<
  typeof applicationInvocations
>;
export type NewApplicationInvocation = InferInsertModel<
  typeof applicationInvocations
>;
