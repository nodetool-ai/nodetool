/**
 * Real graph runner for the `graph-e2e` eval suite.
 *
 * The suite lives in `@nodetool-ai/agents`, which has no execution dependency —
 * it takes a `GraphRunner` from its caller. This is that caller's side: the
 * planned graph runs through `ExecutionSession` exactly as `nodetool debug`
 * runs one, and the terminal status plus every output the run surfaced come
 * back in the shape the harness scores.
 *
 * Integration code (registries, runtime context, Python bridge) — exercised by
 * running the suite, not by unit tests.
 */
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { getSecret } from "@nodetool-ai/models";
import { ExecutionSession, toRawGraphInput } from "@nodetool-ai/execution";
import type { GraphRunner, GraphRunOutput } from "@nodetool-ai/agents";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { ProcessingContext, FileStorageAdapter } from "@nodetool-ai/runtime";
import { createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { buildFullRegistry } from "../node-registry.js";

/**
 * Build the runner the eval harness calls once per planned graph. The registry
 * is built once and reused across cases; each case gets a fresh session,
 * context, and job id.
 */
export function createEvalGraphRunner(): GraphRunner {
  const registry = buildFullRegistry();

  return async ({ graph, params, timeoutMs, signal }) => {
    const startedAt = Date.now();
    const jobId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const context = new ProcessingContext({
      jobId,
      workflowId: null,
      userId: "1",
      secretResolver: getSecret,
      storage: new FileStorageAdapter(getDefaultAssetsPath()),
      workspaceDir: null,
      workspaceStorage: null
    });

    const session = await ExecutionSession.create({
      graph: toRawGraphInput(graph),
      registry,
      // Registry alone hydrates node flags but not `propertyTypes`, and
      // correlation analysis reads list-ness only from that map — without it
      // every `list[...]` handle reads as non-list, so a stream arriving on
      // one collapses to empty scope and the node runs once on the last
      // value. A planner-built graph never carries the map, so an eval would
      // score a graph the real runner executes differently.
      resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
      jobId,
      params,
      context,
      limits: { runTimeoutMs: timeoutMs }
    });

    const abort = () => session.cancel("aborted");
    signal?.addEventListener("abort", abort, { once: true });

    let result;
    try {
      // `session.result` never rejects — kernel failures resolve as
      // `status: "failed"` rather than throwing.
      result = await session.result;
    } finally {
      signal?.removeEventListener("abort", abort);
    }

    const messages = result.messages ?? [];
    const outputs = collectOutputs(messages, result.outputs);
    const timedOut = session.cancelReason === "timeout";

    return {
      ok: result.status === "completed",
      status: result.status,
      error:
        result.error ??
        (timedOut ? `run exceeded timeout (${timeoutMs}ms)` : undefined),
      outputs,
      nodeErrors: collectNodeErrors(messages),
      durationMs: Date.now() - startedAt
    };
  };
}

/**
 * Outputs come from the `output_update` stream, whose `output_name` is the
 * output node's workflow-facing name — the name a case's expectations refer to.
 * Streamed values arrive as chunks, so string chunks for one name concatenate
 * and any other type keeps the last value. `RunResult.outputs` fills in
 * anything the stream didn't carry.
 */
function collectOutputs(
  messages: readonly ProcessingMessage[],
  runOutputs: Record<string, unknown[]> | undefined
): GraphRunOutput[] {
  const byName = new Map<string, GraphRunOutput>();
  // `RunResult.outputs` keys an output node by its descriptor name, falling
  // back to the node id — which is the same value the stream already reported
  // under the node's workflow-facing name. Track the ids so the fallback merge
  // doesn't add a second, id-keyed copy of an output we already have.
  const seenNodeIds = new Set<string>();

  for (const msg of messages) {
    if (msg.type !== "output_update") continue;
    const name = String(msg.output_name ?? msg.node_name ?? "output");
    const nodeId = msg.node_id;
    const previous = byName.get(name);
    const value =
      previous &&
      typeof previous.value === "string" &&
      typeof msg.value === "string" &&
      msg.disposition !== "replace"
        ? previous.value + msg.value
        : msg.value;
    byName.set(name, { name, nodeId, value });
    if (nodeId) seenNodeIds.add(nodeId);
  }

  for (const [name, values] of Object.entries(runOutputs ?? {})) {
    if (byName.has(name) || seenNodeIds.has(name) || values.length === 0)
      continue;
    byName.set(name, {
      name,
      value: values.length === 1 ? values[0] : values
    });
  }

  return [...byName.values()];
}

function collectNodeErrors(
  messages: readonly ProcessingMessage[]
): { nodeId: string | null; message: string }[] {
  const errors: { nodeId: string | null; message: string }[] = [];
  for (const msg of messages) {
    if (
      msg.type === "node_update" &&
      (msg.status === "error" || msg.status === "failed")
    ) {
      errors.push({
        nodeId: msg.node_id,
        message: msg.error ?? String(msg.status)
      });
    } else if (msg.type === "error") {
      errors.push({ nodeId: null, message: msg.message });
    }
  }
  return errors;
}
