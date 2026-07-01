import { z } from "zod";

// ── Thread response ──────────────────────────────────────────────
// Mirrors `toThreadResponse` in the legacy http-api.ts handler.
export const threadResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  workflow_id: z.string().nullable().optional(),
  title: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  etag: z.string().nullable().optional()
});
export type ThreadResponse = z.infer<typeof threadResponse>;

// ── list (GET /api/threads) ──────────────────────────────────────
// `workflow_id` scopes the list to one workflow's conversations (node
// editor); omit it to list all of the user's threads (global chat).
export const listInput = z.object({
  limit: z.number().int().min(1).max(500).default(10),
  cursor: z.string().optional(),
  reverse: z.boolean().optional(),
  workflow_id: z.string().optional()
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  threads: z.array(threadResponse),
  next: z.string().nullable()
});
export type ListOutput = z.infer<typeof listOutput>;

// ── get (GET /api/threads/:id) ───────────────────────────────────
export const getInput = z.object({
  id: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

// ── create (POST /api/threads) ───────────────────────────────────
// `title` is optional; defaults to "New Thread" server-side.
export const createInput = z.object({
  title: z.string().optional(),
  workflow_id: z.string().nullable().optional()
});
export type CreateInput = z.infer<typeof createInput>;

// ── update (PUT /api/threads/:id) ────────────────────────────────
export const updateInput = z.object({
  id: z.string().min(1),
  title: z.string().min(1)
});
export type UpdateInput = z.infer<typeof updateInput>;

// ── delete (DELETE /api/threads/:id) ─────────────────────────────
// Legacy returned HTTP 204; tRPC requires a JSON payload so we return an ack.
export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

export const deleteOutput = z.object({
  ok: z.literal(true)
});
export type DeleteOutput = z.infer<typeof deleteOutput>;

// ── summarize (POST /api/threads/:id/summarize) ──────────────────
// Derives a title from the first user message content and saves it.
export const summarizeInput = z.object({
  id: z.string().min(1)
});
export type SummarizeInput = z.infer<typeof summarizeInput>;

export const summarizeOutput = z.object({
  title: z.string()
});
export type SummarizeOutput = z.infer<typeof summarizeOutput>;
