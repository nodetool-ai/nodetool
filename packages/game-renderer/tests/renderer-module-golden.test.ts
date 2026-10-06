import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { captureGameFrame3D } from "../src/node3d.js";
import { captureGameFrame } from "../src/node.js";
import { blockoutFrame } from "./fixtures/game3d.js";

const directory = new URL("./fixtures/renderer-module-golden/", import.meta.url);
describe("renderer module extraction parity", () => {
  it("preserves the 3D fixture pixels and stats", async () => {
    const capture = await captureGameFrame3D(blockoutFrame());
    const { renderMs: _renderMs, modelLoadMs: _modelLoadMs, ...stats } = capture.stats;
    const path = new URL("3d.json", directory);
    const actual = { png: Buffer.from(capture.png).toString("base64"), stats };
    expect(actual).toEqual(JSON.parse(await readFile(path, "utf8")));
  }, 60000);
  it("preserves the WebGPU fixture pixels", async () => {
    const capture = await captureGameFrame({ tick: 0, width: 8, height: 8, pixelsPerUnit: 8,
      camera: { x: 0, y: 0, zoom: 1 }, sprites: [{ entityId: "gem", assetId: "gem", x: 0, y: 0, previousX: 0, previousY: 0,
        rotation: 0, scaleX: 1, scaleY: 1, width: 2, height: 2, layer: 0 }], tiles: [], hud: [] }, { backend: "webgpu" });
    const path = new URL("2d.png", directory);
    expect(Buffer.from(capture)).toEqual(await readFile(path));
  }, 60000);
});
