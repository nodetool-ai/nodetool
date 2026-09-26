/**
 * A contact sheet: rendered frames tiled into one PNG, each cell labelled in
 * its top-left corner. `nodetool timeline render --sheet` writes one so a
 * frame-by-frame review is a single image rather than a folder of stills.
 *
 * Frames are drawn into the sheet as they arrive, so only the sheet and the
 * frame being drawn are in memory.
 */

import { createCanvas } from "@napi-rs/canvas";
import { registerBundledFonts } from "@nodetool-ai/timeline/fonts/node";

/** Widest sheet, in pixels, before cells are scaled down to fit. */
const MAX_SHEET_WIDTH = 2400;
const GAP = 8;

export interface ContactSheetLayout {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** Space between cells and around the sheet's edge. */
  gap: number;
  width: number;
  height: number;
}

/**
 * Lay out `count` frames in `columns` columns. Cells keep the frame's aspect
 * and shrink so the sheet is at most `maxWidth` wide. They never grow past the
 * frame's own size.
 */
export function contactSheetLayout(options: {
  count: number;
  columns: number;
  frameWidth: number;
  frameHeight: number;
  maxWidth?: number;
}): ContactSheetLayout {
  const { count, frameWidth, frameHeight } = options;
  if (!Number.isInteger(options.columns) || options.columns < 1) {
    throw new Error(
      `A contact sheet needs a whole number of columns (got ${options.columns}).`
    );
  }
  const columns = Math.min(options.columns, Math.max(1, count));
  const rows = Math.max(1, Math.ceil(count / columns));
  const maxWidth = options.maxWidth ?? MAX_SHEET_WIDTH;
  const cellWidth = Math.max(
    1,
    Math.min(frameWidth, Math.floor((maxWidth - GAP * (columns + 1)) / columns))
  );
  const cellHeight = Math.max(
    1,
    Math.round((cellWidth * frameHeight) / frameWidth)
  );
  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    gap: GAP,
    width: columns * cellWidth + (columns + 1) * GAP,
    height: rows * cellHeight + (rows + 1) * GAP
  };
}

/** The top-left pixel of the cell at `index`, filled row by row. */
export function cellOrigin(
  layout: ContactSheetLayout,
  index: number
): { x: number; y: number } {
  const column = index % layout.columns;
  const row = Math.floor(index / layout.columns);
  return {
    x: layout.gap + column * (layout.cellWidth + layout.gap),
    y: layout.gap + row * (layout.cellHeight + layout.gap)
  };
}

export interface ContactSheet {
  /** Draw straight-alpha RGBA8 pixels scaled into cell `index`, then its label. */
  draw(
    index: number,
    label: string,
    rgba: Uint8Array,
    width: number,
    height: number
  ): void;
  /** The sheet as PNG bytes. */
  encode(): Buffer;
}

export function createContactSheet(layout: ContactSheetLayout): ContactSheet {
  registerBundledFonts();
  const sheet = createCanvas(layout.width, layout.height);
  const ctx = sheet.getContext("2d");
  ctx.fillStyle = "#202020";
  ctx.fillRect(0, 0, layout.width, layout.height);
  const fontSize = Math.max(12, Math.round(layout.cellHeight * 0.08));
  const padding = Math.round(fontSize * 0.35);

  return {
    draw(index, label, rgba, width, height) {
      const frame = createCanvas(width, height);
      const frameCtx = frame.getContext("2d");
      const image = frameCtx.createImageData(width, height);
      image.data.set(rgba);
      frameCtx.putImageData(image, 0, 0);

      const { x, y } = cellOrigin(layout, index);
      ctx.drawImage(frame, x, y, layout.cellWidth, layout.cellHeight);

      ctx.font = `600 ${fontSize}px Inter, sans-serif`;
      ctx.textBaseline = "top";
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(x, y, textWidth + padding * 2, fontSize + padding * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x + padding, y + padding);
    },
    encode() {
      return sheet.toBuffer("image/png");
    }
  };
}
