import { z } from "zod";

// ── Resource reference ───────────────────────────────────────────
// A typed handle to any resource a memory is about (asset, workflow,
// collection, node, job, timeline, script, storyboard, image_document,
// thread, url, …). `type` is an open string so new kinds need no change.
export const memoryResource = z.object({
  type: z.string(),
  id: z.string(),
  uri: z.string().optional(),
  label: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type MemoryResource = z.infer<typeof memoryResource>;

// ── Memory response ──────────────────────────────────────────────
export const memoryResponse = z.object({
  id: z.string(),
  thread_id: z.string(),
  kind: z.string(),
  title: z.string(),
  content: z.string(),
  resources: z.array(memoryResource),
  created_at: z.string(),
  updated_at: z.string()
});
export type MemoryResponse = z.infer<typeof memoryResponse>;

// ── list ─────────────────────────────────────────────────────────
// User-scoped, newest first. Omit `thread_id` for every conversation
// (the (user_id, created_at) index); pass one to narrow to the memories
// recorded in that thread.
export const listInput = z.object({
  thread_id: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(100)
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  memories: z.array(memoryResponse)
});
export type ListOutput = z.infer<typeof listOutput>;

// ── search ───────────────────────────────────────────────────────
// Keyword match over title and content: every word must appear, matched
// case-insensitively. Runs as a LIKE in SQL, which means the same thing in
// SQLite and Postgres.
export const searchInput = z.object({
  query: z.string().min(1).max(512),
  thread_id: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50)
});
export type SearchInput = z.infer<typeof searchInput>;

export const searchOutput = z.object({
  memories: z.array(memoryResponse)
});
export type SearchOutput = z.infer<typeof searchOutput>;

// ── delete ───────────────────────────────────────────────────────
export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

export const deleteOutput = z.object({
  ok: z.literal(true)
});
export type DeleteOutput = z.infer<typeof deleteOutput>;
