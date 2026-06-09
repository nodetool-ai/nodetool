// Several `lib.image.*` nodes (filter/enhance/color_grading/draw) now route
// their pixel pass through the GPU shader pool; tests need a CPU WebGPU
// device available before importing.
import "../../../gpu/tests/setup/swiftshaderIcd.js";

import { describe, expect, it } from "vitest";
import { registerBaseNodes, LIB_PILLOW_NODES } from "../../src/index.js";
import { NodeRegistry } from "@nodetool-ai/node-sdk";

describe("native lib.image via sharp", () => {
  it("registers pillow node types", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);

    expect(registry.has("lib.image.filter.Invert")).toBe(true);
    expect(registry.has("lib.image.enhance.Equalize")).toBe(true);
    expect(registry.has("lib.image.color_grading.Exposure")).toBe(true);
    expect(registry.has("lib.image.draw.Background")).toBe(true);
  });

  it("creates a background and applies a filter", async () => {
    const bgNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.draw.Background"
    );
    const invertNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.filter.Invert"
    );
    if (!bgNodeClass || !invertNodeClass)
      throw new Error("missing pillow node classes");
    const bg = new bgNodeClass();
    bg.assign({ width: 64, height: 64, color: "#112233" });
    const outBg = await bg.process();

    const invert = new invertNodeClass();
    invert.assign({ image: outBg.output });
    const outInvert = await invert.process();

    expect(typeof (outBg.output as { data: string }).data).toBe("string");
    expect(typeof (outInvert.output as { data: string }).data).toBe("string");
    expect((outInvert.output as { data: string }).data.length).toBeGreaterThan(
      20
    );
  });

  it("supports masked composite shape", async () => {
    const bgNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.draw.Background"
    );
    const maskNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.Mask"
    );
    if (!bgNodeClass || !maskNodeClass)
      throw new Error("missing pillow node classes");

    const bg = new bgNodeClass();
    bg.assign({ width: 32, height: 32, color: "#ff0000" });
    const imgA = await bg.process();
    bg.assign({ width: 32, height: 32, color: "#00ff00" });
    const imgB = await bg.process();
    bg.assign({ width: 32, height: 32, color: "#808080" });
    const mask = await bg.process();

    const mix = new maskNodeClass();
    mix.assign({ image1: imgA.output, image2: imgB.output, mask: mask.output });
    const out = await mix.process();
    expect(typeof (out.output as { data: string }).data).toBe("string");
  });
});
