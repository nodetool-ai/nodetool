import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * A declarative, reusable preset describing how to provision a GPU worker.
 * Profiles live in the DB (not deployment.yaml) so the UI can drive the flow.
 */
export const workerProfiles = sqliteTable(
  "worker_profiles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    target: text("target").notNull(),
    image: text("image").notNull(),
    spec: jsonText<Record<string, unknown>>()("spec").notNull(),
    token_policy: text("token_policy").notNull(),
    idle_timeout_minutes: integer("idle_timeout_minutes"),
    max_lifetime_minutes: integer("max_lifetime_minutes"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [uniqueIndex("idx_worker_profiles_name").on(table.name)]
);

/**
 * An ephemeral, billing-sensitive live handle to a provisioned worker. Never
 * declarative — nothing must ever resurrect a torn-down GPU pod.
 */
export const workerInstances = sqliteTable(
  "worker_instances",
  {
    id: text("id").primaryKey(),
    profile_name: text("profile_name").notNull(),
    target: text("target").notNull(),
    provider_ref: text("provider_ref").notNull(),
    ws_url: text("ws_url").notNull(),
    token: text("token"),
    status: text("status").notNull(),
    attached_to: text("attached_to"),
    created_at: text("created_at").notNull(),
    last_activity_at: text("last_activity_at").notNull(),
    estimated_cost_usd: real("estimated_cost_usd")
  },
  (table) => [
    index("idx_worker_instances_status").on(table.status),
    index("idx_worker_instances_profile_name").on(table.profile_name)
  ]
);
