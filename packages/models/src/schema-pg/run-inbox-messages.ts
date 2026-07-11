import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";

export const runInboxMessages = pgTable(
  "run_inbox_messages",
  {
    id: text("id").primaryKey(),
    message_id: text("message_id").notNull(),
    run_id: text("run_id").notNull(),
    node_id: text("node_id").notNull(),
    handle: text("handle").notNull(),
    msg_seq: integer("msg_seq").notNull(),
    payload_json: jsonText<unknown>()("payload_json"),
    payload_ref: text("payload_ref"),
    status: text("status").notNull(),
    claim_worker_id: text("claim_worker_id"),
    claim_expires_at: text("claim_expires_at"),
    consumed_at: text("consumed_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_inbox_run_node_handle_seq").on(
      table.run_id,
      table.node_id,
      table.handle,
      table.msg_seq
    ),
    index("idx_inbox_run_node_handle_status").on(
      table.run_id,
      table.node_id,
      table.handle,
      table.status
    ),
    uniqueIndex("idx_inbox_message_id").on(table.message_id)
  ]
);
