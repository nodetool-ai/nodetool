import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";
import type { ApplicationCapabilities } from "../application.js";

/** See the SQLite schema for the column semantics. */
export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    project_id: text("project_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    document: jsonText<ApplicationDocument>()("document").notNull(),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_application_user").on(table.user_id),
    index("idx_application_project").on(table.project_id),
    index("idx_application_updated").on(table.updated_at)
  ]
);

export const applicationVersions = pgTable(
  "application_versions",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    user_id: text("user_id"),
    version: integer("version").notNull(),
    document: jsonText<ApplicationDocument>()("document").notNull(),
    capabilities: jsonText<ApplicationCapabilities>()("capabilities").notNull(),
    workflow_graphs: text("workflow_graphs"),
    released: integer("released").notNull(),
    created_at: text("created_at").notNull()
  },
  (table) => [
    index("idx_application_version_app").on(table.application_id),
    index("idx_application_version_released").on(table.released),
    uniqueIndex("idx_application_version_app_version").on(
      table.application_id,
      table.version
    )
  ]
);
