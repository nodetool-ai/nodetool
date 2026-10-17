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
import { competitorEntries } from "../src/data/competitorEntries.ts";
import { faqByCategory, faqEntries } from "../src/data/faqEntries.ts";
import { ideaCategories } from "../src/data/ideasEntries.ts";
import { recipeEntries } from "../src/data/recipes.ts";
import * as gamedev from "../src/data/gamedevPage.ts";
import * as video from "../src/data/videoEditorPage.ts";
import * as mcp from "../src/data/mcpPage.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "..", "public/llms.txt");
const PUBLIC_DIR = resolve(__dirname, "..", "public");
const BASE_URL = "https://nodetool.ai";

// --- Preamble prose (hand-written; edit here) --------------------------------
const PREAMBLE = `# NodeTool

> NodeTool is an open-source, agent-first creative workspace. Agents and people work in the same editors (node workflows, storyboards, a multi-track video timeline, sketches, scripts, 3D models, and a built-in 2D and 3D game engine), and the result stays an editable project. Studio is the free desktop edition for production work. Cloud is a hosted browser edition in alpha. Licensed AGPL-3.0.

## What NodeTool is

- Agents operate the editors through tools, and every tool call, result, and error is recorded for inspection. External agents (Claude Code, Codex, OpenCode, Cursor) use the same tools through the NodeTool MCP server: \`npx -y --package=@nodetool-ai/cli nodetool mcp install\`.
- Video: an agent writes a storyboard, renders stills and clips, and assembles a multi-track timeline that a person keeps editing (trims, transitions, captions, takes, aspect-ratio versions). Export MP4, WebM, or a PNG sequence.
- Games: a built-in 2D and 3D game engine. Agents create and edit game documents, generate and install art and audio, playtest headlessly, and export a standalone web build or a desktop app project. People edit the same game in the Game Editor.
- A visual, node-based editor for building AI workflows: connect models and tools as nodes on a canvas instead of writing glue code.
- Two editions of one open-source codebase: **Studio**, a free desktop app for macOS, Windows, and Linux, and **Cloud**, a hosted browser edition currently in alpha.
- Planning agents: give an agent a goal and it plans the steps, picks a model or tool, and executes multi-step tasks on the canvas.
- Native nodes for image, video, audio, and text generation and editing — masks, inpaint, outpaint, relight, upscale, compositing — plus RAG/vector search and custom code nodes.
- Connect accounts for supported remote providers, or use supported local inference through Ollama, MLX, llama.cpp, vLLM, and LM Studio in Studio.

## License and pricing

- Source license: AGPL-3.0. Self-hostable. Repository: https://github.com/nodetool-ai/nodetool
- Studio is free. Current Cloud alpha access is free; future Cloud pricing has not been announced.
- Provider charges are separate: calls on your own provider accounts are billed by the provider at its price, with no NodeTool markup.`;

// --- Derived link sections ---------------------------------------------------

/** A short blurb per key page, keyed by route (falls back to entry.description). */
const KEY_PAGE_BLURBS = {
  "/": "what NodeTool is, the agent-first model, Studio vs Cloud.",
  "/studio": "the recommended desktop edition for production work and editable projects.",
  "/cloud": "the hosted browser edition for evaluation while in alpha.",
  "/pricing": "edition comparison and how BYOK pricing works.",
  "/agents": "build and inspect automation that produces editable workflows and projects.",
  "/developers": "connect NodeTool to your coding agent over MCP for images, video, speech, and workflows.",
  "/marketing": "hand a brief to an agent; campaign assets at volume.",
  "/gamedev": "the open-source 2D and 3D game engine agents build in: tools, editor, export, and limits.",
  "/ai-video-editor": "storyboard, shots, voiced script, and an editable multi-track timeline, built by an agent.",
  "/mcp": "the MCP server for Claude Code, Codex, OpenCode, and Cursor: install, tools, transports, and keys.",
};

const KEY_PAGE_LABELS = {
  "/": "Home",
  "/studio": "Studio",
  "/cloud": "Cloud",
  "/pricing": "Pricing",
  "/agents": "Agents",
  "/developers": "For developers",
  "/marketing": "For marketing teams",
  "/gamedev": "Game development",
  "/ai-video-editor": "AI video editor",
  "/mcp": "MCP server",
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

/** The /gamedev page as Markdown, from the same data module the page renders. */
function gamedevMarkdown() {
  const steps = gamedev.AGENT_STEPS.map((s) => `- **${s.title}** (\`${s.tool}\`): ${s.body}`).join("\n");
  const rows = gamedev.SPEC_ROWS.map((r) => `| ${r.feature} | ${r.twoD} | ${r.threeD} |`).join("\n");
  const faq = gamedev.GAMEDEV_FAQ.map((q) => `### ${q.question}\n\n${q.answer}`).join("\n\n");
  const links = gamedev.GAMEDEV_LINKS.map((l) => `- [${l.label}](${l.href})`).join("\n");
  return `${gamedev.GAMEDEV_LEAD}

Play the example games at ${BASE_URL}/gamedev.

## What the agent can do

${steps}

## Use it from Claude Code or Codex

\`\`\`bash
${gamedev.MCP_INSTALL_COMMAND}
\`\`\`

This registers NodeTool as an MCP server in Claude Code, Codex, and OpenCode. For Cursor or another client, \`nodetool mcp config\` prints the block to paste. The agent calls the game tools inside \`execute_code\` and looks at captured frames with \`view_image\`. The game skills appear in Claude Code as slash commands.

## The Game Editor

${gamedev.EDITOR_POINTS.map((p) => `- ${p}`).join("\n")}

## What is in the engine

${gamedev.ENGINE_NOTE}

| Feature | 2D games | 3D games |
|---|---|---|
${rows}

## What it does not do yet

${gamedev.LIMITS.map((l) => `- ${l}`).join("\n")}

${gamedev.LIMITS_SUMMARY} Compare engines: ${BASE_URL}/gamedev/ai-game-engines

## Questions

${faq}

## Read more

${links}`;
}

/** Renders a QaPair list as Markdown questions. */
function faqMarkdown(items) {
  return items.map((q) => `### ${q.question}\n\n${q.answer}`).join("\n\n");
}

function linksMarkdown(items) {
  return items.map((l) => `- [${l.label}](${l.href.startsWith("/") ? BASE_URL + l.href : l.href})`).join("\n");
}

/** The /ai-video-editor page as Markdown, from its data module. */
function videoMarkdown() {
  return `${video.VIDEO_LEAD}

## From brief to finished cut

${video.FLOW_STEPS.map((s) => `- **${s.title}**: ${s.body}`).join("\n")}

## The timeline

${video.TIMELINE_FEATURES.map((f) => `- ${f}`).join("\n")}

## Agent tools

These work in the built-in agent and over the MCP server (${BASE_URL}/mcp).

${video.AGENT_TOOLS.map((t) => `- \`${t.name}\`: ${t.body}`).join("\n")}

## Export

${video.EXPORT_ROWS.map((r) => `- **${r.target}**: ${r.detail}`).join("\n")}

## What it does not do yet

${video.VIDEO_LIMITS.map((l) => `- ${l}`).join("\n")}

${video.VIDEO_LIMITS_SUMMARY}

## Questions

${faqMarkdown(video.VIDEO_FAQ)}

## Read more

${linksMarkdown(video.VIDEO_LINKS)}`;
}

/** The /mcp page as Markdown, from its data module. */
function mcpMarkdown() {
  return `${mcp.MCP_LEAD}

## Install

\`\`\`bash
${mcp.MCP_INSTALL}
\`\`\`

${mcp.CLIENT_ROWS.map((r) => `- **${r.client}**: ${r.setup}`).join("\n")}

## What your agent can do

${mcp.CAPABILITY_GROUPS.map((g) => `- **${g.title}**: ${g.body}`).join("\n")}

## Direct tools

${mcp.DIRECT_TOOLS.map((t) => `- \`${t.name}\`: ${t.purpose}`).join("\n")}

Resources \`nodetool://capabilities\` and \`nodetool://sandbox\` describe everything reached through \`execute_code\`. Each skill is an MCP prompt, which Claude Code shows as a slash command.

## Transports

${mcp.TRANSPORT_ROWS.map((r) => `- **${r.mode}**: ${r.detail}`).join("\n")}

## Good to know

${mcp.MCP_LIMITS.map((l) => `- ${l}`).join("\n")}

## Questions

${faqMarkdown(mcp.MCP_FAQ)}

## Read more

${linksMarkdown(mcp.MCP_LINKS)}`;
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
    title: "NodeTool for Developers",
    description:
      "Connect NodeTool to Claude Code, Codex, OpenCode, or Cursor so your coding agent can make images, video, speech, and repeatable media workflows.",
    body: `NodeTool runs as a local MCP server. One command registers it with Claude Code, Codex, and OpenCode:

\`\`\`bash
npx -y --package=@nodetool-ai/cli nodetool mcp install
\`\`\`

For Cursor, Claude Desktop, or another MCP client, run \`nodetool mcp config\` and paste the printed block into the client config. The desktop app is optional.

After the install, ask the agent for images, video, speech, transcripts, or a whole workflow in plain words. It saves files into the project and keeps a copy in the NodeTool asset library. Generation calls your own provider accounts at their list price.

Ask the agent to save the steps as a workflow. You can open the graph in Studio, change it, and run it again from the canvas, the CLI (\`nodetool run\`), or \`POST /api/workflows/<id>/run\`.

Read the [MCP setup guide](https://docs.nodetool.ai/mcp-server), the [workflow API](https://docs.nodetool.ai/workflow-api), the [JavaScript sandbox reference](https://docs.nodetool.ai/javascript-sandbox), and the [developer guide](https://docs.nodetool.ai/developer/) to write custom nodes.`,
  },
  "agents.md": {
    title: "NodeTool, the Open-Source Creative Harness",
    description:
      "The tools, editors, and limits an AI agent works inside for creative work.",
    body: `NodeTool is an open-source creative harness: the tools, editors, models, keys, and run record an AI agent works inside. NodeTool agents can operate editable workflows, apps, and projects through tools exposed by its editors. You can inspect tool calls, results, errors, and interventions, then revise and reuse the workflow. Compatible external agents can use the tools over MCP.

Read the [agent documentation](https://docs.nodetool.ai/agents/index.md) for installation, schema discovery, validation, execution, and job monitoring.`,
  },
  "pricing.md": {
    title: "NodeTool Pricing",
    description: "Studio is free; current Cloud alpha access is free.",
    body: `NodeTool Studio is free and open source under AGPL-3.0. Current NodeTool Cloud alpha access is free; future Cloud pricing has not been announced. In both editions, provider charges are separate: connect supported provider accounts and pay those providers directly.`,
  },
  "ai-video-editor.md": {
    title: "NodeTool AI Video Editor",
    description: video.VIDEO_DESCRIPTION,
    body: videoMarkdown(),
  },
  "mcp.md": {
    title: "NodeTool MCP Server",
    description: mcp.MCP_DESCRIPTION,
    body: mcpMarkdown(),
  },
  "gamedev.md": {
    title: "NodeTool Game Development",
    description: gamedev.GAMEDEV_DESCRIPTION,
    body: gamedevMarkdown(),
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
  const lines = competitorEntries
    .filter((e) => e.indexable)
    .map((e) => link(e.title.replace(/\s*\|\s*NodeTool$/, ""), e.route));
  return `## Comparisons\n\n${lines.join("\n")}`;
}

/**
 * What each editor does, on the site and in the docs. Hand-written because a
 * capability page and its docs page are a pair the registry cannot infer.
 */
const CAPABILITY_LINKS = [
  ["Game development", "/gamedev", "the built-in 2D and 3D game engine: playable examples, what agents author, the Game Editor, and web export."],
  ["AI game engines compared", "/gamedev/ai-game-engines", "NodeTool, Unity, Godot, Roblox Studio, Summer Engine, and Rosebud for agent-built games, with sources."],
  ["Game Editor guide", "https://docs.nodetool.ai/game-editor", "scene tree, inspector, scripts, play mode, publishing, and export."],
  ["Native Game Engine reference", "https://docs.nodetool.ai/game-engine/", "game documents, scripts, physics, assets, agent authoring, and current coverage."],
  ["Storyboards", "/storyboards", "example storyboards: each film with every shot it was built from."],
  ["Storyboard Editor guide", "https://docs.nodetool.ai/storyboard-editor", "scenes and shots, still and clip renders, takes, and assembling a timeline."],
  ["Video Editor guide", "https://docs.nodetool.ai/video-editor", "multi-track timeline editing and export."],
  ["Ad library", "/ad-library", "social ad concepts with beats, timing, and formats, each buildable as an editable ad timeline."],
  ["Sketch Editor guide", "https://docs.nodetool.ai/sketch-editor", "layers, masks, AI layers, and inline image generation."],
  ["MCP server guide", "https://docs.nodetool.ai/mcp-server", "use NodeTool from Claude Code, Codex, OpenCode, or any MCP client."],
  ["All comparisons", "/alternatives", "every NodeTool comparison page, grouped by category."],
  ["Blog", "/blog", "guides, comparisons, and cost breakdowns for AI image, video, and audio work."],
];

function capabilitiesSection() {
  const lines = CAPABILITY_LINKS.map(([label, path, blurb]) => link(label, path, blurb));
  return `## Editors and capabilities\n\n${lines.join("\n")}`;
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
      capabilitiesSection(),
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
