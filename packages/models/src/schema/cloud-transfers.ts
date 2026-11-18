import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Transfers into a cloud project (docs/plans/native-cloud-sync/
 * technical-design.md, "Sending: capture, stage, commit attempt", WP2.4).
 * The client chooses the id. A transfer holds staged files until one commit
 * attempt commits it or it is cancelled.
 */
export const cloudTransfers = sqliteTable(
  "cloud_transfers",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    /** The cloud project. For a first publication, the id it will get. */
    project_id: text("project_id").notNull(),
    first_publication: integer("first_publication", { mode: "boolean" }).notNull(),
    /** `open`, `committed` or `cancelled`. */
    state: text("state").notNull(),
    /** The attempt that committed the transfer. */
    committed_attempt_id: text("committed_attempt_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [index("idx_cloud_transfers_user").on(table.user_id, table.created_at)]
);

/**
 * One row per commit attempt: its digest and its recorded result. An attempt
 * id has one result. A repeat with the same digest returns it.
 */
export const cloudTransferAttempts = sqliteTable(
  "cloud_transfer_attempts",
  {
    id: text("id").primaryKey(),
    transfer_id: text("transfer_id").notNull(),
    attempt_id: text("attempt_id").notNull(),
    user_id: text("user_id").notNull(),
    digest: text("digest").notNull(),
    /** `committed` or `refused`. */
    outcome: text("outcome").notNull(),
    /** The result as JSON, returned again to a repeat. */
    result: text("result").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_cloud_transfer_attempts_attempt").on(table.transfer_id, table.attempt_id),
    index("idx_cloud_transfer_attempts_user").on(table.user_id)
  ]
);
