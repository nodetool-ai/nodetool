import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

export const workflows = sqliteTable(
  "nodetool_workflows",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull().default(""),
    tool_name: text("tool_name"),
    description: text("description").default(""),
    tags: jsonText<string[]>()("tags"),
    thumbnail: text("thumbnail"),
    thumbnail_url: text("thumbnail_url"),
    graph: jsonText<{
      nodes: Record<string, unknown>[];
      edges: Record<string, unknown>[];
    }>()("graph").notNull(),
    settings: jsonText<Record<string, unknown>>()("settings"),
    package_name: text("package_name"),
    path: text("path"),
    run_mode: text("run_mode"),
    workspace_id: text("workspace_id"),
    project_id: text("project_id").notNull().default("default"),
    html_app: text("html_app"),
    app_doc: jsonText<Record<string, unknown>>()("app_doc"),
    receive_clipboard: integer("receive_clipboard", { mode: "boolean" }),
    access: text("access").notNull().default("private"),
    // Path of the workflow's file, relative to the folder of the project in
    // `project_id`: `Workflows/<name>.workflow.json`. Null until the file is
    // first written.
    file_path: text("file_path"),
    // SHA-256 of the file as NodeTool last wrote or imported it, in hex. A
    // file with another hash holds an edit NodeTool has not seen. Null until
    // the row is first synced with a file.
    file_hash: text("file_hash"),
    // What the last reconcile found wrong with the file: "File missing", or
    // the reason an edited file was refused. Null while row and file agree.
    file_error: text("file_error"),
    // The editing instance that wrote the stored revision: 32 hex characters
    // a client draws each time it opens the document. Null when the last save
    // carried none. A save from another instance first keeps the stored
    // revision as a version.
    last_writer_instance: text("last_writer_instance"),
    // The document schema version the stored graph was written in. A save in
    // a lower version is refused, so an older client cannot reduce it.
    schema_version: integer("schema_version").notNull().default(1),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_workflows_user_id").on(table.user_id),
    index("idx_workflows_user_project").on(table.user_id, table.project_id),
    index("idx_workflows_access").on(table.access)
  ]
);
