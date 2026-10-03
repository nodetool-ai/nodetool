/**
 * Error traces router — the caller's own redacted error traces.
 *
 * Every read is scoped to `ctx.userId`; there is no way to name another
 * user. `capture` records a client-side failure from the web app or the
 * Electron renderer. `ingest` is the receiving end of opt-in sync
 * (`NODETOOL_ERROR_TRACE_SYNC_URL`): another install posts its traces with an
 * access token, and they are stored under that token's user. Both write
 * paths redact on this side, whatever the sender did.
 */

import {
  formatErrorReport,
  getErrorTrace,
  ingestErrorTraces,
  listErrorTraces,
  recordErrorTrace,
  summarizeErrorTraces,
  type ErrorTraceRow
} from "@nodetool-ai/models";
import {
  captureInput,
  captureOutput,
  errorTraceResponse,
  getInput,
  ingestInput,
  ingestOutput,
  listInput,
  listOutput,
  reportInput,
  reportOutput,
  summaryInput,
  summaryOutput,
  type ErrorTraceInput,
  type ErrorTraceResponse
} from "@nodetool-ai/protocol/api-schemas/error-traces.js";
import { ApiErrorCode } from "../../error-codes.js";
import { isErrorTracingEnabled } from "../../error-traces.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";

function toResponse(trace: ErrorTraceRow): ErrorTraceResponse {
  return {
    id: trace.id,
    fingerprint: trace.fingerprint,
    source: trace.source,
    severity: trace.severity,
    error_type: trace.error_type,
    message: trace.message,
    stack: trace.stack,
    context: trace.context,
    app_version: trace.app_version,
    platform: trace.platform,
    created_at: trace.created_at
  };
}

function fromWire(trace: ErrorTraceInput) {
  return {
    source: trace.source,
    severity: trace.severity,
    errorType: trace.error_type ?? null,
    message: trace.message,
    stack: trace.stack ?? null,
    context: trace.context ?? null,
    appVersion: trace.app_version ?? null,
    platform: trace.platform ?? null,
    createdAt: trace.created_at
  };
}

async function resolveReportTraces(
  userId: string,
  input: { ids?: string[]; fingerprint?: string; since?: string; limit: number }
): Promise<ErrorTraceRow[]> {
  if (input.ids && input.ids.length > 0) {
    const traces: ErrorTraceRow[] = [];
    for (const id of input.ids) {
      const result = await getErrorTrace(userId, id);
      if (result.ok) traces.push(result.trace);
    }
    return traces;
  }
  return listErrorTraces(userId, {
    fingerprint: input.fingerprint,
    since: input.since,
    limit: input.limit
  });
}

export const errorTracesRouter = router({
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .query(async ({ ctx, input }) => {
      const traces = await listErrorTraces(ctx.userId, input);
      return { traces: traces.map(toResponse) };
    }),

  summary: protectedProcedure
    .input(summaryInput)
    .output(summaryOutput)
    .query(async ({ ctx, input }) => {
      const groups = await summarizeErrorTraces(ctx.userId, input);
      return { groups };
    }),

  get: protectedProcedure
    .input(getInput)
    .output(errorTraceResponse)
    .query(async ({ ctx, input }) => {
      const result = await getErrorTrace(ctx.userId, input.id);
      if (!result.ok) {
        if (result.reason === "ambiguous") {
          throwApiError(
            ApiErrorCode.INVALID_INPUT,
            "That short id matches more than one trace; use the full id"
          );
        }
        throwApiError(ApiErrorCode.NOT_FOUND, "Error trace not found");
      }
      return toResponse(result.trace);
    }),

  report: protectedProcedure
    .input(reportInput)
    .output(reportOutput)
    .query(async ({ ctx, input }) => {
      const traces = await resolveReportTraces(ctx.userId, input);
      return {
        markdown: formatErrorReport(traces),
        trace_ids: traces.map((trace) => trace.id)
      };
    }),

  capture: protectedProcedure
    .input(captureInput)
    .output(captureOutput)
    .mutation(async ({ ctx, input }) => {
      if (!isErrorTracingEnabled()) return { id: null };
      const { createdAt: _clientTime, ...trace } = fromWire(input);
      const row = await recordErrorTrace({ ...trace, userId: ctx.userId });
      return { id: row?.id ?? null };
    }),

  ingest: protectedProcedure
    .input(ingestInput)
    .output(ingestOutput)
    .mutation(async ({ ctx, input }) => {
      const stored = await ingestErrorTraces(
        ctx.userId,
        input.traces.map(fromWire)
      );
      return { stored };
    })
});
