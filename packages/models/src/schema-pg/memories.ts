import { pgTable, text, index } from "drizzle-orm/pg-core";
import { jsonText } from "./helpers.js";
import type { MemoryResource } from "../memory.js";

export const memories = pgTable(
  "nodetool_memories",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    // Conversation the memory was recorded in. Kept as provenance, not as a
    // boundary: memories are user-scoped and every thread can read them all.
    // Empty when the memory was written outside a chat thread.
    thread_id: text("thread_id").notNull().default(""),
    // Category hint: note | fact | preference | decision | resource.
    kind: text("kind").notNull().default("note"),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    // Typed references to resources this memory is about (generated assets,
    // workflows, collections, URLs, …) so they can be reused later.
    resources: jsonText<MemoryResource[]>()("resources"),
    metadata: jsonText<Record<string, unknown>>()("metadata"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull()
  },
  (table) => [
    // Primary access pattern: list one user's memories newest-first across
    // every thread. The composite (user_id, created_at) resolves that as an
    // index range scan with no separate sort.
    index("idx_memory_user_created").on(table.user_id, table.created_at),
    // Secondary: the sidebar's "recorded in this thread" filter.
    index("idx_memory_thread_created").on(table.thread_id, table.created_at)
  ]
);
