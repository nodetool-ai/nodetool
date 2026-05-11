import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

const NOW = sql`(unixepoch('subsec') * 1000)`;

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    state: text("state").notNull().default("draft"),
    owner: text("owner"),
    body: text("body").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(NOW),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(NOW),
  },
  (t) => ({
    stateIdx: index("plans_state_idx").on(t.state),
  })
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    state: text("state").notNull().default("todo"),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    assignee: text("assignee"),
    body: text("body").notNull().default(""),
    estimate: text("estimate"),
    tags: text("tags").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(NOW),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(NOW),
  },
  (t) => ({
    planIdx: index("tasks_plan_idx").on(t.planId),
    stateIdx: index("tasks_state_idx").on(t.state),
    assigneeIdx: index("tasks_assignee_idx").on(t.assignee),
  })
);

export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: text("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    dependsOnIdx: index("task_deps_depends_idx").on(t.dependsOnId),
  })
);

export const taskNotes = sqliteTable(
  "task_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(NOW),
  },
  (t) => ({
    taskIdx: index("task_notes_task_idx").on(t.taskId),
  })
);

export const acceptanceCriteria = sqliteTable(
  "acceptance_criteria",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull(),
  },
  (t) => ({
    taskIdx: index("ac_task_idx").on(t.taskId),
  })
);

export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    model: text("model"),
    branch: text("branch"),
    worktreePath: text("worktree_path"),
    prUrl: text("pr_url"),
    error: text("error"),
    totalCostUsd: real("total_cost_usd"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    sdkSessionId: text("sdk_session_id"),
    resumeOf: integer("resume_of"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(NOW),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    taskIdx: index("agent_sessions_task_idx").on(t.taskId),
    statusIdx: index("agent_sessions_status_idx").on(t.status),
  })
);

export const agentEvents = sqliteTable(
  "agent_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: text("payload").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(NOW),
  },
  (t) => ({
    sessionIdx: index("agent_events_session_idx").on(t.sessionId),
    createdIdx: index("agent_events_created_idx").on(t.createdAt),
  })
);

export type Plan = typeof plans.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskNote = typeof taskNotes.$inferSelect;
export type AcceptanceCriterion = typeof acceptanceCriteria.$inferSelect;
export type AgentSession = typeof agentSessions.$inferSelect;
export type AgentEvent = typeof agentEvents.$inferSelect;
