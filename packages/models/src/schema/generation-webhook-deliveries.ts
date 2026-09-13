import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";
import { predictions } from "./predictions.js";
import { generationAttempts } from "./generation-attempts.js";

export const generationWebhookDeliveries = sqliteTable(
  "nodetool_generation_webhook_deliveries",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    provider_account_ref: text("provider_account_ref").notNull(),
    provider_request_id: text("provider_request_id").notNull(),
    payload_hash: text("payload_hash").notNull(),
    generation_id: text("generation_id").references(() => predictions.id, {
      onDelete: "set null"
    }),
    attempt_id: text("attempt_id").references(() => generationAttempts.id, {
      onDelete: "set null"
    }),
    raw_payload: text("raw_payload").notNull(),
    signature: text("signature"),
    observation: jsonText<Record<string, unknown>>()("observation"),
    status: text("status").notNull().default("pending"),
    lease_owner: text("lease_owner"),
    lease_expires_at: text("lease_expires_at"),
    lease_version: integer("lease_version").notNull().default(0),
    received_at: text("received_at").notNull(),
    processed_at: text("processed_at"),
    error: text("error")
  },
  (table) => [
    uniqueIndex("idx_generation_webhook_identity").on(
      table.provider,
      table.provider_account_ref,
      table.provider_request_id,
      table.payload_hash
    ),
    index("idx_generation_webhook_pending").on(table.status, table.received_at),
    index("idx_generation_webhook_generation").on(table.generation_id)
  ]
);
