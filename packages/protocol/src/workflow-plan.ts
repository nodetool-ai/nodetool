/**
 * The Workflow flow's planner contract and its plan→graph builder (PRD § 11).
 *
 * Three pure pieces, shared by the browser flow and the headless capabilities so
 * a plan means the same thing on both:
 *
 * - the structured-output contract the planner asks a model for
 *   ({@link buildWorkflowPlanSchema}, {@link parseWorkflowPlan});
 * - {@link resolveWorkflowPlan}, which turns a plan into the review step's
 *   markers — a step whose node type the registry does not know, a step whose
 *   model role has no configured provider (D23);
 * - {@link planToPlacement}, which turns a resolved plan into the ordered node
 *   and edge list the build replays through `ui_add_node` / `ui_connect_nodes`
 *   / `ui_update_node_data`.
 *
 * Nothing here places a node, calls a provider or touches a store, which is
 * what makes criterion 3 assertable: planning is text, and the build is a
 * separate step the creator has to press (D4).
 *
 * R6 lives in the last piece. A plan whose steps name real node types can still
 * build a graph that validates and produces nothing, so `planToPlacement`
 * reports every step it could not wire in {@link WorkflowPlacement.issues}
 * rather than emitting a plausible-looking island — and the harness grades the
 * run's output, not the validation.
 */

import { isRecord, isString } from "./predicates.js";
import {
  workflowSetupPlan,
  type WorkflowPlanStep,
  type WorkflowSetupPlan
} from "./api-schemas/workflows.js";

// ── The planner's contract ──────────────────────────────────────────────────

export const WORKFLOW_PLAN_TOOL_NAME = "workflow_plan";

export const WORKFLOW_PLAN_TOOL_DESCRIPTION =
  "The steps a NodeTool workflow needs to do the task, each mapped to a node type that exists in the registry.";

export const WORKFLOW_PLANNER_SYSTEM_PROMPT = [
  "You plan NodeTool workflows. You do not build them.",
  "",
  "Return the inputs the workflow takes, the steps it runs in order, and the",
  "outputs it produces. Every step names one node type from the candidate list",
  "you are given, copied exactly. When no candidate fits a step, set its",
  "node_type to null and say what the step needs in its summary — a named guess",
  "that turns out to be the wrong node builds a graph that runs and produces",
  "nothing, which is worse than an unnamed step.",
  "",
  "Set model_role only on a step that calls a model: language, image, video or",
  "audio. Keep the plan to the steps the task actually needs.",
  "Give each input a sample value the creator can run the workflow with."
].join("\n");

/** The structured-output schema the planner asks for. */
export function buildWorkflowPlanSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["inputs", "steps", "outputs"],
    properties: {
      inputs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "type"],
          properties: {
            name: { type: "string" },
            type: {
              type: "string",
              enum: ["string", "image", "audio", "video", "document", "number"]
            },
            sample: { type: "string" }
          }
        }
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "node_type"],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            node_type: { type: ["string", "null"] },
            model_role: {
              type: "string",
              enum: ["language", "image", "video", "audio"]
            }
          }
        }
      },
      outputs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "type"],
          properties: {
            name: { type: "string" },
            type: { type: "string" }
          }
        }
      }
    }
  };
}

/**
 * Read a planner answer into a plan, filling in the step ids the model is not
 * asked for. Returns null when the answer is not a plan shape at all, so the
 * caller reports a refused run rather than opening an empty review.
 */
export function parseWorkflowPlan(
  data: unknown,
  options: { generateId?: (index: number) => string } = {}
): WorkflowSetupPlan | null {
  if (!isRecord(data)) {
    return null;
  }
  const generateId = options.generateId ?? ((index: number) => `step-${index + 1}`);
  const steps = Array.isArray(data["steps"]) ? data["steps"] : [];
  const withIds = steps.map((step, index) => {
    const base = isRecord(step) ? step : {};
    return {
      ...base,
      id: isString(base["id"]) && base["id"].length > 0
        ? base["id"]
        : generateId(index),
      node_type: isString(base["node_type"]) ? base["node_type"] : null
    };
  });
  const parsed = workflowSetupPlan.safeParse({ ...data, steps: withIds });
  return parsed.success ? parsed.data : null;
}

// ── Review markers (D23) ────────────────────────────────────────────────────

/** Why a step blocks `Continue to setup`, or null when it does not. */
export type WorkflowStepBlock = "unknown-node-type" | "missing-provider";

export interface ResolvedWorkflowStep {
  step: WorkflowPlanStep;
  /** Red marker: the plan named a node type the registry does not have. */
  unknownNodeType: boolean;
  /**
   * Amber marker: the step needs a model role no configured provider covers.
   * Carries the role so the `Connect` button can name it.
   */
  missingProvider: string | null;
  block: WorkflowStepBlock | null;
}

export interface ResolvedWorkflowPlan {
  steps: ResolvedWorkflowStep[];
  /** Distinct model roles the plan needs, in first-use order. */
  roles: string[];
  /** Roles with no configured provider behind them. */
  missingRoles: string[];
  /** False while any step is unknown or any needed provider is missing. */
  canContinue: boolean;
}

export interface ResolveWorkflowPlanOptions {
  /** True when the live registry has this node type. */
  knownNodeType: (nodeType: string) => boolean;
  /** True when a configured provider covers this model role. */
  providerConfigured: (role: string) => boolean;
}

/**
 * Grade every step of a plan against the live registry and the configured
 * providers. One pass over the steps with a role cache, so a fifty-step plan
 * costs one lookup per step and one per distinct role — never a scan per step.
 */
export function resolveWorkflowPlan(
  plan: WorkflowSetupPlan,
  options: ResolveWorkflowPlanOptions
): ResolvedWorkflowPlan {
  const roleConfigured = new Map<string, boolean>();
  const roles: string[] = [];
  const steps = plan.steps.map((step): ResolvedWorkflowStep => {
    const unknownNodeType =
      step.node_type === null || !options.knownNodeType(step.node_type);
    const role = step.model_role;
    let missingProvider: string | null = null;
    if (isString(role) && role.length > 0) {
      let configured = roleConfigured.get(role);
      if (configured === undefined) {
        configured = options.providerConfigured(role);
        roleConfigured.set(role, configured);
        roles.push(role);
      }
      missingProvider = configured ? null : role;
    }
    const block: WorkflowStepBlock | null = unknownNodeType
      ? "unknown-node-type"
      : missingProvider !== null
        ? "missing-provider"
        : null;
    return { step, unknownNodeType, missingProvider, block };
  });
  const missingRoles = roles.filter((role) => roleConfigured.get(role) === false);
  return {
    steps,
    roles,
    missingRoles,
    canContinue: steps.every((entry) => entry.block === null)
  };
}

// ── Plan → graph ────────────────────────────────────────────────────────────

/** One handle of a node type, as the registry describes it. */
export interface PlanNodeHandle {
  name: string;
  /** The handle's type name, e.g. "str", "image", "any". */
  type: string;
  required?: boolean;
}

/** What the builder needs to know about a node type to wire it. */
export interface PlanNodeShape {
  /**
   * The node's input properties, in the order the builder should try them.
   * `planNodeShape` puts the node's declared input handles first: a Summarizer
   * has `text` and `system_prompt`, and a chain that lands on the prompt looks
   * wired and summarizes nothing.
   */
  inputs: readonly PlanNodeHandle[];
  outputs: readonly PlanNodeHandle[];
  /** The node takes named dynamic inputs (Concat, Template, Code). */
  supportsDynamicInputs?: boolean;
}

/** Registry lookup. Returns null for a type the registry does not have. */
export type PlanNodeLookup = (nodeType: string) => PlanNodeShape | null;

/** One node the build places, in the order it places them. */
export interface PlacementNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  properties: Record<string, unknown>;
  /** Dynamic slots to declare before an edge can land on them. */
  dynamicProperties?: Record<string, unknown>;
  /** The plan step this node came from (PRD § 11.5). Absent on I/O nodes. */
  setupStepId?: string;
}

export interface PlacementEdge {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface WorkflowPlacement {
  nodes: PlacementNode[];
  edges: PlacementEdge[];
  /**
   * What the builder could not do: a step with no node type, a node type the
   * registry lacks, a step with nowhere to take its input, an output with
   * nothing upstream. A placement with issues is a graph that may still
   * validate and still produce nothing — R6 — so the build reports them
   * instead of shipping a green-looking island.
   */
  issues: string[];
}

/** Plan input type → the input node that carries it. */
const INPUT_NODE_TYPES: Readonly<Record<string, string>> = {
  string: "nodetool.input.StringInput",
  number: "nodetool.input.FloatInput",
  integer: "nodetool.input.IntegerInput",
  boolean: "nodetool.input.BooleanInput",
  image: "nodetool.input.ImageInput",
  audio: "nodetool.input.AudioInput",
  video: "nodetool.input.VideoInput",
  document: "nodetool.input.DocumentInput"
};

export const PLAN_OUTPUT_NODE_TYPE = "nodetool.output.Output";

/** Handle types that take anything — a chain can always land on one. */
const WILDCARD_TYPES = new Set(["any", "union", "object"]);

/** Handle types a chain must never land on — a model is chosen, not wired. */
export const MODEL_HANDLE_TYPES: Readonly<Record<string, string>> = {
  language: "language_model",
  image: "image_model",
  video: "video_model",
  audio: "tts_model"
};

const MODEL_TYPES = new Set([
  ...Object.values(MODEL_HANDLE_TYPES),
  "asr_model",
  "embedding_model"
]);

const acceptsType = (target: string, source: string): boolean =>
  WILDCARD_TYPES.has(target) || WILDCARD_TYPES.has(source) || target === source;

/** The dynamic slot name the builder declares when a node has no free handle. */
const DYNAMIC_SLOT = "input";

interface Upstream {
  nodeId: string;
  handle: string;
  type: string;
}

/** Layout only: a readable left-to-right chain on the canvas. */
const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 170;
const position = (column: number, row: number) => ({
  x: 80 + column * COLUMN_WIDTH,
  y: 80 + row * ROW_HEIGHT
});

/**
 * Turn a plan into the nodes and edges that make it run.
 *
 * The shape is a chain: one input node per plan input, the steps in plan order
 * each fed by the one before it, one output node per plan output fed by the
 * last step. Inputs after the first land on the first step's remaining free
 * handles, in order.
 *
 * Every handle choice is made from a per-node cursor, so the walk is linear in
 * the number of steps times the handles of one node — never a scan of the
 * edges inside the node loop.
 */
export interface PlanToPlacementOptions {
  /**
   * The model each role runs on, as chosen on the setup step (PRD § 11.3),
   * keyed by role. A step whose role has no entry is placed with its model
   * property unset, which the static check then reports.
   */
  models?: Readonly<Record<string, unknown>>;
}

export function planToPlacement(
  plan: WorkflowSetupPlan,
  lookup: PlanNodeLookup,
  options: PlanToPlacementOptions = {}
): WorkflowPlacement {
  const nodes: PlacementNode[] = [];
  const edges: PlacementEdge[] = [];
  const issues: string[] = [];

  // 1. Inputs.
  const inputs: Upstream[] = [];
  plan.inputs.forEach((input, index) => {
    const nodeType = INPUT_NODE_TYPES[input.type] ?? INPUT_NODE_TYPES["string"];
    const id = `input_${index + 1}`;
    const properties: Record<string, unknown> = { name: input.name };
    if (input.sample !== undefined) {
      properties["value"] = input.sample;
    }
    nodes.push({ id, type: nodeType, position: position(0, index), properties });
    const shape = lookup(nodeType);
    const handle = shape?.outputs[0]?.name ?? "output";
    inputs.push({ nodeId: id, handle, type: shape?.outputs[0]?.type ?? "any" });
  });

  // 2. Steps, chained.
  let upstream: Upstream | null = inputs[0] ?? null;
  // Inputs the chain has not consumed yet, oldest first.
  let spareInput = 1;
  let lastStep: Upstream | null = null;

  plan.steps.forEach((step, index) => {
    const label = `step ${index + 1} ("${step.title}")`;
    if (step.node_type === null) {
      issues.push(`${label} names no node type, so nothing was placed for it.`);
      return;
    }
    const shape = lookup(step.node_type);
    if (!shape) {
      issues.push(
        `${label} names "${step.node_type}", which the registry does not have.`
      );
      return;
    }
    const id = `step_${index + 1}`;
    const node: PlacementNode = {
      id,
      type: step.node_type,
      position: position(index + 1, 0),
      properties: {},
      setupStepId: step.id
    };

    // The model a step calls is assigned, never wired: a chain that landed on
    // a model property would build a graph that validates and never runs.
    const role = step.model_role;
    if (isString(role) && role.length > 0) {
      const wanted = MODEL_HANDLE_TYPES[role];
      const slot = shape.inputs.find((handle) => handle.type === wanted);
      const chosen = options.models?.[role];
      if (slot && chosen !== undefined) {
        node.properties[slot.name] = chosen;
      } else if (slot) {
        issues.push(
          `${label} needs a ${role} model and none was chosen, so its "${slot.name}" is unset.`
        );
      }
    }

    // Free handles of this node, consumed left to right.
    const free = shape.inputs.filter((handle) => !MODEL_TYPES.has(handle.type));
    let cursor = 0;
    const takeHandle = (sourceType: string): string | null => {
      while (cursor < free.length) {
        const candidate = free[cursor];
        cursor += 1;
        if (acceptsType(candidate.type, sourceType)) {
          return candidate.name;
        }
      }
      if (shape.supportsDynamicInputs === true) {
        // A dynamic node has no declared handle to land on; the slot has to be
        // declared before the edge, which is what the build's
        // `ui_update_node_data` call in plan order is for.
        const slot = `${DYNAMIC_SLOT}_${Object.keys(node.dynamicProperties ?? {}).length + 1}`;
        node.dynamicProperties = { ...(node.dynamicProperties ?? {}), [slot]: "" };
        return slot;
      }
      return null;
    };

    if (upstream === null) {
      issues.push(`${label} has no input: the plan declares none.`);
    } else {
      const handle = takeHandle(upstream.type);
      if (handle === null) {
        issues.push(
          `${label} maps to "${step.node_type}", which has no input that takes ${upstream.type}.`
        );
      } else {
        edges.push({
          source: upstream.nodeId,
          sourceHandle: upstream.handle,
          target: id,
          targetHandle: handle
        });
      }
    }

    // Extra plan inputs feed the first step that has room for them.
    while (spareInput < inputs.length) {
      const extra = inputs[spareInput];
      const handle = takeHandle(extra.type);
      if (handle === null) {
        break;
      }
      edges.push({
        source: extra.nodeId,
        sourceHandle: extra.handle,
        target: id,
        targetHandle: handle
      });
      spareInput += 1;
    }

    nodes.push(node);
    const out = shape.outputs[0];
    if (!out) {
      issues.push(
        `${label} maps to "${step.node_type}", which produces no output.`
      );
      upstream = null;
    } else {
      upstream = { nodeId: id, handle: out.name, type: out.type };
      lastStep = upstream;
    }
  });

  if (spareInput < inputs.length) {
    issues.push(
      `${inputs.length - spareInput} plan input(s) reached no step and were left unconnected.`
    );
  }

  // 3. Outputs.
  plan.outputs.forEach((output, index) => {
    const id = `output_${index + 1}`;
    nodes.push({
      id,
      type: PLAN_OUTPUT_NODE_TYPE,
      position: position(plan.steps.length + 1, index),
      properties: { name: output.name }
    });
    const source = lastStep;
    if (source === null) {
      issues.push(
        `output "${output.name}" has no step upstream, so the workflow produces nothing.`
      );
      return;
    }
    edges.push({
      source: source.nodeId,
      sourceHandle: source.handle,
      target: id,
      targetHandle: "value"
    });
  });

  if (plan.outputs.length === 0) {
    issues.push("the plan declares no output, so a run produces nothing.");
  }

  return { nodes, edges, issues };
}

/**
 * The subset of a node's registry metadata the builder reads. Structural on
 * purpose: `NodeMetadata` in `node-sdk` and the one the browser's metadata
 * store holds are the same shape, and this module depends on neither.
 */
export interface PlanNodeMetadataLike {
  properties?: readonly {
    name: string;
    type?: { type?: string } | null;
    required?: boolean;
  }[];
  outputs?: readonly { name: string; type?: { type?: string } | null }[];
  /** The node's primary content field, shown on its body. */
  inline_fields?: readonly string[];
  /** Property names the node declares as its input handles. */
  input_fields?: readonly string[];
  supports_dynamic_inputs?: boolean;
}

/** Read one node's metadata into the shape {@link planToPlacement} wires from. */
export function planNodeShape(meta: PlanNodeMetadataLike): PlanNodeShape {
  // The node author's own statement of what each property is for: the content
  // field first, then the declared input handles, then whatever is left in
  // declaration order. Without it a chain lands on a Summarizer's
  // `system_prompt` — wired, validating, and summarizing nothing.
  const ranked = [...(meta.inline_fields ?? []), ...(meta.input_fields ?? [])];
  const rank = new Map(ranked.map((name, index) => [name, index]));
  const properties = [...(meta.properties ?? [])].sort(
    (a, b) =>
      (rank.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.name) ?? Number.MAX_SAFE_INTEGER)
  );
  return {
    inputs: properties.map((property) => ({
      name: property.name,
      type: property.type?.type ?? "any",
      required: property.required === true
    })),
    outputs: (meta.outputs ?? []).map((output) => ({
      name: output.name,
      type: output.type?.type ?? "any"
    })),
    supportsDynamicInputs: meta.supports_dynamic_inputs === true
  };
}

// ── Shipped inspiration chips (PRD § 11.1) ──────────────────────────────────

/**
 * The three starting points step 1 offers, each with the plan a creator gets by
 * pressing it.
 *
 * The plans are pinned rather than generated so criterion 5 is assertable: the
 * harness builds each one against the live registry and checks the graph, and a
 * chip whose plan stops naming real node types fails there instead of in front
 * of a creator. Pressing a chip in the browser still re-plans from the brief
 * when a provider is configured — the pinned plan is what it falls back to, and
 * what the harness grades.
 */
export interface WorkflowInspirationChip {
  id: string;
  /** The chip's label, which is also the brief it writes. */
  brief: string;
  plan: WorkflowSetupPlan;
}

export const WORKFLOW_INSPIRATION_CHIPS: readonly WorkflowInspirationChip[] = [
  {
    id: "summarize-pdf",
    brief: "Summarize a PDF and email it",
    plan: {
      inputs: [{ name: "document", type: "document" }],
      steps: [
        {
          id: "extract",
          title: "Read the PDF",
          summary: "Pull the text out of the uploaded document.",
          node_type: "lib.pdf.ExtractText"
        },
        {
          id: "summarize",
          title: "Summarize it",
          summary: "Write a short summary of the extracted text.",
          node_type: "nodetool.agents.Summarizer",
          model_role: "language"
        }
      ],
      outputs: [{ name: "summary", type: "string" }]
    }
  },
  {
    id: "product-shots",
    brief: "Batch-generate product shots from a CSV",
    plan: {
      inputs: [{ name: "rows", type: "string" }],
      steps: [
        {
          id: "prompt",
          title: "Compose the shot prompt",
          summary: "Turn each row into the prompt one shot is rendered from.",
          node_type: "nodetool.text.Template"
        },
        {
          id: "render",
          title: "Render the shot",
          summary: "Generate the product image for the row.",
          node_type: "nodetool.fake.GenerateImage",
          model_role: "image"
        }
      ],
      outputs: [{ name: "shot", type: "image" }]
    }
  },
  {
    id: "url-to-post",
    brief: "Turn a YouTube URL into a blog post",
    plan: {
      inputs: [{ name: "url", type: "string" }],
      steps: [
        {
          id: "download",
          title: "Download the video",
          summary: "Fetch the video behind the URL.",
          node_type: "lib.video.download.YtDlpDownload"
        },
        {
          id: "audio",
          title: "Take the audio",
          summary: "Split the audio track off the video.",
          node_type: "nodetool.video.ExtractAudio"
        }
      ],
      outputs: [{ name: "audio", type: "audio" }]
    }
  }
];
