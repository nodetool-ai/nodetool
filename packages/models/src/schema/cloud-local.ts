import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * The local store of the native apps for documents that live on a cloud
 * server (docs/plans/native-cloud-sync/technical-design.md, "Local data
 * scoping and durable drafts"). Both tables exist only in the local SQLite
 * database of the server bundled with each native app.
 *
 * Every row carries the local `user_id`, the cloud `server_key` (the first 16
 * hex characters of the SHA-256 of the server origin) and the cloud
 * `account_id`. Every query filters on all three, so one account never reads
 * or sends another account's rows.
 */

/** The three options a share link or invitation grants. */
export interface CloudDocumentOptions {
  allow_history: boolean;
  allow_download: boolean;
  allow_duplicate: boolean;
}

/**
 * One row per cloud document with unsent work. `revision` counts the writes
 * of this row, so an acceptance of an older send never deletes newer edits.
 */
export const cloudDrafts = sqliteTable(
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
    revision: integer("revision").notNull(),
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
export const cloudOpenState = sqliteTable(
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
