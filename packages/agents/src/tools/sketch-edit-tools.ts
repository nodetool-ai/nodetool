/**
 * Sketch edit tool — restructure a saved image document without a browser.
 *
 * Layer structure was browser-only: the `ui_sketch_*` tools round-trip over
 * the WebSocket into the open editor's canvas stores, so an agent working
 * headlessly could snapshot and roll a sketch back but never add a layer,
 * reorder one, or change its blend mode.
 *
 * `edit_sketch` applies those structural operations to the persisted row.
 * Pixels stay opaque throughout — a layer's bitmap is carried, never read or
 * written — which is exactly the line the headless sketch harness draws. What
 * paints is `ui_sketch_generate` in an open editor, or a workflow run.
 *
 * The write is a compare-and-swap on `updated_at`, so an edit racing the
 * editor's autosave re-reads and re-applies instead of clobbering. An open
 * editor picks the result up over `resource_change`.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { ImageDocument, ImageDocumentConflictError } from "@nodetool-ai/models";
import type { ImageDocumentData } from "@nodetool-ai/models";
import { Tool } from "./base-tool.js";
import { SKETCH_BLEND_MODES } from "../evals/surfaces/sketch.js";

/**
 * The stored layer and binding shapes, derived from the persisted document so
 * this tool cannot drift from what the editor writes. A layer carries more
 * than the fields edited here (bitmap data, transform, effects); everything
 * untouched rides through unchanged.
 */
type SketchLayer = ImageDocumentData["sketch"]["layers"][number];
type LayerBinding = ImageDocumentData["layerBindings"][number];

/** Operations one call may apply, so a runaway script cannot rewrite a sketch. */
const MAX_OPS = 60;

const BLEND_MODES = new Set<string>(SKETCH_BLEND_MODES);

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

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
function applyOp(state: SketchState, { op, args }: ParsedOp): unknown {
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
        if (!BLEND_MODES.has(blendMode)) {
          throw new Error(
            `blendMode "${blendMode}" is not one the compositor ships. Use one of: ${SKETCH_BLEND_MODES.join(", ")}.`
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

export class EditSketchTool extends Tool {
  readonly name = "edit_sketch";
  readonly description =
    "Edit a saved sketch's layer structure headlessly: add, remove, rename, " +
    "reorder and duplicate layers, set visibility/lock/opacity/blend mode, " +
    "choose the active layer, and resize the canvas. Operations run in order " +
    "against the stored document and the result is saved; an open editor " +
    "picks the change up live. Pixels are never read or written — painting " +
    "and generation happen in an open editor or a workflow run. Call " +
    "list_sketches to find one and validate_sketch afterwards.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      image_document_id: { type: "string" as const, description: "Sketch (image document) id." },
      ops: {
        type: "array" as const,
        description:
          'Operations in order. Each is {"op": <name>, ...arguments}: ' +
          'add_layer {name?, type?: "raster"|"mask", index?}, ' +
          "remove_layer {target}, rename_layer {target, name}, " +
          "set_layer_props {target, visible?, locked?, opacity?, blendMode?}, " +
          "reorder_layer {target, index}, duplicate_layer {target}, " +
          "select_layer {target}, resize_canvas {width, height}. " +
          '`target` is a layer id, its name, or "active". Layer index 0 is the ' +
          "bottom layer.",
        items: { type: "object" as const }
      }
    },
    required: ["image_document_id", "ops"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const sketchId = params["image_document_id"];
    if (typeof sketchId !== "string" || !sketchId) {
      return {
        error: "image_document_id is required (use list_sketches to find one)."
      };
    }
    const ops = parseOps(params["ops"]);
    if (isError(ops)) return ops;

    const existing = await ImageDocument.findById(sketchId);
    // A sketch owned by someone else reads as missing — the rule the tRPC
    // router's ownership check applies.
    if (!existing || existing.user_id !== context.userId) {
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
              applied.push({ op: parsed.op, ok: true, result: applyOp(state, parsed) });
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

  userMessage(params: Record<string, unknown>): string {
    const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
    return `Editing sketch ${String(params["image_document_id"])} (${count} ops)`;
  }
}
