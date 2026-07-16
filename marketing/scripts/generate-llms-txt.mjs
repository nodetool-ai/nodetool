/**
 * llms.txt generator — regenerate the link-index sections from the page-data
 * registry so `public/llms.txt` never drifts from the sitemap.
 *
 * The preamble prose (what NodeTool is, license/pricing) is hand-written and
 * kept here as a constant. Everything below "## Key pages" — key pages,
 * comparisons, use cases, FAQ, ideas — is derived from the data modules, so a
 * new page in the registry shows up here on the next run.
 *
 * Run with tsx (it imports the TypeScript data modules directly):
 *   npx tsx marketing/scripts/generate-llms-txt.mjs
 *   npx tsx marketing/scripts/generate-llms-txt.mjs --check   # fail if stale
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { staticEntries } from "../src/data/staticEntries.ts";
import { faqByCategory, faqEntries } from "../src/data/faqEntries.ts";
import { ideaCategories } from "../src/data/ideasEntries.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "..", "public/llms.txt");
const PUBLIC_DIR = resolve(__dirname, "..", "public");
const BASE_URL = "https://nodetool.ai";

// --- Preamble prose (hand-written; edit here) --------------------------------
const PREAMBLE = `# NodeTool

> NodeTool is the open-source creative AI workspace: a node-based canvas that wires image, video, audio, and text models from every major provider into one workflow, plus planning agents that run multi-step jobs on the same canvas. Bring your own API keys. Runs as a free desktop app (Studio) or in the browser (Cloud). Licensed AGPL-3.0.

## What NodeTool is

- A visual, node-based editor for building AI workflows: connect models and tools as nodes on a canvas instead of writing glue code.
- Two editions of one open-source codebase: **Studio**, a free desktop app for macOS, Windows, and Linux, and **Cloud**, the same app hosted in a browser (currently in alpha).
- Planning agents: give an agent a goal and it plans the steps, picks a model or tool, and executes multi-step tasks on the canvas.
- Native nodes for image, video, audio, and text generation and editing — masks, inpaint, outpaint, relight, upscale, compositing — plus RAG/vector search and custom code nodes.
- Model access is bring-your-own-key (BYOK): OpenAI, Anthropic, Gemini, Replicate, FAL, KIE, Mistral, Groq, Together, OpenRouter, HuggingFace, and more, plus local inference via Ollama, MLX, llama.cpp, vLLM, and LM Studio.

## License and pricing

- Source license: AGPL-3.0. Self-hostable. Repository: https://github.com/nodetool-ai/nodetool
- Studio is free. Cloud is a subscription for managed hosting (currently alpha; pricing is finalized at general availability).
- In both editions you bring your own provider API keys and pay providers directly at their list prices. NodeTool does not run inference on its own servers, does not issue credits, and does not mark up model calls.`;

// --- Derived link sections ---------------------------------------------------

/** A short blurb per key page, keyed by route (falls back to entry.description). */
const KEY_PAGE_BLURBS = {
  "/": "what NodeTool is, Studio vs Cloud, what you can build.",
  "/studio": "the free, open-source desktop app; local models, offline use.",
  "/cloud": "the hosted, browser-based edition (alpha).",
  "/pricing": "edition comparison and how BYOK pricing works.",
  "/agents": "building and running AI agents visually on the canvas.",
  "/creatives": "artists, motion designers, AI-native illustrators.",
  "/developers": "TypeScript SDK, REST API, custom nodes in TypeScript or Python.",
  "/marketing": "product videos, ad creative, and brand assets at campaign scale.",
};

const KEY_PAGE_LABELS = {
  "/": "Home",
  "/studio": "Studio",
  "/cloud": "Cloud",
  "/pricing": "Pricing",
  "/agents": "Agents",
  "/creatives": "For creatives",
  "/developers": "For developers",
  "/marketing": "For marketing teams",
};

function link(label, path, blurb) {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  return blurb ? `- [${label}](${url}): ${blurb}` : `- [${label}](${url})`;
}

function keyPagesSection() {
  const order = Object.keys(KEY_PAGE_LABELS);
  const lines = order
    .filter((route) => staticEntries.some((e) => e.route === route && e.indexable))
    .map((route) => link(KEY_PAGE_LABELS[route], markdownPath(route), KEY_PAGE_BLURBS[route]));
  // Docs live off-site (docs.nodetool.ai) — not in the registry, appended here.
  lines.push(
    link(
      "Documentation",
      "https://docs.nodetool.ai/llms.txt",
      "install guides, key concepts, node reference, API reference, CLI."
    )
  );
  return `## Key pages\n\n${lines.join("\n")}`;
}

function markdownPath(route) {
  return route === "/" ? "/index.md" : `${route}.md`;
}

const MARKDOWN_PAGES = {
  "index.md": {
    title: "NodeTool",
    description: "The open-source creative AI workspace.",
    body: `NodeTool is an open-source visual workspace for building and running AI workflows. It connects image, video, audio, language, agent, and data models on a node-based canvas.

## Editions

- [NodeTool Studio](${BASE_URL}/studio.md) is the free desktop application for macOS, Windows, and Linux.
- [NodeTool Cloud](${BASE_URL}/cloud.md) is the hosted browser application.

## Start here

- [Product overview](${BASE_URL}/index.md)
- [Developer platform](${BASE_URL}/developers.md)
- [Technical documentation](https://docs.nodetool.ai/llms.txt)
- [GitHub repository](https://github.com/nodetool-ai/nodetool)`,
  },
  "studio.md": {
    title: "NodeTool Studio",
    description: "The local-first NodeTool desktop application.",
    body: `NodeTool Studio is the free desktop edition of NodeTool for macOS, Windows, and Linux. It runs workflows locally and can use local models or provider API keys.

Use Studio when you need local execution, offline work, or control of workflow files and provider credentials.

See the [installation guide](https://docs.nodetool.ai/installation.md) for supported platforms and setup.`,
  },
  "cloud.md": {
    title: "NodeTool Cloud",
    description: "The hosted browser edition of NodeTool.",
    body: `NodeTool Cloud is the hosted browser edition of NodeTool. It provides the same workflow canvas without a desktop installation.

Cloud uses bring-your-own provider keys. See [pricing](${BASE_URL}/pricing.md) and [technical documentation](https://docs.nodetool.ai/llms.txt) for deployment and configuration details.`,
  },
  "developers.md": {
    title: "NodeTool Developer Platform",
    description: "Build, run, extend, and deploy NodeTool workflows with code.",
    body: `NodeTool provides a TypeScript SDK, CLI, HTTP and WebSocket APIs, custom-node APIs, and a deployable workflow runtime.

Use the [CLI](https://docs.nodetool.ai/cli.md) for automation, the [node catalog](https://docs.nodetool.ai/nodes/catalog.json) to discover node schemas, and the [developer guide](https://docs.nodetool.ai/developer/index.md) to extend NodeTool.`,
  },
  "agents.md": {
    title: "NodeTool Agents",
    description: "Build planning agents that use models, tools, and workflows.",
    body: `NodeTool agents plan multi-step tasks, call tools, and run workflows on the same visual canvas as media and data pipelines.

Read the [agent documentation](https://docs.nodetool.ai/agents/index.md) for installation, schema discovery, validation, execution, and job monitoring.`,
  },
  "pricing.md": {
    title: "NodeTool Pricing",
    description: "Studio is free; Cloud provides managed hosting.",
    body: `NodeTool Studio is free and open source under AGPL-3.0. NodeTool Cloud provides managed hosting. In both editions, users supply provider keys and pay model providers directly.`,
  },
  "creatives.md": {
    title: "NodeTool for Creatives",
    description: "A visual workspace for creative AI workflows.",
    body: `NodeTool lets creative teams combine image, video, audio, and language models in reusable visual workflows. It supports local and cloud models, editing tools, and provider keys that stay under the user's control.`,
  },
  "marketing.md": {
    title: "NodeTool for Marketing Teams",
    description: "Generate and adapt campaign assets with AI workflows.",
    body: `NodeTool helps marketing teams build repeatable workflows for campaign visuals, product videos, social assets, and research. Workflows can be shared as focused mini-app interfaces while preserving the underlying graph.`,
  },
};

function markdownPage({ title, description, body }, filename) {
  const canonicalPath = filename === "index.md" ? "/" : `/${filename.slice(0, -3)}`;
  return `---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\ncanonical: ${BASE_URL}${canonicalPath}\nmarkdown: ${BASE_URL}/${filename}\nproduct: NodeTool\n---\n# ${title}\n\n${body}\n`;
}

function writeMarkdownPages(check) {
  mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const [filename, page] of Object.entries(MARKDOWN_PAGES)) {
    const output = resolve(PUBLIC_DIR, filename);
    const next = markdownPage(page, filename);
    const current = existsSync(output) ? readFileSync(output, "utf8") : "";
    if (check && current !== next) {
      throw new Error(`public/${filename} is stale. Run: npm run seo:llms`);
    }
    if (!check) writeFileSync(output, next);
  }
}

function comparisonsSection() {
  const lines = staticEntries
    .filter((e) => e.route.startsWith("/vs/") && e.indexable)
    .map((e) => link(e.title, e.route));
  return `## Comparisons\n\n${lines.join("\n")}`;
}

function useCasesSection() {
  const lines = staticEntries
    .filter((e) => e.route.startsWith("/use-cases/") && e.indexable)
    .map((e) => link(e.title, e.route, e.description));
  return `## Use cases\n\n${lines.join("\n")}`;
}

function faqSection() {
  const lines = [link("FAQ hub", "/faq", "all questions, grouped by category.")];
  for (const group of faqByCategory) {
    for (const item of group.items) {
      lines.push(link(item.question, item.route));
    }
  }
  return `## FAQ\n\n${lines.join("\n")}`;
}

function ideasSection() {
  const lines = [link("Ideas hub", "/ideas", "workflow ideas grouped by category.")];
  for (const cat of ideaCategories) {
    lines.push(link(`${cat.label} ideas`, cat.route, cat.description));
  }
  return `## Ideas\n\n${lines.join("\n")}`;
}

function render() {
  return (
    [
      PREAMBLE,
      keyPagesSection(),
      comparisonsSection(),
      useCasesSection(),
      faqSection(),
      ideasSection(),
    ].join("\n\n") + "\n"
  );
}

function main() {
  const check = process.argv.includes("--check");
  const next = render();

  if (check) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
    if (current !== next) {
      console.error(
        "public/llms.txt is stale. Run: npx tsx marketing/scripts/generate-llms-txt.mjs"
      );
      process.exit(1);
    }
    writeMarkdownPages(true);
    console.log("public agent documentation is up to date.");
    return;
  }

  writeFileSync(OUT_FILE, next);
  writeMarkdownPages(false);
  console.log(
    `Wrote ${OUT_FILE} — ${faqEntries.length} FAQ rows, ${ideaCategories.length} idea categories.`
  );
}

main();
