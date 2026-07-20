/**
 * MCP Tool wrappers for the Agent system.
 *
 * These tools give the agent "omnipotent" control over nodetool:
 * workflows, nodes, jobs, assets, and models via REST API calls.
 *
 * Port of src/nodetool/agents/tools/mcp_tools.py
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { validateGraph } from "@nodetool-ai/node-sdk";
import { Tool } from "./base-tool.js";
import { LocalListNodesTool } from "./local-list-nodes-tool.js";
import { LocalSearchNodesTool } from "./local-search-nodes-tool.js";
import { LocalGetNodeInfoTool } from "./local-get-node-info-tool.js";
import { FindModelTool } from "./find-model-tool.js";
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
    const { node_type, parameters, ...rest } = node;
    const properties = node["properties"] ?? parameters;
    return {
      ...rest,
      id: node["id"] ?? fallbackId,
      type: node["type"] ?? node_type,
      ...(properties === undefined ? {} : { properties })
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

  return { ...record, nodes, edges };
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
    return lightWorkflowList(await apiGet(context, "/api/workflows/", { limit }));
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

export class CreateWorkflowTool extends Tool {
  readonly name = "create_workflow";
  readonly description =
    "Create a new workflow with a name, graph structure, and optional metadata.";
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

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiPost(context, "/api/workflows", {
      name: params["name"],
      graph: normalizeWorkflowGraph(params["graph"]),
      description: params["description"],
      tags: params["tags"],
      access: params["access"] ?? "private"
    });
  }

  userMessage(params: Record<string, unknown>): string {
    return `Creating workflow '${params["name"]}'`;
  }
}

export class RunWorkflowTool extends Tool {
  readonly name = "run_workflow";
  readonly description =
    "Execute a workflow with given parameters and return results.";
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
      }
    },
    required: ["workflow_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return apiPost(context, `/api/workflows/${params["workflow_id"]}/run`, {
      params: params["params"] ?? {}
    });
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
  const nodes = Array.isArray(graph.nodes) ? (graph.nodes as Array<Record<string, unknown>>) : [];
  const edges = Array.isArray(graph.edges) ? (graph.edges as Array<Record<string, unknown>>) : [];
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
    "Run a workflow end-to-end and return a consolidated debug report: final " +
    "status, outputs, error, job logs, and the workflow graph overview. Use this " +
    "to troubleshoot a failing or misbehaving workflow and iterate on a fix.";
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
      include_graph: {
        type: "boolean" as const,
        description: "Include the workflow graph overview in the report (default true)"
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

    const run = await apiPost(context, `/api/workflows/${workflowId}/run`, {
      params: params["params"] ?? {}
    });

    const report: Record<string, unknown> = { workflow_id: workflowId, run };

    const jobId = (run as Record<string, unknown>)?.["job_id"];
    if (typeof jobId === "string") {
      report["job"] = await apiGet(context, `/api/jobs/${jobId}`, { limit: logLimit });
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

export class ValidateWorkflowTool extends Tool {
  readonly name = "validate_workflow";
  readonly description =
    "Statically validate a workflow against the node registry WITHOUT running " +
    "it: unknown node types, missing required properties, unselected models, " +
    "and dangling or mis-typed edges. Pass an inline `graph` to check a graph " +
    "you are building, or `workflow_id` to validate a saved one. Run this " +
    "before saving or running to catch breakage in milliseconds.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "The ID of a saved workflow to validate (fetched from the API)"
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
  constructor(private readonly registry?: NodeRegistry) {
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

    if (!this.registry) {
      return {
        note: "No in-process node registry available; returning the graph unvalidated. Run `nodetool validate` from the CLI for a full static check.",
        graph
      };
    }

    return validateGraph(
      { nodes: graph.nodes as never[], edges: (graph.edges ?? []) as never[] },
      this.registry
    );
  }

  userMessage(params: Record<string, unknown>): string {
    return params["workflow_id"]
      ? `Validating workflow ${params["workflow_id"]}`
      : "Validating workflow graph";
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
// Model Tools
// ============================================================================

export class ListModelsTool extends Tool {
  readonly name = "list_models";
  readonly description =
    "List available AI models with flexible filtering options.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      provider: {
        type: "string" as const,
        description:
          "Filter by provider (all, openai, anthropic, ollama, etc.)",
        default: "all"
      },
      model_type: {
        type: "string" as const,
        description: "Filter by model type (e.g. language, image)"
      },
      downloaded_only: {
        type: "boolean" as const,
        description: "Only show downloaded models",
        default: false
      },
      limit: {
        type: "number" as const,
        description: "Maximum number of models to return",
        default: 50
      }
    },
    required: [] as string[]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const provider = String(params["provider"] ?? "all");
    return apiGet(context, "/api/models/all", {
      provider: provider !== "all" ? provider : undefined,
      model_type: params["model_type"] as string | undefined
    });
  }

  userMessage(params: Record<string, unknown>): string {
    const provider = params["provider"] ?? "all";
    return `Listing models from ${provider}`;
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
    new ValidateWorkflowTool(options.registry),
    new GetExampleWorkflowTool(),
    new ExportWorkflowDigraphTool(),
    new ListJobsTool(),
    new GetJobTool(),
    new GetJobLogsTool(),
    new StartBackgroundJobTool(),
    new ListAssetsTool(),
    new GetAssetTool(),
    new ListModelsTool(),
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

  if (options.providers && Object.keys(options.providers).length > 0) {
    tools.push(
      new FindModelTool(options.providers),
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
