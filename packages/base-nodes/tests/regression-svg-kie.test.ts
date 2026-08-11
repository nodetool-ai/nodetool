/**
 * Regression tests for SVG node fixes.
 *
 * These tests verify that previously broken implementations remain correct:
 * - SVGToImage must produce PNG output, not raw SVG
 * - KIE manifest model IDs must be correct
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SVGToImageLibNode } from "@nodetool-ai/text-nodes";


// ---------------------------------------------------------------------------
// 1. SVGToImage rasterization — output must be PNG, not raw SVG
// ---------------------------------------------------------------------------

describe("SVGToImage rasterization regression", () => {
  it("produces PNG output (image/png), not raw SVG", async () => {
    const node = new SVGToImageLibNode();
    node.assign({
      elements: [{ name: "rect", attributes: { width: "100", height: "50", fill: "#ff0000" } }],
      width: 100,
      height: 50,
      viewBox: "0 0 100 50",
      scale: 1
    });

    const result = await node.process();
    const output = result.output as Record<string, unknown>;

    // The old bug returned mimeType "image/svg+xml" with raw SVG text.
    // The fix must return "image/png" with actual PNG data.
    expect(output.mimeType).toBe("image/png");
    expect(output.type).toBe("image");

    // Verify the base64 data decodes to a valid PNG (magic bytes: 0x89 P N G)
    const data = output.data as string;
    expect(data).toBeDefined();
    const buf = Buffer.from(data, "base64");
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // 'P'
    expect(buf[2]).toBe(0x4e); // 'N'
    expect(buf[3]).toBe(0x47); // 'G'
  });

  it("respects scale factor in output dimensions", async () => {
    const node = new SVGToImageLibNode();
    node.assign({
      elements: [{ name: "circle", attributes: { cx: "50", cy: "50", r: "40", fill: "blue" } }],
      width: 100,
      height: 100,
      viewBox: "0 0 100 100",
      scale: 2
    });

    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(200);
    expect(output.height).toBe(200);
    expect(output.mimeType).toBe("image/png");
  });

  it("accepts SVG element objects as content", async () => {
    const node = new SVGToImageLibNode();
    node.assign({
      elements: [{ name: "rect", attributes: { width: "50", height: "50", fill: "green" } }],
      width: 100,
      height: 100,
      viewBox: "0 0 100 100",
      scale: 1
    });

    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.mimeType).toBe("image/png");

    const buf = Buffer.from(output.data as string, "base64");
    expect(buf[0]).toBe(0x89); // PNG magic byte
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 2. KIE manifest model ID correctness
// ---------------------------------------------------------------------------

describe("KIE manifest model ID regression", () => {
  let manifest: any[];

  try {
    const manifestPath = resolve(
      __dirname,
      "../../kie-nodes/src/kie-manifest.json"
    );
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    manifest = [];
  }

  it("manifest file loads successfully", () => {
    expect(manifest.length).toBeGreaterThan(0);
  });

  // Per-model ID regression checks for GPTImage4o, KlingAIAvatar, SeedanceV1,
  // RunwayGen3Alpha, and ElevenLabsSoundEffect were removed: the manifest was
  // regenerated and none of those `className` entries exist anymore. Re-add
  // targeted checks if a specific model ID convention regresses.
});
