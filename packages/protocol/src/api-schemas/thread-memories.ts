import { z } from "zod";

// ── Resource reference ───────────────────────────────────────────
// A typed handle to any resource a memory is about (asset, workflow,
// collection, node, job, timeline, script, storyboard, image_document,
// thread, url, …). `type` is an open string so new kinds need no change.
export const threadMemoryResource = z.object({
  type: z.string(),
  id: z.string(),
  uri: z.string().optional(),
  label: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type ThreadMemoryResource = z.infer<typeof threadMemoryResource>;

// ── Memory response ──────────────────────────────────────────────
export const threadMemoryResponse = z.object({
  id: z.string(),
  thread_id: z.string(),
  kind: z.string(),
  title: z.string(),
  content: z.string(),
  resources: z.array(threadMemoryResource),
  created_at: z.string(),
  updated_at: z.string()
});
export type ThreadMemoryResponse = z.infer<typeof threadMemoryResponse>;

// ── list ─────────────────────────────────────────────────────────
// Thread-scoped, newest first. Backed by the (thread_id, created_at)
// composite index so the sidebar query is a single indexed range scan.
export const listInput = z.object({
  thread_id: z.string().min(1),
  limit: z.number().int().min(1).max(200).default(100)
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  memories: z.array(threadMemoryResponse)
});
export type ListOutput = z.infer<typeof listOutput>;

// ── delete ───────────────────────────────────────────────────────
export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

export const deleteOutput = z.object({
  ok: z.literal(true)
});
export type DeleteOutput = z.infer<typeof deleteOutput>;
