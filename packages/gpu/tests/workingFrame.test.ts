import { expect, it } from "vitest";
import { frameReadbackLayout } from "../src/workingFrame.js";

it("lays out byte and half rows with copy alignment", () => {
  expect(frameReadbackLayout(65, 2, "rgba8unorm")).toEqual({ rowBytes: 260, bytesPerRow: 512, byteLength: 1024 });
  expect(frameReadbackLayout(65, 2, "rgba16float")).toEqual({ rowBytes: 520, bytesPerRow: 768, byteLength: 1536 });
  expect(() => frameReadbackLayout(0, 1, "rgba16float")).toThrow();
});
