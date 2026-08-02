/**
 * Resolved app targets for the simulator tests.
 *
 * The simulator takes a `ResolvedAppTarget` and never learns where it came
 * from, so these build one directly — the legacy `app_doc` shape and the
 * `ApplicationBundle` shape — instead of going through a host's file/DB
 * resolution.
 */
import {
  liftLegacyAppDoc,
  parseApplicationBundle
} from "@nodetool-ai/app-runtime";
import type { DebugGraph } from "../src/debug/types.js";
import type { ResolvedAppTarget } from "../src/app-debug/types.js";

/** ReactFlow `node.data` → kernel `node.properties`, as a host would. */
const normalize = (graph: DebugGraph): DebugGraph => ({
  nodes: graph.nodes.map((n) =>
    n["properties"] === undefined && n["data"] !== undefined
      ? { ...n, properties: n["data"], data: undefined }
      : n
  ),
  edges: graph.edges
});

/** A workflow carrying a legacy `app_doc`. */
export const resolvedWorkflow = (
  graph: DebugGraph,
  appDoc: unknown,
  params: Record<string, unknown> = {}
): ResolvedAppTarget => {
  const normalized = normalize(graph);
  const document = liftLegacyAppDoc({ id: "wf1", app_doc: appDoc });
  return {
    info: {
      ref: "wf1",
      source: "json",
      workflowId: "wf1",
      nodeCount: normalized.nodes.length,
      edgeCount: normalized.edges.length
    },
    graph: normalized,
    fileParams: params,
    appDoc,
    document,
    issue: document ? null : "app_doc is not a valid application document.",
    graphs: new Map([["wf1", normalized]]),
    operationsReferenceKeys: false,
    appName: null
  };
};

/** An `ApplicationBundle`: the app plus every graph its operations reference. */
export const resolvedBundle = (raw: unknown): ResolvedAppTarget => {
  const bundle = parseApplicationBundle(raw);
  if (!bundle) throw new Error("fixture is not a valid application bundle");
  const graphs = new Map<string, DebugGraph>();
  for (const workflow of bundle.workflows) {
    graphs.set(workflow.key, normalize(workflow.graph as unknown as DebugGraph));
  }
  const host =
    bundle.app.operations
      .map((operation) => graphs.get(operation.workflowId))
      .find((graph): graph is DebugGraph => graph !== undefined) ?? {
      nodes: [],
      edges: []
    };
  return {
    info: {
      ref: "bundle",
      source: "bundle",
      workflowId: null,
      nodeCount: host.nodes.length,
      edgeCount: host.edges.length
    },
    graph: host,
    fileParams: {},
    appDoc: (raw as { app?: unknown }).app,
    document: bundle.app,
    issue: null,
    graphs,
    operationsReferenceKeys: true,
    appName: bundle.name
  };
};
