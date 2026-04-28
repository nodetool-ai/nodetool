import { describe, expect, it } from "vitest";
import { registerBaseNodes, LIB_PILLOW_NODES } from "../../src/index.js";
import { NodeRegistry } from "@nodetool-ai/node-sdk";

describe("native lib.image via sharp", () => {
  it("registers pillow node types", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);

    expect(registry.has("lib.image.filter.Blur")).toBe(true);
    expect(registry.has("lib.image.enhance.Brightness")).toBe(true);
    expect(registry.has("lib.image.color_grading.Exposure")).toBe(true);
    expect(registry.has("lib.image.draw.Background")).toBe(true);
  });

  it("creates a background and applies blur", async () => {
    const bgNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.draw.Background"
    );
    const blurNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.filter.Blur"
    );
    if (!bgNodeClass || !blurNodeClass)
      throw new Error("missing pillow node classes");
    const bg = new bgNodeClass();
    bg.assign({ width: 64, height: 64, color: "#112233" });
    const outBg = await bg.process();

    const blur = new blurNodeClass();
    blur.assign({ image: outBg.output, sigma: 1.0 });
    const outBlur = await blur.process();

    expect(typeof (outBg.output as { data: string }).data).toBe("string");
    expect(typeof (outBlur.output as { data: string }).data).toBe("string");
    expect((outBlur.output as { data: string }).data.length).toBeGreaterThan(
      20
    );
  });

  it("supports blend/composite shape", async () => {
    const bgNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.draw.Background"
    );
    const blendNodeClass = LIB_PILLOW_NODES.find(
      (n) => n.nodeType === "lib.image.Blend"
    );
    if (!bgNodeClass || !blendNodeClass)
      throw new Error("missing pillow node classes");

    const bg = new bgNodeClass();
    bg.assign({ width: 32, height: 32, color: "#ff0000" });
    const imgA = await bg.process();
    bg.assign({ width: 32, height: 32, color: "#00ff00" });
    const imgB = await bg.process();

    const blend = new blendNodeClass();
    blend.assign({ image1: imgA.output, image2: imgB.output, alpha: 0.5 });
    const out = await blend.process();
    expect(typeof (out.output as { data: string }).data).toBe("string");
  });
});
