/**
 * SVG detection and rasterization.
 *
 * A vector reaches every raster path — a vision provider's image block, a crop,
 * a downscale — only through `rasterizeSvg`, and it is the one decode in this
 * package whose input is markup written by a model. The refusals are the point:
 * an SVG that references anything outside itself is rendered by librsvg against
 * this host's own filesystem and network.
 */
import { describe, it, expect } from "vitest";
import { rasterizeSvg } from "../src/image-codec.js";
import { isSvgBytes, SVG_MIME } from "../src/providers/image-mime.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const svg = (body = '<rect width="10" height="10" fill="red"/>', attrs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs}>${body}</svg>`;

describe("isSvgBytes", () => {
  it("recognizes an svg root however it is preceded", () => {
    expect(isSvgBytes(bytes(svg()))).toBe(true);
    expect(isSvgBytes(bytes(`<?xml version="1.0"?>\n${svg()}`))).toBe(true);
    expect(isSvgBytes(bytes(`<!-- a comment -->\n<SVG></SVG>`))).toBe(true);
  });

  it("rejects raster containers and unrelated text", () => {
    expect(isSvgBytes(new Uint8Array(PNG_SIGNATURE))).toBe(false);
    expect(isSvgBytes(bytes("plain text"))).toBe(false);
    expect(isSvgBytes(new Uint8Array())).toBe(false);
    // A tag whose name merely starts with "svg".
    expect(isSvgBytes(bytes("<svgish/>"))).toBe(false);
  });

  it("does not decode the whole file to answer", () => {
    // The root sits past the window, so this reads false — the point is that
    // the answer comes from a bounded read, not from megabytes of markup.
    const padded = `<!--${"x".repeat(4000)}-->${svg()}`;
    expect(isSvgBytes(bytes(padded))).toBe(false);
  });

  it("names the MIME the rest of the stack stores SVG under", () => {
    expect(SVG_MIME).toBe("image/svg+xml");
  });
});

describe("rasterizeSvg", () => {
  it("renders to PNG bytes", async () => {
    const out = await rasterizeSvg(bytes(svg()));
    expect([...out.data.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
  });

  it("scales a small vector up to something readable", async () => {
    // 10 user units at 1:1 is a 10px PNG. minSide is what makes the render
    // worth showing a model.
    const out = await rasterizeSvg(bytes(svg()), { minSide: 512 });
    expect(Math.max(out.width, out.height)).toBeGreaterThanOrEqual(512);
  });

  it("honors maxSide", async () => {
    const out = await rasterizeSvg(bytes(svg()), { minSide: 1024, maxSide: 128 });
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(128);
  });

  it("renders a document with no intrinsic size", async () => {
    const out = await rasterizeSvg(
      bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5"/></svg>')
    );
    expect([...out.data.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  });

  it.each([
    ['<image href="/etc/passwd"/>', "/etc/passwd"],
    ['<image xlink:href="http://169.254.169.254/latest"/>', "169.254.169.254"],
    ['<use href="file:///etc/hosts"/>', "file:///etc/hosts"],
    ['<rect width="1" height="1" fill="url(https://example.com/x.svg#g)"/>', "example.com"]
  ])("refuses markup that reaches outside itself (%s)", async (body, needle) => {
    await expect(rasterizeSvg(bytes(svg(body)))).rejects.toThrow(needle);
  });

  it("allows the references that stay inside the document", async () => {
    const inline =
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>' +
      '<rect width="10" height="10" fill="url(#g)"/>' +
      '<image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>';
    const out = await rasterizeSvg(bytes(svg(inline)));
    expect([...out.data.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  });

  it("refuses a document over the size cap", async () => {
    const huge = bytes(svg(`<!--${"x".repeat(9 * 1024 * 1024)}-->`));
    await expect(rasterizeSvg(huge)).rejects.toThrow(/limit for rasterization/);
  });
});
