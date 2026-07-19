// CanvasResize now pads on the GPU shader pool — load the SwiftShader ICD so a
// CPU WebGPU device is available in CI.
import "../../gpu/tests/setup/swiftshaderIcd.js";
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { CanvasResizeNode } from "../src/nodes/image.js";

async function makeTestImage(
  w = 4,
  h = 4,
  r = 128,
  g = 64,
  b = 32
): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } }
  })
    .png()
    .toBuffer();
  return {
    type: "image",
    data: buf.toString("base64"),
    uri: "",
    width: w,
    height: h
  };
}

describe("CanvasResizeNode", () => {
  it("padding mode adds px on each side", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(10, 10),
      mode: "padding",
      padding_unit: "px",
      top: 10,
      bottom: 10,
      left: 10,
      right: 10
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(30);
    expect(output.height).toBe(30);
  });

  it("scale mode doubles canvas dimensions while keeping source pixels", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(8, 8),
      mode: "scale",
      scale: 2
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(16);
    expect(output.height).toBe(16);
  });

  it("fixed mode centers source on target canvas", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(4, 4, 255, 0, 0),
      mode: "fixed",
      width: 8,
      height: 8
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(8);
    expect(output.height).toBe(8);

    // Raw straight-alpha RGBA, 8×8×4. Source red (4×4) centred at offset (2,2).
    expect(output.mimeType).toBe("image/x-raw-rgba");
    const data = output.data as Uint8Array;
    const centerIdx = (4 * 8 + 4) * 4;
    expect(data[centerIdx]).toBeGreaterThan(200); // centre is red
    expect(data[3]).toBe(0); // top-left corner is transparent padding
  });

  it("anchor top-left places source at top-left corner", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(4, 4, 255, 0, 0),
      mode: "fixed",
      width: 8,
      height: 8,
      anchor: "top-left"
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(8);
    expect(output.height).toBe(8);
    const data = output.data as Uint8Array;
    // Top-left pixel should be the source (red)
    expect(data[0]).toBeGreaterThan(200);
    expect(data[3]).toBeGreaterThan(200);
    // Bottom-right pixel should be padding (transparent)
    const brIdx = (7 * 8 + 7) * 4;
    expect(data[brIdx + 3]).toBe(0);
  });

  it("anchor bottom-right places source at bottom-right corner", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(4, 4, 255, 0, 0),
      mode: "fixed",
      width: 8,
      height: 8,
      anchor: "bottom-right"
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(8);
    expect(output.height).toBe(8);
    const data = output.data as Uint8Array;
    // Top-left pixel should be padding (transparent)
    expect(data[3]).toBe(0);
    // Bottom-right area should be the source (red)
    const brIdx = (7 * 8 + 7) * 4;
    expect(data[brIdx]).toBeGreaterThan(200);
    expect(data[brIdx + 3]).toBeGreaterThan(200);
  });

  it("fill color applies to expanded area", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(4, 4, 255, 0, 0),
      mode: "fixed",
      width: 8,
      height: 8,
      color: { type: "color", value: "#0000FFFF" }
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(8);
    expect(output.height).toBe(8);
    const data = output.data as Uint8Array;
    // Top-left corner should be blue fill (not transparent)
    expect(data[2]).toBeGreaterThan(200); // blue channel
    expect(data[3]).toBeGreaterThan(200); // alpha
  });

  it("padding percent mode with fill color", async () => {
    const node = new CanvasResizeNode();
    node.assign({
      image: await makeTestImage(10, 10),
      mode: "padding",
      padding_unit: "percent",
      top: 50,
      bottom: 50,
      left: 50,
      right: 50,
      color: { type: "color", value: "#FF0000FF" }
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    expect(output.width).toBe(20);
    expect(output.height).toBe(20);
  });
});
