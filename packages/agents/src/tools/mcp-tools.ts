/**
 * MCP Tool wrappers for the Agent system.
 *
 * These tools give the agent "omnipotent" control over nodetool:
 * workflows, nodes, jobs, assets, and models via REST API calls.
 *
 * Port of src/nodetool/agents/tools/mcp_tools.py
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "./base-tool.js";

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
  return headers;
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

export class ListWorkflowsTool extends Tool {
  readonly name = "list_workflows";
  readonly description =
    "List workflows with flexible filtering and search options. Returns user workflows, example workflows, or both.";
  readonly inputSchema = {
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
      const examples = await apiGet(context, "/api/workflows/examples", {
        limit,
        query
      });
      if (workflowType === "example") return examples;
      const user = await apiGet(context, "/api/workflows/", { limit });
      return { examples, user };
    }
    return apiGet(context, "/api/workflows/", { limit });
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
  readonly inputSchema = {
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
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      name: { type: "string" as const, description: "The workflow name" },
      graph: {
        type: "object" as const,
        description: "Workflow graph structure with nodes and edges"
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
    return apiPost(context, "/api/workflows/", {
      name: params["name"],
      graph: params["graph"],
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
  readonly inputSchema = {
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

export class ValidateWorkflowTool extends Tool {
  readonly name = "validate_workflow";
  readonly description =
    "Validate a workflow's structure, connectivity, and type compatibility.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      workflow_id: {
        type: "string" as const,
        description: "The ID of the workflow to validate"
      }
    },
    required: ["workflow_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    // Validate by fetching the workflow and checking its structure
    return apiGet(context, `/api/workflows/${params["workflow_id"]}`);
  }

  userMessage(params: Record<string, unknown>): string {
    return `Validating workflow ${params["workflow_id"]}`;
  }
}

export class GetExampleWorkflowTool extends Tool {
  readonly name = "get_example_workflow";
  readonly description =
    "Load a specific example workflow from a package by name.";
  readonly inputSchema = {
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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
      namespace: params["namespace"] as string | undefined
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
  readonly inputSchema = {
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
      query: queryArr.join(",")
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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
  readonly inputSchema = {
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

export function getAllMcpTools(): Tool[] {
  return [
    new ListWorkflowsTool(),
    new GetWorkflowTool(),
    new CreateWorkflowTool(),
    new RunWorkflowTool(),
    new ValidateWorkflowTool(),
    new GetExampleWorkflowTool(),
    new ExportWorkflowDigraphTool(),
    new ListNodesTool(),
    new SearchNodesTool(),
    new GetNodeInfoTool(),
    new ListJobsTool(),
    new GetJobTool(),
    new GetJobLogsTool(),
    new StartBackgroundJobTool(),
    new ListAssetsTool(),
    new GetAssetTool(),
    new ListModelsTool()
  ];
}
