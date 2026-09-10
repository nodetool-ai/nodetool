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
    },
    project_id: {
      type: "string",
      description: "Project to own the workflow. Defaults to this agent run's project."
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

export const DEFAULT_VERSION_LIMIT = 20;

export const MAX_VERSION_LIMIT = 100;

export const LIST_WORKFLOW_VERSIONS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow."
    },
    limit: {
      type: "number",
      description: `Max versions to return (default ${DEFAULT_VERSION_LIMIT}, max ${MAX_VERSION_LIMIT}).`
    }
  },
  required: ["workflow_id"]
};

export const GET_WORKFLOW_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow."
    },
    version: {
      type: "number",
      description: "Version number to read, from list_workflow_versions."
    }
  },
  required: ["workflow_id", "version"]
};

export const CREATE_WORKFLOW_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow."
    },
    name: {
      type: "string",
      description: "Label for the snapshot, e.g. 'before the rewrite'."
    },
    description: {
      type: "string",
      description: "Optional note stored with the snapshot."
    }
  },
  required: ["workflow_id"]
};

export const RESTORE_WORKFLOW_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow."
    },
    version: {
      type: "number",
      description: "Version number to restore, from list_workflow_versions."
    }
  },
  required: ["workflow_id", "version"]
};

export const DELETE_WORKFLOW_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The ID of the workflow."
    },
    version: {
      type: "number",
      description: "Version number to delete, from list_workflow_versions."
    }
  },
  required: ["workflow_id", "version"]
};

export const listWorkflowVersionsSpec: CapabilitySpec = {
  name: "list_workflow_versions",
  description:
    "List a workflow's snapshots, newest first: version number, name, " +
    "description, save type ('manual', 'autosave', 'restore'), and when it " +
    "was taken. Call this before restoring — restore_workflow_version " +
    "addresses a snapshot by its version number.",
  inputSchema: LIST_WORKFLOW_VERSIONS_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Listing versions of workflow ${String(params["workflow_id"])}`
};

export const getWorkflowVersionSpec: CapabilitySpec = {
  name: "get_workflow_version",
  description:
    "Read one snapshot of a workflow without restoring it: the version's " +
    "metadata plus the graph it stored. Use this to inspect or compare " +
    "versions before deciding which one to restore.",
  inputSchema: GET_WORKFLOW_VERSION_SCHEMA,
  category: "read",
  userMessage: (params) =>
    `Reading v${String(params["version"])} of workflow ${String(params["workflow_id"])}`
};

export const createWorkflowVersionSpec: CapabilitySpec = {
  name: "create_workflow_version",
  description:
    "Snapshot a workflow's current graph as a manual version, so it can be " +
    "restored later. Take one before an edit the user may want undone. " +
    "Returns the new version's number.",
  inputSchema: CREATE_WORKFLOW_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Snapshotting workflow ${String(params["workflow_id"])}`
};

export const restoreWorkflowVersionSpec: CapabilitySpec = {
  name: "restore_workflow_version",
  description:
    "Roll a workflow's graph back to one of its snapshots, addressed by " +
    "version number (from list_workflow_versions). The graph being " +
    "overwritten is snapshotted first, so the restore is itself undoable — " +
    "restore that snapshot to come back.",
  inputSchema: RESTORE_WORKFLOW_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Restoring workflow ${String(params["workflow_id"])} to v${String(params["version"])}`
};

export const deleteWorkflowVersionSpec: CapabilitySpec = {
  name: "delete_workflow_version",
  description:
    "Delete one snapshot of a workflow you own, addressed by version number " +
    "(from list_workflow_versions). This cannot be undone. The live graph is " +
    "not changed.",
  inputSchema: DELETE_WORKFLOW_VERSION_SCHEMA,
  category: "write",
  userMessage: (params) =>
    `Deleting v${String(params["version"])} of workflow ${String(params["workflow_id"])}`
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
    "Start a workflow and return its job id immediately, without waiting for " +
    "the run. Poll get_job with that id until it settles; the settled job " +
    "carries the run's outputs. Use run_workflow instead when you want to " +
    "block until the result is ready.",
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


// ── Guided setup (PRD § 11.6) ────────────────────────────────────────────────
// The headless half of the Workflow creation flow. The browser drives the same
// four operations through `ui_workflow_set_setup`, `ui_workflow_plan`,
// `ui_workflow_update_plan_step` and `ui_workflow_build_from_plan`; these act
// on the stored row instead, so every § 11.7 criterion is reachable with no
// editor open.

export const SET_WORKFLOW_SETUP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The workflow to write setup on. You must own it."
    },
    brief: {
      type: "string",
      description: "What the workflow should do — the planner's input."
    },
    category: {
      type: "string",
      description:
        "Workflow kind, biasing the planner: content-pipeline, media-batch, data-extraction, research-agent, trigger-automation, chat-app.",
      enum: [
        "content-pipeline",
        "media-batch",
        "data-extraction",
        "research-agent",
        "trigger-automation",
        "chat-app"
      ]
    },
    run_mode: {
      type: "string",
      description: "How the finished workflow is meant to be run.",
      enum: ["manual", "app", "trigger"]
    },
    stage: {
      type: "string",
      description:
        "Where the guided flow resumes. A workflow that has finished setup, or was built before the flow existed, reads 'done'.",
      enum: ["idea", "category", "review", "setup", "done"]
    }
  },
  required: ["workflow_id"]
};

export const PLAN_WORKFLOW_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The workflow whose brief is planned. You must own it."
    },
    provider: { type: "string", description: "Provider for the planner call." },
    model: { type: "string", description: "Model id for the planner call." },
    plan: {
      type: "object",
      description:
        "A plan to store as-is instead of calling a model — {inputs, steps, outputs}. Use it to replay a plan, or to test the build without a provider."
    }
  },
  required: ["workflow_id"]
};

export const UPDATE_WORKFLOW_PLAN_STEP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: { type: "string", description: "The workflow. You must own it." },
    step_id: {
      type: "string",
      description:
        "Id of the plan step to change, as listed by plan_workflow. Omit with op 'add'."
    },
    op: {
      type: "string",
      description:
        "'update' edits the step's fields, 'add' appends a new one, 'remove' drops it, 'move' reorders it to `index`.",
      enum: ["update", "add", "remove", "move"],
      default: "update"
    },
    title: { type: "string" },
    summary: { type: "string" },
    node_type: {
      type: ["string", "null"],
      description:
        "Registry node type this step maps to, or null when none fits. An unknown type blocks the setup step (D23)."
    },
    model_role: {
      type: "string",
      enum: ["language", "image", "video", "audio"]
    },
    index: {
      type: "number",
      description: "0-based position for op 'move' or 'add'."
    }
  },
  required: ["workflow_id"]
};

export const BUILD_WORKFLOW_FROM_PLAN_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: { type: "string", description: "The workflow. You must own it." },
    save: {
      type: "boolean",
      description:
        "Write the built graph onto the workflow row. False builds and validates without saving.",
      default: true
    }
  },
  required: ["workflow_id"]
};

// ── Guided game setup (game-prd § 5.7) ──────────────────────────────────────
//
// The server-side mirrors of the browser's `ui_game_*` tools, beside the
// Workflow flow's four. Same document (`settings.game`), same designer
// contract and same pure graph builder, so a game set up headlessly and one set
// up in the browser cannot diverge.

export const SET_GAME_SETUP_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The workflow to write the game setup on. You must own it."
    },
    brief: {
      type: "string",
      description: "One sentence describing the game — the designer's input."
    },
    template: {
      type: "string",
      description:
        "Game template id, as list_game_templates returns: platformer, topdown, shmup."
    },
    style_entity_id: {
      type: "string",
      description: "Library entity id of the pixel style every prompt carries."
    },
    image_model: {
      type: "string",
      description:
        "`provider:model_id` of the text-to-image model every sprite, tile and background is generated with."
    },
    sfx_node_type: {
      type: "string",
      description:
        "Registry node type of the sound-effect generator. Omit to keep the template's placeholder sounds."
    },
    music_model: {
      type: "string",
      description:
        "`provider:model_id` of the music model. Omit to keep the template's placeholder music."
    },
    project_name: {
      type: "string",
      description:
        "The Godot project's name, which also names its export directory games/<slug>."
    },
    stage: {
      type: "string",
      description:
        "Where the guided flow resumes. A game that has finished setup, or a workflow built before the flow existed, reads 'done'.",
      enum: ["idea", "template", "review", "look", "done"]
    }
  },
  required: ["workflow_id"]
};

export const DESIGN_GAME_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: {
      type: "string",
      description: "The workflow whose brief is designed. You must own it."
    },
    provider: { type: "string", description: "Provider for the designer call." },
    model: { type: "string", description: "Model id for the designer call." },
    design: {
      type: "object",
      description:
        "A design to store as-is instead of calling a model. Use it to replay a design, or to reach the build with no provider."
    }
  },
  required: ["workflow_id"]
};

export const UPDATE_GAME_DESIGN_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: { type: "string", description: "The workflow. You must own it." },
    title: { type: "string", description: "The game's title." },
    premise: { type: "string", description: "Two or three sentences of premise." },
    core_loop: { type: "string", description: "What the player does every ten seconds." },
    level: { type: "string", description: "The first level's layout in words." },
    win: { type: "string", description: "How the player wins." },
    lose: { type: "string", description: "How the player loses." },
    player_verbs: {
      type: "array",
      items: { type: "string" },
      description: "The verbs the player has: move, jump, shoot."
    },
    cast: {
      type: "array",
      description:
        "Cast entries to merge by slot_id: {slot_id, name, descriptor}. A slot not named here is left alone.",
      items: {
        type: "object",
        properties: {
          slot_id: { type: "string" },
          name: { type: "string" },
          descriptor: { type: "string" }
        },
        required: ["slot_id"]
      }
    },
    enemies: {
      type: "array",
      description:
        "Enemy entries to merge by slot_id: {slot_id, name, behaviour}.",
      items: {
        type: "object",
        properties: {
          slot_id: { type: "string" },
          name: { type: "string" },
          behaviour: { type: "string" }
        },
        required: ["slot_id"]
      }
    },
    slot_prompts: {
      type: "array",
      description:
        "Slot prompts to merge by slot_id: {slot_id, prompt}. The subject only — style and pixel size are added by the builder.",
      items: {
        type: "object",
        properties: {
          slot_id: { type: "string" },
          prompt: { type: "string" }
        },
        required: ["slot_id", "prompt"]
      }
    }
  },
  required: ["workflow_id"]
};

export const BUILD_GAME_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    workflow_id: { type: "string", description: "The workflow. You must own it." },
    save: {
      type: "boolean",
      description:
        "Write the built graph onto the workflow row. False builds and validates without saving.",
      default: true
    }
  },
  required: ["workflow_id"]
};

export const setWorkflowSetupSpec: CapabilitySpec = {
  name: "set_workflow_setup",
  description:
    "Write the guided-setup answers on a workflow: the `brief` (what it should do), the `category` that biases the planner, the `run_mode` it is built for, and the `stage` the flow sits at. Omit a field to leave it unchanged. The stages run idea → category → review → setup → done. Setting the stage is what moves an open flow to that step.",
  inputSchema: SET_WORKFLOW_SETUP_SCHEMA,
  category: "write",
  userMessage: () => "Writing the workflow setup"
};

export const planWorkflowSpec: CapabilitySpec = {
  name: "plan_workflow",
  description:
    "Plan the steps a workflow's brief needs, and store the plan under settings.setup. Places no node and creates no job: it returns inputs, steps and outputs as text, each step mapped to a node type that exists in the registry or marked unknown, with the model role it needs and whether a provider covers it. Review the plan and fix it with update_workflow_plan_step before build_workflow_from_plan.",
  inputSchema: PLAN_WORKFLOW_SCHEMA,
  category: "write",
  userMessage: () => "Planning the workflow steps"
};

export const updateWorkflowPlanStepSpec: CapabilitySpec = {
  name: "update_workflow_plan_step",
  description:
    "Edit the stored plan: change a step's title, summary, node type or model role, add a step, remove one, or move one to another position. Use it to replace a node type the registry does not have — the build refuses a plan that still names one.",
  inputSchema: UPDATE_WORKFLOW_PLAN_STEP_SCHEMA,
  category: "write",
  userMessage: () => "Editing the workflow plan"
};

export const buildWorkflowFromPlanSpec: CapabilitySpec = {
  name: "build_workflow_from_plan",
  description:
    "Build the workflow's graph from its stored plan and validate it. Places one input node per plan input, one node per step in plan order chained to the one before it, and one output node per plan output; then runs the same checks as validate_workflow. Refused while any step names a node type the registry does not have. Run the workflow afterwards with the plan's sample inputs to see whether it produces anything.",
  inputSchema: BUILD_WORKFLOW_FROM_PLAN_SCHEMA,
  category: "write",
  userMessage: () => "Building the workflow from its plan"
};

export const setGameSetupSpec: CapabilitySpec = {
  name: "set_game_setup",
  description:
    "Write the guided game-setup answers on a workflow: the `brief` (one sentence about the game), the `template` whose loop it uses, the style entity and models every asset is generated with, and the `project_name` the Godot project takes. Omit a field to leave it unchanged. The stages run idea → template → review → look → done. Setting the stage is what moves an open flow to that step.",
  inputSchema: SET_GAME_SETUP_SCHEMA,
  category: "write",
  userMessage: () => "Writing the game setup"
};

export const designGameSpec: CapabilitySpec = {
  name: "design_game",
  description:
    "Write the design for a workflow's game brief and store it under settings.game. Places no node and creates no job: it returns the title, premise, loop, cast, enemies, level and one prompt per asset slot the chosen template needs, as text. A slot the designer skipped is filled from the template's own prompt and reported. Review it and fix it with update_game_design before build_game.",
  inputSchema: DESIGN_GAME_SCHEMA,
  category: "write",
  userMessage: () => "Writing the game design"
};

export const updateGameDesignSpec: CapabilitySpec = {
  name: "update_game_design",
  description:
    "Edit the stored game design: any of its text sections, and cast, enemy or slot-prompt entries merged by slot_id. Use it to replace a placeholder the designer left, or to change what one slot generates — the build refuses a design with an empty cast descriptor or slot prompt.",
  inputSchema: UPDATE_GAME_DESIGN_SCHEMA,
  category: "write",
  userMessage: () => "Editing the game design"
};

export const buildGameSpec: CapabilitySpec = {
  name: "build_game",
  description:
    "Build the workflow's graph from its stored game design and validate it. Places one generate → resize → check chain per asset slot the template needs, feeds every checker into one nodetool.game.ExportGodotProject node, and runs the same checks as validate_workflow. Refused while the design has an unnamed cast member or an empty slot prompt. Run the workflow afterwards to generate the assets and write the project.",
  inputSchema: BUILD_GAME_SCHEMA,
  category: "write",
  userMessage: () => "Building the game graph"
};

/** Every spec this module declares, in declaration order. */
export const workflowsSpecs: readonly CapabilitySpec[] = [
  listWorkflowsSpec,
  getWorkflowSpec,
  createWorkflowSpec,
  updateWorkflowSpec,
  deleteWorkflowSpec,
  listWorkflowVersionsSpec,
  getWorkflowVersionSpec,
  createWorkflowVersionSpec,
  restoreWorkflowVersionSpec,
  deleteWorkflowVersionSpec,
  setWorkflowAccessSpec,
  runWorkflowCapabilitySpec,
  debugWorkflowSpec,
  resolveWorkflowEscalationSpec,
  validateWorkflowSpec,
  startBackgroundJobSpec,
  getExampleWorkflowSpec,
  exportWorkflowDigraphSpec,
  setWorkflowSetupSpec,
  planWorkflowSpec,
  updateWorkflowPlanStepSpec,
  buildWorkflowFromPlanSpec,
  setGameSetupSpec,
  designGameSpec,
  updateGameDesignSpec,
  buildGameSpec
];
