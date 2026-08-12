import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { jsScripts } from "./js-scripts.js";

/**
 * An immutable snapshot of a JS script document. Manual saves, autosaves and
 * the snapshot taken before a restore all live here, told apart by `save_type`.
 */
export const jsScriptVersions = sqliteTable(
  "js_script_versions",
  {
    id: text("id").primaryKey(),
    /**
     * The script this snapshot belongs to. The cascade keeps a deleted
     * script's history from outliving it.
     */
    js_script_id: text("js_script_id")
      .notNull()
      .references(() => jsScripts.id, { onDelete: "cascade" }),
    /**
     * Owner at snapshot time, copied from the parent. Version reads happen
     * against a script id alone, so the snapshot carries the owner it was
     * written for rather than trusting whatever row holds that id now.
     */
    user_id: text("user_id").notNull(),
    name: text("name"),
    /** Monotonic per script. */
    version: integer("version").notNull().default(1),
    save_type: text("save_type").notNull().default("manual"),
    document: text("document").notNull(),
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
    // Two writers that read the same MAX(version) must not both land: the
    // second insert fails instead of minting a duplicate version number.
    uniqueIndex("idx_jsv_script_version").on(table.js_script_id, table.version)
  ]
);
