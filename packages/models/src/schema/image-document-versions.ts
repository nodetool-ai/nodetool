import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { imageDocuments } from "./image-documents.js";

/**
 * An immutable snapshot of a sketch: the document plus the canvas settings it
 * was written against. Manual saves, autosaves and the snapshot taken before a
 * restore all live here, told apart by `save_type`.
 */
export const imageDocumentVersions = sqliteTable(
  "image_document_versions",
  {
    id: text("id").primaryKey(),
    /**
     * The sketch this snapshot belongs to. The cascade keeps a deleted
     * document's history from outliving it.
     */
    image_document_id: text("image_document_id")
      .notNull()
      .references(() => imageDocuments.id, { onDelete: "cascade" }),
    /**
     * Owner at snapshot time, copied from the parent. Version reads happen
     * against a document id alone, so the snapshot carries the owner it was
     * written for rather than trusting whatever row holds that id now.
     */
    user_id: text("user_id").notNull(),
    name: text("name"),
    /** Monotonic per sketch. */
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    width: integer("width").notNull().default(1024),
    height: integer("height").notNull().default(1024),
    background_color: text("background_color").notNull().default("#ffffff"),
    document: text("document").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_idv_document").on(table.image_document_id),
    index("idx_idv_user").on(table.user_id),
    index("idx_idv_document_save_type_created").on(
      table.image_document_id,
      table.save_type,
      table.created_at
    ),
    // Two writers that read the same MAX(version) must not both land: the
    // second insert fails instead of minting a duplicate version number.
    uniqueIndex("idx_idv_document_version").on(
      table.image_document_id,
      table.version
    )
  ]
);
