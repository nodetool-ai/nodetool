/**
 * Resolves a sketch debug target into an image document plus its canvas
 * settings.
 *
 * A sketch is named two ways, and both end up in the same shape:
 *
 * - a **JSON file** — either a bare `ImageDocumentData` (`sketch` +
 *   `layerBindings`) or a wrapper carrying one under `document`, as the
 *   `image_documents` row and the `sketch.get` response do;
 * - an **image_documents row id**, read through an injected loader so this
 *   module needs no database.
 *
 * A path that exists on disk wins over an id, so a file named like an id is
 * still readable.
 */
import { existsSync, readFileSync } from "node:fs";
import type { SketchDebugTarget } from "@nodetool-ai/execution/sketch-debug";
import {
  isFiniteNumber,
  isRecord,
  isString
} from "../predicates.js";

/** A decoded JSON document, before anything validates its shape. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** An `image_documents` row as the harness needs it. */
export interface ImageDocumentRecord {
  id: string;
  name?: string | null;
  width?: number;
  height?: number;
  /** camelCase on the API response, snake_case on the row. */
  backgroundColor?: string;
  background_color?: string;
  /** The stored document — a JSON string or an already-parsed object. */
  document: unknown;
}

export interface SketchTargetDeps {
  /** Load an image document by DB id. */
  loadDocument: (id: string) => Promise<ImageDocumentRecord | null>;
}

/** The canvas settings the row carries beside the document. */
export interface SketchCanvasSettings {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

/** The layer stack, read down to what the headless bridge can be seeded with. */
export interface SketchLayerView {
  id: string;
  name: string;
  type: "raster" | "mask" | "group";
}

/** The document read as a canvas plus a layer stack. */
export interface SketchDocumentView {
  version: number;
  canvas: SketchCanvasSettings;
  layers: SketchLayerView[];
  activeLayerId: string;
  maskLayerId: string | null;
}

export interface ResolvedSketchTarget {
  target: SketchDebugTarget;
  /** The document exactly as loaded — validation's input, unrepaired. */
  raw: unknown;
  /** The same document, read as a canvas + layer stack. */
  document: SketchDocumentView;
  meta: SketchCanvasSettings;
}

const numberOr = (value: unknown): number | undefined =>
  isFiniteNumber(value) ? value : undefined;

/** Read width/height/background off whatever wrapper carried the document. */
function settingsOf(raw: unknown): SketchCanvasSettings {
  if (!isRecord(raw)) return {};
  const settings: SketchCanvasSettings = {};
  const width = numberOr(raw.width);
  const height = numberOr(raw.height);
  const background =
    isString(raw.backgroundColor)
      ? raw.backgroundColor
      : isString(raw.background_color)
        ? raw.background_color
        : undefined;
  if (width !== undefined) settings.width = width;
  if (height !== undefined) settings.height = height;
  if (background !== undefined) settings.backgroundColor = background;
  return settings;
}

/** A document is anything with a `sketch` object and a `layerBindings` array. */
const looksLikeDocument = (value: JsonValue): boolean =>
  isRecord(value) &&
  isRecord(value.sketch) &&
  Array.isArray(value.layerBindings);

/**
 * The document a target carries, unwrapping a `document` field (string or
 * object) when there is one. Never throws — an unreadable document is a
 * validation finding, not a crash.
 */
function documentOf(raw: unknown): JsonValue {
  // SAFETY: a target is read from a JSON file or a json column, so every
  // branch below carries decoded JSON.
  if (!isRecord(raw)) return raw as JsonValue;
  const inner = raw.document;
  if (isString(inner)) {
    try {
      return JSON.parse(inner);
    } catch {
      return inner;
    }
  }
  // SAFETY: same JSON provenance as the branch above.
  if (inner !== undefined) return inner as JsonValue;
  return raw as JsonValue;
}

const layerType = (value: unknown): SketchLayerView["type"] =>
  value === "mask" || value === "group" ? value : "raster";

/** Read a document as a canvas + layer stack, defaulting what is missing. */
function asDocument(raw: JsonValue): SketchDocumentView {
  const record = isRecord(raw) ? raw : {};
  const sketch = isRecord(record.sketch) ? record.sketch : {};
  const layers: SketchLayerView[] = [];
  for (const entry of Array.isArray(sketch.layers) ? sketch.layers : []) {
    if (!isRecord(entry) || !isString(entry.id)) continue;
    layers.push({
      id: entry.id,
      name: isString(entry.name) ? entry.name : entry.id,
      type: layerType(entry.type)
    });
  }
  return {
    version: numberOr(sketch.version) ?? 1,
    canvas: settingsOf(sketch.canvas),
    layers,
    activeLayerId:
      isString(sketch.activeLayerId) ? sketch.activeLayerId : "",
    maskLayerId:
      isString(sketch.maskLayerId) ? sketch.maskLayerId : null
  };
}

/** Resolve a sketch target: a JSON file path or an image document row id. */
export async function resolveSketchTarget(
  ref: string,
  deps: SketchTargetDeps
): Promise<ResolvedSketchTarget> {
  if (existsSync(ref)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ref, "utf8"));
    } catch (e) {
      throw new Error(`${ref} is not valid JSON: ${(e as Error).message}`);
    }
    const raw = documentOf(parsed);
    if (!looksLikeDocument(raw)) {
      throw new Error(
        `${ref} is not an image document (no \`sketch\`/\`layerBindings\`, and no \`document\` field carrying them).`
      );
    }
    const name =
      isRecord(parsed) && isString(parsed.name)
        ? parsed.name
        : undefined;
    const document = asDocument(raw);
    const target: SketchDebugTarget = { kind: "file", ref };
    if (name) {
      target.name = name;
    }
    return {
      target,
      raw,
      document,
      // The wrapper's own width/height, never the canvas's: the validator
      // compares the two, so folding one into the other hides the mismatch.
      meta: settingsOf(parsed)
    };
  }

  const record = await deps.loadDocument(ref);
  if (!record) {
    throw new Error(`Image document not found: ${ref}`);
  }
  const raw = documentOf(record);
  const document = asDocument(raw);
  const target: SketchDebugTarget = { kind: "id", ref };
  if (record.name) {
    target.name = record.name;
  }
  return {
    target,
    raw,
    document,
    meta: settingsOf(record)
  };
}
