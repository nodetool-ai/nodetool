import { expect, it } from "vitest";
import { frameReadbackLayout } from "../src/workingFrame.js";

it("lays out byte and half rows with copy alignment", () => {
  expect(frameReadbackLayout(65, 2, "rgba8unorm")).toEqual({ rowBytes: 260, bytesPerRow: 512, byteLength: 1024 });
  expect(frameReadbackLayout(65, 2, "rgba16float")).toEqual({ rowBytes: 520, bytesPerRow: 768, byteLength: 1536 });
  expect(() => frameReadbackLayout(0, 1, "rgba16float")).toThrow();
});

it("copies typed half rows before the mapped storage is released", async () => {
  const { copyWorkingRows } = await import("../src/workingFrame.js");
  const storage = new ArrayBuffer(512);
  const view = new Uint16Array(storage);
  view.set([0x3800, 0x3400, 0, 0x3c00]);
  view.set([0x3c00, 0, 0, 0x3c00], 128);
  const copy = copyWorkingRows(storage, 1, 2, "rgba16float");
  view.fill(0);
  expect(Array.from(copy)).toEqual([0x3800, 0x3400, 0, 0x3c00, 0x3c00, 0, 0, 0x3c00]);
  expect(() => copyWorkingRows(new ArrayBuffer(4), 1, 2, "rgba8unorm")).toThrow("shorter");
});
