import { z } from "zod";

// ── Full job response ────────────────────────────────────────────
// Mirrors `toJobResponse` in the legacy http-api.ts handler. `cost` is
// always `null` in the REST response; the DB field exists but isn't
// surfaced through this endpoint today.
export const jobResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  job_type: z.literal("workflow"),
  status: z.string(),
  name: z.string().nullable(),
  workflow_id: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
  cost: z.number().nullable()
});
export type JobResponse = z.infer<typeof jobResponse>;

// ── Background-job response ──────────────────────────────────────
// Mirrors `toBackgroundJobResponse` — a slimmer shape used by
// `/running/all` and the cancel endpoint response.
export const backgroundJobResponse = z.object({
  job_id: z.string(),
  status: z.string(),
  workflow_id: z.string(),
  created_at: z.string().nullable(),
  is_running: z.boolean(),
  is_completed: z.boolean()
});
export type BackgroundJobResponse = z.infer<typeof backgroundJobResponse>;

// ── list (GET /api/jobs) ─────────────────────────────────────────
export const listInput = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  workflow_id: z.string().optional()
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  jobs: z.array(jobResponse),
  next_start_key: z.string().nullable()
});
export type ListOutput = z.infer<typeof listOutput>;

// ── runningAll (GET /api/jobs/running/all) ───────────────────────
// Returns up to 500 running/scheduled jobs for the user.
export const runningAllOutput = z.array(backgroundJobResponse);
export type RunningAllOutput = z.infer<typeof runningAllOutput>;

// ── get (GET /api/jobs/:id) ──────────────────────────────────────
export const getInput = z.object({
  id: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;

// ── delete (DELETE /api/jobs/:id) ────────────────────────────────
// Legacy returned 204 No Content; we return an ack to satisfy tRPC's
// JSON-required transport.
export const deleteInput = z.object({
  id: z.string().min(1)
});
export type DeleteInput = z.infer<typeof deleteInput>;

export const deleteOutput = z.object({
  ok: z.literal(true)
});
export type DeleteOutput = z.infer<typeof deleteOutput>;

// ── cancel (POST /api/jobs/:id/cancel) ───────────────────────────
// Marks the job as cancelled via `Job.markCancelled()` and saves.
// Returns the background-job shape (not the full one).
export const cancelInput = z.object({
  id: z.string().min(1)
});
export type CancelInput = z.infer<typeof cancelInput>;

export const cancelOutput = backgroundJobResponse;
export type CancelOutput = z.infer<typeof cancelOutput>;
