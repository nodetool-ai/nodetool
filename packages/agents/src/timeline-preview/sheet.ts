/**
 * Tiling rendered frames into one labelled contact sheet.
 *
 * A sweep of a move is unreadable as a list of separate image handles: the
 * model would have to pull each one into context and hold the previous frame
 * in its head to see what changed. One sheet is one read, and the cells sit
 * next to each other, which is what makes a slide visible as a slide.
 *
 * Every cell carries its own label — a timecode in the preview's sheet, a
 * timecode and a difference score in the compare's — because a grid of
 * near-identical frames says nothing about which instant each one is.
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { registerBundledFonts } from "@nodetool-ai/timeline/fonts/node";

import { MAX_SHEET_WIDTH } from "../capabilities/timelines.specs.js";

/** One tile: the PNG to draw and the text drawn over its bottom edge. */
export interface SheetCell {
  label: string;
  png: Uint8Array;
}

export interface ContactSheet {
  /** PNG bytes of the tiled sheet. */
  png: Uint8Array;
  width: number;
  height: number;
  columns: number;
  rows: number;
  cells: number;
  cell_width: number;
  cell_height: number;
}

/** Label band geometry, as a fraction of the cell it sits in. */
const LABEL_SCALE = 0.09;
const LABEL_MIN_PX = 10;
const LABEL_MAX_PX = 22;

/**
 * Tile `cells` into a grid as square as the count allows — `ceil(sqrt(n))`
 * columns — scaled so the whole sheet fits `maxWidth`.
 *
 * The first cell's aspect sets every cell's, because the frames of one
 * timeline are all the same size; a differently-shaped cell is letterboxed by
 * the draw rather than distorting the grid.
 */
export async function composeContactSheet(
  cells: readonly SheetCell[],
  maxWidth = MAX_SHEET_WIDTH
): Promise<ContactSheet> {
  if (cells.length === 0) {
    throw new Error("A contact sheet needs at least one frame.");
  }
  // The labels are drawn with the same faces the frames were, so a sheet
  // rendered on a machine with no system fonts still reads.
  registerBundledFonts();

  const images = await Promise.all(
    cells.map((cell) => loadImage(Buffer.from(cell.png)))
  );
  const columns = Math.ceil(Math.sqrt(cells.length));
  const rows = Math.ceil(cells.length / columns);
  const source = images[0];
  const cellWidth = Math.max(
    1,
    Math.floor(Math.min(maxWidth, columns * source.width) / columns)
  );
  const cellHeight = Math.max(
    1,
    Math.round((cellWidth * source.height) / source.width)
  );

  const canvas = createCanvas(columns * cellWidth, rows * cellHeight);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const fontPx = Math.min(
    LABEL_MAX_PX,
    Math.max(LABEL_MIN_PX, Math.round(cellHeight * LABEL_SCALE))
  );
  const bandHeight = Math.round(fontPx * 1.6);

  for (let i = 0; i < cells.length; i++) {
    const x = (i % columns) * cellWidth;
    const y = Math.floor(i / columns) * cellHeight;
    ctx.drawImage(images[i], x, y, cellWidth, cellHeight);
    // Over the picture rather than beside it: a band of its own would make
    // the sheet's height depend on the label size, and the cell grid is what
    // the caller reasons about.
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.fillRect(x, y + cellHeight - bandHeight, cellWidth, bandHeight);
    ctx.fillStyle = "#ffffff";
    ctx.font = `${fontPx}px "JetBrains Mono", monospace`;
    ctx.textBaseline = "middle";
    ctx.fillText(
      cells[i].label,
      x + Math.round(fontPx * 0.4),
      y + cellHeight - bandHeight / 2
    );
  }

  return {
    png: new Uint8Array(canvas.toBuffer("image/png")),
    width: canvas.width,
    height: canvas.height,
    columns,
    rows,
    cells: cells.length,
    cell_width: cellWidth,
    cell_height: cellHeight
  };
}
