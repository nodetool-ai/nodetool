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
import {
  ExecutionSession,
  isExecutionPreflightError
} from "@nodetool-ai/execution";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { FileStorageAdapter } from "@nodetool-ai/storage";
import { summarizeInterventions } from "@nodetool-ai/execution/debug";
import { createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { buildFullRegistry } from "../node-registry.js";
import {
  createSupervisorHandle,
  recordSupervisorCost,
  streamInterventionLines,
  type SupervisorRunConfig
} from "../supervisor.js";
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
  /** Supervise this run (`--supervise` and its bounds). */
  supervisor?: SupervisorRunConfig;
  /** Sink for the inline `⛨` lines. Defaults to stderr. */
  onInterventionLine?: (line: string) => void;
}

export interface ServerRunOutcome {
  report: ServerRunReport;
  /** The full message stream, for writing the raw bundle artifact. */
  rawMessages: ProcessingMessage[];
}

export async function runOnServer(
  input: ServerRunInput
): Promise<ServerRunOutcome> {
  const { graph, workflowId, params } = input;
  const startedAt = Date.now();

  const registry = buildFullRegistry();
  const jobId = `debug-${Date.now()}`;

  // Match a server run's workspace assignment so file/workspace nodes land in
  // the same place a real run would.
  const { resolveWorkflowWorkspace } = await import("@nodetool-ai/websocket");
  const workspace = await resolveWorkflowWorkspace(workflowId ?? null, "1");

  const context = new ProcessingContext({
    jobId,
    workflowId,
    userId: "1",
    secretResolver: getSecret,
    storage: new FileStorageAdapter(getDefaultAssetsPath()),
    workspace
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
  // Supervision plumbs through the facade — the one integration point every
  // surface shares (docs/workflow-supervisor-design.md §7).
  const supervisor = input.supervisor
    ? await createSupervisorHandle({ config: input.supervisor, context })
    : null;

  const sessionOptions: Parameters<typeof ExecutionSession.create>[0] = {
    graph,
    registry,
    // Registry alone hydrates node flags but not `propertyTypes`, and
    // correlation analysis reads list-ness only from that map — so every
    // `list[...]` handle read as non-list here and a stream arriving on one
    // collapsed to empty scope, keeping the last value. `Directed Film to
    // Timeline` animated one shot of N under `debug` and all N under
    // `workflows run`, which is backwards for a harness whose whole job is
    // to reproduce a run. Same resolver `workflows run` and the websocket
    // runner already pass.
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId,
    workflowId,
    params,
    context,
    limits: { runTimeoutMs: input.timeoutMs }
  };
  // Capture is retention, so it stays off unless a supervised run needs the
  // stream to print its `⛨` lines as they happen.
  if (supervisor) {
    sessionOptions.supervisor = supervisor.handle;
    sessionOptions.captureMessages = true;
  }
  // A run this runtime cannot honour (unknown model, unregistered provider,
  // missing credential) is refused by `create()` before the kernel starts.
  // The harness's job is to report why a run did not happen, so the refusal
  // becomes a failed report rather than a thrown stack.
  let session: ExecutionSession;
  try {
    session = await ExecutionSession.create(sessionOptions);
  } catch (err) {
    if (!isExecutionPreflightError(err)) throw err;
    supervisor?.handle.close();
    const summary = collectExecutionSummary([]);
    summary.status = "failed";
    summary.error = err.message;
    return {
      report: {
        surface: "server",
        ok: false,
        status: "failed",
        error: err.message,
        durationMs: Date.now() - startedAt,
        summary,
        trace: null
      },
      rawMessages: []
    };
  }

  const interventionLines = supervisor
    ? streamInterventionLines(
        session.messages,
        input.onInterventionLine ?? ((line) => console.error(line))
      )
    : Promise.resolve();

  // `session.result` never rejects — kernel failures (including an unknown
  // node type surfaced during executor resolution) resolve as `status:
  // "failed"` instead of throwing, so no try/catch is needed here.
  const result = await session.result;
  await interventionLines;
  supervisor?.handle.close();
  const timedOut = session.cancelReason === "timeout";

  const messages = result.messages ?? [];
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

  const interventions = result.interventions ?? [];
  if (supervisor && interventions.length > 0) {
    await recordSupervisorCost({
      interventions,
      jobId,
      workflowId,
      userId: "1",
      providerId: supervisor.providerId,
      model: supervisor.model
    });
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
  if (supervisor) {
    report.supervised = {
      provider: supervisor.providerId,
      model: supervisor.model,
      summary: summarizeInterventions(interventions)
    };
  }

  return { report, rawMessages: messages };
}
