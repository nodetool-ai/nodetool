/**
 * Sketch merge adapter
 *
 * Teaches the generic per-unit merge engine about an image document (sketch):
 * `layers[]` by layer id and the per-layer workflow `layerBindings` by layer
 * id are the merge units; canvas size and background are last-write-wins.
 * Pixel data is opaque — a layer whose bitmap changed on both sides is one
 * conflict, no pixel merge. `activeLayerId` is live UI state and is never
 * merged.
 */
import type { DocumentOp } from "@nodetool-ai/protocol";
import type {
  DocumentMergeAdapter,
  MergeResult
} from "../documentMerge";
import { mergeByUnits, structuralEqual } from "../documentMerge";

/** The slice of a persisted sketch the engine merges. */
export interface SketchMergeDoc {
  layers: unknown[];
  layerBindings: unknown[];
  canvas: { width: number; height: number; backgroundColor?: string };
}

const layerOf = (unit: unknown): { id: string; name?: string } =>
  unit as { id: string; name?: string };

const bindingId = (unit: unknown): string =>
  (unit as { layerId: string }).layerId;

/**
 * Which layers one external op touched. Only ops that edit one named unit
 * attribute; adds and removals resolve through existence, reorders change no
 * content.
 *
 * A `target` naming a layer by name rather than id attributes to an id no
 * layer has, so that layer counts as untouched and the draft stands. An op
 * carrying no `target` attributes nothing at all — and when NO op in a write
 * attributes, the engine falls back to diff mode and every slot the three
 * sides disagree on is a conflict.
 */
const sketchUnitsTouchedByOp = (
  op: DocumentOp
): { kind: string; unitId?: string }[] => {
  const input = (op.input ?? {}) as Record<string, unknown>;
  const target =
    typeof input["target"] === "string" ? input["target"] : undefined;
  switch (op.tool) {
    case "set_layer_props":
    case "rename_layer":
    case "duplicate_layer":
      return target
        ? [
            { kind: "layer", unitId: target },
            { kind: "binding", unitId: target }
          ]
        : [];
    default:
      return [];
  }
};

const sketchMergeAdapter: DocumentMergeAdapter<SketchMergeDoc> = {
  collections: [
    {
      kind: "layer",
      read: (doc) => doc.layers,
      write: (doc, layers) => ({ ...doc, layers }),
      unitId: (unit) => layerOf(unit).id,
      unitLabel: (unit) => layerOf(unit).name || layerOf(unit).id
    },
    {
      kind: "binding",
      read: (doc) => doc.layerBindings,
      write: (doc, bindings) => ({ ...doc, layerBindings: bindings }),
      unitId: bindingId,
      unitLabel: (unit) => `workflow binding for ${layerOf(unit).name ?? bindingId(unit)}`
    }
  ],
  scalars: [
    {
      name: "canvas",
      read: (doc) => doc.canvas,
      write: (doc, value) => ({
        ...doc,
        canvas: value as SketchMergeDoc["canvas"]
      })
    }
  ],
  unitsTouchedByOp: sketchUnitsTouchedByOp
};

/** The op names that redraw the whole canvas rather than edit one unit. */
const SKETCH_WHOLE_DOCUMENT_OPS = new Set(["resize_canvas"]);

/**
 * Merge one external sketch write into the dirty draft. A `resize_canvas`
 * write is a whole-document replacement when the draft is dirty: canvas size
 * changes the meaning of every pixel below it.
 */
export function mergeSketchDocuments(
  base: SketchMergeDoc,
  draft: SketchMergeDoc,
  server: SketchMergeDoc,
  ops?: DocumentOp[]
): MergeResult<SketchMergeDoc> {
  if (ops?.some((op) => SKETCH_WHOLE_DOCUMENT_OPS.has(op.tool))) {
    return {
      doc: draft,
      // The draft took none of it, so none of it becomes the next base.
      nextBase: base,
      conflicts: [
        {
          unit: { kind: "document", id: "document", label: "document" },
          external: server,
          reason: "replaced"
        }
      ]
    };
  }
  return mergeByUnits(base, draft, server, sketchMergeAdapter, { ops });
}

/**
 * Which layers the merge took out of the draft's hands: added or rewritten by
 * the external write, and removed by it. Derived from draft-vs-merged, so a
 * layer the draft won (both sides changed it) counts as the user's own.
 * Feeds the undo-stack re-baseline in `rebaselineHistoryForMerge`.
 */
export function sketchExternalLayerOwnership(
  draft: SketchMergeDoc,
  merged: SketchMergeDoc
): { changedLayerIds: Set<string>; removedLayerIds: Set<string> } {
  const draftById = new Map(
    draft.layers.map((layer) => [layerOf(layer).id, layer])
  );
  const changedLayerIds = new Set<string>();
  const mergedIds = new Set<string>();
  for (const layer of merged.layers) {
    const id = layerOf(layer).id;
    mergedIds.add(id);
    const before = draftById.get(id);
    if (before === undefined || !structuralEqual(before, layer)) {
      changedLayerIds.add(id);
    }
  }
  const removedLayerIds = new Set<string>();
  for (const id of draftById.keys()) {
    if (!mergedIds.has(id)) removedLayerIds.add(id);
  }
  return { changedLayerIds, removedLayerIds };
}
