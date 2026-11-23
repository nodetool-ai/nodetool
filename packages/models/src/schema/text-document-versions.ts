import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { assets } from "./assets.js";

/**
 * An immutable copy of a Markdown document (a text asset) at one moment
 * (document editor PRD R11). A version is the whole Markdown, so history does
 * not depend on how the document is saved or synced. `save_type` says why it
 * was taken: before an agent turn, before a workflow run wrote the document,
 * a manual save, an interval checkpoint, or the copy kept before a restore.
 */
export const textDocumentVersions = sqliteTable(
  "text_document_versions",
  {
    id: text("id").primaryKey(),
    /** The text asset. The cascade keeps a deleted document's history from outliving it. */
    asset_id: text("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    /** Owner at snapshot time, copied from the asset. */
    user_id: text("user_id").notNull(),
    name: text("name"),
    /** Monotonic per document. */
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    /** The agent turn, workflow job or other cause that took the version. */
    cause_id: text("cause_id"),
    content: text("content").notNull(),
    content_hash: text("content_hash").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_tdv_asset").on(table.asset_id),
    index("idx_tdv_user").on(table.user_id),
    index("idx_tdv_asset_cause").on(table.asset_id, table.cause_id),
    uniqueIndex("idx_tdv_asset_version").on(table.asset_id, table.version)
  ]
);
