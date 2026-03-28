/**
 * Sketch editor clipboard: internal pixel buffer, system clipboard I/O, and
 * paste drawing. Keeps copy/paste logic in the sketch package for reuse in a
 * standalone app (Electron/Tauri) without depending on the wider web shell.
 */

import { getLayerCompositeOffset } from "./painting";
import {
  getSelectionBounds,
  sampleMask,
  selectionHasAnyPixels
} from "./selection/selectionMask";
import type { Layer, Point, Selection } from "./types";

/**
 * For copy/export: zero or scale RGBA alpha by the document-space mask inside `bounds`.
 */
export function multiplyImageDataAlphaBySelectionMask(
  imageData: ImageData,
  bounds: { x: number; y: number; width: number; height: number },
  sel: Selection
): void {
  const w = bounds.width;
  const h = bounds.height;
  const d = imageData.data;
  for (let j = 0; j < h; j++) {
    const docY = bounds.y + j;
    for (let i = 0; i < w; i++) {
      const docX = bounds.x + i;
      const p = (j * w + i) * 4;
      const m = sampleMask(sel, docX, docY) / 255;
      d[p + 3] = Math.round(d[p + 3] * m);
    }
  }
}

/** Best-effort: decode the first image on the system clipboard into a canvas. */
export async function readSystemClipboardImageCanvas(): Promise<HTMLCanvasElement | null> {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        const bitmap = await createImageBitmap(blob);
        const tmp = window.document.createElement("canvas");
        tmp.width = bitmap.width;
        tmp.height = bitmap.height;
        const ctx = tmp.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
        }
        bitmap.close();
        return tmp;
      }
    }
  } catch {
    // System clipboard read may fail (permissions, non-HTTPS, etc.).
  }
  return null;
}

/**
 * Fire-and-forget PNG write to the system clipboard (interop with other apps).
 * Internal sketch buffer remains authoritative when alpha must be preserved.
 */
export function writeImageCanvasToSystemClipboardPng(canvas: HTMLCanvasElement): void {
  try {
    canvas.toBlob((blob) => {
      if (blob) {
        const item = new ClipboardItem({ "image/png": blob });
        navigator.clipboard.write([item]).catch((err) => {
          console.warn(
            "Clipboard write failed (internal copy still works):",
            err
          );
        });
      }
    }, "image/png");
  } catch {
    // toBlob / ClipboardItem may not be available in all environments
  }
}

export interface ResolveSketchPasteImageOptions {
  internalBuffer: HTMLCanvasElement | null;
  /**
   * When true (e.g. Ctrl+Shift+V), read the in-app buffer before the OS clipboard
   * so masked copy alpha is preserved when the OS would flatten it.
   * Default / false: OS clipboard first so pixels copied from other apps paste normally.
   */
  preferInternalClipboardFirst?: boolean;
}

/**
 * Resolve which image to paste. Default order is OS clipboard then in-app buffer;
 * use {@link ResolveSketchPasteImageOptions.preferInternalClipboardFirst} for the reverse.
 */
export async function resolveSketchPasteImageCanvas(
  options: ResolveSketchPasteImageOptions
): Promise<HTMLCanvasElement | null> {
  const { internalBuffer, preferInternalClipboardFirst = false } = options;
  if (preferInternalClipboardFirst) {
    let image: HTMLCanvasElement | null = internalBuffer;
    if (!image) {
      image = await readSystemClipboardImageCanvas();
    }
    return image;
  }
  let image = await readSystemClipboardImageCanvas();
  if (!image) {
    image = internalBuffer;
  }
  return image;
}

export interface BuildSketchInternalClipboardParams {
  snapshot: HTMLCanvasElement;
  layer: Layer;
  documentCanvasWidth: number;
  documentCanvasHeight: number;
  selection: Selection | null;
}

/**
 * Build the in-memory clipboard canvas from the active layer snapshot and optional selection.
 */
export function buildSketchInternalClipboardCanvas(
  params: BuildSketchInternalClipboardParams
): HTMLCanvasElement | null {
  const {
    snapshot,
    layer,
    documentCanvasWidth,
    documentCanvasHeight,
    selection
  } = params;

  const bounds =
    selection != null && selectionHasAnyPixels(selection)
      ? getSelectionBounds(selection)
      : null;

  const tmp = window.document.createElement("canvas");
  const docSize = {
    width: documentCanvasWidth,
    height: documentCanvasHeight
  };

  if (bounds && bounds.width > 0 && bounds.height > 0) {
    tmp.width = bounds.width;
    tmp.height = bounds.height;
    const ctx = tmp.getContext("2d");
    if (!ctx) {
      return null;
    }
    const offset = getLayerCompositeOffset(layer, docSize, snapshot);
    ctx.drawImage(
      snapshot,
      bounds.x - offset.x,
      bounds.y - offset.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height
    );
    if (selection != null) {
      const idata = ctx.getImageData(0, 0, bounds.width, bounds.height);
      multiplyImageDataAlphaBySelectionMask(idata, bounds, selection);
      ctx.putImageData(idata, 0, 0);
    }
  } else {
    tmp.width = snapshot.width;
    tmp.height = snapshot.height;
    const ctx = tmp.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.drawImage(snapshot, 0, 0);
  }

  return tmp;
}

export interface SketchPasteDrawParams {
  /** Layer composite offset in document space (from {@link getLayerCompositeOffset}). */
  offset: Point;
  /** Document-space top-left of pixel under cursor, if known. */
  pasteAnchorDocument: Point | null;
  /** Axis-aligned bounds of current selection in document space, or null. */
  selectionBounds: { x: number; y: number; width: number; height: number } | null;
}

/** Composite the pasted image onto the layer snapshot context (before restoreLayerCanvas). */
export function drawSketchPasteOnLayerContext(
  ctx: CanvasRenderingContext2D,
  imageToPaste: HTMLCanvasElement,
  params: SketchPasteDrawParams
): void {
  const { offset, pasteAnchorDocument, selectionBounds } = params;

  if (pasteAnchorDocument) {
    const destX = pasteAnchorDocument.x - offset.x;
    const destY = pasteAnchorDocument.y - offset.y;
    ctx.drawImage(imageToPaste, destX, destY);
  } else if (
    selectionBounds &&
    selectionBounds.width > 0 &&
    selectionBounds.height > 0
  ) {
    ctx.drawImage(
      imageToPaste,
      0,
      0,
      imageToPaste.width,
      imageToPaste.height,
      selectionBounds.x - offset.x,
      selectionBounds.y - offset.y,
      selectionBounds.width,
      selectionBounds.height
    );
  } else {
    ctx.drawImage(imageToPaste, 0, 0);
  }
}
