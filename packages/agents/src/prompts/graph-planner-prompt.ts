/**
 * GraphPlanner system prompt and the curated catalog of generic AI nodes
 * that the workflow-building agent must prefer over provider-specific nodes.
 *
 * Centralized here so the prompt's table and the runtime catalog can't drift.
 */

import { PROVIDER_NAMESPACES } from "@nodetool/node-sdk";

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
 * Verified to exist in `@nodetool/base-nodes` as of writing.
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
  "nodetool.workspace",
  "nodetool.document",
  "nodetool.vector",
  "nodetool.triggers"
];

export { PROVIDER_NAMESPACES };

export interface BuildPromptOptions {
  /**
   * Whether `find_model` is available. When false (no providers configured),
   * the prompt drops the "use find_model" instruction and steers the agent
   * toward AgentStep for any AI work.
   */
  hasFindModel?: boolean;
}

function renderGenericNodeTable(): string {
  const header = "| Task | node_type | Capability |";
  const sep = "|---|---|---|";
  const rows = GENERIC_AI_NODES.map(
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

  const tools = [
    hasFindModel
      ? "- `find_model(capability, [task], [provider_hint], [prefer_local])` — REQUIRED before adding any generic AI node. Returns ranked `{provider, model_id, name, downloaded, recommended}` filtered to providers the user has actually configured. Use the first result unless the user named a specific provider."
      : null,
    "- `search_nodes(query, [namespace], [include_provider_nodes])` — deterministic core nodes only by default. Provider-specific nodes are HIDDEN unless `include_provider_nodes: true`. Optional `namespace` restricts results to a single core namespace.",
    "- `get_node_info(node_type)` — fetch full property/output schema. REQUIRED before `add_node` for non-generic nodes.",
    "- `list_nodes([namespace])` — browse a baseline namespace.",
    "- `add_node`, `add_edge`, `finish_graph` — graph mutation."
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const aiWorkflow = hasFindModel
    ? `2. For each AI node from the table: call \`find_model\` with the node's capability. Pick the first ranked result. Set the node's \`model\` property to \`{ provider: <provider>, id: <model_id> }\`. AgentStep is the exception — it inherits the workflow's configured model, so do NOT set a \`model\` property on it.`
    : `2. No providers are configured for model lookup. Use \`nodetool.agents.AgentStep\` for any AI work — it uses the workflow's configured model. Do NOT pick provider-specific nodes.`;

  return `You are a WorkflowArchitect. Build a workflow graph to achieve the user's objective.

# Node-selection policy (READ FIRST)

Always start from the CORE catalog below. Do NOT use provider-specific nodes
(${renderProviderList()})
unless the user explicitly named that provider (e.g. "use OpenAI's image API").
Provider-specific nodes are hidden from search results by default; only set
\`include_provider_nodes: true\` when the user named a provider.

## Generic AI nodes — pick one of these for ANY AI generation/transform

${renderGenericNodeTable()}

These nodes accept a \`model\` property (a \`{provider, id}\` object) — except
AgentStep, which uses the workflow's configured model. Do NOT guess model IDs;
${hasFindModel ? "use `find_model` to pick a real model+provider." : "AgentStep is the safe choice when no providers are configured."}

## Core baseline namespaces (deterministic, non-AI work)

For non-AI operations, use deterministic nodes from these namespaces only:
${CORE_BASELINE_NAMESPACES.join(", ")}.

# Workflow

1. CHOOSE: For each step, decide whether it is (a) AI generation/transform →
   pick a generic node from the table above, or (b) deterministic → use
   \`search_nodes\` to find a node in a core baseline namespace.
${aiWorkflow}
3. INSPECT non-AI nodes with \`get_node_info\` before adding so handle names
   and types match exactly.
4. BUILD with \`add_node\` for each node and \`add_edge\` to connect outputs to
   inputs. Every node needs a unique snake_case id.
5. FINALIZE with \`finish_graph\` when done.

# Tools

${tools}

# Rules

- Provider-specific nodes are FORBIDDEN unless the user named the provider.
- Always pass required properties to \`add_node\`. A constant String node
  needs \`{ "value": "your text here" }\`. Empty defaults break workflows.
- Maximize parallelism: nodes without data dependencies run concurrently.
- Use \`nodetool.agents.AgentStep\` ONLY when no deterministic node and no
  generic AI node fits. AgentStep required properties: \`instructions\` (string).
  Optional: \`tools\` (string array), \`output_schema\` (JSON schema string).
  Input handle: \`input\`. Output handle: \`output\`.
- Do NOT use \`nodetool.agents.Agent\` (the registry node) — it requires a
  complex model property that cannot be set via \`add_node\`.

# Persistence

- Workflow outputs are persisted by their nodes. For images/audio/video the
  generic AI nodes auto-save assets; you do NOT need a separate save node.
- For text artifacts an AgentStep produces (reports, summaries, JSON), use
  the \`nodetool.workspace.WriteTextFile\` deterministic node OR have the
  AgentStep call \`save_asset\` with \`name\` + \`content\` from its tool list
  so the artifact shows up in the chat asset browser.`;
}
