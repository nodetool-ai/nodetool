/**
 * The `workflows` capability module — the pilot namespace.
 *
 * Ten capabilities that used to be ten `Tool` subclasses in
 * `../tools/mcp-tools.ts`: the nine the guest reaches as `nodetool.workflows.*`
 * (`NODETOOL_API_NAMESPACE_TOOLS.workflows`) plus `export_workflow_digraph`,
 * which the design's mapping table folds in here rather than leaving it beside
 * the file tools.
 *
 * Wire names, descriptions and schemas are unchanged: `getAllMcpTools` builds
 * these through `toolFromCapability`, so every consumer — runner, MCP, CLI,
 * evals — sees the surface it saw before.
 *
 * What was a constructor argument is now a field on the run: the example
 * catalog, the node registry, the run environment, the DSL exporter, and the
 * model catalogs. Every heavy dependency (`@nodetool-ai/models`, the execution
 * service, the graph validators, the DSL sandbox) is imported inside the
 * implementation that needs it, so loading this module costs nothing.
 *
 * Design: docs/tool-class-retirement-design.md § "Worked example:
 * `nodetool.workflows`".
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type { Workflow as WorkflowRow } from "@nodetool-ai/models";
import {
  NO_EXAMPLES,
  RUNTIME_MODEL_CATALOGS,
  annotateEscalatedRun,
  jobRecord,
  lightWorkflowList,
  modelSelectionError,
  noRegistryError,
  normalizeWorkflowGraph,
  outcomeResult,
  resolveRunEnvironment,
  summarizeWorkflowGraph,
  userIdOf,
  workflowRecord
} from "../tools/mcp-tool-support.js";
import type { CapabilityExport, CapabilityModule, CapabilityRun } from "./types.js";

/** The run environment this run can execute a workflow in, or null. */
function runEnvironmentOf(run: CapabilityRun) {
  return resolveRunEnvironment(run.workflowEnvironment, run.nodeRegistry);
}

// ---------------------------------------------------------------------------
// list_workflows
// ---------------------------------------------------------------------------

const LIST_WORKFLOWS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_type: {
      type: "string",
      description: "Type of workflows to list",
      enum: ["user", "example", "all"],
      default: "user"
    },
    query: {
      type: "string",
      description: "Optional search query to filter workflows"
    },
    limit: {
      type: "number",
      description: "Maximum number of workflows to return",
      default: 100
    }
  },
  required: [] as string[]
};

async function listUserWorkflows(
  run: CapabilityRun,
  limit: number
): Promise<unknown> {
  const { Workflow } = await import("@nodetool-ai/models");
  const [workflows, next] = await Workflow.paginate(userIdOf(run.context), {
    limit
  });
  return lightWorkflowList({
    workflows: workflows.map((w) => workflowRecord(w)),
    next: next || null
  });
}

async function listExampleWorkflows(
  run: CapabilityRun,
  query: string | undefined,
  limit: number
): Promise<unknown> {
  if (!run.examples) return NO_EXAMPLES;
  return lightWorkflowList({
    workflows: await run.examples.list({
      ...(query ? { query } : {}),
      limit
    }),
    next: null
  });
}

const listWorkflows: CapabilityExport = {
  spec: {
    name: "list_workflows",
    description:
      "List workflows (id, name, description, tags only — no graph). Returns user workflows, example workflows, or both. Use get_workflow for the full graph of a specific workflow.",
    inputSchema: LIST_WORKFLOWS_SCHEMA,
    category: "read",
    userMessage: (params) => {
      const wt = params["workflow_type"] ?? "user";
      const q = params["query"];
      if (q) return `Listing ${wt} workflows matching '${q}'`;
      return `Listing ${wt} workflows`;
    }
  },
  impl: async (run, params) => {
    const workflowType = String(params["workflow_type"] ?? "user");
    const query = params["query"] as string | undefined;
    const limit = Number(params["limit"] ?? 100);

    if (workflowType === "example") {
      return listExampleWorkflows(run, query, limit);
    }
    if (workflowType === "all") {
      return {
        examples: await listExampleWorkflows(run, query, limit),
        user: await listUserWorkflows(run, limit)
      };
    }
    return listUserWorkflows(run, limit);
  }
};

// ---------------------------------------------------------------------------
// get_workflow
// ---------------------------------------------------------------------------

const getWorkflow: CapabilityExport = {
  spec: {
    name: "get_workflow",
    description:
      "Get detailed information about a specific workflow including its graph structure.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "The ID of the workflow"
        }
      },
      required: ["workflow_id"]
    },
    category: "read",
    userMessage: (params) => `Getting workflow ${params["workflow_id"]}`
  },
  impl: async (run, params) => {
    const { Workflow } = await import("@nodetool-ai/models");
    const workflowId = String(params["workflow_id"]);
    const workflow = await Workflow.find(userIdOf(run.context), workflowId);
    if (!workflow) return { error: `Workflow ${workflowId} was not found.` };
    return workflowRecord(workflow);
  }
};

// ---------------------------------------------------------------------------
// create_workflow
// ---------------------------------------------------------------------------

const CREATE_WORKFLOW_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "The workflow name" },
    graph: {
      type: "object",
      description:
        "Workflow graph with nodes and edges. Nodes may be an array of {id, type, properties} or an object keyed by node id with {node_type, parameters}. Edges use source, target, targetHandle/target_input, and optional sourceHandle/source_output (defaults to output)."
    },
    description: {
      type: "string",
      description: "Optional workflow description"
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Optional workflow tags"
    },
    access: {
      type: "string",
      enum: ["private", "public"],
      default: "private"
    }
  },
  required: ["name", "graph"]
};

const createWorkflow: CapabilityExport = {
  spec: {
    name: "create_workflow",
    description:
      "Create a new workflow with a name, graph structure, and optional " +
      "metadata. Model properties are checked before the workflow is created: " +
      "an unregistered provider or a model id the provider does not offer is " +
      "returned as an error instead of being saved.",
    inputSchema: CREATE_WORKFLOW_SCHEMA,
    category: "write",
    userMessage: (params) => `Creating workflow '${params["name"]}'`
  },
  impl: async (run, params) => {
    const { Workflow } = await import("@nodetool-ai/models");
    const graph = normalizeWorkflowGraph(params["graph"]);
    const badModels = await modelSelectionError(
      graph,
      run.modelCatalogs ?? RUNTIME_MODEL_CATALOGS
    );
    if (badModels) return badModels;

    const created = (await Workflow.create({
      user_id: userIdOf(run.context),
      name: String(params["name"]),
      description:
        typeof params["description"] === "string" ? params["description"] : "",
      tags: Array.isArray(params["tags"]) ? (params["tags"] as string[]) : [],
      access: params["access"] === "public" ? "public" : "private",
      graph: graph as WorkflowRow["graph"],
      run_mode: "workflow"
    })) as WorkflowRow;
    return workflowRecord(created);
  }
};

// ---------------------------------------------------------------------------
// run_workflow
// ---------------------------------------------------------------------------

const RUN_WORKFLOW_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow to run"
    },
    params: {
      type: "object",
      description: "Dictionary of input parameters for the workflow"
    },
    interactive: {
      type: "boolean",
      description:
        "Bubble node failures up as escalations you answer, instead of " +
        "failing the run (default false)"
    }
  },
  required: ["workflow_id"]
};

const runWorkflowCapability: CapabilityExport = {
  spec: {
    name: "run_workflow",
    description:
      "Execute a workflow with given parameters and return results. With " +
      "interactive=true a failing node invocation pauses the run and returns " +
      'an escalation (status "escalated") for you to answer via ' +
      "resolve_workflow_escalation — retry, substitute, skip, or fail — " +
      "instead of the whole run failing outright.",
    inputSchema: RUN_WORKFLOW_SCHEMA,
    category: "execute",
    userMessage: (params) => `Running workflow ${params["workflow_id"]}`
  },
  impl: async (run, params) => {
    const env = await runEnvironmentOf(run);
    if (!env) return noRegistryError("run a workflow");
    const { runWorkflow } = await import("@nodetool-ai/execution/service");
    const outcome = await runWorkflow({
      workflowId: String(params["workflow_id"]),
      userId: userIdOf(run.context),
      environment: env,
      params: (params["params"] as Record<string, unknown>) ?? {},
      interactive: params["interactive"] === true
    });
    return annotateEscalatedRun(outcomeResult(outcome));
  }
};

// ---------------------------------------------------------------------------
// debug_workflow
// ---------------------------------------------------------------------------

const DEBUG_WORKFLOW_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow to run and debug"
    },
    params: {
      type: "object",
      description: "Input parameters keyed by input-node name"
    },
    interactive: {
      type: "boolean",
      description:
        "Bubble node failures up as escalations you answer mid-run, " +
        "instead of only reading them post-mortem (default false)"
    },
    include_graph: {
      type: "boolean",
      description:
        "Include the workflow graph overview in the report (default true)"
    },
    log_limit: {
      type: "number",
      description: "Maximum job log entries to include (default 200)"
    }
  },
  required: ["workflow_id"]
};

const debugWorkflow: CapabilityExport = {
  spec: {
    name: "debug_workflow",
    description:
      "Run a workflow end-to-end and return a consolidated debug report: a " +
      "pass/fail verdict with the issues behind it, per-node status and errors, " +
      "logs, LLM calls, outputs, job record, and the workflow graph overview. " +
      "Use this to troubleshoot a failing or misbehaving workflow and iterate. " +
      "With interactive=true a failing node invocation pauses the run and " +
      'returns an escalation (status "escalated") for you to answer via ' +
      "resolve_workflow_escalation before the report is produced.",
    inputSchema: DEBUG_WORKFLOW_SCHEMA,
    category: "execute",
    userMessage: (params) => `Debugging workflow ${params["workflow_id"]}`
  },
  impl: async (run, params) => {
    const env = await runEnvironmentOf(run);
    if (!env) return noRegistryError("debug a workflow");
    const { Job, Workflow } = await import("@nodetool-ai/models");
    const { runWorkflow } = await import("@nodetool-ai/execution/service");
    const workflowId = String(params["workflow_id"]);
    const userId = userIdOf(run.context);
    const includeGraph = params["include_graph"] !== false;

    const outcome = await runWorkflow({
      workflowId,
      userId,
      debug: true,
      environment: env,
      params: (params["params"] as Record<string, unknown>) ?? {},
      interactive: params["interactive"] === true
    });
    const result = outcomeResult(outcome);

    // An escalated run has produced no report yet — the job is parked on the
    // failing node. Hand the escalation back for a verdict; the final report
    // arrives from resolve_workflow_escalation once the run settles.
    if (
      result &&
      typeof result === "object" &&
      (result as Record<string, unknown>)["status"] === "escalated"
    ) {
      return { workflow_id: workflowId, run: annotateEscalatedRun(result) };
    }

    const report: Record<string, unknown> = {
      workflow_id: workflowId,
      run: result
    };

    const jobId = (result as Record<string, unknown>)?.["job_id"];
    if (typeof jobId === "string") {
      const job = await Job.find(userId, jobId);
      if (job) {
        const logLimit = Number(params["log_limit"] ?? 200);
        const logs = job.logs ?? [];
        report["job"] = {
          ...jobRecord(job),
          logs: logs.slice(Math.max(0, logs.length - logLimit))
        };
      }
    }
    if (includeGraph) {
      const workflow = await Workflow.find(userId, workflowId);
      if (workflow) {
        report["workflow"] = summarizeWorkflowGraph(workflowRecord(workflow));
      }
    }
    return report;
  }
};

// ---------------------------------------------------------------------------
// resolve_workflow_escalation
// ---------------------------------------------------------------------------

const RESOLVE_ESCALATION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    session_id: {
      type: "string",
      description: "The debug session id from the escalated response"
    },
    escalation_id: {
      type: "string",
      description: "The escalation id being answered"
    },
    action: {
      type: "string",
      enum: ["retry", "substitute", "skip", "end_stream", "fail"],
      description: "The verdict — must be one of the escalation's allowedActions"
    },
    outputs: {
      type: "object",
      description:
        "For substitute: repaired output values keyed by the node's " +
        "declared output slots"
    },
    reason: {
      type: "string",
      description:
        "For fail: a one-sentence reason surfaced as the run's error summary"
    },
    apply_to: {
      type: "string",
      enum: ["invocation", "signature"],
      description:
        'For skip/fail: "signature" also resolves later failures with the ' +
        "same failureSignature without asking again (default \"invocation\")"
    }
  },
  required: ["session_id", "escalation_id", "action"]
};

const resolveWorkflowEscalation: CapabilityExport = {
  spec: {
    name: "resolve_workflow_escalation",
    description:
      "Answer an escalation raised by an interactive run_workflow/debug_workflow " +
      "run. The run is parked on the failing node until you decide: retry the " +
      "invocation, substitute repaired outputs (only when the escalation carries " +
      "a candidateOutput), skip the invocation, end the stream (streaming nodes), " +
      "or fail the node. Only the escalation's allowedActions are accepted; the " +
      "kernel enforces the same set. Returns the next escalation (answer it the " +
      "same way) or the run's final report.",
    inputSchema: RESOLVE_ESCALATION_SCHEMA,
    // Unlisted in `TOOL_PERMISSION_CATEGORIES`, so the gate classes it
    // `external` today. Carried over unchanged: a reclassification belongs in
    // its own diff, not in a port.
    category: "external",
    userMessage: (params) =>
      `Resolving workflow escalation with "${params["action"]}"`
  },
  impl: async (run, params) => {
    const { submitEscalationVerdict } = await import(
      "@nodetool-ai/execution/service"
    );
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
    const outcome = await submitEscalationVerdict(
      String(params["session_id"]),
      userIdOf(run.context),
      String(params["escalation_id"]),
      verdict as Parameters<typeof submitEscalationVerdict>[3]
    );
    return annotateEscalatedRun(outcomeResult(outcome));
  }
};

// ---------------------------------------------------------------------------
// validate_workflow
// ---------------------------------------------------------------------------

const VALIDATE_WORKFLOW_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description:
        "The ID of a saved workflow to validate (fetched from the API)"
    },
    graph: {
      type: "object",
      description:
        "Inline graph to validate ({ nodes, edges }). Takes precedence over workflow_id."
    },
    code: {
      type: "string",
      description:
        "A graph program in the same DSL submit_graph takes — node(type, " +
        "properties) and ref.output(slot?), ending with `return graph();`. " +
        "Evaluated in the sandbox, then validated. Takes precedence over `graph`."
    }
  }
};

const validateWorkflow: CapabilityExport = {
  spec: {
    name: "validate_workflow",
    description:
      "Statically validate a workflow against the node registry WITHOUT running " +
      "it: unknown node types, missing required properties, unselected models, " +
      "model properties naming an unregistered provider or a model id that " +
      "provider does not offer, and dangling or mis-typed edges. Pass `code` to " +
      "check the same graph program you would hand to submit_graph, an inline " +
      "`graph` to check a graph you are building, or `workflow_id` to validate " +
      "a saved one. Run this before saving or running to catch breakage in " +
      "milliseconds.",
    inputSchema: VALIDATE_WORKFLOW_SCHEMA,
    category: "read",
    userMessage: (params) => {
      if (params["code"]) return "Validating graph program";
      return params["workflow_id"]
        ? `Validating workflow ${params["workflow_id"]}`
        : "Validating workflow graph";
    }
  },
  impl: async (run, params) => {
    let graph = params["graph"] as
      | { nodes?: unknown[]; edges?: unknown[] }
      | undefined;
    const workflowId = params["workflow_id"] as string | undefined;
    const code = typeof params["code"] === "string" ? params["code"] : "";

    // A graph program is what the planner actually authors, so let it be
    // checked in the form it will be submitted in rather than hand-translated
    // to JSON first. Same evaluation submit_graph uses.
    if (code.trim()) {
      const { evaluateGraphDsl } = await import("../graph-dsl.js");
      const evaluated = await evaluateGraphDsl(code);
      if (!evaluated.graph) {
        return {
          status: "code_error",
          error: evaluated.error ?? "Program produced no graph.",
          ...(evaluated.logs?.length ? { logs: evaluated.logs } : {})
        };
      }
      graph = evaluated.graph;
    }

    if (!graph && workflowId) {
      const { Workflow } = await import("@nodetool-ai/models");
      const workflow = await Workflow.find(userIdOf(run.context), workflowId);
      if (!workflow) return { error: `Workflow ${workflowId} was not found.` };
      graph = workflow.getGraph() as unknown as typeof graph;
    }

    if (!graph || !Array.isArray(graph.nodes)) {
      return {
        error:
          "No graph to validate — pass a graph program as `code`, an inline `graph` ({nodes, edges}), or a valid `workflow_id`."
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

    const registry = run.nodeRegistry;
    if (!registry) {
      // Returning the graph with a note read as a pass to every caller that
      // checks for issues rather than for prose. A validator with no registry
      // cannot validate; say so as an error.
      return {
        error:
          "Cannot validate: no node registry is available in this process. Run `nodetool validate` from the CLI, or call this tool from a server-side context with a registry.",
        validated: false
      };
    }

    // The provider and model catalogs are supplied by the run rather than
    // living on NodeRegistry: the registry also runs in the browser, which has
    // neither to reach. Without them `validateGraph` skips the
    // `unknown_provider` and `unknown_model` checks entirely, so a model
    // naming a provider the runtime cannot construct — or an id that provider
    // does not offer — would pass silently on the agent surface, which is
    // exactly where hallucinated ids come from. This capability always runs
    // server-side, so the runtime's own catalogs are the right default.
    const catalogs = run.modelCatalogs ?? RUNTIME_MODEL_CATALOGS;
    const { validateGraph } = await import("@nodetool-ai/node-sdk");
    return validateGraph(
      { nodes: graph.nodes as never[], edges: (graph.edges ?? []) as never[] },
      {
        has: (type) => registry.has(type),
        getMetadata: (type) => registry.getMetadata(type),
        validateNode: (descriptor, connectedHandles) =>
          registry.validateNode(descriptor, connectedHandles),
        listProviderIds: () => catalogs.listProviderIds(),
        listModelIds: (provider, modelType) =>
          catalogs.listModelIds(provider, modelType)
      }
    );
  }
};

// ---------------------------------------------------------------------------
// start_background_job
// ---------------------------------------------------------------------------

const startBackgroundJob: CapabilityExport = {
  spec: {
    name: "start_background_job",
    description:
      "Start a workflow running in the background and return a job ID for tracking.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "The workflow ID to run"
        },
        params: {
          type: "object",
          description: "Optional input parameters"
        }
      },
      required: ["workflow_id"]
    },
    category: "execute",
    userMessage: (params) =>
      `Starting background job for workflow ${params["workflow_id"]}`
  },
  impl: async (run, params) => {
    const env = await runEnvironmentOf(run);
    if (!env) return noRegistryError("start a background job");
    const { runWorkflow } = await import("@nodetool-ai/execution/service");
    const outcome = await runWorkflow({
      workflowId: String(params["workflow_id"]),
      userId: userIdOf(run.context),
      environment: env,
      params: (params["params"] as Record<string, unknown>) ?? {},
      background: true
    });
    return outcomeResult(outcome);
  }
};

// ---------------------------------------------------------------------------
// get_example_workflow
// ---------------------------------------------------------------------------

const getExampleWorkflow: CapabilityExport = {
  spec: {
    name: "get_example_workflow",
    description: "Load a specific example workflow from a package by name.",
    inputSchema: {
      type: "object",
      properties: {
        package_name: {
          type: "string",
          description: "The name of the package containing the example"
        },
        example_name: {
          type: "string",
          description: "The name of the example workflow to load"
        }
      },
      required: ["package_name", "example_name"]
    },
    category: "read",
    userMessage: (params) =>
      `Loading example ${params["package_name"]}/${params["example_name"]}`
  },
  impl: async (run, params) => {
    if (!run.examples) return NO_EXAMPLES;
    const packageName = String(params["package_name"]);
    const exampleName = String(params["example_name"]);
    const example = await run.examples.get(packageName, exampleName);
    return (
      example ?? {
        error: `No example named "${exampleName}" in package "${packageName}".`
      }
    );
  }
};

// ---------------------------------------------------------------------------
// export_workflow_digraph
// ---------------------------------------------------------------------------

const exportWorkflowDigraph: CapabilityExport = {
  spec: {
    name: "export_workflow_digraph",
    description:
      "Export a workflow as a Graphviz Digraph (DOT format) for visualization.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: {
          type: "string",
          description: "The ID of the workflow to export"
        },
        descriptive_names: {
          type: "boolean",
          description: "Use descriptive node names instead of UUIDs",
          default: true
        }
      },
      required: ["workflow_id"]
    },
    category: "read",
    userMessage: (params) =>
      `Exporting workflow ${params["workflow_id"]} as digraph`
  },
  // `workflowToDsl` lives in `@nodetool-ai/dsl`, which sits above this package
  // in the dependency order, so the exporter rides on the run rather than
  // being imported.
  impl: async (run, params) => {
    const exportDsl = run.exportDsl;
    if (!exportDsl) {
      return {
        error:
          "Cannot export: no DSL exporter is available in this process. Run " +
          "`nodetool workflows export-dsl` from the CLI instead."
      };
    }
    const { Workflow } = await import("@nodetool-ai/models");
    const workflowId = String(params["workflow_id"]);
    const workflow = await Workflow.find(userIdOf(run.context), workflowId);
    if (!workflow) return { error: `Workflow ${workflowId} was not found.` };
    if (!workflow.graph) return { error: "Workflow has no graph to export." };
    try {
      return {
        workflow_id: workflowId,
        source: exportDsl(workflow.graph, { workflowName: workflow.name })
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
};

/** Every workflow capability, in the order `getAllMcpTools` offered them. */
export const WORKFLOW_CAPABILITIES: readonly CapabilityExport[] = [
  listWorkflows,
  getWorkflow,
  createWorkflow,
  runWorkflowCapability,
  debugWorkflow,
  resolveWorkflowEscalation,
  validateWorkflow,
  getExampleWorkflow,
  exportWorkflowDigraph,
  startBackgroundJob
];

export const module: CapabilityModule = {
  module: "workflows",
  exports: WORKFLOW_CAPABILITIES
};

export {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  runWorkflowCapability,
  debugWorkflow,
  resolveWorkflowEscalation,
  validateWorkflow,
  getExampleWorkflow,
  exportWorkflowDigraph,
  startBackgroundJob
};
