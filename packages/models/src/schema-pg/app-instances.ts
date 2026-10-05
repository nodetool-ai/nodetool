import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import type { AppRunSnapshot } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { jsonText } from "./helpers.js";
import { applications } from "./applications.js";

export const appInstances = pgTable(
  "app_instances",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    application_id: text("application_id").references(() => applications.id, {
      onDelete: "cascade"
    }),
    source_id: text("source_id").notNull(),
    name: text("name").notNull(),
    version: integer("version"),
    snapshot: jsonText<AppRunSnapshot>()("snapshot").notNull(),
    variables: jsonText<Record<string, unknown>>()("variables").notNull(),
    revision: integer("revision").notNull().default(0),
    is_default: integer("is_default").notNull().default(0),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (t) => [
    index("idx_app_instance_owner_source").on(t.user_id, t.source_id),
    index("idx_app_instance_application").on(t.application_id),
    uniqueIndex("idx_app_instance_default")
      .on(t.user_id, t.source_id)
      .where(sql`is_default = 1`)
  ]
);
