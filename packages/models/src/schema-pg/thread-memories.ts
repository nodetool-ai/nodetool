import { pgTable, text, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import type { ThreadMemoryResource } from "../thread-memory.js";

export const threadMemories = pgTable(
  "nodetool_thread_memories",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    // Conversation this memory belongs to. Memories are scoped to a single
    // thread so what the agent remembers in one project doesn't bleed into an
    // unrelated conversation.
    thread_id: text("thread_id").notNull(),
    // Category hint: note | fact | preference | decision | asset.
    kind: text("kind").notNull().default("note"),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    // Typed references to resources this memory is about (generated assets,
    // workflows, collections, URLs, …) so they can be reused later.
    resources: jsonText<ThreadMemoryResource[]>()("resources"),
    metadata: jsonText<Record<string, unknown>>()("metadata"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    index("idx_thread_memory_thread").on(table.thread_id),
    index("idx_thread_memory_user").on(table.user_id)
  ]
);
