import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Reference sets: the files each document's content refers to
 * (docs/plans/native-cloud-sync/technical-design.md, "Reference sets and file
 * authorization"). A row names its document by `(document_type,
 * document_id)`, `version_id` is empty for the current revision, and `file`
 * is an asset id.
 *
 * `scope` is `viewer` or `editor` for the current revision, and
 * `version_viewer` or `version_editor` for a saved version.
 */
export const documentRefs = sqliteTable(
  "nodetool_document_refs",
  {
    id: text("id").primaryKey(),
    document_type: text("document_type").notNull(),
    document_id: text("document_id").notNull(),
    scope: text("scope").notNull(),
    version_id: text("version_id").notNull().default(""),
    file: text("file").notNull()
  },
  (table) => [
    uniqueIndex("idx_drefs_entry").on(
      table.document_type,
      table.document_id,
      table.version_id,
      table.scope,
      table.file
    ),
    index("idx_drefs_file").on(table.file)
  ]
);

/**
 * One row per written set: which content it was computed from. A set whose
 * `content_hash` differs from the content stored now is stale and is
 * computed again before it is read.
 */
export const documentRefSets = sqliteTable(
  "nodetool_document_ref_sets",
  {
    id: text("id").primaryKey(),
    document_type: text("document_type").notNull(),
    document_id: text("document_id").notNull(),
    version_id: text("version_id").notNull().default(""),
    content_hash: text("content_hash").notNull(),
    written_at: text("written_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_dref_sets_entry").on(
      table.document_type,
      table.document_id,
      table.version_id
    )
  ]
);

/**
 * Files of other people that the attach rule admitted into a document. A set
 * holds a file only when the document's owner owns it or it is admitted
 * here, so a reference written outside the checked save paths exposes
 * nothing of another library.
 */
export const documentAdmittedFiles = sqliteTable(
  "nodetool_document_admitted_files",
  {
    id: text("id").primaryKey(),
    document_type: text("document_type").notNull(),
    document_id: text("document_id").notNull(),
    file: text("file").notNull(),
    admitted_at: text("admitted_at").notNull()
  },
  (table) => [
    uniqueIndex("idx_dadmitted_entry").on(
      table.document_type,
      table.document_id,
      table.file
    )
  ]
);
