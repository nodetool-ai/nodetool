import {
  pgTable,
  text,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import type { CloudDocumentOptions } from "../schema/cloud-local.js";
import { jsonText } from "./helpers.js";

/**
 * PostgreSQL twin of `src/schema/cloud-local.ts`, which describes both
 * tables. They are used only by the local SQLite database of the server
 * bundled with each native app.
 */

/**
 * One row per cloud document with unsent work. Each write gives the row a
 * new random `draft_id` that is never reused, even after the row is deleted
 * and written again, so an acknowledgement of an older send never deletes
 * or rebases newer edits.
 */
export const cloudDrafts = pgTable(
  "cloud_drafts",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    server_key: text("server_key").notNull(),
    account_id: text("account_id").notNull(),
    kind: text("kind").notNull(),
    document_id: text("document_id").notNull(),
    /** The server's `updated_at` of the version the draft edits. */
    base_updated_at: text("base_updated_at").notNull(),
    base_content_hash: text("base_content_hash").notNull(),
    /** The whole edited document, as the app serialized it. */
    draft: text("draft").notNull(),
    /** `waiting` until the server accepts it, `unsent` once it refused it. */
    state: text("state", { enum: ["waiting", "unsent"] }).notNull(),
    /** The server's refusal code while `state` is `unsent`. */
    refusal_reason: text("refusal_reason"),
    draft_id: text("draft_id").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_cloud_drafts_document").on(
      table.user_id,
      table.server_key,
      table.account_id,
      table.kind,
      table.document_id
    ),
    index("idx_cloud_drafts_account").on(
      table.user_id,
      table.server_key,
      table.account_id
    )
  ]
);

/**
 * What the app last knew about a cloud document: the role and options, the
 * base it last saved or opened, and the last successful contact. The offline
 * and unknown statuses read it.
 */
export const cloudOpenState = pgTable(
  "cloud_open_state",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    server_key: text("server_key").notNull(),
    account_id: text("account_id").notNull(),
    kind: text("kind").notNull(),
    document_id: text("document_id").notNull(),
    role: text("role").notNull(),
    options: jsonText<CloudDocumentOptions>()("options").notNull(),
    base_updated_at: text("base_updated_at"),
    base_content_hash: text("base_content_hash"),
    last_contact_at: text("last_contact_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_cloud_open_state_document").on(
      table.user_id,
      table.server_key,
      table.account_id,
      table.kind,
      table.document_id
    )
  ]
);
