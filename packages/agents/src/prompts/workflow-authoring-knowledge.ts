/**
 * What an agent has to know to author a NodeTool workflow, independent of the
 * surface authoring it.
 *
 * The DSL pack's own SKILL.md and {@link GRAPH_DSL_PROMPT_SECTION} teach the
 * mechanics — how to import a namespace, wire a handle, and hand the graph to
 * `validate`/`create`/`run`. None of that says which node to reach for, which
 * properties a run fills in, or which of two similar nodes produces a value
 * the next node can use. That knowledge lives here, rendered once and shared
 * by the chat CodeAct prompt and the headless graph-authoring sub-agent, so
 * the two cannot drift. The chat carries the essentials
 * ({@link WORKFLOW_AUTHORING_KNOWLEDGE}); the sub-agent, which has no skills to
 * load, also gets the worked examples.
 *
 * The generic AI catalog lives here too: it is the list the prompt renders
 * and the list a registry check verifies, and keeping both against one array
 * is what stops the prompt from advertising a node that was renamed.
 */

import type { NodeMetadata } from "@nodetool-ai/node-sdk";
import { isFunction } from "../utils/type-guards.js";

export type GenericNodeCapability =
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "reference_to_video"
  | "text_to_speech"
  | "automatic_speech_recognition"
  | "generate_embedding"
  | "generate_message";

export interface GenericAINode {
  /** Fully-qualified node_type. */
  type: string;
  /** Provider capability used to look up models. */
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
 * Provider-agnostic nodes to reach for FIRST when the user asks for AI
 * generation or transformation of any kind.
 */
export const GENERIC_AI_NODES: readonly GenericAINode[] = [
  {
    type: "nodetool.image.TextToImage",
    capability: "text_to_image",
    task: "Text → Image",
    summary: "Generate an image from a text prompt. Required: prompt, model.",
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
    summary: "Generate a video from a text prompt. Required: prompt, model.",
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
    type: "nodetool.video.ReferenceToVideo",
    capability: "reference_to_video",
    task: "Reference → Video",
    summary:
      "Generate a video guided by ordered reference images and videos. Required: at least one reference image or video, prompt, model.",
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
    summary: "Transcribe audio to text. Required: audio, model.",
    acceptsModel: true
  },
  {
    type: "nodetool.text.Embedding",
    capability: "generate_embedding",
    task: "Text → Embedding",
    summary: "Compute a text embedding vector. Required: text, model.",
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
  "nodetool.code",
  "nodetool.constant",
  "nodetool.input",
  "nodetool.output",
  "lib.os",
  "nodetool.document",
  "nodetool.vector",
  "nodetool.triggers"
];

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
    isFunction(registry?.resolveMetadata)
      ? (type: string) => registry.resolveMetadata!(type)
      : isFunction(registry?.getMetadata)
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

function renderGenericNodeList(nodes: readonly GenericAINode[]): string {
  return nodes
    .map((n) => `- \`${n.type}\`: ${n.acceptsModel ? n.capability : "no model"}`)
    .join("\n");
}

/**
 * The rules a graph fails without: node choice, model refs, handles, inputs
 * and outputs, branching, and the Code node's dynamic handles.
 *
 * @param genericNodes the AI catalog to advertise; pass a registry-checked
 *   subset so the prompt never names a node this install lacks.
 */
export function renderWorkflowAuthoringEssentials(
  genericNodes: readonly GenericAINode[] = GENERIC_AI_NODES
): string {
  return `## Picking nodes
Never guess a node type. \`nodetool.nodes.search(["what the step does"])\` takes
a broad term ("image generation", not a class name), and a result's type is on
\`type\`. \`nodetool.nodes.info(type)\` gives its properties and handles. Use a
provider's own node only when the user named the provider
(\`{include_provider_nodes: true}\`).

For any AI generation or transform, use a generic node. Set its \`model\` to
the \`ref\` that \`nodetool.models.pick(capability)\` returns:
${renderGenericNodeList(genericNodes)}

## Wiring rules
- \`agent({system, prompt})\` is the LLM step and runs on the run's model, so
  omit \`model\`. Fixed instructions go in \`system\` and data is wired into
  \`prompt\`, since a handle cannot be interpolated into a string.
- A node with several outputs has no default handle: \`.output("text")\` on an
  Agent, \`.output("audio")\` on \`textToSpeech\`.
- An input node's \`name\` must equal the runtime parameter key exactly, with
  one typed input node per parameter (\`stringInput\`, \`imageInput\`, …).
  \`output({name, value})\` is the only output node.
- \`if_({condition, value})\` needs a real boolean. A string such as "greater"
  is always truthy. Wire both \`if_true\` and \`if_false\`.
- \`code\` and \`template\` take dynamic inputs: each extra property is an
  input handle, as in \`template({string: "About {{topic}}", topic:
  t.output()})\`. Each key a Code body returns is an output handle. Check
  \`list_js_scripts\` for a saved body, and never paste a value you fetched
  while authoring into one: the node has to fetch it when it runs.`;
}

/**
 * The essentials plus the worked examples, for the graph-authoring sub-agent.
 *
 * @param genericNodes the AI catalog to advertise; pass a registry-checked
 *   subset so the prompt never names a node this install lacks.
 */
export function renderWorkflowAuthoringKnowledge(
  genericNodes: readonly GenericAINode[] = GENERIC_AI_NODES
): string {
  return `${renderWorkflowAuthoringEssentials(genericNodes)}

Prefer \`nodetool.*\` core nodes and the deterministic \`lib.*\` nodes. Non-AI
work lives in ${CORE_BASELINE_NAMESPACES.map((ns) => `\`${ns}\``).join(", ")}
and the \`lib.*\` namespaces.

## Code nodes

A Code body is vanilla JavaScript in the QuickJS sandbox, with \`fetch\`,
\`workspace.*\`, \`crypto.*\`, \`format.*\`, \`image.*\`, \`parallelMap\`,
\`sleep\`, \`progress\` and \`nodetool.secrets.get\`. It reaches the same
server-side capabilities an \`execute_code\` action has, minus the browser-only
\`ui_*\` tools, by static import: \`import { run_apify_actor } from
"@nodetool-ai/sandbox-nodetool/apify";\`. If the call you need is not
available, say so rather than hard-coding a result.

\`\`\`js
import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
import { code } from "@nodetool-ai/sandbox-dsl/nodetool.code";
import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";

const orders = stringInput({ name: "orders" });
const totals = code({
  orders: orders.output(),
  code: [
    "const rows = JSON.parse(inputs.orders);",
    "return { total: rows.reduce((s, r) => s + r.amount, 0) };"
  ].join("\\n")
});
return workflow(output({ name: "total", value: totals.output("total") }));
\`\`\`

A library is a sandbox pack: list its specifier in the node's \`packages\`
property and \`import\` it at the top of the body. Nothing else resolves, and a
specifier this machine does not have fails validation. \`nodetool.packs.list()\`
reports what is installed and \`nodetool.packs.docs(specifier)\` serves a pack's
SKILL.md.

## Persistence

Generic AI nodes save images, audio and video as assets. Text an Agent step
produces is not saved: give a Code node a body that calls
\`await workspace.write(path, text)\`, or list \`save_asset\` in the Agent
node's tools.

## Patterns

- Pipeline: \`stringInput → posterize → output\`.
- Generation and post-process: \`textToImage({prompt, model}) →
  posterize({image, colors: 3}) → output\`.
- Multi-step reasoning: chained \`agent\` nodes, each reading the previous
  one's \`.output("text")\`.
- Branch: a boolean-producing node, then \`if_\` with both outputs wired.
- Multi-modal: \`audioInput → automaticSpeechRecognition → agent →
  textToImage → output\`.

Nodes with no data dependency between them run concurrently, so do not chain
independent branches.

\`\`\`js
import { workflow } from "@nodetool-ai/sandbox-dsl";
import { stringInput } from "@nodetool-ai/sandbox-dsl/nodetool.input";
import { agent } from "@nodetool-ai/sandbox-dsl/nodetool.agents";
import { output } from "@nodetool-ai/sandbox-dsl/nodetool.output";

const topic = stringInput({ name: "topic" });
const draft = agent({
  system: "Outline the topic the user gives you.",
  prompt: topic.output()
});
const polish = agent({
  system: "Rewrite the draft you are given so it flows well.",
  prompt: draft.output("text")
});
return workflow(output({ name: "result", value: polish.output("text") }));
\`\`\``;
}

/** The essentials over the full generic-AI catalog, for the chat workflow guide. */
export const WORKFLOW_AUTHORING_KNOWLEDGE = renderWorkflowAuthoringEssentials();
