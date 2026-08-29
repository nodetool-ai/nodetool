import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

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
    /**
     * The app this snapshot belongs to. The cascade is what keeps a deleted
     * app's history from outliving it: an id is client-supplied, so an orphan
     * left behind here would be readable by whoever recreates that id.
     */
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    /**
     * Owner at publish time, copied from the parent. Version reads happen
     * against an application id alone, so the snapshot carries the owner it
     * was written for rather than trusting whatever row holds that id now.
     */
    user_id: text("user_id"),
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
    index("idx_application_version_released").on(table.released),
    // Two publishers that read the same MAX(version) must not both land: the
    // second insert fails instead of minting a duplicate version number.
    uniqueIndex("idx_application_version_app_version").on(
      table.application_id,
      table.version
    )
  ]
);

/**
 * An app's hidden-URL deployment: the app is served to anyone holding `token`,
 * with no login. One row per application — the link is the app's, not one of
 * many — and revoking sets `revoked_at` rather than deleting, so a link that
 * was withdrawn stays withdrawn if the same token were ever minted again.
 */
export const applicationDeployments = sqliteTable(
  "application_deployments",
  {
    id: text("id").primaryKey(),
    /** Cascades with the app, like `application_versions` and for the reason given there. */
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    /** Owner at deploy time. Runs of the deployed app execute as this user. */
    user_id: text("user_id").notNull(),
    token: text("token").notNull(),
    created_at: text("created_at").notNull(),
    revoked_at: text("revoked_at")
  },
  (table) => [
    index("idx_application_deployment_app").on(table.application_id),
    // The token is looked up on every anonymous request and is the whole
    // secret, so it is unique across apps as well as fast to find.
    uniqueIndex("idx_application_deployment_token").on(table.token)
  ]
);
