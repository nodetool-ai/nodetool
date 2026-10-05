import { z } from "zod";

/** Largest report bundle the server accepts, after base64 decoding. */
export const MAX_BUG_REPORT_BUNDLE_BYTES = 25 * 1024 * 1024;

// Mirrors BugReportSource in web/src/utils/bugReportBundle.ts.
export const bugReportSource = z.enum([
  "node-error",
  "app-crash",
  "panel-crash",
  "job-failure",
  "operation-failure",
  "provider-call",
  "notification",
  "manual"
]);
export type BugReportSource = z.infer<typeof bugReportSource>;

// ── submit ───────────────────────────────────────────────────────
// `body` is the same markdown a GitHub issue would carry. `bundle_base64` is
// the zip the reporter reviewed in the dialog: the attached data sections and
// their own files.
export const submitInput = z.object({
  source: bugReportSource,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(20_000),
  steps: z.string().max(20_000).optional(),
  expected: z.string().max(20_000).optional(),
  body: z.string().min(1).max(50_000),
  bundle_base64: z
    .string()
    .max(Math.ceil(MAX_BUG_REPORT_BUNDLE_BYTES / 3) * 4)
    .optional()
});
export type SubmitInput = z.infer<typeof submitInput>;

export const submitOutput = z.object({
  id: z.string()
});
export type SubmitOutput = z.infer<typeof submitOutput>;
