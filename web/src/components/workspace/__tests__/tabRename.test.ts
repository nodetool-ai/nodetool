/**
 * @jest-environment node
 */
import { tabCanRename, renameStrategy } from "../tabRename";

describe("tabCanRename", () => {
  it("allows rename on sketch documents and image tabs that host the sketch editor", () => {
    expect(tabCanRename("sketch")).toBe(true);
    expect(tabCanRename("image")).toBe(true);
  });

  it("allows rename on application tabs", () => {
    expect(tabCanRename("application")).toBe(true);
  });

  it("allows rename on text tabs, including markdown assets", () => {
    expect(tabCanRename("text")).toBe(true);
  });

  it("blocks rename on page tabs", () => {
    expect(tabCanRename("page")).toBe(false);
  });
});


it.each(["storyboard", "script"] as const)("advertises a persisted rename strategy for %s", (type) => {
  expect(tabCanRename(type)).toBe(true);
  expect(renameStrategy(type)).toBe(type);
});
