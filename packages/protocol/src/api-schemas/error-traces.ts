import { z } from "zod";

// Mirrors ERROR_TRACE_SOURCES / ERROR_TRACE_SEVERITIES in
// @nodetool-ai/models (error-trace-redaction.ts). Protocol cannot import models.
export const errorTraceSource = z.enum([
  "server",
  "trpc",
  "http",
  "job",
  "web",
  "electron",
  "agent",
  "cli"
]);
export type ErrorTraceSource = z.infer<typeof errorTraceSource>;

export const errorTraceSeverity = z.enum(["fatal", "error", "warning"]);
export type ErrorTraceSeverity = z.infer<typeof errorTraceSeverity>;

const contextValue = z.union([z.string(), z.number(), z.boolean()]);

// ── Stored trace ─────────────────────────────────────────────────
// Every field is already redacted. `user_id` is never returned: a caller only
// ever sees their own traces.
export const errorTraceResponse = z.object({
  id: z.string(),
  fingerprint: z.string(),
  source: errorTraceSource,
  severity: errorTraceSeverity,
  error_type: z.string().nullable(),
  message: z.string(),
  stack: z.string().nullable(),
  context: z.record(z.string(), contextValue).nullable(),
  app_version: z.string().nullable(),
  platform: z.string().nullable(),
  created_at: z.string()
});
export type ErrorTraceResponse = z.infer<typeof errorTraceResponse>;

// ── Incoming trace ───────────────────────────────────────────────
// What a browser report or a sync push sends. The server redacts it again
// and drops context keys outside its allowlist, so these caps only bound the
// request size.
export const errorTraceInput = z.object({
  source: errorTraceSource,
  severity: errorTraceSeverity.optional(),
  error_type: z.string().max(500).nullable().optional(),
  message: z.string().min(1).max(20_000),
  stack: z.string().max(50_000).nullable().optional(),
  context: z.record(z.string(), contextValue).nullable().optional(),
  app_version: z.string().max(200).nullable().optional(),
  platform: z.string().max(200).nullable().optional(),
  created_at: z.string().max(64).optional()
});
export type ErrorTraceInput = z.infer<typeof errorTraceInput>;

// ── list ─────────────────────────────────────────────────────────
export const listInput = z.object({
  limit: z.number().int().min(1).max(500).default(50),
  source: errorTraceSource.optional(),
  severity: errorTraceSeverity.optional(),
  fingerprint: z.string().min(1).max(64).optional(),
  since: z.string().max(64).optional(),
  until: z.string().max(64).optional()
});
export type ListInput = z.infer<typeof listInput>;

export const listOutput = z.object({
  traces: z.array(errorTraceResponse)
});
export type ListOutput = z.infer<typeof listOutput>;

// ── summary ──────────────────────────────────────────────────────
export const summaryInput = z.object({
  since: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(200).default(20)
});
export type SummaryInput = z.infer<typeof summaryInput>;

export const errorTraceGroup = z.object({
  fingerprint: z.string(),
  count: z.number().int(),
  source: errorTraceSource,
  severity: errorTraceSeverity,
  error_type: z.string().nullable(),
  message: z.string(),
  first_seen: z.string(),
  last_seen: z.string(),
  latest_id: z.string()
});
export type ErrorTraceGroup = z.infer<typeof errorTraceGroup>;

export const summaryOutput = z.object({
  groups: z.array(errorTraceGroup)
});
export type SummaryOutput = z.infer<typeof summaryOutput>;

// ── get ──────────────────────────────────────────────────────────
// A full 32-character id or the exact 12-character prefix agents are shown.
export const getInput = z.object({
  id: z.string().min(12).max(64)
});
export type GetInput = z.infer<typeof getInput>;

// ── report ───────────────────────────────────────────────────────
// Markdown for a bug report. Name traces by id, or select by fingerprint or
// time; with neither, the most recent traces are used.
export const reportInput = z.object({
  ids: z.array(z.string().min(12).max(64)).max(50).optional(),
  fingerprint: z.string().min(1).max(64).optional(),
  since: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(50).default(10)
});
export type ReportInput = z.infer<typeof reportInput>;

export const reportOutput = z.object({
  markdown: z.string(),
  trace_ids: z.array(z.string())
});
export type ReportOutput = z.infer<typeof reportOutput>;

// ── capture ──────────────────────────────────────────────────────
// A client-side failure (the web app or the Electron renderer).
export const captureInput = errorTraceInput.extend({
  source: z.enum(["web", "electron"])
});
export type CaptureInput = z.infer<typeof captureInput>;

export const captureOutput = z.object({
  id: z.string().nullable()
});
export type CaptureOutput = z.infer<typeof captureOutput>;

// ── ingest ───────────────────────────────────────────────────────
// Opt-in sync from another install, authenticated by an access token.
export const ingestInput = z.object({
  traces: z.array(errorTraceInput).min(1).max(100)
});
export type IngestInput = z.infer<typeof ingestInput>;

export const ingestOutput = z.object({
  stored: z.number().int()
});
export type IngestOutput = z.infer<typeof ingestOutput>;
