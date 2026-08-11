/**
 * The `sketches` capability module.
 *
 * Seven capabilities that used to be seven `Tool` subclasses: the five version
 * tools (`../tools/sketch-version-tools.ts`), the headless layer editor
 * (`../tools/sketch-edit-tools.ts`), and `validate_sketch`, which lived beside
 * the workflow tools in `../tools/mcp-tools.ts`.
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

/** Versions one call may return, so a long history cannot flood the context. */
const DEFAULT_VERSION_LIMIT = 20;
const MAX_VERSION_LIMIT = 100;

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

async function loadSketch(
  run: CapabilityRun,
  sketchId: unknown
): Promise<ImageDocument | ToolError> {
  if (typeof sketchId !== "string" || !sketchId) {
    return {
      error:
        "image_document_id is required (use list_sketches to find one)."
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
  if (typeof raw !== "string") return raw;
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

const SAVE_TYPE_PROPERTY = {
  type: "string" as const,
  enum: ["manual", "autosave", "restore"],
  description:
    "Only versions of this kind: 'manual' (a save someone asked for), " +
    "'autosave' (taken on a document write), 'restore' (the pre-restore " +
    "snapshot). Omit for all of them."
};

// ---------------------------------------------------------------------------
// list_sketches
// ---------------------------------------------------------------------------

const LIST_SKETCHES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Only sketches whose name contains this text (case-insensitive)."
    },
    limit: {
      type: "number",
      description: "Max sketches to return (default 20)."
    }
  }
};

const listSketches: CapabilityExport = {
  spec: {
    name: "list_sketches",
    description:
      "List the caller's sketches (image documents), most recently updated " +
      "first: id, name, canvas size, and when it last changed. Start here when " +
      "the user names a sketch but not its id.",
    inputSchema: LIST_SKETCHES_SCHEMA,
    category: "read",
    userMessage: () => "Listing sketches"
  },
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { ImageDocument } = await import("@nodetool-ai/models");
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const query =
      typeof params["query"] === "string"
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

// ---------------------------------------------------------------------------
// list_sketch_versions
// ---------------------------------------------------------------------------

const LIST_SKETCH_VERSIONS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    save_type: SAVE_TYPE_PROPERTY,
    limit: {
      type: "number",
      description: `Max versions to return (default ${DEFAULT_VERSION_LIMIT}, max ${MAX_VERSION_LIMIT}).`
    }
  },
  required: ["image_document_id"]
};

const listSketchVersions: CapabilityExport = {
  spec: {
    name: "list_sketch_versions",
    description:
      "List a sketch's whole-document snapshots, newest first: version number, " +
      "name, save type ('manual', 'autosave', 'restore'), canvas settings, and " +
      "when it was taken. These are document snapshots, not the per-layer " +
      "generation history. Call this before restoring — restore_sketch_version " +
      "addresses a snapshot by its version number.",
    inputSchema: LIST_SKETCH_VERSIONS_SCHEMA,
    category: "read",
    userMessage: (params) =>
      `Listing versions of sketch ${String(params["image_document_id"])}`
  },
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const { ImageDocumentVersion } = await import("@nodetool-ai/models");
    const limit = Math.max(
      1,
      Math.min(Number(params["limit"]) || DEFAULT_VERSION_LIMIT, MAX_VERSION_LIMIT)
    );
    const saveType =
      typeof params["save_type"] === "string"
        ? (params["save_type"] as string)
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

// ---------------------------------------------------------------------------
// get_sketch_version
// ---------------------------------------------------------------------------

const GET_SKETCH_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    version: {
      type: "number",
      description: "Version number to read, from list_sketch_versions."
    }
  },
  required: ["image_document_id", "version"]
};

const getSketchVersion: CapabilityExport = {
  spec: {
    name: "get_sketch_version",
    description:
      "Read one snapshot of a sketch without restoring it: the version's " +
      "metadata plus the full document it stored. Use this to inspect or " +
      "compare versions before deciding which one to restore.",
    inputSchema: GET_SKETCH_VERSION_SCHEMA,
    category: "read",
    userMessage: (params) =>
      `Reading v${String(params["version"])} of sketch ${String(params["image_document_id"])}`
  },
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

// ---------------------------------------------------------------------------
// create_sketch_version
// ---------------------------------------------------------------------------

const CREATE_SKETCH_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    name: {
      type: "string",
      description: "Label for the snapshot, e.g. 'before the repaint'."
    }
  },
  required: ["image_document_id"]
};

const createSketchVersion: CapabilityExport = {
  spec: {
    name: "create_sketch_version",
    description:
      "Snapshot a sketch's current document as a manual version, so it can be " +
      "restored later. Manual snapshots are never pruned (autosaves are), so " +
      "take one before an edit the user may want undone. Returns the new " +
      "version's number.",
    inputSchema: CREATE_SKETCH_VERSION_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Snapshotting sketch ${String(params["image_document_id"])}`
  },
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const { ImageDocumentVersion } = await import("@nodetool-ai/models");
    const name =
      typeof params["name"] === "string" && params["name"]
        ? (params["name"] as string)
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

// ---------------------------------------------------------------------------
// restore_sketch_version
// ---------------------------------------------------------------------------

const RESTORE_SKETCH_VERSION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "Sketch (image document) id."
    },
    version: {
      type: "number",
      description: "Version number to restore, from list_sketch_versions."
    }
  },
  required: ["image_document_id", "version"]
};

const restoreSketchVersion: CapabilityExport = {
  spec: {
    name: "restore_sketch_version",
    description:
      "Roll a sketch's document and canvas settings back to one of its " +
      "snapshots, addressed by version number (from list_sketch_versions). The " +
      "state being overwritten is snapshotted first, so the restore is itself " +
      "undoable — restore that snapshot to come back. An old document is " +
      "restored against today's schema, so the result is validated afterwards " +
      "and the findings are returned with it.",
    inputSchema: RESTORE_SKETCH_VERSION_SCHEMA,
    category: "write",
    userMessage: (params) =>
      `Restoring sketch ${String(params["image_document_id"])} to v${String(params["version"])}`
  },
  impl: async (run, params) => {
    const doc = await loadSketch(run, params["image_document_id"]);
    if (isError(doc)) return doc;

    const number = versionNumber(params["version"]);
    if (isError(number)) return number;

    const { ImageDocument, ImageDocumentVersion } = await import(
      "@nodetool-ai/models"
    );
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

    const { validateSketchDocument } = await import(
      "@nodetool-ai/execution/sketch-debug"
    );
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
  "resize_canvas"
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
    return { error: `ops holds ${raw.length} entries; at most ${MAX_OPS} per call.` };
  }
  const parsed: ParsedOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...args } = entry as Record<string, unknown>;
    if (typeof op !== "string" || !isOpName(op.trim())) {
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
  const raw = typeof target === "string" ? target.trim() : "";
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

interface SketchState {
  layers: SketchLayer[];
  activeLayerId: string;
  canvas: { width: number; height: number; backgroundColor?: string };
  bindings: LayerBinding[];
}

/** Apply one operation. Returns the result summary, or throws with the reason. */
function applyOp(
  state: SketchState,
  { op, args }: ParsedOp,
  blendModes: readonly string[]
): unknown {
  const { layers } = state;

  switch (op) {
    case "add_layer": {
      const name =
        typeof args["name"] === "string" && args["name"].trim() !== ""
          ? args["name"].trim()
          : `Layer ${layers.length + 1}`;
      const type = args["type"] === "mask" ? "mask" : "raster";
      const layer = makeLayer(
        mintLayerId(layers),
        name,
        type,
        state.canvas.width,
        state.canvas.height
      );
      // Layers are ordered bottom-to-top, so a new one goes on top unless the
      // caller pins an index.
      const at =
        typeof args["index"] === "number"
          ? Math.max(0, Math.min(Math.trunc(args["index"]), layers.length))
          : layers.length;
      layers.splice(at, 0, layer);
      state.activeLayerId = layer.id;
      return { id: layer.id, name: layer.name, index: at };
    }

    case "remove_layer": {
      if (layers.length <= 1) {
        throw new Error("A sketch must keep at least one layer.");
      }
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0) throw new Error(`No layer matches "${String(args["target"])}".`);
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
      if (index < 0) throw new Error(`No layer matches "${String(args["target"])}".`);
      const name = args["name"];
      if (typeof name !== "string" || name.trim() === "") {
        throw new Error("rename_layer needs a non-empty `name`.");
      }
      layers[index] = { ...layers[index], name: name.trim() };
      return { id: layers[index].id, name: layers[index].name };
    }

    case "set_layer_props": {
      const index = findLayerIndex(layers, state.activeLayerId, args["target"]);
      if (index < 0) throw new Error(`No layer matches "${String(args["target"])}".`);
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
      if (index < 0) throw new Error(`No layer matches "${String(args["target"])}".`);
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
      if (index < 0) throw new Error(`No layer matches "${String(args["target"])}".`);
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
      if (index < 0) throw new Error(`No layer matches "${String(args["target"])}".`);
      state.activeLayerId = layers[index].id;
      return { activeLayerId: state.activeLayerId };
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

const EDIT_SKETCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: { type: "string", description: "Sketch (image document) id." },
    ops: {
      type: "array",
      description:
        'Operations in order. Each is {"op": <name>, ...arguments}: ' +
        'add_layer {name?, type?: "raster"|"mask", index?}, ' +
        "remove_layer {target}, rename_layer {target, name}, " +
        "set_layer_props {target, visible?, locked?, opacity?, blendMode?}, " +
        "reorder_layer {target, index}, duplicate_layer {target}, " +
        "select_layer {target}, resize_canvas {width, height}. " +
        '`target` is a layer id, its name, or "active". Layer index 0 is the ' +
        "bottom layer.",
      items: { type: "object" }
    }
  },
  required: ["image_document_id", "ops"]
};

const editSketch: CapabilityExport = {
  spec: {
    name: "edit_sketch",
    description:
      "Edit a saved sketch's layer structure headlessly: add, remove, rename, " +
      "reorder and duplicate layers, set visibility/lock/opacity/blend mode, " +
      "choose the active layer, and resize the canvas. Operations run in order " +
      "against the stored document and the result is saved; an open editor " +
      "picks the change up live. Pixels are never read or written — painting " +
      "and generation happen in an open editor or a workflow run. Call " +
      "list_sketches to find one and validate_sketch afterwards.",
    inputSchema: EDIT_SKETCH_SCHEMA,
    category: "write",
    userMessage: (params) => {
      const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
      return `Editing sketch ${String(params["image_document_id"])} (${count} ops)`;
    }
  },
  impl: async (run, params) => {
    const sketchId = params["image_document_id"];
    if (typeof sketchId !== "string" || !sketchId) {
      return {
        error: "image_document_id is required (use list_sketches to find one)."
      };
    }
    const ops = parseOps(params["ops"]);
    if (isError(ops)) return ops;

    const { ImageDocument, ImageDocumentConflictError } = await import(
      "@nodetool-ai/models"
    );
    const { SKETCH_BLEND_MODES } = await import("../evals/surfaces/sketch.js");

    const existing = await ImageDocument.findById(sketchId);
    // A sketch owned by someone else reads as missing — the rule the tRPC
    // router's ownership check applies.
    if (!existing || existing.user_id !== run.context.userId) {
      return { error: `Sketch ${sketchId} was not found.` };
    }

    let records: OpRecord[] = [];
    let layerSummary: { id: string; name: string; index: number }[] = [];
    let activeLayerId = "";

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
        }
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
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Unwrap a stored document that may still be JSON text. */
function parseStoredDocument(document: unknown): unknown {
  if (typeof document !== "string") return document;
  try {
    return JSON.parse(document);
  } catch {
    return undefined;
  }
}

const VALIDATE_SKETCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    image_document_id: {
      type: "string",
      description: "The ID of a saved sketch (image document) to validate"
    },
    document: {
      type: "object",
      description:
        "Inline ImageDocumentData to validate ({ sketch, layerBindings }). " +
        "Takes precedence over image_document_id."
    },
    width: {
      type: "number",
      description:
        "Canvas width the inline document is stored against. The canvas " +
        "size lives on the row, not in the document, so without it a " +
        "mismatch between the two cannot be reported. Ignored for " +
        "image_document_id."
    },
    height: {
      type: "number",
      description:
        "Canvas height the inline document is stored against. Ignored for image_document_id."
    },
    background_color: {
      type: "string",
      description:
        "Canvas background color the inline document is stored against. Ignored for image_document_id."
    }
  }
};

const validateSketch: CapabilityExport = {
  spec: {
    name: "validate_sketch",
    description:
      "Statically validate a sketch (image document) WITHOUT rendering it: " +
      "duplicate layer ids, an active or mask layer the stack lacks, unknown " +
      "blend modes, opacities and transforms that cannot render, generation " +
      "bindings pointing at missing layers, unknown binding kinds and statuses, " +
      "canvas settings that disagree with the stored ones, and fields a schema " +
      "round trip would strip. Pass an inline `document` to check one you are " +
      "building, or `image_document_id` to validate a saved sketch. Run it after " +
      "sketch edits and before handing the document back.",
    inputSchema: VALIDATE_SKETCH_SCHEMA,
    category: "read",
    userMessage: (params) =>
      params["image_document_id"]
        ? `Validating sketch ${params["image_document_id"]}`
        : "Validating sketch document"
  },
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
        typeof params["background_color"] === "string"
          ? (params["background_color"] as string)
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

    const { validateSketchDocument } = await import(
      "@nodetool-ai/execution/sketch-debug"
    );
    const validation = validateSketchDocument(document, meta);
    return {
      ...validation,
      ...(sketchId ? { image_document_id: sketchId } : {}),
      ...(name ? { name } : {}),
      summary: validationSummary(validation)
    };
  }
};

/** Every sketch capability, in the order the tool files declared them. */
export const SKETCH_CAPABILITIES: readonly CapabilityExport[] = [
  listSketches,
  listSketchVersions,
  getSketchVersion,
  createSketchVersion,
  restoreSketchVersion,
  editSketch,
  validateSketch
];

export const module: CapabilityModule = {
  module: "sketches",
  exports: SKETCH_CAPABILITIES
};

export {
  listSketches,
  listSketchVersions,
  getSketchVersion,
  createSketchVersion,
  restoreSketchVersion,
  editSketch,
  validateSketch
};
