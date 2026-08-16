/**
 * Shared helpers behind the nodetool tool surface: record projections, the
 * agent-authored graph normalizer, the run-environment resolver, and the
 * model-selection pre-check.
 *
 * They used to be module-private inside `mcp-tools.ts`. The `workflows`
 * capability module (`../capabilities/workflows.ts`) needs the same functions,
 * and a capability module must not import the tool module it replaces, so they
 * live here and both sides import them.
 *
 * Heavy cones stay out of this file's import graph: `@nodetool-ai/models`,
 * `@nodetool-ai/node-sdk`'s validators and the execution service are type-only
 * imports, and the one value they need is imported inside the function.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  listOfflineModelIds,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import type { GraphValidationIssue, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { Job, Workflow } from "@nodetool-ai/models";
import type {
  RunWorkflowOutcome,
  WorkflowRunEnvironment
} from "@nodetool-ai/execution/service";

/** The user every read and write is scoped to. */
export function userIdOf(context: ProcessingContext): string {
  return context.userId ?? "1";
}

/**
 * Resolves the environment a workflow run executes in. The server injects its
 * full Python-aware runtime (bridge, executor resolution) lazily; a host that
 * has only a registry gets registry-only resolution, and Python nodes report
 * they cannot execute instead of silently doing nothing.
 */
export type WorkflowEnvironmentProvider = () => Promise<WorkflowRunEnvironment>;

/** The run environment a tool was constructed with, or null when it has none. */
export async function resolveRunEnvironment(
  environment: WorkflowEnvironmentProvider | undefined,
  registry: NodeRegistry | undefined
): Promise<WorkflowRunEnvironment | null> {
  if (environment) return environment();
  return registry ? { registry } : null;
}

/**
 * The refusal a tool returns when it needs the node registry and was
 * constructed without one — a registry-free context (the multi-task planner,
 * a unit test) cannot resolve a node type, so a run would fail late and
 * cryptically instead of here.
 */
export function noRegistryError(what: string) {
  return {
    error:
      `Cannot ${what}: no node registry is available in this process. Call ` +
      "this tool from a server-side context, or use the CLI.",
    ran: false
  };
}

/** A run/debug service outcome as a tool result. */
export function outcomeResult(outcome: RunWorkflowOutcome): unknown {
  return outcome.kind === "payload"
    ? outcome.payload
    : { error: outcome.detail, status: outcome.status };
}

/** A stored workflow as the tools report it — the same fields the API returns. */
export function workflowRecord(workflow: Workflow) {
  return {
    id: workflow.id,
    access: workflow.access,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at,
    name: workflow.name,
    tool_name: workflow.tool_name,
    description: workflow.description,
    tags: workflow.tags,
    thumbnail: workflow.thumbnail,
    thumbnail_url: workflow.thumbnail_url,
    graph: workflow.graph,
    settings: workflow.settings,
    package_name: workflow.package_name,
    path: workflow.path,
    run_mode: workflow.run_mode,
    workspace_id: workflow.workspace_id,
    html_app: workflow.html_app,
    app_doc: workflow.app_doc ?? null
  };
}

/** A job row as the tools report it — the same fields `/api/jobs` returns. */
export function jobRecord(job: Job) {
  return {
    id: job.id,
    user_id: job.user_id,
    job_type: "workflow",
    status: job.status,
    workflow_id: job.workflow_id,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
    error: job.error_message ?? job.error ?? null,
    cost: job.cost ?? null
  };
}

// Column/row spacing for the auto-layout. 280 is NodeTool's default node
// width, so a 320 column gap leaves ~40px between stages.
const LAYOUT_COL_GAP = 320;
const LAYOUT_ROW_GAP = 220;

/**
 * Assign a grid position to every node from the graph's dataflow: columns are
 * topological depth (longest path from a root), rows are order within a
 * column. A left-to-right layered layout — the same shape NodeTool graphs are
 * authored in — without a full layout engine (no `elkjs` in the backend).
 */
function computeAutoLayout(
  nodeIds: string[],
  edges: Array<Record<string, unknown>>
): Map<string, { x: number; y: number }> {
  const ids = new Set(nodeIds);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    indegree.set(id, 0);
  }
  for (const edge of edges) {
    const source = edge["source"] == null ? "" : String(edge["source"]);
    const target = edge["target"] == null ? "" : String(edge["target"]);
    if (source === target || !ids.has(source) || !ids.has(target)) continue;
    outgoing.get(source)!.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  // Longest-path layering via Kahn's topological order: each node lands one
  // column past its deepest upstream. Roots (no incoming edge) sit in column 0.
  const column = new Map<string, number>();
  const remaining = new Map(indegree);
  const queue: string[] = [];
  for (const id of nodeIds) {
    column.set(id, 0);
    if ((indegree.get(id) ?? 0) === 0) queue.push(id);
  }
  const ordered: string[] = [];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    ordered.push(id);
    for (const target of outgoing.get(id) ?? []) {
      column.set(target, Math.max(column.get(target)!, column.get(id)! + 1));
      remaining.set(target, remaining.get(target)! - 1);
      if (remaining.get(target) === 0) queue.push(target);
    }
  }
  // A cycle leaves nodes that never reach indegree 0; keep them in column 0 and
  // append in original order so they still get a slot.
  const placed = new Set(ordered);
  for (const id of nodeIds) if (!placed.has(id)) ordered.push(id);

  const rowByColumn = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const id of ordered) {
    const col = column.get(id) ?? 0;
    const row = rowByColumn.get(col) ?? 0;
    rowByColumn.set(col, row + 1);
    positions.set(id, { x: col * LAYOUT_COL_GAP, y: row * LAYOUT_ROW_GAP });
  }
  return positions;
}

/**
 * Set `ui_properties.position` on every node from {@link computeAutoLayout},
 * overriding any caller-supplied coordinates (create_workflow always
 * auto-lays-out) while preserving other `ui_properties` fields (title, color).
 */
function withAutoLayout(nodes: unknown, edges: unknown): unknown {
  if (!Array.isArray(nodes)) return nodes;
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const edgeList = Array.isArray(edges) ? edges.filter(isRecord) : [];
  const ids = nodes.filter(isRecord).map((node) => String(node["id"] ?? ""));
  const positions = computeAutoLayout(ids, edgeList);
  return nodes.map((node) => {
    if (!isRecord(node)) return node;
    const id = String(node["id"] ?? "");
    const ui = isRecord(node["ui_properties"]) ? node["ui_properties"] : {};
    return {
      ...node,
      ui_properties: {
        zIndex: 0,
        width: 280,
        selectable: true,
        ...ui,
        position: positions.get(id) ?? { x: 0, y: 0 }
      }
    };
  });
}

/**
 * Normalize an agent-authored graph into the *stored* workflow shape.
 *
 * Two representations exist. The kernel (and `GraphBuilder`)
 * puts a node's property bag under `properties`; the persisted/editor shape
 * puts it flat under `data`, with layout under `ui_properties`. Saving kernel
 * shape runs fine — `normalizeGraph` in the websocket runner maps `data` →
 * `properties` on the way to the kernel and leaves an existing `properties`
 * alone — but the editor reads `node.data`, so such a workflow opens with
 * every node blank. An authored graph carries no layout at all, so the nodes
 * would also pile at the origin.
 *
 * This is the boundary where both conversions happen — `create_workflow` is
 * the only tool that persists a graph, so it maps `properties` → `data` and
 * always auto-lays-out the result.
 */
export function normalizeWorkflowGraph(graph: unknown) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return graph;
  const record = graph as Record<string, unknown>;
  const rawNodes = record["nodes"];
  const rawEdges = record["edges"];

  const normalizeNode = (value: unknown, fallbackId?: string): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const node = value as Record<string, unknown>;
    // `properties` and `parameters` are dropped from the spread so the stored
    // node carries the bag once, under `data`. `ui_properties` stays in `rest`
    // and is filled in by `withAutoLayout` below.
    const { node_type, parameters, properties, ...rest } = node;
    const data = properties ?? parameters ?? node["data"];
    const base = {
      ...rest,
      id: node["id"] ?? fallbackId,
      type: node["type"] ?? node_type
    };
    return data === undefined ? base : { ...base, data };
  };

  const nodes = Array.isArray(rawNodes)
    ? rawNodes.map((node) => normalizeNode(node))
    : rawNodes && typeof rawNodes === "object"
      ? Object.entries(rawNodes as Record<string, unknown>).map(([id, node]) =>
          normalizeNode(node, id)
        )
      : rawNodes;

  const edges = Array.isArray(rawEdges)
    ? rawEdges.map((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return value;
        }
        const edge = value as Record<string, unknown>;
        const { source_output, target_input, ...rest } = edge;
        return {
          ...rest,
          id: edge["id"] ?? `edge-${index}`,
          sourceHandle: edge["sourceHandle"] ?? source_output ?? "output",
          targetHandle: edge["targetHandle"] ?? target_input
        };
      })
    : rawEdges;

  return { ...record, nodes: withAutoLayout(nodes, edges), edges };
}

// ============================================================================
// Workflow Tools
// ============================================================================

/** The light workflow projection; `package_name` only on example records. */
type LightWorkflowSummary = {
  id: unknown;
  name: unknown;
  description: unknown;
  tags: unknown;
  package_name?: string;
};

/** Project a workflow record to a light summary — never the full graph. */
function lightWorkflow(w: unknown) {
  if (!w || typeof w !== "object") return w;
  const r = w as Record<string, unknown>;
  const summary: LightWorkflowSummary = {
    id: r["id"],
    name: r["name"],
    description: r["description"] ?? null,
    tags: r["tags"] ?? null
  };
  // Example records carry their package — get_example_workflow needs it.
  if (typeof r["package_name"] === "string" && r["package_name"]) {
    summary.package_name = r["package_name"];
  }
  return summary;
}

/** Strip embedded graphs from a workflow list, keeping pagination intact. */
export function lightWorkflowList(resp: unknown) {
  if (Array.isArray(resp)) return resp.map(lightWorkflow);
  if (resp && typeof resp === "object") {
    const r = resp as Record<string, unknown>;
    if (Array.isArray(r["workflows"])) {
      return { ...r, workflows: r["workflows"].map(lightWorkflow) };
    }
  }
  return resp;
}

/**
 * The shipped example workflows. They are JSON files inside the installed node
 * packages, and finding them is the server's job (`example-workflows.ts` walks
 * the package metadata roots), so a host that has them injects this.
 */
export interface ExampleWorkflowCatalog {
  /** Every example, optionally filtered by a free-text query. */
  list: (opts: { query?: string; limit?: number }) => Promise<unknown[]>;
  /** One example by package and name, graph included. */
  get: (packageName: string, exampleName: string) => Promise<unknown | null>;
}

export const NO_EXAMPLES = {
  error:
    "Example workflows are not available in this process — the catalog is " +
    "read from the installed node packages by the server."
};

/**
 * The provider and model catalogs to check a graph's selections against.
 * Defaults to the runtime's own — these tools run server-side — and is
 * injectable so a caller with a different catalog, or a test, can supply one.
 */
export interface ModelCatalogs {
  listProviderIds: () => readonly string[];
  listModelIds: (
    provider: string,
    modelType: string
  ) => readonly string[] | undefined;
}

export const RUNTIME_MODEL_CATALOGS: ModelCatalogs = {
  listProviderIds: () => listRegisteredProviderIds(),
  listModelIds: (provider, modelType) =>
    listOfflineModelIds(provider, modelType)
};

/**
 * The provider/model half of graph validation, as tool-result data.
 *
 * Every model id in a graph an agent authored is a guess until something
 * checks it, and the failure is expensive and late: the run starts, the
 * upstream nodes execute, and the model node dies on a provider that was never
 * registered. This is the cheap half of `validateGraph` — a property walk, no
 * registry metadata — so a creation tool can afford it on every call.
 *
 * Returns null when every selection resolves.
 */
export async function modelSelectionError(
  graph: unknown,
  catalogs: ModelCatalogs
): Promise<Record<string, unknown> | null> {
  if (!graph || typeof graph !== "object") return null;
  const nodes = (graph as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return null;
  const { collectModelSelectionIssues } = await import("@nodetool-ai/node-sdk");
  const issues: GraphValidationIssue[] = collectModelSelectionIssues(
    { nodes: nodes as never[] },
    catalogs
  );
  if (issues.length === 0) return null;
  return {
    error:
      "The graph selects providers or models the runtime cannot honour. Fix " +
      "them (find_model returns a valid {provider, model_id} pair) and retry.",
    issues: issues.map((issue) => ({
      code: issue.code,
      node_id: issue.nodeId,
      node_type: issue.nodeType,
      message: issue.message
    }))
  };
}

/**
 * Escalated run payloads name the follow-up tool, so the model driving the
 * loop knows how to answer without reading endpoint docs.
 */
export function annotateEscalatedRun(run: unknown) {
  if (!run || typeof run !== "object") return run;
  const record = run as Record<string, unknown>;
  if (record["status"] !== "escalated") return run;
  return {
    ...record,
    next_tool:
      "A node invocation failed and the run is parked awaiting your verdict. " +
      "Call resolve_workflow_escalation with this session_id and " +
      "escalation_id and one of the escalation's allowedActions."
  };
}

/** Distill a workflow API record down to a graph overview for a debug report. */
export function summarizeWorkflowGraph(workflow: unknown) {
  if (!workflow || typeof workflow !== "object") return workflow;
  const wf = workflow as Record<string, unknown>;
  const graph = (wf.graph ?? wf) as Record<string, unknown>;
  const nodes = Array.isArray(graph.nodes)
    ? (graph.nodes as Array<Record<string, unknown>>)
    : [];
  const edges = Array.isArray(graph.edges)
    ? (graph.edges as Array<Record<string, unknown>>)
    : [];
  return {
    id: wf.id,
    name: wf.name,
    node_count: nodes.length,
    edge_count: edges.length,
    node_types: [...new Set(nodes.map((n) => String(n.type ?? "unknown")))],
    nodes: nodes.map((n) => ({ id: n.id, type: n.type })),
    edges
  };
}
