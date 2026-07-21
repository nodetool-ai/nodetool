/**
 * Headless bridge for the Sketch / image editor tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/sketch.ts`) delegate to
 * a `SketchAgentHandler` the live `SketchEditor` registers on the
 * `sketchAgentBridge` under its document id — it mutates a layered raster
 * document backed by real canvases and (for generation) dispatches actual
 * image-generation jobs. None of that can run under Node. This bridge
 * reimplements the *effects* of the non-pixel, non-asset tools against a
 * plain in-memory layer stack, so a model can drive the same `ui_sketch_*`
 * tool surface headlessly.
 *
 * What it does NOT fork is the tool *contract*: names and descriptions are
 * copied verbatim from the builtin file, and parameters mirror its Zod
 * shapes — minus the `sketch_id` param, since this bridge addresses a single
 * implicit document rather than a registry of open editors.
 *
 * `ui_sketch_get_layer_image` and `ui_sketch_render_to_asset` are
 * intentionally excluded: they need a real canvas to rasterize pixels and an
 * asset-upload service, neither of which has a meaningful headless
 * equivalent.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";

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

const BLEND_MODES = [
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
  layers: {
    id: string;
    name: string;
    type: "raster" | "mask" | "group";
    visible: boolean;
    opacity: number;
    blendMode: SketchBlendMode;
    index: number;
    hasBinding: boolean;
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
  /** Solid fill applied at creation (headless stand-in for painted pixels). */
  fillColor?: string;
}

function tool(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<unknown>
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

/**
 * Build an in-memory sketch/image-editor bridge whose tools share the
 * `ui_sketch_*` contract but run headlessly against a plain layer array (no
 * canvas, no pixels).
 */
export function createSketchToolBridge(
  initial: SketchBridgeInitialState = {}
): HeadlessSurfaceBridge<SketchBridgeFinalState> {
  const name = initial.name ?? "Untitled";
  let width = initial.width ?? 1024;
  let height = initial.height ?? 1024;
  let foregroundColor = "#000000";
  let backgroundColor = "#ffffff";
  let activeTool = "brush";
  let hasSelection = false;

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
    hasBinding: false
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

  const serialize = (l: Layer): Layer => ({ ...l });

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
          hasSelection,
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
        if (typeof fillColor === "string" && fillColor) {
          layer.fillColor = fillColor;
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
          name: `${source.name} copy`
        };
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
        if (patch.visible !== undefined) layer.visible = patch.visible as boolean;
        if (patch.opacity !== undefined) layer.opacity = patch.opacity as number;
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
          visibleIndices.length > 0
            ? visibleIndices[0]
            : layers.length;
        const removeCount = visibleIndices.length;
        const flattened = makeLayer(nextLayerId(), "Flattened", "raster");
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
          layer: Layer;
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
      "ui_sketch_resize_canvas",
      "Resize the canvas (artboard) to `width` x `height` pixels. Existing layers keep their pixels; content outside the new bounds is clipped.",
      z.object({
        width: z.number().min(1),
        height: z.number().min(1)
      }),
      async ({ width: w, height: h }) => {
        width = w as number;
        height = h as number;
        return { ok: true, width, height };
      }
    ),

    tool(
      "ui_sketch_selection",
      "Shape the pixel selection: `all` selects the whole canvas, `invert` inverts the current selection, `clear` deselects. Inpainting and selection-scoped edits act within this selection.",
      z.object({ op: z.enum(["all", "clear", "invert"]) }),
      async ({ op }) => {
        if (op === "all") hasSelection = true;
        else if (op === "clear") hasSelection = false;
        else hasSelection = !hasSelection;
        return { ok: true, hasSelection };
      }
    )
  ];

  return {
    tools,
    finalState: (): SketchBridgeFinalState => ({
      name,
      width,
      height,
      activeLayerId,
      foregroundColor,
      backgroundColor,
      activeTool,
      hasSelection,
      layers: layers.map((l, i) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        visible: l.visible,
        opacity: l.opacity,
        blendMode: l.blendMode,
        index: i,
        hasBinding: l.hasBinding,
        ...(l.prompt !== undefined ? { prompt: l.prompt } : {}),
        ...(l.provider !== undefined ? { provider: l.provider } : {}),
        ...(l.model !== undefined ? { model: l.model } : {}),
        ...(l.fillColor !== undefined ? { fillColor: l.fillColor } : {})
      }))
    })
  };
}

const SKETCH_SYSTEM_PROMPT = `You are an assistant driving a Sketch / image editor through UI tools.

Use the ui_sketch_* tools to inspect and modify the open image document:
- Call ui_sketch_get_state first to see the layer stack, active layer, colors, and tool.
- Layers are addressed by id, by (case-insensitive) name, or the literal "active" for the active layer.
- Add layers with ui_sketch_add_layer, adjust them with ui_sketch_set_layer_props (opacity, blend mode, name, visibility, lock).
- Generate imagery with ui_sketch_generate; recolor with ui_sketch_set_color; resize the canvas with ui_sketch_resize_canvas; shape the pixel selection with ui_sketch_selection.

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
              s.layers.some((l) => l.hasBinding && !!l.prompt && l.prompt.length > 0)
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
    }
  ];
