import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import { predictions } from "./predictions.js";

export const generationAttempts = pgTable(
  "nodetool_generation_attempts",
  {
    id: text("id").primaryKey(),
    generation_id: text("generation_id")
      .notNull()
      .references(() => predictions.id, { onDelete: "cascade" }),
    attempt_number: integer("attempt_number").notNull().default(1),
    provider: text("provider").notNull(),
    provider_account_ref: text("provider_account_ref"),
    provider_request_id: text("provider_request_id"),
    gateway_request_id: text("gateway_request_id"),
    provider_execution_id: text("provider_execution_id"),
    endpoint: text("endpoint"),
    callback_token_hash: text("callback_token_hash"),
    callback_token_ciphertext: text("callback_token_ciphertext"),
    decoder_version: text("decoder_version"),
    input_fingerprint: text("input_fingerprint"),
    submission_idempotency_key: text("submission_idempotency_key"),
    submission_status: text("submission_status").notNull().default("accepted"),
    provider_status: text("provider_status").notNull().default("unknown"),
    request_payload: jsonText<Record<string, unknown>>()("request_payload"),
    raw_result_ref: text("raw_result_ref"),
    lease_owner: text("lease_owner"),
    lease_expires_at: text("lease_expires_at"),
    lease_version: integer("lease_version").notNull().default(0),
    next_check_at: text("next_check_at"),
    check_attempts: integer("check_attempts").notNull().default(0),
    last_error: text("last_error"),
    cancel_requested_at: text("cancel_requested_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_generation_attempt_generation_number").on(
      table.generation_id,
      table.attempt_number
    ),
    uniqueIndex("idx_generation_attempt_provider_request").on(
      table.provider,
      table.provider_account_ref,
      table.provider_request_id
    ),
    index("idx_generation_attempt_due").on(
      table.submission_status,
      table.next_check_at
    ),
    index("idx_generation_attempt_lease").on(table.lease_expires_at),
    index("idx_generation_attempt_callback_token").on(table.callback_token_hash)
  ]
);
