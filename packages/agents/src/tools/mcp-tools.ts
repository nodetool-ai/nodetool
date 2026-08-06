/**
 * MCP Tool wrappers for the Agent system.
 *
 * These tools give the agent "omnipotent" control over nodetool:
 * workflows, nodes, jobs, assets, and models via REST API calls.
 *
 * Port of src/nodetool/agents/tools/mcp_tools.py
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import {
  ACTIVE_MODEL_CONTEXT_KEY,
  listOfflineModelIds,
  listRegisteredProviderIds,
  type ActiveModelSelection
} from "@nodetool-ai/runtime";
import type {
  GraphValidationIssue,
  NodeMetadata,
  NodeRegistry
} from "@nodetool-ai/node-sdk";
import {
  collectModelSelectionIssues,
  validateGraph
} from "@nodetool-ai/node-sdk";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import { validateSketchDocument } from "@nodetool-ai/execution/sketch-debug";
import { Tool } from "./base-tool.js";
import { LocalListNodesTool } from "./local-list-nodes-tool.js";
import { LocalSearchNodesTool } from "./local-search-nodes-tool.js";
import { LocalGetNodeInfoTool } from "./local-get-node-info-tool.js";
import { FindModelTool } from "./find-model-tool.js";
import { ListModelsTool } from "./list-models-tool.js";
import {
  GenerateImageTool,
  EditImageTool,
  GenerateVideoTool,
  AnimateImageTool,
  GenerateSpeechTool,
  TranscribeAudioTool,
  EmbedTextTool
} from "./media-tools.js";
import { SaveAssetTool, ReadAssetTool } from "./asset-tools.js";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { uiToolSchemas } from "@nodetool-ai/protocol";
import { graph as workflowGraphSchema } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  applyWorkflowDocumentTool,
  WORKFLOW_DOCUMENT_TOOL_NAMES,
  type WorkflowDocumentToolName
} from "@nodetool-ai/node-sdk";
import { z } from "zod";
import { GraphPlanner } from "../graph-planner.js";
import { TOOL_CALL_ID_FIELD } from "./subtask-fields.js";

const DEFAULT_API_URL = "http://localhost:7777";

function getApiUrl(context: ProcessingContext): string {
  return context.environment?.["NODETOOL_API_URL"] ?? DEFAULT_API_URL;
}

function getHeaders(context: ProcessingContext): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (context.userId) {
    headers["X-User-Id"] = context.userId;
  }
  if (context.authToken) {
    headers["Authorization"] = `Bearer ${context.authToken}`;
  }
  return headers;
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
 * Two representations exist. The kernel (and `GraphPlanner`/`GraphBuilder`)
 * puts a node's property bag under `properties`; the persisted/editor shape
 * puts it flat under `data`, with layout under `ui_properties`. Saving kernel
 * shape runs fine — `normalizeGraph` in the websocket runner maps `data` →
 * `properties` on the way to the kernel and leaves an existing `properties`
 * alone — but the editor reads `node.data`, so such a workflow opens with
 * every node blank. The planner emits no layout at all, so the nodes would
 * also pile at the origin.
 *
 * This is the boundary where both conversions happen — `create_workflow` is
 * the only tool that persists a graph, so it maps `properties` → `data` and
 * always auto-lays-out the result.
 */
function normalizeWorkflowGraph(graph: unknown): unknown {
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
    return {
      ...rest,
      id: node["id"] ?? fallbackId,
      type: node["type"] ?? node_type,
      ...(data === undefined ? {} : { data })
    };
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

async function apiGet(
  context: ProcessingContext,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): Promise<unknown> {
  const base = getApiUrl(context);
  const url = new URL(path, base);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { headers: getHeaders(context) });
  if (!res.ok) {
    const text = await res.text();
    return { error: `API error ${res.status}: ${text}` };
  }
  return res.json();
}

async function apiPost(
  context: ProcessingContext,
  path: string,
  body?: unknown
): Promise<unknown> {
  const base = getApiUrl(context);
  const url = new URL(path, base);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: getHeaders(context),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `API error ${res.status}: ${text}` };
  }
  return res.json();
}

/**
 * POST that reports the HTTP status instead of collapsing a failure into an
 * `{ error }` body. A caller that needs to tell "this server has no such
 * endpoint" from "the endpoint ran and reported a failure" cannot do it from
 * the body: a failed run legitimately carries an `error` field of its own.
 */
async function apiPostWithStatus(
  context: ProcessingContext,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = new URL(path, getApiUrl(context));
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: getHeaders(context),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      status: res.status,
      data: { error: `API error ${res.status}: ${text}` }
    };
  }
  return { ok: true, status: res.status, data: await res.json() };
}

async function apiPut(
  context: ProcessingContext,
  path: string,
  body: unknown
): Promise<unknown> {
  const url = new URL(path, getApiUrl(context));
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: getHeaders(context),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `API error ${res.status}: ${text}` };
  }
  return res.json();
}

// ============================================================================
// Workflow Tools
// ============================================================================

/** Project a workflow record to a light summary — never the full graph. */
function lightWorkflow(w: unknown): unknown {
  if (!w || typeof w !== "object") return w;
  const r = w as Record<string, unknown>;
  return {
    id: r["id"],
    name: r["name"],
    description: r["description"] ?? null,
    tags: r["tags"] ?? null
  };
}

/** Strip embedded graphs from a `/api/workflows` list response (array or
 *  `{ workflows: [...] }`), keeping pagination fields intact. */
function lightWorkflowList(resp: unknown): unknown {
  if (Array.isArray(resp)) return resp.map(lightWorkflow);
  if (resp && typeof resp === "object") {
    const r = resp as Record<string, unknown>;
    if (Array.isArray(r["workflows"])) {
      return { ...r, workflows: r["workflows"].map(lightWorkflow) };
    }
  }
  return resp;
}

export class ListWorkflowsTool extends Tool {
  readonly name = "list_workflows";
  readonly description =
    "List workflows (id, name, description, tags only — no graph). Returns user workflows, example workflows, or both. Use get_workflow for the full graph of a specific workflow.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_type: {
        type: "string" as const,
        description: "Type of workflows to list",
        enum: ["user", "example", "all"],
        default: "user"
      },
      query: {
        type: "string" as const,
        description: "Optional search query to filter workflows"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of workflows to return",
        default: 100
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const workflowType = String(params["workflow_type"] ?? "user");
    const query = params["query"] as string | undefined;
    const limit = Number(params["limit"] ?? 100);

    if (workflowType === "example" || workflowType === "all") {
      const examples = lightWorkflowList(
        await apiGet(context, "/api/workflows/examples", { limit, query })
      );
      if (workflowType === "example") return examples;
      const user = lightWorkflowList(
        await apiGet(context, "/api/workflows/", { limit })
      );
      return { examples, user };
    }
    return lightWorkflowList(
      await apiGet(context, "/api/workflows/", { limit })
    );
  }

  userMessage(params: Record<string, unknown>): string {
    const wt = params["workflow_type"] ?? "user";
    const q = params["query"];
    if (q) return `Listing ${wt} workflows matching '${q}'`;
    return `Listing ${wt} workflows`;
  }
}

export class GetWorkflowTool extends Tool {
  readonly name = "get_workflow";
  readonly description =
    "Get detailed information about a specific workflow including its graph structure.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "The ID of the workflow"
      }
    },
    required: ["workflow_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(context, `/api/workflows/${params["workflow_id"]}`);
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting workflow ${params["workflow_id"]}`;
  }
}

export class WorkflowDocumentTool extends Tool {
  readonly description: string;

  constructor(
    readonly name: WorkflowDocumentToolName,
    private readonly registry?: NodeRegistry
  ) {
    super();
    this.description = uiToolSchemas[name].description;
  }

  override get schema(): z.ZodType {
    return z.object(uiToolSchemas[this.name].parameters);
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const workflowId =
      typeof params["workflow_id"] === "string"
        ? params["workflow_id"]
        : context.workflowId;
    if (!workflowId) {
      return {
        error: "workflow_id_required",
        message: "workflow_id is required when no workflow is active."
      };
    }

    const response = await apiGet(context, `/api/workflows/${workflowId}`);
    if (!response || typeof response !== "object" || Array.isArray(response)) {
      return { error: "Invalid workflow response" };
    }
    const workflow = response as Record<string, unknown>;
    if ("error" in workflow) return workflow;
    const parsedGraph = workflowGraphSchema.safeParse(workflow["graph"]);
    if (!parsedGraph.success) {
      return { error: "Workflow has an invalid graph" };
    }

    const metadataByType = new Map<string, NodeMetadata>();
    const loadMetadata = async (nodeType: string): Promise<void> => {
      const local = this.registry?.resolveMetadata(nodeType);
      if (local) {
        metadataByType.set(nodeType, local);
        return;
      }
      const remote = await apiGet(context, "/api/nodes/metadata", {
        node_type: nodeType
      });
      if (
        remote &&
        typeof remote === "object" &&
        !Array.isArray(remote) &&
        !("error" in remote)
      ) {
        metadataByType.set(nodeType, remote as NodeMetadata);
      }
    };

    if (this.name === "ui_add_node" && typeof params["type"] === "string") {
      await loadMetadata(params["type"]);
    } else if (this.name === "ui_connect_nodes") {
      const sourceId = String(params["source_node_id"]);
      const targetId = String(params["target_node_id"]);
      const source = parsedGraph.data.nodes.find(
        (node) => node.id === sourceId
      );
      const target = parsedGraph.data.nodes.find(
        (node) => node.id === targetId
      );
      await Promise.all(
        [source?.type, target?.type]
          .filter((type): type is string => typeof type === "string")
          .map(loadMetadata)
      );
    }

    const applied = applyWorkflowDocumentTool(
      parsedGraph.data,
      this.name,
      params,
      {
        workflowId,
        resolveMetadata: (nodeType) => metadataByType.get(nodeType)
      }
    );
    if (!applied.changed) return applied.result;

    const updated = await apiPut(context, `/api/workflows/${workflowId}`, {
      name: workflow["name"],
      access: workflow["access"] ?? "private",
      graph: applied.graph,
      tool_name: workflow["tool_name"],
      description: workflow["description"],
      tags: workflow["tags"],
      package_name: workflow["package_name"],
      thumbnail: workflow["thumbnail"],
      thumbnail_url: workflow["thumbnail_url"],
      settings: workflow["settings"],
      run_mode: workflow["run_mode"],
      workspace_id: workflow["workspace_id"],
      html_app: workflow["html_app"],
      app_doc: workflow["app_doc"],
      expected_updated_at: workflow["updated_at"]
    });
    if (!updated || typeof updated !== "object" || Array.isArray(updated)) {
      return { error: "Invalid workflow update response" };
    }
    const persisted = updated as Record<string, unknown>;
    if ("error" in persisted) return persisted;
    return {
      ...applied.result,
      updated_at: persisted["updated_at"],
      etag: persisted["etag"]
    };
  }
}

export function createWorkflowDocumentTools(
  registry?: NodeRegistry
): WorkflowDocumentTool[] {
  return WORKFLOW_DOCUMENT_TOOL_NAMES.map(
    (name) => new WorkflowDocumentTool(name, registry)
  );
}

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

const RUNTIME_MODEL_CATALOGS: ModelCatalogs = {
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
function modelSelectionError(
  graph: unknown,
  catalogs: ModelCatalogs
): Record<string, unknown> | null {
  if (!graph || typeof graph !== "object") return null;
  const nodes = (graph as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return null;
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

export class CreateWorkflowTool extends Tool {
  readonly name = "create_workflow";
  readonly description =
    "Create a new workflow with a name, graph structure, and optional " +
    "metadata. Model properties are checked before the workflow is created: " +
    "an unregistered provider or a model id the provider does not offer is " +
    "returned as an error instead of being saved.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      name: { type: "string" as const, description: "The workflow name" },
      graph: {
        type: "object" as const,
        description:
          "Workflow graph with nodes and edges. Nodes may be an array of {id, type, properties} or an object keyed by node id with {node_type, parameters}. Edges use source, target, targetHandle/target_input, and optional sourceHandle/source_output (defaults to output)."
      },
      description: {
        type: "string" as const,
        description: "Optional workflow description"
      },
      tags: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Optional workflow tags"
      },
      access: {
        type: "string" as const,
        enum: ["private", "public"],
        default: "private"
      }
    },
    required: ["name", "graph"]
  };

  constructor(private readonly catalogs: ModelCatalogs = RUNTIME_MODEL_CATALOGS) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const graph = normalizeWorkflowGraph(params["graph"]);
    const badModels = modelSelectionError(graph, this.catalogs);
    if (badModels) return badModels;

    return apiPost(context, "/api/workflows", {
      name: params["name"],
      graph,
      description: params["description"],
      tags: params["tags"],
      access: params["access"] ?? "private"
    });
  }

  userMessage(params: Record<string, unknown>): string {
    return `Creating workflow '${params["name"]}'`;
  }
}

/**
 * Escalated run payloads name the follow-up tool, so the model driving the
 * loop knows how to answer without reading endpoint docs.
 */
function annotateEscalatedRun(run: unknown): unknown {
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

export class RunWorkflowTool extends Tool {
  readonly name = "run_workflow";
  readonly description =
    "Execute a workflow with given parameters and return results. With " +
    "interactive=true a failing node invocation pauses the run and returns " +
    "an escalation (status \"escalated\") for you to answer via " +
    "resolve_workflow_escalation — retry, substitute, skip, or fail — " +
    "instead of the whole run failing outright.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "The ID of the workflow to run"
      },
      params: {
        type: "object" as const,
        description: "Dictionary of input parameters for the workflow"
      },
      interactive: {
        type: "boolean" as const,
        description:
          "Bubble node failures up as escalations you answer, instead of " +
          "failing the run (default false)"
      }
    },
    required: ["workflow_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const run = await apiPost(
      context,
      `/api/workflows/${params["workflow_id"]}/run`,
      {
        params: params["params"] ?? {},
        ...(params["interactive"] === true ? { interactive: true } : {})
      }
    );
    return annotateEscalatedRun(run);
  }

  userMessage(params: Record<string, unknown>): string {
    return `Running workflow ${params["workflow_id"]}`;
  }
}

/** Distill a workflow API record down to a graph overview for a debug report. */
function summarizeWorkflowGraph(workflow: unknown): unknown {
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

export class DebugWorkflowTool extends Tool {
  readonly name = "debug_workflow";
  readonly description =
    "Run a workflow end-to-end and return a consolidated debug report: a " +
    "pass/fail verdict with the issues behind it, per-node status and errors, " +
    "logs, LLM calls, outputs, job record, and the workflow graph overview. " +
    "Use this to troubleshoot a failing or misbehaving workflow and iterate. " +
    "With interactive=true a failing node invocation pauses the run and " +
    "returns an escalation (status \"escalated\") for you to answer via " +
    "resolve_workflow_escalation before the report is produced.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "The ID of the workflow to run and debug"
      },
      params: {
        type: "object" as const,
        description: "Input parameters keyed by input-node name"
      },
      interactive: {
        type: "boolean" as const,
        description:
          "Bubble node failures up as escalations you answer mid-run, " +
          "instead of only reading them post-mortem (default false)"
      },
      include_graph: {
        type: "boolean" as const,
        description:
          "Include the workflow graph overview in the report (default true)"
      },
      log_limit: {
        type: "number" as const,
        description: "Maximum job log entries to include (default 200)"
      }
    },
    required: ["workflow_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const workflowId = String(params["workflow_id"]);
    const includeGraph = params["include_graph"] !== false;
    const logLimit = Number(params["log_limit"] ?? 200);

    // `/debug` runs the workflow and returns the same execution summary and
    // verdict the CLI harness computes. Older servers only expose `/run`,
    // which starts the job and reports a status string — fall back to it so
    // the tool still works, and say so in the report.
    //
    // The fallback triggers on the endpoint being absent (404/405), never on
    // the body: a run that failed reports its own `error` alongside the
    // summary and verdict, which is precisely the report worth keeping.
    const debugRun = await apiPostWithStatus(
      context,
      `/api/workflows/${workflowId}/debug`,
      {
        params: params["params"] ?? {},
        ...(params["interactive"] === true ? { interactive: true } : {})
      }
    );
    const endpointMissing =
      !debugRun.ok && (debugRun.status === 404 || debugRun.status === 405);
    let run = debugRun.data;
    if (endpointMissing) {
      run = await apiPost(context, `/api/workflows/${workflowId}/run`, {
        params: params["params"] ?? {}
      });
    }

    // An escalated run has produced no report yet — the job is parked on the
    // failing node. Hand the escalation back for a verdict; the final report
    // arrives from resolve_workflow_escalation once the run settles.
    if (
      run &&
      typeof run === "object" &&
      (run as Record<string, unknown>)["status"] === "escalated"
    ) {
      return { workflow_id: workflowId, run: annotateEscalatedRun(run) };
    }

    const report: Record<string, unknown> = { workflow_id: workflowId, run };
    if (endpointMissing) {
      report["note"] =
        "Server has no /debug endpoint; reporting the plain run result without an execution summary or verdict.";
    }

    const jobId = (run as Record<string, unknown>)?.["job_id"];
    if (typeof jobId === "string") {
      report["job"] = await apiGet(context, `/api/jobs/${jobId}`, {
        limit: logLimit
      });
    }
    if (includeGraph) {
      const wf = await apiGet(context, `/api/workflows/${workflowId}`);
      report["workflow"] = summarizeWorkflowGraph(wf);
    }
    return report;
  }

  userMessage(params: Record<string, unknown>): string {
    return `Debugging workflow ${params["workflow_id"]}`;
  }
}

export class ResolveWorkflowEscalationTool extends Tool {
  readonly name = "resolve_workflow_escalation";
  readonly description =
    "Answer an escalation raised by an interactive run_workflow/debug_workflow " +
    "run. The run is parked on the failing node until you decide: retry the " +
    "invocation, substitute repaired outputs (only when the escalation carries " +
    "a candidateOutput), skip the invocation, end the stream (streaming nodes), " +
    "or fail the node. Only the escalation's allowedActions are accepted; the " +
    "kernel enforces the same set. Returns the next escalation (answer it the " +
    "same way) or the run's final report.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      session_id: {
        type: "string" as const,
        description: "The debug session id from the escalated response"
      },
      escalation_id: {
        type: "string" as const,
        description: "The escalation id being answered"
      },
      action: {
        type: "string" as const,
        enum: ["retry", "substitute", "skip", "end_stream", "fail"],
        description: "The verdict — must be one of the escalation's allowedActions"
      },
      outputs: {
        type: "object" as const,
        description:
          "For substitute: repaired output values keyed by the node's " +
          "declared output slots"
      },
      reason: {
        type: "string" as const,
        description:
          "For fail: a one-sentence reason surfaced as the run's error summary"
      },
      apply_to: {
        type: "string" as const,
        enum: ["invocation", "signature"],
        description:
          "For skip/fail: \"signature\" also resolves later failures with the " +
          "same failureSignature without asking again (default \"invocation\")"
      }
    },
    required: ["session_id", "escalation_id", "action"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const action = String(params["action"]);
    const verdict: Record<string, unknown> = { action };
    if (action === "substitute" && params["outputs"] !== undefined) {
      verdict["outputs"] = params["outputs"];
    }
    if (action === "fail" && typeof params["reason"] === "string") {
      verdict["reason"] = params["reason"];
    }
    if (
      (action === "skip" || action === "fail") &&
      typeof params["apply_to"] === "string"
    ) {
      verdict["applyTo"] = params["apply_to"];
    }
    const result = await apiPost(
      context,
      `/api/debug/sessions/${params["session_id"]}/verdict`,
      { escalation_id: params["escalation_id"], verdict }
    );
    return annotateEscalatedRun(result);
  }

  userMessage(params: Record<string, unknown>): string {
    return `Resolving workflow escalation with "${params["action"]}"`;
  }
}

export class BuildAppTool extends Tool {
  readonly name = "build_app";
  readonly description =
    "Build a mini app from one sentence of intent and return the build " +
    "report: the pinned spec, what each stage did, the issues repair rounds " +
    "fixed, the simulated run of every interaction, a pass/fail verdict, and " +
    "— only behind a passing verdict — the ApplicationBundle. The bundle is " +
    "offered, not installed: show the user the verdict and install it with " +
    "POST /api/applications/import-bundle once they agree. The build's own " +
    "model calls default to the provider and model YOU are running on — omit " +
    "provider/model to inherit them; pass both only to build with a " +
    "different model. A build takes " +
    "minutes; pass poll=true to get a session id back immediately, then read " +
    "GET /api/debug/sessions/<id> until it settles or cancel it with POST " +
    "/api/debug/sessions/<id>/cancel.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string" as const,
        description: "What the app should do, in the user's own terms"
      },
      spec: {
        type: "object" as const,
        description:
          "A pinned BuildSpec to build instead of writing one from the prompt"
      },
      provider: {
        type: "string" as const,
        description:
          "Provider id for the build's own model calls. Defaults to the " +
          "provider of the agent making this call."
      },
      model: {
        type: "string" as const,
        description:
          "Model id the build authors with. Defaults to the model of the " +
          "agent making this call."
      },
      workflow_ids: {
        type: "array" as const,
        items: { type: "string" as const },
        description:
          "Existing workflow ids to pin, in the spec's operation order — " +
          "these are bound instead of planned"
      },
      max_repairs: {
        type: "number" as const,
        description: "Repair rounds allowed after the first pass (default 3)"
      },
      cost_cap_usd: {
        type: "number" as const,
        description: "Ceiling on what the build may spend (default 2)"
      },
      timeout_ms: {
        type: "number" as const,
        description: "Wall clock for the whole build (default 600000)"
      },
      poll: {
        type: "boolean" as const,
        description:
          "Return a session id as soon as the build starts instead of " +
          "waiting for it (default false)"
      }
    },
    required: []
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const inherited = context.get<ActiveModelSelection | undefined>(
      ACTIVE_MODEL_CONTEXT_KEY
    );
    const body = { ...params };
    if (inherited) {
      body["provider"] ??= inherited.provider;
      body["model"] ??= inherited.model;
    }
    return apiPost(context, "/api/applications/build", body);
  }

  userMessage(params: Record<string, unknown>): string {
    const prompt = params["prompt"];
    return typeof prompt === "string" && prompt.trim()
      ? `Building an app: ${prompt}`
      : "Building an app from the given spec";
  }
}

export class DebugAppTool extends Tool {
  readonly name = "debug_app";
  readonly description =
    "Debug a mini APP (not a workflow): validate every widget binding, " +
    "simulate the app the way the web runtime does, execute its operations " +
    "on the kernel, and return each widget's final state plus a pass/fail " +
    "verdict with the issues behind it. Pass `application_id` for a saved " +
    "app or `document` for an unsaved one — exactly one of them. With " +
    "run=false this is a static wiring check that runs in milliseconds and " +
    "costs nothing; use it after every wiring change. A full run executes " +
    "the real workflows and spends real money, so run it to confirm the app " +
    "works, not to explore. Use `interact` to script the user actions to " +
    "simulate. A long run takes minutes; pass poll=true to get a session id " +
    "back immediately, then read GET /api/debug/sessions/<id> until it " +
    "settles.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      application_id: {
        type: "string" as const,
        description:
          "The ID of a saved application to debug. Give this or `document`, not both."
      },
      document: {
        type: "object" as const,
        description:
          "An application document to debug inline, for an app that is not " +
          "saved (or whose draft differs from the saved row). Give this or " +
          "`application_id`, not both."
      },
      params: {
        type: "object" as const,
        description: "Input values keyed by input name, seeded before the run"
      },
      interact: {
        type: "array" as const,
        items: { type: "object" as const },
        description:
          "User actions to simulate, in order. Each step is one of " +
          "{set: {key, value, operationId?}}, {click: <widget>}, " +
          "{change: {…}}, {run: <operationId>}, {cancel: <operationId>}, " +
          "{seedResource: {id, items}}. Widgets are named by component id, " +
          "by a type only one widget has, or by a unique label. Omit this " +
          "to click the app's natural run trigger."
      },
      run: {
        type: "boolean" as const,
        description:
          "Execute the app's operations (default true). false checks the " +
          "wiring only — free and instant."
      },
      timeout_ms: {
        type: "number" as const,
        description: "Wall clock for the whole debug run"
      },
      poll: {
        type: "boolean" as const,
        description:
          "Return a session id as soon as the run starts instead of waiting " +
          "for it (default false)"
      }
    },
    required: []
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiPost(context, "/api/applications/debug", params);
  }

  userMessage(params: Record<string, unknown>): string {
    const target = params["application_id"];
    const label =
      typeof target === "string" && target.trim() ? ` ${target}` : " draft";
    return params["run"] === false
      ? `Checking app${label} wiring`
      : `Debugging app${label}`;
  }
}

export class ValidateWorkflowTool extends Tool {
  readonly name = "validate_workflow";
  readonly description =
    "Statically validate a workflow against the node registry WITHOUT running " +
    "it: unknown node types, missing required properties, unselected models, " +
    "model properties naming an unregistered provider or a model id that " +
    "provider does not offer, and dangling or mis-typed edges. Pass an inline " +
    "`graph` to check a graph you are building, or `workflow_id` to validate " +
    "a saved one. Run this before saving or running to catch breakage in " +
    "milliseconds.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description:
          "The ID of a saved workflow to validate (fetched from the API)"
      },
      graph: {
        type: "object" as const,
        description:
          "Inline graph to validate ({ nodes, edges }). Takes precedence over workflow_id."
      }
    }
  };

  // When a registry is available the tool validates locally; without one it
  // falls back to fetching the workflow so the tool still returns something
  // useful in registry-free contexts (e.g. the multi-task planner).
  /**
   * The provider and model catalogs are supplied here rather than living on
   * NodeRegistry: the registry also runs in the browser, which has neither to
   * reach. Without them `validateGraph` skips the `unknown_provider` and
   * `unknown_model` checks entirely, so a model naming a provider the runtime
   * cannot construct — or an id that provider does not offer — passed silently
   * on the agent surface, which is exactly where hallucinated ids come from.
   * This tool always runs server-side, so the runtime's own catalogs are the
   * right default.
   */
  constructor(
    private readonly registry?: NodeRegistry,
    private readonly listProviderIds: () => readonly string[] = () =>
      listRegisteredProviderIds(),
    private readonly listModelIds: (
      provider: string,
      modelType: string
    ) => readonly string[] | undefined = listOfflineModelIds
  ) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    let graph = params["graph"] as
      | { nodes?: unknown[]; edges?: unknown[] }
      | undefined;
    const workflowId = params["workflow_id"] as string | undefined;

    if (!graph && workflowId) {
      const wf = (await apiGet(context, `/api/workflows/${workflowId}`)) as
        | Record<string, unknown>
        | undefined;
      if (wf && "error" in wf) return wf;
      graph = (wf?.["graph"] ?? wf) as typeof graph;
    }

    if (!graph || !Array.isArray(graph.nodes)) {
      return {
        error:
          "No graph to validate — pass an inline `graph` ({nodes, edges}) or a valid `workflow_id`."
      };
    }

    // `edges` reaches `.map()` inside validateGraph — a non-array would throw a
    // raw TypeError past the tool's structured error shape.
    if (graph.edges !== undefined && !Array.isArray(graph.edges)) {
      return {
        error:
          "`graph.edges` must be an array of edges ({source, sourceHandle, target, targetHandle})."
      };
    }

    if (!this.registry) {
      // Returning the graph with a note read as a pass to every caller that
      // checks for issues rather than for prose. A validator with no registry
      // cannot validate; say so as an error.
      return {
        error:
          "Cannot validate: no node registry is available in this process. Run `nodetool validate` from the CLI, or call this tool from a server-side context with a registry.",
        validated: false
      };
    }

    const registry = this.registry;
    return validateGraph(
      { nodes: graph.nodes as never[], edges: (graph.edges ?? []) as never[] },
      {
        has: (type) => registry.has(type),
        getMetadata: (type) => registry.getMetadata(type),
        validateNode: (descriptor, connectedHandles) =>
          registry.validateNode(descriptor, connectedHandles),
        listProviderIds: () => this.listProviderIds(),
        listModelIds: (provider, modelType) =>
          this.listModelIds(provider, modelType)
      }
    );
  }

  userMessage(params: Record<string, unknown>): string {
    return params["workflow_id"]
      ? `Validating workflow ${params["workflow_id"]}`
      : "Validating workflow graph";
  }
}

/** What a host must hand back for a saved timeline row. */
export interface TimelineToolRecord {
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
  fps?: number;
  width?: number;
  height?: number;
  name?: string;
}

/** Reads a `timeline_sequences` row for the caller. */
export type TimelineLoader = (
  context: ProcessingContext,
  id: string
) => Promise<TimelineToolRecord | null>;

/** A positive finite number from a tool param, or undefined. */
function numberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Unwrap a stored document that may still be JSON text. */
function parseStoredDocument(document: unknown): unknown {
  if (typeof document !== "string") return document;
  try {
    return JSON.parse(document);
  } catch {
    return undefined;
  }
}

/** One-line count of what a static validation found. */
function issueSummary(validation: {
  errors: unknown[];
  warnings: unknown[];
}): string {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  if (errors === 0 && warnings === 0) return "No issues found.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export class ValidateTimelineTool extends Tool {
  readonly name = "validate_timeline";
  readonly description =
    "Statically validate a timeline sequence WITHOUT rendering or playing it: " +
    "clips on tracks the document lacks, duplicate ids, overlapping clips, " +
    "fades and transitions longer than the clip, in/out points that cannot " +
    "render, unknown animation presets, incomplete bindings, and fields a " +
    "schema round trip would strip. Pass an inline `document` to check one you " +
    "are building, or `timeline_id` to validate a saved sequence. Run it after " +
    "timeline edits and before rendering.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      timeline_id: {
        type: "string" as const,
        description: "The ID of a saved timeline sequence to validate"
      },
      document: {
        type: "object" as const,
        description:
          "Inline TimelineDocument to validate ({ tracks, clips, markers }). " +
          "Takes precedence over timeline_id."
      },
      fps: {
        type: "number" as const,
        description:
          "Frame rate the inline document renders at (default 30). Timing " +
          "checks are frame-based, so a document authored at another fps " +
          "validates against the wrong grid without this. Ignored for timeline_id."
      },
      width: {
        type: "number" as const,
        description: "Render width of the inline document. Ignored for timeline_id."
      },
      height: {
        type: "number" as const,
        description: "Render height of the inline document. Ignored for timeline_id."
      }
    }
  };

  // The timeline API is tRPC-only, so there is no REST route to fall back on:
  // a host that wants the `timeline_id` path injects a loader. Without one the
  // tool still validates inline documents.
  constructor(private readonly loadTimeline?: TimelineLoader) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const inline = params["document"];
    const timelineId = params["timeline_id"] as string | undefined;

    let document = inline;
    // An inline document carries no stored render settings, so the caller
    // supplies them; the timeline_id path overwrites these from the row.
    let meta: { fps?: number; width?: number; height?: number } = {
      fps: numberParam(params["fps"]),
      width: numberParam(params["width"]),
      height: numberParam(params["height"])
    };
    let name: string | undefined;

    if (document === undefined && timelineId) {
      if (!this.loadTimeline) {
        return {
          error:
            "Cannot load a saved timeline in this process: no timeline loader is available. Pass the document inline as `document`, or call this tool from a server-side context.",
          validated: false
        };
      }
      const record = await this.loadTimeline(context, timelineId);
      if (!record) {
        return {
          error: `Timeline ${timelineId} was not found.`,
          validated: false
        };
      }
      document = parseStoredDocument(record.document);
      meta = { fps: record.fps, width: record.width, height: record.height };
      name = record.name;
    }

    if (document === undefined || document === null) {
      return {
        error:
          "No timeline to validate — pass an inline `document` ({tracks, clips, markers}) or a valid `timeline_id`."
      };
    }

    const validation = validateTimelineSequence(document, meta);
    return {
      ...validation,
      ...(timelineId ? { timeline_id: timelineId } : {}),
      ...(name ? { name } : {}),
      summary: issueSummary(validation)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return params["timeline_id"]
      ? `Validating timeline ${params["timeline_id"]}`
      : "Validating timeline document";
  }
}

export interface SketchToolRecord {
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
  width?: number;
  height?: number;
  backgroundColor?: string;
  name?: string;
}

/** Reads an `image_documents` row for the caller. */
export type SketchLoader = (
  context: ProcessingContext,
  id: string
) => Promise<SketchToolRecord | null>;

export class ValidateSketchTool extends Tool {
  readonly name = "validate_sketch";
  readonly description =
    "Statically validate a sketch (image document) WITHOUT rendering it: " +
    "duplicate layer ids, an active or mask layer the stack lacks, unknown " +
    "blend modes, opacities and transforms that cannot render, generation " +
    "bindings pointing at missing layers, unknown binding kinds and statuses, " +
    "canvas settings that disagree with the stored ones, and fields a schema " +
    "round trip would strip. Pass an inline `document` to check one you are " +
    "building, or `image_document_id` to validate a saved sketch. Run it after " +
    "sketch edits and before handing the document back.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      image_document_id: {
        type: "string" as const,
        description: "The ID of a saved sketch (image document) to validate"
      },
      document: {
        type: "object" as const,
        description:
          "Inline ImageDocumentData to validate ({ sketch, layerBindings }). " +
          "Takes precedence over image_document_id."
      },
      width: {
        type: "number" as const,
        description:
          "Canvas width the inline document is stored against. The canvas " +
          "size lives on the row, not in the document, so without it a " +
          "mismatch between the two cannot be reported. Ignored for " +
          "image_document_id."
      },
      height: {
        type: "number" as const,
        description:
          "Canvas height the inline document is stored against. Ignored for image_document_id."
      },
      background_color: {
        type: "string" as const,
        description:
          "Canvas background color the inline document is stored against. Ignored for image_document_id."
      }
    }
  };

  // The sketch API is tRPC-only, so there is no REST route to fall back on:
  // a host that wants the `image_document_id` path injects a loader. Without
  // one the tool still validates inline documents.
  constructor(private readonly loadSketch?: SketchLoader) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const inline = params["document"];
    const sketchId = params["image_document_id"] as string | undefined;

    let document = inline;
    // An inline document carries no stored canvas settings, so the caller
    // supplies them; the image_document_id path overwrites these from the row.
    let meta: {
      width?: number;
      height?: number;
      backgroundColor?: string;
    } = {
      width: numberParam(params["width"]),
      height: numberParam(params["height"]),
      backgroundColor:
        typeof params["background_color"] === "string"
          ? (params["background_color"] as string)
          : undefined
    };
    let name: string | undefined;

    if (document === undefined && sketchId) {
      if (!this.loadSketch) {
        return {
          error:
            "Cannot load a saved sketch in this process: no sketch loader is available. Pass the document inline as `document`, or call this tool from a server-side context.",
          validated: false
        };
      }
      const record = await this.loadSketch(context, sketchId);
      if (!record) {
        return {
          error: `Sketch ${sketchId} was not found.`,
          validated: false
        };
      }
      document = parseStoredDocument(record.document);
      meta = {
        width: record.width,
        height: record.height,
        backgroundColor: record.backgroundColor
      };
      name = record.name;
    }

    if (document === undefined || document === null) {
      return {
        error:
          "No sketch to validate — pass an inline `document` ({sketch, layerBindings}) or a valid `image_document_id`."
      };
    }

    const validation = validateSketchDocument(document, meta);
    return {
      ...validation,
      ...(sketchId ? { image_document_id: sketchId } : {}),
      ...(name ? { name } : {}),
      summary: issueSummary(validation)
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return params["image_document_id"]
      ? `Validating sketch ${params["image_document_id"]}`
      : "Validating sketch document";
  }
}

export interface PlanWorkflowGraphToolOptions {
  provider: BaseProvider;
  model: string;
  registry: NodeRegistry;
  /** Configured providers by id — enables the planner's `find_model` tool. */
  providers?: Record<string, BaseProvider>;
  /**
   * Forwards planner progress events (planning_update, tool_call_update,
   * chunk) to the client. Events arrive tagged with `parent_tool_call_id`
   * so the UI can nest them under this tool's call card.
   */
  forwardMessage?: (msg: ProcessingMessage) => Promise<void> | void;
  /**
   * Resolves the abort signal for the *current* chat turn. Read lazily on each
   * call: the tool outlives a single turn, and each turn installs a fresh
   * controller, so a captured signal would go stale after the first Stop.
   */
  signal?: () => AbortSignal | undefined;
}

export class PlanWorkflowGraphTool extends Tool {
  readonly name = "plan_workflow_graph";
  readonly needsToolCallId = true;
  readonly description =
    "Build a complete workflow graph ({nodes, edges}) from a natural-language " +
    "objective using the backend GraphPlanner: it searches the node registry, " +
    "inspects node metadata, and wires a validated DAG node-by-node. Returns " +
    "the graph without saving or running it — pass the result to " +
    "`create_workflow` to save, then `run_workflow` to execute.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      objective: {
        type: "string" as const,
        description:
          "Natural-language description of what the workflow should do."
      },
      inputs: {
        type: "object" as const,
        description:
          "Runtime parameters the workflow should accept, keyed by input " +
          "name with example values. Each becomes an input node in the graph."
      }
    },
    required: ["objective"]
  };

  constructor(private readonly opts: PlanWorkflowGraphToolOptions) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const objective =
      typeof params["objective"] === "string" ? params["objective"].trim() : "";
    if (!objective) {
      return {
        error: "`objective` is required and must be a non-empty string."
      };
    }
    const parentToolCallId =
      typeof params[TOOL_CALL_ID_FIELD] === "string"
        ? (params[TOOL_CALL_ID_FIELD] as string)
        : null;

    const signal = this.opts.signal?.();
    if (signal?.aborted) {
      return { error: "Graph planning was cancelled." };
    }

    const planner = new GraphPlanner({
      provider: this.opts.provider,
      model: this.opts.model,
      registry: this.opts.registry,
      tools: [],
      inputs: (params["inputs"] as Record<string, unknown>) ?? {},
      providers: this.opts.providers,
      signal
    });

    const gen = planner.plan(objective, context);
    let next = await gen.next();
    while (!next.done) {
      // The planner's own abort stops its LLM loop, but a tool call already
      // in flight still resolves — stop driving the generator so a Stop ends
      // the turn promptly instead of after the current round.
      if (signal?.aborted) {
        await gen.return(null);
        return { error: "Graph planning was cancelled." };
      }
      if (this.opts.forwardMessage) {
        const tagged = {
          ...(next.value as unknown as Record<string, unknown>),
          parent_tool_call_id: parentToolCallId
        } as unknown as ProcessingMessage;
        try {
          await this.opts.forwardMessage(tagged);
        } catch {
          // A broken forwarder must not kill planning — the model still gets
          // the graph via the tool return below.
        }
      }
      next = await gen.next();
    }

    if (signal?.aborted) {
      return { error: "Graph planning was cancelled." };
    }

    const graph = next.value;
    if (!graph) {
      return {
        error:
          "GraphPlanner failed to build a graph after multiple attempts. " +
          "Refine the objective (name concrete inputs/outputs) and retry."
      };
    }

    return {
      graph,
      node_count: graph.nodes.length,
      edge_count: graph.edges.length
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const objective =
      typeof params["objective"] === "string"
        ? params["objective"].slice(0, 80)
        : "workflow";
    return `Planning workflow graph: ${objective}`;
  }
}

export class GetExampleWorkflowTool extends Tool {
  readonly name = "get_example_workflow";
  readonly description =
    "Load a specific example workflow from a package by name.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      package_name: {
        type: "string" as const,
        description: "The name of the package containing the example"
      },
      example_name: {
        type: "string" as const,
        description: "The name of the example workflow to load"
      }
    },
    required: ["package_name", "example_name"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(
      context,
      `/api/workflows/examples/${params["package_name"]}/${params["example_name"]}`
    );
  }

  userMessage(params: Record<string, unknown>): string {
    return `Loading example ${params["package_name"]}/${params["example_name"]}`;
  }
}

export class ExportWorkflowDigraphTool extends Tool {
  readonly name = "export_workflow_digraph";
  readonly description =
    "Export a workflow as a Graphviz Digraph (DOT format) for visualization.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "The ID of the workflow to export"
      },
      descriptive_names: {
        type: "boolean" as const,
        description: "Use descriptive node names instead of UUIDs",
        default: true
      }
    },
    required: ["workflow_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(
      context,
      `/api/workflows/${params["workflow_id"]}/dsl-export`
    );
  }

  userMessage(params: Record<string, unknown>): string {
    return `Exporting workflow ${params["workflow_id"]} as digraph`;
  }
}

// ============================================================================
// Node Tools
// ============================================================================

export class ListNodesTool extends Tool {
  readonly name = "list_nodes";
  readonly description =
    "List available nodes from installed packages. Use this to discover nodes for building workflows.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      namespace: {
        type: "string" as const,
        description: "Optional namespace prefix filter (e.g. 'nodetool.text')"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of nodes to return",
        default: 200
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(context, "/api/nodes/metadata", {
      namespace: params["namespace"] as string | undefined,
      limit: Number(params["limit"] ?? 200)
    });
  }

  userMessage(params: Record<string, unknown>): string {
    const ns = params["namespace"];
    return ns ? `Listing nodes in namespace ${ns}` : "Listing available nodes";
  }
}

export class SearchNodesTool extends Tool {
  readonly name = "search_nodes";
  readonly description = "Search for nodes by name, description, or tags.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      query: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Search query strings"
      },
      n_results: {
        type: "number" as const,
        description: "Maximum number of results to return",
        default: 10
      },
      input_type: {
        type: "string" as const,
        description: "Optional filter by input type"
      },
      output_type: {
        type: "string" as const,
        description: "Optional filter by output type"
      }
    },
    required: ["query"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const queryArr = params["query"] as string[];
    return apiGet(context, "/api/nodes/metadata", {
      query: queryArr.join(","),
      limit: Number(params["n_results"] ?? 10)
    });
  }

  userMessage(params: Record<string, unknown>): string {
    const query = (params["query"] as string[]) ?? [];
    return `Searching for nodes: ${query.join(", ")}`;
  }
}

export class GetNodeInfoTool extends Tool {
  readonly name = "get_node_info";
  readonly description =
    "Get detailed metadata for a node type including its properties, inputs, and outputs.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      node_type: {
        type: "string" as const,
        description: "Fully-qualified node type (e.g. 'nodetool.text.Concat')"
      }
    },
    required: ["node_type"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(context, "/api/nodes/metadata", {
      node_type: params["node_type"] as string
    });
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting info for node type ${params["node_type"]}`;
  }
}

// ============================================================================
// Job Tools
// ============================================================================

export class ListJobsTool extends Tool {
  readonly name = "list_jobs";
  readonly description =
    "List jobs (workflow executions) with optional filtering.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "Optional workflow ID to filter by"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of jobs to return",
        default: 100
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(context, "/api/jobs/", {
      workflow_id: params["workflow_id"] as string | undefined,
      limit: Number(params["limit"] ?? 100)
    });
  }

  userMessage(params: Record<string, unknown>): string {
    const wfId = params["workflow_id"];
    return wfId ? `Listing jobs for workflow ${wfId}` : "Listing jobs";
  }
}

export class GetJobTool extends Tool {
  readonly name = "get_job";
  readonly description =
    "Get details about a specific job including status, timing, and error info.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string" as const,
        description: "The job ID"
      }
    },
    required: ["job_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(context, `/api/jobs/${params["job_id"]}`);
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting job ${params["job_id"]}`;
  }
}

export class GetJobLogsTool extends Tool {
  readonly name = "get_job_logs";
  readonly description = "Get logs for a job to debug workflow executions.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      job_id: {
        type: "string" as const,
        description: "The job ID"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of log entries to return",
        default: 200
      }
    },
    required: ["job_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(context, `/api/jobs/${params["job_id"]}`, {
      limit: Number(params["limit"] ?? 200)
    });
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting logs for job ${params["job_id"]}`;
  }
}

export class StartBackgroundJobTool extends Tool {
  readonly name = "start_background_job";
  readonly description =
    "Start a workflow running in the background and return a job ID for tracking.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "The workflow ID to run"
      },
      params: {
        type: "object" as const,
        description: "Optional input parameters"
      }
    },
    required: ["workflow_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiPost(context, `/api/workflows/${params["workflow_id"]}/run`, {
      params: params["params"] ?? {},
      background: true
    });
  }

  userMessage(params: Record<string, unknown>): string {
    return `Starting background job for workflow ${params["workflow_id"]}`;
  }
}

// ============================================================================
// Asset Tools
// ============================================================================

export class ListAssetsTool extends Tool {
  readonly name = "list_assets";
  readonly description =
    "List or search assets with flexible filtering options.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      source: {
        type: "string" as const,
        enum: ["user", "package"],
        default: "user"
      },
      query: {
        type: "string" as const,
        description: "Search query for asset names (min 2 chars)"
      },
      content_type: {
        type: "string" as const,
        description:
          "Filter by content type (image, video, audio, text, folder)"
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of assets to return",
        default: 100
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const source = String(params["source"] ?? "user");
    const query = params["query"] as string | undefined;

    if (source === "package") {
      return apiGet(context, "/api/assets/packages", {
        limit: Number(params["limit"] ?? 100)
      });
    }

    if (query) {
      return apiGet(context, "/api/assets/search", {
        query,
        content_type: params["content_type"] as string | undefined,
        limit: Number(params["limit"] ?? 100)
      });
    }

    return apiGet(context, "/api/assets/", {
      content_type: params["content_type"] as string | undefined,
      limit: Number(params["limit"] ?? 100)
    });
  }

  userMessage(params: Record<string, unknown>): string {
    const query = params["query"];
    return query ? `Searching assets for '${query}'` : "Listing assets";
  }
}

export class GetAssetTool extends Tool {
  readonly name = "get_asset";
  readonly description = "Get detailed information about a specific asset.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      asset_id: {
        type: "string" as const,
        description: "The ID of the asset"
      }
    },
    required: ["asset_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiGet(context, `/api/assets/${params["asset_id"]}`);
  }

  userMessage(params: Record<string, unknown>): string {
    return `Getting asset ${params["asset_id"]}`;
  }
}

// ============================================================================
// Helper
// ============================================================================

export interface GetAllMcpToolsOptions {
  /**
   * In-process NodeRegistry. When supplied, the REST-based
   * ListNodesTool / SearchNodesTool / GetNodeInfoTool are replaced with the
   * local biased counterparts so any agent reaching for `search_nodes`
   * gets the same namespace-aware ranking as the GraphPlanner.
   */
  registry?: NodeRegistry;
  /**
   * Configured BaseProvider instances by id. When supplied, the agent gets:
   * - `find_model` — pick a `{provider, model_id}` for any capability.
   * - `list_models` — browse everything the configured providers offer.
   * - `generate_image` / `edit_image` / `generate_video` / `animate_image` /
   *   `generate_speech` / `transcribe_audio` / `embed_text` — direct
   *   provider-backed media generation tools usable from any agent loop.
   *
   * Independent of `registry`: the multi-task planner doesn't need a
   * registry but still benefits from these tools.
   */
  providers?: Record<string, BaseProvider>;
}

export function getAllMcpTools(options: GetAllMcpToolsOptions = {}): Tool[] {
  const tools: Tool[] = [
    new ListWorkflowsTool(),
    new GetWorkflowTool(),
    new CreateWorkflowTool(),
    new RunWorkflowTool(),
    new DebugWorkflowTool(),
    new ResolveWorkflowEscalationTool(),
    new BuildAppTool(),
    new DebugAppTool(),
    new ValidateWorkflowTool(options.registry),
    new GetExampleWorkflowTool(),
    new ExportWorkflowDigraphTool(),
    new ListJobsTool(),
    new GetJobTool(),
    new GetJobLogsTool(),
    new StartBackgroundJobTool(),
    new ListAssetsTool(),
    new GetAssetTool(),
    // Asset persistence — used by the agent to surface artifacts (text
    // reports, images, audio) into the chat. Media-generation tools save
    // their outputs as assets automatically; use save_asset for anything
    // else worth keeping.
    new SaveAssetTool(),
    new ReadAssetTool()
  ];

  if (options.registry) {
    tools.push(
      new LocalListNodesTool(options.registry),
      new LocalSearchNodesTool(options.registry),
      new LocalGetNodeInfoTool(options.registry)
    );
  } else {
    tools.push(
      new ListNodesTool(),
      new SearchNodesTool(),
      new GetNodeInfoTool()
    );
  }
  tools.push(...createWorkflowDocumentTools(options.registry));

  if (options.providers && Object.keys(options.providers).length > 0) {
    tools.push(
      new FindModelTool(options.providers),
      new ListModelsTool(options.providers),
      new GenerateImageTool(),
      new EditImageTool(),
      new GenerateVideoTool(),
      new AnimateImageTool(),
      new GenerateSpeechTool(),
      new TranscribeAudioTool(),
      new EmbedTextTool()
    );
  }

  return tools;
}
