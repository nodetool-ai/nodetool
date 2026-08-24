// Brand and developer assets from the positioning plan's Part 5 checklist:
// the MCP architecture diagram, the GitHub README banner, the headless flow
// SDK code card, and the five Product Hunt gallery slides.
//
// They are authored as SVG here, not drawn in a design tool, for one reason:
// every claim on them is a fact about this repo (the transport the MCP mount
// serves, the packages a flow import resolves to, the licence). When one of
// those changes, the asset changes in the same diff as the code.
//
// PNGs are rasterized from the same SVG with sharp, so the two never drift.
// Text renders in Inter when the machine has it and falls back to the system
// UI font otherwise — keep the type large enough that the fallback is fine.
//
// Usage:
//   node marketing/scripts/generate-brand-assets.mjs
//   node marketing/scripts/generate-brand-assets.mjs --only mcp-architecture

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARKETING_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(MARKETING_ROOT, "public");
const DIAGRAM_DIR = path.join(PUBLIC_DIR, "diagrams");
const PH_DIR = path.join(PUBLIC_DIR, "product-hunt");

/** The landing page's palette (src/app/page.tsx) and the promo theme. */
const BG = "#050810";
const PANEL = "#0f172a";
const BORDER = "#1e293b";
const BORDER_BRIGHT = "#334155";
const TEXT = "#f8fafc";
const DIM = "#94a3b8";
const FAINT = "#64748b";
const ROSE = "#fb7185";
const FUCHSIA = "#e879f9";
const AMBER = "#fcd34d";
const SKY = "#38bdf8";

const FONT =
  "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

/** XML-escape a caption. Every string on these assets goes through this. */
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const text = (x, y, s, { size = 20, fill = TEXT, weight = 400, anchor = "start", font = FONT, spacing } = {}) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${
    spacing ? ` letter-spacing="${spacing}"` : ""
  }>${esc(s)}</text>`;

const rect = (x, y, w, h, { r = 14, fill = PANEL, stroke = BORDER, strokeWidth = 1 } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;

/** A card with a title and a stack of lines. Returns SVG for the whole box. */
function card(x, y, w, h, title, lines, opts = {}) {
  const { accent = BORDER_BRIGHT, titleSize = 24, lineSize = 17 } = opts;
  const parts = [
    rect(x, y, w, h, { stroke: accent }),
    text(x + 26, y + 44, title, { size: titleSize, weight: 600 }),
  ];
  lines.forEach((line, i) => {
    parts.push(
      text(x + 26, y + 44 + 34 + i * 27, line, { size: lineSize, fill: DIM })
    );
  });
  return parts.join("\n  ");
}

/** A right-pointing connector between two cards. */
const arrow = (x1, y, x2, { color = BORDER_BRIGHT } = {}) =>
  `<path d="M ${x1} ${y} L ${x2 - 12} ${y}" stroke="${color}" stroke-width="2" fill="none" />
  <path d="M ${x2 - 14} ${y - 6} L ${x2} ${y} L ${x2 - 14} ${y + 6} Z" fill="${color}" />`;

const defs = `
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ROSE}" />
      <stop offset="50%" stop-color="${FUCHSIA}" />
      <stop offset="100%" stop-color="${AMBER}" />
    </linearGradient>
    <radialGradient id="glowA" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${FUCHSIA}" stop-opacity="0.20" />
      <stop offset="100%" stop-color="${FUCHSIA}" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glowB" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${SKY}" stop-opacity="0.16" />
      <stop offset="100%" stop-color="${SKY}" stop-opacity="0" />
    </radialGradient>
  </defs>`;

// ── MCP architecture diagram ────────────────────────────────────────────────
// Reads left to right: an MCP client, the transport it speaks, the mount, and
// the three things the mount reaches. Facts checked against
// packages/websocket/src/mcp-server.ts, scripts/build-mcpb.mjs, and
// docs/mcp-production.md.
function mcpArchitecture() {
  const W = 1600;
  const H = 900;
  const clients = [
    ["Claude Desktop", "installs nodetool.mcpb"],
    ["Codex · any CLI agent", "nodetool mcp install"],
    ["Cursor · any MCP client", "points at /mcp"],
  ];
  const clientY = [214, 350, 486];

  const groups = [
    {
      y: 132,
      h: 226,
      title: "Every editor, as tools",
      lines: [
        "Graph canvas · Timeline · Sketch",
        "Storyboard · Script & voice · 3D scene",
        "App builder",
        "",
        "The agent works the real editor. A person takes the wheel mid-edit.",
      ],
      accent: FUCHSIA,
    },
    {
      y: 392,
      h: 196,
      title: "Execution",
      lines: [
        "WorkflowRunner (actor kernel)",
        "QuickJS sandbox + 38 library packs",
        "FAL · Replicate · KIE · OpenAI · Anthropic · …",
      ],
      accent: SKY,
    },
    {
      y: 620,
      h: 158,
      title: "Library",
      lines: ["Workflows · mini-apps · assets", "Collections for RAG · cost ledger"],
      accent: AMBER,
    },
  ];

  const body = [
    `<rect width="${W}" height="${H}" fill="${BG}" />`,
    `<ellipse cx="820" cy="330" rx="620" ry="380" fill="url(#glowA)" />`,
    `<ellipse cx="300" cy="700" rx="480" ry="320" fill="url(#glowB)" />`,

    text(64, 88, "Drive NodeTool from your agent", { size: 44, weight: 600 }),
    text(64, 128, "One MCP server. Every studio surface, and the engine under it.", {
      size: 21,
      fill: DIM,
    }),

    text(64, 186, "MCP CLIENT", { size: 14, fill: FAINT, weight: 600, spacing: 2.4 }),
    ...clients.map(([name, how], i) =>
      card(64, clientY[i], 340, 100, name, [how], { titleSize: 21, lineSize: 16 })
    ),

    arrow(420, 400, 470),

    text(470, 186, "TRANSPORT", { size: 14, fill: FAINT, weight: 600, spacing: 2.4 }),
    card(470, 214, 300, 372, "NodeTool MCP server", [
      "streamable HTTP",
      "http://127.0.0.1:7777/mcp",
      "",
      "stdio ⇄ HTTP bridge",
      "one .mcpb, every OS",
      "",
      "bearer token for a",
      "deployed server",
      "",
      "offline: retries, then",
      "hot-attaches",
    ], { accent: FUCHSIA }),

    arrow(786, 400, 836),

    card(64, 620, 340, 182, "Same belt in-product", [
      "The chat agent inside NodeTool",
      "calls these tools too — an MCP",
      "client is a second front door,",
      "not a second implementation.",
    ], { titleSize: 21, lineSize: 16 }),

    text(836, 186, "WHAT IT REACHES", { size: 14, fill: FAINT, weight: 600, spacing: 2.4 }),
    ...groups.map((g) =>
      card(836, g.y, 700, g.h, g.title, g.lines, { accent: g.accent })
    ),

    text(
      64,
      848,
      "The mount lists a small direct tool set; the rest is reachable in the sandbox.",
      { size: 16, fill: FAINT }
    ),
    text(64, 874, "Catalog: nodetool://capabilities · Guest surface: nodetool://sandbox", {
      size: 16,
      fill: FAINT,
      font: MONO,
    }),
  ].join("\n  ");

  return { name: "mcp-architecture", width: W, height: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}\n  ${body}\n</svg>` };
}

// ── GitHub README banner ────────────────────────────────────────────────────
// The mark is inlined as a data URI rather than composited afterwards, so the
// SVG and the PNG rasterized from it are the same picture.
function githubBanner(markDataUri) {
  const W = 1280;
  const H = 640;
  const badges = ["AGPL-3.0", "Local-First", "BYOK", "MCP-Ready"];
  let bx = 96;
  const badgeSvg = badges
    .map((b) => {
      const w = 34 + b.length * 12.4;
      const el = [
        rect(bx, 470, w, 46, { r: 23, fill: "#0b1222", stroke: BORDER_BRIGHT }),
        text(bx + w / 2, 500, b, { size: 18, fill: DIM, anchor: "middle", weight: 500 }),
      ].join("\n  ");
      bx += w + 16;
      return el;
    })
    .join("\n  ");

  const body = [
    `<rect width="${W}" height="${H}" fill="${BG}" />`,
    `<ellipse cx="980" cy="180" rx="560" ry="380" fill="url(#glowA)" />`,
    `<ellipse cx="180" cy="600" rx="460" ry="300" fill="url(#glowB)" />`,
    text(96, 172, "NodeTool", { size: 40, weight: 600, spacing: -0.5 }),
    text(96, 292, "From prompt to final cut", { size: 74, weight: 600, fill: "url(#brand)" }),
    text(96, 372, "on one canvas.", { size: 74, weight: 600, fill: "url(#brand)" }),
    text(96, 428, "The open-source, agent-first creative studio.", { size: 26, fill: DIM }),
    badgeSvg,
    text(96, 576, "github.com/nodetool-ai/nodetool", { size: 19, fill: FAINT, font: MONO }),
    `<image href="${markDataUri}" x="900" y="176" width="288" height="288" opacity="0.96" />`,
  ].join("\n  ");

  return { name: "github-banner", width: W, height: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}\n  ${body}\n</svg>` };
}

// ── Headless flow SDK code card ─────────────────────────────────────────────
// The body is a real `@nodetool-ai/sandbox-flow` program: the two imports the
// pack's SKILL.md requires, a node called as a function, and an emit.
function flowCodeCard() {
  const W = 1200;
  const H = 675;
  // One entry per line, each a list of [text, kind] tokens.
  const lines = [
    [['import ', "kw"], ['"@nodetool-ai/sandbox-nodetool/flow"', "str"], [";", "p"]],
    [
      ["import ", "kw"],
      ["{ concat }", "id"],
      [" from ", "kw"],
      ['"@nodetool-ai/sandbox-flow/nodetool.text"', "str"],
      [";", "p"],
    ],
    [],
    [
      ["const ", "kw"],
      ["joined", "id"],
      [" = ", "p"],
      ["await ", "kw"],
      ["concat", "fn"],
      ["({ a: inputs.left, b: inputs.right });", "p"],
    ],
    [["await ", "kw"], ["output", "fn"], ['("joined", joined.output);', "p"]],
  ];
  const colors = { kw: FUCHSIA, str: AMBER, id: TEXT, fn: SKY, p: DIM };

  // Lay the tokens out on a fixed grid: a 0.6em advance is close enough for a
  // monospace card, and it keeps this free of a text-measuring dependency.
  const size = 21;
  const advance = size * 0.6;
  const spans = [];
  lines.forEach((tokens, row) => {
    let col = 0;
    for (const [chunk, kind] of tokens) {
      spans.push(
        `<text x="${96 + col * advance}" y="${262 + row * 40}" font-family="${MONO}" font-size="${size}" fill="${colors[kind]}" xml:space="preserve">${esc(chunk)}</text>`
      );
      col += chunk.length;
    }
  });

  const body = [
    `<rect width="${W}" height="${H}" fill="${BG}" />`,
    `<ellipse cx="1000" cy="120" rx="480" ry="300" fill="url(#glowA)" />`,
    text(96, 96, "Call a node like a function", { size: 40, weight: 600 }),
    text(96, 140, "Await is the edge. A variable is the wire. Promise.all is the fan-out.", {
      size: 21,
      fill: DIM,
    }),
    rect(64, 190, W - 128, 250, { r: 18, fill: "#080d1a", stroke: BORDER_BRIGHT }),
    ...spans,
    text(96, 506, "424 nodes across 68 namespaces, generated as typed async functions.", {
      size: 20,
      fill: DIM,
    }),
    text(96, 546, "Streaming nodes carry .stream(inputs). Errors reject; try/catch is the supervisor.", {
      size: 20,
      fill: DIM,
    }),
    text(96, 586, "Every call passes the permission gate and bills through the run.", {
      size: 20,
      fill: DIM,
    }),
    text(96, 634, "@nodetool-ai/sandbox-flow", { size: 19, fill: FAINT, font: MONO }),
  ].join("\n  ");

  return { name: "code-card-flow-sdk", width: W, height: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}\n  ${body}\n</svg>` };
}

// ── Product Hunt gallery slides ─────────────────────────────────────────────
// Five 16:9 slides, one claim each, every claim carrying a real screenshot.
// Product Hunt renders the gallery small, so the headline is set at 62px and
// no slide carries more than one supporting line.
const PH_W = 1270;
const PH_H = 760;

/** Downscale a `public/` screenshot and inline it, so the SVG stays small. */
async function shot(file, width) {
  const buf = await sharp(path.join(PUBLIC_DIR, file))
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** One slide: headline, one support line, a chip row, and a framed shot. */
function phSlide({ name, title, support, chips, image, fit = "xMidYMin slice" }) {
  const frameX = 96;
  const frameY = 300;
  const frameW = PH_W - frameX * 2;
  const frameH = PH_H - frameY - 64;
  const clip = `phclip-${name}`;
  let chipX = 96;
  const chipRow = chips.map((label) => {
    const w = 22 + label.length * 10.2;
    const part = `${rect(chipX, 214, w, 40, { r: 20, fill: "rgba(148,163,184,0.10)", stroke: BORDER_BRIGHT })}
  ${text(chipX + w / 2, 240, label, { size: 16, fill: DIM, anchor: "middle" })}`;
    chipX += w + 12;
    return part;
  });

  const body = [
    `<rect width="${PH_W}" height="${PH_H}" fill="${BG}" />`,
    `<ellipse cx="${PH_W * 0.18}" cy="0" rx="620" ry="360" fill="url(#glowA)" />`,
    `<ellipse cx="${PH_W * 0.9}" cy="${PH_H}" rx="560" ry="320" fill="url(#glowB)" />`,
    `<rect x="96" y="82" width="150" height="6" rx="3" fill="url(#brand)" />`,
    text(96, 158, title, { size: 62, weight: 600 }),
    text(96, 196, support, { size: 22, fill: DIM }),
    ...chipRow,
    `<clipPath id="${clip}"><rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="18" /></clipPath>`,
    `<image href="${image}" x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" preserveAspectRatio="${fit}" clip-path="url(#${clip})" />`,
    `<rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="18" fill="none" stroke="${BORDER_BRIGHT}" stroke-width="1.5" />`,
  ].join("\n  ");

  return {
    name,
    width: PH_W,
    height: PH_H,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${PH_W}" height="${PH_H}" viewBox="0 0 ${PH_W} ${PH_H}">${defs}\n  ${body}\n</svg>`,
  };
}

async function productHuntSlides() {
  const frameWidth = PH_W - 192;
  const specs = [
    {
      name: "ph-1-canvas",
      title: "From prompt to final cut on one canvas",
      support: "Open source, local-first, and driven by your own API keys.",
      chips: ["AGPL-3.0", "Local-first", "BYOK", "MCP-ready"],
      file: "screen_canvas.png",
    },
    {
      name: "ph-2-surfaces",
      title: "Seven editors, one workspace",
      support: "Graph · Timeline · Sketch · Storyboard · Script & voice · 3D · Mini apps",
      chips: ["Multi-track timeline", "Layered sketching", "glTF scenes"],
      file: "screen_storyboard.png",
    },
    {
      name: "ph-3-agents",
      title: "Agents drive the real editors",
      support: "Not a chat box beside the work — the same tools a person clicks.",
      chips: ["Plans a DAG", "Writes sandboxed JS", "You take the wheel"],
      file: "screen_chat.png",
    },
    {
      name: "ph-4-mcp",
      title: "Bring your own agent",
      support: "Claude Desktop, Codex, Cursor, or any MCP client, over one mount.",
      chips: ["Streamable HTTP", "One-file .mcpb", "Remote tokens"],
      file: "diagrams/mcp-architecture.png",
      // The diagram is a whole picture; cropping it cuts a card in half.
      fit: "xMidYMid meet",
    },
    {
      name: "ph-5-byok",
      title: "Your keys, direct pricing",
      support: "Every provider billed at its own rate. No markup, no seat tax.",
      chips: ["FAL", "Replicate", "OpenAI", "Anthropic", "Ollama", "MLX"],
      file: "screen_model_manager.png",
    },
  ];
  return Promise.all(
    specs.map(async ({ file, ...rest }) =>
      phSlide({ ...rest, image: await shot(file, frameWidth) })
    )
  );
}

const markDataUri = `data:image/png;base64,${(
  await readFile(path.join(PUBLIC_DIR, "logo.png"))
).toString("base64")}`;

const ASSETS = [
  { ...mcpArchitecture(), dir: DIAGRAM_DIR, png: true },
  // PNG only: the banner's SVG carries the mark inline, so it weighs a
  // megabyte and nothing renders it as SVG. Regenerate it from here instead.
  { ...githubBanner(markDataUri), dir: PUBLIC_DIR, png: true, svgToDisk: false },
  { ...flowCodeCard(), dir: DIAGRAM_DIR, png: true },
];

async function main() {
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];

  await mkdir(DIAGRAM_DIR, { recursive: true });
  await mkdir(PH_DIR, { recursive: true });

  const write = async (asset) => {
    if (only && asset.name !== only) return;
    if (asset.svgToDisk !== false) {
      const svgPath = path.join(asset.dir, `${asset.name}.svg`);
      await writeFile(svgPath, `${asset.svg}\n`, "utf8");
      console.log(`wrote ${path.relative(MARKETING_ROOT, svgPath)}`);
    }
    if (asset.png) {
      const pngPath = path.join(asset.dir, `${asset.name}.png`);
      await sharp(Buffer.from(asset.svg), { density: 144 })
        .resize(asset.width, asset.height)
        .png({ compressionLevel: 9 })
        .toFile(pngPath);
      console.log(`wrote ${path.relative(MARKETING_ROOT, pngPath)}`);
    }
  };

  for (const asset of ASSETS) await write(asset);

  // After the diagrams, never alongside them: slide 4 inlines the MCP diagram
  // PNG, so it has to read the copy this run just wrote.
  // PNG only — a slide's SVG carries a screenshot inline and weighs megabytes.
  for (const slide of await productHuntSlides()) {
    await write({ ...slide, dir: PH_DIR, png: true, svgToDisk: false });
  }
}

await main();
