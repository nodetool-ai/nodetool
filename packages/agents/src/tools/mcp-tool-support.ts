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
  listOfflineRequiredTextInputs,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import type { GraphValidationIssue, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { Job, Workflow } from "@nodetool-ai/models";
import type {
  RunWorkflowOutcome,
  WorkflowRunEnvironment
} from "@nodetool-ai/execution/service";
import {
  isNonEmptyString,
  isObjectLike,
  isRecord
} from "../utils/type-guards.js";

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

/**
 * A job row without what the run produced — every field of {@link jobRecord}
 * but `outputs`, plus the output names so a caller can see there is something
 * to fetch. This is what a *listing* reports.
 *
 * A job's outputs are the whole answer of a workflow, and `list_jobs` defaults
 * to a hundred of them. One agent listing carried 140 KB of beat sheets past a
 * 25 KB tool-result cap — twice, to read a `status` field — and what was cut
 * was the tail of the JSON, so nothing downstream could parse it either.
 * `get_job` is where a value is read, one job at a time.
 */
export function jobSummaryRecord(job: Job) {
  const outputs = job.runOutputs();
  return {
    id: job.id,
    user_id: job.user_id,
    job_type: "workflow",
    status: job.status,
    workflow_id: job.workflow_id,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
    error: job.error_message ?? job.error ?? null,
    cost: job.cost ?? null,
    // Names, not values: "this job produced `beat_sheet` and `keyframes`; call
    // get_job to read them" is the sentence a listing can afford.
    output_names: outputs === null ? null : Object.keys(outputs)
  };
}

/** A job row as the tools report it — the same fields `/api/jobs` returns. */
export function jobRecord(job: Job) {
  return {
    ...jobSummaryRecord(job),
    // What the run produced, once it settled. A completed job used to report
    // only that it had completed, so an agent that started a background run
    // had no way to read its result.
    outputs: job.runOutputs()
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
  if (!isRecord(graph)) return graph;
  const record = graph as Record<string, unknown>;
  const rawNodes = record["nodes"];
  const rawEdges = record["edges"];

  const normalizeNode = (value: unknown, fallbackId?: string): unknown => {
    if (!isRecord(value)) {
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
    : isObjectLike(rawNodes)
      ? Object.entries(rawNodes as Record<string, unknown>).map(([id, node]) =>
          normalizeNode(node, id)
        )
      : rawNodes;

  const edges = Array.isArray(rawEdges)
    ? rawEdges.map((value, index) => {
        if (!isRecord(value)) {
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
  if (!isObjectLike(w)) return w;
  const r = w as Record<string, unknown>;
  const summary: LightWorkflowSummary = {
    id: r["id"],
    name: r["name"],
    description: r["description"] ?? null,
    tags: r["tags"] ?? null
  };
  // Example records carry their package — get_example_workflow needs it.
  if (isNonEmptyString(r["package_name"])) {
    summary.package_name = r["package_name"];
  }
  return summary;
}

/** Strip embedded graphs from a workflow list, keeping pagination intact. */
export function lightWorkflowList(resp: unknown) {
  if (Array.isArray(resp)) return resp.map(lightWorkflow);
  if (isObjectLike(resp)) {
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
  /** Optional: a catalog that cannot answer omits it and the check is skipped. */
  listRequiredTextInputs?: (
    provider: string,
    modelType: string,
    modelId: string
  ) => readonly string[] | undefined;
}

export const RUNTIME_MODEL_CATALOGS: ModelCatalogs = {
  listProviderIds: () => listRegisteredProviderIds(),
  listModelIds: (provider, modelType) =>
    listOfflineModelIds(provider, modelType),
  listRequiredTextInputs: (provider, modelType, modelId) =>
    listOfflineRequiredTextInputs(provider, modelType, modelId)
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
 * Returns null when every selection resolves. Unselected models are checked
 * separately by {@link unsetModelSelectionError}, which needs registry
 * metadata this walk deliberately avoids.
 */
export async function modelSelectionError(
  graph: unknown,
  catalogs: ModelCatalogs
): Promise<Record<string, unknown> | null> {
  if (!isObjectLike(graph)) return null;
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
 * The declared property bag of a node, from either graph shape.
 *
 * Mirrors `readProperties` in @nodetool-ai/node-sdk's graph-validation: the
 * kernel shape nests the bag under `properties`, the persisted/editor shape
 * under `data.properties`, and older hand-written shapes flattened it onto
 * `data`. Reading only `properties` made every normalized graph — which is
 * what create_workflow checks, since it normalizes first — look like every
 * model property was left unselected.
 */
function readNodeProperties(node: Record<string, unknown>): Record<string, unknown> {
  if (isObjectLike(node["properties"])) {
    return node["properties"] as Record<string, unknown>;
  }
  const data = node["data"];
  if (isObjectLike(data)) {
    const record = data as Record<string, unknown>;
    if (isObjectLike(record["properties"])) {
      return record["properties"] as Record<string, unknown>;
    }
    return record;
  }
  return {};
}

/**
 * True for a DSL wiring handle ({__handle: true, source, sourceHandle}) —
 * the marker the graph builders create to wire an edge before collecting the
 * graph. One that survives into a stored property bag means the connection
 * was never made.
 */
function isWiringHandle(value: unknown): boolean {
  return isObjectLike(value) && (value as Record<string, unknown>)["__handle"] === true;
}

/** Property paths holding a wiring handle, e.g. `tiles[0]`. */
function collectWiringHandlePaths(
  value: unknown,
  path: string,
  out: string[],
  depth = 0
): void {
  if (depth > 4) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectWiringHandlePaths(item, `${path}[${index}]`, out, depth + 1)
    );
    return;
  }
  if (!isObjectLike(value)) return;
  if (isWiringHandle(value)) {
    out.push(path);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    collectWiringHandlePaths(child, path ? `${path}.${key}` : key, out, depth + 1);
  }
}

/**
 * Refuse a graph whose property bags still hold DSL wiring handles.
 *
 * A stored handle is a connection that was never created: the edge does not
 * exist, so the node producing the value is unreachable and the input either
 * stays empty or receives the marker itself at run time. This is exactly how
 * a graph built with handles inside an array property used to save clean and
 * then fail on its first run ("Image input is required."). Re-authoring the
 * wiring fixes it; validate_workflow reports the same finding statically.
 */
export function leftoverWiringHandleError(graph: unknown): Record<string, unknown> | null {
  if (!isObjectLike(graph)) return null;
  const record = graph as { nodes?: unknown };
  const nodes = Array.isArray(record.nodes) ? record.nodes : [];
  const issues: Array<Record<string, unknown>> = [];
  for (const raw of nodes) {
    if (!isObjectLike(raw)) continue;
    const node = raw as Record<string, unknown>;
    const id = String(node["id"] ?? "");
    const type = String(node["type"] ?? node["node_type"] ?? "");
    for (const [name, value] of Object.entries(readNodeProperties(node))) {
      const paths: string[] = [];
      collectWiringHandlePaths(value, name, paths);
      for (const path of paths) {
        issues.push({
          code: "leftover_wiring_handle",
          node_id: id,
          node_type: type,
          message:
            `Property "${path}" on node "${id || type}" still holds a ` +
            "wiring handle — the connection was never created, so the node " +
            "producing this output may be missing from the graph entirely. " +
            "Re-wire it as an edge."
        });
      }
    }
  }
  if (issues.length === 0) return null;
  return {
    error:
      "The graph stores DSL wiring handles as property values instead of " +
      "edges. These inputs are not connected.",
    issues
  };
}

/**
 * Refuse a graph whose nodes leave a declared model property unselected.
 *
 * The cheap selection walk above reads only the property bag; an agent that
 * omits `model` entirely (as the DSL does) stores nothing to find, and full
 * graph validation never runs on the create path. Without this gate such a
 * workflow saves fine and every Agent node dies on "Select a model" at run
 * time — after the upstream half of the graph executed and was paid for.
 *
 * Reuses `registry.validateNode`'s own `unset_model` finding (which skips
 * edge-connected properties) so both surfaces report one thing.
 */
export function unsetModelSelectionError(
  graph: unknown,
  nodeRegistry: {
    has: (type: string) => boolean;
    validateNode: (
      descriptor: { id: string; type: string; properties: Record<string, unknown> },
      connectedHandles: ReadonlySet<string>
    ) => Array<{ code?: string; message: string }>;
  }
): Record<string, unknown> | null {
  if (!isObjectLike(graph)) return null;
  const record = graph as { nodes?: unknown; edges?: unknown };
  const nodes = Array.isArray(record.nodes) ? record.nodes : [];
  if (nodes.length === 0) return null;

  // Property names fed by an incoming data edge are supplied at run time;
  // their stored defaults are not what executes.
  const connected = new Map<string, Set<string>>();
  for (const raw of Array.isArray(record.edges) ? record.edges : []) {
    if (!isObjectLike(raw)) continue;
    const edge = raw as Record<string, unknown>;
    if (edge["edge_type"] === "control" || edge["type"] === "control") continue;
    const target = String(edge["target"] ?? "");
    const handle = String(
      edge["targetHandle"] ?? edge["target_handle"] ?? ""
    );
    if (!target || !handle) continue;
    let handles = connected.get(target);
    if (!handles) {
      handles = new Set<string>();
      connected.set(target, handles);
    }
    handles.add(handle);
  }

  const issues: Array<Record<string, unknown>> = [];
  for (const node of nodes) {
    if (!isObjectLike(node)) continue;
    const n = node as Record<string, unknown>;
    const type = String(n["type"] ?? "");
    const id = String(n["id"] ?? "");
    if (!type || !nodeRegistry.has(type)) continue;
    for (const issue of nodeRegistry.validateNode(
      { id, type, properties: readNodeProperties(n) },
      connected.get(id) ?? new Set<string>()
    )) {
      if (issue.code !== "unset_model") continue;
      issues.push({
        code: "unset_model",
        node_id: id,
        node_type: type,
        message:
          `${issue.message} Pick a model with find_model and assign its ` +
          "`ref` before saving."
      });
    }
  }
  if (issues.length === 0) return null;
  return {
    error:
      "The graph leaves one or more model properties unselected. Every " +
      "model node needs a selected model at save time — nothing stamps one " +
      "in at run time.",
    issues
  };
}

/**
 * Escalated run payloads name the follow-up tool, so the model driving the
 * loop knows how to answer without reading endpoint docs.
 */
export function annotateEscalatedRun(run: unknown) {
  if (!isObjectLike(run)) return run;
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
  if (!isObjectLike(workflow)) return workflow;
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
