/**
 * Sketch nodes — operate on persisted sketch documents (the image editor's
 * layered documents) referenced by the `sketch` type.
 *
 * Rendering matches the web editor's export flatten
 * (`web/src/components/sketch/serialization`): visible raster layers are
 * composited bottom→top with per-layer opacity and blend mode, placed by
 * translation (`transform.x/y + raster bounds`). Scale/rotation transforms
 * and non-destructive layer effects are not applied server-side.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { blendModeGpuId, coerceBlendMode } from "@nodetool-ai/gpu";
import {
  compositeImageLayers,
  type HeadlessLayer
} from "@nodetool-ai/gpu/node";
import type { ImageRef, SketchRef } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  base64ToBytes,
  bytesToBase64,
  decodeRgba,
  loadSharp,
  rawRgbaImageRef,
  SHARP_UNAVAILABLE_MESSAGE
} from "./image-io.js";

// ─── Sketch document shapes (minimal, tolerant of legacy payloads) ──────────

interface SketchLayerRaw {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  opacity?: number;
  blendMode?: string;
  data?: string | null;
  transform?: { x?: number; y?: number } | null;
  parentId?: string | null;
}

interface SketchDocRaw {
  canvas?: { width?: number; height?: number; backgroundColor?: string };
  layers?: SketchLayerRaw[];
  maskLayerId?: string | null;
}

interface SketchRefLike {
  type?: string;
  id?: string | null;
  data?: unknown;
}

const NTLAYER_PREFIX = "ntlayer:";

/** Decode a layer `data` payload: `ntlayer:<base64 JSON>` or a legacy data URL. */
function decodeLayerPayload(
  data: string,
  fallbackWidth: number,
  fallbackHeight: number
): {
  image: string | null;
  bounds: { x: number; y: number; width: number; height: number };
} {
  const fallbackBounds = {
    x: 0,
    y: 0,
    width: fallbackWidth,
    height: fallbackHeight
  };
  if (!data.startsWith(NTLAYER_PREFIX)) {
    return { image: data, bounds: fallbackBounds };
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(data.slice(NTLAYER_PREFIX.length), "base64").toString("utf8")
    ) as {
      image?: string | null;
      bounds?: { x: number; y: number; width: number; height: number };
    };
    return {
      image: decoded.image ?? null,
      bounds: decoded.bounds ?? fallbackBounds
    };
  } catch {
    return { image: data, bounds: fallbackBounds };
  }
}

/** Encode a layer raster as the editor's serialized `ntlayer:` payload. */
function encodeLayerPayload(
  imageDataUrl: string,
  bounds: { x: number; y: number; width: number; height: number }
): string {
  const json = JSON.stringify({ version: 1, image: imageDataUrl, bounds });
  return `${NTLAYER_PREFIX}${Buffer.from(json, "utf8").toString("base64")}`;
}

/** Layer is composited only when it and every ancestor group are visible. */
function isCompositeVisible(
  layers: SketchLayerRaw[],
  layer: SketchLayerRaw
): boolean {
  if (layer.visible === false) return false;
  const byId = new Map(layers.map((l) => [l.id, l]));
  let parentId = layer.parentId;
  const seen = new Set<string>();
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (parent.visible === false) return false;
    parentId = parent.parentId;
  }
  return true;
}

/** Product of ancestor group opacities (the editor multiplies these in). */
function ancestorOpacityProduct(
  layers: SketchLayerRaw[],
  layer: SketchLayerRaw
): number {
  const byId = new Map(layers.map((l) => [l.id, l]));
  let opacity = 1;
  let parentId = layer.parentId;
  const seen = new Set<string>();
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    opacity *= typeof parent.opacity === "number" ? parent.opacity : 1;
    parentId = parent.parentId;
  }
  return opacity;
}

/**
 * Resolve a sketch ref to its document: prefer the persisted image document
 * (by id, via the context's model interface), fall back to an inline payload.
 */
async function loadSketchDocument(
  ref: unknown,
  context: ProcessingContext | undefined
): Promise<SketchDocRaw> {
  const sketchRef = (ref ?? {}) as SketchRefLike;
  if (sketchRef.id) {
    if (!context) {
      throw new Error("RenderSketch requires a processing context");
    }
    const doc = (await context.getImageDocument(sketchRef.id)) as {
      document?: { sketch?: SketchDocRaw };
    } | null;
    const sketch = doc?.document?.sketch;
    if (!sketch) {
      throw new Error(`Sketch document not found: ${sketchRef.id}`);
    }
    return sketch;
  }
  const inline = sketchRef.data as
    | (SketchDocRaw & { sketch?: SketchDocRaw })
    | null
    | undefined;
  if (inline && typeof inline === "object") {
    return inline.sketch && typeof inline.sketch === "object"
      ? inline.sketch
      : inline;
  }
  throw new Error(
    "Sketch input is empty — connect a Constant Sketch node and pick a sketch"
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.startsWith("data:") ? dataUrl.indexOf(",") : -1;
  return base64ToBytes(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
}

/** Decode one sketch layer into a positioned headless compositor layer. */
async function layerToHeadless(
  doc: SketchDocRaw,
  layer: SketchLayerRaw,
  layers: SketchLayerRaw[]
): Promise<HeadlessLayer | null> {
  if (!layer.data) return null;
  const canvasWidth = doc.canvas?.width ?? 1024;
  const canvasHeight = doc.canvas?.height ?? 1024;
  const { image, bounds } = decodeLayerPayload(
    layer.data,
    canvasWidth,
    canvasHeight
  );
  if (!image) return null;
  const { rgba, width, height } = await decodeRgba({
    type: "image",
    data: dataUrlToBytes(image)
  });
  if (!width || !height) return null;
  const tx = typeof layer.transform?.x === "number" ? layer.transform.x : 0;
  const ty = typeof layer.transform?.y === "number" ? layer.transform.y : 0;
  const left = tx + bounds.x;
  const top = ty + bounds.y;
  const opacity =
    (typeof layer.opacity === "number" ? layer.opacity : 1) *
    ancestorOpacityProduct(layers, layer);
  return {
    rgba,
    width,
    height,
    opacity: Math.max(0, Math.min(1, opacity)),
    blendModeId: blendModeGpuId(coerceBlendMode(layer.blendMode)),
    // GPU transform (x, y) is the layer *center* in canvas pixels.
    transform: {
      x: left + width / 2,
      y: top + height / 2,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    }
  };
}

async function compositeLayers(
  doc: SketchDocRaw,
  selected: SketchLayerRaw[]
): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const width = doc.canvas?.width ?? 1024;
  const height = doc.canvas?.height ?? 1024;
  const layers = doc.layers ?? [];
  const headless: HeadlessLayer[] = [];
  for (const layer of selected) {
    const h = await layerToHeadless(doc, layer, layers);
    if (h) headless.push(h);
  }
  if (headless.length === 0) {
    // Transparent canvas, matching the editor's flatten of an empty document.
    return { rgba: new Uint8Array(width * height * 4), width, height };
  }
  return compositeImageLayers(headless, width, height);
}

/** Visible raster layers, bottom→top (mask and group rows excluded). */
function flattenableLayers(doc: SketchDocRaw): SketchLayerRaw[] {
  const layers = doc.layers ?? [];
  return layers.filter(
    (layer) =>
      layer.data &&
      layer.type !== "mask" &&
      layer.type !== "group" &&
      layer.id !== doc.maskLayerId &&
      isCompositeVisible(layers, layer)
  );
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

export class RenderSketchNode extends BaseNode {
  static readonly nodeType = "nodetool.sketch.RenderSketch";
  static readonly title = "Render Sketch";
  static readonly description =
    "Render a sketch document to a flat image (plus its mask layer when one is set).\n    sketch, render, flatten, image, mask\n\n    Use cases:\n    - Use a hand-drawn sketch as input for image generation (img2img, ControlNet-style guidance)\n    - Produce an inpainting mask painted in the sketch editor\n    - Turn editor compositions into workflow images without manual exporting";
  static readonly metadataOutputTypes = {
    image: "image",
    mask: "image"
  };
  static readonly inlineFields = ["sketch"];
  static readonly inputFields = ["sketch"];

  @prop({
    type: "sketch",
    default: { type: "sketch", id: null, data: null },
    title: "Sketch",
    description: "The sketch document to render."
  })
  declare sketch: SketchRef;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const doc = await loadSketchDocument(this.sketch, context);
    const image = await compositeLayers(doc, flattenableLayers(doc));

    const result: Record<string, unknown> = {
      image: rawRgbaImageRef(image.rgba, image.width, image.height)
    };

    const layers = doc.layers ?? [];
    const maskLayer = layers.find(
      (l) =>
        l.id === doc.maskLayerId && l.data && isCompositeVisible(layers, l)
    );
    if (maskLayer) {
      const mask = await compositeLayers(doc, [maskLayer]);
      result.mask = rawRgbaImageRef(mask.rgba, mask.width, mask.height);
    }
    return result;
  }
}

export class SketchLayersNode extends BaseNode {
  static readonly nodeType = "nodetool.sketch.SketchLayers";
  static readonly title = "Sketch Layers";
  static readonly description =
    "Extract each visible layer of a sketch document as a separate image.\n    sketch, layers, split, extract\n\n    Use cases:\n    - Process foreground/background layers through different pipelines\n    - Batch-restyle each layer of a composition independently\n    - Feed named layers into compositing or animation nodes";
  static readonly metadataOutputTypes = {
    layers: "list[image]",
    names: "list[str]"
  };
  static readonly inlineFields = ["sketch"];
  static readonly inputFields = ["sketch"];

  @prop({
    type: "sketch",
    default: { type: "sketch", id: null, data: null },
    title: "Sketch",
    description: "The sketch document to split into layer images."
  })
  declare sketch: SketchRef;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const doc = await loadSketchDocument(this.sketch, context);
    const layers: unknown[] = [];
    const names: string[] = [];
    for (const layer of flattenableLayers(doc)) {
      const rendered = await compositeLayers(doc, [layer]);
      layers.push(
        rawRgbaImageRef(rendered.rgba, rendered.width, rendered.height)
      );
      names.push(layer.name ?? "");
    }
    return { layers, names };
  }
}

export class CreateSketchNode extends BaseNode {
  static readonly nodeType = "nodetool.sketch.CreateSketch";
  static readonly title = "Create Sketch";
  static readonly description =
    "Create a new sketch document from an image, ready to edit in the sketch editor.\n    sketch, create, image, editor, handoff\n\n    Use cases:\n    - Hand a generated image to the sketch editor for manual touch-up\n    - Start a paint-over from a photo or render\n    - Round-trip: generate, refine by hand, feed back into the workflow";
  static readonly metadataOutputTypes = {
    output: "sketch"
  };
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["image"];

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null },
    title: "Image",
    description: "The image to place on the sketch's base layer."
  })
  declare image: ImageRef;

  @prop({
    type: "str",
    default: "Untitled sketch",
    title: "Name",
    description: "Name of the new sketch document."
  })
  declare name: string;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    if (!context) {
      throw new Error("CreateSketch requires a processing context");
    }
    const { rgba, width, height } = await decodeRgba(this.image, context);
    if (!width || !height) {
      throw new Error("CreateSketch: image input is empty");
    }
    const sharp = await loadSharp();
    if (!sharp) throw new Error(SHARP_UNAVAILABLE_MESSAGE);
    const png = new Uint8Array(
      await sharp(rgba, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer()
    );
    const dataUrl = `data:image/png;base64,${bytesToBase64(png)}`;
    const now = new Date().toISOString();
    const bounds = { x: 0, y: 0, width, height };

    const sketch = {
      version: 3,
      canvas: { width, height, backgroundColor: "#ffffff" },
      layers: [
        {
          id: "layer-1",
          name: "Image",
          type: "raster",
          visible: true,
          opacity: 1,
          locked: false,
          alphaLock: false,
          blendMode: "normal",
          data: encodeLayerPayload(dataUrl, bounds),
          transform: { kind: "affine", x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          contentBounds: bounds,
          effects: []
        }
      ],
      activeLayerId: "layer-1",
      maskLayerId: null,
      activeTool: "brush",
      viewport: { zoom: 1, pan: { x: 0, y: 0 } },
      history: [],
      historyIndex: -1,
      metadata: { createdAt: now, updatedAt: now }
    };

    const created = (await context.createImageDocument({
      name: String(this.name ?? "Untitled sketch"),
      width,
      height,
      document: { sketch, layerBindings: [] }
    })) as { id: string };

    return { output: { type: "sketch", id: created.id } };
  }
}

export const SKETCH_NODES = tagAsServer([
  RenderSketchNode,
  SketchLayersNode,
  CreateSketchNode
]);
