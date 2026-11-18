/**
 * Sketches as files in the project folder (PRD T5):
 * `Sketches/<name>.sketch.ora`, one OpenRaster zip per sketch.
 *
 * | Entry | Content |
 * | --- | --- |
 * | `mimetype` | `image/openraster`, first and stored, as OpenRaster asks |
 * | `stack.xml` | The layer stack for other OpenRaster readers: order, position, opacity, visibility, blend mode, names, groups as nested stacks |
 * | `data/<layerId>.png` | The raster of each raster and mask layer, stored |
 * | `data/<layerId>.composite.png` | A vector layer, or a raster layer with a scale, rotation or warp, rendered alone at canvas size for `stack.xml` |
 * | `mergedimage.png`, `Thumbnails/thumbnail.png` | The flattened sketch, and the same at most 256 px on a side |
 * | `nodetool/sketch.json` | The file's JSON: `format`, `version`, `id`, `width`, `height`, `background_color`, `workflow_id` and `document` |
 * | `nodetool/history/<entry>/<layerId>.png` | The rasters of the undo history |
 *
 * The row keeps each raster as a base64 data URL, alone or inside the
 * `ntlayer:` envelope with its bounds. In `nodetool/sketch.json` that image
 * is the path of its PNG in the zip, and an envelope is the object
 * `{ "ntlayer": { ...envelope } }`, so no base64 stays in the JSON. A vector
 * layer keeps its SVG data URL. Reading the zip puts the images back, so the
 * rest of NodeTool sees the document the row holds.
 *
 * A zip without `nodetool/sketch.json`, saved by Krita or GIMP, is read from
 * `stack.xml` as plain raster layers. Its import keeps the sketch as it was
 * as a version, as every import does.
 *
 * The file name is the sketch's name and the file holds no `name` field.
 * Owner, the thumbnail asset and timestamps stay in the database. The sync
 * itself is `document-file-sync.ts`. This module is the sketch kind.
 *
 * Loading this module installs the sync on the `ImageDocument` model, so
 * every write of a sketch row writes the file.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import {
  ImageDocument,
  ImageDocumentVersion,
  setImageDocumentFileSync
} from "@nodetool-ai/models";
import {
  DOCUMENT_FILE_VERSION,
  documentFileSync,
  migrateDocumentFiles,
  type DocumentFileAdapter,
  type DocumentFileCodec,
  type DocumentFileContent,
  type DocumentFileFailure
} from "./document-file-sync.js";

/** The directory sketch files are written in. */
export const SKETCH_FILE_DIRECTORY = "Sketches";
/** The end of every sketch file name. */
export const SKETCH_FILE_SUFFIX = ".sketch.ora";
/** The `format` value of a sketch file's JSON. */
export const SKETCH_FILE_FORMAT = "nodetool.sketch";
/** The MIME type of a sketch file. */
export const SKETCH_FILE_CONTENT_TYPE = "image/openraster";
/** The zip entry that holds the sketch document. */
export const SKETCH_DOCUMENT_ENTRY = "nodetool/sketch.json";
/** The zip entry that holds the thumbnail. */
export const SKETCH_THUMBNAIL_ENTRY = "Thumbnails/thumbnail.png";
/** Longest side of the thumbnail, in pixels. */
export const SKETCH_THUMBNAIL_SIZE = 256;
/** The name of the version that keeps a sketch as it was before an import. */
export const SKETCH_FILE_EDIT_VERSION_NAME = "Before file edit";
/** The name of the version that keeps a file edit a save in NodeTool replaced. */
export const SKETCH_FILE_REPLACED_VERSION_NAME = "File edit replaced by a save";

/** The sketch fields a sketch file carries. */
export interface SketchFileFields {
  width: number;
  height: number;
  background_color: string;
  workflow_id: string | null;
  /** The document as an object. The row keeps it as JSON text. */
  document: Record<string, unknown>;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};
const IMAGE_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(IMAGE_EXTENSIONS).map(([type, ext]) => [ext, type])
);
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,/;
/** An image path in `nodetool/sketch.json`. */
const IMAGE_PATH = /^(?:data|nodetool\/history)\/[^/]+(?:\/[^/]+)?\.(png|jpg|webp)$/;
const SAFE_FILE_STEM = /^[A-Za-z0-9_-]{1,100}$/;
const NTLAYER = "ntlayer:";
/**
 * The date every zip entry carries, so that equal content gives equal bytes.
 * The file's own modification time says when it was written.
 */
const ENTRY_DATE = new Date(2000, 0, 1);
const STORED = { level: 0 } as const;

/** OpenRaster `composite-op` for a NodeTool blend mode. */
const COMPOSITE_OPS: Record<string, string> = {
  normal: "svg:src-over",
  multiply: "svg:multiply",
  screen: "svg:screen",
  overlay: "svg:overlay",
  darken: "svg:darken",
  lighten: "svg:lighten",
  "color-dodge": "svg:color-dodge",
  "color-burn": "svg:color-burn",
  "hard-light": "svg:hard-light",
  "soft-light": "svg:soft-light",
  difference: "svg:difference",
  exclusion: "svg:exclusion",
  add: "svg:plus"
};
const BLEND_MODES: Record<string, string> = Object.fromEntries(
  Object.entries(COMPOSITE_OPS).map(([mode, op]) => [op, mode])
);

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fileText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function base64OfText(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function textOfBase64(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf8");
}

/** The sketch document of a file's JSON, or null when it has none. */
function sketchOf(file: Json): Json | null {
  const document = file["document"];
  if (!isRecord(document)) return null;
  const sketch = document["sketch"];
  return isRecord(sketch) ? sketch : null;
}

function layersOf(file: Json): Json[] {
  const layers = sketchOf(file)?.["layers"];
  return Array.isArray(layers) ? layers.filter(isRecord) : [];
}

function historyOf(file: Json): Json[] {
  const history = sketchOf(file)?.["history"];
  return Array.isArray(history) ? history.filter(isRecord) : [];
}

/** File name stems for layer IDs: the ID when it is safe, unique in the zip. */
function stemsOf(ids: readonly unknown[]): string[] {
  const used = new Set<string>();
  return ids.map((id, index) => {
    let stem =
      typeof id === "string" && SAFE_FILE_STEM.test(id) ? id : `layer-${index + 1}`;
    while (used.has(stem.toLowerCase())) stem = `${stem}-${index + 1}`;
    used.add(stem.toLowerCase());
    return stem;
  });
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** The bytes of a raster data URL, with its extension. Null for anything else. */
function rasterOf(source: unknown): { bytes: Uint8Array; ext: string } | null {
  if (typeof source !== "string") return null;
  const match = IMAGE_DATA_URL.exec(source);
  if (!match) return null;
  return {
    bytes: Buffer.from(source.slice(match[0].length), "base64"),
    ext: IMAGE_EXTENSIONS[match[1] as string] as string
  };
}

/** The envelope inside an `ntlayer:` layer data string, or null. */
function envelopeOf(data: unknown): Json | null {
  if (typeof data !== "string" || !data.startsWith(NTLAYER)) return null;
  try {
    const value: unknown = JSON.parse(textOfBase64(data.slice(NTLAYER.length)));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Take the raster out of a layer `data` value: a bare data URL becomes the
 * path `<base>.<ext>`, an envelope with a raster becomes `{ ntlayer }` with
 * that path as its image. Anything else stays as it is.
 */
function externalize(
  data: unknown,
  base: string,
  entries: Map<string, Uint8Array>
): { data: unknown; raster: string | null } {
  const bare = rasterOf(data);
  if (bare) {
    const path = `${base}.${bare.ext}`;
    entries.set(path, bare.bytes);
    return { data: path, raster: path };
  }
  const envelope = envelopeOf(data);
  const inner = envelope ? rasterOf(envelope["image"]) : null;
  if (envelope && inner) {
    const path = `${base}.${inner.ext}`;
    entries.set(path, inner.bytes);
    return { data: { ntlayer: { ...envelope, image: path } }, raster: path };
  }
  return { data, raster: null };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Whether a layer's raster sits on the canvas unscaled and unrotated. */
function isPlaced(transform: unknown): boolean {
  if (!isRecord(transform)) return true;
  if (transform["kind"] === "quad") return false;
  return (
    numberOf(transform["scaleX"], 1) === 1 &&
    numberOf(transform["scaleY"], 1) === 1 &&
    numberOf(transform["rotation"], 0) === 0
  );
}

/** Where a placed raster's top-left corner is on the canvas. */
function originOf(layer: Json, envelope: Json | null): { x: number; y: number } {
  const transform = isRecord(layer["transform"]) ? layer["transform"] : {};
  const bounds = isRecord(envelope?.["bounds"])
    ? envelope["bounds"]
    : isRecord(layer["contentBounds"])
      ? layer["contentBounds"]
      : {};
  return {
    x: Math.round(numberOf(bounds["x"], 0) + numberOf(transform["x"], 0)),
    y: Math.round(numberOf(bounds["y"], 0) + numberOf(transform["y"], 0))
  };
}

/** A layer of the stack: what `stack.xml` names for it. */
interface StackLayer {
  layer: Json;
  /** The PNG `stack.xml` points at, and where it goes. Null for a group or an empty layer. */
  src: { path: string; x: number; y: number } | null;
}

function stackXml(width: number, height: number, stack: readonly StackLayer[]): string {
  const children = new Map<string | null, StackLayer[]>();
  const ids = new Set(stack.map(({ layer }) => layer["id"]));
  for (const entry of stack) {
    const parent = entry.layer["parentId"];
    const key = typeof parent === "string" && ids.has(parent) ? parent : null;
    children.set(key, [...(children.get(key) ?? []), entry]);
  }
  const attributes = (layer: Json): string => {
    const blend = typeof layer["blendMode"] === "string" ? layer["blendMode"] : "normal";
    return [
      `name="${escapeXml(String(layer["name"] ?? layer["id"] ?? ""))}"`,
      `opacity="${numberOf(layer["opacity"], 1)}"`,
      `visibility="${layer["visible"] === false ? "hidden" : "visible"}"`,
      `composite-op="${COMPOSITE_OPS[blend] ?? "svg:src-over"}"`
    ].join(" ");
  };
  const render = (parent: string | null, depth: number): string[] => {
    const indent = "  ".repeat(depth);
    // OpenRaster lists the top of the stack first. The sketch lists the bottom first.
    return [...(children.get(parent) ?? [])].reverse().flatMap(({ layer, src }) => {
      if (layer["type"] === "group") {
        return [
          `${indent}<stack ${attributes(layer)}>`,
          ...render(String(layer["id"]), depth + 1),
          `${indent}</stack>`
        ];
      }
      if (!src) return [];
      return [
        `${indent}<layer ${attributes(layer)} src="${escapeXml(src.path)}" x="${src.x}" y="${src.y}"/>`
      ];
    });
  };
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<image version="0.0.5" w="${width}" h="${height}">`,
    `  <stack>`,
    ...render(null, 2),
    `  </stack>`,
    `</image>`,
    ""
  ].join("\n");
}

/** Renders of the document this module needs, from the headless sketch renderer. */
async function renderer(): Promise<
  (document: unknown, options?: { width?: number; height?: number; layerId?: string }) => Promise<Uint8Array>
> {
  // Loaded on the first write of a sketch file, so that loading this module
  // does not load the canvas.
  const { renderSketch } = await import("@nodetool-ai/agents/sketch-render");
  return async (document, options = {}) => (await renderSketch(document, options)).bytes;
}

/** The zip for the document text of a sketch file. Equal text gives equal bytes. */
export async function encodeSketchFile(text: string): Promise<Uint8Array> {
  const inline = JSON.parse(text) as Json;
  const file = JSON.parse(text) as Json;
  const width = numberOf(file["width"], 1);
  const height = numberOf(file["height"], 1);
  const images = new Map<string, Uint8Array>();
  const render = await renderer();

  const layers = layersOf(file);
  const stems = stemsOf(layers.map((layer) => layer["id"]));
  const stack: StackLayer[] = [];
  for (const [index, layer] of layers.entries()) {
    const stem = stems[index] as string;
    const envelope = envelopeOf(layer["data"]);
    const { data, raster } = externalize(layer["data"], `data/${stem}`, images);
    layer["data"] = data;
    let src: StackLayer["src"] = null;
    if (raster?.endsWith(".png") && isPlaced(layer["transform"])) {
      src = { path: raster, ...originOf(layer, envelope) };
    } else if (layer["type"] !== "group" && layer["data"] !== null && layer["data"] !== undefined) {
      // OpenRaster places a PNG by its corner, so a vector layer or a
      // scaled, rotated or warped raster is drawn alone at canvas size.
      const path = `data/${stem}.composite.png`;
      images.set(path, await render(inline["document"], { layerId: String(layer["id"]) }));
      src = { path, x: 0, y: 0 };
    }
    stack.push({ layer, src });
  }

  for (const [entryIndex, entry] of historyOf(file).entries()) {
    const snapshots = entry["layerSnapshots"];
    if (!isRecord(snapshots)) continue;
    const keys = Object.keys(snapshots);
    const snapshotStems = stemsOf(keys);
    for (const [index, key] of keys.entries()) {
      snapshots[key] = externalize(
        snapshots[key],
        `nodetool/history/${entryIndex}/${snapshotStems[index] as string}`,
        images
      ).data;
    }
  }

  const merged = await render(inline["document"]);
  const scale = Math.min(1, SKETCH_THUMBNAIL_SIZE / Math.max(width, height));
  const thumbnail = await render(inline["document"], {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  });

  const entries: Zippable = {
    mimetype: [strToU8(SKETCH_FILE_CONTENT_TYPE), STORED],
    "stack.xml": strToU8(stackXml(width, height, stack)),
    "mergedimage.png": [merged, STORED],
    [SKETCH_THUMBNAIL_ENTRY]: [thumbnail, STORED]
  };
  for (const [path, bytes] of images) entries[path] = [bytes, STORED];
  entries[SKETCH_DOCUMENT_ENTRY] = strToU8(fileText(file));
  return zipSync(entries, { mtime: ENTRY_DATE });
}

// ── Reading ─────────────────────────────────────────────────────────────────

function dataUrlOf(path: string, bytes: Uint8Array): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return `data:${IMAGE_TYPES[ext] ?? "image/png"};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * Put the raster back into a layer `data` value of `nodetool/sketch.json`.
 * A path whose image is not in the zip stays a path, which the import refuses.
 */
function internalize(data: unknown, entries: Record<string, Uint8Array>): unknown {
  if (typeof data === "string" && IMAGE_PATH.test(data)) {
    const bytes = entries[data];
    return bytes ? dataUrlOf(data, bytes) : data;
  }
  if (isRecord(data) && isRecord(data["ntlayer"])) {
    const envelope = data["ntlayer"];
    const image = envelope["image"];
    if (typeof image === "string" && IMAGE_PATH.test(image)) {
      const bytes = entries[image];
      if (!bytes) return data;
      envelope["image"] = dataUrlOf(image, bytes);
    }
    return `${NTLAYER}${base64OfText(JSON.stringify(envelope))}`;
  }
  return data;
}

function attributesOf(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attributes[match[1] as string] = (match[2] as string)
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  return attributes;
}

/** Width and height of a PNG, from its header. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * The file's JSON for an OpenRaster zip another app saved: each layer of
 * `stack.xml` with a PNG becomes a raster layer, groups flattened.
 */
function importedSketchFile(entries: Record<string, Uint8Array>): Json {
  const xml = entries["stack.xml"];
  if (!xml) {
    throw new Error(`The file is no sketch: it has neither ${SKETCH_DOCUMENT_ENTRY} nor stack.xml`);
  }
  const text = strFromU8(xml);
  const image = attributesOf(/<image\b[^>]*>/.exec(text)?.[0] ?? "");
  const width = Number.parseInt(image["w"] ?? "", 10);
  const height = Number.parseInt(image["h"] ?? "", 10);
  if (!(width > 0 && height > 0)) {
    throw new Error("The stack.xml of the file has no valid image size");
  }
  const layers: Json[] = [];
  const tags = [...text.matchAll(/<layer\b[^>]*>/g)].map((match) => attributesOf(match[0]));
  for (const [index, tag] of tags.entries()) {
    const src = tag["src"] ?? "";
    const bytes = entries[src];
    if (!bytes) {
      throw new Error(`The image of layer "${tag["name"] ?? index + 1}" is missing: ${src}`);
    }
    const size = pngSize(bytes) ?? { width, height };
    const x = Number.parseFloat(tag["x"] ?? "0") || 0;
    const y = Number.parseFloat(tag["y"] ?? "0") || 0;
    const opacity = Number.parseFloat(tag["opacity"] ?? "1");
    layers.push({
      id: `layer-${index + 1}`,
      name: tag["name"] || `Layer ${index + 1}`,
      type: "raster",
      visible: tag["visibility"] !== "hidden",
      opacity: Number.isFinite(opacity) ? opacity : 1,
      locked: false,
      alphaLock: false,
      blendMode: BLEND_MODES[tag["composite-op"] ?? ""] ?? "normal",
      data: dataUrlOf(src, bytes),
      transform: { x, y },
      contentBounds: { x: 0, y: 0, width: size.width, height: size.height },
      effects: []
    });
  }
  // `stack.xml` lists the top of the stack first. The sketch lists the bottom first.
  layers.reverse();
  return {
    format: SKETCH_FILE_FORMAT,
    version: DOCUMENT_FILE_VERSION,
    width,
    height,
    background_color: "#ffffff",
    workflow_id: null,
    document: {
      sketch: {
        version: 3,
        canvas: { width, height, backgroundColor: "#ffffff" },
        layers,
        activeLayerId: layers.at(-1)?.["id"] ?? "",
        maskLayerId: null
      },
      layerBindings: []
    }
  };
}

/** The document text of a sketch zip. Throws when the bytes are no sketch file. */
export async function decodeSketchFile(bytes: Uint8Array): Promise<string> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The file is not a zip: ${reason}`);
  }
  const mimetype = entries["mimetype"];
  if (mimetype && strFromU8(mimetype).trim() !== SKETCH_FILE_CONTENT_TYPE) {
    throw new Error(`The file's mimetype must be "${SKETCH_FILE_CONTENT_TYPE}"`);
  }
  const json = entries[SKETCH_DOCUMENT_ENTRY];
  if (!json) return fileText(importedSketchFile(entries));
  let file: unknown;
  try {
    file = JSON.parse(strFromU8(json));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The ${SKETCH_DOCUMENT_ENTRY} of the file is not valid JSON: ${reason}`);
  }
  if (!isRecord(file)) {
    throw new Error(`The ${SKETCH_DOCUMENT_ENTRY} of the file is not a JSON object`);
  }
  for (const layer of layersOf(file)) {
    layer["data"] = internalize(layer["data"], entries);
  }
  for (const entry of historyOf(file)) {
    const snapshots = entry["layerSnapshots"];
    if (!isRecord(snapshots)) continue;
    for (const key of Object.keys(snapshots)) {
      snapshots[key] = internalize(snapshots[key], entries);
    }
  }
  return fileText(file);
}

/** The zip a sketch file is. */
export const sketchFileCodec: DocumentFileCodec = {
  contentType: SKETCH_FILE_CONTENT_TYPE,
  encode: encodeSketchFile,
  decode: decodeSketchFile
};

/** The thumbnail PNG of a sketch file, or null when it has none. */
export function sketchFileThumbnail(bytes: Uint8Array): Uint8Array | null {
  try {
    return unzipSync(bytes, {
      filter: (entry) => entry.name === SKETCH_THUMBNAIL_ENTRY
    })[SKETCH_THUMBNAIL_ENTRY] ?? null;
  } catch {
    return null;
  }
}

// ── The kind ────────────────────────────────────────────────────────────────

/** A layer image a zip did not hold, named for the error. */
function missingImage(data: unknown): string | null {
  if (typeof data === "string" && IMAGE_PATH.test(data)) return data;
  if (isRecord(data)) {
    const image = isRecord(data["ntlayer"]) ? data["ntlayer"]["image"] : undefined;
    return typeof image === "string" ? image : JSON.stringify(data);
  }
  return null;
}

/**
 * Check the body of a sketch file with the rule every write of a sketch row
 * applies, and refuse a layer whose image is not in the zip.
 */
async function parseSketchFile(
  body: Json
): Promise<DocumentFileContent<SketchFileFields>> {
  const document = body["document"];
  if (!isRecord(document)) {
    return { ok: false, error: '"document" must be an object' };
  }
  if (!isRecord(document["sketch"]) || !Array.isArray(document["layerBindings"])) {
    return {
      ok: false,
      error: '"document" must contain "sketch" and "layerBindings"'
    };
  }
  for (const layer of layersOf(body)) {
    const missing = missingImage(layer["data"]);
    if (missing !== null) {
      return {
        ok: false,
        error: `The image of layer "${String(layer["id"])}" is missing: ${missing}`
      };
    }
  }
  for (const entry of historyOf(body)) {
    const snapshots = entry["layerSnapshots"];
    if (!isRecord(snapshots)) continue;
    for (const [key, value] of Object.entries(snapshots)) {
      const missing = missingImage(value);
      if (missing !== null) {
        return {
          ok: false,
          error: `The history image of layer "${key}" is missing: ${missing}`
        };
      }
    }
  }
  for (const key of ["width", "height"] as const) {
    const value = body[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return { ok: false, error: `"${key}" must be a positive integer` };
    }
  }
  const background = body["background_color"];
  if (typeof background !== "string") {
    return { ok: false, error: '"background_color" must be a string' };
  }
  const workflowId = body["workflow_id"] ?? null;
  if (workflowId !== null && typeof workflowId !== "string") {
    return { ok: false, error: '"workflow_id" must be a string or null' };
  }
  return {
    ok: true,
    fields: {
      width: body["width"] as number,
      height: body["height"] as number,
      background_color: background,
      workflow_id: workflowId,
      document
    }
  };
}

/** The sketch kind of {@link DocumentFileAdapter}. */
export const sketchFileAdapter: DocumentFileAdapter<
  ImageDocument,
  SketchFileFields
> = {
  kind: "sketch",
  directory: SKETCH_FILE_DIRECTORY,
  suffix: SKETCH_FILE_SUFFIX,
  format: SKETCH_FILE_FORMAT,
  untitled: "Untitled sketch",
  codec: sketchFileCodec,

  // SAFETY: the model refuses to store a document that is not an object.
  fieldsOf: (row) => ({
    width: row.width,
    height: row.height,
    background_color: row.background_color,
    workflow_id: row.workflow_id,
    document: JSON.parse(row.document) as Json
  }),

  body: (fields) => ({
    width: fields.width,
    height: fields.height,
    background_color: fields.background_color,
    workflow_id: fields.workflow_id,
    document: fields.document
  }),

  parse: parseSketchFile,

  list: (userId, projectIds) =>
    ImageDocument.listForProjects(userId, projectIds),

  exists: (id) => ImageDocument.existsExactly(id),

  async snapshot(row, reason = "before-import") {
    // For a replaced file the row is a copy that carries the file's fields,
    // so its document is the object the file holds and not the stored text.
    const document: unknown = row.document;
    await ImageDocumentVersion.snapshot(
      {
        id: row.id,
        user_id: row.user_id,
        width: row.width,
        height: row.height,
        background_color: row.background_color,
        document:
          typeof document === "string" ? document : JSON.stringify(document)
      },
      {
        saveType: "manual",
        name:
          reason === "replaced-file"
            ? SKETCH_FILE_REPLACED_VERSION_NAME
            : SKETCH_FILE_EDIT_VERSION_NAME
      }
    );
  },

  update(row, fields, name) {
    const changes: Parameters<typeof ImageDocument.updateFieldsIfUnchanged>[2] = {};
    if (fields.document !== undefined) {
      changes.document = JSON.stringify(fields.document);
    }
    if (fields.width !== undefined) changes.width = fields.width;
    if (fields.height !== undefined) changes.height = fields.height;
    if (fields.background_color !== undefined) {
      changes.background_color = fields.background_color;
    }
    if (fields.workflow_id !== undefined) changes.workflow_id = fields.workflow_id;
    if (name !== undefined) changes.name = name;
    return ImageDocument.updateFieldsIfUnchanged(row.id, row.updated_at, changes);
  },

  create: ({ id, userId, projectId, name, fields }) =>
    ImageDocument.insertNew({
      id,
      user_id: userId,
      project_id: projectId,
      name,
      width: fields.width,
      height: fields.height,
      background_color: fields.background_color,
      workflow_id: fields.workflow_id,
      document: JSON.stringify(fields.document)
    }),

  setFileState: (id, state) => ImageDocument.setFileState(id, state)
};

setImageDocumentFileSync(documentFileSync(sketchFileAdapter));

/**
 * Write a file for every sketch that has none yet, of every user or of
 * `userId`: the sketches from before project folders. Returns how many files
 * were written.
 */
export function migrateSketchFiles(
  userId?: string,
  onFailure?: (failure: DocumentFileFailure) => void
): Promise<number> {
  return migrateDocumentFiles(
    sketchFileAdapter,
    () => ImageDocument.projectsWithUnwrittenFiles(userId),
    onFailure
  );
}
