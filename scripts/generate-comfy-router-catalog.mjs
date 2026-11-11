#!/usr/bin/env node
/**
 * Regenerates packages/runtime/src/providers/comfy-router-catalog.ts from the
 * Comfy Router's own per-model input schemas.
 *
 *   COMFY_API_KEY=... node scripts/generate-comfy-router-catalog.mjs
 *   node scripts/generate-comfy-router-catalog.mjs --schemas <dir>
 *
 * `--schemas` reads a saved snapshot: `models.json` (the `/v2/models` data
 * array) plus one `<provider>__<model>.json` OpenAPI document per id.
 *
 * Each model's NodeTool tasks come from its `x-comfy-router-input-modalities`,
 * `x-comfy-router-output-modalities` and the `required` list of its body:
 * an image model whose body requires an image serves image-to-image only, a
 * video model that requires a source video serves video-to-video only. Models
 * NodeTool has no task for (3D, audio-in, video that needs a driving audio
 * track) are left out and listed on stderr.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "packages/runtime/src/providers/comfy-router-catalog.ts");
const BASE = process.env.COMFY_ROUTER_URL ?? "https://api.comfy.org";

const args = process.argv.slice(2);
const schemasDir = args.includes("--schemas") ? args[args.indexOf("--schemas") + 1] : null;

async function getJson(path) {
  const key = process.env.COMFY_API_KEY;
  if (!key) throw new Error("Set COMFY_API_KEY or pass --schemas <dir>.");
  const res = await fetch(`${BASE}${path}`, { headers: { "X-API-Key": key } });
  if (!res.ok) throw new Error(`GET ${path}: HTTP ${res.status}`);
  return res.json();
}

async function listModels() {
  if (schemasDir) return JSON.parse(await readFile(join(schemasDir, "models.json"), "utf8"));
  const out = [];
  let cursor = null;
  do {
    const page = await getJson(`/v2/models?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    out.push(...page.data);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return out;
}

async function loadSchema(id) {
  if (schemasDir) {
    return JSON.parse(await readFile(join(schemasDir, `${id.replace("/", "__")}.json`), "utf8"));
  }
  return getJson(`/v2/models/${id}/openapi.json`);
}

function resolve(node, doc) {
  if (!node || typeof node !== "object") return {};
  if (typeof node.$ref === "string") {
    let cur = doc;
    for (const key of node.$ref.replace(/^#\//, "").split("/")) cur = cur?.[key];
    return resolve(cur, doc);
  }
  if (Array.isArray(node.allOf)) {
    const merged = { properties: {}, required: [] };
    for (const part of node.allOf.map((p) => resolve(p, doc))) {
      Object.assign(merged.properties, part.properties ?? {});
      merged.required.push(...(part.required ?? []));
    }
    return merged;
  }
  return node;
}

function bodySchema(doc) {
  for (const ops of Object.values(doc.paths ?? {})) {
    const schema = ops?.post?.requestBody?.content?.["application/json"]?.schema;
    if (schema) return resolve(schema, doc);
  }
  return {};
}

/** Required field names, one level into required object envelopes. */
function requiredNames(body, doc) {
  const names = [];
  for (const name of body.required ?? []) {
    names.push(name);
    const prop = resolve(body.properties?.[name], doc);
    if (prop.type === "object" || prop.properties) {
      names.push(...(prop.required ?? []));
    }
  }
  return names;
}

/**
 * Models whose task the schema alone gets wrong. Bria and BFL editors need a
 * mask or a named object or light setting NodeTool's image-to-image call
 * does not carry; Sync needs a dubbing script and voice. Wan edit models
 * accept their source video only as a public URL, never inline.
 */
const OVERRIDES = {
  "beeble/switchx": { kind: "video", tasks: ["video_to_video"] },
  "bfl/vto-v1": { kind: "image", tasks: ["image_to_image"] },
  "bfl/erase-v1": { skip: "requires a mask" },
  "bria/image-edit-erase": { skip: "requires a mask" },
  "bria/image-edit-gen-fill": { skip: "requires a mask" },
  "bria/video-edit-erase": { skip: "requires a mask" },
  "bria/image-edit-erase-by-text": { skip: "requires an object name" },
  "bria/image-edit-relight": { skip: "requires light settings" },
  "bria/image-edit-reseason": { skip: "requires a season" },
  "bria/image-edit-product-holding": { skip: "requires product images" },
  "bria/image-edit-product-virtual-tryon": { skip: "requires a person image" },
  // The schema's modalities read as text and image only, but Seedance 2.x and
  // MiniMax H3 also take reference images and audio as content[] parts, as
  // ComfyUI's ByteDance2ReferenceNodeV2 and MinimaxHailuo03ReferenceNode send them.
  "byteplus/dreamina-seedance-2-0-260128": { kind: "video", tasks: ["text_to_video", "image_to_video", "reference_to_video"] },
  "byteplus/dreamina-seedance-2-0-fast-260128": { kind: "video", tasks: ["text_to_video", "image_to_video", "reference_to_video"] },
  "byteplus/dreamina-seedance-2-0-mini": { kind: "video", tasks: ["text_to_video", "image_to_video", "reference_to_video"] },
  "byteplus/dreamina-seedance-2-5-260628": { kind: "video", tasks: ["text_to_video", "image_to_video", "reference_to_video"] },
  "minimax/minimax-h3": { kind: "video", tasks: ["text_to_video", "image_to_video", "reference_to_video"] },
  // Input modalities include image, and ComfyUI's Qwen Image 3 Edit node sends
  // up to three images to these same Router ids in input.messages[0].content.
  "qwen/qwen-image-3.0": { kind: "image", tasks: ["text_to_image", "image_to_image"] },
  "qwen/qwen-image-3.0-pro": { kind: "image", tasks: ["text_to_image", "image_to_image"] },
  "wan/wan3.0-video": { kind: "video", tasks: ["text_to_video", "image_to_video", "reference_to_video"] },
  "wan/wan3.0-video-prime": { kind: "video", tasks: ["text_to_video", "image_to_video", "reference_to_video"] },
  "wan/wan2.7-videoedit": { skip: "takes its source video only as a public URL" },
  "wan/happyhorse-1.0-video-edit": { skip: "takes its source video only as a public URL" },
  "wan/wan2.6-r2v": { skip: "takes reference clips only as public URLs" },
  "synclabs/sync-3": { skip: "requires a dubbing script and voice" }
};

const IMAGE_FIELD = /image|img|mask|frame|^images?$|source_uri/i;
const VIDEO_FIELD = /video/i;
const AUDIO_FIELD = /audio|sound/i;

/** Whether any property name, a few levels deep, looks like an image input. */
function declaresImage(schema, doc, depth = 0) {
  const node = resolve(schema, doc);
  if (depth > 4) return false;
  if (node.items) return declaresImage(node.items, doc, depth + 1);
  for (const [name, prop] of Object.entries(node.properties ?? {})) {
    const p = resolve(prop, doc);
    // An untyped field such as Gemini Interactions' `input` takes typed parts.
    if (p.type === undefined && !p.properties && !p.items && /input|content/.test(name)) return true;
    if (IMAGE_FIELD.test(name) && !/mask|size|format|count|num_/i.test(name)) return true;
    if (declaresImage(p, doc, depth + 1)) return true;
  }
  return false;
}

function tasksFor(inputs, outputs, required, id, takesImage) {
  const has = (m) => inputs.includes(m) && (m !== "image" || takesImage);
  const needsImage = required.some((n) => IMAGE_FIELD.test(n) && !VIDEO_FIELD.test(n));
  const needsVideo = required.some((n) => VIDEO_FIELD.test(n));
  const needsAudio = required.some((n) => AUDIO_FIELD.test(n));

  const needsTaskId = required.find((n) => /(?:^|_)id$/i.test(n) && n !== "voice_id");
  if (needsTaskId) return { skip: `requires ${needsTaskId} from an earlier provider task` };

  if (outputs.includes("video")) {
    if (needsAudio) return { skip: "requires an audio track" };
    if (needsVideo) return { kind: "video", tasks: ["video_to_video"] };
    if (/(?:^|[-/.])r2v(?:$|-)/.test(id)) return { kind: "video", tasks: ["reference_to_video"] };
    const tasks = [];
    const imageOnly = needsImage || /(?:^|[-/.])i2v(?:$|-)|image-?to-?video|image2video/.test(id);
    if (has("text") && !imageOnly) tasks.push("text_to_video");
    if (has("image")) tasks.push("image_to_video");
    if (has("video") && !tasks.length) tasks.push("video_to_video");
    return tasks.length ? { kind: "video", tasks } : { skip: "no video task fits" };
  }
  if (outputs.includes("image")) {
    const tasks = [];
    if (has("text") && !needsImage) tasks.push("text_to_image");
    if (has("image")) tasks.push("image_to_image");
    return tasks.length ? { kind: "image", tasks } : { skip: "no image task fits" };
  }
  if (outputs.includes("text")) return { kind: "text", tasks: ["chat"] };
  if (outputs.includes("audio")) {
    return has("text") && !needsAudio
      ? { kind: "speech", tasks: ["text_to_speech"] }
      : { skip: "audio input" };
  }
  return { skip: `outputs ${outputs.join("+")}` };
}

const models = await listModels();
const entries = [];
const skipped = [];
for (const { id } of [...models].sort((a, b) => a.id.localeCompare(b.id))) {
  const doc = await loadSchema(id);
  const inputs = doc["x-comfy-router-input-modalities"] ?? [];
  const outputs = doc["x-comfy-router-output-modalities"] ?? [];
  const body = bodySchema(doc);
  const result = OVERRIDES[id] ?? tasksFor(inputs, outputs, requiredNames(body, doc), id, declaresImage(body, doc));
  if (result.skip) {
    skipped.push(`${id}: ${result.skip}`);
  } else {
    entries.push({ id, kind: result.kind, tasks: result.tasks });
  }
}

const rows = entries
  .map((e) => `  { id: ${JSON.stringify(e.id)}, kind: "${e.kind}", tasks: [${e.tasks.map((t) => `"${t}"`).join(", ")}] }`)
  .join(",\n");

const source = `/**
 * The Comfy Router models NodeTool can call, with the task each one serves.
 *
 * Generated by \`scripts/generate-comfy-router-catalog.mjs\` from each model's
 * input schema (its input and output modalities and required fields). Do not
 * edit by hand. At runtime the provider intersects this table with the live
 * \`/v2/models\` listing, so a retired model drops out without a release.
 */

export type RouterTask =
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "reference_to_video"
  | "video_to_video"
  | "text_to_speech"
  | "chat";

export interface RouterCatalogEntry {
  id: string;
  kind: "image" | "video" | "speech" | "text";
  tasks: readonly RouterTask[];
}

/** Display name for a Router id: the model slug, tidied. */
export function routerModelName(id: string): string {
  const [provider, ...rest] = id.split("/");
  const slug = rest.join("/").replace(/[-_]/g, " ").replace(/\\b([a-z])/g, (c) => c.toUpperCase());
  return \`\${slug} (\${provider})\`;
}

export const COMFY_ROUTER_CATALOG: readonly RouterCatalogEntry[] = [
${rows}
];
`;

await writeFile(OUT, source);
console.log(`Wrote ${entries.length} models to ${OUT}`);
if (skipped.length) console.error(`Skipped ${skipped.length}:\n  ${skipped.join("\n  ")}`);
