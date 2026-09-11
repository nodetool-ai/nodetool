import { pgTable, text, index } from "drizzle-orm/pg-core";

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull(),
    /** Free text — "spot", "trailer", "report", whatever the user calls it. */
    kind: text("kind").notNull().default(""),
    /** Set when a finished project is hidden from normal project selection. */
    archived_at: text("archived_at"),
    /** Tombstone retained after content deletion to reject delayed writes. */
    deleted_at: text("deleted_at"),
    /**
     * The conversation that builds this project. Null until someone talks to
     * the project agent — a project made by hand never has one, and an empty
     * thread row would be indistinguishable from a conversation nobody read.
     */
    thread_id: text("thread_id"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_project_user").on(table.user_id),
    index("idx_project_updated").on(table.updated_at),
    index("idx_project_lifecycle").on(table.user_id, table.archived_at, table.deleted_at)
  ]
);
