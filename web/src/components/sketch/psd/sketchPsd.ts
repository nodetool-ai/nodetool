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
import type { PsdNode } from "./psdEncoder";

// The export half is shared with the headless renderer.
export {
  buildPsdLayerTree,
  cropToOpaqueBounds,
  encodeSketchPsd,
  type DocumentPixels,
  type SketchPsdSources
} from "@nodetool-ai/image-editor/psd.js";

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
