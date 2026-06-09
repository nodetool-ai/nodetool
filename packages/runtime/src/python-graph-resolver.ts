/**
 * Python-worker support for graphs executed OUTSIDE the websocket server.
 *
 * The websocket server wires the Python bridge into its own `resolveExecutor`
 * (see packages/websocket/src/plugins/websocket.ts). In-process runners — the
 * `nodetool run` / `nodetool workflows run` CLI commands and the DSL `run()` —
 * had no such wiring, so any Python worker node failed with "Unknown node
 * type". These helpers give those runners the same capability.
 *
 * Transport is chosen by {@link createPythonBridge}: when `NODETOOL_WORKER_URL`
 * (optionally with `NODETOOL_WORKER_TOKEN`) is set, a remote WebSocket worker is
 * used; otherwise a local stdio worker is spawned.
 */

import { createLogger } from "@nodetool-ai/config";

import { createPythonBridge } from "./python-bridge-factory.js";
import { PythonNodeExecutor } from "./python-node-executor.js";
import type { PythonBridgeBase } from "./python-bridge-base.js";
import type { PythonBridgeOptions } from "./python-bridge-types.js";

const log = createLogger("nodetool.runtime.python-graph-resolver");

/** Minimal graph-node shape the resolver needs. */
interface GraphNodeLike {
  id: string;
  type: string;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/**
 * Connect a Python worker bridge for a graph, but ONLY when the graph contains a
 * node type the TS registry cannot resolve (a candidate Python node). Pure-TS
 * graphs get no bridge — no worker spawned, no remote connection — preserving
 * the prior behavior and cost for workflows that don't need Python.
 *
 * Failure handling depends on whether a remote worker was explicitly requested:
 * - `NODETOOL_WORKER_URL` set → a connect failure is surfaced (the caller asked
 *   for a specific remote worker, so a silent fallthrough would hide a real
 *   misconfiguration).
 * - unset (local stdio attempt) → a connect failure returns `null` and is
 *   logged, so an unresolved node still reports the normal "Unknown node type"
 *   error rather than a confusing worker-spawn error.
 *
 * The caller owns the returned bridge and MUST `close()` it after the run.
 *
 * @param nodes         The graph nodes (only `.type` is read).
 * @param hasTsExecutor Predicate: can the in-process TS registry resolve a type?
 * @param options       Bridge options forwarded to {@link createPythonBridge}.
 * @returns The connected bridge, or `null` when no Python node is present (or a
 *          local worker was unavailable).
 */
export async function connectPythonBridgeForGraph(
  nodes: ReadonlyArray<{ type?: unknown }>,
  hasTsExecutor: (nodeType: string) => boolean,
  options?: PythonBridgeOptions
): Promise<PythonBridgeBase | null> {
  const needsPython = nodes.some(
    (n) =>
      typeof n.type === "string" && n.type.length > 0 && !hasTsExecutor(n.type)
  );
  if (!needsPython) return null;

  const wsUrl = options?.wsUrl ?? process.env["NODETOOL_WORKER_URL"];
  const bridge = createPythonBridge(options);
  try {
    await bridge.connect();
    return bridge;
  } catch (err) {
    bridge.close();
    if (wsUrl && wsUrl.trim()) {
      // Remote worker explicitly requested — surface the failure.
      throw err;
    }
    // No remote configured and a local worker isn't available here; fall
    // through so unresolved node types report the normal error.
    log.warn(
      `Python worker bridge unavailable; Python nodes will be unresolved: ${String(
        err
      )}`
    );
    return null;
  }
}

/**
 * Build a {@link PythonNodeExecutor} for a node when the bridge advertises its
 * type, mirroring the websocket server's `resolveExecutor`. Returns `null` when
 * there is no bridge or the bridge does not know the node type, so the caller
 * can fall through to its own "unknown node type" error.
 */
export function resolvePythonNodeExecutor(
  bridge: PythonBridgeBase | null,
  node: GraphNodeLike
): PythonNodeExecutor | null {
  if (!bridge || !bridge.hasNodeType(node.type)) return null;

  const meta = bridge
    .getNodeMetadata()
    .find((m) => m.node_type === node.type);
  const props = (node.properties ?? node.data ?? {}) as Record<
    string,
    unknown
  >;
  const outputTypes = Object.fromEntries(
    (meta?.outputs ?? []).map((o) => [o.name, o.type.type])
  );

  return new PythonNodeExecutor(
    bridge,
    node.type,
    props,
    outputTypes,
    meta?.required_settings ?? [],
    node.id
  );
}
