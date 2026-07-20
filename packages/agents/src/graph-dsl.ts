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

/** Wall-clock budget for a graph program. Pure graph building is fast. */
export const GRAPH_DSL_TIMEOUT_MS = 10_000;

/**
 * Guest-side prelude defining the DSL surface. `node()` registers a node and
 * returns a ref whose `.output(slot?)` produces a wiring handle; `graph()`
 * turns handle-valued top-level properties into edges (mirroring how
 * `workflow()` in @nodetool-ai/dsl derives edges from OutputHandle inputs).
 * All created nodes are included — an orphan node is a validation finding for
 * the planner to fix, not something to silently prune.
 */
const GRAPH_DSL_PRELUDE = `const __nodes = [];
const __ids = Object.create(null);
function __autoId(type) {
  const last = String(type).split(".").pop() || "node";
  const snake = last.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  const n = (__ids[snake] = (__ids[snake] || 0) + 1);
  return n === 1 ? snake : snake + "_" + n;
}
function node(type, properties, id) {
  if (typeof type !== "string" || type.length === 0) {
    throw new Error("node(type, properties): type must be a non-empty string");
  }
  if (properties !== undefined && (properties === null || typeof properties !== "object" || Array.isArray(properties))) {
    throw new Error("node(type, properties): properties must be an object");
  }
  const nodeId = typeof id === "string" && id.length > 0 ? id : __autoId(type);
  __nodes.push({ id: nodeId, type: type, properties: properties || {} });
  return {
    id: nodeId,
    output: function (slot) {
      if (slot !== undefined && (typeof slot !== "string" || slot.length === 0)) {
        throw new Error("output(slot): slot must be a non-empty string");
      }
      var handle = {
        __handle: true,
        source: nodeId,
        sourceHandle: slot || "output"
      };
      // Interpolating a handle into a string silently yields "[object
      // Object]": no edge is created and the node gets that literal text.
      // Refuse the conversion so the mistake comes back as a submit_graph
      // error instead of a broken graph that validates clean.
      handle[Symbol.toPrimitive] = function () {
        throw new Error(
          "Cannot use " +
            nodeId +
            ".output() inside a string. A handle wires an edge; it is not text. " +
            "Pass it as the property value itself — { prompt: " +
            nodeId +
            ".output() } — and put any fixed instructions in a separate " +
            "property (an Agent node's system property)."
        );
      };
      return handle;
    }
  };
}
function graph() {
  const nodes = [];
  const edges = [];
  for (const n of __nodes) {
    const data = {};
    for (const key in n.properties) {
      const v = n.properties[key];
      if (v && typeof v === "object" && v.__handle === true) {
        edges.push({ source: v.source, sourceHandle: v.sourceHandle, target: n.id, targetHandle: key });
      } else {
        data[key] = v;
      }
    }
    nodes.push({ id: n.id, type: n.type, properties: data });
  }
  return { __graph: true, nodes: nodes, edges: edges };
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
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Convert the sandbox return value into GraphData, or explain why it isn't
 * one. The prelude guarantees the shape for programs that end in
 * `return graph()`; anything else (returning a node ref, a string, nothing)
 * gets an actionable message instead of a crash downstream.
 */
function toGraphData(result: unknown): { graph?: GraphData; error?: string } {
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
    if (!n || typeof n.id !== "string" || typeof n.type !== "string") {
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
      typeof e.source !== "string" ||
      typeof e.sourceHandle !== "string" ||
      typeof e.target !== "string" ||
      typeof e.targetHandle !== "string"
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
