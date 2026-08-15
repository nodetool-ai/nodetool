/**
 * @jest-environment node
 */
import { tabCanRename } from "../tabRename";

describe("tabCanRename", () => {
  it("allows rename on sketch documents and image tabs that host the sketch editor", () => {
    expect(tabCanRename("sketch")).toBe(true);
    expect(tabCanRename("image")).toBe(true);
  });

  it("blocks rename on page tabs", () => {
    expect(tabCanRename("page")).toBe(false);
  });
});
