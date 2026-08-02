/**
 * An `ApplicationBundle` as the simulator's input.
 *
 * A bundle carries the app plus the full graph of every workflow its
 * operations bind, keyed by a bundle-local key rather than a workflow id — so
 * it resolves without a database, which is what makes an app runnable in CI
 * and what the build harness hands the oracle round after round. The CLI's
 * file path and the build harness's in-memory path both land here, so a
 * bundle means the same thing to both.
 */
import type { ApplicationBundle } from "@nodetool-ai/app-runtime";
import type { DebugGraph } from "../debug/types.js";
import { debugGraphOf } from "./graph-shape.js";
import type { ResolvedAppTarget } from "./types.js";

const EMPTY_GRAPH: DebugGraph = { nodes: [], edges: [] };

/**
 * Resolve a parsed bundle into a simulator target.
 *
 * @param appDoc  the raw `app` value as stored, when the caller has it — the
 *                host writes it to the bundle's `app.json` and the persist
 *                warnings read it. Defaults to the parsed document.
 */
export function bundleTarget(
  bundle: ApplicationBundle,
  ref: string,
  appDoc?: unknown
): ResolvedAppTarget {
  const graphs = new Map<string, DebugGraph>();
  for (const workflow of bundle.workflows) {
    const graph = debugGraphOf(workflow.graph);
    if (graph) graphs.set(workflow.key, graph);
  }
  const host =
    bundle.app.operations
      .map((operation) => graphs.get(operation.workflowId))
      .find((graph): graph is DebugGraph => graph !== undefined) ?? EMPTY_GRAPH;

  return {
    info: {
      ref,
      source: "bundle",
      // A bundle's operations reference bundle-local keys, not workflow ids,
      // so there is no workflow id to report or hand to the runner.
      workflowId: null,
      nodeCount: host.nodes.length,
      edgeCount: host.edges.length
    },
    graph: host,
    fileParams: {},
    appDoc: appDoc === undefined ? bundle.app : appDoc,
    document: bundle.app,
    issue: null,
    graphs,
    operationsReferenceKeys: true,
    appName: bundle.name
  };
}
