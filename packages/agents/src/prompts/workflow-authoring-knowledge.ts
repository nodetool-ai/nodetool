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
 * the two cannot drift.
 *
 * The generic AI catalog lives here too: it is the table the prompt renders
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

function renderGenericNodeTable(nodes: readonly GenericAINode[]): string {
  const rows = nodes.map(
    (n) => `| ${n.task} | \`${n.type}\` | \`${n.capability}\` |`
  );
  return ["| Task | node_type | Capability |", "|---|---|---|", ...rows].join(
    "\n"
  );
}

/**
 * Render the shared knowledge section.
 *
 * @param genericNodes the AI catalog to advertise; pass a registry-checked
 *   subset so the prompt never names a node this install lacks.
 */
export function renderWorkflowAuthoringKnowledge(
  genericNodes: readonly GenericAINode[] = GENERIC_AI_NODES
): string {
  return `## Picking nodes

Never guess a node type. \`nodetool.nodes.search(["what the step does"])\`
with a broad category term ("image generation", "color filter" — not a guessed
class name), then \`nodetool.nodes.info(type)\` for the exact properties and
handles before you import that node's namespace.

Prefer \`nodetool.*\` core nodes. Deterministic library nodes under \`lib.*\`
(\`lib.image.filter.*\`, \`lib.image.color_grading.*\`, \`lib.grid.*\`,
\`lib.svg.*\`) are fine too — they are not provider-locked. Provider-specific
nodes are FORBIDDEN unless the user named that provider ("use OpenAI's image
API"); they are hidden from search results until you pass
\`{include_provider_nodes: true}\`.

### Generic AI nodes — one of these for ANY AI generation or transform

${renderGenericNodeTable(genericNodes)}

Each takes a \`model\` property (a \`{provider, id}\` object) except
\`nodetool.agents.Agent\`, which inherits the run's configured model when you
omit \`model\`. Do not invent model ids: \`nodetool.models.pick(capability)\`
returns one, and its \`ref\` field is the value the property wants.

Deterministic, non-AI work lives in ${CORE_BASELINE_NAMESPACES.join(", ")},
plus any \`lib.*\` namespace.

## Agent steps

\`agent({system, prompt})\` from \`nodetool.agents\` is the LLM step. Two rules
it fails on otherwise:

- **Omit \`model\`.** The run stamps its own model in at execution time; setting
  one pins the node to that model forever.
- **Read the text as \`.output("text")\`.** The node has \`text\`, \`chunk\`,
  \`thinking\` and \`audio\` handles and no default, so a bare \`.output()\`
  throws. The same holds for any multi-output node — \`textToSpeech\` needs
  \`.output("audio")\`.

Put the step's fixed instructions in \`system\` and wire the data into
\`prompt\`. That split is what lets an upstream value reach the step at all,
since a handle cannot be interpolated into a string.

## Inputs and outputs

An input node's \`name\` must equal the runtime parameter key **exactly** — the
runtime matches parameters to input nodes by that name, so a hardcoded constant
silently ignores what the caller passed. One input node per parameter, typed to
the value: \`stringInput\`, \`integerInput\`, \`floatInput\`, \`booleanInput\`,
\`imageInput\`, \`audioInput\`, … from \`nodetool.input\`.

\`nodetool.output.Output\` — \`output({name, value})\` — is the ONLY output
node. There is no \`StringOutput\`, \`ImageOutput\`, or any other per-type
variant. It takes any value, and \`name\` is the key the result comes back
under.

## Branching

\`if_({condition, value})\` from \`nodetool.control\` needs a real boolean on
\`condition\`. A node that reports an *ordering* as a string ("equal",
"greater", "less") is never a valid condition — it is truthy in every case.
Produce the boolean itself, e.g. a \`code\` node whose body is
\`return { output: inputs.a === inputs.b };\`, and wire that into
\`condition\`.

\`if_\` has TWO outputs, \`if_true\` and \`if_false\`, and emits only the taken
branch. Wire BOTH to their destinations so each case is handled; do not fake
the else-branch with an error handler.

## \`nodetool.code.Code\` — the general-purpose transform

\`code({...})\` runs vanilla JavaScript in the QuickJS sandbox. Reach for ONE
Code node when the step is data shaping, parsing, formatting, arithmetic or
string work — it replaces a chain of small nodes. Use a specialized node when
the step wraps a model, a device, or an external service.

- Before writing a body from scratch, call \`list_js_scripts\`: a saved script
  already does the job when one matches, and a script carrying \`palette\` is
  one of the user's own custom nodes.
- **Inputs** are dynamic: any property you pass that is not \`code\` or
  \`packages\` becomes an input handle, and the body reads it off the
  \`inputs\` object.
- **Outputs** are dynamic too: the body returns an object, and each key becomes
  an output handle you read with \`.output("key")\`.
- Sandbox API inside the body: \`fetch\`, \`workspace.*\`, \`crypto.*\`,
  \`format.*\`, \`image.*\`, \`parallelMap\`, \`sleep\`, \`progress\`,
  \`nodetool.secrets.get\`, plus core JavaScript.

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

### Libraries in a Code node

A library is a sandbox pack: list its specifier in the node's \`packages\`
property and \`import\` it at the top of the body. Nothing else resolves — no
\`require\`, no dynamic \`import()\`, and a specifier this machine does not
have fails validation. \`nodetool.packs.list()\` reports what is installed and
\`nodetool.packs.docs(specifier)\` serves a pack's SKILL.md. When a step needs a
library nobody installed, say so and build the closest thing the sandbox APIs
allow.

## Persistence

Generic AI nodes auto-save images, audio and video as assets — no separate save
node. Text an Agent step produces (a report, a summary, JSON) is not saved by
anything: either give a Code node a body that calls
\`await workspace.write(path, text)\`, or list \`save_asset\` in the Agent
node's tools so the artifact reaches the asset browser.

## Patterns

Match the request to one of these shapes before writing anything.

- **Simple pipeline** — \`input → transform(s) → output\`. One source,
  deterministic transforms: \`stringInput → posterize → output\`.
- **AI generation + post-process** — a generic AI node, then a deterministic
  filter, then \`output\`: \`textToImage({prompt, model}) →
  posterize({image, colors: 3}) → output\`.
- **Multi-step LLM reasoning** — chained \`agent\` nodes, each reading the
  previous one's \`.output("text")\`, instructions in \`system\` and data in
  \`prompt\`.
- **Branch** — a boolean-producing node → \`if_({condition, value})\` → both
  \`if_true\` and \`if_false\` wired onward.
- **Multi-modal chain** — \`audioInput → automaticSpeechRecognition → agent →
  textToImage → output\`, or any permutation. Generic AI nodes of different
  modalities connect through an Agent step when the middle needs reasoning.

Nodes with no data dependency between them run concurrently — do not serialize
independent branches by chaining them.

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

/** The knowledge section over the full generic-AI catalog. */
export const WORKFLOW_AUTHORING_KNOWLEDGE = renderWorkflowAuthoringKnowledge();
