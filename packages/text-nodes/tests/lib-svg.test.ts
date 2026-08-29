import { describe, expect, it } from "vitest";

import { SVGToImageLibNode, DocumentLibNode } from "@nodetool-ai/text-nodes";

describe("SVGToImageLibNode", () => {
  it("creates an SVG document and returns it as PNG with image metadata", async () => {
    const node = new SVGToImageLibNode();
    node.assign({
      elements: [{ name: "rect", attributes: { width: "100", height: "50", fill: "#ff0000" } }],
      width: 100,
      height: 50,
      viewBox: "0 0 100 50",
      scale: 2
    });

    const result = await node.process();
    const output = result.output as Record<string, unknown>;

    expect(output.mimeType).toBe("image/png");
    // scale=2 so dimensions are doubled
    expect(output.width).toBe(200);
    expect(output.height).toBe(100);
    expect(output.data).toBeDefined();
  });
});


describe("DocumentLibNode", () => {
  it("returns a base64-encoded SVG document", async () => {
    const node = new DocumentLibNode();
    node.assign({
      elements: [{ name: "rect", attributes: { width: "100", height: "50", fill: "red" } }],
      width: 400,
      height: 300,
      viewBox: "0 0 400 300"
    });

    const result = await node.process();
    const output = result.output as { data: string };
    expect(output.data).toBeDefined();

    const xml = Buffer.from(output.data, "base64").toString("utf-8");
    expect(xml).toContain("<?xml");
    expect(xml).toContain("<svg");
    expect(xml).toContain('width="400"');
    expect(xml).toContain('height="300"');
    expect(xml).toContain('viewBox="0 0 400 300"');
    expect(xml).toContain("<rect");
  });

  it("handles svg_element objects as content", async () => {
    const node = new DocumentLibNode();
    node.assign({
      elements: [{ name: "circle", attributes: { cx: "50", cy: "50", r: "25" } }],
      width: 100,
      height: 100,
      viewBox: "0 0 100 100"
    });

    const result = await node.process();
    const output = result.output as { type: string; data: string };
    const xml = Buffer.from(output.data, "base64").toString("utf-8");
    expect(xml).toContain("<circle");
    expect(xml).toContain('r="25"');
  });
});


describe("XML escaping", () => {
  it("escapes special characters in element content and attributes", async () => {
    const doc = new DocumentLibNode();
    doc.assign({
      elements: [
        {
          name: "text",
          attributes: { "font-family": 'A "B" & C' },
          content: "Tom & Jerry <3"
        }
      ]
    });

    const out = (await doc.process()).output as { data: string };
    const xml = Buffer.from(out.data, "base64").toString("utf-8");
    expect(xml).toContain("Tom &amp; Jerry &lt;3");
    expect(xml).not.toContain("& Jerry <3");
    expect(xml).toContain('font-family="A &quot;B&quot; &amp; C"');
  });
});
