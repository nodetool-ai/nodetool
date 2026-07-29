// Generates marketing/src/data/templateEntries.generated.ts from the shipped
// example workflows in packages/base-nodes/nodetool/examples/nodetool-base/*.json.
//
// The generated module is checked in and consumed by the /templates/* routes.
// Regenerate with `npm run gen:templates`; CI fails if it is stale (the
// generator re-runs and `git diff` must be clean). Matching card art from
// packages/base-nodes/nodetool/assets/nodetool-base/<name>.jpg is copied into
// marketing/public/templates/<slug>.jpg.
//
// Index gate: a template with a boilerplate description (< 80 chars) or no
// matching thumbnail is emitted with indexable:false (noindex + kept out of the
// sitemap and smoke walk), but its page still builds.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const MARKETING = path.resolve(__dirname, "..");

const EXAMPLES_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base",
);
const ASSETS_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/assets/nodetool-base",
);
const PUBLIC_TEMPLATES = path.join(MARKETING, "public/templates");
const OUT_FILE = path.join(MARKETING, "src/data/templateEntries.generated.ts");

const MIN_DESCRIPTION = 80;
const DEFAULT_NODE_WIDTH = 280;

/** Kebab-case slug, matching the rest of the marketing routes. */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Humanize a node type ("nodetool.image.TextToImage" → "Text To Image"). */
function humanizeType(type) {
  const leaf = String(type).split(".").pop() || String(type);
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

// ReactFlow edge className / node data type → the flow palette key used by
// FlowNode's handle colors (see components/flow/tokens.ts).
function normalizeColor(className) {
  const c = String(className || "").toLowerCase();
  const map = {
    str: "string",
    string: "string",
    text: "string",
    int: "int",
    integer: "int",
    float: "float",
    number: "number",
    bool: "bool",
    boolean: "bool",
    image: "image",
    video: "video",
    audio: "audio",
    model: "model",
    file: "file",
    list: "list",
    dict: "dict",
    tensor: "tensor",
    event: "event",
    task: "task",
  };
  return map[c] || "any";
}

// Ordered category rules — first match wins. Keyed off tags + name so the hub
// groups templates into a handful of human sections.
const CATEGORY_RULES = [
  { category: "Video", keys: ["video", "trailer", "animation", "film"] },
  {
    category: "Audio & Music",
    keys: ["audio", "music", "podcast", "transcribe", "speech", "voice"],
  },
  {
    category: "Image & Design",
    keys: [
      "image",
      "design",
      "brand",
      "mockup",
      "photo",
      "concept-art",
      "thumbnail",
      "poster",
      "art",
    ],
  },
  {
    category: "Marketing & Content",
    keys: [
      "marketing",
      "seo",
      "content",
      "social",
      "advertising",
      "outreach",
      "sales",
      "writing",
    ],
  },
  {
    category: "Agents & Research",
    keys: [
      "agent",
      "agents",
      "research",
      "search",
      "wikipedia",
      "hackernews",
      "youtube",
      "news",
      "analysis",
      "automation",
    ],
  },
  {
    category: "Learning & Productivity",
    keys: ["education", "learning", "flashcards", "planning", "tutorial"],
  },
];

function categorize(tags, name) {
  const haystack = [...tags.map((t) => t.toLowerCase()), name.toLowerCase()];
  for (const rule of CATEGORY_RULES) {
    if (rule.keys.some((k) => haystack.some((h) => h.includes(k)))) {
      return rule.category;
    }
  }
  return "Text & Data";
}

/** Collect plain text out of a Lexical rich-text tree (Comment nodes). */
function lexicalToText(node) {
  if (!node || typeof node !== "object") return "";
  let out = "";
  if (typeof node.text === "string") out += node.text;
  const kids = node.children || (node.root ? [node.root] : null);
  if (Array.isArray(kids)) {
    for (const k of kids) out += (out && !out.endsWith(" ") ? " " : "") + lexicalToText(k);
  } else if (node.root) {
    out += lexicalToText(node.root);
  }
  return out;
}

function clamp(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** Best-effort short preview line for a node body. */
function nodeSubtitle(node) {
  const d = node.data || {};
  if (typeof d.value === "string" && d.value.trim()) return clamp(d.value, 140);
  if (typeof d.prompt === "string" && d.prompt.trim()) return clamp(d.prompt, 140);
  if (typeof d.system_prompt === "string" && d.system_prompt.trim())
    return clamp(d.system_prompt, 140);
  if (d.model && typeof d.model === "object") {
    const m = d.model.id || d.model.name || d.model.repo_id;
    if (m) return clamp(String(m), 60);
  }
  return undefined;
}

function buildGraph(rawGraph) {
  const rawNodes = Array.isArray(rawGraph?.nodes) ? rawGraph.nodes : [];
  const rawEdges = Array.isArray(rawGraph?.edges) ? rawGraph.edges : [];

  const nodes = rawNodes.map((n) => {
    const ui = n.ui_properties || {};
    const pos = ui.position || { x: 0, y: 0 };
    const isComment = String(n.type || "").endsWith("Comment");
    const node = {
      id: n.id,
      type: n.type,
      title: humanizeType(n.type),
      x: Math.round(pos.x ?? 0),
      y: Math.round(pos.y ?? 0),
      width: Math.round(ui.width ?? DEFAULT_NODE_WIDTH),
    };
    if (isComment) {
      node.isComment = true;
      const text = clamp(lexicalToText(n.data?.comment), 220);
      if (text) node.subtitle = text;
    } else {
      const sub = nodeSubtitle(n);
      if (sub) node.subtitle = sub;
    }
    return node;
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = rawEdges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      source: e.source,
      sourceHandle: e.sourceHandle || "output",
      target: e.target,
      targetHandle: e.targetHandle || "input",
      color: normalizeColor(e.ui_properties?.className),
    }));

  return { nodes, edges };
}

function nodeTypeList(rawNodes) {
  const counts = new Map();
  for (const n of rawNodes) {
    const type = String(n.type || "");
    if (type.endsWith("Comment")) continue; // annotations, not workflow steps
    const prev = counts.get(type);
    if (prev) prev.count += 1;
    else counts.set(type, { type, label: humanizeType(type), count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

function main() {
  const files = fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  fs.mkdirSync(PUBLIC_TEMPLATES, { recursive: true });

  const entries = [];
  const seenSlugs = new Set();
  const copiedThumbs = new Set();

  for (const file of files) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8"),
    );
    const name = (raw.name || file.replace(/\.json$/, "")).trim();
    let slug = slugify(name);
    if (seenSlugs.has(slug)) slug = `${slug}-${entries.length}`;
    seenSlugs.add(slug);

    const description = (raw.description || "").trim();
    const tags = Array.isArray(raw.tags) ? raw.tags : [];
    const rawNodes = Array.isArray(raw.graph?.nodes) ? raw.graph.nodes : [];

    // Copy matching card art into public/templates/<slug>.jpg if it exists.
    const assetPath = path.join(ASSETS_DIR, `${name}.jpg`);
    let thumbnail = null;
    if (fs.existsSync(assetPath)) {
      const destName = `${slug}.jpg`;
      fs.copyFileSync(assetPath, path.join(PUBLIC_TEMPLATES, destName));
      thumbnail = `/templates/${destName}`;
      copiedThumbs.add(destName);
    }

    const indexable = description.length >= MIN_DESCRIPTION && thumbnail !== null;
    const nodeTypes = nodeTypeList(rawNodes);
    const category = categorize(tags, name);

    entries.push({
      route: `/templates/${slug}`,
      title: `${name} — NodeTool AI Workflow Template`,
      description:
        description ||
        `${name}: a ready-to-run NodeTool AI workflow you can open, edit, and run with your own keys.`,
      priority: indexable ? 0.6 : 0.3,
      changeFrequency: "monthly",
      indexable,
      slug,
      name,
      summary: description,
      tags,
      category,
      nodeTypes,
      nodeCount: nodeTypes.reduce((s, t) => s + t.count, 0),
      thumbnail,
      graph: buildGraph(raw.graph),
    });
  }

  // Prune stale thumbnails from a previous run so the copy stays reproducible.
  for (const existing of fs.existsSync(PUBLIC_TEMPLATES)
    ? fs.readdirSync(PUBLIC_TEMPLATES)
    : []) {
    if (existing.endsWith(".jpg") && !copiedThumbs.has(existing)) {
      fs.rmSync(path.join(PUBLIC_TEMPLATES, existing));
    }
  }

  const header = `// AUTO-GENERATED by marketing/scripts/generate-template-entries.mjs — do not edit by hand.
// Regenerate: npm run gen:templates
import type { TemplateEntry } from "./templates";

export const templateEntries: TemplateEntry[] = ${JSON.stringify(entries, null, 2)};
`;

  fs.writeFileSync(OUT_FILE, header);

  const indexableCount = entries.filter((e) => e.indexable).length;
  console.log(
    `Wrote ${entries.length} template entries (${indexableCount} indexable) → ${path.relative(MARKETING, OUT_FILE)}`,
  );
}

main();
