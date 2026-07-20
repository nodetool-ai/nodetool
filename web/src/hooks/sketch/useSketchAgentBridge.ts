/**
 * useSketchAgentBridge
 *
 * Registers a {@link SketchAgentHandler} for the surrounding image / sketch
 * editor instance under its document id, so the `ui_sketch_*` agent tools can
 * address this document. Mirrors {@link useTimelineAgentBridge} but built
 * against the sketch editor's per-instance stores (editor, session bindings,
 * canvas refs) plus the direct-generation job runner.
 *
 * Registration is not gated on focus: with several sketch tabs open every one
 * of them stays addressable by id. The handler is cleared on unmount, or when
 * the document id changes.
 */

import { useEffect, useMemo } from "react";
import { coerceBlendMode } from "@nodetool-ai/gpu";

import { useSketchInstance } from "../../stores/sketch/SketchInstance";
import { useDirectGenJob } from "./useDirectGenJob";
import {
  renderLayerToAsset,
  renderLayersMerged
} from "../../lib/sketch/renderLayerToAsset";
import { getRememberedModel } from "../../stores/lastModelStore";
import type {
  Layer,
  SketchDocument
} from "../../components/sketch/types";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import {
  getSketchAgentHandler,
  hasSketchAgentHandler,
  setSketchAgentHandler,
  type SketchAgentHandler,
  type SketchLayerNode,
  type SketchRenderedAssetResult,
  type SketchSnapshot,
  type SketchToolName
} from "../../components/sketch/sketchAgentBridge";

const SKETCH_TOOLS: readonly SketchToolName[] = [
  "move",
  "transform",
  "select",
  "brush",
  "pencil",
  "eraser",
  "eyedropper",
  "fill",
  "shape",
  "blur",
  "gradient",
  "crop",
  "clone_stamp",
  "adjust",
  "segment"
];

/** Serialize a layer to the agent-facing shape. */
function toLayerNode(
  layer: Layer,
  index: number,
  binding: LayerWorkflowBinding | undefined
): SketchLayerNode {
  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    locked: layer.locked,
    alphaLock: layer.alphaLock,
    parentId: layer.parentId ?? null,
    index,
    hasBinding: !!binding,
    bindingKind: binding?.kind,
    prompt: binding?.prompt,
    provider: binding?.provider,
    model: binding?.model,
    bindingStatus: binding?.status
  };
}

export const useSketchAgentBridge = (documentId: string | null): void => {
  const instance = useSketchInstance();
  const { start: startDirectGen } = useDirectGenJob();

  const handler = useMemo<SketchAgentHandler>(() => {
    const { editor, session, canvasRef } = instance;

    const doc = (): SketchDocument => editor.getState().document;

    /** Resolve a layer by id, case-insensitive name, or the "active" keyword. */
    const requireLayer = (target: string): Layer => {
      const layers = doc().layers;
      if (target === "active") {
        const id = doc().activeLayerId;
        const layer = layers.find((l) => l.id === id);
        if (!layer) throw new Error("There is no active layer.");
        return layer;
      }
      const byId = layers.find((l) => l.id === target);
      if (byId) return byId;
      const lower = target.toLowerCase();
      const byName = layers.find((l) => l.name.toLowerCase() === lower);
      if (byName) return byName;
      throw new Error(`Layer not found in the document: ${target}`);
    };

    const bindingFor = (layerId: string): LayerWorkflowBinding | undefined =>
      session.getState().bindings[layerId];

    const layerNode = (layer: Layer): SketchLayerNode => {
      const index = doc().layers.findIndex((l) => l.id === layer.id);
      return toLayerNode(layer, index, bindingFor(layer.id));
    };

    const reReadLayer = (id: string): Layer => {
      const layer = doc().layers.find((l) => l.id === id);
      if (!layer) throw new Error(`Layer ${id} disappeared after the edit.`);
      return layer;
    };

    /** Unique layer name within the current document. */
    const uniqueLayerName = (base: string): string => {
      const existing = new Set(doc().layers.map((l) => l.name));
      if (!existing.has(base)) return base;
      let n = 2;
      while (existing.has(`${base} ${n}`)) n++;
      return `${base} ${n}`;
    };

    return {
      getSnapshot(): SketchSnapshot {
        const state = editor.getState();
        const d = state.document;
        return {
          documentId: session.getState().documentId,
          name: session.getState().name,
          width: d.canvas.width,
          height: d.canvas.height,
          activeLayerId: d.activeLayerId,
          foregroundColor: state.foregroundColor || "#ffffff",
          backgroundColor: state.backgroundColor || "#000000",
          activeTool: state.activeTool as SketchToolName,
          hasSelection: state.hasActiveSelection,
          layers: d.layers.map((l, i) => toLayerNode(l, i, bindingFor(l.id)))
        };
      },

      addLayer(opts) {
        const state = editor.getState();
        const id = state.addLayer(
          uniqueLayerName(opts.name ?? "Layer"),
          opts.type ?? "raster"
        );
        if (opts.fillColor) {
          // The canvas creates the layer on its next render; fill once it
          // exists, then persist the pixels and record a history entry —
          // mirroring the layers panel's fill-on-add behavior.
          requestAnimationFrame(() => {
            const refs = canvasRef.getState();
            refs.fillLayerWithColor?.(id, opts.fillColor as string);
            const data = refs.getLayerData?.(id);
            if (data) editor.getState().updateLayerData(id, data);
            editor.getState().pushHistory("add layer");
          });
        } else {
          state.pushHistory("add layer");
        }
        return layerNode(reReadLayer(id));
      },

      removeLayer(target) {
        const layer = requireLayer(target);
        const node = layerNode(layer);
        editor.getState().removeLayer(layer.id);
        editor.getState().pushHistory("remove layer");
        return node;
      },

      duplicateLayer(target) {
        const layer = requireLayer(target);
        const before = new Set(doc().layers.map((l) => l.id));
        editor.getState().duplicateLayer(layer.id);
        editor.getState().pushHistory("duplicate layer");
        const created = doc().layers.find((l) => !before.has(l.id));
        return layerNode(created ?? reReadLayer(layer.id));
      },

      selectLayer(target) {
        const layer = requireLayer(target);
        editor.getState().setActiveLayer(layer.id);
        return layerNode(reReadLayer(layer.id));
      },

      setLayerProps(target, patch) {
        const layer = requireLayer(target);
        const state = editor.getState();
        if (patch.name !== undefined) state.renameLayer(layer.id, patch.name);
        if (patch.opacity !== undefined) {
          state.setLayerOpacity(layer.id, Math.max(0, Math.min(1, patch.opacity)));
        }
        if (patch.blendMode !== undefined) {
          state.setLayerBlendMode(layer.id, coerceBlendMode(patch.blendMode));
        }
        if (patch.visible !== undefined && patch.visible !== layer.visible) {
          state.toggleLayerVisibility(layer.id);
        }
        if (patch.alphaLock !== undefined && patch.alphaLock !== layer.alphaLock) {
          state.toggleAlphaLock(layer.id);
        }
        editor.getState().pushHistory("edit layer");
        return layerNode(reReadLayer(layer.id));
      },

      reorderLayer(target, direction) {
        const layer = requireLayer(target);
        const layers = doc().layers;
        const from = layers.findIndex((l) => l.id === layer.id);
        // Higher flat-array index = visually higher. "up" moves the layer
        // toward the top of the stack (higher index).
        const to = direction === "up" ? from + 1 : from - 1;
        if (to < 0 || to >= layers.length) {
          throw new Error(
            `Cannot move layer "${layer.name}" ${direction}; it is already at the ${
              direction === "up" ? "top" : "bottom"
            }.`
          );
        }
        editor.getState().reorderLayers(from, to);
        editor.getState().pushHistory("reorder layers");
        return layerNode(reReadLayer(layer.id));
      },

      mergeLayerDown(target) {
        const layer = requireLayer(target);
        editor.getState().mergeLayerDown(layer.id);
        editor.getState().pushHistory("merge down");
        const survivor = doc().layers.find((l) => l.id === layer.id);
        return survivor ? layerNode(survivor) : null;
      },

      flattenVisible() {
        editor.getState().flattenVisible();
        editor.getState().pushHistory("flatten visible");
        const id = doc().activeLayerId;
        return layerNode(reReadLayer(id));
      },

      async generate(opts) {
        const documentId = session.getState().documentId;
        if (!documentId) {
          throw new Error("No image document is open.");
        }
        const kind = opts.kind;
        const modelKind = getRememberedModel("image");
        const provider = opts.provider ?? modelKind?.provider;
        const model = opts.model ?? modelKind?.model;

        let sourceLayerId: string | null = null;
        if (kind === "image-to-image") {
          if (!opts.sourceLayer) {
            throw new Error(
              "image-to-image requires `sourceLayer` — the layer to transform."
            );
          }
          sourceLayerId = requireLayer(opts.sourceLayer).id;
        }

        const d = doc();
        const width = opts.width ?? d.canvas.width;
        const height = opts.height ?? d.canvas.height;

        const layerId = editor
          .getState()
          .addLayer(
            uniqueLayerName(
              opts.name ??
                (kind === "text-to-image" ? "Text-to-Image" : "Image-to-Image")
            )
          );
        session.getState().upsertBinding({
          layerId,
          kind,
          prompt: opts.prompt.trim(),
          provider,
          model,
          width,
          height,
          aspectRatio: opts.aspectRatio,
          resolution: opts.resolution,
          sourceLayerId,
          status: "draft",
          versions: []
        });
        editor.getState().setActiveLayer(layerId);

        const canGenerate =
          !!provider && !!model && opts.prompt.trim().length > 0;
        let generationStarted = false;
        let note: string | undefined;
        if (opts.autoGenerate === false) {
          note = "Layer created as a draft (autoGenerate was false).";
        } else if (!canGenerate) {
          note =
            "Layer created as a draft — no model resolved. Provide provider + model, then regenerate.";
        } else {
          await startDirectGen(layerId);
          generationStarted =
            session.getState().bindings[layerId]?.status !== "failed";
          if (!generationStarted) {
            note = "Generation could not be started; the layer is a draft.";
          }
        }

        return {
          layer: layerNode(reReadLayer(layerId)),
          generationStarted,
          note
        };
      },

      setForegroundColor(color) {
        editor.getState().setForegroundColor(color);
        return editor.getState().foregroundColor;
      },

      setBackgroundColor(color) {
        editor.getState().setBackgroundColor(color);
        return editor.getState().backgroundColor;
      },

      setActiveTool(tool) {
        if (!SKETCH_TOOLS.includes(tool)) {
          throw new Error(
            `Unknown tool "${tool}". Valid tools: ${SKETCH_TOOLS.join(", ")}.`
          );
        }
        editor.getState().setActiveTool(tool);
        return tool;
      },

      resizeCanvas(width, height) {
        const w = Math.max(1, Math.round(width));
        const h = Math.max(1, Math.round(height));
        editor.getState().resizeCanvas(w, h);
        editor.getState().pushHistory("resize canvas");
        return { width: w, height: h };
      },

      setSelection(op) {
        const state = editor.getState();
        switch (op) {
          case "all":
            state.selectAll();
            break;
          case "clear":
            state.setSelection(null);
            break;
          case "invert":
            state.invertSelection();
            break;
        }
        state.pushHistory("selection", undefined, { selectionOnly: true });
        return { hasSelection: editor.getState().hasActiveSelection };
      },

      async getLayerImage(target) {
        const refs = canvasRef.getState();
        const d = doc();
        if (target === null) {
          const flatten = refs.flattenToDataUrl;
          if (!flatten) throw new Error("Canvas is not ready yet.");
          const dataUrl = flatten();
          if (!dataUrl) throw new Error("Could not flatten the canvas.");
          return {
            layerId: null,
            layerName: null,
            width: d.canvas.width,
            height: d.canvas.height,
            dataUrl
          };
        }
        const layer = requireLayer(target);
        const read = refs.getLayerData;
        if (!read) throw new Error("Canvas is not ready yet.");
        const dataUrl = read(layer.id);
        if (!dataUrl) {
          throw new Error(`Layer "${layer.name}" has no pixel data.`);
        }
        return {
          layerId: layer.id,
          layerName: layer.name,
          width: d.canvas.width,
          height: d.canvas.height,
          dataUrl
        };
      },

      async renderLayerToAsset(target, name) {
        const layerId = target === null ? null : requireLayer(target).id;
        return renderLayerToAsset({
          doc: doc(),
          layerId,
          flattenToDataUrl: canvasRef.getState().flattenToDataUrl,
          name
        });
      },

      async renderLayersToAssets(targets, opts) {
        if (targets.length === 0) {
          throw new Error("Provide at least one layer to render.");
        }
        // Resolve every target up front so a bad id fails before uploading.
        const layerIds = targets.map((t) => requireLayer(t).id);
        if (opts?.merge) {
          const merged = await renderLayersMerged({
            doc: doc(),
            layerIds,
            name: opts?.name
          });
          return [merged];
        }
        const results: SketchRenderedAssetResult[] = [];
        for (const layerId of layerIds) {
          results.push(
            await renderLayerToAsset({ doc: doc(), layerId, name: opts?.name })
          );
        }
        return results;
      }
    };
  }, [instance, startDirectGen]);

  useEffect(() => {
    if (!documentId) return;
    setSketchAgentHandler(documentId, handler);
    return () => {
      // Only clear if we're still the handler registered for this id — a
      // remounted editor for the same document may have already replaced us.
      if (
        hasSketchAgentHandler(documentId) &&
        getSketchAgentHandler(documentId) === handler
      ) {
        setSketchAgentHandler(documentId, null);
      }
    };
  }, [documentId, handler]);
};
