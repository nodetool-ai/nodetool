/**
 * The document a Sketch Pad starts from, and the value it writes back.
 *
 * A pad is a two-layer sketch document: an opaque paper layer the user never
 * paints on, and the drawing layer above it. Erasing then reveals paper rather
 * than the transparency checkerboard, and the flattened export is opaque —
 * which is what an image model downstream expects. A transparent pad drops the
 * paper layer and keeps the alpha.
 */
// Deep import, not the sketch index: the index re-exports the whole editor —
// canvas, tools, rendering runtimes — and this module is on the path of the
// widget every mini app loads.
import {
  createDefaultDocument,
  createDefaultLayer,
  type Layer,
  type SketchDocument
} from "../../sketch/types";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import type { SketchPadBackground } from "./sketchPadOptions";

export const PAPER_LAYER_NAME = "Paper";
export const DRAWING_LAYER_NAME = "Drawing";

const PAPER_COLOR = "#ffffff";

/**
 * The ink a pad starts with. The editor's default is white, which is invisible
 * on paper, so a paper pad flips it and a transparent one keeps it.
 */
export const padInkColor = (background: SketchPadBackground): string =>
  background === "white" ? "#111111" : "#ffffff";

/**
 * A PNG data URL of one flat color. Returns null where the environment has no
 * real 2D canvas (jsdom), which leaves the paper layer empty rather than
 * failing the whole document.
 */
const solidPng = (
  width: number,
  height: number,
  color: string
): string | null => {
  try {
    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    // No canvas encoder here — the pad still draws, just without paper.
    return null;
  }
};

interface SketchPadDocumentOptions {
  width: number;
  height: number;
  background: SketchPadBackground;
  /** A PNG data URL to restore onto the drawing layer, from a previous session. */
  image?: string | null;
}

export const createSketchPadDocument = ({
  width,
  height,
  background,
  image
}: SketchPadDocumentOptions): SketchDocument => {
  const base = createDefaultDocument(width, height);
  const ink = padInkColor(background);
  const layers: Layer[] = [];

  if (background === "white") {
    const paper = createDefaultLayer(PAPER_LAYER_NAME, "raster", width, height);
    paper.data = solidPng(width, height, PAPER_COLOR);
    // Nothing in the pad's chrome selects a layer, but a locked paper layer
    // also refuses the tools that pick one on their own.
    paper.locked = true;
    layers.push(paper);
  }

  const drawing = createDefaultLayer(
    DRAWING_LAYER_NAME,
    "raster",
    width,
    height
  );
  drawing.data = image ?? null;
  layers.push(drawing);

  return {
    ...base,
    canvas: {
      ...base.canvas,
      backgroundColor:
        background === "white" ? PAPER_COLOR : base.canvas.backgroundColor
    },
    // `setDocument` hydrates the store's tool settings from these, so the ink
    // is right before the first stroke rather than after the first swatch.
    toolSettings: {
      ...base.toolSettings,
      brush: { ...base.toolSettings.brush, color: ink },
      pencil: { ...base.toolSettings.pencil, color: ink },
      fill: { ...base.toolSettings.fill, color: ink }
    },
    layers,
    activeLayerId: drawing.id
  };
};

/** The pad writes the `{type, uri}` shape an Image Input writes. */
export const sketchPadValue = (
  dataUrl: string
): { type: "image"; uri: string } => ({ type: "image", uri: dataUrl });

/**
 * A value the pad wrote earlier, back as a data URL so a remount redraws it.
 * Only inline PNGs qualify: a stored `asset://` locator or an http URL would
 * need a fetch the canvas cannot make same-origin.
 */
export const sketchPadImageUri = (value: unknown): string | null => {
  const uri = isString(value)
    ? value
    : isObjectLike(value) && isString(value.uri)
      ? value.uri
      : null;
  return uri !== null && uri.startsWith("data:image/") ? uri : null;
};
