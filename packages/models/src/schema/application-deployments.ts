import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { isNull } from "drizzle-orm";
import {
  sqliteTable,
  text,
  index,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

import { applications } from "./applications.js";

/** A revocable hidden-URL deployment for a published application. */
export const applicationDeployments = sqliteTable(
  "application_deployments",
  {
    id: text("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    user_id: text("user_id").notNull(),
    token: text("token").notNull(),
    created_at: text("created_at").notNull(),
    revoked_at: text("revoked_at")
  },
  (table) => [
    index("idx_application_deployment_app").on(table.application_id),
    uniqueIndex("idx_application_deployment_token").on(table.token),
    uniqueIndex("idx_application_deployment_one_live")
      .on(table.application_id)
      .where(isNull(table.revoked_at))
  ]
);

export type ApplicationDeploymentRow = InferSelectModel<
  typeof applicationDeployments
>;
export type NewApplicationDeployment = InferInsertModel<
  typeof applicationDeployments
>;
