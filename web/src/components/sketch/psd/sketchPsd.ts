/**
 * sketchPsd – convert between sketch documents and layered PSDs.
 *
 * Export: each layer becomes its own Photoshop layer with name, visibility,
 * opacity, blend mode and position. Vector layers, effects and transforms
 * are baked into pixels by the caller's renderer, so Photoshop shows what
 * the editor shows. Groups become Photoshop layer groups. The editor's
 * inpainting mask layer is kept as a hidden layer, matching the flattened
 * export, which leaves it out.
 *
 * Import: each PSD pixel layer becomes a raster layer and each PSD group a
 * group. A blank sketch takes the PSD's size and layers. A sketch with
 * content keeps its size and gets the PSD as one new group on top.
 */

import type { Layer, SketchDocument } from "../types";
import { createDefaultGroupLayer, createDefaultLayer } from "../types";
import { serializeLayerData } from "../serialization";
import type { DecodedPsd } from "./psdDecoder";
import { encodePsd, type PsdNode } from "./psdEncoder";

/** Straight RGBA pixels at document size. */
export interface DocumentPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SketchPsdSources {
  /**
   * One layer rendered at document size with its transform and effects but
   * without opacity or blend mode, or null when it has no pixels.
   */
  renderLayer: (layerId: string) => DocumentPixels | null;
  /** The flattened document, as the PNG export renders it. */
  composite: DocumentPixels;
}

interface CroppedPixels {
  left: number;
  top: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const EMPTY_PIXELS: CroppedPixels = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  pixels: new Uint8ClampedArray(0)
};

/** Crop document-size pixels to the bounding box of non-transparent pixels. */
export function cropToOpaqueBounds(image: DocumentPixels): CroppedPixels {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] !== 0) {
        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return EMPTY_PIXELS;
  }
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const pixels = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const from = ((minY + y) * width + minX) * 4;
    pixels.set(data.subarray(from, from + cropW * 4), y * cropW * 4);
  }
  return { left: minX, top: minY, width: cropW, height: cropH, pixels };
}

function layerName(layer: Layer): string {
  return layer.name.trim() || "Layer";
}

/** Build the PSD layer tree, bottom to top, from the document's layer array. */
export function buildPsdLayerTree(
  doc: SketchDocument,
  renderLayer: SketchPsdSources["renderLayer"]
): PsdNode[] {
  const ids = new Set(doc.layers.map((layer) => layer.id));
  const childrenOf = new Map<string | null, Layer[]>();
  for (const layer of doc.layers) {
    // A dangling parent id puts the layer at the root, as the panel does not
    // show it otherwise and dropping it would lose pixels.
    const parent =
      layer.parentId && ids.has(layer.parentId) ? layer.parentId : null;
    const siblings = childrenOf.get(parent);
    if (siblings) {
      siblings.push(layer);
    } else {
      childrenOf.set(parent, [layer]);
    }
  }

  const visited = new Set<string>();
  const build = (parentId: string | null): PsdNode[] => {
    const nodes: PsdNode[] = [];
    for (const layer of childrenOf.get(parentId) ?? []) {
      if (visited.has(layer.id)) {
        continue;
      }
      visited.add(layer.id);
      if (layer.type === "group") {
        nodes.push({
          kind: "group",
          name: layerName(layer),
          visible: layer.visible,
          opacity: layer.opacity,
          collapsed: Boolean(layer.collapsed),
          children: build(layer.id)
        });
        continue;
      }
      const rendered = renderLayer(layer.id);
      const cropped = rendered ? cropToOpaqueBounds(rendered) : EMPTY_PIXELS;
      nodes.push({
        kind: "layer",
        name: layerName(layer),
        visible: layer.type === "mask" ? false : layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode || "normal",
        transparencyLocked: layer.alphaLock,
        ...cropped
      });
    }
    return nodes;
  };
  return build(null);
}

/** Encode the document as a layered PSD file. */
export function encodeSketchPsd(
  doc: SketchDocument,
  sources: SketchPsdSources
): Uint8Array<ArrayBuffer> {
  return encodePsd({
    width: sources.composite.width,
    height: sources.composite.height,
    composite: sources.composite.data,
    layers: buildPsdLayerTree(doc, sources.renderLayer)
  });
}

// ─── Import ──────────────────────────────────────────────────────────────────

/** Encodes straight RGBA pixels as an image data URL (PNG in the browser). */
export type PixelsToDataUrl = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
) => string;

/** Convert decoded PSD nodes to sketch layers, in sketch array order. */
export function psdNodesToLayers(
  nodes: PsdNode[],
  toDataUrl: PixelsToDataUrl,
  parentId?: string
): Layer[] {
  const layers: Layer[] = [];
  for (const node of nodes) {
    if (node.kind === "group") {
      const group: Layer = {
        ...createDefaultGroupLayer(node.name || "Group"),
        visible: node.visible,
        opacity: node.opacity,
        collapsed: node.collapsed,
        parentId
      };
      // Sketch groups sit directly below their children in the array.
      layers.push(group, ...psdNodesToLayers(node.children, toDataUrl, group.id));
      continue;
    }
    const bounds = {
      x: node.left,
      y: node.top,
      width: node.width,
      height: node.height
    };
    layers.push({
      ...createDefaultLayer(node.name || "Layer", "raster", node.width, node.height),
      visible: node.visible,
      opacity: node.opacity,
      blendMode: node.blendMode,
      alphaLock: node.transparencyLocked ?? false,
      contentBounds: bounds,
      data: serializeLayerData(toDataUrl(node.pixels, node.width, node.height), bounds),
      exposedAsInput: false,
      exposedAsOutput: false,
      parentId
    });
  }
  return layers;
}

/** True when no layer holds pixels yet, as in a freshly created sketch. */
export function isBlankSketch(doc: SketchDocument): boolean {
  return doc.layers.every(
    (layer) =>
      layer.type === "group" || (!layer.data && !layer.imageReference?.uri)
  );
}

/**
 * Merge a decoded PSD into a sketch. A blank sketch is replaced by the PSD
 * at the PSD's size. Otherwise the PSD lands as one group named `name` on
 * top of the existing layers, in document coordinates.
 */
export function importPsdIntoSketch(
  doc: SketchDocument,
  psd: DecodedPsd,
  name: string,
  toDataUrl: PixelsToDataUrl
): SketchDocument {
  // A flattened PSD has no layer section; its composite is the image.
  const nodes: PsdNode[] =
    psd.layers.length > 0
      ? psd.layers
      : [
          {
            kind: "layer",
            name: "Background",
            visible: true,
            opacity: 1,
            blendMode: "normal",
            left: 0,
            top: 0,
            width: psd.width,
            height: psd.height,
            pixels: psd.composite
          }
        ];
  const updatedAt = new Date().toISOString();

  if (isBlankSketch(doc)) {
    const layers = psdNodesToLayers(nodes, toDataUrl);
    const active = [...layers].reverse().find((layer) => layer.type !== "group");
    if (!active) {
      throw new Error("The PSD has no layers with pixels");
    }
    return {
      ...doc,
      canvas: { ...doc.canvas, width: psd.width, height: psd.height },
      layers,
      activeLayerId: active.id,
      maskLayerId: null,
      metadata: { ...doc.metadata, updatedAt }
    };
  }

  const group = createDefaultGroupLayer(name || "Imported PSD");
  const imported = psdNodesToLayers(nodes, toDataUrl, group.id);
  const active = [...imported].reverse().find((layer) => layer.type !== "group");
  return {
    ...doc,
    layers: [...doc.layers, group, ...imported],
    activeLayerId: active?.id ?? doc.activeLayerId,
    metadata: { ...doc.metadata, updatedAt }
  };
}
