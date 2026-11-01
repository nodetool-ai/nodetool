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
import {
  ALTERNATIVES_CATEGORY_ORDER,
  ALTERNATIVES_INTRO,
  competitorEntries,
  competitors,
} from "../src/data/competitorEntries.ts";
import { faqByCategory, faqEntries, faqForSurface } from "../src/data/faqEntries.ts";
import { solutionRegistryEntries } from "../src/data/landingEntries.ts";
import { postsByDate } from "../src/data/blogEntries.ts";
import { ideaCategories } from "../src/data/ideasEntries.ts";
import { recipeEntries } from "../src/data/recipes.ts";
import * as gamedev from "../src/data/gamedevPage.ts";
import * as video from "../src/data/videoEditorPage.ts";
import * as image from "../src/data/imageEditorPage.ts";
import * as mcp from "../src/data/mcpPage.ts";
import * as agents from "../src/data/agentsPage.ts";
import * as marketing from "../src/data/marketingPage.ts";
import * as studio from "../src/data/studioPage.ts";
import * as engines from "../src/data/gameEngineComparison.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "..", "public/llms.txt");
const PUBLIC_DIR = resolve(__dirname, "..", "public");
const BASE_URL = "https://nodetool.ai";

// --- Preamble prose (hand-written; edit here) --------------------------------
const PREAMBLE = `# NodeTool

> NodeTool is an open-source, agent-first creative workspace. Agents and people work in the same editors (node workflows, storyboards, a multi-track video timeline, sketches, scripts, 3D models, and a built-in 2D and 3D game engine), and the result stays an editable project. Studio is the free desktop edition for production work. Cloud is a hosted browser edition in alpha. Licensed AGPL-3.0.

## What NodeTool is

- Agents operate the editors through tools, and every tool call, result, and error is recorded for inspection. External agents (Claude Code, Codex, OpenCode, Cursor) use the same tools through the NodeTool MCP server: \`npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install\`.
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
  "/ai-image-editor": "layered image editing where one generated layer is regenerated without touching the rest.",
  "/ai-video-editor": "storyboard, shots, voiced script, and an editable multi-track timeline, built by an agent.",
  "/mcp": "the MCP server for Claude Code, Codex, OpenCode, and Cursor: install, tools, transports, and keys.",
  "/download": "installers for macOS, Windows, and Linux.",
  "/models": "every supported image, video, audio, and language model, by provider.",
  "/node-based-ai": "build AI workflows with nodes instead of prompts.",
  "/node-based-workflows": "node-based workflows you can check, run, and rerun.",
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
  "/ai-image-editor": "AI image editor",
  "/ai-video-editor": "AI video editor",
  "/mcp": "MCP server",
  "/download": "Download",
  "/models": "AI model directory",
  "/node-based-ai": "Node-based AI",
  "/node-based-workflows": "Node-based workflows",
};

function link(label, path, blurb) {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  return blurb ? `- [${label}](${url}): ${blurb}` : `- [${label}](${url})`;
}

function keyPagesSection() {
  const order = Object.keys(KEY_PAGE_LABELS);
  const lines = order
    .filter((route) => route === "/models" || staticEntries.some((e) => e.route === route && e.indexable))
    .map((route) => link(KEY_PAGE_LABELS[route], pagePath(route), KEY_PAGE_BLURBS[route]));
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

/** The Markdown mirror when the route has one, else the HTML page. */
function pagePath(route) {
  const filename = markdownPath(route).slice(1);
  return filename in MARKDOWN_PAGES ? markdownPath(route) : route;
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

This registers NodeTool as an MCP server in Claude Code, Codex, and OpenCode. For Cursor or another client, \`nodetool-mcp config\` prints the block to paste. The agent calls the game tools inside \`execute_code\` and looks at captured frames with \`view_image\`. The game skills appear in Claude Code as slash commands.

## Game assets, installed in the game

${gamedev.ASSETS_LEAD}

${gamedev.ASSET_KINDS.map((k) => `- **${k.title}**: ${k.body}`).join("\n")}

${gamedev.ASSET_NOTES.map((n) => `- ${n}`).join("\n")}

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

/** The /ai-image-editor page as Markdown, from its data module. */
function imageMarkdown() {
  return `${image.IMAGE_LEAD}

## Layers that know where they came from

${image.LAYER_FEATURES.map((f) => `- **${f.title}**: ${f.body}`).join("\n")}

## The same product in every image

${image.CONSISTENCY_POINTS.map((p) => `- ${p}`).join("\n")}

## Agent tools

${image.AGENT_TOOLS.map((t) => `- \`${t.name}\`: ${t.body}`).join("\n")}

## Good to know

${image.IMAGE_LIMITS.map((l) => `- ${l}`).join("\n")}

## Questions

${faqMarkdown(image.IMAGE_FAQ)}

## Read more

${linksMarkdown(image.IMAGE_LINKS)}`;
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

/** Renders FAQ rows pinned to a surface as Markdown questions. */
function surfaceFaqMarkdown(surface) {
  return faqForSurface(surface)
    .map((q) => `### ${q.question}\n\n${q.answerMd}`)
    .join("\n\n");
}

/** The /agents page as Markdown, from its data module. */
function agentsMarkdown() {
  return `${agents.AGENTS_LEAD}

## Build. Run. Inspect. Repair.

A chat assistant answers once and stops. Inside the harness, the agent works on a saved workflow, so it can see which step failed and fix that step.

${agents.LOOP_STAGES.map((s) => `- **${s.title}** (\`${s.tool}\`): ${s.body}`).join("\n")}

## Eight editors the agent can work in

The agent edits the same documents you open in Studio. When it stops, the work is already in the editor.

${agents.SURFACES.map((s) => `- **${s.title}**: ${s.body}`).join("\n")}

## Your models and your keys

${agents.CONTROLS.map((c) => `- **${c.title}**: ${c.body}`).join("\n")}

## Permission modes

${agents.APPROVAL_MODES_INTRO}

${agents.APPROVAL_MODES.map((m) => `- **${m.title}**: ${m.body}`).join("\n")}

## Connect your coding agent over MCP

\`\`\`bash
${mcp.MCP_INSTALL}
\`\`\`

${agents.MCP_STEPS.map((s) => `- **${s.title}**: ${s.body}`).join("\n")}

For Cursor, Claude Desktop, or another MCP client, run \`nodetool-mcp config\` and paste the block it prints. See ${BASE_URL}/mcp for every tool.

## Questions

${surfaceFaqMarkdown("agents")}`;
}

/** The /marketing page as Markdown, from its data module. */
function marketingMarkdown() {
  return `${marketing.MARKETING_LEAD}

## Start from a product page link

${marketing.FROM_LINK_INTRO}

${marketing.FROM_LINK_ROUTES.map((r) => `- **${r.title}**: ${r.body}`).join("\n")}

## See the work

- [Editable video ad templates](${BASE_URL}/ad-library): short vertical ad concepts, each with its beats, timing, copy budget, and a rendered example.
- [Example AI storyboards](${BASE_URL}/storyboards): finished commercials and films with every shot they were built from.
- [Guided recipes](${BASE_URL}/recipes): campaign kits, UGC videos, product commercials, and catalogue images, step by step.
- [AI video editor](${BASE_URL}/ai-video-editor.md): the storyboard and timeline the agent builds.`;
}

/** The /studio page as Markdown, from its data module. */
function studioMarkdown() {
  const facts = (items) => items.map((f) => `- **${f.term}**: ${f.description}`).join("\n");
  return `NodeTool Studio is the free desktop edition of NodeTool for macOS, Windows, and Linux.

## A brief becomes a project you can reopen

${studio.STUDIO_PROJECT}

## Your files. Your models. Your keys.

Studio keeps the project on your computer. It only goes online when you use an online AI provider or service.

${facts(studio.OWNERSHIP_FACTS)}

## Start with the setup you have

You do not need a powerful computer. Running AI models on your own machine is optional.

${facts(studio.SETUP_FACTS)}

## Questions

${surfaceFaqMarkdown("studio")}

See the [installation guide](https://docs.nodetool.ai/installation.md) for supported platforms and setup.`;
}

/** The /gamedev/ai-game-engines page as Markdown, from its data module. */
function enginesMarkdown() {
  const header = `| | ${engines.ENGINES.map((e) => e.name).join(" | ")} |`;
  const divider = `|---|${engines.ENGINES.map(() => "---").join("|")}|`;
  const rows = engines.COMPARISON_ROWS.map(
    (r) => `| ${r.label} | ${engines.ENGINES.map((e) => r.cells[e.key] ?? "").join(" | ")} |`
  ).join("\n");
  return `${engines.COMPARISON_LEAD}

Sources checked ${engines.SOURCES_CHECKED}.

${header}
${divider}
${rows}

## Which one to pick

${engines.RECOMMENDATIONS.map((r) => `- **${r.name}**: ${r.when}`).join("\n")}

## Where NodeTool differs

${engines.NODETOOL_DIFFERENCES.map((d) => `- ${d}`).join("\n")}

## What NodeTool does not do yet

${engines.NODETOOL_GAPS.map((g) => `- ${g}`).join("\n")}

## Questions

${faqMarkdown(engines.COMPARISON_FAQ)}

## Sources

${engines.ENGINE_SOURCES.map((src) => `- [${src.label}](${src.href})`).join("\n")}`;
}

/** The /alternatives hub as Markdown, grouped like the page. */
function alternativesMarkdown() {
  const groups = new Map();
  for (const c of competitors) {
    groups.set(c.category, [...(groups.get(c.category) ?? []), c]);
  }
  const rank = (category) => {
    const index = ALTERNATIVES_CATEGORY_ORDER.indexOf(category);
    return index === -1 ? ALTERNATIVES_CATEGORY_ORDER.length : index;
  };
  const sections = [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(
      ([category, items]) =>
        `## ${category}\n\n${items.map((c) => `- [NodeTool vs ${c.name}](${BASE_URL}/alternatives/${c.slug}): ${c.limitation}`).join("\n")}`
    );
  return `${ALTERNATIVES_INTRO}

## Games

- [AI game engines compared](${BASE_URL}/gamedev/ai-game-engines.md): NodeTool, Unity, Godot, Roblox Studio, Summer Engine, and Rosebud for agent-built games.

${sections.join("\n\n")}`;
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
    body: studioMarkdown(),
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
npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install
\`\`\`

For Cursor, Claude Desktop, or another MCP client, run \`nodetool-mcp config\` and paste the printed block into the client config. The desktop app is optional.

After the install, ask the agent for images, video, speech, transcripts, or a whole workflow in plain words. It saves files into the project and keeps a copy in the NodeTool asset library. Generation calls your own provider accounts at their list price.

Ask the agent to save the steps as a workflow. You can open the graph in Studio, change it, and run it again from the canvas, the CLI (\`nodetool run\`), or \`POST /api/workflows/<id>/run\`.

Read the [MCP setup guide](https://docs.nodetool.ai/mcp-server), the [workflow API](https://docs.nodetool.ai/workflow-api), the [JavaScript sandbox reference](https://docs.nodetool.ai/javascript-sandbox), and the [developer guide](https://docs.nodetool.ai/developer/) to write custom nodes.`,
  },
  "agents.md": {
    title: "NodeTool, the Open-Source Creative Harness",
    description:
      "The tools, editors, and limits an AI agent works inside for creative work.",
    body: agentsMarkdown(),
  },
  "pricing.md": {
    title: "NodeTool Pricing",
    description: "Studio is free; current Cloud alpha access is free.",
    body: `NodeTool Studio is free and open source under AGPL-3.0. Current NodeTool Cloud alpha access is free; future Cloud pricing has not been announced. In both editions, provider charges are separate: connect supported provider accounts and pay those providers directly.`,
  },
  "ai-image-editor.md": {
    title: "NodeTool AI Image Editor",
    description: image.IMAGE_DESCRIPTION,
    body: imageMarkdown(),
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
    title: "NodeTool for Advertising and Marketing",
    description: "Open-source AI ad software: from a product photo and a brief to an editable storyboard and timeline.",
    body: marketingMarkdown(),
  },
  "alternatives.md": {
    title: "Compare NodeTool with Other AI Creative Tools",
    description: "Every NodeTool comparison page, grouped by category.",
    body: alternativesMarkdown(),
  },
  "gamedev/ai-game-engines.md": {
    title: engines.COMPARISON_TITLE,
    description: engines.COMPARISON_DESCRIPTION,
    body: enginesMarkdown(),
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
    mkdirSync(dirname(output), { recursive: true });
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
  ["AI game engines compared", "/gamedev/ai-game-engines.md", "NodeTool, Unity, Godot, Roblox Studio, Summer Engine, and Rosebud for agent-built games, with sources."],
  ["Game Editor guide", "https://docs.nodetool.ai/game-editor", "scene tree, inspector, scripts, play mode, publishing, and export."],
  ["Native Game Engine reference", "https://docs.nodetool.ai/game-engine/", "game documents, scripts, physics, assets, agent authoring, and current coverage."],
  ["AI storyboard generator", "/storyboards", "turn a brief into scenes and shots, render each shot, and assemble a timeline. Example films with every shot shown."],
  ["Preset previews", "/presets", "camera move, look and effect presets, each with a short preview render and the model that made it."],
  ["Storyboard Editor guide", "https://docs.nodetool.ai/storyboard-editor", "scenes and shots, still and clip renders, takes, and assembling a timeline."],
  ["Video Editor guide", "https://docs.nodetool.ai/video-editor", "multi-track timeline editing and export."],
  ["Video ad templates", "/ad-library", "editable vertical video ad templates, each with beats, timing, and formats, and each shipped as a mini app."],
  ["Sketch Editor guide", "https://docs.nodetool.ai/sketch-editor", "layers, masks, AI layers, and inline image generation."],
  ["MCP server guide", "https://docs.nodetool.ai/mcp-server", "use NodeTool from Claude Code, Codex, OpenCode, or any MCP client."],
  ["All comparisons", "/alternatives.md", "every NodeTool comparison page, grouped by category."],
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

function solutionsSection() {
  const lines = solutionRegistryEntries
    .filter((e) => e.indexable)
    .map((e) => link(e.title.replace(/\s*[|—]\s*NodeTool$/, ""), e.route, e.description));
  return `## Solutions\n\n${lines.join("\n")}`;
}

function blogSection() {
  const lines = postsByDate.map((post) => link(post.headline, post.route, post.excerpt));
  return `## Blog\n\n${lines.join("\n")}`;
}

function render() {
  return (
    [
      PREAMBLE,
      keyPagesSection(),
      capabilitiesSection(),
      comparisonsSection(),
      useCasesSection(),
      solutionsSection(),
      faqSection(),
      ideasSection(),
      recipesSection(),
      blogSection(),
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
