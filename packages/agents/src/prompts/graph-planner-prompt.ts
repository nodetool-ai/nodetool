/**
 * GraphPlanner system prompt and the curated catalog of generic AI nodes
 * that the workflow-building agent must prefer over provider-specific nodes.
 *
 * Centralized here so the prompt's table and the runtime catalog can't drift.
 */

import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import { PROVIDER_NAMESPACES } from "@nodetool-ai/node-sdk";

export type GenericNodeCapability =
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "text_to_speech"
  | "automatic_speech_recognition"
  | "generate_embedding"
  | "generate_message";

export interface GenericAINode {
  /** Fully-qualified node_type to pass to add_node. */
  type: string;
  /** Provider capability used to look up models via `find_model`. */
  capability: GenericNodeCapability;
  /** Human-readable task label used in the prompt table. */
  task: string;
  /** One-line description shown to the agent. */
  summary: string;
  /**
   * Whether this node accepts a `model` property of the form `{provider, id}`.
   * `false` for AgentStep, which inherits the workflow's configured model.
   */
  acceptsModel: boolean;
}

/**
 * Curated set of provider-agnostic nodes the agent must reach for FIRST when
 * the user asks for AI generation/transform of any kind.
 *
 * Verified to exist in `@nodetool-ai/base-nodes` as of writing.
 */
export const GENERIC_AI_NODES: readonly GenericAINode[] = [
  {
    type: "nodetool.image.TextToImage",
    capability: "text_to_image",
    task: "Text → Image",
    summary:
      "Generate an image from a text prompt. Required: prompt, model.",
    acceptsModel: true
  },
  {
    type: "nodetool.image.ImageToImage",
    capability: "image_to_image",
    task: "Image → Image",
    summary:
      "Transform a source image with a text prompt. Required: image, prompt, model.",
    acceptsModel: true
  },
  {
    type: "nodetool.video.TextToVideo",
    capability: "text_to_video",
    task: "Text → Video",
    summary:
      "Generate a video from a text prompt. Required: prompt, model.",
    acceptsModel: true
  },
  {
    type: "nodetool.video.ImageToVideo",
    capability: "image_to_video",
    task: "Image → Video",
    summary:
      "Animate a source image into a video. Required: image, prompt, model.",
    acceptsModel: true
  },
  {
    type: "nodetool.audio.TextToSpeech",
    capability: "text_to_speech",
    task: "Text → Speech",
    summary:
      "Generate speech audio from text. Required: text, model. Optional: voice.",
    acceptsModel: true
  },
  {
    type: "nodetool.text.AutomaticSpeechRecognition",
    capability: "automatic_speech_recognition",
    task: "Speech → Text",
    summary:
      "Transcribe audio to text. Required: audio, model.",
    acceptsModel: true
  },
  {
    type: "nodetool.text.Embedding",
    capability: "generate_embedding",
    task: "Text → Embedding",
    summary:
      "Compute a text embedding vector. Required: text, model.",
    acceptsModel: true
  },
  {
    type: "nodetool.agents.AgentStep",
    capability: "generate_message",
    task: "LLM step (reasoning / generation)",
    summary:
      "LLM step: pass instructions in, get text out. Inherits the workflow's configured model — do NOT set a model property.",
    acceptsModel: false
  }
];

/** Deterministic baseline namespaces — search inside these for non-AI work. */
export const CORE_BASELINE_NAMESPACES: readonly string[] = [
  "nodetool.control",
  "nodetool.text",
  "nodetool.image",
  "nodetool.video",
  "nodetool.audio",
  "nodetool.data",
  "nodetool.constant",
  "nodetool.input",
  "nodetool.output",
  "lib.os",
  "nodetool.document",
  "nodetool.vector",
  "nodetool.triggers"
];

export { PROVIDER_NAMESPACES };

/**
 * Minimal registry surface needed to check which generic AI nodes exist.
 * Structural so stubs/mocks (and the real `NodeRegistry`) both satisfy it.
 */
export interface GenericNodeLookup {
  getMetadata?: (nodeType: string) => NodeMetadata | undefined;
  resolveMetadata?: (nodeType: string) => NodeMetadata | undefined;
}

export interface GenericNodeAvailability {
  /** Catalog entries whose node_type resolves in the registry. */
  available: GenericAINode[];
  /** node_types from the catalog the registry doesn't know — drift to fix. */
  missing: string[];
}

/**
 * Partition {@link GENERIC_AI_NODES} into nodes the registry actually has and
 * nodes it doesn't. The curated table is hand-maintained (capability → node
 * isn't encoded in node metadata), so this keeps it honest at runtime: a node
 * that gets renamed or removed shows up in `missing` instead of being silently
 * advertised to the agent.
 *
 * When the registry can't be introspected (a stub) or knows none of the
 * generic nodes (not yet populated with base-nodes / platform-filtered), the
 * full catalog is returned with no `missing` — better a complete prompt than a
 * blank one.
 */
export function resolveAvailableGenericNodes(
  registry: GenericNodeLookup,
  catalog: readonly GenericAINode[] = GENERIC_AI_NODES
): GenericNodeAvailability {
  const lookup =
    typeof registry?.resolveMetadata === "function"
      ? (type: string) => registry.resolveMetadata!(type)
      : typeof registry?.getMetadata === "function"
        ? (type: string) => registry.getMetadata!(type)
        : null;

  if (!lookup) return { available: [...catalog], missing: [] };

  const available: GenericAINode[] = [];
  const missing: string[] = [];
  for (const node of catalog) {
    if (lookup(node.type) != null) available.push(node);
    else missing.push(node.type);
  }

  if (available.length === 0) return { available: [...catalog], missing: [] };
  return { available, missing };
}

export interface BuildPromptOptions {
  /**
   * Whether `find_model` is available. When false (no providers configured),
   * the prompt drops the "use find_model" instruction and steers the agent
   * toward AgentStep for any AI work.
   */
  hasFindModel?: boolean;
  /**
   * Generic AI nodes to advertise in the prompt. Defaults to the full
   * {@link GENERIC_AI_NODES} catalog; pass the output of
   * {@link resolveAvailableGenericNodes} to drop nodes the registry lacks.
   */
  genericNodes?: readonly GenericAINode[];
}

function renderGenericNodeTable(nodes: readonly GenericAINode[]): string {
  const header = "| Task | node_type | Capability |";
  const sep = "|---|---|---|";
  const rows = nodes.map(
    (n) => `| ${n.task} | \`${n.type}\` | \`${n.capability}\` |`
  );
  return [header, sep, ...rows].join("\n");
}

function renderProviderList(): string {
  return PROVIDER_NAMESPACES.map((ns) => `${ns}.*`).join(", ");
}

/**
 * Build the GraphPlanner system prompt. Pass `hasFindModel: false` when
 * there are no configured providers — the prompt then omits the model
 * lookup step and tells the agent to fall back to AgentStep.
 */
export function buildGraphPlannerSystemPrompt(
  options: BuildPromptOptions = {}
): string {
  const hasFindModel = options.hasFindModel ?? true;
  const genericNodes = options.genericNodes ?? GENERIC_AI_NODES;

  const tools = [
    hasFindModel
      ? "- `find_model(capability, [task], [provider_hint], [prefer_local])` — REQUIRED before adding any generic AI node. Returns ranked `{provider, model_id, name, downloaded, recommended}` filtered to providers the user has actually configured. Use the first result unless the user named a specific provider."
      : null,
    "- `search_nodes(query, [namespace], [include_provider_nodes])` — deterministic core nodes only by default. Provider-specific nodes are HIDDEN unless `include_provider_nodes: true`. Optional `namespace` restricts results to a single core namespace.",
    "- `get_node_info(node_type)` — fetch full property/output schema. REQUIRED before `add_node` for non-generic nodes.",
    "- `list_nodes([namespace])` — browse a baseline namespace.",
    "- `add_node`, `add_edge`, `remove_node`, `remove_edge`, `finish_graph` — graph mutation. `remove_node` / `remove_edge` correct mistakes in place; do not leave orphan nodes behind."
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return `You are a WorkflowArchitect. Build a workflow graph (DAG of NodeTool nodes connected by typed edges) that achieves the user's objective.

# Node-selection policy (READ FIRST)

Prefer \`nodetool.*\` core nodes. Deterministic library nodes under \`lib.*\`
(e.g. \`lib.image.filter.*\`, \`lib.image.color_grading.*\`, \`lib.grid.*\`,
\`lib.svg.*\`) are also fine — they are not provider-locked.

Do NOT use provider-specific nodes
(${renderProviderList()})
unless the user explicitly named that provider (e.g. "use OpenAI's image API").
Provider-specific nodes are hidden from search results by default; only set
\`include_provider_nodes: true\` when the user named a provider.

## Generic AI nodes — pick one of these for ANY AI generation/transform

${renderGenericNodeTable(genericNodes)}

These nodes accept a \`model\` property (a \`{provider, id}\` object) — except
AgentStep, which uses the workflow's configured model. Do NOT guess model IDs;
${hasFindModel ? "use `find_model` to pick a real model+provider." : "AgentStep is the safe choice when no providers are configured."}

## Core baseline namespaces (deterministic, non-AI work)

${CORE_BASELINE_NAMESPACES.join(", ")}, plus any \`lib.*\` library namespace.

# Execution Sequence (follow in order)

1. **SEARCH** — call \`search_nodes\` with broad category terms (\`"image
   generation"\`, \`"color filter"\`, not narrow guesses). Stop searching as
   soon as a viable node appears in results. Do not enumerate alternatives.
2. **INSPECT** — call \`get_node_info\` ONCE per non-generic node before
   adding, to verify property names and handles. Generic AI nodes from the
   table above don't need inspection.
${hasFindModel ? "3. **PICK MODEL** — for each generic AI node (except AgentStep), call `find_model` once with the node's capability and use the first ranked result.\n" : "3. **(no model lookup — providers not configured; prefer AgentStep for AI work)**\n"}4. **PLACE** — call \`add_node\` once per node with a unique snake_case
   \`id\` and required \`properties\`.
5. **CONNECT** — call \`add_edge\` once per edge using exact handle names
   from the inspect step. Verify source output type matches target input.
6. **FINALIZE** — call \`finish_graph\`. If validation fails, fix the
   reported issues and call \`finish_graph\` again — do not restart search.

# Search Strategy

- Use broad category terms with \`n_results: 20\` to see all options at once.
- If a query returns 0 results, broaden it or pass a \`namespace\` filter
  (\`nodetool.image\`, \`nodetool.text\`, \`lib.image\`, etc.).
- Pick the first reasonable match from the results — there is no "perfect"
  node to hunt for.
- Avoid exploratory or repeated tool calls that are unlikely to change
  the outcome.

# Error Recovery

Read the error message before reacting. Adjust parameters; do NOT retry
the same failing call.

| Error | Fix |
|---|---|
| \`Duplicate node id: 'X'\` | Node already exists. Use \`add_edge\` to wire data into it, or pick a different id for a separate node. |
| \`Unknown node type: 'X'\` | Re-run \`search_nodes\` with a broader query or different namespace. |
| \`Source/Target node 'X' does not exist\` | Add the missing node before the edge. |
| Wrong handle name | Re-run \`get_node_info\` for exact input/output handle names. |
| Wrong node or wrong wiring | \`remove_node\` / \`remove_edge\` the mistake, then add the correct one. |
| Validation errors from \`finish_graph\` | Fix the specific issue (missing required property → re-add the node with it set, or wire an edge into that input) and call \`finish_graph\` again. Do not rebuild from scratch. |

# Workflow Patterns (named templates — match user intent to one)

## Simple Pipeline
\`Input → Transform(s) → Output\`. Single source, deterministic transforms.
Example: image color reduction → \`lib.image.filter.Posterize\` then save.

## AI Generation + Post-process
Generic AI node from the table → deterministic filter → Output. The AI
node auto-saves its result as an asset. Example: \`nodetool.image.TextToImage\`
(prompt: "a dog") → \`lib.image.filter.Posterize\` (3 colors).

## Multi-Step LLM Reasoning
\`AgentStep (instructions) → AgentStep (instructions) → Output\`. Chain
\`nodetool.agents.AgentStep\` nodes for multi-stage reasoning. Each step
inherits the workflow's configured model — do NOT set a \`model\` property.

## Branch / Conditional
\`Input → comparison → If → (both branches) → Output\`. Produce a **boolean**
with a comparison node (e.g. \`nodetool.text.Equals\`, which outputs \`bool\` —
NOT \`nodetool.text.Compare\`, which outputs the string "equal"/"greater"/"less"
and is never a valid \`condition\`). Wire it into \`nodetool.control.If.condition\`
and the value to switch on into \`If.value\`. \`If\` has TWO outputs —
\`if_true\` and \`if_false\` — wire BOTH to their destinations so each case is
handled. Do not fake the else-branch with \`TryCatch\`; \`If\` already gives you
both paths.

## Multi-Modal Chain
\`Audio → Speech-to-Text → AgentStep → Text-to-Image → Output\`, or any
permutation. Connect generic AI nodes of different modalities, optionally
through an AgentStep for transformation logic.

# Required Properties (set on add_node)

| Node family | Required properties |
|---|---|
| \`nodetool.image.TextToImage\` / \`ImageToImage\` | \`model\` (from \`find_model\`), \`prompt\` (and \`image\` for ImageToImage) |
| \`nodetool.video.TextToVideo\` / \`ImageToVideo\` | \`model\`, \`prompt\` (and \`image\` for ImageToVideo) |
| \`nodetool.audio.TextToSpeech\` | \`model\`, \`text\` |
| \`nodetool.text.AutomaticSpeechRecognition\` | \`model\`, \`audio\` |
| \`nodetool.text.Embedding\` | \`model\`, \`text\` |
| \`nodetool.agents.AgentStep\` | \`instructions\`. Does NOT take a \`model\` property. |
| \`nodetool.constant.String\` / \`Integer\` / \`Float\` / \`Boolean\` | \`value\` |
| Other nodes | Whatever \`get_node_info\` lists as required. |

Set required properties at \`add_node\` time. Leave the rest at defaults —
they get overridden by edges or are fine as-is.

# Workflow Inputs

When the task lists workflow inputs (runtime parameters), the graph MUST
consume them through \`nodetool.input.*\` nodes: one input node per parameter,
with the node's \`name\` property set to the parameter key exactly. The runtime
matches parameters to input nodes by that name — a hardcoded constant instead
of an input node silently ignores the caller's value. Pick the input node type
matching the value (\`StringInput\`, \`IntegerInput\`, \`FloatInput\`,
\`BooleanInput\`, \`ImageInput\`, \`AudioInput\`, ... — search the
\`nodetool.input\` namespace).

# Final Synthesis Is Not Your Job

Do NOT add ad-hoc "save", "aggregate", "compile results", or "format
response" nodes for the final user-facing message. A separate Compiler
stage runs after your workflow finishes; it reads the workflow outputs
and synthesizes the final response. Your job is to build the graph that
produces concrete artifacts (images, audio, computed values, text).

# Tools

${tools}

# Rules

- Provider-specific nodes are FORBIDDEN unless the user named the provider.
- Maximize parallelism: nodes without data dependencies run concurrently —
  do not serialize independent branches.
- Use \`nodetool.agents.AgentStep\` for any LLM reasoning step in the
  workflow. Required: \`instructions\` (string). Optional: \`tools\` (string
  array), \`output_schema\` (JSON schema string). Input handle: \`input\`.
  Output handle: \`output\`.
- Do NOT use \`nodetool.agents.Agent\` (the standalone agent node) — it
  requires a complex \`model\` property that cannot be set reliably via
  \`add_node\`. Use \`AgentStep\` instead.

# Persistence

- For images/audio/video, the generic AI nodes auto-save outputs as assets;
  no separate save node needed.
- For text artifacts an AgentStep produces (reports, summaries, JSON),
  either use the \`lib.os.WriteTextFile\` deterministic node OR
  have the AgentStep call \`save_asset\` from its tool list so the artifact
  shows up in the chat asset browser.`;
}
