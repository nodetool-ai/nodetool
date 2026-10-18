/**
 * Sketch document → layered PSD.
 *
 * Each layer becomes its own Photoshop layer with name, visibility, opacity,
 * blend mode and position. Vector layers, effects and transforms are baked
 * into pixels by the caller's renderer, so Photoshop shows what the editor
 * shows. Groups become Photoshop layer groups. The inpainting mask layer is
 * kept as a hidden layer, matching the flattened export, which leaves it out.
 *
 * The editor's "Export PSD" and the headless renderer both encode through
 * here.
 */

import type { BlendMode } from "@nodetool-ai/protocol/blend-modes";
import { encodePsd, type PsdNode } from "./encoder.js";

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

/** The layer fields the PSD layer tree reads. */
export interface PsdSourceLayer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  alphaLock: boolean;
  collapsed?: boolean;
  parentId?: string | null;
}

export interface PsdSourceDocument {
  layers: readonly PsdSourceLayer[];
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

function layerName(layer: PsdSourceLayer): string {
  return layer.name.trim() || "Layer";
}

/** Build the PSD layer tree, bottom to top, from the document's layer array. */
export function buildPsdLayerTree(
  doc: PsdSourceDocument,
  renderLayer: SketchPsdSources["renderLayer"]
): PsdNode[] {
  const ids = new Set(doc.layers.map((layer) => layer.id));
  const childrenOf = new Map<string | null, PsdSourceLayer[]>();
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
  doc: PsdSourceDocument,
  sources: SketchPsdSources
): Uint8Array<ArrayBuffer> {
  return encodePsd({
    width: sources.composite.width,
    height: sources.composite.height,
    composite: sources.composite.data,
    layers: buildPsdLayerTree(doc, sources.renderLayer)
  });
}
