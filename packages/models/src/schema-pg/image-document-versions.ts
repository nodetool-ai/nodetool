import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import { imageDocuments } from "./image-documents.js";
import type { ImageDocumentData } from "../image-document.js";

/** See the SQLite schema for the column semantics. */
export const imageDocumentVersions = pgTable(
  "image_document_versions",
  {
    id: text("id").primaryKey(),
    image_document_id: text("image_document_id")
      .notNull()
      .references(() => imageDocuments.id, { onDelete: "cascade" }),
    user_id: text("user_id").notNull(),
    name: text("name"),
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    width: integer("width").notNull().default(1024),
    height: integer("height").notNull().default(1024),
    background_color: text("background_color").notNull().default("#ffffff"),
    document: jsonText<ImageDocumentData>()("document").notNull(),
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
    uniqueIndex("idx_idv_document_version").on(
      table.image_document_id,
      table.version
    )
  ]
);
