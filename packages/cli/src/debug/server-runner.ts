/**
 * Headless ("server") debug surface: runs a workflow through
 * `@nodetool-ai/execution`'s `ExecutionSession` exactly as
 * `nodetool workflows run` does, but captures the full processing-message
 * stream and the OpenTelemetry trace instead of just the final outputs.
 *
 * This is integration code — it pulls in the node registries, runtime context,
 * and Python bridge — so it is exercised end-to-end rather than unit-tested.
 */
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { getSecret } from "@nodetool-ai/models";
import { ExecutionSession } from "@nodetool-ai/execution";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { ProcessingContext, FileStorageAdapter } from "@nodetool-ai/runtime";
import { buildFullRegistry } from "../node-registry.js";
import { collectExecutionSummary } from "./collector.js";
import { readTraceSummary } from "./trace.js";
import type { DebugGraph, ServerRunReport } from "./types.js";

export interface ServerRunInput {
  graph: DebugGraph;
  workflowId: string | null;
  params: Record<string, unknown>;
  /** Absolute path telemetry was told to write spans to; read back for trace summary. */
  tracePath?: string | null;
  timeoutMs?: number;
}

export interface ServerRunOutcome {
  report: ServerRunReport;
  /** The full message stream, for writing the raw bundle artifact. */
  rawMessages: ProcessingMessage[];
}

export async function runOnServer(input: ServerRunInput): Promise<ServerRunOutcome> {
  const { graph, workflowId, params } = input;
  const startedAt = Date.now();

  const registry = buildFullRegistry();
  const jobId = `debug-${Date.now()}`;

  // Match a server run's workspace assignment so file/workspace nodes land in
  // the same place a real run would.
  const { resolveWorkflowWorkspace } = await import("@nodetool-ai/websocket");
  const workspaceDir = workflowId
    ? await resolveWorkflowWorkspace(workflowId, "1")
    : null;

  const context = new ProcessingContext({
    jobId,
    workflowId,
    userId: "1",
    secretResolver: getSecret,
    storage: new FileStorageAdapter(getDefaultAssetsPath()),
    workspaceDir,
    workspaceStorage: workspaceDir ? new FileStorageAdapter(workspaceDir) : null
  });

  // ExecutionSession owns editor-only-node pruning (Comment/Group/Reroute —
  // the web editor prunes them at serialize time; without this every
  // commented example would die with "Unknown node type"), graph hydration,
  // Python-bridge connection, and executor resolution (registry → Python
  // bridge → throw) — the three steps this surface used to hand-roll.
  // `limits.runTimeoutMs` replaces the old `withTimeout` race: instead of
  // resolving a synthetic result while abandoning a still-running kernel, the
  // facade calls `session.cancel("timeout")`, which actually tears the run
  // down, and `session.result` only settles once that teardown completes.
  const session = await ExecutionSession.create({
    graph,
    registry,
    jobId,
    workflowId,
    params,
    context,
    limits: { runTimeoutMs: input.timeoutMs }
  });

  // `session.result` never rejects — kernel failures (including an unknown
  // node type surfaced during executor resolution) resolve as `status:
  // "failed"` instead of throwing, so no try/catch is needed here.
  const result = await session.result;
  const timedOut = session.cancelReason === "timeout";

  const messages = (result.messages ?? []) as ProcessingMessage[];
  const summary = collectExecutionSummary(messages);
  // The runner's RunResult status is authoritative; fall back to the message
  // stream's view if it's missing.
  summary.status = result.status ?? summary.status;
  const error =
    result.error ??
    (timedOut
      ? `Debug server run exceeded timeout (${input.timeoutMs}ms)`
      : undefined);
  if (error && !summary.error) summary.error = error;

  // Spans are written eagerly via SimpleSpanProcessor, but the underlying
  // WriteStream flushes async — give it a beat before reading the file back.
  let trace = null;
  if (input.tracePath) {
    await new Promise((r) => setTimeout(r, 250));
    trace = await readTraceSummary(input.tracePath);
  }

  const report: ServerRunReport = {
    surface: "server",
    ok: result.status === "completed",
    status: result.status ?? summary.status,
    error: error ?? summary.error,
    durationMs: Date.now() - startedAt,
    summary,
    trace
  };

  return { report, rawMessages: messages };
}
