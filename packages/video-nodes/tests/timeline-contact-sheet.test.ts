/**
 * The contact sheet `nodetool timeline render --sheet` writes: rendered frames
 * tiled into one PNG, each cell labelled with its frame index.
 */
import { describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import {
  cellOrigin,
  contactSheetLayout,
  createContactSheet
} from "../src/nodes/timeline/contactSheet.js";

function solid(width: number, height: number, rgb: [number, number, number]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba.set([...rgb, 255], i);
  }
  return rgba;
}

describe("contactSheetLayout", () => {
  it("scales cells down so the columns fit the sheet width", () => {
    const layout = contactSheetLayout({
      count: 5,
      columns: 3,
      frameWidth: 960,
      frameHeight: 540
    });
    expect(layout).toEqual({
      columns: 3,
      rows: 2,
      cellWidth: 789,
      cellHeight: 444,
      gap: 8,
      width: 2399,
      height: 912
    });
    expect(cellOrigin(layout, 0)).toEqual({ x: 8, y: 8 });
    expect(cellOrigin(layout, 4)).toEqual({ x: 805, y: 460 });
  });

  it("never scales a small frame up", () => {
    const layout = contactSheetLayout({
      count: 4,
      columns: 3,
      frameWidth: 320,
      frameHeight: 180
    });
    expect([layout.cellWidth, layout.cellHeight]).toEqual([320, 180]);
  });

  it("uses no more columns than there are frames", () => {
    const layout = contactSheetLayout({
      count: 2,
      columns: 3,
      frameWidth: 320,
      frameHeight: 180
    });
    expect([layout.columns, layout.rows, layout.width]).toEqual([2, 1, 664]);
  });

  it.each([0, -1, 1.5])("refuses %j columns", (columns) => {
    expect(() =>
      contactSheetLayout({ count: 2, columns, frameWidth: 32, frameHeight: 18 })
    ).toThrow(/columns/);
  });
});

describe("createContactSheet", () => {
  it("draws each frame into its cell with a label and encodes a PNG", async () => {
    const layout = contactSheetLayout({
      count: 4,
      columns: 2,
      frameWidth: 200,
      frameHeight: 100
    });
    const sheet = createContactSheet(layout);
    sheet.draw(3, "120", solid(200, 100, [255, 0, 0]), 200, 100);

    const image = await loadImage(sheet.encode());
    expect([image.width, image.height]).toEqual([layout.width, layout.height]);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixel = (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data);

    const filled = cellOrigin(layout, 3);
    const empty = cellOrigin(layout, 0);
    // The frame fills its cell; the label sits in the cell's top-left corner.
    expect(pixel(filled.x + 190, filled.y + 90)).toEqual([255, 0, 0, 255]);
    expect(pixel(empty.x + 190, empty.y + 90)).not.toEqual([255, 0, 0, 255]);
    expect(pixel(filled.x + 2, filled.y + 2)).not.toEqual([255, 0, 0, 255]);
  });
});
