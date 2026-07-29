import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { getSketchAgentHandler } from "../../../components/sketch/sketchAgentBridge";

/**
 * Frontend tools that let the agent drive a live image / sketch editor —
 * adding and arranging layers, generating imagery, recoloring, and reshaping the
 * canvas like a real editor.
 *
 * They delegate to the handler each open {@link SketchEditor} registers on the
 * {@link sketchAgentBridge} under its document id. When the requested id is not
 * open, `getSketchAgentHandler` throws an error naming the ids that are, and
 * the tool layer surfaces it back to the agent.
 *
 * Conventions:
 *   - Every tool takes a required `sketch_id` naming the target document; there
 *     is no implicit "focused editor".
 *   - Layers are addressed by id, by (case-insensitive) name, or the literal
 *     `"active"` for the active layer.
 *   - Call `ui_sketch_get_state` first to discover the ids/names other tools
 *     need.
 */

const sketchIdParam = z
  .string()
  .describe(
    "Id of the target image document. The ui_context block in the system prompt lists the open image document ids; `ui_sketch_get_state` returns the id of the document it read."
  );

const targetParam = z
  .string()
  .describe(
    'Layer id, layer name (case-insensitive), or the literal "active" for the active layer.'
  );

const blendModeEnum = z.enum([
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
]);

const toolEnum = z.enum([
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
]);

FrontendToolRegistry.register({
  name: "ui_sketch_get_state",
  description:
    "Read the specified image document: name, canvas size, the active layer, foreground/background color, the active tool, whether a pixel selection is active, and every layer (id, name, type, visibility, opacity, blend mode, lock state, and any generation binding prompt/provider/model/status). Call this first to discover what's on the canvas and to get the ids/names other image-editor tools need.",
  parameters: z.object({ sketch_id: sketchIdParam }),
  async execute({ sketch_id }) {
    const snapshot = getSketchAgentHandler(sketch_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_add_layer",
  description:
    "Add a new layer above the active one. `type` is raster (default) or mask. Optionally give it a `name` and a `fillColor` (hex) to fill it with a solid color.",
  parameters: z.object({
    sketch_id: sketchIdParam,
    name: z.string().optional(),
    type: z.enum(["raster", "mask"]).optional(),
    fillColor: z
      .string()
      .optional()
      .describe("Hex color to fill the new layer with, e.g. #ff0000.")
  }),
  async execute({ sketch_id, name, type, fillColor }) {
    const layer = getSketchAgentHandler(sketch_id).addLayer({ name, type, fillColor });
    return { ok: true, layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_remove_layer",
  description: "Delete a layer from the specified image document.",
  parameters: z.object({ sketch_id: sketchIdParam, target: targetParam }),
  async execute({ sketch_id, target }) {
    const layer = getSketchAgentHandler(sketch_id).removeLayer(target);
    return { ok: true, deleted: layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_duplicate_layer",
  description:
    "Duplicate a layer. The copy is inserted directly above the source.",
  parameters: z.object({ sketch_id: sketchIdParam, target: targetParam }),
  async execute({ sketch_id, target }) {
    const layer = getSketchAgentHandler(sketch_id).duplicateLayer(target);
    return { ok: true, layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_select_layer",
  description: "Make a layer the active layer (subsequent edits target it).",
  parameters: z.object({ sketch_id: sketchIdParam, target: targetParam }),
  async execute({ sketch_id, target }) {
    const layer = getSketchAgentHandler(sketch_id).selectLayer(target);
    return { ok: true, active: layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_set_layer_props",
  description:
    "Change a layer's properties: `name`, `visible`, `opacity` (0..1), `blendMode`, `locked`, or `alphaLock` (lock transparency). Omit a field to leave it unchanged.",
  parameters: z.object({
    sketch_id: sketchIdParam,
    target: targetParam,
    name: z.string().optional(),
    visible: z.boolean().optional(),
    opacity: z.number().min(0).max(1).optional(),
    blendMode: blendModeEnum.optional(),
    locked: z.boolean().optional(),
    alphaLock: z.boolean().optional()
  }),
  async execute({ sketch_id, target, ...patch }) {
    const layer = getSketchAgentHandler(sketch_id).setLayerProps(target, patch);
    return { ok: true, layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_reorder_layer",
  description:
    "Move a layer up or down in the stack. `up` moves it toward the top (composited above its neighbors); `down` moves it toward the bottom.",
  parameters: z.object({
    sketch_id: sketchIdParam,
    target: targetParam,
    direction: z.enum(["up", "down"])
  }),
  async execute({ sketch_id, target, direction }) {
    const layer = getSketchAgentHandler(sketch_id).reorderLayer(target, direction);
    return { ok: true, layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_merge_down",
  description:
    "Merge a layer into the layer directly below it, replacing the two with a single flattened raster layer.",
  parameters: z.object({ sketch_id: sketchIdParam, target: targetParam }),
  async execute({ sketch_id, target }) {
    const layer = getSketchAgentHandler(sketch_id).mergeLayerDown(target);
    return { ok: true, layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_flatten_visible",
  description:
    "Flatten all visible layers into a single raster layer. Returns the resulting layer.",
  parameters: z.object({ sketch_id: sketchIdParam }),
  async execute({ sketch_id }) {
    const layer = getSketchAgentHandler(sketch_id).flattenVisible();
    return { ok: true, layer };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_generate",
  description:
    'Generate imagery onto a new layer. `kind` is text-to-image (from a prompt) or image-to-image (transform an existing layer — pass `sourceLayer`). Provide `provider` and `model` (discover valid ones with the model-search tool); when omitted the last-used image model is reused. Optional `width`/`height` (default the canvas size), `aspectRatio` (e.g. "16:9"), and `resolution` (e.g. "1K") shape the output for models that use size enums. Generation starts immediately unless `autoGenerate` is false. Poll ui_sketch_get_state for the layer\'s binding status.',
  parameters: z.object({
    sketch_id: sketchIdParam,
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
  async execute({ sketch_id, ...args }) {
    const result = await getSketchAgentHandler(sketch_id).generate(args);
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_set_color",
  description:
    "Set the specified image document's foreground and/or background color (hex). The foreground color is used by the brush, fill, and shape tools.",
  parameters: z.object({
    sketch_id: sketchIdParam,
    foreground: z.string().optional(),
    background: z.string().optional()
  }),
  async execute({ sketch_id, foreground, background }) {
    const handler = getSketchAgentHandler(sketch_id);
    const result: { foreground?: string; background?: string } = {};
    if (foreground !== undefined) {
      result.foreground = handler.setForegroundColor(foreground);
    }
    if (background !== undefined) {
      result.background = handler.setBackgroundColor(background);
    }
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_set_tool",
  description:
    "Select the active tool in the specified image document (e.g. brush, eraser, fill, select, move, transform, crop). Drives which tool the editor's pointer uses.",
  parameters: z.object({ sketch_id: sketchIdParam, tool: toolEnum }),
  async execute({ sketch_id, tool }) {
    const active = getSketchAgentHandler(sketch_id).setActiveTool(tool);
    return { ok: true, activeTool: active };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_resize_canvas",
  description:
    "Resize the canvas (artboard) to `width` x `height` pixels. Existing layers keep their pixels; content outside the new bounds is clipped.",
  parameters: z.object({
    sketch_id: sketchIdParam,
    width: z.number().min(1),
    height: z.number().min(1)
  }),
  async execute({ sketch_id, width, height }) {
    const size = getSketchAgentHandler(sketch_id).resizeCanvas(width, height);
    return { ok: true, ...size };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_selection",
  description:
    "Shape the pixel selection: `all` selects the whole canvas, `invert` inverts the current selection, `clear` deselects. Inpainting and selection-scoped edits act within this selection.",
  parameters: z.object({
    sketch_id: sketchIdParam,
    op: z.enum(["all", "clear", "invert"])
  }),
  async execute({ sketch_id, op }) {
    const result = getSketchAgentHandler(sketch_id).setSelection(op);
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_get_layer_image",
  description:
    "Inspect the canvas as an image. Omit `target` (or pass null) for the flattened composite of all visible layers; pass a layer id/name to read that single layer's pixels. Returns the dimensions plus an image you can visually inspect, so you can see the current artwork before editing it.",
  parameters: z.object({
    sketch_id: sketchIdParam,
    target: targetParam
      .nullable()
      .optional()
      .describe("Layer to read; omit or null for the flattened composite.")
  }),
  async execute({ sketch_id, target }) {
    const { dataUrl, ...meta } = await getSketchAgentHandler(
      sketch_id
    ).getLayerImage(target ?? null);
    return {
      ok: true,
      ...meta,
      note:
        meta.layerId === null
          ? "Flattened composite of all visible layers (PNG)."
          : `Pixels of layer "${meta.layerName ?? meta.layerId}" (PNG).`,
      // The server persists this as a temp image asset and hands the model a
      // handle; the model calls view_image to actually see it. Keeping the
      // base64 out of the result is what stops a full-canvas PNG (~1MB) from
      // blowing the context window.
      image_content: { uri: dataUrl, mimeType: "image/png" }
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_sketch_render_to_asset",
  description:
    "Render the canvas to a PNG (or PNGs) and save it as a temporary asset, returning asset ids and URLs. Provide one of: nothing (or `target` null) → the flattened composite of all visible layers as one asset; a single `target` (id/name) → that one layer; or `targets` (a list of ids/names) → each layer as its own asset, unless `merge` is true, in which case the listed layers are composited (bottom-to-top, honoring opacity/blend) into a single asset. Use this to hand the artwork to another tool or workflow that needs an asset id rather than raw pixels. Assets are throwaway uploads — delete them when done. Returns `assets` (an array of {assetId, url, width, height, layerId, layerName}).",
  parameters: z.object({
    sketch_id: sketchIdParam,
    target: targetParam
      .nullable()
      .optional()
      .describe(
        "Single layer to render; omit (with no `targets`) for the flattened composite."
      ),
    targets: z
      .array(targetParam)
      .optional()
      .describe("Multiple layers to render (ids/names)."),
    merge: z
      .boolean()
      .optional()
      .describe(
        "When `targets` is given: composite them into one asset instead of one asset per layer."
      ),
    name: z
      .string()
      .optional()
      .describe("Optional base name for the uploaded asset file(s).")
  }),
  async execute({ sketch_id, target, targets, merge, name }) {
    const handler = getSketchAgentHandler(sketch_id);
    if (targets && targets.length > 0) {
      const assets = await handler.renderLayersToAssets(targets, {
        merge,
        name
      });
      return { ok: true, assets };
    }
    const result = await handler.renderLayerToAsset(target ?? null, name);
    return { ok: true, assets: [result] };
  }
});
