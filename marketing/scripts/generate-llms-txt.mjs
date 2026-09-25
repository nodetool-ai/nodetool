/**
 * llms.txt generator — regenerate the link-index sections from the page-data
 * registry so `public/llms.txt` never drifts from the sitemap.
 *
 * The preamble prose (what NodeTool is, license/pricing) is hand-written and
 * kept here as a constant. Everything below "## Key pages" — key pages,
 * comparisons, use cases, FAQ, ideas, recipes — is derived from the data modules, so a
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
import { recipeEntries } from "../src/data/recipes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "..", "public/llms.txt");
const PUBLIC_DIR = resolve(__dirname, "..", "public");
const BASE_URL = "https://nodetool.ai";

// --- Preamble prose (hand-written; edit here) --------------------------------
const PREAMBLE = `# NodeTool

> NodeTool is an open-source creative workspace with agents and editable projects. Studio is the free desktop edition for production work. Cloud is a hosted browser edition in alpha for evaluation and lightweight access. Use supported local models in Studio or connect supported remote providers with your own accounts. Licensed AGPL-3.0.

## What NodeTool is

- Agents can operate the workflow and project editors, with tool calls, results, errors, and interventions available for inspection. Compatible external agents can use the tools over MCP.
- A visual, node-based editor for building AI workflows: connect models and tools as nodes on a canvas instead of writing glue code.
- Two editions of one open-source codebase: **Studio**, a free desktop app for macOS, Windows, and Linux, and **Cloud**, a hosted browser edition currently in alpha.
- Planning agents: give an agent a goal and it plans the steps, picks a model or tool, and executes multi-step tasks on the canvas.
- Native nodes for image, video, audio, and text generation and editing — masks, inpaint, outpaint, relight, upscale, compositing — plus RAG/vector search and custom code nodes.
- Connect accounts for supported remote providers, or use supported local inference through Ollama, MLX, llama.cpp, vLLM, and LM Studio in Studio.

## License and pricing

- Source license: AGPL-3.0. Self-hostable. Repository: https://github.com/nodetool-ai/nodetool
- Studio is free. Current Cloud alpha access is free; future Cloud pricing has not been announced.
- Provider charges are separate: connect your own supported provider accounts and pay those providers directly. NodeTool does not issue credits or add a provider-price markup.`;

// --- Derived link sections ---------------------------------------------------

/** A short blurb per key page, keyed by route (falls back to entry.description). */
const KEY_PAGE_BLURBS = {
  "/": "what NodeTool is, the agent-first model, Studio vs Cloud.",
  "/studio": "the recommended desktop edition for production work and editable projects.",
  "/cloud": "the hosted browser edition for evaluation while in alpha.",
  "/pricing": "edition comparison and how BYOK pricing works.",
  "/agents": "build and inspect automation that produces editable workflows and projects.",
  "/developers": "The QuickJS sandbox, the node DSL inside it, and how agents drive NodeTool from sandboxed code.",
  "/marketing": "hand a brief to an agent; campaign assets at volume.",
};

const KEY_PAGE_LABELS = {
  "/": "Home",
  "/studio": "Studio",
  "/cloud": "Cloud",
  "/pricing": "Pricing",
  "/agents": "Agents",
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
    description: "Open-source agent-first creative workspace.",
    body: `NodeTool is an open-source agent-first creative workspace. Create and edit images, video, audio, and text with agents that work alongside you. Describe what you want, let the agent build it, then take over whenever you like. You get an editable project, not just a finished file: your workflows, assets, and edits stay together. Every editor is exposed to [agents](${BASE_URL}/agents.md) as tools: an agent can build the workflow, run it, and repair what fails. The canvas connects image, video, audio, language, agent, and data models on a node-based graph.

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
    description: "The local-first, agent-first NodeTool desktop application.",
    body: `NodeTool Studio is the free desktop edition of NodeTool for macOS, Windows, and Linux. It runs workflows on your machine and can use supported local models or remote providers. Agents can build and revise workflows, and compatible external agents can use the tools over MCP.

Use Studio when you need local execution, offline work, or control of workflow files and provider credentials.

See the [installation guide](https://docs.nodetool.ai/installation.md) for supported platforms and setup.`,
  },
  "cloud.md": {
    title: "NodeTool Cloud",
    description: "The hosted browser edition of NodeTool.",
    body: `NodeTool Cloud is the hosted browser edition of NodeTool, currently in alpha. It is intended for evaluation and lightweight access without a desktop installation. Enabled models, storage behavior, and availability can change during the alpha. Use Studio for production work.

Cloud uses hosted project storage and supported remote providers connected through your own accounts. Current alpha access is free; future pricing has not been announced. See [pricing](${BASE_URL}/pricing.md) and [technical documentation](https://docs.nodetool.ai/llms.txt) for current details.`,
  },
  "developers.md": {
    title: "NodeTool Developer Platform",
    description:
      "One QuickJS sandbox runs every Code node body, saved script, and agent action \u2014 with the node catalog and the platform reachable by import.",
    body: `Every piece of JavaScript NodeTool did not write itself runs in one QuickJS WebAssembly isolate: a Code node body, a saved JS script, and every action an agent takes. Same engine, same limits, same imports.

Inside the guest, capabilities are globals the host granted for that run (\`fetch\` behind an SSRF guard, a contained \`workspace\`, scoped secrets, media and canvas bridges), and libraries are imports from 38 shipped packs. Two of those packs are NodeTool's own node catalog: \`@nodetool-ai/sandbox-flow\` calls 424 node types as async functions, and \`@nodetool-ai/sandbox-dsl\` builds a workflow graph you can validate, save, and open in the editor.

Agents drive NodeTool through the same surface. An agent step acts by writing a program, not by emitting a JSON tool call: the model sees one provider tool, \`execute_code({code})\`, and reaches 208 platform tools across 33 namespaces as imports from \`@nodetool-ai/sandbox-nodetool/*\`.

Read the [sandbox reference](https://docs.nodetool.ai/javascript-sandbox), the [CLI](https://docs.nodetool.ai/cli.md) for the validate/run/test loop, the [node catalog](https://docs.nodetool.ai/nodes/catalog.json) for node schemas, and the [developer guide](https://docs.nodetool.ai/developer/index.md) to write custom nodes.`,
  },
  "agents.md": {
    title: "NodeTool Agents",
    description:
      "Agents build and revise editable workflows, apps, and projects.",
    body: `NodeTool agents can operate editable workflows, apps, and projects through tools exposed by its editors. You can inspect tool calls, results, errors, and interventions, then revise and reuse the workflow. Compatible external agents can use the tools over MCP.

Read the [agent documentation](https://docs.nodetool.ai/agents/index.md) for installation, schema discovery, validation, execution, and job monitoring.`,
  },
  "pricing.md": {
    title: "NodeTool Pricing",
    description: "Studio is free; current Cloud alpha access is free.",
    body: `NodeTool Studio is free and open source under AGPL-3.0. Current NodeTool Cloud alpha access is free; future Cloud pricing has not been announced. In both editions, provider charges are separate: connect supported provider accounts and pay those providers directly.`,
  },
  "marketing.md": {
    title: "NodeTool for Marketing Teams",
    description: "Hand the brief to an agent; get campaign assets at volume.",
    body: `NodeTool helps marketing teams turn a brief into repeatable workflows for campaign visuals, product videos, social assets, and research — an agent builds the workflow from the brief and runs it at campaign volume. Workflows can be shared as focused mini-app interfaces while preserving the underlying graph.`,
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

function recipesSection() {
  const lines = [
    link(
      "Recipes hub",
      "/recipes",
      "step-by-step recipes using guided Storyboard and Script setup, with real UI captures and example media."
    ),
  ];
  for (const recipe of recipeEntries) {
    lines.push(link(recipe.name, recipe.route, recipe.outcome));
  }
  return `## Recipes\n\n${lines.join("\n")}`;
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
      recipesSection(),
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
