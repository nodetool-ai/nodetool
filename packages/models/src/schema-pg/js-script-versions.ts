import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import { jsScripts } from "./js-scripts.js";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

/** See the SQLite schema for the column semantics. */
export const jsScriptVersions = pgTable(
  "js_script_versions",
  {
    id: text("id").primaryKey(),
    js_script_id: text("js_script_id")
      .notNull()
      .references(() => jsScripts.id, { onDelete: "cascade" }),
    user_id: text("user_id").notNull(),
    name: text("name"),
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    document: jsonText<JsScriptDocument>()("document").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_jsv_script").on(table.js_script_id),
    index("idx_jsv_user").on(table.user_id),
    index("idx_jsv_script_save_type_created").on(
      table.js_script_id,
      table.save_type,
      table.created_at
    ),
    uniqueIndex("idx_jsv_script_version").on(table.js_script_id, table.version)
  ]
);
