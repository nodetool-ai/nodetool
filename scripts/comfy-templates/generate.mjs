#!/usr/bin/env node
// Download JSON only with --refresh. Normal generation and --check are offline.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMFY_RUN_MODE, comfyPromptToGraph } from "@nodetool-ai/protocol";
import { REVISION, TEMPLATES } from "./catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureDir = join(root, "packages/runtime/tests/fixtures/comfy-templates");
const generatedPath = join(root, "packages/runtime/src/providers/comfy-template-graphs.ts");
const examplesDir = join(root, "packages/base-nodes/nodetool/examples/nodetool-base");
const metadataPath = join(root, "packages/base-nodes/nodetool/package_metadata/nodetool-base.json");
const socketsPath = join(fixtureDir, "sockets.json");
const sockets = JSON.parse(await readFile(socketsPath, "utf8"));
const check = process.argv.includes("--check");
if (check && process.argv.includes("--refresh")) throw new Error("Use --refresh and --check separately");
const normalizeId = (id) => id.replaceAll(":", "_");

async function emit(path, content) {
  if (check) {
    if (await readFile(path, "utf8") !== content) throw new Error(`Generated file differs: ${path}`);
  } else {
    await writeFile(path, content);
  }
}

const templates = [];
const exampleMetadata = [];
for (const entry of TEMPLATES) {
  const sourceUrl = `https://raw.githubusercontent.com/Comfy-Org/workflow_templates/${REVISION}/benchmarks/${entry.source}.json`;
  const fixturePath = join(fixtureDir, `${entry.source}.json`);
  if (process.argv.includes("--refresh")) {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${sourceUrl}: HTTP ${res.status}`);
    await writeFile(fixturePath, await res.text());
  }
  const original = JSON.parse(await readFile(fixturePath, "utf8"));
  const graph = {};
  for (const [id, node] of Object.entries(original)) {
    if (!node.class_type || !node.inputs) throw new Error(`${entry.source}: not an API prompt`);
    if (graph[normalizeId(id)]) throw new Error(`${entry.source}: duplicate normalized id`);
    graph[normalizeId(id)] = { ...node, inputs: Object.fromEntries(Object.entries(node.inputs).map(([name, value]) => {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isInteger(value[1])) {
        if (!original[value[0]]) throw new Error(`${entry.source}: dangling link ${value[0]}`);
        return [name, [normalizeId(value[0]), value[1]]];
      }
      return [name, value];
    })) };
  }
  for (const [node, field] of [...entry.prompt, ...(entry.seeds ?? [])]) {
    if (!(field in original[node].inputs)) throw new Error(`${entry.source}: missing binding ${node}:${field}`);
  }
  if (!original[entry.output]?.class_type.startsWith("Save")) throw new Error(`${entry.source}: missing save output`);
  const template = {
    ...entry,
    id: `comfyui-template/${entry.source}`,
    sourceUrl,
    prompt: entry.prompt.map(([node, field]) => [normalizeId(node), field]),
    seeds: (entry.seeds ?? []).map(([node, field]) => [normalizeId(node), field]),
    ...(entry.size ? { size: normalizeId(entry.size) } : {}),
    output: normalizeId(entry.output),
    graph
  };
  templates.push(template);
  // Restricted H3 graphs remain available through the provider's explicit opt-in.
  if (entry.restricted) continue;
  const name = `Comfy ${entry.name}`;
  const kind = entry.task === "text_to_image" ? "image" : entry.task === "text_to_video" ? "video" : "audio";
  const description = `Generate ${kind === "image" ? "an image" : kind === "video" ? "a video" : "audio"} on Comfy Cloud with the official ${entry.name} template. Requires COMFY_API_KEY and model availability on Comfy Cloud.`;
  const tags = ["comfy", kind, "example"];
  const id = createHash("sha256").update(`nodetool:${entry.source}`).digest("hex").slice(0, 32);
  if (process.argv.includes("--refresh")) {
    const url = `https://raw.githubusercontent.com/Comfy-Org/workflow_templates/${REVISION}/templates/${entry.source}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const ui = await res.json();
    const definitions = new Map((ui.definitions?.subgraphs ?? []).map((subgraph) => [subgraph.id, subgraph]));
    const classes = {};
    for (const [id, node] of Object.entries(original)) {
      let scope = ui;
      let uiNode;
      for (const part of id.split(":")) {
        uiNode = scope?.nodes?.find((candidate) => String(candidate.id) === part);
        scope = definitions.get(uiNode?.type);
      }
      if (uiNode?.type !== node.class_type) throw new Error(`${entry.source}: missing UI node ${id}`);
      const seen = new Map();
      classes[node.class_type] = (uiNode.outputs ?? []).map((output) => {
        const count = seen.get(output.name) ?? 0;
        seen.set(output.name, count + 1);
        return count === 0 ? output.name : `${output.name}_${count + 1}`;
      });
    }
    sockets[entry.source] = classes;
  }
  const outputNames = (cls) => sockets[entry.source]?.[cls];
  for (const node of Object.values(graph)) {
    for (const value of Object.values(node.inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && Number.isInteger(value[1])) {
        if (!outputNames(graph[value[0]].class_type)?.[value[1]]) {
          throw new Error(`${entry.source}: missing output socket ${value[0]}:${value[1]}`);
        }
      }
    }
  }
  const nativeGraph = comfyPromptToGraph(graph, outputNames);
  const [promptNode, promptField] = template.prompt[0];
  const promptTitle = graph[promptNode]._meta?.title ?? graph[promptNode].class_type;
  const example = {
    id, name, description, tags, access: "public", required_providers: [], thumbnail: null,
    run_mode: COMFY_RUN_MODE,
    graph: {
      ...nativeGraph,
      nodes: [
        { id: "intro", type: "nodetool.workflows.base_node.Comment", data: { comment: `# ${name}\n\n${description}\n\n**How it works:** The Comfy nodes form the complete ${entry.name} graph. Run submits the graph to Comfy Cloud and saves its generated ${kind}.\n\n**Try this:** Change ${promptField} on ${promptTitle} and run again to compare results. Edit the visible nodes to change settings${kind === "audio" ? ", lyrics or duration" : ""}.\n\nSource: https://github.com/Comfy-Org/workflow_templates/blob/${REVISION}/benchmarks/${entry.source}.json (MIT). Model licenses apply separately.` }, ui_properties: { position: { x: 0, y: -440 }, width: 600 } },
        ...nativeGraph.nodes
      ]
    }
  };
  await emit(join(examplesDir, `${name}.json`), `${JSON.stringify(example, null, 2)}\n`);
  exampleMetadata.push({ id, name, description, tags, run_mode: COMFY_RUN_MODE });
}
if (process.argv.includes("--refresh")) await writeFile(socketsPath, `${JSON.stringify(sockets, null, 2)}\n`);
if (templates.length === 0) throw new Error("No templates inspected");
const license = (await readFile(join(fixtureDir, "LICENSE"), "utf8")).trim();
await emit(generatedPath, `/*\n${license}\n*/\n// Generated by scripts/comfy-templates/generate.mjs. Do not edit.\n// Source: Comfy-Org/workflow_templates at ${REVISION} (MIT).\n// License: ../../tests/fixtures/comfy-templates/LICENSE\nimport type { ComfyTemplate } from "./comfy-template-models.js";\n\nexport const COMFY_TEMPLATES: readonly ComfyTemplate[] = ${JSON.stringify(templates, null, 2)};\n`);
let metadataText = await readFile(metadataPath, "utf8");
const metadata = JSON.parse(metadataText);
const formatEntry = (entry) => `    ${JSON.stringify(entry, null, 2).replaceAll("\n", "\n    ")}`;
for (const entry of exampleMetadata) {
  const previous = metadata.examples.find((example) => example.name === entry.name);
  if (previous) {
    const before = formatEntry(previous);
    if (!metadataText.includes(before)) throw new Error(`Unexpected metadata formatting for ${entry.name}`);
    metadataText = metadataText.replace(before, formatEntry(entry));
  } else {
    metadataText = metadataText.replace(/\n  \]\n\}\s*$/, `,\n${formatEntry(entry)}\n  ]\n}\n`);
  }
}
await emit(metadataPath, metadataText);
console.log(`${check ? "Checked" : "Generated"} ${templates.length} API templates and ${exampleMetadata.length} examples`);
