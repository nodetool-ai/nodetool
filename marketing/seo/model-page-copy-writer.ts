// Model Page Copy Writer — exported DSL for `npm run dev:nodetool -- run`.
//
// Slug + provider-coverage rows + pasted vendor facts -> a first-draft
// `/models/<slug>` page in Markdown (title/meta, blurb, capability facts, FAQ
// candidates), written to `marketing/seo/drafts/models/<slug>.md`.
//
// Human-edit gate: a human edits the draft into `modelEntries.ts` by hand.
// This workflow never touches `modelEntries.ts`. See ./README.md.
//
// To run: paste your inputs into the three `input.stringInput` values below,
// the `writer` agent uses OpenAI GPT-5 by default. Run this file with
// `npm run dev:nodetool -- run` from the repo root so the draft lands under
// `marketing/seo/drafts/models/`.
//
// The editor-importable graph — with the on-canvas explainer Comment node — is
// the sibling `model-page-copy-writer.json`. The Comment node is UI-only chrome
// with no runtime executor, so it is intentionally omitted from this runnable
// export.
import { agents, createNode, input, libOs, workflow, workflowsBase_node } from "@nodetool-ai/dsl";

// nodetool.text.Template takes dynamic {{ VAR }} inputs beyond its typed
// `string` field. The generated `text.template()` factory only types `string`,
// so the variable wires go through `createNode` — whose inputs are
// `Record<string, unknown>` — the same escape hatch `export-dsl` uses for
// nodes it can't fully type. Runtime behavior is identical to `text.template`.
type TemplateNode = { output: string };

// slug — nodetool.input.StringInput
const stringInput = input.stringInput({
  name: "model_slug",
  value: "flux-2",
  description: "URL slug for the model page (kebab-case). Becomes the draft filename and the {{ SLUG }} in the brief.",
  line_mode: "single_line"
});

// coverage — nodetool.input.StringInput
const stringInputNode = input.stringInput({
  name: "provider_coverage",
  value: "| Provider | Model id | Modality | Notes |\n| --- | --- | --- | --- |\n| Black Forest Labs | flux-2 | text-to-image | Native provider, latest FLUX.2 |\n| fal.ai | fal-ai/flux-2 | text-to-image, image-to-image | Hosted, fast queue |\n| Replicate | black-forest-labs/flux-2 | text-to-image | Pay-per-image |",
  description: "The provider-coverage rows for this model, pasted from the coverage table (which providers run it, under what id, for what modality).",
  line_mode: "multi_line"
});

// facts — nodetool.input.StringInput
const stringInputNode2 = input.stringInput({
  name: "vendor_facts",
  value: "Model: FLUX.2 by Black Forest Labs. Flagship open-weight text-to-image model, successor to FLUX.1. Strengths: photoreal detail, reliable text rendering inside images, strong prompt adherence, 4MP output. Supports image-to-image and inpainting. Released 2026. Runs on NodeTool via the Text To Image node with any provider that lists it. Good for: product shots, poster art with legible headlines, editorial hero images.",
  description: "Vendor facts pasted by the operator — capabilities, strengths, limits, release info. The writer only uses what you give it here; do not expect it to invent specs.",
  line_mode: "multi_line"
});

// brief — nodetool.text.Template
const template = createNode<TemplateNode>("nodetool.text.Template", {
  string: "You are drafting the `/models/{{ SLUG }}` page for NodeTool's marketing site. NodeTool is a visual AI workflow builder; a model page tells a searcher what the model does, which providers run it inside NodeTool, and answers the questions they'd ask before picking it.\n\nSlug: {{ SLUG }}\n\nProvider-coverage rows:\n{{ COVERAGE }}\n\nVendor facts (the ONLY source of truth — do not invent specs, benchmarks, or dates not given here):\n{{ FACTS }}\n\nReturn a Markdown draft, no preamble, in exactly this structure:\n\n1. A YAML front-matter block delimited by `---` with two keys: `title` (≤ 60 chars, includes the model name, reads like a real page title) and `description` (≤ 155 chars meta description, concrete, no hype).\n2. `## Blurb` — 2-3 sentences a human could paste as the page intro. What the model is, what it's best at, and that it runs in NodeTool across the providers below. Plain, specific, no marketing slop.\n3. `## Capability facts` — a bullet list of concrete facts drawn ONLY from the vendor facts and coverage rows: modality, notable strengths, output/limits, and one line per provider that runs it (provider — model id — modality). If a fact isn't in the inputs, leave it out.\n4. `## FAQ candidates` — 4-6 `**Q:** … / **A:** …` pairs a searcher would actually type (\"is {{ SLUG }} free\", \"how do I run {{ SLUG }} locally\", \"{{ SLUG }} vs …\"). Answer each in 1-2 sentences from the facts; if the facts don't settle it, say what NodeTool does (\"runs it through whichever provider you've keyed\") rather than guessing.\n5. `## Reviewer notes` — a short bullet list flagging anything you were unsure about or had to leave generic, so the human editor knows what to verify before this ships.\n\nWrite for the reader, not the crawler. The keyword is the model name; use it where it belongs and nowhere it doesn't.",
  SLUG: stringInput.output(),
  COVERAGE: stringInputNode.output(),
  FACTS: stringInputNode2.output()
}, { outputNames: ["output"], defaultOutput: "output" });

// writer — nodetool.agents.Agent
const agent = agents.agent({
  model: { provider: "openai", id: "gpt-5" },
  system: "You are a technical copywriter for a developer-facing AI product. You write model-page drafts that are accurate, concrete, and free of marketing slop. You never invent capabilities, benchmarks, prices, or dates — you only restate and organize the facts you are given, and you flag your own uncertainty for the human editor.",
  history: [],
  max_tokens: 16000,
  prompt: template.output()
});

// draft_path — nodetool.text.Template
const templateNode = createNode<TemplateNode>("nodetool.text.Template", {
  string: "marketing/seo/drafts/models/{{ SLUG }}.md",
  SLUG: stringInput.output()
}, { outputNames: ["output"], defaultOutput: "output" });

// save — lib.os.WriteTextFile
const writeTextFile = libOs.writeTextFile({
  encoding: "utf-8",
  append: false,
  content: agent.output("text"),
  path: templateNode.output()
});

// preview_draft — nodetool.workflows.base_node.Preview
const preview = workflowsBase_node.preview({
  name: "draft_markdown",
  value: agent.output("text")
});

// preview_path — nodetool.workflows.base_node.Preview
const previewNode = workflowsBase_node.preview({
  name: "written_path",
  value: writeTextFile.output()
});

export const modelPageCopyWriterWorkflow = workflow(preview, previewNode);
