import { pgTable, text, index } from "drizzle-orm/pg-core";

export const runLeases = pgTable(
  "run_leases",
  {
    run_id: text("run_id").primaryKey(),
    worker_id: text("worker_id").notNull(),
    acquired_at: text("acquired_at").notNull(),
    expires_at: text("expires_at").notNull()
  },
  (table) => [index("idx_run_leases_expires").on(table.expires_at)]
);
