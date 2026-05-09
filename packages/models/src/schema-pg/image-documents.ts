import { pgTable, text, integer, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import type { ImageDocumentData } from "../image-document.js";

export const imageDocuments = pgTable(
  "image_documents",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    workflow_id: text("workflow_id"),
    name: text("name").notNull(),
    width: integer("width").notNull().default(1024),
    height: integer("height").notNull().default(1024),
    background_color: text("background_color").notNull().default("#ffffff"),
    document: jsonText<ImageDocumentData>()("document").notNull(),
    thumbnail_asset_id: text("thumbnail_asset_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_image_document_user").on(table.user_id),
    index("idx_image_document_project").on(table.project_id),
    index("idx_image_document_updated").on(table.updated_at)
  ]
);
