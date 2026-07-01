import { pgTable, text, index } from "drizzle-orm/pg-core";

export const threads = pgTable(
  "nodetool_threads",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    // Workflow this conversation belongs to. Null for workflow-agnostic
    // threads (e.g. the global chat). Lets the node editor scope its thread
    // list to the open workflow.
    workflow_id: text("workflow_id"),
    title: text("title").notNull().default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_threads_user_id").on(table.user_id),
    index("idx_threads_user_workflow").on(table.user_id, table.workflow_id)
  ]
);
