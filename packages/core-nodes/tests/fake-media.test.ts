import { describe, it, expect } from "vitest";
import { FakeGenerateImageNode } from "@nodetool-ai/core-nodes";

describe("FakeGenerateImageNode", () => {
  it("returns an SVG data-URL image ref seeded by the prompt", async () => {
    const node = new FakeGenerateImageNode();
    node.assign({ prompt: "a red barn", width: 320, height: 240 });
    const result = (await node.process()) as {
      output: {
        type: string;
        uri: string;
        mimeType: string;
        width: number;
        height: number;
      };
    };
    expect(result.output.type).toBe("image");
    expect(result.output.mimeType).toBe("image/svg+xml");
    expect(result.output.uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(result.output.uri).toContain("a%20red%20barn");
    expect(result.output.width).toBe(320);
    expect(result.output.height).toBe(240);
  });

  it("is deterministic for the same prompt and varies by prompt", async () => {
    const make = async (prompt: string) => {
      const node = new FakeGenerateImageNode();
      node.assign({ prompt });
      const r = (await node.process()) as { output: { uri: string } };
      return r.output.uri;
    };
    expect(await make("cat")).toBe(await make("cat"));
    expect(await make("cat")).not.toBe(await make("dog"));
  });

  it("clamps absurd dimensions to a safe range", async () => {
    const node = new FakeGenerateImageNode();
    node.assign({ prompt: "x", width: 100000, height: -5 });
    const r = (await node.process()) as {
      output: { width: number; height: number };
    };
    expect(r.output.width).toBeLessThanOrEqual(2048);
    expect(r.output.height).toBeGreaterThanOrEqual(16);
  });
});
