/**
 * The `sketches` capability module.
 *
 * Sketch capabilities: list and create, the five version tools, the headless
 * layer editor, validate, and delete. The version tools used to be
 * `../tools/sketch-version-tools.ts`; the editor was `sketch-edit-tools.ts`;
 * `validate_sketch` lived beside the workflow tools in `../tools/mcp-tools.ts`.
 *
 * Wire names, descriptions and schemas are unchanged: the old classes survive
 * as thin `CapabilityTool` subclasses over these implementations.
 *
 * The tRPC-only sketch loader `validate_sketch` took as a constructor argument
 * is `run.loaders?.sketch`. Every heavy dependency (`@nodetool-ai/models`, the
 * sketch validator, the eval surface's blend-mode table) is imported inside the
 * implementation that needs it.
 *
 * Design: docs/tool-class-retirement-design.md § "Migration".
 */

import type { JsonSchema } from "@nodetool-ai/runtime";
import type {
  ImageDocument,
  ImageDocumentData,
  ImageDocumentVersion
} from "@nodetool-ai/models";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listSketchesSpec,
  createSketchSpec,
  getSketchSpec,
  listSketchVersionsSpec,
  getSketchVersionSpec,
  createSketchVersionSpec,
  restoreSketchVersionSpec,
  deleteSketchVersionSpec,
  editSketchSpec,
  validateSketchSpec,
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT,
  SAVE_TYPE_PROPERTY,
  LIST_SKETCHES_SCHEMA,
  CREATE_SKETCH_SCHEMA,
  GET_SKETCH_SCHEMA,
  LIST_SKETCH_VERSIONS_SCHEMA,
  GET_SKETCH_VERSION_SCHEMA,
  CREATE_SKETCH_VERSION_SCHEMA,
  RESTORE_SKETCH_VERSION_SCHEMA,
  DELETE_SKETCH_VERSION_SCHEMA,
  EDIT_SKETCH_SCHEMA,
  VALIDATE_SKETCH_SCHEMA,
  deleteSketchSpec
} from "./sketches.specs.js";
import {
  isFiniteNumber,
  isNonBlankString,
  isNumber,
  isRecord,
  isString
} from "../utils/type-guards.js";

export {
  DEFAULT_VERSION_LIMIT,
  MAX_VERSION_LIMIT,
  SAVE_TYPE_PROPERTY,
  LIST_SKETCHES_SCHEMA,
  CREATE_SKETCH_SCHEMA,
  GET_SKETCH_SCHEMA,
  LIST_SKETCH_VERSIONS_SCHEMA,
  GET_SKETCH_VERSION_SCHEMA,
  CREATE_SKETCH_VERSION_SCHEMA,
  RESTORE_SKETCH_VERSION_SCHEMA,
  DELETE_SKETCH_VERSION_SCHEMA,
  EDIT_SKETCH_SCHEMA,
  VALIDATE_SKETCH_SCHEMA
} from "./sketches.specs.js";
import { resolveProjectId } from "./project-scope.js";
import { encodeSketchLayerData } from "@nodetool-ai/protocol/api-schemas/sketch.js";

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

async function loadSketch(
  run: CapabilityRun,
  sketchId: unknown
): Promise<ImageDocument | ToolError> {
  if (!isString(sketchId) || !sketchId) {
    return {
      error: "image_document_id is required (use list_sketches to find one)."
    };
  }
  const { ImageDocument } = await import("@nodetool-ai/models");
  const doc = await ImageDocument.findById(sketchId);
  // A sketch owned by someone else reads as missing — the same rule the tRPC
  // router's ownership check applies.
  if (!doc || doc.user_id !== run.context.userId) {
    return { error: `Sketch ${sketchId} was not found.` };
  }
  return doc;
}

/** The list-item shape the tRPC router returns for a snapshot. */
function toVersionListItem(version: ImageDocumentVersion) {
  return {
    id: version.id,
    version: version.version,
    name: version.name,
    saveType: version.save_type,
    width: version.width,
    height: version.height,
    backgroundColor: version.background_color,
    createdAt: version.created_at
  };
}

/**
 * A snapshot's document is JSON text on SQLite and an object on Postgres, so
 * parse only when it is a string. A row that is neither is corrupt, and saying
 * so beats handing back a string the caller will treat as a document.
 */
function parseVersionDocument(raw: unknown): unknown | ToolError {
  if (!isString(raw)) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: "The stored version document is not valid JSON." };
  }
}

/** One-line count of what a validation found. */
function validationSummary(validation: {
  errors: unknown[];
  warnings: unknown[];
}): string {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  if (errors === 0 && warnings === 0) return "No issues found.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function versionNumber(value: unknown): number | ToolError {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    return {
      error:
        "version must be a positive integer (use list_sketch_versions to see the available ones)."
    };
  }
  return n;
}

const DEFAULT_CANVAS_SIZE = 1024;
const DEFAULT_BACKGROUND = "#ffffff";

/** A blank raster document matching `sketch.create` on the tRPC router. */
function emptySketchDocument(
  width: number,
  height: number,
  backgroundColor: string
): ImageDocumentData {
  const layerId = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    sketch: {
      version: 3,
      canvas: { width, height, backgroundColor },
      layers: [
        {
          id: layerId,
          name: "Layer 1",
          type: "raster",
          visible: true,
          opacity: 1,
          locked: false,
          alphaLock: false,
          blendMode: "normal",
          data: null,
          transform: { x: 0, y: 0 },
          contentBounds: { x: 0, y: 0, width, height },
          effects: []
        }
      ],
      activeLayerId: layerId,
      maskLayerId: null,
      activeTool: "brush",
      viewport: { zoom: 1, pan: { x: 0, y: 0 } },
      history: [],
      historyIndex: -1,
      metadata: { createdAt: now, updatedAt: now }
    },
    layerBindings: []
  };
}

function canvasSize(value: unknown, fallback: number): number | ToolError {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 1) {
    return { error: "width and height must be positive integers." };
  }
  return value;
}

const createSketch: CapabilityExport = {
  spec: createSketchSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const name = params["name"];
    if (!isNonBlankString(name)) {
      return { error: "name is required and must be a non-empty string." };
    }
    const width = canvasSize(params["width"], DEFAULT_CANVAS_SIZE);
    if (isError(width)) return width;
    const height = canvasSize(params["height"], DEFAULT_CANVAS_SIZE);
    if (isError(height)) return height;
    const backgroundColor = isNonBlankString(params["background_color"])
      ? params["background_color"].trim()
      : DEFAULT_BACKGROUND;
    const projectId = resolveProjectId(run, params);
    const requestedId = isNonBlankString(params["id"])
      ? params["id"].trim()
      : undefined;

    const { ImageDocument } = await import("@nodetool-ai/models");
    if (requestedId) {
      const existing = await ImageDocument.findById(requestedId);
      if (existing) {
        if (existing.user_id !== userId) {
          return { error: `A sketch with id ${requestedId} already exists.` };
        }
        return {
          ok: true,
          image_document_id: existing.id,
          name: existing.name,
          width: existing.width,
          height: existing.height,
          project_id: existing.project_id,
          updated_at: existing.updated_at
        };
      }
    }

    const now = new Date().toISOString();
    const document = emptySketchDocument(width, height, backgroundColor);
    const fields: ConstructorParameters<typeof ImageDocument>[0] = {
      user_id: userId,
      project_id: projectId,
      name: name.trim(),
      width,
      height,
      background_color: backgroundColor,
      document: JSON.stringify(document),
      created_at: now,
      updated_at: now
    };
    if (requestedId) {
      fields.id = requestedId;
    }
    const doc = new ImageDocument(fields);
    await doc.save();
    return {
      ok: true,
      image_document_id: doc.id,
      name: doc.name,
      width: doc.width,
      height: doc.height,
      project_id: doc.project_id,
      updated_at: doc.updated_at
    };
  }
};

const listSketches: CapabilityExport = {
  spec: listSketchesSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { ImageDocument } = await import("@nodetool-ai/models");
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const query =
      isString(params["query"])
        ? params["query"].trim().toLowerCase()
        : "";
    // Filter after the read: the name filter is not indexed, and the per-user
    // limit is what bounds the scan.
    const rows = await ImageDocument.listByUser(userId, 100);
    const matching = query
      ? rows.filter((row) => row.name.toLowerCase().includes(query))
      : rows;
    return {
      sketches: matching.slice(0, limit).map((row) => ({
        id: row.id,
        name: row.name,
        width: row.width,
        height: row.height,
        updated_at: row.updated_at
      }))
    };
  }
};

const getSketch: CapabilityExport = {
  spec: getSketchSpec,
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;
    return { sketch: doc.toResponse() };
  }
};

const listSketchVersions: CapabilityExport = {
  spec: listSketchVersionsSpec,
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const { ImageDocumentVersion } = await import("@nodetool-ai/models");
    const limit = Math.max(
      1,
      Math.min(
        Number(params["limit"]) || DEFAULT_VERSION_LIMIT,
        MAX_VERSION_LIMIT
      )
    );
    const saveType =
      isString(params["save_type"])
        ? params["save_type"]
        : undefined;
    const versions = await ImageDocumentVersion.listForDocument(doc.id, {
      limit,
      saveType
    });
    return {
      image_document_id: doc.id,
      name: doc.name,
      versions: versions.map(toVersionListItem)
    };
  }
};

const getSketchVersion: CapabilityExport = {
  spec: getSketchVersionSpec,
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { ImageDocumentVersion } = await import("@nodetool-ai/models");
    const version = await ImageDocumentVersion.findByVersion(doc.id, number);
    if (!version) {
      return {
        error: `Sketch ${doc.id} has no version ${number}. Call list_sketch_versions to see the available ones.`
      };
    }

    const document = parseVersionDocument(version.document);
    if (isError(document)) return document;

    return {
      image_document_id: doc.id,
      ...toVersionListItem(version),
      document
    };
  }
};

const createSketchVersion: CapabilityExport = {
  spec: createSketchVersionSpec,
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const { ImageDocumentVersion } = await import("@nodetool-ai/models");
    const name =
      isString(params["name"]) && params["name"]
        ? params["name"]
        : null;
    const version = await ImageDocumentVersion.snapshot(doc, {
      saveType: "manual",
      name
    });
    return {
      ok: true,
      image_document_id: doc.id,
      ...toVersionListItem(version)
    };
  }
};

const restoreSketchVersion: CapabilityExport = {
  spec: restoreSketchVersionSpec,
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { ImageDocument, ImageDocumentVersion } =
      await import("@nodetool-ai/models");
    const version = await ImageDocumentVersion.findByVersion(doc.id, number);
    if (!version) {
      return {
        error: `Sketch ${doc.id} has no version ${number}. Call list_sketch_versions to see the available ones.`
      };
    }

    const document = parseVersionDocument(version.document);
    if (isError(document)) return document;

    // Snapshot what is about to be overwritten first, so a restore is itself
    // undoable.
    const undo = await ImageDocumentVersion.snapshot(doc, {
      saveType: "restore",
      name: `Before restore to v${number}`
    });

    const updated = await ImageDocument.updateFieldsIfUnchanged(
      doc.id,
      doc.updated_at,
      {
        document: JSON.stringify(document),
        width: version.width,
        height: version.height,
        background_color: version.background_color
      }
    );
    if (!updated) {
      return {
        error: `Sketch ${doc.id} was modified since it was read (optimistic concurrency conflict); nothing was restored. Retry the call.`,
        undo_version: undo.version
      };
    }

    const { validateSketchDocument } =
      await import("@nodetool-ai/execution/sketch-debug");
    const validation = validateSketchDocument(document, {
      width: version.width,
      height: version.height,
      backgroundColor: version.background_color
    });

    return {
      ok: true,
      image_document_id: doc.id,
      restored_version: number,
      undo_version: undo.version,
      width: updated.width,
      height: updated.height,
      backgroundColor: updated.background_color,
      updated_at: updated.updated_at,
      validation,
      summary: validationSummary(validation)
    };
  }
};

const deleteSketchVersion: CapabilityExport = {
  spec: deleteSketchVersionSpec,
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { ImageDocumentVersion } = await import("@nodetool-ai/models");
    const version = await ImageDocumentVersion.findByVersion(doc.id, number);
    if (!version) {
      return {
        error: `Sketch ${doc.id} has no version ${number}. Call list_sketch_versions to see the available ones.`
      };
    }
    await version.delete();
    return {
      ok: true,
      image_document_id: doc.id,
      deleted_version: number
    };
  }
};

// ---------------------------------------------------------------------------
// edit_sketch
// ---------------------------------------------------------------------------

/**
 * The stored layer and binding shapes, derived from the persisted document so
 * this capability cannot drift from what the editor writes. A layer carries
 * more than the fields edited here (bitmap data, transform, effects);
 * everything untouched rides through unchanged.
 */
type SketchLayer = ImageDocumentData["sketch"]["layers"][number];
type LayerBinding = ImageDocumentData["layerBindings"][number];

/** Operations one call may apply, so a runaway script cannot rewrite a sketch. */
const MAX_OPS = 60;

interface ParsedOp {
  op: string;
  args: Record<string, unknown>;
}

const OPS = [
  "add_layer",
  "remove_layer",
  "rename_layer",
  "set_layer_props",
  "reorder_layer",
  "duplicate_layer",
  "select_layer",
  "resize_canvas",
  "set_layer_image"
] as const;

type OpName = (typeof OPS)[number];

const isOpName = (value: string): value is OpName =>
  (OPS as readonly string[]).includes(value);

function parseOps(raw: unknown): ParsedOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_layer", "name": "Shadow"}].'
    };
  }
  if (raw.length > MAX_OPS) {
    return {
      error: `ops holds ${raw.length} entries; at most ${MAX_OPS} per call.`
    };
  }
  const parsed: ParsedOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...args } = entry as Record<string, unknown>;
    if (!isString(op) || !isOpName(op.trim())) {
      return {
        error: `ops[${index}] names "${String(op)}"; expected one of ${OPS.join(", ")}.`
      };
    }
    parsed.push({ op: op.trim(), args });
  }
  return parsed;
}

/** Resolve a layer reference: id, name (case-insensitive), or "active". */
function findLayerIndex(
  layers: SketchLayer[],
  activeLayerId: string,
  target: unknown
): number {
  const raw = isString(target) ? target.trim() : "";
  if (raw === "" || raw === "active") {
    return layers.findIndex((layer) => layer.id === activeLayerId);
  }
  const byId = layers.findIndex((layer) => layer.id === raw);
  if (byId >= 0) return byId;
  const name = raw.toLowerCase();
  return layers.findIndex((layer) => layer.name.trim().toLowerCase() === name);
}

/** A fresh, empty layer — no bitmap, sized to the canvas. */
function makeLayer(
  id: string,
  name: string,
  type: "raster" | "mask",
  width: number,
  height: number
): SketchLayer {
  return {
    id,
    name,
    type,
    visible: true,
    locked: false,
    opacity: 1,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: { x: 0, y: 0 },
    contentBounds: { x: 0, y: 0, width, height },
    effects: []
  };
}

function mintLayerId(layers: SketchLayer[]): string {
  const used = new Set(layers.map((layer) => layer.id));
  let n = layers.length + 1;
  while (used.has(`layer-${n}`)) n += 1;
  return `layer-${n}`;
}

/**
 * The layer image references a caller may name. An asset id and an
 * `asset://` locator both resolve through the asset's own `get_url` when the
 * editor loads the layer; a data URL and an http(s) URL load directly.
 */
const IMAGE_URI_SCHEMES = ["asset://", "data:", "http://", "https://"];

/**
 * Normalize what a caller passed as an image into a locator the editor's
 * canvas runtime resolves. A bare id becomes `asset://<id>`, which is how
 * every other sketch surface stores a reference to a stored image.
 */
function normalizeImageReference(value: unknown): string | ToolError {
  if (!isNonBlankString(value)) {
    return {
      error:
        "set_layer_image needs an `image`: an asset id, an asset:// locator, a data: URL, or an http(s) URL."
    };
  }
  const image = value.trim();
  if (IMAGE_URI_SCHEMES.some((scheme) => image.startsWith(scheme))) {
    return image;
  }
  if (image.includes("://")) {
    return {
      error: `image "${image}" uses a scheme the sketch canvas cannot load. Use an asset id, asset://, data:, or http(s)://.`
    };
  }
  return `asset://${image}`;
}

/** The asset id an `asset://` locator names, ignoring any file extension. */
function assetIdOfReference(image: string): string | null {
  if (!image.startsWith("asset://")) return null;
  const rest = image.slice("asset://".length).split(/[?#]/)[0];
  const last = rest.includes("/") ? rest.slice(rest.lastIndexOf("/") + 1) : rest;
  return last.replace(/\.[^.]+$/, "") || null;
}

interface SketchState {
  layers: SketchLayer[];
  activeLayerId: string;
  canvas: { width: number; height: number; backgroundColor?: string };
  bindings: LayerBinding[];
}

/**
 * Point a layer at an image. The bitmap is not inlined: `data` holds the
 * locator plus the bounds it occupies, and the editor's canvas runtime
 * resolves and draws it on load. That is the same shape a sketch seeded from
 * an asset carries, so a layer written here opens exactly like one the editor
 * itself produced.
 *
 * Bounds default to the whole canvas. The image is drawn at its natural size
 * anchored at the bounds' top-left, so a caller that knows the image's
 * dimensions should pass them rather than leave the layer canvas oversized.
 */
function setLayerImage(
  layer: SketchLayer,
  args: Record<string, unknown>,
  canvasWidth: number,
  canvasHeight: number
): {
  layer: SketchLayer;
  image: string;
  bounds: { x: number; y: number; width: number; height: number };
} {
  const image = normalizeImageReference(args["image"]);
  if (isError(image)) {
    throw new Error(image.error);
  }
  const dimension = (value: unknown, fallback: number, name: string): number => {
    if (value === undefined || value === null) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      throw new Error(`set_layer_image needs a positive integer \`${name}\`.`);
    }
    return n;
  };
  const offset = (value: unknown, name: string): number => {
    if (value === undefined || value === null) return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`set_layer_image needs an integer \`${name}\`.`);
    }
    return n;
  };
  const bounds = {
    x: offset(args["x"], "x"),
    y: offset(args["y"], "y"),
    width: dimension(args["width"], canvasWidth, "width"),
    height: dimension(args["height"], canvasHeight, "height")
  };
  return {
    layer: {
      ...layer,
      data: encodeSketchLayerData(image, bounds),
      contentBounds: bounds
    },
    image,
    bounds
  };
}

/** Apply one operation. Returns the result summary, or throws with the reason. */
function applyOp(
  state: SketchState,
  { op, args }: ParsedOp,
  blendModes: readonly string[]
) {
  const { layers } = state;

  switch (op) {
    case "add_layer": {
      const name =
        isNonBlankString(args["name"])
          ? args["name"].trim()
          : `Layer ${layers.length + 1}`;
      const type = args["type"] === "mask" ? "mask" : "raster";
      let layer = makeLayer(
        mintLayerId(layers),
        name,
        type,
        state.canvas.width,
        state.canvas.height
      );
      // An `image` makes this one op instead of add_layer + set_layer_image,
      // which is how a caller places a picture on a fresh layer.
      const placed =
        args["image"] === undefined
          ? null
          : setLayerImage(
              layer,
              args,
              state.canvas.width,
              state.canvas.height
            );
      if (placed) layer = placed.layer;
      // Layers are ordered bottom-to-top, so a new one goes on top unless the
      // caller pins an index.
      const at =
        isNumber(args["index"])
          ? Math.max(0, Math.min(Math.trunc(args["index"]), layers.length))
          : layers.length;
      layers.splice(at, 0, layer);
      state.activeLayerId = layer.id;
      const summary: {
        id: string;
        name: string;
        index: number;
        image?: string;
        bounds?: { x: number; y: number; width: number; height: number };
      } = { id: layer.id, name: layer.name, index: at };
      if (placed) {
        summary.image = placed.image;
        summary.bounds = placed.bounds;
      }
      return summary;
    }

    case "remove_layer": {
      if (layers.length <= 1) {
        throw new Error("A sketch must keep at least one layer.");
      }
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0)
        throw new Error(`No layer matches "${String(args["target"])}".`);
      const [removed] = layers.splice(index, 1);
      state.bindings = state.bindings.filter(
        (binding) => binding.layerId !== removed.id
      );
      if (state.activeLayerId === removed.id) {
        state.activeLayerId = layers[Math.min(index, layers.length - 1)].id;
      }
      return { removed: removed.id };
    }

    case "rename_layer": {
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0)
        throw new Error(`No layer matches "${String(args["target"])}".`);
      const name = args["name"];
      if (!isString(name) || name.trim() === "") {
        throw new Error("rename_layer needs a non-empty `name`.");
      }
      layers[index] = { ...layers[index], name: name.trim() };
      return { id: layers[index].id, name: layers[index].name };
    }

    case "set_layer_props": {
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0)
        throw new Error(`No layer matches "${String(args["target"])}".`);
      const next: SketchLayer = { ...layers[index] };
      if (args["visible"] !== undefined) next.visible = !!args["visible"];
      if (args["locked"] !== undefined) next.locked = !!args["locked"];
      if (args["opacity"] !== undefined) {
        const opacity = Number(args["opacity"]);
        if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
          throw new Error("opacity must be a number in [0, 1].");
        }
        next.opacity = opacity;
      }
      if (args["blendMode"] !== undefined) {
        const blendMode = String(args["blendMode"]);
        if (!blendModes.includes(blendMode)) {
          throw new Error(
            `blendMode "${blendMode}" is not one the compositor ships. Use one of: ${blendModes.join(", ")}.`
          );
        }
        next.blendMode = blendMode;
      }
      layers[index] = next;
      return {
        id: next.id,
        visible: next.visible,
        locked: next.locked,
        opacity: next.opacity,
        blendMode: next.blendMode
      };
    }

    case "reorder_layer": {
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0)
        throw new Error(`No layer matches "${String(args["target"])}".`);
      const to = Number(args["index"]);
      if (!Number.isInteger(to) || to < 0 || to >= layers.length) {
        throw new Error(
          `reorder_layer needs an \`index\` in [0, ${layers.length - 1}] (0 is the bottom layer).`
        );
      }
      const [moved] = layers.splice(index, 1);
      layers.splice(to, 0, moved);
      return { id: moved.id, index: to };
    }

    case "duplicate_layer": {
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0)
        throw new Error(`No layer matches "${String(args["target"])}".`);
      const source = layers[index];
      // The bitmap is copied by reference to the same data URL — the copy is a
      // duplicate, not a fork, and nothing here decodes pixels.
      const copy: SketchLayer = {
        ...source,
        id: mintLayerId(layers),
        name: `${source.name} copy`
      };
      layers.splice(index + 1, 0, copy);
      state.activeLayerId = copy.id;
      return { id: copy.id, name: copy.name, index: index + 1 };
    }

    case "select_layer": {
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0)
        throw new Error(`No layer matches "${String(args["target"])}".`);
      state.activeLayerId = layers[index].id;
      return { activeLayerId: state.activeLayerId };
    }

    case "set_layer_image": {
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0)
        throw new Error(`No layer matches "${String(args["target"])}".`);
      const applied = setLayerImage(
        layers[index],
        args,
        state.canvas.width,
        state.canvas.height
      );
      layers[index] = applied.layer;
      return {
        id: applied.layer.id,
        name: applied.layer.name,
        image: applied.image,
        bounds: applied.bounds
      };
    }

    case "resize_canvas": {
      const width = Number(args["width"] ?? state.canvas.width);
      const height = Number(args["height"] ?? state.canvas.height);
      if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1
      ) {
        throw new Error("resize_canvas needs positive integer width/height.");
      }
      state.canvas = { ...state.canvas, width, height };
      return { width, height };
    }

    default:
      throw new Error(`Unknown operation "${op}".`);
  }
}

interface OpRecord {
  op: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Asset ids named by an op's `image` that this user has no asset for. Reading
 * them up front turns "the layer is empty" into a message naming the id.
 */
async function missingAssetReferences(
  run: CapabilityRun,
  ops: ParsedOp[]
): Promise<string[]> {
  const ids = new Set<string>();
  for (const { op, args } of ops) {
    if (op !== "set_layer_image" && op !== "add_layer") continue;
    const image = normalizeImageReference(args["image"]);
    if (isError(image)) continue;
    const assetId = assetIdOfReference(image);
    if (assetId) ids.add(assetId);
  }
  if (ids.size === 0) return [];
  const userId = run.context.userId;
  if (!userId) return [...ids];
  // `findMany` is user-scoped, so another user's asset reads as missing — the
  // same rule the rest of this module applies to sketches.
  const { Asset } = await import("@nodetool-ai/models");
  const found = new Set(
    (await Asset.findMany(userId, [...ids])).map((asset) => asset.id)
  );
  return [...ids].filter((id) => !found.has(id));
}

const editSketch: CapabilityExport = {
  spec: editSketchSpec,
  impl: async (run, params) => {
    const sketchId = params["image_document_id"];
    if (!isString(sketchId) || !sketchId) {
      return {
        error: "image_document_id is required (use list_sketches to find one)."
      };
    }
    const ops = parseOps(params["ops"]);
    if (isError(ops)) return ops;

    const { ImageDocument, ImageDocumentConflictError } =
      await import("@nodetool-ai/models");
    const { SKETCH_BLEND_MODES } = await import("../evals/surfaces/sketch.js");

    const existing = await ImageDocument.findById(sketchId);
    // A sketch owned by someone else reads as missing — the rule the tRPC
    // router's ownership check applies.
    if (!existing || existing.user_id !== run.context.userId) {
      return { error: `Sketch ${sketchId} was not found.` };
    }

    // Verify every referenced asset before writing. An id that resolves to
    // nothing would otherwise be stored happily and show up as an empty layer
    // in the editor — the failure this reports instead.
    const missing = await missingAssetReferences(run, ops);
    if (missing.length > 0) {
      return {
        error:
          `No asset matches ${missing.map((id) => `"${id}"`).join(", ")}. ` +
          "Use list_assets to find one, and pass its id as `image`."
      };
    }

    let records: OpRecord[] = [];
    let layerSummary: { id: string; name: string; index: number }[] = [];
    let activeLayerId = "";

    // Resolve non-id targets (name, "active") to canonical layer ids so the
    // merge adapter can attribute the write to the real unit.
    const preData = existing.toDocumentData();
    const resolvedOps: { tool: string; input: Record<string, unknown> }[] = ops.map(
      (parsed) => {
        const rawTarget = parsed.args["target"];
        if (
          typeof rawTarget === "string" &&
          (parsed.op === "set_layer_props" ||
            parsed.op === "set_layer_image" ||
            parsed.op === "rename_layer" ||
            parsed.op === "duplicate_layer" ||
            parsed.op === "remove_layer" ||
            parsed.op === "reorder_layer" ||
            parsed.op === "select_layer")
        ) {
          const idx = findLayerIndex(
            preData.sketch.layers as unknown as SketchLayer[],
            preData.sketch.activeLayerId,
            rawTarget
          );
          if (idx >= 0) {
            const canonical = (preData.sketch.layers as unknown as SketchLayer[])[idx].id;
            return {
              tool: parsed.op,
              input: { ...parsed.args, target: canonical, id: canonical }
            };
          }
        }
        return { tool: parsed.op, input: parsed.args };
      }
    );

    try {
      const mutated = await ImageDocument.mutateDocumentData(
        sketchId,
        (data: ImageDocumentData) => {
          const sketch = data.sketch;
          const state: SketchState = {
            layers: [...sketch.layers],
            activeLayerId: sketch.activeLayerId,
            canvas: { ...sketch.canvas },
            bindings: [...data.layerBindings]
          };
          // A failing op is recorded and the script continues: stopping at the
          // first error hides every problem behind it.
          const applied: OpRecord[] = [];
          for (const parsed of ops) {
            try {
              applied.push({
                op: parsed.op,
                ok: true,
                result: applyOp(state, parsed, SKETCH_BLEND_MODES)
              });
            } catch (e) {
              applied.push({
                op: parsed.op,
                ok: false,
                error: e instanceof Error ? e.message : String(e)
              });
            }
          }
          data.sketch = {
            ...sketch,
            canvas: state.canvas,
            layers: state.layers,
            activeLayerId: state.activeLayerId
          };
          data.layerBindings = state.bindings;
          records = applied;
          layerSummary = state.layers.map((layer, index) => ({
            id: layer.id,
            name: layer.name,
            index
          }));
          activeLayerId = state.activeLayerId;
          return applied;
        },
        // The ops ride on the write so an open editor merges this change per
        // layer instead of treating the sketch as replaced.
        undefined,
        { ops: resolvedOps }
      );
      if (!mutated) return { error: `Sketch ${sketchId} was not found.` };

      const failed = records.filter((record) => !record.ok);
      return {
        image_document_id: sketchId,
        updated_at: mutated.document.updated_at,
        applied: records.length - failed.length,
        failed: failed.length,
        ops: records,
        active_layer_id: activeLayerId,
        layers: layerSummary
      };
    } catch (e) {
      if (e instanceof ImageDocumentConflictError) {
        return {
          error: `Sketch ${sketchId} is being modified concurrently; nothing was saved. Retry the call.`
        };
      }
      throw e;
    }
  }
};

// ---------------------------------------------------------------------------
// validate_sketch
// ---------------------------------------------------------------------------

/** A positive finite number from a tool param, or undefined. */
function numberParam(value: unknown): number | undefined {
  return isFiniteNumber(value) && value > 0
    ? value
    : undefined;
}

/** Unwrap a stored document that may still be JSON text. */
function parseStoredDocument(document: unknown): unknown {
  if (!isString(document)) return document;
  try {
    return JSON.parse(document);
  } catch {
    return undefined;
  }
}

const validateSketch: CapabilityExport = {
  spec: validateSketchSpec,
  // The sketch API is tRPC-only, so there is no REST route to fall back on: a
  // host that wants the `image_document_id` path puts a loader on the run.
  // Without one this still validates inline documents.
  impl: async (run, params) => {
    const inline = params["document"];
    const sketchId = params["image_document_id"] as string | undefined;

    let document = inline;
    // An inline document carries no stored canvas settings, so the caller
    // supplies them; the image_document_id path overwrites these from the row.
    let meta: {
      width?: number;
      height?: number;
      backgroundColor?: string;
    } = {
      width: numberParam(params["width"]),
      height: numberParam(params["height"]),
      backgroundColor:
        isString(params["background_color"])
          ? params["background_color"]
          : undefined
    };
    let name: string | undefined;

    if (document === undefined && sketchId) {
      const loadRow = run.loaders?.sketch;
      if (!loadRow) {
        return {
          error:
            "Cannot load a saved sketch in this process: no sketch loader is available. Pass the document inline as `document`, or call this tool from a server-side context.",
          validated: false
        };
      }
      const record = await loadRow(run.context, sketchId);
      if (!record) {
        return {
          error: `Sketch ${sketchId} was not found.`,
          validated: false
        };
      }
      document = parseStoredDocument(record.document);
      meta = {
        width: record.width,
        height: record.height,
        backgroundColor: record.backgroundColor
      };
      name = record.name;
    }

    if (document === undefined || document === null) {
      return {
        error:
          "No sketch to validate — pass an inline `document` ({sketch, layerBindings}) or a valid `image_document_id`."
      };
    }

    const { validateSketchDocument } =
      await import("@nodetool-ai/execution/sketch-debug");
    const validation = validateSketchDocument(document, meta);
    const report: typeof validation & {
      image_document_id?: string;
      name?: string;
      summary: string;
    } = { ...validation, summary: validationSummary(validation) };
    if (sketchId) report.image_document_id = sketchId;
    if (name) report.name = name;
    return report;
  }
};

/** Every sketch capability, in the order the tool files declared them. */
/**
 * Delete a sketch the caller owns.
 *
 * The ownership check and the version cascade are `ImageDocument.deleteOwned`, the
 * same function the tRPC route calls — a delete is not a place for two copies
 * of one rule, and version rows outliving their document would be unreachable
 * garbage. Missing and not-yours are one answer.
 */
const deleteSketch: CapabilityExport = {
  spec: deleteSketchSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { ImageDocument } = await import("@nodetool-ai/models");
    const id = String(params["image_document_id"]);
    const deleted = await ImageDocument.deleteOwned(userId, id);
    return deleted
      ? { image_document_id: id, deleted: true }
      : { error: `Sketch ${id} was not found, or it is not yours.` };
  }
};
export const SKETCH_CAPABILITIES: readonly CapabilityExport[] = [
  listSketches,
  createSketch,
  getSketch,
  listSketchVersions,
  getSketchVersion,
  createSketchVersion,
  restoreSketchVersion,
  deleteSketchVersion,
  editSketch,
  validateSketch,
  deleteSketch
];

export const module: CapabilityModule = {
  module: "sketches",
  exports: SKETCH_CAPABILITIES
};

export {
  listSketches,
  createSketch,
  getSketch,
  listSketchVersions,
  getSketchVersion,
  createSketchVersion,
  restoreSketchVersion,
  deleteSketchVersion,
  editSketch,
  validateSketch,
  deleteSketch
};
