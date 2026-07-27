import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * A mini app: a UI document plus typed bindings to workflow operations,
 * resources, and variables. Project-scoped like its sibling document editors
 * (storyboards, timeline_sequences, image_documents), and unprefixed to match
 * them rather than the older `nodetool_`-prefixed tables.
 */
export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    document: text("document").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_application_user").on(table.user_id),
    index("idx_application_project").on(table.project_id),
    index("idx_application_updated").on(table.updated_at)
  ]
);

/**
 * An immutable snapshot of an application: UI, bindings, variables, and the
 * workflow versions its operations were pinned to. `released` marks the
 * snapshot the published app serves; rollback moves that flag.
 */
export const applicationVersions = sqliteTable(
  "application_versions",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id").notNull(),
    /** Monotonic per application. */
    version: integer("version").notNull(),
    document: text("document").notNull(),
    /** Workflows the release may invoke, derived at publish time. */
    capabilities: text("capabilities").notNull(),
    /**
     * The graph of every workflow the release invokes, as it stood at publish
     * time, keyed by workflow id. The release runs these rather than the live
     * graphs, so editing a workflow cannot change what shipped. Null on
     * snapshots published before releases pinned anything.
     */
    workflow_graphs: text("workflow_graphs"),
    released: integer("released").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_application_version_app").on(table.application_id),
    index("idx_application_version_released").on(table.released)
  ]
);
