/**
 * Headless bridge for the Sketch / image editor tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/sketch.ts`) delegate to
 * a `SketchAgentHandler` the live `SketchEditor` registers on the
 * `sketchAgentBridge` under its document id — it mutates a layered raster
 * document backed by real canvases and (for generation) dispatches actual
 * image-generation jobs. This bridge reimplements the *effects* of those tools
 * against an in-memory layer stack, so a model can drive the same
 * `ui_sketch_*` tool surface headlessly.
 *
 * The pixels are real. Every raster layer is backed by an `@napi-rs/canvas`
 * bitmap, and `ui_sketch_stroke` runs the editor's own brush/pencil/eraser
 * engine — `@nodetool-ai/image-editor/painting.js`, the same module the browser
 * calls — through `setPaintSurfaceFactory(createCanvas)`. So a headless run
 * paints the strokes a live editor would, and `ui_sketch_get_layer_image`
 * hands the model a PNG of its own work.
 *
 * What it does NOT fork is the tool *contract*: names and descriptions are
 * copied verbatim from the builtin file, and parameters mirror its Zod
 * shapes — minus the `sketch_id` param, since this bridge addresses a single
 * implicit document rather than a registry of open editors.
 *
 * `ui_sketch_render_to_asset` stays excluded: it needs an asset-upload service,
 * which has no meaningful headless equivalent. To look at what a run drew, take
 * the composite PNG off the bridge instead ({@link SketchToolBridge.compositePng},
 * or {@link getLastSketchToolBridge} when the eval runner owns the instance).
 */

import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_ERASER_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  drawBrushStroke,
  drawEraserStroke,
  drawPencilStroke,
  setPaintSurfaceFactory,
  type DirtyRectTracker,
  type PaintContext2D,
  type PaintSurface,
  type Point,
  type StrokeStampState
} from "@nodetool-ai/image-editor/painting.js";
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
  pickPixel,
  polygonSelection,
  rectSelection,
  readFullImage,
  requireRasterContext,
  transformRaster,
  type RasterAdjustments,
  type RasterSelection
} from "@nodetool-ai/image-editor/raster.js";
import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";
import { isString } from "../../utils/type-guards.js";

/**
 * Point the paint core at skia. Idempotent and process-wide: the engine only
 * uses it to allocate its brush-stamp scratch bitmaps, so every bridge in this
 * process shares one factory.
 */
setPaintSurfaceFactory((w: number, h: number) =>
  // SAFETY: the engine only draws brush stamps on the surface, and a skia
  // canvas provides every member `PaintSurface` names for that.
  createCanvas(w, h) as PaintSurface
);

export type SketchBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "add";

/** The blend modes NodeTool's compositor ships, in menu order. */
export const SKETCH_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "add"
] as const;

const BLEND_MODES = SKETCH_BLEND_MODES;

/**
 * NodeTool's blend-mode names onto Canvas2D `globalCompositeOperation`. All but
 * two are spelled the same; `"normal"` is Canvas's default `"source-over"` and
 * `"add"` is its additive `"lighter"`.
 */
const CANVAS_COMPOSITE_OP = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  "hard-light": "hard-light",
  "soft-light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  add: "lighter"
} satisfies Record<SketchBlendMode, string>;

const TOOLS = [
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
] as const;

const targetParam = z
  .string()
  .describe(
    'Layer id, layer name (case-insensitive), or the literal "active" for the active layer.'
  );

const blendModeEnum = z.enum(BLEND_MODES);
const toolEnum = z.enum(TOOLS);

const strokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Pen pressure in [0,1]; omit for an even, mouse-like stroke.")
});

const strokeSchema = z.object({
  target: targetParam
    .optional()
    .describe("Layer to paint on; defaults to the active layer."),
  tool: z
    .enum(["brush", "pencil", "eraser"])
    .optional()
    .describe(
      "Paint engine (default `brush`). `pencil` is aliased hard-edged, `eraser` removes pixels."
    ),
  points: z
    .array(strokePointSchema)
    .min(1)
    .describe(
      "Polyline the stroke follows, in canvas pixels (x right, y down, origin top-left). Dabs are interpolated along each segment, so a smooth curve just needs enough points — roughly one every few pixels of arc."
    ),
  color: z
    .string()
    .optional()
    .describe("Hex color; defaults to the foreground. Ignored by the eraser."),
  size: z.number().min(0.1).optional().describe("Brush diameter in pixels."),
  opacity: z.number().min(0).max(1).optional(),
  hardness: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Edge hardness — 1 is crisp, 0 is a soft airbrushed falloff."),
  closed: z
    .boolean()
    .optional()
    .describe("Connect the last point back to the first, closing the shape.")
});

/** One stroke as the tool receives it, after Zod parsing. */
type StrokeArgs = z.infer<typeof strokeSchema>;

export interface SketchBridgeInitialState {
  name?: string;
  width?: number;
  height?: number;
  layers?: { name: string; type?: "raster" | "mask" }[];
}

export interface SketchBridgeFinalState {
  name: string;
  width: number;
  height: number;
  activeLayerId: string | null;
  foregroundColor: string;
  backgroundColor: string;
  activeTool: string;
  hasSelection: boolean;
  /** Non-transparent pixels in the flattened composite of all visible layers. */
  paintedPixels: number;
  /** {@link paintedPixels} over the canvas area, in [0,1]. */
  paintedFraction: number;
  /**
   * Same measure over only the layers `ui_sketch_stroke` actually painted on.
   * A solid `fillColor` layer covers the whole canvas, so `paintedFraction`
   * alone cannot tell a drawing from a backdrop — this can.
   */
  strokedFraction: number;
  layers: {
    id: string;
    name: string;
    type: "raster" | "mask" | "group";
    visible: boolean;
    opacity: number;
    blendMode: SketchBlendMode;
    index: number;
    hasBinding: boolean;
    /** Non-transparent pixels on this layer's own bitmap. */
    paintedPixels: number;
    /** How many strokes have been committed to this layer. */
    strokeCount: number;
    prompt?: string;
    provider?: string;
    model?: string;
    fillColor?: string;
  }[];
}

/** Internal layer node, bottom-to-top ordering matches array order. */
interface Layer {
  id: string;
  name: string;
  type: "raster" | "mask" | "group";
  visible: boolean;
  opacity: number;
  blendMode: SketchBlendMode;
  locked: boolean;
  alphaLock: boolean;
  parentId: string | null;
  hasBinding: boolean;
  bindingKind?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  bindingStatus?: string;
  /** Solid fill applied to the bitmap when it is first materialized. */
  fillColor?: string;
  /** Strokes committed to this layer, so a fill and a drawing stay tellable apart. */
  strokeCount: number;
  /**
   * Raster backing, allocated lazily at the current canvas size — most layers
   * in a layer-management case never hold a pixel, and a 1024² bitmap per
   * layer is not free.
   */
  raster: Canvas | null;
}

/** Serializable view handed back to the model — the bitmap never crosses. */
type LayerView = Omit<Layer, "raster">;

function tool<TResult>(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<TResult>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: (args) => {
      const parsed = parseWithTypeCoercion(parameters, args ?? {}) as Record<
        string,
        unknown
      >;
      return impl(parsed);
    }
  };
}

/** The 2D context of a skia canvas, seen as the paint core's context. */
const paintContext = (canvas: Canvas): SKRSContext2D & PaintContext2D => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire a 2D context.");
  return ctx as SKRSContext2D & PaintContext2D;
};

/** Count pixels with a non-zero alpha — "how much of this bitmap is painted". */
function countPaintedPixels(canvas: Canvas | null): number {
  if (!canvas) return 0;
  const { data } = paintContext(canvas).getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) painted += 1;
  }
  return painted;
}

/** One point of a stroke as the tool schema describes it. */
interface StrokePoint extends Point {
  pressure?: number;
}

/**
 * Run one polyline through a paint engine into a fresh doc-sized stroke buffer.
 *
 * This is the editor's own compositing model: dabs land at full alpha in a
 * buffer, and the buffer goes onto the layer once — `source-over` at the
 * stroke's opacity for brush/pencil, `destination-out` for the eraser, which is
 * what makes a semi-transparent stroke a single even wash instead of a chain of
 * overlapping dabs.
 */
function renderStroke(options: {
  width: number;
  height: number;
  tool: "brush" | "pencil" | "eraser";
  points: StrokePoint[];
  color: string;
  size: number;
  hardness: number;
  closed: boolean;
}) {
  const { width, height, tool, color, size, hardness, closed } = options;
  const buffer = createCanvas(width, height);
  const ctx = paintContext(buffer);
  const dirty: DirtyRectTracker = { current: null };
  const stampCache = new Map<string, PaintSurface>();
  const stampState: StrokeStampState = {
    hasStamped: false,
    distanceToNextDab: 0
  };

  const points = [...options.points];
  if (closed && points.length > 2) {
    points.push(points[0]);
  }

  // The engine is opacity-agnostic here: the buffer carries the stroke at full
  // strength and the caller applies opacity when it composites.
  const brush = {
    ...DEFAULT_BRUSH_SETTINGS,
    color,
    size,
    hardness,
    opacity: 1
  };
  const pencil = { ...DEFAULT_PENCIL_SETTINGS, color, size, opacity: 1 };
  const eraser = { ...DEFAULT_ERASER_SETTINGS, size, opacity: 1 };

  const segment = (from: StrokePoint, to: StrokePoint): void => {
    const pressure = to.pressure ?? from.pressure;
    switch (tool) {
      case "brush":
        drawBrushStroke(
          from,
          to,
          brush,
          ctx,
          pressure,
          dirty,
          stampCache,
          stampState
        );
        return;
      case "pencil":
        drawPencilStroke(from, to, pencil, ctx, pressure, dirty, stampState);
        return;
      case "eraser":
        drawEraserStroke(
          from,
          to,
          eraser,
          brush,
          pencil,
          ctx,
          pressure,
          dirty,
          stampCache,
          stampState
        );
    }
  };

  if (points.length === 1) {
    // A one-point stroke is a single dab, not a no-op.
    segment(points[0], points[0]);
  } else {
    for (let i = 1; i < points.length; i += 1) {
      segment(points[i - 1], points[i]);
    }
  }

  return { buffer, dirty };
}

/**
 * A headless sketch bridge, plus the escape hatch a harness needs to look at
 * what the model actually drew.
 */
export interface SketchToolBridge extends HeadlessSurfaceBridge<SketchBridgeFinalState> {
  /** PNG bytes of the flattened composite of all visible layers. */
  compositePng: () => Buffer;
  /** Same pixels as a `data:image/png;base64,…` URL. */
  compositeDataUrl: () => string;
}

let lastCreatedBridge: SketchToolBridge | null = null;

/**
 * The most recently created sketch bridge, or null before the first one.
 *
 * `ToolLoopEvalCase.createBridge` builds the bridge inside the runner, so a
 * caller that wants the drawing afterwards has no handle on it. Cases run
 * sequentially, so after a single-case run this is that run's bridge — enough
 * to write the composite PNG somewhere a human can look at it.
 */
export function getLastSketchToolBridge(): SketchToolBridge | null {
  return lastCreatedBridge;
}

/**
 * Build an in-memory sketch/image-editor bridge whose tools share the
 * `ui_sketch_*` contract but run headlessly, against a layer stack of real
 * skia bitmaps driven by the editor's own paint engine.
 */
export function createSketchToolBridge(
  initial: SketchBridgeInitialState = {}
): SketchToolBridge {
  const name = initial.name ?? "Untitled";
  let width = initial.width ?? 1024;
  let height = initial.height ?? 1024;
  let foregroundColor = "#000000";
  let backgroundColor = "#ffffff";
  let activeTool = "brush";
  let selection: RasterSelection | null = null;

  let layerSeq = 0;
  const nextLayerId = () => `layer_${++layerSeq}`;

  const makeLayer = (
    id: string,
    layerName: string,
    type: "raster" | "mask" | "group"
  ): Layer => ({
    id,
    name: layerName,
    type,
    visible: true,
    opacity: 1,
    blendMode: "normal",
    locked: false,
    alphaLock: false,
    parentId: null,
    hasBinding: false,
    strokeCount: 0,
    raster: null
  });

  const layers: Layer[] = [];
  let activeLayerId: string | null = null;

  if (initial.layers && initial.layers.length > 0) {
    for (const l of initial.layers) {
      const id = nextLayerId();
      layers.push(makeLayer(id, l.name, l.type ?? "raster"));
    }
    activeLayerId = layers[layers.length - 1].id;
  } else {
    const id = nextLayerId();
    layers.push(makeLayer(id, "Background", "raster"));
    activeLayerId = id;
  }

  const indexOf = (id: string) => layers.findIndex((l) => l.id === id);

  const resolveTarget = (target: string): Layer => {
    if (target === "active") {
      if (!activeLayerId) throw new Error("No active layer.");
      const l = layers.find((x) => x.id === activeLayerId);
      if (!l) throw new Error("No active layer.");
      return l;
    }
    const byId = layers.find((l) => l.id === target);
    if (byId) return byId;
    const lower = target.toLowerCase();
    const byName = layers.find((l) => l.name.toLowerCase() === lower);
    if (byName) return byName;
    throw new Error(`No layer found matching "${target}".`);
  };

  const serialize = (l: Layer): LayerView => {
    const { raster: _raster, ...view } = l;
    return view;
  };

  /**
   * Materialize this layer's bitmap at the current canvas size, applying its
   * `fillColor` the first time. A layer that was resized while empty is
   * reallocated rather than kept at the old size.
   */
  const ensureRaster = (layer: Layer): Canvas => {
    const existing = layer.raster;
    if (existing && existing.width === width && existing.height === height) {
      return existing;
    }
    const next = createCanvas(width, height);
    const ctx = paintContext(next);
    if (existing) {
      // Resize keeps pixels; anything past the new bounds is clipped.
      ctx.drawImage(existing, 0, 0);
    } else if (layer.fillColor) {
      ctx.fillStyle = layer.fillColor;
      ctx.fillRect(0, 0, width, height);
    }
    layer.raster = next;
    return next;
  };

  /** Composite the given layers bottom-to-top honoring visibility, opacity and blend. */
  const compositeOf = (source: Layer[]): Canvas => {
    const out = createCanvas(width, height);
    const ctx = paintContext(out);
    for (const layer of source) {
      if (!layer.visible || layer.opacity <= 0 || !layer.raster) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = CANVAS_COMPOSITE_OP[
        layer.blendMode
      ] as SKRSContext2D["globalCompositeOperation"];
      ctx.drawImage(ensureRaster(layer), 0, 0);
      ctx.restore();
    }
    return out;
  };

  const composite = (): Canvas => compositeOf(layers);

  const tools: HeadlessTool[] = [
    tool(
      "ui_sketch_get_state",
      "Read the specified image document: name, canvas size, the active layer, foreground/background color, the active tool, whether a pixel selection is active, and every layer (id, name, type, visibility, opacity, blend mode, lock state, and any generation binding prompt/provider/model/status). Call this first to discover what's on the canvas and to get the ids/names other image-editor tools need.",
      z.object({}),
      async () => {
        return {
          ok: true,
          documentId: null,
          name,
          width,
          height,
          activeLayerId,
          foregroundColor,
          backgroundColor,
          activeTool,
          hasSelection: hasSelectionPixels(selection),
          layers: layers.map((l, i) => ({ ...serialize(l), index: i }))
        };
      }
    ),

    tool(
      "ui_sketch_add_layer",
      "Add a new layer above the active one. `type` is raster (default) or mask. Optionally give it a `name` and a `fillColor` (hex) to fill it with a solid color.",
      z.object({
        name: z.string().optional(),
        type: z.enum(["raster", "mask"]).optional(),
        fillColor: z
          .string()
          .optional()
          .describe("Hex color to fill the new layer with, e.g. #ff0000.")
      }),
      async ({ name: layerName, type, fillColor }) => {
        const id = nextLayerId();
        const idx = activeLayerId ? indexOf(activeLayerId) + 1 : layers.length;
        const layer = makeLayer(
          id,
          (layerName as string | undefined) ?? `Layer ${layerSeq}`,
          (type as "raster" | "mask" | undefined) ?? "raster"
        );
        if (isString(fillColor) && fillColor) {
          layer.fillColor = fillColor;
          // A fill is pixels, not a label — lay them down now.
          ensureRaster(layer);
        }
        layers.splice(idx, 0, layer);
        activeLayerId = id;
        return { ok: true, layer: serialize(layer) };
      }
    ),

    tool(
      "ui_sketch_remove_layer",
      "Delete a layer from the specified image document.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const layer = resolveTarget(target as string);
        const idx = indexOf(layer.id);
        layers.splice(idx, 1);
        if (activeLayerId === layer.id) {
          const neighbor = layers[idx] ?? layers[idx - 1] ?? null;
          activeLayerId = neighbor ? neighbor.id : null;
        }
        return { ok: true, deleted: serialize(layer) };
      }
    ),

    tool(
      "ui_sketch_duplicate_layer",
      "Duplicate a layer. The copy is inserted directly above the source.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const source = resolveTarget(target as string);
        const id = nextLayerId();
        const copy: Layer = {
          ...source,
          id,
          name: `${source.name} copy`,
          raster: null
        };
        if (source.raster) {
          // Own bitmap, not a shared reference — painting the copy must not
          // paint the original.
          const dup = createCanvas(source.raster.width, source.raster.height);
          paintContext(dup).drawImage(source.raster, 0, 0);
          copy.raster = dup;
        }
        layers.splice(indexOf(source.id) + 1, 0, copy);
        activeLayerId = id;
        return { ok: true, layer: serialize(copy) };
      }
    ),

    tool(
      "ui_sketch_select_layer",
      "Make a layer the active layer (subsequent edits target it).",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const layer = resolveTarget(target as string);
        activeLayerId = layer.id;
        return { ok: true, active: serialize(layer) };
      }
    ),

    tool(
      "ui_sketch_set_layer_props",
      "Change a layer's properties: `name`, `visible`, `opacity` (0..1), `blendMode`, `locked`, or `alphaLock` (lock transparency). Omit a field to leave it unchanged.",
      z.object({
        target: targetParam,
        name: z.string().optional(),
        visible: z.boolean().optional(),
        opacity: z.number().min(0).max(1).optional(),
        blendMode: blendModeEnum.optional(),
        locked: z.boolean().optional(),
        alphaLock: z.boolean().optional()
      }),
      async ({ target, ...patch }) => {
        const layer = resolveTarget(target as string);
        if (patch.name !== undefined) layer.name = patch.name as string;
        if (patch.visible !== undefined)
          layer.visible = patch.visible as boolean;
        if (patch.opacity !== undefined)
          layer.opacity = patch.opacity as number;
        if (patch.blendMode !== undefined)
          layer.blendMode = patch.blendMode as SketchBlendMode;
        if (patch.locked !== undefined) layer.locked = patch.locked as boolean;
        if (patch.alphaLock !== undefined)
          layer.alphaLock = patch.alphaLock as boolean;
        return { ok: true, layer: serialize(layer) };
      }
    ),

    tool(
      "ui_sketch_reorder_layer",
      "Move a layer up or down in the stack. `up` moves it toward the top (composited above its neighbors); `down` moves it toward the bottom.",
      z.object({
        target: targetParam,
        direction: z.enum(["up", "down"])
      }),
      async ({ target, direction }) => {
        const layer = resolveTarget(target as string);
        const idx = indexOf(layer.id);
        const swapWith = direction === "up" ? idx + 1 : idx - 1;
        if (swapWith >= 0 && swapWith < layers.length) {
          layers[idx] = layers[swapWith];
          layers[swapWith] = layer;
        }
        return { ok: true, layer: serialize(layer) };
      }
    ),

    tool(
      "ui_sketch_merge_down",
      "Merge a layer into the layer directly below it, replacing the two with a single flattened raster layer.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const layer = resolveTarget(target as string);
        const idx = indexOf(layer.id);
        if (idx <= 0) {
          return { ok: true, layer: null };
        }
        const below = layers[idx - 1];
        const merged = makeLayer(nextLayerId(), below.name, "raster");
        merged.raster = compositeOf([below, layer]);
        layers.splice(idx - 1, 2, merged);
        activeLayerId = merged.id;
        return { ok: true, layer: serialize(merged) };
      }
    ),

    tool(
      "ui_sketch_flatten_visible",
      "Flatten all visible layers into a single raster layer. Returns the resulting layer.",
      z.object({}),
      async () => {
        const visibleIndices = layers
          .map((l, i) => (l.visible ? i : -1))
          .filter((i) => i >= 0);
        const insertAt =
          visibleIndices.length > 0 ? visibleIndices[0] : layers.length;
        const removeCount = visibleIndices.length;
        const flattened = makeLayer(nextLayerId(), "Flattened", "raster");
        flattened.raster = compositeOf(visibleIndices.map((i) => layers[i]));
        if (removeCount > 0) {
          for (let i = layers.length - 1; i >= 0; i -= 1) {
            if (visibleIndices.includes(i)) layers.splice(i, 1);
          }
          layers.splice(insertAt, 0, flattened);
        } else {
          layers.push(flattened);
        }
        activeLayerId = flattened.id;
        return { ok: true, layer: serialize(flattened) };
      }
    ),

    tool(
      "ui_sketch_generate",
      'Generate imagery onto a new layer. `kind` is text-to-image (from a prompt) or image-to-image (transform an existing layer — pass `sourceLayer`). Provide `provider` and `model` (discover valid ones with the model-search tool); when omitted the last-used image model is reused. Optional `width`/`height` (default the canvas size), `aspectRatio` (e.g. "16:9"), and `resolution` (e.g. "1K") shape the output for models that use size enums. Generation starts immediately unless `autoGenerate` is false. Poll ui_sketch_get_state for the layer\'s binding status.',
      z.object({
        kind: z.enum(["text-to-image", "image-to-image"]),
        prompt: z.string(),
        name: z.string().optional(),
        sourceLayer: targetParam
          .optional()
          .describe("For image-to-image: the layer to transform."),
        provider: z.string().optional(),
        model: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        aspectRatio: z.string().optional(),
        resolution: z.string().optional(),
        autoGenerate: z.boolean().optional()
      }),
      async (args) => {
        const kind = args.kind as "text-to-image" | "image-to-image";
        const prompt = args.prompt as string;
        if (kind === "image-to-image" && args.sourceLayer !== undefined) {
          // Throws when unresolved.
          resolveTarget(args.sourceLayer as string);
        }
        const id = nextLayerId();
        const idx = activeLayerId ? indexOf(activeLayerId) + 1 : layers.length;
        const generationStarted = args.autoGenerate !== false;
        const layer: Layer = {
          ...makeLayer(
            id,
            (args.name as string | undefined) ?? `Generated ${layerSeq}`,
            "raster"
          ),
          hasBinding: true,
          bindingKind: kind,
          prompt,
          provider: args.provider as string | undefined,
          model: args.model as string | undefined,
          bindingStatus: generationStarted ? "generating" : "idle"
        };
        layers.splice(idx, 0, layer);
        activeLayerId = id;
        const result: {
          ok: true;
          layer: LayerView;
          generationStarted: boolean;
          note?: string;
        } = {
          ok: true,
          layer: serialize(layer),
          generationStarted
        };
        if (!generationStarted) {
          result.note = "Generation not started (autoGenerate=false).";
        }
        return result;
      }
    ),

    tool(
      "ui_sketch_set_color",
      "Set the specified image document's foreground and/or background color (hex). The foreground color is used by the brush, fill, and shape tools.",
      z.object({
        foreground: z.string().optional(),
        background: z.string().optional()
      }),
      async ({ foreground, background }) => {
        const result: { foreground?: string; background?: string } = {};
        if (foreground !== undefined) {
          foregroundColor = foreground as string;
          result.foreground = foregroundColor;
        }
        if (background !== undefined) {
          backgroundColor = background as string;
          result.background = backgroundColor;
        }
        return { ok: true, ...result };
      }
    ),

    tool(
      "ui_sketch_set_tool",
      "Select the active tool in the specified image document (e.g. brush, eraser, fill, select, move, transform, crop). Drives which tool the editor's pointer uses.",
      z.object({ tool: toolEnum }),
      async ({ tool: nextTool }) => {
        activeTool = nextTool as string;
        return { ok: true, activeTool };
      }
    ),

    tool(
      "ui_sketch_stroke",
      "Paint one or more brush/pencil/eraser strokes onto raster layers — the actual drawing tool. Each stroke is a polyline of canvas-pixel points that the paint engine interpolates into a smooth line, with its own color, size, opacity and hardness. Pass several strokes in one call to draw a whole figure at once; the batch commits as a single undo step. Build curves by sampling points along them (a circle is ~24 points), and put separate parts of a drawing on separate layers so they can be edited independently. Call ui_sketch_get_layer_image afterwards to see what you drew.",
      z.object({ strokes: z.array(strokeSchema).min(1) }),
      async ({ strokes }) => {
        const batch = strokes as StrokeArgs[];
        // Resolve and validate every target before painting anything, so a bad
        // stroke in the batch leaves no half-drawn figure behind.
        const resolved = batch.map((stroke) => {
          const layer = resolveTarget(stroke.target ?? "active");
          if (layer.locked) {
            throw new Error(
              `Layer "${layer.name}" is locked — unlock it with ui_sketch_set_layer_props before painting.`
            );
          }
          if (layer.type !== "raster") {
            throw new Error(
              `Layer "${layer.name}" is a ${layer.type} layer; strokes only paint on raster layers.`
            );
          }
          return { layer, stroke };
        });

        const results = resolved.map(({ layer, stroke }) => {
          const strokeTool = stroke.tool ?? "brush";
          const opacity = stroke.opacity ?? 1;
          const { buffer, dirty } = renderStroke({
            width,
            height,
            tool: strokeTool,
            points: stroke.points,
            color: stroke.color ?? foregroundColor,
            size: stroke.size ?? DEFAULT_BRUSH_SETTINGS.size,
            hardness: stroke.hardness ?? DEFAULT_BRUSH_SETTINGS.hardness,
            closed: stroke.closed ?? false
          });

          const ctx = paintContext(ensureRaster(layer));
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.globalCompositeOperation =
            strokeTool === "eraser" ? "destination-out" : "source-over";
          ctx.drawImage(buffer, 0, 0);
          ctx.restore();
          layer.strokeCount += 1;

          const box = dirty.current;
          const bounds = box
            ? (() => {
                const x = Math.max(0, Math.min(width, box.minX));
                const y = Math.max(0, Math.min(height, box.minY));
                const right = Math.max(0, Math.min(width, box.maxX));
                const bottom = Math.max(0, Math.min(height, box.maxY));
                return right > x && bottom > y
                  ? { x, y, width: right - x, height: bottom - y }
                  : null;
              })()
            : null;

          return {
            layerId: layer.id,
            layerName: layer.name,
            tool: strokeTool,
            points: stroke.points.length,
            bounds
          };
        });

        return { ok: true, strokes: results };
      }
    ),

    tool(
      "ui_sketch_resize_canvas",
      "Resize the canvas (artboard) to `width` x `height` pixels. Existing layers keep their pixels; content outside the new bounds is clipped.",
      z.object({
        width: z.number().min(1),
        height: z.number().min(1)
      }),
      async ({ width: w, height: h }) => {
        width = Math.max(1, Math.round(w as number));
        height = Math.max(1, Math.round(h as number));
        // Re-cut every existing bitmap now rather than on next use, so the
        // reported pixel counts always describe the current canvas.
        for (const layer of layers) {
          if (layer.raster) ensureRaster(layer);
        }
        return { ok: true, width, height };
      }
    ),

    tool(
      "ui_sketch_selection",
      "Shape the pixel selection: `all` selects the whole canvas, `invert` inverts the current selection, `clear` deselects. Inpainting and selection-scoped edits act within this selection.",
      z.object({ op: z.enum(["all", "clear", "invert"]) }),
      async ({ op }) => {
        if (op === "all") {
          selection = rectSelection(width, height, 0, 0, width, height);
        } else if (op === "clear") {
          selection = null;
        } else if (!selection) {
          selection = rectSelection(width, height, 0, 0, width, height);
        } else {
          const all = rectSelection(width, height, 0, 0, width, height);
          selection = combineSelections(all, selection, "subtract");
        }
        return { ok: true, hasSelection: hasSelectionPixels(selection) };
      }
    ),

    tool(
      "ui_sketch_fill",
      "Flood fill a connected region on a raster layer starting from canvas pixel coordinates (x, y) with color and tolerance.",
      z.object({
        target: targetParam.optional(),
        x: z.number(),
        y: z.number(),
        color: z.string().optional(),
        tolerance: z.number().min(0).max(255).optional(),
        contiguous: z.boolean().optional()
      }),
      async ({ target, x, y, color, tolerance, contiguous }) => {
        const layer = resolveTarget((target as string | undefined) ?? "active");
        if (layer.locked) {
          throw new Error(
            `Layer "${layer.name}" is locked and cannot take pixels.`
          );
        }
        if (layer.type !== "raster") {
          throw new Error(
            `Layer "${layer.name}" is a ${layer.type} layer; fill only writes raster layers.`
          );
        }
        const fillColor = (color as string | undefined) ?? foregroundColor;
        fillOnContext(
          requireRasterContext(paintContext(ensureRaster(layer))),
          x as number,
          y as number,
          {
            color: fillColor,
            tolerance: (tolerance as number | undefined) ?? 16,
            contiguous: (contiguous as boolean | undefined) ?? true
          }
        );
        return {
          ok: true,
          layerId: layer.id,
          layerName: layer.name,
          x,
          y,
          color: fillColor
        };
      }
    ),

    tool(
      "ui_sketch_gradient",
      "Draw a linear or radial gradient across a raster layer from start to end points.",
      z.object({
        target: targetParam.optional(),
        type: z.enum(["linear", "radial"]),
        start: z.object({ x: z.number(), y: z.number() }),
        end: z.object({ x: z.number(), y: z.number() }),
        stops: z
          .array(
            z.object({ offset: z.number().min(0).max(1), color: z.string() })
          )
          .optional()
      }),
      async ({ target, type, start, end, stops }) => {
        const layer = resolveTarget((target as string | undefined) ?? "active");
        if (layer.locked || layer.type !== "raster") {
          throw new Error(`Layer "${layer.name}" cannot take a gradient.`);
        }
        const ramp = (stops as
          | { offset: number; color: string }[]
          | undefined) ?? [
          { offset: 0, color: foregroundColor },
          { offset: 1, color: backgroundColor }
        ];
        if (ramp.length < 2) {
          throw new Error("A gradient needs at least two color stops.");
        }
        drawGradient(
          requireRasterContext(paintContext(ensureRaster(layer))),
          type as "linear" | "radial",
          start as { x: number; y: number },
          end as { x: number; y: number },
          ramp
        );
        return { ok: true, layerId: layer.id, layerName: layer.name, type };
      }
    ),

    tool(
      "ui_sketch_draw_shape",
      "Draw geometric shapes (rect, ellipse, line, arrow, polygon, star) with optional fill, stroke, and corner radius.",
      z.object({
        target: targetParam.optional(),
        shape: z.enum(["rect", "ellipse", "line", "arrow", "polygon", "star"]),
        x: z.number(),
        y: z.number(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        fill: z.string().optional(),
        stroke: z.string().optional(),
        strokeWidth: z.number().min(0).optional(),
        cornerRadius: z.number().min(0).optional(),
        points: z.number().int().min(3).optional(),
        innerRadius: z.number().optional()
      }),
      async (args) => {
        const layer = resolveTarget(
          (args.target as string | undefined) ?? "active"
        );
        if (layer.locked || layer.type !== "raster") {
          throw new Error(`Layer "${layer.name}" cannot take a shape.`);
        }
        const bounds = drawShape(
          requireRasterContext(paintContext(ensureRaster(layer))),
          {
            shape: args.shape as
              | "rect"
              | "ellipse"
              | "line"
              | "arrow"
              | "polygon"
              | "star",
            x: args.x as number,
            y: args.y as number,
            width: args.width as number | undefined,
            height: args.height as number | undefined,
            fill: args.fill as string | undefined,
            stroke: args.stroke as string | undefined,
            strokeWidth: args.strokeWidth as number | undefined,
            cornerRadius: args.cornerRadius as number | undefined,
            points: args.points as number | undefined,
            innerRadius: args.innerRadius as number | undefined
          }
        );
        return {
          ok: true,
          layerId: layer.id,
          layerName: layer.name,
          shape: args.shape,
          bounds
        };
      }
    ),

    tool(
      "ui_sketch_set_selection_shape",
      "Define or modify a pixel selection mask using geometric shapes (rect, ellipse) or polylines (lasso, polygon).",
      z.object({
        mode: z.enum(["replace", "add", "subtract", "intersect"]).optional(),
        shape: z.enum(["rect", "ellipse", "lasso", "polygon"]),
        bounds: z
          .object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number()
          })
          .optional(),
        points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
        feather: z.number().min(0).optional()
      }),
      async ({ mode, shape, bounds, points, feather }) => {
        const op =
          (mode as "replace" | "add" | "subtract" | "intersect") ?? "replace";
        let overlay: RasterSelection;
        if (shape === "rect" || shape === "ellipse") {
          const box = bounds as
            | { x: number; y: number; width: number; height: number }
            | undefined;
          if (!box) {
            throw new Error(`Shape "${shape}" needs a bounds box.`);
          }
          overlay =
            shape === "rect"
              ? rectSelection(
                  width,
                  height,
                  box.x,
                  box.y,
                  box.width,
                  box.height
                )
              : ellipseSelection(
                  width,
                  height,
                  box.x,
                  box.y,
                  box.width,
                  box.height
                );
        } else {
          const pts = points as { x: number; y: number }[] | undefined;
          if (!pts || pts.length < 3) {
            throw new Error(`Shape "${shape}" needs at least three points.`);
          }
          overlay = polygonSelection(width, height, pts);
        }
        selection = combineSelections(selection, overlay, op);
        if ((feather as number | undefined) && (feather as number) > 0) {
          selection = featherSelection(selection, feather as number);
        }
        return {
          ok: true,
          hasSelection: hasSelectionPixels(selection),
          shape,
          mode: op
        };
      }
    ),

    tool(
      "ui_sketch_transform",
      "Translate, scale, rotate, or flip a layer's raster pixels or active selection.",
      z.object({
        target: targetParam.optional(),
        dx: z.number().optional(),
        dy: z.number().optional(),
        scaleX: z.number().optional(),
        scaleY: z.number().optional(),
        rotation: z.number().optional(),
        flipH: z.boolean().optional(),
        flipV: z.boolean().optional()
      }),
      async (args) => {
        const layer = resolveTarget(
          (args.target as string | undefined) ?? "active"
        );
        if (layer.locked || layer.type !== "raster") {
          throw new Error(`Layer "${layer.name}" cannot be transformed.`);
        }
        const dx = (args.dx as number | undefined) ?? 0;
        const dy = (args.dy as number | undefined) ?? 0;
        const scaleX = (args.scaleX as number | undefined) ?? 1;
        const scaleY = (args.scaleY as number | undefined) ?? 1;
        const rotation = (args.rotation as number | undefined) ?? 0;
        const flipH = (args.flipH as boolean | undefined) ?? false;
        const flipV = (args.flipV as boolean | undefined) ?? false;
        transformRaster(
          requireRasterContext(paintContext(ensureRaster(layer))),
          {
            dx,
            dy,
            scaleX,
            scaleY,
            rotation,
            flipH,
            flipV
          }
        );
        return {
          ok: true,
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
      }
    ),

    tool(
      "ui_sketch_adjust_layer",
      "Apply tone and color adjustments (brightness, contrast, exposure, saturation, hue, blur) to a layer.",
      z.object({
        target: targetParam.optional(),
        brightness: z.number().min(-1).max(1).optional(),
        contrast: z.number().min(-1).max(1).optional(),
        exposure: z.number().min(-2).max(2).optional(),
        saturation: z.number().min(-1).max(1).optional(),
        hue: z.number().min(-180).max(180).optional(),
        blur: z.number().min(0).max(100).optional()
      }),
      async (args) => {
        const layer = resolveTarget(
          (args.target as string | undefined) ?? "active"
        );
        if (layer.locked || layer.type !== "raster") {
          throw new Error(`Layer "${layer.name}" cannot be adjusted.`);
        }
        const adjustments: RasterAdjustments = {};
        if (args.brightness !== undefined) {
          adjustments.brightness = args.brightness as number;
        }
        if (args.contrast !== undefined) {
          adjustments.contrast = args.contrast as number;
        }
        if (args.exposure !== undefined) {
          adjustments.exposure = args.exposure as number;
        }
        if (args.saturation !== undefined) {
          adjustments.saturation = args.saturation as number;
        }
        if (args.hue !== undefined) adjustments.hue = args.hue as number;
        if (args.blur !== undefined) adjustments.blur = args.blur as number;
        if (Object.keys(adjustments).length === 0) {
          throw new Error("Provide at least one adjustment.");
        }
        adjustOnContext(
          requireRasterContext(paintContext(ensureRaster(layer))),
          adjustments
        );
        return {
          ok: true,
          layerId: layer.id,
          layerName: layer.name,
          adjustments
        };
      }
    ),

    tool(
      "ui_sketch_crop",
      "Crop the document canvas or a specific layer to a defined bounding box (x, y, width, height).",
      z.object({
        target: targetParam.nullable().optional(),
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive()
      }),
      async ({ target, x, y, width: cw, height: ch }) => {
        const box = {
          x: Math.round(x as number),
          y: Math.round(y as number),
          width: Math.round(cw as number),
          height: Math.round(ch as number)
        };
        if (target == null) {
          for (const layer of layers) {
            if (!layer.raster) {
              continue;
            }
            const next = createCanvas(box.width, box.height);
            paintContext(next).drawImage(layer.raster, -box.x, -box.y);
            layer.raster = next;
          }
          width = box.width;
          height = box.height;
          return { ok: true, layerId: null, width, height };
        }
        const layer = resolveTarget(target as string);
        if (layer.locked || layer.type !== "raster") {
          throw new Error(`Layer "${layer.name}" cannot be cropped.`);
        }
        cropLayerInPlace(
          requireRasterContext(paintContext(ensureRaster(layer))),
          box.x,
          box.y,
          box.width,
          box.height
        );
        return {
          ok: true,
          layerId: layer.id,
          width: box.width,
          height: box.height
        };
      }
    ),

    tool(
      "ui_sketch_pick_color",
      "Sample the pixel color at (x, y) on the composite canvas or on a specific layer (eyedropper).",
      z.object({
        target: targetParam.nullable().optional(),
        x: z.number(),
        y: z.number()
      }),
      async ({ target, x, y }) => {
        const canvas =
          target == null
            ? composite()
            : ensureRaster(resolveTarget(target as string));
        const sample = pickPixel(
          readFullImage(requireRasterContext(paintContext(canvas))),
          x as number,
          y as number
        );
        return { ok: true, ...sample };
      }
    ),

    tool(
      "ui_sketch_get_layer_image",
      "Inspect the canvas as an image. Omit `target` (or pass null) for the flattened composite of all visible layers; pass a layer id/name to read that single layer's pixels. Returns the dimensions plus an image you can visually inspect, so you can see the current artwork before editing it.",
      z.object({
        target: targetParam
          .nullable()
          .optional()
          .describe("Layer to read; omit or null for the flattened composite.")
      }),
      async ({ target }) => {
        const addressed = (target ?? null) as string | null;
        const layer = addressed === null ? null : resolveTarget(addressed);
        const canvas = layer ? ensureRaster(layer) : composite();
        return {
          ok: true,
          layerId: layer?.id ?? null,
          layerName: layer?.name ?? null,
          width,
          height,
          note:
            layer === null
              ? "Flattened composite of all visible layers (PNG)."
              : `Pixels of layer "${layer.name}" (PNG).`,
          // Mirrors the frontend tool: the base64 rides in `image_content`, not
          // in the result body, so a full-canvas PNG never lands in the
          // transcript verbatim.
          image_content: {
            uri: canvas.toDataURL("image/png"),
            mimeType: "image/png"
          }
        };
      }
    )
  ];

  const bridge: SketchToolBridge = {
    tools,
    compositePng: () => composite().toBuffer("image/png"),
    compositeDataUrl: () => composite().toDataURL("image/png"),
    finalState: (): SketchBridgeFinalState => {
      const area = width * height;
      const paintedPixels = countPaintedPixels(composite());
      const strokedPixels = countPaintedPixels(
        compositeOf(layers.filter((l) => l.strokeCount > 0))
      );
      return {
        name,
        width,
        height,
        activeLayerId,
        foregroundColor,
        backgroundColor,
        activeTool,
        hasSelection: hasSelectionPixels(selection),
        paintedPixels,
        paintedFraction: paintedPixels / area,
        strokedFraction: strokedPixels / area,
        layers: layers.map((l, i) => {
          const entry: SketchBridgeFinalState["layers"][number] = {
            id: l.id,
            name: l.name,
            type: l.type,
            visible: l.visible,
            opacity: l.opacity,
            blendMode: l.blendMode,
            index: i,
            hasBinding: l.hasBinding,
            paintedPixels: countPaintedPixels(l.raster),
            strokeCount: l.strokeCount
          };
          if (l.prompt !== undefined) entry.prompt = l.prompt;
          if (l.provider !== undefined) entry.provider = l.provider;
          if (l.model !== undefined) entry.model = l.model;
          if (l.fillColor !== undefined) entry.fillColor = l.fillColor;
          return entry;
        })
      };
    }
  };

  lastCreatedBridge = bridge;
  return bridge;
}

const SKETCH_SYSTEM_PROMPT = `You are an assistant driving a Sketch / image editor through UI tools.

Use the ui_sketch_* tools to inspect and modify the open image document:
- Call ui_sketch_get_state first to see the layer stack, active layer, colors, and tool.
- Layers are addressed by id, by (case-insensitive) name, or the literal "active" for the active layer.
- Add layers with ui_sketch_add_layer, adjust them with ui_sketch_set_layer_props (opacity, blend mode, name, visibility, lock).
- Generate imagery with ui_sketch_generate; recolor with ui_sketch_set_color; resize the canvas with ui_sketch_resize_canvas; shape the pixel selection with ui_sketch_selection or ui_sketch_set_selection_shape.
- Paint regions with ui_sketch_fill, ui_sketch_gradient, and ui_sketch_draw_shape. Transform or grade a layer with ui_sketch_transform and ui_sketch_adjust_layer. Crop with ui_sketch_crop. Sample a pixel with ui_sketch_pick_color.

You can draw. ui_sketch_stroke paints real pixels with the editor's brush, pencil and eraser:
- A stroke is a polyline of canvas-pixel points (x right, y down, origin top-left) plus its own color, size, opacity and hardness. The engine interpolates dabs along each segment, so a curve is just enough sampled points — a circle is about 24 points around it, and you can pass "closed": true to join the last point back to the first.
- Pass several strokes in one call to lay down a whole figure at once. Paint on raster layers only, and never on a locked one.
- Put separate parts of a drawing on separate, named layers (ui_sketch_add_layer) so each can be moved, recolored or hidden on its own.
- Call ui_sketch_get_layer_image to look at your own work — omit target for the flattened composite, or name a layer to see it alone. Check the result and fix what looks wrong before you finish.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

export const SKETCH_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<SketchBridgeFinalState>[] =
  [
    {
      id: "compose-layers",
      description:
        "Add two layers, set the top layer to 50% opacity + multiply blend, and name them",
      objective:
        "The document has a single 'Background' layer. Add two new layers, name them, and set the top new layer to 50% opacity with 'multiply' blend mode.",
      createBridge: () => createSketchToolBridge(),
      systemPrompt: SKETCH_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_sketch_add_layer", "ui_sketch_set_layer_props"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 15,
        finalState: [
          {
            name: "hasThreeLayers",
            detail: "fewer than 3 layers in the document",
            test: (s) => s.layers.length >= 3
          },
          {
            name: "hasHalfOpacityLayer",
            detail: "no layer has opacity < 1",
            test: (s) => s.layers.some((l) => l.opacity < 1)
          },
          {
            name: "hasMultiplyBlend",
            detail: "no layer uses multiply blend mode",
            test: (s) => s.layers.some((l) => l.blendMode === "multiply")
          }
        ]
      }
    },
    {
      id: "generate-layer",
      description:
        "Generate a text-to-image layer from a prompt and set the foreground color",
      objective:
        "Generate a text-to-image layer using provider 'fal_ai' and model 'fal-ai/flux/schnell' with a descriptive prompt, and set the foreground color to #ff8800.",
      createBridge: () => createSketchToolBridge(),
      systemPrompt: SKETCH_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_sketch_generate", "ui_sketch_set_color"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 12,
        finalState: [
          {
            name: "hasBoundLayerWithPrompt",
            detail: "no layer has a generation binding with a prompt set",
            test: (s) =>
              s.layers.some(
                (l) => l.hasBinding && !!l.prompt && l.prompt.length > 0
              )
          },
          {
            name: "foregroundSet",
            detail: "foreground color is not #ff8800",
            test: (s) => s.foregroundColor.toLowerCase() === "#ff8800"
          }
        ]
      }
    },
    {
      id: "resize-and-select",
      description: "Resize the canvas to 1024x768 and select the whole canvas",
      objective:
        "Resize the canvas to 1024x768 pixels and select the whole canvas.",
      createBridge: () => createSketchToolBridge(),
      systemPrompt: SKETCH_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_sketch_resize_canvas", "ui_sketch_selection"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 8,
        finalState: [
          {
            name: "resizedWidth",
            detail: "canvas width is not 1024",
            test: (s) => s.width === 1024
          },
          {
            name: "resizedHeight",
            detail: "canvas height is not 768",
            test: (s) => s.height === 768
          },
          {
            name: "hasSelection",
            detail: "canvas has no active selection",
            test: (s) => s.hasSelection === true
          }
        ]
      }
    },
    {
      id: "draw-an-animal",
      description:
        "Draw a cat with ui_sketch_stroke across separate named layers, then look at the result",
      objective:
        "Draw a simple cat on the canvas. Put the body, the head, and the face details (eyes, nose, whiskers) on separate layers, each with a name that says what it holds, and draw each part with strokes. When you are done, look at the flattened result to check what you drew.",
      createBridge: () => createSketchToolBridge({ width: 512, height: 512 }),
      systemPrompt: SKETCH_SYSTEM_PROMPT,
      // Drawing is many-turned: a layer per part, a stroke batch per layer, and
      // a look at the result. Measured runs land around 8-20 calls, well past
      // the runner's default cap of 12.
      maxIterations: 40,
      expect: {
        requiredTools: ["ui_sketch_stroke", "ui_sketch_get_layer_image"],
        // Looking at the drawing only means something once there is one.
        ordering: [["ui_sketch_stroke", "ui_sketch_get_layer_image"]],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 40,
        finalState: [
          {
            name: "hasSeparateNamedLayers",
            detail:
              "fewer than 3 distinctly named layers — the parts were not separated",
            test: (s) =>
              new Set(s.layers.map((l) => l.name.trim().toLowerCase())).size >=
              3
          },
          {
            name: "partsAreOnDifferentLayers",
            detail: "strokes landed on fewer than 2 layers",
            test: (s) => s.layers.filter((l) => l.strokeCount > 0).length >= 2
          },
          {
            name: "canvasIsMeaningfullyPainted",
            // Structural, not pictorial: a cat this cannot judge, but a canvas
            // still 99% empty is not a drawing by any reading. Measured over
            // the stroked layers only, so a solid backdrop fill cannot pass it.
            detail: "strokes covered less than 1% of the canvas",
            test: (s) => s.strokedFraction >= 0.01
          }
        ]
      }
    }
  ];
