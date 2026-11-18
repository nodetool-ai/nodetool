/** PostgreSQL twin of `src/schema/cloud-links.ts`, which describes it. */
import { pgTable, text, index, uniqueIndex } from "drizzle-orm/pg-core";

/** One row per linked local project. */
export const cloudLinks = pgTable(
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
export const cloudLinkDocuments = pgTable(
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
export const cloudLinkFiles = pgTable(
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
export const cloudReceives = pgTable(
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
