import { z } from "zod";

// ── Message response ──────────────────────────────────────────────
// Mirrors `toMessageResponse` in the legacy http-api.ts handlers.
// Content has been already run through `resolveContentUrls` — asset_id
// references turned into full URLs before reaching the client.
export const messageResponse = z.object({
  type: z.literal("message"),
  id: z.string(),
  user_id: z.string(),
  thread_id: z.string(),
  role: z.string(),
  name: z.string().nullable(),
  content: z.union([
    z.string(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
    z.null()
  ]),
  tool_calls: z.array(z.unknown()).nullable(),
  tool_call_id: z.string().nullable(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  workflow_id: z.string().nullable().optional(),
  agent_mode: z.boolean().nullable().optional(),
  help_mode: z.boolean().nullable().optional(),
  agent_execution_id: z.string().nullable().optional(),
  execution_event_type: z.string().nullable().optional(),
  workflow_target: z.string().nullable().optional(),
  // Media-generation metadata persisted on assistant messages produced by the
  // media composer. Echoed back on `messages.list` so the chat view can render
  // the header chips (model, resolution, variations, …) from MediaOutputGroup.
  media_generation: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string(),
  updated_at: z.string()
});
export type MessageResponse = z.infer<typeof messageResponse>;

// ── list (GET /api/messages?thread_id=...) ────────────────────────
export const listInput = z.object({
  thread_id: z.string().min(1),
  limit: z.number().int().min(1).max(1000).default(100),
  cursor: z.string().optional(),
  // Legacy accepts "true" / "false" strings from query params. tRPC sees a
  // proper boolean. `undefined` means "use Message.paginate default".
  reverse: z.boolean().optional()
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  messages: z.array(messageResponse),
  next: z.string().nullable()
});
export type ListOutput = z.infer<typeof listOutput>;

// ── create (POST /api/messages) ───────────────────────────────────
// `thread_id` is optional — when omitted, the server auto-creates a
// "New Thread" for the caller.
export const createInput = z.object({
  thread_id: z.string().optional(),
  role: z.string().min(1),
  name: z.string().nullable().optional(),
  content: z.union([
    z.string(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
    z.null()
  ]),
  tool_call_id: z.string().nullable().optional(),
  tool_calls: z.array(z.unknown()).nullable().optional()
});
export type CreateInput = z.infer<typeof createInput>;

// ── get (GET /api/messages/:id) ───────────────────────────────────
export const getInput = z.object({
  id: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

// ── delete (DELETE /api/messages/:id) ─────────────────────────────
export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

// Legacy returned HTTP 204 No Content. tRPC requires a JSON payload; a
// one-field ack keeps clients happy and is trivially ignorable.
export const deleteOutput = z.object({
  ok: z.literal(true)
});
export type DeleteOutput = z.infer<typeof deleteOutput>;
