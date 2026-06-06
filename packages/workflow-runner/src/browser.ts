/**
 * Browser-side workflow execution.
 *
 * Thin, reusable helpers that let a Web client (React app, Electron renderer,
 * React Native WebView, edge isolate, …) execute a sub-graph of **pure browser
 * nodes** locally — no server round-trip — while emitting the *exact same*
 * `ProcessingMessage` stream the unified WebSocket server produces.
 *
 * The kernel `WorkflowRunner` and `ProcessingContext` are already runtime- and
 * transport-agnostic (no static `node:fs`/`child_process` deps; node built-ins
 * load lazily and degrade in the browser). What was missing was a small façade
 * that (1) builds a `NodeRegistry` scoped to the `"browser"` platform and
 * (2) stamps every emitted message with `job_id`/`workflow_id` so a consumer
 * can route browser-produced messages through the very same pipeline it uses
 * for server messages.
 *
 * The node classes are injected by the caller (keeping this package agnostic of
 * any concrete node set) — pass `ALL_BROWSER_NODES` from
 * `@nodetool-ai/base-nodes/platforms/browser`, or any curated `NodeClass[]`.
 */

import type { RunResult } from "@nodetool-ai/kernel";
import { NodeRegistry, type NodeClass } from "@nodetool-ai/node-sdk";
import type { Platform, ProcessingMessage } from "@nodetool-ai/protocol";
import { runWorkflow, type GraphData, type RunWorkflowOptions } from "./run.js";

export type { GraphData };

/**
 * Build a `NodeRegistry` containing only the classes that declare support for
 * the `"browser"` platform. Classes that don't support the browser are dropped
 * (defence in depth — the curated browser set should already be browser-safe).
 */
export function createBrowserRegistry(
  nodeClasses: readonly NodeClass[],
  platform: Platform = "browser"
): NodeRegistry {
  const registry = new NodeRegistry();
  for (const nodeClass of nodeClasses) {
    if (!nodeClass?.nodeType) continue;
    registry.register(nodeClass);
  }
  return registry.forPlatform(platform);
}

/**
 * True iff every node in `graph` resolves to a class registered in `registry`.
 * A graph that passes can run entirely client-side; one that doesn't must be
 * sent to the server (it references nodes the browser can't execute).
 */
export function graphRunsInRegistry(
  graph: GraphData,
  registry: Pick<NodeRegistry, "has">
): boolean {
  const nodes = graph?.nodes ?? [];
  if (nodes.length === 0) return false;
  return nodes.every(
    (node) => typeof node.type === "string" && registry.has(node.type)
  );
}

export interface RunBrowserWorkflowOptions
  extends Omit<RunWorkflowOptions, "platform"> {
  /**
   * Platform to validate the graph against. Defaults to `"browser"` so a graph
   * containing a server-only node fails fast (before any actor spawns) instead
   * of throwing deep inside a node's `process()`.
   */
  platform?: Platform;
}

/**
 * Execute a browser graph and yield `ProcessingMessage`s shaped like the
 * unified WebSocket server's stream: every message carries `job_id` and
 * `workflow_id`, so a client can route them through the same handler it uses
 * for server-sent messages. The final `RunResult` is the generator's return
 * value.
 *
 * ```ts
 * const registry = createBrowserRegistry(ALL_BROWSER_NODES);
 * const gen = runBrowserWorkflow({ graph, registry, workflowId, jobId });
 * for (let r = await gen.next(); !r.done; r = await gen.next()) {
 *   deliver(r.value); // a ProcessingMessage, already stamped
 * }
 * const result = (await gen.next()).value; // RunResult on `done`
 * ```
 */
export async function* runBrowserWorkflow(
  opts: RunBrowserWorkflowOptions
): AsyncGenerator<ProcessingMessage, RunResult, void> {
  const jobId = opts.jobId ?? generateJobId();
  const workflowId = opts.workflowId ?? null;

  const gen = runWorkflow({
    ...opts,
    jobId,
    platform: opts.platform ?? "browser"
  });

  while (true) {
    const next = await gen.next();
    if (next.done) {
      return stampResult(next.value, jobId, workflowId);
    }
    yield stamp(next.value, jobId, workflowId);
  }
}

/**
 * Stamp `job_id`/`workflow_id` onto a message without clobbering values the
 * runner already set (mirrors the server's `streamJobMessages` fallback).
 */
function stamp(
  message: ProcessingMessage,
  jobId: string,
  workflowId: string | null
): ProcessingMessage {
  const record = message as Record<string, unknown>;
  return {
    ...record,
    job_id: record.job_id ?? jobId,
    workflow_id: record.workflow_id ?? workflowId
  } as ProcessingMessage;
}

function stampResult(
  result: RunResult,
  jobId: string,
  workflowId: string | null
): RunResult {
  return {
    ...result,
    messages: result.messages.map((m) =>
      stamp(m as ProcessingMessage, jobId, workflowId)
    )
  };
}

function generateJobId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `job_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
