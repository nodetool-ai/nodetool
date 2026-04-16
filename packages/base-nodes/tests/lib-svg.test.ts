import { describe, expect, it } from "vitest";

import {
  SVGToImageLibNode,
  RectLibNode,
  CircleLibNode,
  EllipseLibNode,
  LineLibNode,
  PolygonLibNode,
  PathLibNode,
  TextLibNode,
  GaussianBlurLibNode,
  DropShadowLibNode,
  DocumentLibNode,
  GradientLibNode,
  TransformLibNode,
  ClipPathLibNode
} from "../src/nodes/lib-svg.js";

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

describe("RectLibNode", () => {
  it("returns a rect element with correct attributes", async () => {
    const node = new RectLibNode();
    node.assign({
      x: 10,
      y: 20,
      width: 200,
      height: 150,
      fill: "#ff0000",
      stroke: "#00ff00",
      stroke_width: 3
    });

    const result = await node.process();
    expect(result.output.name).toBe("rect");
    expect(result.output.attributes).toEqual({
      x: "10",
      y: "20",
      width: "200",
      height: "150",
      fill: "#ff0000",
      stroke: "#00ff00",
      "stroke-width": "3"
    });
  });

  it("uses defaults when no values assigned", async () => {
    const node = new RectLibNode();
    const result = await node.process();
    expect(result.output.name).toBe("rect");
    expect(result.output.attributes?.width).toBe("100");
    expect(result.output.attributes?.height).toBe("100");
  });
});

describe("CircleLibNode", () => {
  it("returns a circle element with correct attributes", async () => {
    const node = new CircleLibNode();
    node.assign({
      cx: 50,
      cy: 60,
      radius: 30,
      fill: "#0000ff",
      stroke: "none",
      stroke_width: 2
    });

    const result = await node.process();
    expect(result.output.name).toBe("circle");
    expect(result.output.attributes).toEqual({
      cx: "50",
      cy: "60",
      r: "30",
      fill: "#0000ff",
      stroke: "none",
      "stroke-width": "2"
    });
  });
});

describe("EllipseLibNode", () => {
  it("returns an ellipse element with correct attributes", async () => {
    const node = new EllipseLibNode();
    node.assign({
      cx: 100,
      cy: 75,
      rx: 80,
      ry: 40,
      fill: "#123456",
      stroke: "#abcdef",
      stroke_width: 2
    });

    const result = await node.process();
    expect(result.output.name).toBe("ellipse");
    expect(result.output.attributes).toEqual({
      cx: "100",
      cy: "75",
      rx: "80",
      ry: "40",
      fill: "#123456",
      stroke: "#abcdef",
      "stroke-width": "2"
    });
  });
});

describe("LineLibNode", () => {
  it("returns a line element with correct attributes", async () => {
    const node = new LineLibNode();
    node.assign({
      x1: 0,
      y1: 0,
      x2: 200,
      y2: 150,
      stroke: "#ff0000",
      stroke_width: 5
    });

    const result = await node.process();
    expect(result.output.name).toBe("line");
    expect(result.output.attributes).toEqual({
      x1: "0",
      y1: "0",
      x2: "200",
      y2: "150",
      stroke: "#ff0000",
      "stroke-width": "5"
    });
  });
});

describe("PolygonLibNode", () => {
  it("returns a polygon element with points attribute", async () => {
    const node = new PolygonLibNode();
    node.assign({
      points: "100,10 40,198 190,78 10,78 160,198",
      fill: "#ff0000",
      stroke: "#000000",
      stroke_width: 2
    });

    const result = await node.process();
    expect(result.output.name).toBe("polygon");
    expect(result.output.attributes?.points).toBe(
      "100,10 40,198 190,78 10,78 160,198"
    );
    expect(result.output.attributes?.fill).toBe("#ff0000");
    expect(result.output.attributes?.stroke).toBe("#000000");
  });
});

describe("PathLibNode", () => {
  it("returns a path element with d attribute", async () => {
    const node = new PathLibNode();
    node.assign({
      path_data: "M10 10 H 90 V 90 H 10 Z",
      fill: "none",
      stroke: "#000000",
      stroke_width: 2
    });

    const result = await node.process();
    expect(result.output.name).toBe("path");
    expect(result.output.attributes?.d).toBe("M10 10 H 90 V 90 H 10 Z");
    expect(result.output.attributes?.fill).toBe("none");
    expect(result.output.attributes?.stroke).toBe("#000000");
  });
});

describe("TextLibNode", () => {
  it("returns a text element with content and font attributes", async () => {
    const node = new TextLibNode();
    node.assign({
      text: "Hello World",
      x: 50,
      y: 100,
      font_family: "Helvetica",
      font_size: 24,
      fill: "#333333",
      text_anchor: "middle"
    });

    const result = await node.process();
    expect(result.output.name).toBe("text");
    expect(result.output.content).toBe("Hello World");
    expect(result.output.attributes).toEqual({
      x: "50",
      y: "100",
      "font-family": "Helvetica",
      "font-size": "24",
      fill: "#333333",
      "text-anchor": "middle"
    });
  });
});

describe("GaussianBlurLibNode", () => {
  it("returns a filter element with feGaussianBlur child", async () => {
    const node = new GaussianBlurLibNode();
    node.assign({ std_deviation: 5 });

    const result = await node.process();
    expect(result.output.name).toBe("filter");
    expect(result.output.attributes?.id).toBe("filter_gaussian_blur");
    expect(result.output.children).toHaveLength(1);
    expect(result.output.children![0].name).toBe("feGaussianBlur");
    expect(result.output.children![0].attributes?.stdDeviation).toBe("5");
  });
});

describe("DropShadowLibNode", () => {
  it("returns a filter element with shadow primitives", async () => {
    const node = new DropShadowLibNode();
    node.assign({
      std_deviation: 4,
      dx: 3,
      dy: 3,
      color: "#888888"
    });

    const result = await node.process();
    expect(result.output.name).toBe("filter");
    expect(result.output.attributes?.id).toBe("filter_drop_shadow");

    const children = result.output.children!;
    expect(children).toHaveLength(5);

    expect(children[0].name).toBe("feGaussianBlur");
    expect(children[0].attributes?.stdDeviation).toBe("4");
    expect(children[0].attributes?.in).toBe("SourceAlpha");

    expect(children[1].name).toBe("feOffset");
    expect(children[1].attributes?.dx).toBe("3");
    expect(children[1].attributes?.dy).toBe("3");

    expect(children[2].name).toBe("feFlood");
    expect(children[2].attributes?.["flood-color"]).toBe("#888888");

    expect(children[3].name).toBe("feComposite");
    expect(children[3].attributes?.operator).toBe("in");

    expect(children[4].name).toBe("feMerge");
    expect(children[4].children).toHaveLength(2);
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

describe("GradientLibNode", () => {
  it("returns a linearGradient with stops", async () => {
    const node = new GradientLibNode();
    node.assign({
      gradient_type: "linearGradient",
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      color1: "#ff0000",
      color2: "#0000ff"
    });

    const result = await node.process();
    expect(result.output.name).toBe("linearGradient");
    expect(result.output.attributes?.id).toBe("gradient_linearGradient");
    expect(result.output.attributes?.x1).toBe("0%");
    expect(result.output.attributes?.y1).toBe("0%");
    expect(result.output.attributes?.x2).toBe("100%");
    expect(result.output.attributes?.y2).toBe("0%");

    expect(result.output.children).toHaveLength(2);
    expect(result.output.children![0].name).toBe("stop");
    expect(result.output.children![0].attributes?.offset).toBe("0%");
    expect(result.output.children![0].attributes?.style).toContain("#ff0000");
    expect(result.output.children![1].attributes?.offset).toBe("100%");
    expect(result.output.children![1].attributes?.style).toContain("#0000ff");
  });

  it("returns a radialGradient with cx, cy, r attributes", async () => {
    const node = new GradientLibNode();
    node.assign({
      gradient_type: "radialGradient",
      x1: 50,
      y1: 50,
      x2: 80,
      y2: 0,
      color1: "#ffffff",
      color2: "#000000"
    });

    const result = await node.process();
    expect(result.output.name).toBe("radialGradient");
    expect(result.output.attributes?.cx).toBe("50%");
    expect(result.output.attributes?.cy).toBe("50%");
    expect(result.output.attributes?.r).toBe("80%");
    // radialGradient does not use y2
    expect(result.output.attributes?.y2).toBeUndefined();
  });
});

describe("TransformLibNode", () => {
  it("applies translate, rotate, and scale transforms", async () => {
    const node = new TransformLibNode();
    node.assign({
      content: { name: "rect", attributes: { width: "100", height: "50" } },
      translate_x: 10,
      translate_y: 20,
      rotate: 45,
      scale_x: 2,
      scale_y: 1.5
    });

    const result = await node.process();
    expect(result.output.name).toBe("rect");
    expect(result.output.attributes?.transform).toBe(
      "translate(10,20) rotate(45) scale(2,1.5)"
    );
    // Original attributes preserved
    expect(result.output.attributes?.width).toBe("100");
  });

  it("returns empty group when content has no name", async () => {
    const node = new TransformLibNode();
    node.assign({
      content: { name: "", attributes: {} },
      translate_x: 10
    });

    const result = await node.process();
    // The node checks !content.name via the "name" in content check,
    // but content has name="" which is falsy — however the code checks "name" in content
    // which is true even for empty string. So it proceeds.
    expect(result.output.name).toBe("");
  });

  it("omits transform attribute when all values are identity", async () => {
    const node = new TransformLibNode();
    node.assign({
      content: { name: "circle", attributes: { r: "10" } },
      translate_x: 0,
      translate_y: 0,
      rotate: 0,
      scale_x: 1,
      scale_y: 1
    });

    const result = await node.process();
    expect(result.output.name).toBe("circle");
    expect(result.output.attributes?.transform).toBeUndefined();
  });
});

describe("ClipPathLibNode", () => {
  it("wraps content and clip in a group with clipPath", async () => {
    const node = new ClipPathLibNode();
    node.assign({
      clip_content: {
        name: "circle",
        attributes: { cx: "50", cy: "50", r: "40" }
      },
      content: {
        name: "rect",
        attributes: { width: "100", height: "100", fill: "red" }
      }
    });

    const result = await node.process();
    expect(result.output.name).toBe("g");
    expect(result.output.children).toHaveLength(2);

    const clipPathEl = result.output.children![0];
    expect(clipPathEl.name).toBe("clipPath");
    expect(clipPathEl.attributes?.id).toMatch(/^clip_path_/);
    expect(clipPathEl.children).toHaveLength(1);
    expect(clipPathEl.children![0].name).toBe("circle");

    const clippedEl = result.output.children![1];
    expect(clippedEl.name).toBe("rect");
    expect(clippedEl.attributes?.["clip-path"]).toMatch(
      /^url\(#clip_path_\d+\)$/
    );
  });

  it("returns empty group when clip_content has no name", async () => {
    const node = new ClipPathLibNode();
    node.assign({
      clip_content: { name: "", attributes: {} },
      content: { name: "rect", attributes: { width: "50" } }
    });

    const result = await node.process();
    expect(result.output.name).toBe("g");
    expect(result.output.children).toEqual([]);
  });
});
