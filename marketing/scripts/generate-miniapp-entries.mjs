// Generates marketing/src/data/miniAppEntries.generated.ts from the shipped
// example apps, for the /apps/* mini-app landing pages.
//
// The source of truth is the bundle-derived previews in
// web/public/app-preview/ (written by scripts/build-example-apps.mjs from the
// ApplicationBundles in packages/base-nodes/nodetool/examples/apps/). One page
// per shipped app — the curated set, not one page per workflow template.
//
// Each entry distills the app the way a visitor experiences it: the emoji
// heading and tagline from the app document, what you put in (write widgets),
// what you get out (bound display widgets), and the workflows the app binds,
// each linking to its /templates page. A screenshot captured by
// web/scripts/screenshot-app-previews.mjs is referenced from /apps/<slug>.png
// when present; entries without one still build, noindexed.
//
// Regenerate with `npm run gen:apps`; run after `npm run gen:templates` so the
// linked template routes exist.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const MARKETING = path.resolve(__dirname, "..");
const PREVIEWS = path.join(REPO_ROOT, "web/public/app-preview");
const EXAMPLES_DIR = path.join(
  REPO_ROOT,
  "packages/base-nodes/nodetool/examples/nodetool-base",
);
const SCREENSHOTS = path.join(MARKETING, "public/apps");
const OUT_FILE = path.join(MARKETING, "src/data/miniAppEntries.generated.ts");

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// WorkflowInput is the unified per-input widget; its kind comes from the bound
// input node's type in the graph (see inputKind). The rest carry their own
// control and say what kind they are.
const WRITE_WIDGETS = new Set([
  "WorkflowInput",
  "TextInput",
  "NumberInput",
  "Slider",
  "Switch",
  "Select",
  "ImageInput",
  "AudioInput",
  "VideoInput",
  "ColorInput",
]);
// Progress widgets are run feedback, not a result the visitor takes away.
const READ_WIDGETS = new Set(["Markdown", "Image", "Audio", "Video", "Json", "Table"]);

// nodetool.input.* node type → marketing input kind.
const INPUT_NODE_KIND = {
  IntegerInput: "number",
  FloatInput: "number",
  BooleanInput: "toggle",
  SelectInput: "choice",
  ImageInput: "image",
  ImageListInput: "image",
  AudioInput: "audio",
  VideoInput: "video",
  ColorInput: "color",
  StringInput: "text",
};

/** Widget type → input kind, for widgets that carry their own control. */
const WIDGET_KIND = {
  Slider: "number",
  NumberInput: "number",
  Switch: "toggle",
  Select: "choice",
  ImageInput: "image",
  AudioInput: "audio",
  VideoInput: "video",
  ColorInput: "color",
};

/** Human label for what a display widget shows. */
const OUTPUT_KIND = {
  Image: "image",
  Audio: "audio",
  Video: "video",
  Json: "data",
  Table: "data",
  Markdown: "text",
};

/** The app's note is Markdown in the app; the landing page renders plain text. */
const plain = (text) =>
  String(text)
    .replace(/[`*]/g, "")
    .trim();

const humanize = (name) =>
  String(name)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/** Flatten a Puck document tree (slot props hold child arrays). */
function flatten(content, out = []) {
  for (const node of content ?? []) {
    if (!node || typeof node !== "object" || !node.type) continue;
    out.push(node);
    for (const value of Object.values(node.props ?? {})) {
      if (Array.isArray(value) && value.some((v) => v && typeof v === "object" && v.type)) {
        flatten(value, out);
      }
    }
  }
  return out;
}

/**
 * The node a widget binding addresses. Bindings name an operation
 * (`op:<id>/in:<nodeId>`), and each operation binds one of the app's
 * workflows, so the lookup goes through the operation table to that workflow's
 * graph. Variable bindings (`var:<id>`) address no node.
 */
function nodeForBinding(app, binding) {
  const match = /^op:([^/]+)\/(?:in|out|prop):(.+)$/.exec(binding ?? "");
  if (!match) return null;
  const graph = app.graphs.get(match[1]);
  const nodeId = match[2].split("#")[0];
  return graph?.nodes.find((n) => n.id === nodeId) ?? null;
}

/** The label for a bound widget: its own label, else the node or variable name. */
function bindingLabel(app, binding, label) {
  if (label) return label;
  const node = nodeForBinding(app, binding);
  if (node) return humanize(node.data?.name || node.id);
  const variableId = /^var:(.+)$/.exec(binding ?? "")?.[1];
  const variable = app.variables.find((v) => v.id === variableId);
  return humanize(variable?.name || variableId || binding || "Result");
}

function inputKind(app, widget) {
  const own = WIDGET_KIND[widget.type];
  if (own) return own;
  const node = nodeForBinding(app, widget.props?.binding);
  const type = (node?.type ?? "").startsWith("nodetool.input.") ? node.type : "";
  return INPUT_NODE_KIND[type.replace(/^nodetool\.input\./, "")] ?? "text";
}

function distill(preview) {
  const app = {
    graphs: new Map(
      preview.app.operations.map((op) => [
        op.id,
        preview.workflows.find((w) => w.key === op.workflowId)?.graph ?? { nodes: [] },
      ]),
    ),
    variables: preview.app.variables ?? [],
  };

  const widgets = flatten(preview.app.ui?.content);
  const button = widgets.find((w) => w.type === "Button");

  const inputs = [];
  const outputs = [];
  const seen = new Set();
  // A display widget carries no label of its own; the app puts one in the
  // Heading immediately above it, which is the wording a visitor reads.
  let heading;
  for (const widget of widgets) {
    const binding = widget.props?.binding;
    if (widget.type === "Heading" && widget.props?.level === "3") {
      heading = widget.props?.text;
      continue;
    }
    if (WRITE_WIDGETS.has(widget.type)) {
      inputs.push({
        label: bindingLabel(app, binding, widget.props?.label),
        kind: inputKind(app, widget),
      });
      continue;
    }
    if (!READ_WIDGETS.has(widget.type) || !binding) continue;
    const label = bindingLabel(app, binding, widget.props?.label || heading);
    heading = undefined;
    if (seen.has(binding)) continue;
    seen.add(binding);
    outputs.push({ label, kind: OUTPUT_KIND[widget.type] ?? "text" });
  }

  return {
    heading: `${preview.emoji} ${preview.name}`.trim(),
    tagline: preview.tagline ?? "",
    buttonLabel: button?.props?.label || "Run",
    inputs,
    outputs,
    widgetCount: widgets.length,
  };
}

/** Tags of the templates an app binds, deduped — what powers `relatedMiniApps`. */
function templateInfo(preview) {
  const workflows = [];
  const tags = new Set();
  for (const workflow of preview.workflows) {
    const file = path.join(EXAMPLES_DIR, `${workflow.name}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(
        `${preview.slug} binds "${workflow.name}", which has no template in ${path.relative(REPO_ROOT, EXAMPLES_DIR)}`,
      );
    }
    const example = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const tag of example.tags ?? []) tags.add(tag);
    const slug = slugify(workflow.name);
    workflows.push({ name: workflow.name, slug, route: `/templates/${slug}` });
  }
  return { workflows, tags: [...tags].sort() };
}

const previews = fs
  .readdirSync(PREVIEWS)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json")
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(PREVIEWS, f), "utf8")));

const entries = previews.map((preview) => {
  const app = distill(preview);
  const { workflows, tags } = templateInfo(preview);
  const screenshot = fs.existsSync(path.join(SCREENSHOTS, `${preview.slug}.png`))
    ? `/apps/${preview.slug}.png`
    : null;
  const summary = (preview.description || "").trim();

  return {
    route: `/apps/${preview.slug}`,
    title: `${preview.name} — Free AI Mini App | NodeTool`,
    description:
      app.tagline ||
      summary.slice(0, 155) ||
      `${preview.name} is a ready-to-use AI mini app built with NodeTool.`,
    priority: 0.4,
    changeFrequency: "monthly",
    indexable: Boolean(screenshot) && (app.tagline.length >= 30 || summary.length >= 80),
    slug: preview.slug,
    name: preview.name,
    summary,
    featured: preview.featured === true,
    note: preview.note ? plain(preview.note) : null,
    workflows,
    templateRoute: workflows[0].route,
    screenshot,
    tags,
    ...app,
  };
});

const banner =
  "// AUTO-GENERATED by marketing/scripts/generate-miniapp-entries.mjs — do not edit by hand.\n" +
  "// Regenerate: npm run gen:apps\n" +
  'import type { MiniAppEntry } from "./miniApps";\n\n';

fs.writeFileSync(
  OUT_FILE,
  banner + `export const miniAppEntries: MiniAppEntry[] = ${JSON.stringify(entries, null, 2)};\n`,
  "utf8",
);
console.log(`wrote ${entries.length} mini-app entries → ${path.relative(MARKETING, OUT_FILE)}`);
console.log(`with screenshots: ${entries.filter((e) => e.screenshot).length}`);
