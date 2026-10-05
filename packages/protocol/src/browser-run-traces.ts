import { z } from "zod";
import { traceRecordSchema, TRACE_SPAN_EVENT_LIMIT } from "./run-trace.js";

export const BROWSER_TRACE_SOURCE_KEY = "nodetool.trace.source";
/** This reserved host marker is outside the server instance-id character set. */
export const BROWSER_APP_RUNNER_INSTANCE = "@browser";
export const BROWSER_TRACE_BATCH_LIMIT = 50;
export const BROWSER_TRACE_BODY_BYTE_LIMIT = 256_000;
export const BROWSER_TRACE_CLOSE_WINDOW_MS = 5 * 60_000;
export const BROWSER_TRACE_CLOCK_SKEW_MS = 30_000;
export const browserTraceRecordSchema = traceRecordSchema.extend({
  name: z.enum(["ui.action", "ui.resolve_params", "ui.fold", "ui.widget_error", "workflow.run", "node.process"]),
  events: traceRecordSchema.shape.events.max(TRACE_SPAN_EVENT_LIMIT)
}).superRefine((record, ctx) => {
  if (record.resource[BROWSER_TRACE_SOURCE_KEY] !== "browser") {
    ctx.addIssue({ code: "custom", message: "Browser provenance required", path: ["resource", BROWSER_TRACE_SOURCE_KEY] });
  }
  if (record.parent_span_id === record.span_id || record.end_time_ms < record.start_time_ms ||
      Math.abs(record.duration_ms - (record.end_time_ms - record.start_time_ms)) > 1) {
    ctx.addIssue({ code: "custom", message: "Invalid span ancestry or timing" });
  }
  if (Object.keys(record.attributes).length > 128 || Object.keys(record.resource).length > 32 ||
      record.events.some((event) => (event.id?.length ?? 0) > 80 || Object.keys(event.attributes ?? {}).length > 128 || event.time_ms < record.start_time_ms || event.time_ms > record.end_time_ms)) {
    ctx.addIssue({ code: "custom", message: "Span fields exceed limits or event timing" });
  }
});
export const browserRunSpansInputSchema = z.object({ records: z.array(browserTraceRecordSchema).min(1).max(BROWSER_TRACE_BATCH_LIMIT) }).strict();
export const browserRunSpansResultSchema = z.object({ accepted: z.number().int().min(0), duplicate: z.number().int().min(0), dropped: z.number().int().min(0) });
export type BrowserRunSpansInput = z.infer<typeof browserRunSpansInputSchema>;
export type BrowserRunSpansResult = z.infer<typeof browserRunSpansResultSchema>;
export const browserRunStartInputSchema = z.object({ traceparent: z.string().regex(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/) }).strict();
export const browserRunStartResultSchema = z.object({ root_span_id: z.string().regex(/^[0-9a-f]{16}$/) });
