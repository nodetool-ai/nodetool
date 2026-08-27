import { sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

export const skills = sqliteTable(
  "skills",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    content: text("content").notNull().default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_skills_user").on(table.user_id),
    index("idx_skills_user_name").on(table.user_id, table.name),
    uniqueIndex("idx_skills_user_name_unique").on(table.user_id, table.name),
    index("idx_skills_updated").on(table.updated_at)
  ]
);

export type SkillInsert = InferInsertModel<typeof skills>;
export type SkillSelect = InferSelectModel<typeof skills>;
