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
import {
  adjustOnContext,
  combineSelections,
  cropLayerInPlace,
  drawGradient,
  drawShape,
  ellipseSelection,
  featherSelection,
  fillOnContext,
  hasSelectionPixels,
  polygonSelection,
  rectSelection,
  requireRasterContext,
  rgbaToHex,
  transformRaster,
  type RasterContext2D
} from "@nodetool-ai/image-editor/raster.js";

import { useSketchInstance } from "../../stores/sketch/SketchInstance";
import { useDirectGenJob } from "./useDirectGenJob";
import {
  renderLayerToAsset,
  renderLayersMerged
} from "../../lib/sketch/renderLayerToAsset";
import { getRememberedModel } from "../../stores/lastModelStore";
import type { Layer, SketchDocument } from "../../components/sketch/types";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import { CoordinateMapper } from "../../components/sketch/painting/CoordinateMapper";
import { getCanvasRasterBounds } from "../../components/sketch/transform/geometry/layerGeometry";
import {
  getSketchAgentHandler,
  hasSketchAgentHandler,
  setSketchAgentHandler,
  type SketchAdjustLayerResult,
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

    const requireRasterLayer = (target: string): Layer => {
      const layer = requireLayer(target);
      if (layer.type !== "raster") {
        throw new Error(
          `Layer "${layer.name}" is a ${layer.type} layer; this tool only writes raster layers.`
        );
      }
      if (layer.locked) {
        throw new Error(
          `Layer "${layer.name}" is locked and cannot take pixels.`
        );
      }
      return layer;
    };

    const applyRaster = (
      layer: Layer,
      label: string,
      mutate: (ctx: RasterContext2D, canvas: HTMLCanvasElement) => void
    ): void => {
      const apply = canvasRef.getState().applyLayerRasterOp;
      if (!apply) {
        throw new Error("Canvas is not ready yet.");
      }
      apply(layer.id, label, (canvas) => {
        const ctx = requireRasterContext(canvas.getContext("2d"));
        mutate(ctx, canvas);
      });
    };

    const mapperFor = (
      layer: Layer,
      canvas: HTMLCanvasElement
    ): CoordinateMapper =>
      new CoordinateMapper({
        layerTransform: layer.transform,
        rasterBounds: getCanvasRasterBounds(canvas) ?? layer.contentBounds
      });

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
          activeTool: state.activeTool,
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
          state.setLayerOpacity(
            layer.id,
            Math.max(0, Math.min(1, patch.opacity))
          );
        }
        if (patch.blendMode !== undefined) {
          state.setLayerBlendMode(layer.id, coerceBlendMode(patch.blendMode));
        }
        if (patch.visible !== undefined && patch.visible !== layer.visible) {
          state.toggleLayerVisibility(layer.id);
        }
        if (
          patch.alphaLock !== undefined &&
          patch.alphaLock !== layer.alphaLock
        ) {
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

      paintStrokes(strokes) {
        if (strokes.length === 0) {
          throw new Error("Provide at least one stroke to paint.");
        }
        const paint = canvasRef.getState().paintStrokes;
        if (!paint) throw new Error("Canvas is not ready yet.");

        // Resolve and vet every target before a single pixel moves, so a bad
        // target fails cleanly instead of leaving half a batch on the canvas.
        const resolved = strokes.map((stroke) => {
          const layer = requireLayer(stroke.target ?? "active");
          if (layer.type !== "raster") {
            throw new Error(
              `Layer "${layer.name}" is a ${layer.type} layer; strokes can only be painted on raster layers.`
            );
          }
          if (layer.locked) {
            // Locked layers are the ones whose pixels come from elsewhere (a
            // workflow input, a linked asset), so there is nothing to unlock —
            // paint on a layer of your own instead.
            throw new Error(
              `Layer "${layer.name}" is locked and cannot take pixels. Paint on another layer, or add one with ui_sketch_add_layer.`
            );
          }
          if (stroke.points.length === 0) {
            throw new Error(
              `Stroke for layer "${layer.name}" has no points; give it at least one.`
            );
          }
          return { layer, stroke };
        });

        const outcomes = paint(
          resolved.map(({ layer, stroke }) => ({
            layerId: layer.id,
            tool: stroke.tool ?? "brush",
            points: stroke.points,
            color: stroke.color,
            size: stroke.size,
            opacity: stroke.opacity,
            hardness: stroke.hardness,
            closed: stroke.closed
          }))
        );

        return outcomes.map((outcome, i) => ({
          layerId: outcome.layerId,
          layerName: resolved[i].layer.name,
          tool: outcome.tool,
          points: outcome.points,
          bounds: outcome.bounds
        }));
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

      fill(opts) {
        const layer = requireRasterLayer(opts.target ?? "active");
        const color =
          opts.color ?? editor.getState().foregroundColor ?? "#000000";
        applyRaster(layer, "fill", (ctx, canvas) => {
          const local = mapperFor(layer, canvas).docToLayer({
            x: opts.x,
            y: opts.y
          });
          fillOnContext(ctx, local.x, local.y, {
            color,
            tolerance: opts.tolerance ?? 16,
            contiguous: opts.contiguous ?? true
          });
        });
        return {
          layerId: layer.id,
          layerName: layer.name,
          x: opts.x,
          y: opts.y,
          color
        };
      },

      gradient(opts) {
        const layer = requireRasterLayer(opts.target ?? "active");
        const fg = editor.getState().foregroundColor || "#ffffff";
        const bg = editor.getState().backgroundColor || "#000000";
        const stops = opts.stops ?? [
          { offset: 0, color: fg },
          { offset: 1, color: bg }
        ];
        if (stops.length < 2) {
          throw new Error("A gradient needs at least two color stops.");
        }
        applyRaster(layer, "gradient", (ctx, canvas) => {
          const mapper = mapperFor(layer, canvas);
          drawGradient(
            ctx,
            opts.type,
            mapper.docToLayer(opts.start),
            mapper.docToLayer(opts.end),
            stops
          );
        });
        return { layerId: layer.id, layerName: layer.name, type: opts.type };
      },

      drawShape(opts) {
        const layer = requireRasterLayer(opts.target ?? "active");
        if (
          (opts.shape === "rect" ||
            opts.shape === "ellipse" ||
            opts.shape === "polygon" ||
            opts.shape === "star") &&
          (opts.width == null || opts.height == null)
        ) {
          throw new Error(
            `Shape "${opts.shape}" needs width and height in canvas pixels.`
          );
        }
        if (
          (opts.shape === "line" || opts.shape === "arrow") &&
          (opts.width == null || opts.height == null)
        ) {
          throw new Error(
            `Shape "${opts.shape}" needs width and height as the end-point offset from (x, y).`
          );
        }
        let bounds = {
          x: opts.x,
          y: opts.y,
          width: opts.width ?? 1,
          height: opts.height ?? 1
        };
        applyRaster(layer, "draw shape", (ctx, canvas) => {
          const mapper = mapperFor(layer, canvas);
          const origin = mapper.docToLayer({ x: opts.x, y: opts.y });
          const end = mapper.docToLayer({
            x: opts.x + (opts.width ?? 0),
            y: opts.y + (opts.height ?? 0)
          });
          bounds = drawShape(ctx, {
            ...opts,
            x: origin.x,
            y: origin.y,
            width: end.x - origin.x,
            height: end.y - origin.y
          });
        });
        return {
          layerId: layer.id,
          layerName: layer.name,
          shape: opts.shape,
          bounds
        };
      },

      setSelectionShape(opts) {
        const d = doc();
        const mode = opts.mode ?? "replace";
        let overlay: ReturnType<typeof rectSelection>;
        if (opts.shape === "rect" || opts.shape === "ellipse") {
          if (!opts.bounds) {
            throw new Error(
              `Shape "${opts.shape}" needs a bounds {x, y, width, height}.`
            );
          }
          overlay =
            opts.shape === "rect"
              ? rectSelection(
                  d.canvas.width,
                  d.canvas.height,
                  opts.bounds.x,
                  opts.bounds.y,
                  opts.bounds.width,
                  opts.bounds.height
                )
              : ellipseSelection(
                  d.canvas.width,
                  d.canvas.height,
                  opts.bounds.x,
                  opts.bounds.y,
                  opts.bounds.width,
                  opts.bounds.height
                );
        } else {
          if (!opts.points || opts.points.length < 3) {
            throw new Error(
              `Shape "${opts.shape}" needs at least three points.`
            );
          }
          overlay = polygonSelection(
            d.canvas.width,
            d.canvas.height,
            opts.points
          );
        }
        const current = editor.getState().selection;
        let next = combineSelections(current, overlay, mode);
        if ((opts.feather ?? 0) > 0) {
          next = featherSelection(next, opts.feather ?? 0);
        }
        editor.getState().setSelection(next);
        editor
          .getState()
          .pushHistory("selection", undefined, { selectionOnly: true });
        return {
          hasSelection: hasSelectionPixels(next),
          shape: opts.shape,
          mode
        };
      },

      transform(opts) {
        const layer = requireRasterLayer(opts.target ?? "active");
        const dx = opts.dx ?? 0;
        const dy = opts.dy ?? 0;
        const scaleX = opts.scaleX ?? 1;
        const scaleY = opts.scaleY ?? 1;
        const rotation = opts.rotation ?? 0;
        const flipH = opts.flipH ?? false;
        const flipV = opts.flipV ?? false;
        applyRaster(layer, "transform", (ctx) => {
          transformRaster(ctx, {
            dx,
            dy,
            scaleX,
            scaleY,
            rotation,
            flipH,
            flipV
          });
        });
        return {
          layerId: layer.id,
          layerName: layer.name,
          dx,
          dy,
          scaleX,
          scaleY,
          rotation,
          flipH,
          flipV
        };
      },

      adjustLayer(opts) {
        const layer = requireRasterLayer(opts.target ?? "active");
        const adjustments: SketchAdjustLayerResult["adjustments"] = {};
        if (opts.brightness !== undefined) {
          adjustments.brightness = opts.brightness;
        }
        if (opts.contrast !== undefined) adjustments.contrast = opts.contrast;
        if (opts.exposure !== undefined) adjustments.exposure = opts.exposure;
        if (opts.saturation !== undefined) {
          adjustments.saturation = opts.saturation;
        }
        if (opts.hue !== undefined) adjustments.hue = opts.hue;
        if (opts.blur !== undefined) adjustments.blur = opts.blur;
        if (Object.keys(adjustments).length === 0) {
          throw new Error(
            "Provide at least one adjustment (brightness, contrast, exposure, saturation, hue, blur)."
          );
        }
        applyRaster(layer, "adjust layer", (ctx) => {
          adjustOnContext(ctx, adjustments);
        });
        return {
          layerId: layer.id,
          layerName: layer.name,
          adjustments
        };
      },

      crop(opts) {
        const box = {
          x: Math.round(opts.x),
          y: Math.round(opts.y),
          width: Math.round(opts.width),
          height: Math.round(opts.height)
        };
        if (opts.target == null) {
          const crop = canvasRef.getState().cropDocument;
          if (!crop) {
            throw new Error("Canvas is not ready yet.");
          }
          crop(box.x, box.y, box.width, box.height);
          return { layerId: null, width: box.width, height: box.height };
        }
        const layer = requireRasterLayer(opts.target);
        applyRaster(layer, "crop layer", (ctx, canvas) => {
          const mapper = mapperFor(layer, canvas);
          const origin = mapper.docToLayer({ x: box.x, y: box.y });
          const end = mapper.docToLayer({
            x: box.x + box.width,
            y: box.y + box.height
          });
          cropLayerInPlace(
            ctx,
            origin.x,
            origin.y,
            Math.max(1, end.x - origin.x),
            Math.max(1, end.y - origin.y)
          );
        });
        return { layerId: layer.id, width: box.width, height: box.height };
      },

      async pickColor(opts) {
        const sample = canvasRef.getState().sampleColor;
        if (!sample) {
          throw new Error("Canvas is not ready yet.");
        }
        const layerId =
          opts.target == null ? null : requireLayer(opts.target).id;
        const rgba = sample(layerId, opts.x, opts.y) ?? {
          r: 0,
          g: 0,
          b: 0,
          a: 0
        };
        return {
          x: Math.round(opts.x),
          y: Math.round(opts.y),
          color: rgbaToHex(rgba),
          rgba
        };
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
