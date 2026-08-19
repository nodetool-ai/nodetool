/**
 * The `workflows` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `workflows.ts`, so nothing the
 * implementations pull in reaches the entry graph. `workflows.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const LIST_WORKFLOWS_SCHEMA: JsonSchema = {
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
  required: []
};

export const CREATE_WORKFLOW_SCHEMA: JsonSchema = {
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

export const UPDATE_WORKFLOW_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow to update. You must own it."
    },
    graph: {
      type: "object",
      description:
        "The replacement graph, in the same shape create_workflow takes. Omit to leave the stored graph alone."
    },
    name: { type: "string", description: "New workflow name" },
    description: { type: "string", description: "New description" },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Replacement tag list"
    },
    expected_updated_at: {
      type: "string",
      description:
        "The updated_at you last read. The write is refused when the workflow changed since then. Omit to overwrite whatever is stored now."
    }
  },
  required: ["workflow_id"]
};

export const SET_WORKFLOW_ACCESS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow. You must own it."
    },
    access: {
      type: "string",
      enum: ["private", "public"],
      description:
        'Set "public" to publish the workflow to anyone who has the link, "private" to withdraw it.'
    }
  },
  required: ["workflow_id", "access"]
};

export const RUN_WORKFLOW_SCHEMA: JsonSchema = {
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

export const DEBUG_WORKFLOW_SCHEMA: JsonSchema = {
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

export const RESOLVE_ESCALATION_SCHEMA: JsonSchema = {
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
      description:
        "The verdict — must be one of the escalation's allowedActions"
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
        'same failureSignature without asking again (default "invocation")'
    }
  },
  required: ["session_id", "escalation_id", "action"]
};

export const VALIDATE_WORKFLOW_SCHEMA: JsonSchema = {
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
        "A graph program in the legacy untyped DSL — node(type, " +
        "properties) and ref.output(slot?), ending with `return graph();`. " +
        "Evaluated in the sandbox, then validated. Takes precedence over `graph`."
    }
  }
};

export const listWorkflowsSpec: CapabilitySpec = {
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
};

export const getWorkflowSpec: CapabilitySpec = {
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
};

export const createWorkflowSpec: CapabilitySpec = {
  name: "create_workflow",
  description:
    "Create a new workflow with a name, graph structure, and optional " +
    "metadata. Model properties are checked before the workflow is created: " +
    "an unregistered provider or a model id the provider does not offer is " +
    "returned as an error instead of being saved.",
  inputSchema: CREATE_WORKFLOW_SCHEMA,
  category: "write",
  userMessage: (params) => `Creating workflow '${params["name"]}'`
};

export const updateWorkflowSpec: CapabilitySpec = {
  name: "update_workflow",
  description:
    "Update a workflow you own: its graph, name, description or tags. A " +
    "replacement graph is checked the way create_workflow checks one, so an " +
    "unregistered provider or an unknown model id is returned as an error " +
    "rather than saved. Pass expected_updated_at to refuse the write if " +
    "someone else changed the workflow since you read it.",
  inputSchema: UPDATE_WORKFLOW_SCHEMA,
  category: "write",
  userMessage: (params) => `Updating workflow ${params["workflow_id"]}`
};

export const deleteWorkflowSpec: CapabilitySpec = {
  name: "delete_workflow",
  description:
    "Delete a workflow you own, together with the collaborator grants and " +
    "share links pointing at it. A workflow you do not own is reported as " +
    "missing.",
  inputSchema: {
    type: "object",
    properties: {
      workflow_id: {
        type: "string",
        description: "The ID of the workflow to delete. You must own it."
      }
    },
    required: ["workflow_id"]
  },
  category: "write",
  userMessage: (params) => `Deleting workflow ${params["workflow_id"]}`
};

export const setWorkflowAccessSpec: CapabilitySpec = {
  name: "set_workflow_access",
  description:
    "Publish a workflow you own, or withdraw it. A public workflow is " +
    'readable by anyone who has its id, so "public" discloses the graph and ' +
    "everything written into it outside your account.",
  inputSchema: SET_WORKFLOW_ACCESS_SCHEMA,
  // Publishing reaches outside the account, which is what `external` classes.
  // It is not a `write`: the gate must ask even where an ordinary local write
  // would not, and the disclosure cannot be taken back from whoever read it.
  category: "external",
  userMessage: (params) =>
    params["access"] === "public"
      ? `Publishing workflow ${params["workflow_id"]}`
      : `Making workflow ${params["workflow_id"]} private`
};

export const runWorkflowCapabilitySpec: CapabilitySpec = {
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
};

export const debugWorkflowSpec: CapabilitySpec = {
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
};

export const resolveWorkflowEscalationSpec: CapabilitySpec = {
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
};

export const validateWorkflowSpec: CapabilitySpec = {
  name: "validate_workflow",
  description:
    "Statically validate a workflow against the node registry WITHOUT running " +
    "it: unknown node types, missing required properties, unselected models, " +
    "model properties naming an unregistered provider or a model id that " +
    "provider does not offer, and dangling or mis-typed edges. Pass `code` to " +
    "check a graph DSL program (node(type, properties) calls ending with " +
    "`return graph();`), an inline " +
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
};

export const startBackgroundJobSpec: CapabilitySpec = {
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
};

export const getExampleWorkflowSpec: CapabilitySpec = {
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
};

export const exportWorkflowDigraphSpec: CapabilitySpec = {
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
};

/** Every spec this module declares, in declaration order. */
export const workflowsSpecs: readonly CapabilitySpec[] = [
  listWorkflowsSpec,
  getWorkflowSpec,
  createWorkflowSpec,
  updateWorkflowSpec,
  deleteWorkflowSpec,
  setWorkflowAccessSpec,
  runWorkflowCapabilitySpec,
  debugWorkflowSpec,
  resolveWorkflowEscalationSpec,
  validateWorkflowSpec,
  startBackgroundJobSpec,
  getExampleWorkflowSpec,
  exportWorkflowDigraphSpec
];
