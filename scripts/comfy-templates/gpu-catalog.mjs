#!/usr/bin/env node
// Refresh downloads template JSON only. Normal generation and checks are offline.
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REVISION } from "./catalog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = join(root, "packages/runtime/tests/fixtures/comfy-templates/gpu-source.json.gz");
const output = join(root, "packages/runtime/src/providers/comfy-gpu-catalog.json");
const base = `https://raw.githubusercontent.com/Comfy-Org/workflow_templates/${REVISION}`;
const check = process.argv.includes("--check");
if (check && process.argv.includes("--refresh")) {throw new Error("Use --refresh and --check separately");}
async function fetchJson(path) {
  const res = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {throw new Error(`${path}: HTTP ${res.status}`);}
  return res.json();
}

// Keep the execution document, without canvas layout, thumbnails or note text.
function compact(workflow) {
  const scope = (graph) => ({
    ...(graph.id ? { id: graph.id } : {}),
    nodes: graph.nodes.filter((node) => !["Note", "MarkdownNote"].includes(node.type)).map((node) => ({
      id: node.id, type: node.type,
      ...(node.title ? { title: node.title } : {}),
      ...(node.mode ? { mode: node.mode } : {}),
      inputs: node.inputs ?? [], outputs: node.outputs ?? [],
      widgets_values: node.widgets_values ?? [],
      ...(node.widgets_values_form ? { widgets_values_form: node.widgets_values_form } : {}),
      ...(node.properties?.proxyWidgets ? { properties: { proxyWidgets: node.properties.proxyWidgets } } : {})
    })),
    links: graph.links ?? [],
    ...(graph.inputs ? { inputs: graph.inputs } : {}),
    ...(graph.outputs ? { outputs: graph.outputs } : {})
  });
  return { ...scope(workflow), definitions: { subgraphs: (workflow.definitions?.subgraphs ?? []).map(scope) } };
}

let source;
if (process.argv.includes("--refresh")) {
  const categories = await fetchJson("templates/index.json");
  const rows = categories.flatMap((category) => category.templates.map((template) => ({ ...template, categoryType: category.type })));
  const candidates = rows.filter((row) => row.openSource !== false && !row.tags?.includes("API") && !row.name.startsWith("api_"));
  let next = 0;
  const templates = new Array(candidates.length);
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < candidates.length) {
      const at = next++;
      const metadata = candidates[at];
      const workflow = compact(await fetchJson(`templates/${metadata.name}.json`));
      templates[at] = { metadata, workflow };
    }
  }));
  source = { revision: REVISION, templates };
  await writeFile(fixture, gzipSync(JSON.stringify(source), { level: 9 }));
} else {
  source = JSON.parse(gunzipSync(await readFile(fixture)));
}

function classify(metadata, workflow) {
  const tags = metadata.tags ?? [];
  const nodes = [...workflow.nodes, ...(workflow.definitions?.subgraphs ?? []).flatMap((definition) => definition.nodes)];
  const outputTypes = nodes.filter((node) => node.mode !== 2 && node.mode !== 4).map((node) => node.type);
  const categoryType = outputTypes.some((type) => /^(SaveVideo|VHS_VideoCombine)$/.test(type)) ? "video" : metadata.categoryType;
  if (!(metadata.models ?? []).some((model) => model && model !== "None")) {return { reason: "Utility workflow without a model family" };}
  const inputTypes = (metadata.io?.inputs ?? []).map((input) => input.mediaType);
  if (inputTypes.length === 0) {
    for (const node of workflow.nodes) {
      if (node.mode === 2 || node.mode === 4) {continue;}
      if (node.type === "LoadImage") {inputTypes.push("image");}
      if (node.type === "LoadAudio") {inputTypes.push("audio");}
      if (/^(LoadVideo|VHS_LoadVideo)/.test(node.type)) {inputTypes.push("video");}
    }
  }
  const images = inputTypes.filter((type) => type === "image").length;
  const videos = inputTypes.filter((type) => type === "video").length;
  const audios = inputTypes.filter((type) => type === "audio").length;
  if (categoryType === "llm") {return { kind: "text", task: "generate_message" };}
  if (categoryType === "3d") {
    if (videos || audios || images > 1) {return { reason: "3D provider requires one image or a text prompt" };}
    return { kind: "model3d", task: images ? "image_to_3d" : "text_to_3d" };
  }
  if (categoryType === "audio") {
    if (videos || images) {return { reason: "Audio template requires a non-audio input" };}
    if (tags.includes("Text to Speech") || /chatterbox.*tts/.test(metadata.name)) {
      if (audios > 1) {return { reason: "Speech provider accepts one reference recording" };}
      return { kind: "audio", task: "text_to_speech" };
    }
    if (audios > 1) {return { reason: "Audio transform requires multiple recordings" };}
    return { kind: "audio", task: audios ? "audio_to_audio" : "text_to_music" };
  }
  if (categoryType === "video") {
    // VOID derives its mask with SAM3 from text, so a source clip is sufficient.
    if (metadata.name === "utility_void_video_inpainting") { return { kind: "video", task: "video_to_video" }; }
    if (tags.includes("Inpainting") || /inpaint/.test(metadata.name)) {return { reason: "Template requires an explicit mask or editor selection" };}
    if (tags.includes("Reference to Video") || audios || videos > 1) {return { kind: "video", task: "reference_to_video" };}
    if (videos) {return { kind: "video", task: "video_to_video" };}
    if (images > 1 && !tags.includes("FLF2V") && !/flf|first_last/i.test(metadata.name)) {return { kind: "video", task: "reference_to_video" };}
    return { kind: "video", task: images ? "image_to_video" : "text_to_video" };
  }
  if (videos || audios) {return { reason: "Image provider accepts images, not audio or video" };}
  if (tags.includes("Inpainting") || /inpaint/.test(metadata.name)) {return { reason: "Template requires an explicit mask or editor selection" };}
  return { kind: "image", task: images ? "image_to_image" : "text_to_image" };
}

// Output classes that prepareComfyGpuPrompt in comfy-gpu-models.ts keeps as roots.
const OUTPUT_CLASS = {
  image: /^(Save.*Image|SaveAnimated)/, video: /^(SaveVideo|VHS_VideoCombine)/, audio: /^SaveAudio/,
  text: /^(PreviewAny|SaveText)/, model3d: /^(Save(?!.*(?:Image|Video|Audio|Text))|Preview3D)/i
};

/**
 * Count the media loaders that remain after the provider prunes the graph to
 * its outputs. This follows comfyUiToPrompt's link resolution (subgraphs,
 * reroutes, Set/Get variables, mute and bypass) on topology alone, so it needs
 * no live object_info.
 */
function mediaInputs(kind, workflow) {
  const definitions = new Map((workflow.definitions?.subgraphs ?? []).map((definition) => [String(definition.id), definition]));
  const linkMap = (scope) => new Map((scope.links ?? []).map((raw) => Array.isArray(raw)
    ? [String(raw[0]), { origin: String(raw[1]), slot: raw[2], target: String(raw[3]), input: raw[4] }]
    : [String(raw.id), { origin: String(raw.origin_id), slot: raw.origin_slot, target: String(raw.target_id), input: raw.target_slot }]));
  const built = new Map();
  let expanded = 0;
  function scopeOf(scope, prefix, external, depth) {
    if (depth > 30 || (expanded += scope.nodes.length) > 20000) {throw new Error("Comfy template subgraph expansion exceeded its limit");}
    const nodes = new Map(scope.nodes.map((node) => [String(node.id), node]));
    const links = linkMap(scope);
    const children = new Map();
    const inputValue = (node, index) => {
      const input = (node.inputs ?? [])[index];
      const entry = input?.link == null ? undefined : links.get(String(input.link));
      if (entry) {resolve(entry.origin, entry.slot);}
    };
    const child = (id, node, definition) => {
      if (!children.has(id)) {
        const supplied = new Map();
        (definition.inputs ?? []).forEach((port, index) => {
          const named = (node.inputs ?? []).findIndex((input) => input.name === port.name);
          if (named >= 0) {supplied.set(index, () => inputValue(node, named));}
        });
        children.set(id, scopeOf(definition, `${prefix}${id}:`, supplied, depth + 1));
      }
      return children.get(id);
    };
    function resolve(id, slot) {
      if (id === "-10") { external.get(slot)?.(); return; }
      const node = nodes.get(id);
      if (!node || node.mode === 2) {return;}
      const definition = definitions.get(String(node.type));
      if (definition) { child(id, node, definition).output(slot); return; }
      if (node.type === "PrimitiveNode") {return;}
      if (node.type === "Reroute" || node.type === "SetNode") { inputValue(node, 0); return; }
      if (node.type === "GetNode") {
        const setter = [...nodes.values()].find((candidate) => candidate.type === "SetNode" && candidate.widgets_values?.[0] === node.widgets_values?.[0]);
        if (setter) {inputValue(setter, 0);}
        return;
      }
      if (node.mode === 4) {
        const inputs = node.inputs ?? [];
        const matching = inputs.findIndex((input) => input.type === node.outputs?.[slot]?.type);
        inputValue(node, matching >= 0 ? matching : slot);
        return;
      }
      build(id, node);
    }
    function build(id, node) {
      const apiId = `${prefix}${id}`;
      if (built.has(apiId)) {return;}
      built.set(apiId, String(node.type));
      (node.inputs ?? []).forEach((_input, index) => inputValue(node, index));
    }
    return {
      output(slot) {
        const port = (scope.outputs ?? [])[slot];
        const entry = (port?.linkIds ?? []).map((key) => links.get(String(key))).find(Boolean) ??
          [...links.values()].find((candidate) => candidate.target === "-20" && candidate.input === slot);
        if (entry) {resolve(entry.origin, entry.slot);}
      },
      emit() {
        for (const [id, node] of nodes) {
          if (node.mode === 2 || node.mode === 4) {continue;}
          const definition = definitions.get(String(node.type));
          if (definition) {child(id, node, definition).emit();}
          else if (OUTPUT_CLASS[kind].test(String(node.type))) {build(id, node);}
        }
      }
    };
  }
  scopeOf(workflow, "", new Map(), 0).emit();
  const types = [...built.values()];
  return {
    image: types.filter((type) => type === "LoadImage").length,
    video: types.filter((type) => /^(LoadVideo|VHS_LoadVideo)/.test(type)).length,
    audio: types.filter((type) => type === "LoadAudio").length
  };
}

const templates = [];
const excluded = [];
for (const { metadata, workflow } of source.templates) {
  const result = classify(metadata, workflow);
  if (result.reason) {
    excluded.push({ source: metadata.name, models: metadata.models ?? [], reason: result.reason });
    continue;
  }
  templates.push({
    id: `comfyui-gpu/${metadata.name}`,
    source: metadata.name,
    name: metadata.title ?? metadata.name,
    models: metadata.models ?? [],
    kind: result.kind, task: result.task,
    outputNodes: (metadata.io?.outputs ?? []).map((output) => String(output.nodeId)),
    restricted: (metadata.models ?? []).some((model) => /\bH3\b/.test(model) && !/music/i.test(model)),
    inputs: mediaInputs(result.kind, workflow),
    workflow
  });
}
if (templates.length === 0) {throw new Error("No GPU templates inspected");}
const license = await readFile(join(root, "packages/runtime/tests/fixtures/comfy-templates/LICENSE"), "utf8");
const content = `${JSON.stringify({ revision: source.revision, license, templates, excluded })}\n`;
if (check) {
  if (await readFile(output, "utf8") !== content) {throw new Error("GPU template catalog differs. Run node scripts/comfy-templates/gpu-catalog.mjs");}
} else {
  await writeFile(output, content);
}
console.log(`${check ? "Checked" : "Generated"} ${templates.length} GPU templates; ${excluded.length} exclusions recorded`);
