/**
 * The headless sketch renderer: `renderSketchDocument` from
 * `@nodetool-ai/image-editor/render.js` on an `@napi-rs/canvas` (Skia) host.
 *
 * The compositing rules are the editor's own, shared through image-editor, so
 * a sketch rendered here matches the editor's PNG and PSD exports. This file
 * only supplies what a host must: surfaces, image decoding, and the blend
 * table. It reads no storage itself. A layer image that is not a `data:` URL
 * goes through the caller's `loadImageBytes`, which is where access control
 * and the SSRF guard live; with no loader such a layer is reported as skipped.
 */

import { blendModeToCanvasOp, coerceBlendMode } from "@nodetool-ai/gpu";
import {
  isLayerCompositeVisible,
  normalizeRenderDocument,
  renderSketchDocument,
  type RenderImage,
  type RenderSurface,
  type SketchRenderHost,
  type SketchRenderLayerReport
} from "@nodetool-ai/image-editor/render.js";
import { encodeSketchPsd, type DocumentPixels } from "@nodetool-ai/image-editor/psd.js";
import { loadCanvas } from "@nodetool-ai/runtime";

/** Longest output edge, the sandbox canvas ceiling. */
export const MAX_SKETCH_RENDER_DIMENSION = 16384;

/** Output pixels, the sandbox canvas ceiling. */
export const MAX_SKETCH_RENDER_PIXELS = 32 * 1024 * 1024;

export type SketchRenderFormat = "png" | "psd";

export interface HeadlessSketchRenderOptions {
  /** Output size. One dimension alone keeps the canvas aspect ratio. PNG only. */
  width?: number;
  height?: number;
  /** CSS color painted under the composite. PNG only. */
  background?: string;
  /** Render this one layer, unblended, instead of the flattened stack. PNG only. */
  layerId?: string;
  /** Render the document's inpainting mask layer. PNG only. */
  mask?: boolean;
  format?: SketchRenderFormat;
  /** Bytes of a layer image that is not a `data:` URL (`asset://`, http). */
  loadImageBytes?: (uri: string) => Promise<Uint8Array>;
}

export interface HeadlessSketchRender {
  bytes: Uint8Array;
  format: SketchRenderFormat;
  mimeType: "image/png" | "image/vnd.adobe.photoshop";
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  /** The layer rendered alone, when one was. */
  layerId: string | null;
  /** Bottom of the stack first. */
  layers: SketchRenderLayerReport[];
}

const DATA_URL = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/s;

function decodeDataUrl(uri: string): Buffer {
  const match = DATA_URL.exec(uri);
  if (!match) {
    throw new Error("it is a malformed data URL");
  }
  const params = match[2] ?? "";
  const payload = match[3] ?? "";
  return params.split(";").includes("base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
}

function checkSurfaceSize(width: number, height: number): void {
  if (
    width > MAX_SKETCH_RENDER_DIMENSION ||
    height > MAX_SKETCH_RENDER_DIMENSION ||
    width * height > MAX_SKETCH_RENDER_PIXELS
  ) {
    throw new Error(
      `A ${width}×${height} surface is over the render limit: at most ` +
        `${MAX_SKETCH_RENDER_DIMENSION} px on a side and ` +
        `${MAX_SKETCH_RENDER_PIXELS} px in all.`
    );
  }
}

async function createHost(
  loadImageBytes: HeadlessSketchRenderOptions["loadImageBytes"]
): Promise<SketchRenderHost> {
  const { createCanvas, Image, loadImage } = await loadCanvas();
  // The PSD path renders every layer on its own, so each source is decoded once.
  const images = new Map<string, Promise<RenderImage>>();
  const decode = async (source: string): Promise<RenderImage> => {
    let bytes: Uint8Array;
    if (source.startsWith("data:")) {
      bytes = decodeDataUrl(source);
    } else if (loadImageBytes) {
      bytes = await loadImageBytes(source);
    } else {
      throw new Error(`${source} is not an inline image and nothing here can read it`);
    }
    // Bytes only: `loadImage` given a string fetches URLs and reads files.
    return loadImage(Buffer.from(bytes));
  };
  return {
    createSurface: (width, height) => {
      // Every surface, so a layer whose stored bounds are enormous is refused
      // before Skia allocates it, not only the output.
      checkSurfaceSize(width, height);
      return createCanvas(width, height) as unknown as RenderSurface;
    },
    loadImage: (source) => {
      let pending = images.get(source);
      if (!pending) {
        pending = decode(source);
        images.set(source, pending);
      }
      return pending;
    },
    // Skia rasterizes an SVG once, at the size set before its source.
    loadVectorImage: async (source, width, height) => {
      checkSurfaceSize(width, height);
      const image = new Image();
      image.width = width;
      image.height = height;
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = (error) => reject(error);
      });
      image.src = decodeDataUrl(source);
      await loaded;
      return image;
    },
    compositeOperation: (blendMode) => blendModeToCanvasOp(blendMode),
    supportsFilter: true
  };
}

interface EncodableSurface {
  width: number;
  height: number;
  encode(format: "png"): Promise<Buffer>;
  getContext(contextId: "2d"): {
    getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
  };
}

function pixelsOf(surface: RenderSurface): DocumentPixels {
  const canvas = surface as unknown as EncodableSurface;
  const { width, height } = canvas;
  return {
    width,
    height,
    data: canvas.getContext("2d").getImageData(0, 0, width, height).data
  };
}

function psdOptionsError(options: HeadlessSketchRenderOptions): string | null {
  const pngOnly = [
    options.width !== undefined && "width",
    options.height !== undefined && "height",
    options.background !== undefined && "background",
    options.layerId !== undefined && "layer",
    options.mask && "mask"
  ].filter((name): name is string => typeof name === "string");
  return pngOnly.length > 0
    ? `A PSD is the whole document at its own size, so ${pngOnly.join(", ")} cannot apply to it.`
    : null;
}

/**
 * Render a persisted sketch (`ImageDocumentData`, or the sketch document
 * itself) to PNG bytes, or to a layered PSD with `format: "psd"`.
 */
export async function renderSketch(
  raw: unknown,
  options: HeadlessSketchRenderOptions = {}
): Promise<HeadlessSketchRender> {
  const format = options.format ?? "png";
  const host = await createHost(options.loadImageBytes);

  if (format === "psd") {
    const conflict = psdOptionsError(options);
    if (conflict) {
      throw new Error(conflict);
    }
    const flat = await renderSketchDocument(raw, host);
    const doc = flat.document;
    const perLayer = new Map<string, DocumentPixels>();
    for (const layer of doc.layers) {
      if (layer.type === "group") {
        continue;
      }
      const single = await renderSketchDocument(doc, host, { layerId: layer.id });
      perLayer.set(layer.id, pixelsOf(single.surface));
    }
    const bytes = encodeSketchPsd(
      {
        layers: doc.layers.map((layer) => ({
          ...layer,
          blendMode: coerceBlendMode(layer.blendMode)
        }))
      },
      {
        composite: pixelsOf(flat.surface),
        renderLayer: (layerId) => perLayer.get(layerId) ?? null
      }
    );
    return {
      bytes,
      format,
      mimeType: "image/vnd.adobe.photoshop",
      width: flat.width,
      height: flat.height,
      canvasWidth: flat.canvasWidth,
      canvasHeight: flat.canvasHeight,
      layerId: null,
      layers: flat.layers
    };
  }

  let layerId = options.layerId;
  if (options.mask) {
    if (layerId) {
      throw new Error("Pass a layer or the mask, not both.");
    }
    const doc = normalizeRenderDocument(raw);
    const maskLayer = doc.layers.find((layer) => layer.id === doc.maskLayerId);
    if (!maskLayer) {
      throw new Error("The sketch has no inpainting mask layer.");
    }
    // The editor exports no mask while the mask layer is hidden.
    if (!isLayerCompositeVisible(doc.layers, maskLayer, null)) {
      throw new Error("The sketch's mask layer is hidden, so it has no mask to export.");
    }
    layerId = maskLayer.id;
  }
  const result = await renderSketchDocument(raw, host, {
    width: options.width,
    height: options.height,
    background: options.background,
    layerId
  });
  const bytes = await (result.surface as unknown as EncodableSurface).encode("png");
  return {
    bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    format,
    mimeType: "image/png",
    width: result.width,
    height: result.height,
    canvasWidth: result.canvasWidth,
    canvasHeight: result.canvasHeight,
    layerId: layerId ?? null,
    layers: result.layers
  };
}
