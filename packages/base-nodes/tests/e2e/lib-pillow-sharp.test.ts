import { describe, expect, it } from "vitest";
import {
  registerBaseNodes,
  LIB_PILLOW_NODES,
} from "../../src/index.js";
import { NodeRegistry } from "@nodetool/node-sdk";

describe("native lib.pillow via sharp", () => {
  it("registers pillow node types", () => {
    const registry = new NodeRegistry();
    registerBaseNodes(registry);

    expect(registry.has("lib.pillow.filter.Blur")).toBe(true);
    expect(registry.has("lib.pillow.enhance.Brightness")).toBe(true);
    expect(registry.has("lib.pillow.color_grading.Exposure")).toBe(true);
    expect(registry.has("lib.pillow.draw.Background")).toBe(true);
  });

  it("creates a background and applies blur", async () => {
    const bgNodeClass = LIB_PILLOW_NODES.find((n) => n.nodeType === "lib.pillow.draw.Background");
    const blurNodeClass = LIB_PILLOW_NODES.find((n) => n.nodeType === "lib.pillow.filter.Blur");
    if (!bgNodeClass || !blurNodeClass) throw new Error("missing pillow node classes");
    const bg = new bgNodeClass();
    const outBg = await bg.process({ width: 64, height: 64, color: "#112233" });

    const blur = new blurNodeClass();
    const outBlur = await blur.process({ image: outBg.output, sigma: 1.0 });

    expect(typeof (outBg.output as { data: string }).data).toBe("string");
    expect(typeof (outBlur.output as { data: string }).data).toBe("string");
    expect((outBlur.output as { data: string }).data.length).toBeGreaterThan(20);
  });

  it("supports blend/composite shape", async () => {
    const bgNodeClass = LIB_PILLOW_NODES.find((n) => n.nodeType === "lib.pillow.draw.Background");
    const blendNodeClass = LIB_PILLOW_NODES.find((n) => n.nodeType === "lib.pillow.__init__.Blend");
    if (!bgNodeClass || !blendNodeClass) throw new Error("missing pillow node classes");

    const bg = new bgNodeClass();
    const imgA = await bg.process({ width: 32, height: 32, color: "#ff0000" });
    const imgB = await bg.process({ width: 32, height: 32, color: "#00ff00" });

    const blend = new blendNodeClass();
    const out = await blend.process({ image: imgA.output, image2: imgB.output, alpha: 0.5 });
    expect(typeof (out.output as { data: string }).data).toBe("string");
  });
});
