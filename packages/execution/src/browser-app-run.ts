import { randomBytes } from "node:crypto";
import {
  getAppRun, claimAppRun, resolveRunReader, queryRunReaderSpans, writeRunTraceUpdate, settleAppRun, AppRunError, RunTraceError
} from "@nodetool-ai/models";
import { browserRunStartInputSchema, BROWSER_TRACE_SOURCE_KEY, BROWSER_APP_RUNNER_INSTANCE, type TraceRecord } from "@nodetool-ai/protocol";
import { RunsError } from "./runs.js";
import { publishCommittedRunTraceUpdate } from "./run-trace-store.js";
import { rememberBrowserTracePolicy, expireBrowserTracePolicy } from "./browser-trace-policy.js";

/** The stored host marker survives a server restart and cannot be set by browser span ingestion. */
export async function getBrowserAppRunRoot(userId: string, id: string): Promise<TraceRecord | null> {
  const registration = await resolveRunReader(userId, id);
  if (!registration || registration.kind !== "app" || !registration.root_span_id) { return null; }
  const [root] = await queryRunReaderSpans(userId, registration, { spanIds: [registration.root_span_id] });
  return root?.metadata.name === "app.run" && root.metadata.resource[BROWSER_TRACE_SOURCE_KEY] === "server" && root.metadata.attributes["app.execution.location"] === "browser"
    ? root.metadata : null;
}

/** Claim the reservation before the browser kernel starts, with a durable server-owned app root. */
export async function startBrowserAppRun(userId: string, id: string, input: unknown): Promise<{ root_span_id: string }> {
  try { return await startBrowserRun(userId, id, input); }
  catch (error) {
    if (error instanceof AppRunError || error instanceof RunTraceError) {
      throw new RunsError(error.code === "not_found" ? "not_found" : error.code === "conflict" ? "ambiguous" : "invalid_input", error.message);
    }
    throw error;
  }
}

async function startBrowserRun(userId: string, id: string, input: unknown): Promise<{ root_span_id: string }> {
  const parsed = browserRunStartInputSchema.safeParse(input);
  if (!parsed.success) { throw new RunsError("invalid_input", "Invalid browser traceparent"); }
  const [, traceId, parentId] = parsed.data.traceparent.split("-");
  const run = await getAppRun(userId, id);
  const registration = await resolveRunReader(userId, id);
  if (!run || !registration || registration.kind !== "app") { throw new RunsError("not_found", "App run not found"); }
  if (!parentId || /^0+$/.test(parentId) || traceId !== run.trace_id || run.origin === "public" || run.status !== "running") {
    throw new RunsError("invalid_input", "Browser traceparent does not match an open app run");
  }
  const existing = await getBrowserAppRunRoot(userId, run.id);
  if (existing && existing.parent_span_id === parentId) { return { root_span_id: existing.span_id }; }
  if (run.execution_started_at || registration.root_span_id) { throw new RunsError("invalid_input", "App run already claimed"); }
  const [parent] = await queryRunReaderSpans(userId, registration, { spanIds: [parentId] });
  if (parent && (parent.metadata.name !== "ui.action" || parent.metadata.resource[BROWSER_TRACE_SOURCE_KEY] !== "browser")) {
    throw new RunsError("invalid_input", "App root requires a browser action parent");
  }
  if (!await claimAppRun(userId, run.id, BROWSER_APP_RUNNER_INSTANCE)) { throw new RunsError("invalid_input", "App run already claimed"); }
  const spanId = randomBytes(8).toString("hex");
  const start = Date.now();
  try {
    const committed = await writeRunTraceUpdate(userId, run.id, { kind: "span_started", record: {
      trace_id: run.trace_id, span_id: spanId, parent_span_id: parentId, name: "app.run", kind: "INTERNAL",
      start_time_ms: start, end_time_ms: start, duration_ms: 0, status: { code: "UNSET" },
      attributes: { "app.execution.location": "browser", "app.run_id": run.id, "app.instance_id": run.instance_id, "app.operation_id": run.operation_id },
      events: [], resource: { [BROWSER_TRACE_SOURCE_KEY]: "server" }
    } }, { isRoot: true });
    if (!committed) { throw new RunsError("invalid_input", "App run root could not be recorded"); }
    publishCommittedRunTraceUpdate(userId, committed);
    // Both browser kernel hosts construct ProcessingContext without a secret resolver.
    // Hosted credentials can only enter server execution, whose scopes carry their own sets.
    rememberBrowserTracePolicy({ userId, runId: run.id, traceId: run.trace_id, origin: run.origin, secretValues: new Set(), policy: { contentSuppressed: false } });
    return { root_span_id: spanId };
  } catch (error) {
    await settleAppRun(userId, run.id, { status: "failed", error: "Browser execution could not start", updateInstance: false });
    throw error;
  }
}

/** Close from the stored start, so reloads and server restarts do not lose the terminal root. */
export async function finishBrowserAppRunTrace(userId: string, id: string, status: "completed" | "failed" | "cancelled"): Promise<void> {
  const root = await getBrowserAppRunRoot(userId, id);
  if (!root) { return; }
  const registration = await resolveRunReader(userId, id);
  if (!registration) { return; }
  const [stored] = await queryRunReaderSpans(userId, registration, { spanIds: [root.span_id] });
  if (stored?.update_kind === "span_ended") { return; }
  const end = Math.max(Date.now(), root.start_time_ms);
  const committed = await writeRunTraceUpdate(userId, registration.id, { kind: "span_ended", record: {
    ...root, end_time_ms: end, duration_ms: end - root.start_time_ms, status: { code: status === "completed" ? "OK" : "ERROR" }
  } });
  if (committed) { publishCommittedRunTraceUpdate(userId, committed); }
  expireBrowserTracePolicy(root.trace_id);
}
