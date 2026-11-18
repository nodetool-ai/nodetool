import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * The link state of a native app's local projects that are linked to a cloud
 * project (docs/plans/native-cloud-sync/technical-design.md, "Identity" and
 * "Receiving: revision set, stage, check, apply", WP2.7). The rows live in
 * the local database of the server bundled with each native app, never in the
 * project folder (DD4), so a copied folder carries no link.
 *
 * `project_id` is always the local project. `server_key` is the first 16 hex
 * characters of the SHA-256 of the cloud server origin, as in
 * `cloud_drafts`.
 */

/** One row per linked local project. */
export const cloudLinks = sqliteTable(
  "cloud_links",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    server_key: text("server_key").notNull(),
    account_id: text("account_id").notNull(),
    cloud_project_id: text("cloud_project_id").notNull(),
    state: text("state", { enum: ["linked"] }).notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_cloud_links_project").on(table.user_id, table.project_id),
    index("idx_cloud_links_account").on(table.user_id, table.server_key, table.account_id)
  ]
);

/**
 * One row per document of a linked project that a transfer or a receive
 * exchanged: the pair of ids and the base, which is the content hash and the
 * cloud revision of the last exchange.
 */
export const cloudLinkDocuments = sqliteTable(
  "cloud_link_documents",
  {
    id: text("id").primaryKey(),
    link_id: text("link_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    kind: text("kind").notNull(),
    local_id: text("local_id").notNull(),
    cloud_id: text("cloud_id").notNull(),
    base_content_hash: text("base_content_hash").notNull(),
    base_cloud_revision: text("base_cloud_revision"),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_cloud_link_documents_local").on(table.link_id, table.kind, table.local_id),
    uniqueIndex("idx_cloud_link_documents_cloud").on(table.link_id, table.kind, table.cloud_id)
  ]
);

/** One row per asset file of a linked project: the hash of the bytes the last exchange gave it. */
export const cloudLinkFiles = sqliteTable(
  "cloud_link_files",
  {
    id: text("id").primaryKey(),
    link_id: text("link_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    asset_id: text("asset_id").notNull(),
    cloud_asset_id: text("cloud_asset_id").notNull(),
    base_hash: text("base_hash").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [uniqueIndex("idx_cloud_link_files_asset").on(table.link_id, table.asset_id)]
);

/**
 * A receive in progress, keyed by its revision set id. `plan` holds the
 * captured set and the person's decisions, so a restart resumes from `state`
 * alone: `staging` downloads, `installed` checks and commits, `applied`
 * places the files and finishes.
 */
export const cloudReceives = sqliteTable(
  "cloud_receives",
  {
    id: text("id").primaryKey(),
    link_id: text("link_id").notNull(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    state: text("state", { enum: ["staging", "installed", "applied"] }).notNull(),
    plan: text("plan").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [index("idx_cloud_receives_user").on(table.user_id, table.project_id)]
);

/**
 * A send to a cloud project that has not finished, keyed by its transfer id.
 * `plan` holds the captured manifest and payloads, so a retry sends the same
 * content. `attempt_id` is recorded before a commit is sent, so a restart
 * asks the cloud for that attempt's result instead of guessing.
 */
export const cloudSends = sqliteTable(
  "cloud_sends",
  {
    id: text("id").primaryKey(),
    /** Null for a first publication, which creates the link when it commits. */
    link_id: text("link_id"),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    server_key: text("server_key").notNull(),
    account_id: text("account_id").notNull(),
    cloud_project_id: text("cloud_project_id").notNull(),
    state: text("state", { enum: ["open", "committing"] }).notNull(),
    attempt_id: text("attempt_id"),
    plan: text("plan").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [index("idx_cloud_sends_user").on(table.user_id, table.project_id)]
);
