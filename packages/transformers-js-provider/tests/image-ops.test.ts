import { describe, expect, it, vi } from "vitest";

vi.mock("@nodetool-ai/transformers-js-nodes", () => ({
  bytesToRawImage: vi.fn(),
  getPipeline: vi.fn()
}));

import { toRgba } from "../src/image-ops.js";

describe("toRgba", () => {
  it("spreads a grayscale depth map over RGB with full alpha", () => {
    const out = toRgba({
      data: Uint8Array.from([0, 200]),
      width: 2,
      height: 1,
      channels: 1
    });
    expect(Array.from(out)).toEqual([0, 0, 0, 255, 200, 200, 200, 255]);
  });

  it("adds full alpha to RGB pixels", () => {
    const out = toRgba({
      data: Uint8Array.from([1, 2, 3]),
      width: 1,
      height: 1,
      channels: 3
    });
    expect(Array.from(out)).toEqual([1, 2, 3, 255]);
  });

  it("keeps a cutout's own alpha", () => {
    const out = toRgba({
      data: Uint8Array.from([9, 8, 7, 0]),
      width: 1,
      height: 1,
      channels: 4
    });
    expect(Array.from(out)).toEqual([9, 8, 7, 0]);
  });
});
