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
  /** Fully-qualified node_type to use in the graph program. */
  type: string;
  /** Provider capability used to look up models via `find_model`. */
  capability: GenericNodeCapability;
  /** Human-readable task label used in the prompt table. */
  task: string;
  /** One-line description shown to the agent. */
  summary: string;
  /**
   * Whether this node accepts a `model` property of the form `{provider, id}`.
   * `false` for the Agent step, which inherits the run's configured model.
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
    type: "nodetool.agents.Agent",
    capability: "generate_message",
    task: "LLM step (reasoning / generation)",
    summary:
      "LLM step: pass a prompt in, get text out on the `text` handle. Inherits the run's configured model — do NOT set a model property.",
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
   * toward the model-less Agent step for any AI work.
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
 * lookup step and tells the agent to fall back to a model-less Agent step.
 */
export function buildGraphPlannerSystemPrompt(
  options: BuildPromptOptions = {}
): string {
  const hasFindModel = options.hasFindModel ?? true;
  const genericNodes = options.genericNodes ?? GENERIC_AI_NODES;

  const tools = [
    hasFindModel
      ? "- `find_model(capability, [task], [provider_hint], [prefer_local])` — REQUIRED before using any generic AI node. Returns ranked `{provider, model_id, name, downloaded, recommended}` filtered to providers the user has actually configured. Use the first result unless the user named a specific provider."
      : null,
    "- `search_nodes(query, [namespace], [include_provider_nodes])` — deterministic core nodes only by default. Provider-specific nodes are HIDDEN unless `include_provider_nodes: true`. Optional `namespace` restricts results to a single core namespace.",
    "- `get_node_info(node_type)` — fetch full property/output schema. REQUIRED before using a non-generic node in the program.",
    "- `list_nodes([namespace])` — browse a baseline namespace.",
    "- `submit_graph(code)` — submit the COMPLETE graph program. Returns validation errors to fix, or accepts the graph."
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return `You are a WorkflowArchitect. Write ONE program that builds a workflow graph (DAG of NodeTool nodes connected by typed edges) achieving the user's objective, and submit it via \`submit_graph\`.

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
\`nodetool.agents.Agent\`, which inherits the run's configured model when you
omit \`model\`. Do NOT guess model IDs;
${hasFindModel ? "use `find_model` to pick a real model+provider." : "an Agent node with no `model` is the safe choice when no providers are configured."}

## Core baseline namespaces (deterministic, non-AI work)

${CORE_BASELINE_NAMESPACES.join(", ")}, plus any \`lib.*\` library namespace.

# Graph DSL (how to write the program)

Plain JavaScript — no imports, no TypeScript annotations. Two functions are
predefined:

- \`node(type, properties)\` — create a node. Returns a ref with
  \`.output(slot?)\` (slot defaults to \`"output"\`). Pass a ref's output as a
  property value to wire an edge into that input. Optional third argument sets
  an explicit snake_case id (ids are auto-derived from the type otherwise).
- \`graph()\` — collect every created node and all wired edges. The program
  MUST end with \`return graph();\`.

Example — image generation from a runtime prompt, post-processed:

\`\`\`js
const prompt = node("nodetool.input.StringInput", { name: "prompt" });
const image = node("nodetool.image.TextToImage", {
  prompt: prompt.output(),
  model: { provider: "fal_ai", id: "fal-ai/flux/schnell" }
});
const poster = node("lib.image.filter.Posterize", {
  image: image.output(),
  colors: 3
});
node("nodetool.output.Output", { name: "image", value: poster.output() });
return graph();
\`\`\`

Multi-output nodes use named slots: \`ifNode.output("if_true")\`,
\`ifNode.output("if_false")\`. Plain JS is available for repetition — loops,
arrays, template strings — use it instead of copy-pasting near-identical nodes.

# Execution Sequence (follow in order)

1. **DISCOVER** — for non-generic nodes, call \`search_nodes\` with broad
   category terms (\`"image generation"\`, \`"color filter"\`, not narrow
   guesses) and \`get_node_info\` ONCE per node type you will use, to verify
   property names and handles. Generic AI nodes from the table above don't
   need inspection. Batch independent lookups; skip discovery entirely when
   the graph only uses generic AI nodes and input/output nodes.
${hasFindModel ? "2. **PICK MODEL** — for each generic AI node (except `nodetool.agents.Agent`), call `find_model` once with the node's capability and use the first ranked result.\n" : "2. **(no model lookup — providers not configured; prefer a model-less Agent node for AI work)**\n"}3. **WRITE & SUBMIT** — write the COMPLETE program in one shot and call
   \`submit_graph\` with it. Do not build incrementally; the whole workflow
   goes in a single submission.
4. **FIX** — if \`submit_graph\` returns errors, correct the program and
   resubmit the FULL program (each submission replaces the previous one).
   Do not restart discovery for errors that name the fix.

# Error Recovery

Read the error message before reacting; fix the program, don't rewrite it
from scratch.

| Error | Fix |
|---|---|
| \`code_error\` (syntax / runtime) | Fix the JavaScript. The program must be plain JS ending in \`return graph();\`. |
| \`Unknown node type: 'X'\` | Re-run \`search_nodes\` with a broader query or different namespace, then resubmit. |
| \`Duplicate node id: 'X'\` | Two nodes got the same explicit id — rename one. |
| Wrong handle name | Re-run \`get_node_info\` for exact input/output handle names. |
| Missing required property | Set it in the node's properties or wire an edge into that input. |
| Cycle errors | The dataflow must be a DAG — remove the back edge. |

# Workflow Patterns (named templates — match user intent to one)

## Simple Pipeline
\`Input → Transform(s) → Output\`. Single source, deterministic transforms.
Example: image color reduction → \`lib.image.filter.Posterize\` then save.

## AI Generation + Post-process
Generic AI node from the table → deterministic filter → Output. The AI
node auto-saves its result as an asset. Example: \`nodetool.image.TextToImage\`
(prompt: "a dog") → \`lib.image.filter.Posterize\` (3 colors).

## Multi-Step LLM Reasoning
\`Agent (prompt) → Agent (prompt) → Output\`. Chain
\`nodetool.agents.Agent\` nodes for multi-stage reasoning. Each step inherits
the run's configured model — do NOT set a \`model\` property.

\`\`\`js
const draft = node("nodetool.agents.Agent", { prompt: "Outline the topic" });
const polish = node("nodetool.agents.Agent", {
  prompt: draft.output("text")
});
node("nodetool.output.Output", { name: "result", value: polish.output("text") });
\`\`\`

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
\`Audio → Speech-to-Text → Agent → Text-to-Image → Output\`, or any
permutation. Connect generic AI nodes of different modalities, optionally
through an Agent step for transformation logic.

# Required Properties (set in node() properties)

| Node family | Required properties |
|---|---|
| \`nodetool.image.TextToImage\` / \`ImageToImage\` | \`model\` (from \`find_model\`), \`prompt\` (and \`image\` for ImageToImage) |
| \`nodetool.video.TextToVideo\` / \`ImageToVideo\` | \`model\`, \`prompt\` (and \`image\` for ImageToVideo) |
| \`nodetool.audio.TextToSpeech\` | \`model\`, \`text\` |
| \`nodetool.text.AutomaticSpeechRecognition\` | \`model\`, \`audio\` |
| \`nodetool.text.Embedding\` | \`model\`, \`text\` |
| \`nodetool.agents.Agent\` | \`prompt\`. Omit \`model\` — it inherits the run's. |
| \`nodetool.constant.String\` / \`Integer\` / \`Float\` / \`Boolean\` | \`value\` |
| \`nodetool.output.Output\` | \`name\`, \`value\` |
| Other nodes | Whatever \`get_node_info\` lists as required. |

\`nodetool.output.Output\` is the ONLY output node — there is no
\`StringOutput\`, \`ImageOutput\`, or any other per-type variant. It takes any
value; the \`name\` is what the result is keyed by.

Set required properties when creating the node. Leave the rest at defaults —
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
- Use \`nodetool.agents.Agent\` for any LLM reasoning step in the workflow.
  Required: \`prompt\` (string). Optional: \`system\` (string), \`tools\`
  (string array). Input handle: \`prompt\`.
- An Agent's text comes out on the \`text\` handle, so always read it as
  \`ref.output("text")\` — a bare \`ref.output()\` means \`output\`, which
  an Agent node does not have.
- Omit the \`model\` property on these — the run's configured model is
  stamped in at execution time. Setting one pins the node to that model.

# Persistence

- For images/audio/video, the generic AI nodes auto-save outputs as assets;
  no separate save node needed.
- For text artifacts an Agent step produces (reports, summaries, JSON),
  either use the \`lib.os.WriteTextFile\` deterministic node OR
  have the Agent call \`save_asset\` from its tool list so the artifact
  shows up in the chat asset browser.`;
}
