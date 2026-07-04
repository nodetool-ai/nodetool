/**
 * Headless ("server") debug surface: runs a workflow through the kernel
 * `WorkflowRunner` exactly as `nodetool workflows run` does, but captures the
 * full processing-message stream and the OpenTelemetry trace instead of just the
 * final outputs.
 *
 * This is integration code — it pulls in the node registries, runtime context,
 * and Python bridge — so it is exercised end-to-end rather than unit-tested.
 */
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { getSecret } from "@nodetool-ai/models";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { hydrateGraphNodeFlags } from "@nodetool-ai/node-sdk";
import type { GraphData, ProcessingMessage } from "@nodetool-ai/protocol";
import {
  ProcessingContext,
  FileStorageAdapter,
  connectPythonBridgeForGraph,
  resolvePythonNodeExecutor
} from "@nodetool-ai/runtime";
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

/** Settle to a synthetic failed result if the run exceeds `timeoutMs`. */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  onTimeout: () => T
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => resolvePromise(onTimeout()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolvePromise(value);
      },
      (err) => {
        clearTimeout(timer);
        rejectPromise(err);
      }
    );
  });
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

  const pythonBridge = await connectPythonBridgeForGraph(graph.nodes, (t) =>
    registry.has(t)
  );

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node: { id: string; type: string }) => {
      if (registry.has(node.type)) return registry.resolve(node);
      const py = resolvePythonNodeExecutor(pythonBridge, node);
      if (py) return py;
      throw new Error(`Unknown node type: ${node.type}`);
    },
    executionContext: context
  });

  let result: Awaited<ReturnType<WorkflowRunner["run"]>>;
  try {
    result = await withTimeout(
      runner.run(
        { job_id: jobId, workflow_id: workflowId ?? undefined, params },
        hydrateGraphNodeFlags(graph as unknown as GraphData, registry)
      ),
      input.timeoutMs,
      () => ({
        status: "failed" as const,
        error: `Debug server run exceeded timeout (${input.timeoutMs}ms)`,
        outputs: {},
        messages: [...context.getMessages()]
      })
    );
  } catch (err) {
    // A thrown run (e.g. an unknown node type, or a graph that fails
    // pre-flight) is exactly when the debug bundle matters most — capture it as
    // a failed result instead of letting it abort the harness.
    result = {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      outputs: {},
      messages: [...context.getMessages()]
    };
  } finally {
    pythonBridge?.close();
  }

  const messages = (result.messages ?? []) as ProcessingMessage[];
  const summary = collectExecutionSummary(messages);
  // The runner's RunResult status is authoritative; fall back to the message
  // stream's view if it's missing (e.g. on the synthetic timeout result).
  summary.status = result.status ?? summary.status;
  if (result.error && !summary.error) summary.error = result.error;

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
    error: result.error ?? summary.error,
    durationMs: Date.now() - startedAt,
    summary,
    trace
  };

  return { report, rawMessages: messages };
}
