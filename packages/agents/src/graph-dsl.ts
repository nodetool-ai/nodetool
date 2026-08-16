/**
 * Graph DSL — evaluate an LLM-authored workflow program into GraphData.
 *
 * The planner LLM writes ONE plain-JavaScript program using the same
 * handle-wiring semantics as `@nodetool-ai/dsl` (`createNode` / `workflow`):
 * `node(type, properties)` creates a node, passing `ref.output(slot?)` as a
 * property value becomes an edge, and `return graph()` collects everything.
 * The program runs in the QuickJS WebAssembly sandbox — no host access beyond
 * the two predefined functions — so a malformed or malicious program cannot
 * touch the host.
 */

import type { GraphData, NodeDescriptor, Edge } from "@nodetool-ai/protocol";
import { runInSandbox } from "./js-sandbox.js";
import { GRAPH_DSL_CORE_PRELUDE } from "./graph-dsl-core.js";
import { isRecord, isString } from "./utils/type-guards.js";

/** Wall-clock budget for a graph program. Pure graph building is fast. */
export const GRAPH_DSL_TIMEOUT_MS = 10_000;

/**
 * Guest-side prelude defining the DSL surface: the graph DSL core
 * (`graph-dsl-core.ts` — the wiring, validation, and handle guards) plus the
 * planner's free-function
 * form. `node()` registers a node on one implicit builder and returns a ref
 * whose `.output(slot?)` produces a wiring handle; `graph()` collects the
 * result (mirroring how `workflow()` in @nodetool-ai/dsl derives edges from
 * OutputHandle inputs). All created nodes are included — an orphan node is a
 * validation finding for the planner to fix, not something to silently prune.
 */
const GRAPH_DSL_PRELUDE = `${GRAPH_DSL_CORE_PRELUDE}
const __g = __graphDslBuilder();
function node(type, properties, id) {
  return __g.node(
    type,
    properties,
    typeof id === "string" && id.length > 0 ? { id: id } : undefined
  );
}
function graph() {
  const j = __g.toJSON();
  return { __graph: true, nodes: j.nodes, edges: j.edges };
}
`;

export interface EvaluateGraphDslOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GraphDslResult {
  graph?: GraphData;
  error?: string;
  logs?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Convert the sandbox return value into GraphData, or explain why it isn't
 * one. The prelude guarantees the shape for programs that end in
 * `return graph()`; anything else (returning a node ref, a string, nothing)
 * gets an actionable message instead of a crash downstream.
 */
function toGraphData(result: unknown) {
  const record = asRecord(result);
  if (
    !record ||
    record.__graph !== true ||
    !Array.isArray(record.nodes) ||
    !Array.isArray(record.edges)
  ) {
    return {
      error:
        "The program must end with `return graph();` — it returned something else."
    };
  }

  const nodes: NodeDescriptor[] = [];
  for (const raw of record.nodes) {
    const n = asRecord(raw);
    if (!n || !isString(n.id) || !isString(n.type)) {
      return { error: "Malformed node in graph() result." };
    }
    nodes.push({
      id: n.id,
      type: n.type,
      name: n.id,
      properties: asRecord(n.properties) ?? {}
    });
  }

  const edges: Edge[] = [];
  for (const raw of record.edges) {
    const e = asRecord(raw);
    if (
      !e ||
      !isString(e.source) ||
      !isString(e.sourceHandle) ||
      !isString(e.target) ||
      !isString(e.targetHandle)
    ) {
      return { error: "Malformed edge in graph() result." };
    }
    edges.push({
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: e.targetHandle
    });
  }

  return { graph: { nodes, edges } };
}

/**
 * Run a graph DSL program in the sandbox and return the graph it builds.
 * Errors (syntax, runtime, wrong return shape) come back as `error` text the
 * planner can feed to the model for the next round.
 */
export async function evaluateGraphDsl(
  code: string,
  options: EvaluateGraphDslOptions = {}
): Promise<GraphDslResult> {
  if (!code.trim()) {
    return { error: "Program is empty." };
  }

  const run = await runInSandbox({
    code: `${GRAPH_DSL_PRELUDE}\n${code}`,
    timeoutMs: options.timeoutMs ?? GRAPH_DSL_TIMEOUT_MS,
    signal: options.signal
  });

  if (!run.success) {
    return {
      error: run.error ?? "Program execution failed.",
      logs: run.logs
    };
  }

  return { ...toGraphData(run.result), logs: run.logs };
}
