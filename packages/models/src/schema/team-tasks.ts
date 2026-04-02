import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { jsonText } from "./helpers.js";

/**
 * Persistent task board for agent teams.
 * Tasks have dependencies, belong to a team, and follow the lifecycle:
 * open → claimed → working → done/failed/blocked
 */
export const teamTasks = sqliteTable(
  "nodetool_team_tasks",
  {
    id: text("id").primaryKey(),
    team_id: text("team_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("open"),
    created_by: text("created_by").notNull(),
    claimed_by: text("claimed_by"),
    depends_on: jsonText<string[]>()("depends_on").notNull(),
    required_skills: jsonText<string[]>()("required_skills").notNull(),
    priority: integer("priority").notNull().default(5),
    artifacts: jsonText<unknown[]>()("artifacts").notNull(),
    parent_task_id: text("parent_task_id"),
    result: jsonText<unknown>()("result"),
    failure_reason: text("failure_reason"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_team_tasks_team_id").on(table.team_id),
    index("idx_team_tasks_status").on(table.status),
    index("idx_team_tasks_team_status").on(table.team_id, table.status),
    index("idx_team_tasks_parent").on(table.parent_task_id)
  ]
);
