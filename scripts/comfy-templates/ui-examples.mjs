#!/usr/bin/env node
// Ship upstream UI-format Comfy templates as editable Comfy workflow examples.
// --refresh downloads the templates and needs COMFY_API_KEY for the node
// catalog. Normal generation and --check work offline from the stored fixture.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { COMFY_RUN_MODE, comfyOutputNames, comfyPromptToGraph, exposeComfyInterface } from "@nodetool-ai/protocol";
import { REVISION, TEMPLATES } from "./catalog.mjs";
import { uiToApi } from "./ui-to-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturePath = join(root, "packages/runtime/tests/fixtures/comfy-templates/ui-templates.json.gz");
const examplesDir = join(root, "packages/base-nodes/nodetool/examples/nodetool-base");
const metadataPath = join(root, "packages/base-nodes/nodetool/package_metadata/nodetool-base.json");
const check = process.argv.includes("--check");
const RAW = `https://raw.githubusercontent.com/Comfy-Org/workflow_templates/${REVISION}/templates`;

/** The first reason `prompt` cannot run against `info`, or null. */
export function promptProblem(prompt, info) {
  for (const node of Object.values(prompt)) {
    const entry = info[node.class_type];
    for (const section of ["required", "optional"]) {
      for (const [field, spec] of Object.entries(entry.input?.[section] ?? {})) {
        const value = node.inputs[field];
        if (value === undefined) {
          if (section === "required" && (Array.isArray(spec[0]) || ["INT", "FLOAT", "STRING", "BOOLEAN"].includes(spec[0]))) {
            return `${node.class_type}.${field} has no value`;
          }
          continue;
        }
        if (Array.isArray(value)) continue;
        const options = Array.isArray(spec[0]) ? spec[0] : spec[0] === "COMBO" ? spec[1]?.options : null;
        // A Load node's file name is a placeholder that a run input replaces.
        const isLoadFile = /^Load(Image|Audio|Video)/.test(node.class_type);
        if (options?.length && !options.includes(value) && !isLoadFile) {
          return `${node.class_type}.${field}: "${String(value).slice(0, 60)}" is not offered by Comfy Cloud`;
        }
        const expected = { INT: "number", FLOAT: "number", STRING: "string", BOOLEAN: "boolean" }[spec[0]];
        if (expected && typeof value !== expected) {
          return `${node.class_type}.${field}: expected ${expected}, got ${typeof value}`;
        }
      }
    }
  }
  return null;
}

async function refresh() {
  const apiKey = process.env.COMFY_API_KEY;
  if (!apiKey) throw new Error("--refresh needs COMFY_API_KEY");
  const infoRes = await fetch("https://cloud.comfy.org/api/object_info", { headers: { "X-API-Key": apiKey } });
  if (!infoRes.ok) throw new Error(`object_info: HTTP ${infoRes.status}`);
  const info = await infoRes.json();
  const categories = await (await fetch(`${RAW}/index.json`)).json();
  const handled = new Set(TEMPLATES.map((template) => template.source));
  const kept = [];
  const skipped = {};
  for (const category of categories) {
    for (const template of category.templates) {
      if (handled.has(template.name)) continue;
      const res = await fetch(`${RAW}/${template.name}.json`);
      if (!res.ok) throw new Error(`${template.name}: HTTP ${res.status}`);
      const ui = await res.json();
      let problem;
      let prompt;
      try {
        prompt = uiToApi(ui, info);
        problem = promptProblem(prompt, info);
      } catch (err) {
        problem = err.message;
      }
      if (!problem) {
        const graph = exposeComfyInterface(comfyPromptToGraph(prompt, () => undefined));
        if (!graph.nodes.some((node) => node.type === "nodetool.output.Output")) problem = "no image, audio or video output";
      }
      if (problem) {
        skipped[template.name] = problem;
        continue;
      }
      const classes = [...new Set(Object.values(prompt).map((node) => node.class_type))];
      kept.push({
        source: template.name,
        title: template.title,
        description: template.description,
        category: category.title,
        partner: classes.some((cls) => info[cls].api_node === true),
        prompt,
        sockets: Object.fromEntries(classes.map((cls) => [cls, comfyOutputNames(info[cls])]))
      });
    }
  }
  await writeFile(fixturePath, gzipSync(`${JSON.stringify({ revision: REVISION, kept, skipped }, null, 0)}\n`, { mtime: 0 }));
  console.log(`Kept ${kept.length}, skipped ${Object.keys(skipped).length}`);
}

if (process.argv.includes("--refresh")) await refresh();
const { kept } = JSON.parse(gunzipSync(await readFile(fixturePath)).toString());
if (kept.length === 0) throw new Error("No templates inspected");

const formatEntry = (entry) => `    ${JSON.stringify(entry, null, 2).replaceAll("\n", "\n    ")}`;
let metadataText = await readFile(metadataPath, "utf8");
const metadata = JSON.parse(metadataText);
const usedNames = new Set(TEMPLATES.map((template) => `Comfy ${template.name}`));
for (const entry of kept) {
  let name = `Comfy ${entry.title.replaceAll(/[/\\:*?"<>|]/g, "-").trim()}`;
  if (usedNames.has(name)) name = `${name} (${entry.source})`;
  usedNames.add(name);
  const id = createHash("sha256").update(`nodetool:${entry.source}`).digest("hex").slice(0, 32);
  const tags = ["comfy", entry.category.toLowerCase(), entry.partner ? "partner" : "open-weights", "example"];
  const cost = entry.partner ? "Comfy Cloud partner credits" : "a COMFY_API_KEY";
  const description = `${entry.description ?? entry.title} Runs on Comfy Cloud and needs ${cost}.`;
  const graph = comfyPromptToGraph(entry.prompt, (cls) => entry.sockets[cls]);
  graph.nodes.unshift({
    id: "intro",
    type: "nodetool.workflows.base_node.Comment",
    data: { comment: `# ${name}\n\n${description}\n\n**How it works:** The Comfy nodes form the complete template graph. Run submits the graph to Comfy Cloud and saves its outputs.\n\n**Try this:** Change the prompt or the Load node inputs and run again to compare results.\n\nSource: https://github.com/Comfy-Org/workflow_templates/blob/${REVISION}/templates/${entry.source}.json (MIT). Model licenses apply separately.` },
    ui_properties: { position: { x: 0, y: -440 }, width: 600 }
  });
  const example = { id, name, description, tags, access: "public", required_providers: [], thumbnail: null, run_mode: COMFY_RUN_MODE, graph };
  const path = join(examplesDir, `${name}.json`);
  const content = `${JSON.stringify(example, null, 2)}\n`;
  if (check) {
    if ((await readFile(path, "utf8")) !== content) throw new Error(`Generated file differs: ${path}`);
  } else {
    await writeFile(path, content);
  }
  const meta = { id, name, description, tags, run_mode: COMFY_RUN_MODE };
  const previous = metadata.examples.find((candidate) => candidate.name === name);
  if (previous) {
    metadataText = metadataText.replace(formatEntry(previous), formatEntry(meta));
  } else {
    metadataText = metadataText.replace(/\n  \]\n\}\s*$/, `,\n${formatEntry(meta)}\n  ]\n}\n`);
  }
}
if (check) {
  if ((await readFile(metadataPath, "utf8")) !== metadataText) throw new Error(`Generated file differs: ${metadataPath}`);
} else {
  await writeFile(metadataPath, metadataText);
}
console.log(`${check ? "Checked" : "Generated"} ${kept.length} UI template examples`);
