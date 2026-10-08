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

/** The node a plan step runs its own JavaScript on. */
export const PLAN_CODE_NODE_TYPE = "nodetool.code.Code";

/** The Code step's input and output handles, named in the planner prompt. */
export const PLAN_CODE_INPUT = "input";
export const PLAN_CODE_OUTPUT = "output";

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
  "The steps form one chain. Each step receives exactly one value: the previous",
  "step's output (the first step receives the first input). A step never reads",
  "from two steps back, and there are no branches or joins, so do not plan Zip",
  "or merge steps. Inputs and outputs are declared under inputs and outputs, never",
  "as steps. Declare one output: it receives the last step's value. When a step",
  "needs a second workflow input, make it a Code step: every input after the",
  `first is connected to the first Code step as inputs.input_2, inputs.input_3, …`,
  "",
  "A data step no candidate does — parse a CSV, reshape JSON, filter or compute",
  `values — is a Code step: set node_type to "${PLAN_CODE_NODE_TYPE}" and write`,
  "its JavaScript body in code. Never invent a node type for it. The body reads",
  `the previous step's value as inputs.${PLAN_CODE_INPUT}. To pass on one value,`,
  `call await output("${PLAN_CODE_OUTPUT}", value) once. To pass on one value per`,
  `item — one prompt per CSV row — call await emit("${PLAN_CODE_OUTPUT}", item) inside`,
  "the loop: the next step then runs once per item. Never call output() in a loop.",
  "Emit exactly the value the next step takes — a prompt string for an image or",
  "text step, not an object around it. Build a prompt from fields in the Code",
  "step that has the fields. A Code step never calls a model: put the model call",
  "in its own step with model_role, never in fetch() with an API key. A Code step",
  "reads its data from its inputs (media.text(inputs.input) for a document),",
  "never from a file path, and awaits every host call (getSecret, fetch,",
  "workspace, media).",
  "To parse CSV, put",
  'import { parse } from "@nodetool-ai/sandbox-csv" at the top of the body',
  "and call await parse(text), which returns records keyed by the header row.",
  "",
  "Set model_role only on a step that calls a model: language, image, video or",
  "audio. Keep the plan to the steps the task actually needs.",
  "Give each text or number input a sample value the creator can run the",
  "workflow with: the value itself — the CSV text, the notes — never a file name",
  "or a path. Quote CSV fields that contain commas. Give a document, image, audio",
  "or video input no sample: the creator uploads one."
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
            // Models write null for "no model" whatever the prompt says, and
            // a schema that refuses it costs a validation round trip.
            model_role: {
              type: ["string", "null"],
              enum: ["language", "image", "video", "audio", null]
            },
            code: { type: "string" }
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
    const raw = isRecord(step) ? step : {};
    // A null optional field means "absent": drop it before the schema reads it.
    const base = Object.fromEntries(
      Object.entries(raw).filter(
        ([key, value]) => value !== null || key === "node_type"
      )
    );
    // A step that carries a body runs it, whatever type the planner named.
    const hasCode = isString(base["code"]) && base["code"].trim().length > 0;
    return {
      ...base,
      id: isString(base["id"]) && base["id"].length > 0
        ? base["id"]
        : generateId(index),
      node_type: hasCode
        ? PLAN_CODE_NODE_TYPE
        : isString(base["node_type"])
          ? base["node_type"]
          : null
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
  /** The node declares its outputs per instance (Code). */
  supportsDynamicOutputs?: boolean;
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
  /** Dynamic outputs to declare before an edge can leave them. */
  dynamicOutputs?: Record<string, PlanDynamicOutputType>;
  /** The plan step this node came from (PRD § 11.5). Absent on I/O nodes. */
  setupStepId?: string;
}

/** A declared dynamic output's type, in the `dynamic_outputs` wire shape. */
export interface PlanDynamicOutputType {
  type: string;
  type_args: unknown[];
  optional: boolean;
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
  "embedding_model",
  "rerank_model"
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

    // A Code step's handles are the names its body uses — the planner's
    // `input` and `output`, or the ones a snippet step lists — so the build
    // declares exactly those rather than the generic `input_N` slots.
    const isCodeStep = step.node_type === PLAN_CODE_NODE_TYPE;
    const codeInputs = step.code_inputs ?? [PLAN_CODE_INPUT];
    const codeOutputs = step.code_outputs ?? [PLAN_CODE_OUTPUT];
    if (isCodeStep) {
      if (isString(step.code) && step.code.trim().length > 0) {
        node.properties["code"] = step.code;
      } else {
        issues.push(`${label} is a Code step with no code, so it outputs nothing.`);
      }
    }

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

    // Free handles of this node, consumed left to right. A Code step's own
    // properties are its body and settings, never a place for the chain.
    const free = isCodeStep
      ? []
      : shape.inputs.filter((handle) => !MODEL_TYPES.has(handle.type));
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
        const count = Object.keys(node.dynamicProperties ?? {}).length;
        const slot =
          isCodeStep && count < codeInputs.length
            ? codeInputs[count]
            : `${DYNAMIC_SLOT}_${count + 1}`;
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
    let out = shape.outputs[0];
    if (
      !out &&
      isCodeStep &&
      shape.supportsDynamicOutputs === true &&
      codeOutputs.length > 0
    ) {
      node.dynamicOutputs = Object.fromEntries(
        codeOutputs.map((name) => [
          name,
          { type: "any", type_args: [], optional: false }
        ])
      );
      out = { name: codeOutputs[0], type: "any" };
    }
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
  supports_dynamic_outputs?: boolean;
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
    supportsDynamicInputs: meta.supports_dynamic_inputs === true,
    supportsDynamicOutputs: meta.supports_dynamic_outputs === true
  };
}

// ── Plan check and repair loop ──────────────────────────────────────────────

/**
 * The general-purpose nodes every planner prompt offers, whatever the brief
 * ranks: a brief's words rank provider-specific nodes first ("product shots"
 * finds a Reve remix node before Text To Image), and the planner can only name
 * what it is shown.
 */
export const PLAN_CORE_NODE_TYPES: readonly string[] = [
  "nodetool.agents.Agent",
  "nodetool.agents.Summarizer",
  "nodetool.agents.Extractor",
  "nodetool.image.TextToImage",
  "nodetool.video.TextToVideo",
  "nodetool.audio.TextToSpeech",
  "nodetool.control.Collect",
  PLAN_CODE_NODE_TYPE
];

/** Node types that are a workflow's own inputs and outputs, never a step. */
const isIoNodeType = (nodeType: string): boolean =>
  nodeType.startsWith("nodetool.input.") ||
  nodeType.startsWith("nodetool.output.");

/** Stands in for every role's model, so a check does not report models unset. */
const ANY_MODEL: Readonly<Record<string, unknown>> = Object.fromEntries(
  Object.keys(MODEL_HANDLE_TYPES).map((role) => [role, {}])
);

export interface CheckWorkflowPlanOptions {
  lookup: PlanNodeLookup;
  /**
   * The contract check for a Code step's body — `plannedCodeStepProblems` from
   * `@nodetool-ai/node-sdk/code-analysis`, which this package cannot import.
   */
  checkCode?: (
    code: string,
    handles: { inputs: readonly string[]; output: string }
  ) => string[];
}

/**
 * Everything that would make a plan build a graph that fails or produces
 * nothing, found before a node is placed or a model is called: unknown node
 * types, wiring the builder cannot do, and Code bodies that break the Code
 * node's contract. Models are not checked here — the creator picks them on the
 * setup step, after the plan.
 */
export function checkWorkflowPlan(
  plan: WorkflowSetupPlan,
  options: CheckWorkflowPlanOptions
): string[] {
  const placement = planToPlacement(plan, options.lookup, {
    models: ANY_MODEL
  });
  const problems = [...placement.issues];
  const nodeTypeOf = new Map(placement.nodes.map((node) => [node.id, node.type]));
  const nodeOfStep = new Map(
    placement.nodes
      .filter((node) => node.setupStepId !== undefined)
      .map((node) => [node.setupStepId, node.id])
  );
  const wiredInto = (nodeId: string): string[] =>
    placement.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.targetHandle);

  plan.steps.forEach((step, index) => {
    const label = `step ${index + 1} ("${step.title}")`;
    if (step.node_type !== null && isIoNodeType(step.node_type)) {
      problems.push(
        `${label} is the workflow input/output node "${step.node_type}"; declare it under inputs or outputs, not as a step.`
      );
    }
  });

  // The chain gives every step one value. A second workflow input can only
  // be read by a Code step that names it; anywhere else it lands on whatever
  // property is free — a document input's `name`, a prompt's system text.
  for (const edge of placement.edges) {
    if (!edge.source.startsWith("input_") || edge.source === "input_1") {
      continue;
    }
    const targetType = nodeTypeOf.get(edge.target);
    if (targetType === PLAN_CODE_NODE_TYPE || targetType === undefined) {
      continue;
    }
    const inputIndex = Number(edge.source.slice("input_".length)) - 1;
    const input = plan.inputs[inputIndex];
    problems.push(
      `input "${input?.name ?? edge.source}" lands on "${edge.targetHandle}" of ${targetType}: only a Code step can take a second input, as inputs.${edge.targetHandle}.`
    );
  }

  if (plan.outputs.length > 1) {
    problems.push(
      `the plan declares ${plan.outputs.length} outputs, but every output receives the last step's one value; declare one output.`
    );
  }

  const checkCode = options.checkCode;
  if (checkCode) {
    plan.steps.forEach((step, index) => {
      if (
        step.node_type !== PLAN_CODE_NODE_TYPE ||
        !isString(step.code) ||
        step.code.trim().length === 0
      ) {
        return;
      }
      const nodeId = nodeOfStep.get(step.id);
      const handles = {
        inputs:
          nodeId === undefined
            ? (step.code_inputs ?? [PLAN_CODE_INPUT])
            : wiredInto(nodeId),
        output: step.code_outputs?.[0] ?? PLAN_CODE_OUTPUT
      };
      for (const problem of checkCode(step.code, handles)) {
        problems.push(`step ${index + 1} ("${step.title}") ${problem}.`);
      }
    });
  }
  return problems;
}

export interface PlannerMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RefineWorkflowPlanOptions {
  /** The system prompt and the task, as the first planner call takes them. */
  messages: readonly PlannerMessage[];
  /**
   * One structured planner call. Resolves the decoded answer object, or null
   * when the model produced none.
   */
  generate: (
    messages: readonly PlannerMessage[]
  ) => Promise<Record<string, unknown> | null>;
  /** Applied to every parsed plan before it is checked. */
  normalize?: (plan: WorkflowSetupPlan) => WorkflowSetupPlan;
  check: (plan: WorkflowSetupPlan) => string[];
  /** Planner calls in all, the first draft included. */
  maxRounds?: number;
}

export interface RefinedWorkflowPlan {
  /** The plan with the fewest problems, or null when no answer was a plan. */
  plan: WorkflowSetupPlan | null;
  /** What is still wrong with `plan`. Empty when it passed. */
  problems: string[];
  rounds: number;
}

export const WORKFLOW_PLAN_MAX_ROUNDS = 3;

/** The plan as the model wrote it: the ids are the parser's, not the model's. */
const planAsAnswer = (plan: WorkflowSetupPlan): string =>
  JSON.stringify({
    ...plan,
    steps: plan.steps.map(({ id: _id, ...step }) => step)
  });

/**
 * Plan, check, and send the problems back until the plan passes.
 *
 * A creator should review a plan that builds, not repair one after a run
 * failed. Each round hands the model its own previous answer and the checker's
 * findings, and asks for the whole plan again. The loop stops on the first
 * plan with no problems, or after `maxRounds` calls with the best plan seen.
 */
export async function refineWorkflowPlan(
  options: RefineWorkflowPlanOptions
): Promise<RefinedWorkflowPlan> {
  const maxRounds = Math.max(1, options.maxRounds ?? WORKFLOW_PLAN_MAX_ROUNDS);
  const messages: PlannerMessage[] = [...options.messages];
  let best: RefinedWorkflowPlan = { plan: null, problems: [], rounds: 0 };

  for (let round = 1; round <= maxRounds; round += 1) {
    const raw = await options.generate(messages);
    const parsed = parseWorkflowPlan(raw);
    const plan = parsed && options.normalize ? options.normalize(parsed) : parsed;
    const problems = plan
      ? options.check(plan)
      : ["The answer was not a plan of {inputs, steps, outputs}."];
    if (
      plan &&
      (best.plan === null || problems.length < best.problems.length)
    ) {
      best = { plan, problems, rounds: round };
    }
    best.rounds = round;
    if (plan && problems.length === 0) {
      return best;
    }
    messages.push(
      {
        role: "assistant",
        content: plan ? planAsAnswer(plan) : JSON.stringify(raw ?? null)
      },
      {
        role: "user",
        content: [
          "This plan would build a workflow that fails:",
          ...problems.map((problem) => `- ${problem}`),
          "",
          "Return the whole corrected plan. Copy node types exactly from the",
          `candidate list, or use a Code step ("${PLAN_CODE_NODE_TYPE}") with its body in code.`
        ].join("\n")
      }
    );
  }
  return best;
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
      inputs: [
        {
          name: "rows",
          type: "string",
          sample: "product,setting\nceramic mug,a sunlit kitchen counter\nleather wallet,a dark walnut desk"
        }
      ],
      steps: [
        {
          id: "prompt",
          title: "Compose the shot prompts",
          summary: "Parse the CSV and emit one shot prompt per row.",
          node_type: PLAN_CODE_NODE_TYPE,
          code: [
            'import { parse } from "@nodetool-ai/sandbox-csv";',
            "",
            "for (const row of await parse(inputs.input)) {",
            "  const subject = Object.values(row).filter(Boolean).join(\", \");",
            '  await emit("output", `Studio product photo: ${subject}`);',
            "}"
          ].join("\n")
        },
        {
          id: "render",
          title: "Render the shot",
          summary: "Generate the product image for the row.",
          node_type: "nodetool.image.TextToImage",
          model_role: "image"
        }
      ],
      outputs: [{ name: "shot", type: "image" }]
    }
  },
  {
    id: "notes-to-post",
    brief: "Turn rough notes into a blog post",
    plan: {
      inputs: [{ name: "notes", type: "string" }],
      steps: [
        {
          id: "points",
          title: "Pull out the key points",
          summary: "Reduce the notes to the points the post should make.",
          node_type: "nodetool.agents.Summarizer",
          model_role: "language"
        },
        {
          id: "write",
          title: "Write the post",
          summary: "Draft a blog post from the key points.",
          node_type: "nodetool.agents.Agent",
          model_role: "language"
        }
      ],
      outputs: [{ name: "post", type: "string" }]
    }
  }
];
