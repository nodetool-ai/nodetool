import {
  BROWSER_TRACE_BODY_BYTE_LIMIT, BROWSER_TRACE_CLOSE_WINDOW_MS, BROWSER_TRACE_CLOCK_SKEW_MS, BROWSER_TRACE_SOURCE_KEY,
  browserRunSpansInputSchema, type BrowserRunSpansResult
} from "@nodetool-ai/protocol";
import { getAppRun, resolveRunReader, queryRunReaderSpans, writeRunTraceUpdate, markRunTraceIncomplete, RunTraceError } from "@nodetool-ai/models";
import { browserTracePolicy } from "./browser-trace-policy.js";
import { publishCommittedRunTraceUpdate } from "./run-trace-store.js";
import { RunsError } from "./runs.js";

/** Owner-only browser ingestion shares durable storage, caps and redaction with server spans. */
export async function ingestBrowserRunSpans(userId: string, id: string, input: unknown): Promise<BrowserRunSpansResult> {
  const parsed = browserRunSpansInputSchema.safeParse(input);
  if (!parsed.success) { throw new RunsError("invalid_input", parsed.error.issues[0]?.message ?? "Invalid browser spans"); }
  if (Buffer.byteLength(JSON.stringify(parsed.data)) > BROWSER_TRACE_BODY_BYTE_LIMIT) {
    throw new RunsError("invalid_input", "Browser span batch exceeds byte limit");
  }
  try {
    const run = await resolveRunReader(userId, id);
    if (!run) { throw new RunsError("not_found", "Run not found"); }
    const now = Date.now();
    if (run.origin === "public" || (run.ended_at && Date.parse(run.ended_at) < now - BROWSER_TRACE_CLOSE_WINDOW_MS)) {
      throw new RunsError("invalid_input", "Run does not accept browser spans");
    }
    const rows = await queryRunReaderSpans(userId, run);
    const byId = new Map(rows.map((row) => [row.span_id, row]));
    const parents = new Map(rows.map((row) => [row.span_id, row.metadata.parent_span_id]));
    const batchIds = new Set<string>();
    for (const record of parsed.data.records) {
      if (record.trace_id !== run.trace_id || record.span_id === run.root_span_id ||
          record.start_time_ms < Date.parse(run.started_at) - BROWSER_TRACE_CLOSE_WINDOW_MS ||
          record.end_time_ms > now + BROWSER_TRACE_CLOCK_SKEW_MS ||
          (run.ended_at && record.end_time_ms > Date.parse(run.ended_at) + BROWSER_TRACE_CLOSE_WINDOW_MS)) {
        throw new RunsError("invalid_input", "Span does not match run identity or timing");
      }
      const existing = byId.get(record.span_id);
      if (existing && existing.metadata.resource[BROWSER_TRACE_SOURCE_KEY] !== "browser") {
        throw new RunsError("invalid_input", "Browser span cannot overwrite a server span");
      }
      if (batchIds.has(record.span_id)) { throw new RunsError("invalid_input", "Duplicate span id in batch"); }
      batchIds.add(record.span_id);
      if (!existing) { parents.set(record.span_id, record.parent_span_id); }
    }
    const visited = new Set<string>();
    for (const start of batchIds) {
      const path = new Set<string>();
      let current: string | null | undefined = start;
      while (current && !visited.has(current)) {
        if (path.has(current)) { throw new RunsError("invalid_input", "Cyclic browser span ancestry"); }
        path.add(current); current = parents.get(current);
      }
      for (const spanId of path) { visited.add(spanId); }
    }
    const policy = browserTracePolicy(userId, run.trace_id);
    const root = run.root_span_id ? byId.get(run.root_span_id)?.metadata : undefined;
    const browserRoot = run.kind === "app" && root?.name === "app.run" && root.resource[BROWSER_TRACE_SOURCE_KEY] === "server" && root.attributes["app.execution.location"] === "browser";
    if (run.kind === "app") {
      const appRun = await getAppRun(userId, run.source_id);
      // Server scopes can resolve more secrets until execution actually settles.
      if (!appRun || (appRun.status === "running" && !browserRoot)) { policy.contentSuppressed = true; }
    } else if (run.status === "running") {
      policy.contentSuppressed = true;
    }
    const result = { accepted: 0, duplicate: 0, dropped: 0 };
    for (const record of parsed.data.records) {
      if (byId.has(record.span_id)) { result.duplicate++; continue; }
      if (record.name === "ui.action" && record.attributes["nodetool.trace.incomplete"] === true) {
        await markRunTraceIncomplete(userId, run.trace_id, "Browser recording lost spans");
      }
      const attributes = { ...record.attributes };
      if (policy.contentSuppressed) { attributes["nodetool.trace.content_suppressed"] = true; }
      const committed = await writeRunTraceUpdate(userId, run.id, {
        kind: "span_ended",
        record: { ...record, resource: { ...record.resource, [BROWSER_TRACE_SOURCE_KEY]: "browser" }, attributes }
      }, { ...policy, browserOnly: true });
      if (committed) {
        result.accepted++; publishCommittedRunTraceUpdate(userId, committed);
      } else {
        const winner = await queryRunReaderSpans(userId, run, { spanIds: [record.span_id] });
        if (winner[0]?.metadata.resource[BROWSER_TRACE_SOURCE_KEY] === "browser") { result.duplicate++; }
        else { result.dropped++; }
      }
    }
    return result;
  } catch (error) {
    if (error instanceof RunTraceError) { throw new RunsError(error.code === "conflict" ? "invalid_input" : error.code, error.message); }
    throw error;
  }
}
