/**
 * The `image` and `canvas` bridges — real sandbox runs against the real canvas
 * backend, no network. Pixels are read back through `image.decode`, so these
 * assert what was drawn rather than that a call returned something.
 */
import { describe, it, expect } from "vitest";
import { runInSandbox } from "../src/js-sandbox.js";
import {
  CANVAS_METHODS,
  CANVAS_PROPERTIES
} from "../src/sandbox-canvas-api.js";
import {
  MAX_CANVAS_OPS,
  asImageBytes,
  renderCanvas,
  sniffImageFormat
} from "../src/sandbox-media.js";

/** Run a snippet and fail loudly with the sandbox's own error. */
async function run(code: string): Promise<unknown> {
  const result = await runInSandbox({ code, timeoutMs: 60_000 });
  if (!result.success) throw new Error(result.error ?? "sandbox run failed");
  return result.result;
}

/** A solid PNG the guest can build for itself, as a reusable prelude. */
const SOLID = (
  width: number,
  height: number,
  color: string
): string => `
  const __c = createCanvas(${width}, ${height});
  const __g = __c.getContext("2d");
  __g.fillStyle = ${JSON.stringify(color)};
  __g.fillRect(0, 0, ${width}, ${height});
  const solid = await __c.toBytes();
`;

/** RGBA at (x, y) of a decoded image, as a plain array. */
const PIXEL = `
  const pixelAt = (decoded, x, y) => {
    const i = (y * decoded.width + x) * 4;
    return Array.from(decoded.pixels.slice(i, i + 4));
  };
`;

describe("createCanvas", () => {
  it("draws, encodes, and reports the pixels it drew", async () => {
    const result = (await run(`
      ${PIXEL}
      const c = createCanvas(10, 10);
      const g = c.getContext("2d");
      g.fillStyle = "#ff0000";
      g.fillRect(0, 0, 10, 10);
      g.fillStyle = "#00ff00";
      g.fillRect(0, 0, 5, 5);
      const png = await c.toBytes();
      const decoded = await image.decode(png);
      return {
        isBytes: png instanceof Uint8Array,
        info: await image.info(png),
        topLeft: pixelAt(decoded, 1, 1),
        bottomRight: pixelAt(decoded, 8, 8)
      };
    `)) as Record<string, unknown>;

    expect(result.isBytes).toBe(true);
    expect(result.info).toMatchObject({ width: 10, height: 10, format: "png" });
    expect(result.topLeft).toEqual([0, 255, 0, 255]);
    expect(result.bottomRight).toEqual([255, 0, 0, 255]);
  });

  it("applies a gradient assigned as a fill style", async () => {
    const result = (await run(`
      ${PIXEL}
      const c = createCanvas(64, 4);
      const g = c.getContext("2d");
      const grad = g.createLinearGradient(0, 0, 64, 0);
      grad.addColorStop(0, "#ff0000");
      grad.addColorStop(1, "#0000ff");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 4);
      const decoded = await image.decode(await c.toBytes());
      return { left: pixelAt(decoded, 0, 2), right: pixelAt(decoded, 63, 2) };
    `)) as { left: number[]; right: number[] };

    // Endpoints land on the stops; the midpoint is the interpolation.
    expect(result.left[0]).toBeGreaterThan(200);
    expect(result.left[2]).toBeLessThan(60);
    expect(result.right[2]).toBeGreaterThan(200);
    expect(result.right[0]).toBeLessThan(60);
  });

  it("honours the transform stack across save and restore", async () => {
    const result = (await run(`
      ${PIXEL}
      const c = createCanvas(20, 20);
      const g = c.getContext("2d");
      g.save();
      g.translate(10, 10);
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 10, 10);
      g.restore();
      g.fillStyle = "#ff00ff";
      g.fillRect(0, 0, 4, 4);
      const decoded = await image.decode(await c.toBytes());
      return { shifted: pixelAt(decoded, 15, 15), origin: pixelAt(decoded, 1, 1) };
    `)) as { shifted: number[]; origin: number[] };

    expect(result.shifted).toEqual([255, 255, 255, 255]);
    expect(result.origin).toEqual([255, 0, 255, 255]);
  });

  it("draws image bytes onto the canvas", async () => {
    const result = (await run(`
      ${SOLID(8, 8, "#0000ff")}
      ${PIXEL}
      const c = createCanvas(16, 16);
      const g = c.getContext("2d");
      g.drawImage(solid, 8, 8);
      const decoded = await image.decode(await c.toBytes());
      return { drawn: pixelAt(decoded, 12, 12), empty: pixelAt(decoded, 2, 2) };
    `)) as { drawn: number[]; empty: number[] };

    expect(result.drawn).toEqual([0, 0, 255, 255]);
    expect(result.empty[3]).toBe(0);
  });

  it("fills a jpeg's transparency with white rather than black", async () => {
    const result = (await run(`
      ${PIXEL}
      const c = createCanvas(8, 8);
      const jpeg = await c.toBytes({ format: "jpeg" });
      const decoded = await image.decode(jpeg);
      return { head: Array.from(jpeg.slice(0, 3)), corner: pixelAt(decoded, 0, 0) };
    `)) as { head: number[]; corner: number[] };

    expect(result.head).toEqual([0xff, 0xd8, 0xff]);
    expect(result.corner[0]).toBeGreaterThan(240);
    expect(result.corner[3]).toBe(255);
  });

  it("refuses a context other than 2d", async () => {
    const message = await run(`
      try { createCanvas(4, 4).getContext("webgl"); return "no throw"; }
      catch (e) { return e.message; }
    `);
    expect(message).toMatch(/only the "2d" context/);
  });

  it("offers every allowlisted method and property", async () => {
    const surface = (await run(`
      const g = createCanvas(4, 4).getContext("2d");
      return {
        methods: ${JSON.stringify(CANVAS_METHODS)}.filter((n) => typeof g[n] !== "function"),
        properties: ${JSON.stringify(CANVAS_PROPERTIES)}.filter((n) => !(n in g))
      };
    `)) as { methods: string[]; properties: string[] };

    expect(surface.methods).toEqual([]);
    expect(surface.properties).toEqual([]);
  });
});

describe("canvas.render", () => {
  it("renders a hand-built draw list", async () => {
    const result = (await run(`
      ${PIXEL}
      const png = await canvas.render({
        width: 8,
        height: 8,
        background: "#000000",
        ops: [
          { op: "set", args: ["fillStyle", "#ffffff"] },
          { op: "fillRect", args: [0, 0, 4, 4] }
        ]
      });
      const decoded = await image.decode(png);
      return { lit: pixelAt(decoded, 1, 1), dark: pixelAt(decoded, 6, 6) };
    `)) as { lit: number[]; dark: number[] };

    expect(result.lit).toEqual([255, 255, 255, 255]);
    expect(result.dark).toEqual([0, 0, 0, 255]);
  });

  it("refuses an op outside the allowlist", async () => {
    const message = await run(`
      try {
        await canvas.render({
          width: 4, height: 4,
          ops: [{ op: "getImageData", args: [0, 0, 1, 1] }]
        });
        return "no throw";
      } catch (e) { return e.message; }
    `);
    expect(message).toMatch(/unknown method "getImageData"/);
  });

  it("refuses a property outside the allowlist", async () => {
    const message = await run(`
      try {
        await canvas.render({
          width: 4, height: 4,
          ops: [{ op: "set", args: ["canvas", null] }]
        });
        return "no throw";
      } catch (e) { return e.message; }
    `);
    expect(message).toMatch(/unknown property "canvas"/);
  });

  // Driven host-side: marshaling an over-limit draw list out of the guest costs
  // more than the run's whole budget, which is the point of the cap.
  it("caps the draw list", async () => {
    const ops = Array.from({ length: MAX_CANVAS_OPS + 1 }, () => ({
      op: "beginPath" as const,
      args: []
    }));
    await expect(renderCanvas({ width: 4, height: 4, ops })).rejects.toThrow(
      /exceeds the \d+ limit/
    );
  });

  it("measures text for a font", async () => {
    const metrics = (await run(`
      return await canvas.measureText("iiii", "40px sans-serif");
    `)) as Record<string, number>;
    expect(metrics.width).toBeGreaterThan(0);
    expect(typeof metrics.actualBoundingBoxAscent).toBe("number");
  });
});

describe("image transforms", () => {
  it("resizes to a box, keeping the aspect ratio from one dimension", async () => {
    const result = (await run(`
      ${SOLID(40, 20, "#123456")}
      const auto = await image.info(await image.resize(solid, { width: 20 }));
      const boxed = await image.info(
        await image.resize(solid, { width: 10, height: 10, fit: "cover" })
      );
      return { auto, boxed };
    `)) as Record<string, { width: number; height: number }>;

    expect(result.auto).toMatchObject({ width: 20, height: 10 });
    expect(result.boxed).toMatchObject({ width: 10, height: 10 });
  });

  it("needs at least one dimension", async () => {
    const message = await run(`
      ${SOLID(4, 4, "#ffffff")}
      try { await image.resize(solid, {}); return "no throw"; }
      catch (e) { return e.message; }
    `);
    expect(message).toMatch(/pass width, height, or both/);
  });

  it("crops the requested rectangle and refuses one outside the image", async () => {
    const result = (await run(`
      ${PIXEL}
      const c = createCanvas(10, 10);
      const g = c.getContext("2d");
      g.fillStyle = "#000000";
      g.fillRect(0, 0, 10, 10);
      g.fillStyle = "#ffff00";
      g.fillRect(5, 5, 5, 5);
      const src = await c.toBytes();
      const cropped = await image.crop(src, { x: 5, y: 5, width: 5, height: 5 });
      const decoded = await image.decode(cropped);
      let error = null;
      try { await image.crop(src, { x: 8, y: 0, width: 5, height: 5 }); }
      catch (e) { error = e.message; }
      return { size: [decoded.width, decoded.height], corner: pixelAt(decoded, 0, 0), error };
    `)) as { size: number[]; corner: number[]; error: string };

    expect(result.size).toEqual([5, 5]);
    expect(result.corner).toEqual([255, 255, 0, 255]);
    expect(result.error).toMatch(/falls outside/);
  });

  it("grows the canvas to the rotated bounding box", async () => {
    const info = (await run(`
      ${SOLID(40, 20, "#ffffff")}
      return await image.info(await image.rotate(solid, 90));
    `)) as { width: number; height: number };
    expect(info).toMatchObject({ width: 20, height: 40 });
  });

  it("mirrors horizontally by default", async () => {
    const result = (await run(`
      ${PIXEL}
      const c = createCanvas(4, 1);
      const g = c.getContext("2d");
      g.fillStyle = "#ff0000";
      g.fillRect(0, 0, 1, 1);
      g.fillStyle = "#0000ff";
      g.fillRect(1, 0, 3, 1);
      const decoded = await image.decode(await image.flip(await c.toBytes()));
      return { last: pixelAt(decoded, 3, 0) };
    `)) as { last: number[] };
    expect(result.last).toEqual([255, 0, 0, 255]);
  });

  it("desaturates through adjust and names the options when given none", async () => {
    const result = (await run(`
      ${SOLID(4, 4, "#ff0000")}
      ${PIXEL}
      const gray = await image.decode(await image.adjust(solid, { grayscale: 1 }));
      let error = null;
      try { await image.adjust(solid, {}); } catch (e) { error = e.message; }
      return { pixel: pixelAt(gray, 1, 1), error };
    `)) as { pixel: number[]; error: string };

    expect(result.pixel[0]).toBe(result.pixel[1]);
    expect(result.pixel[1]).toBe(result.pixel[2]);
    expect(result.error).toMatch(/name at least one of/);
  });

  it("composites a layer at a position and opacity", async () => {
    const result = (await run(`
      ${PIXEL}
      const base = createCanvas(10, 10);
      const bg = base.getContext("2d");
      bg.fillStyle = "#000000";
      bg.fillRect(0, 0, 10, 10);
      const layer = createCanvas(4, 4);
      const lg = layer.getContext("2d");
      lg.fillStyle = "#ffffff";
      lg.fillRect(0, 0, 4, 4);
      const out = await image.composite(await base.toBytes(), [
        { image: await layer.toBytes(), x: 0, y: 0, opacity: 0.5 }
      ]);
      const decoded = await image.decode(out);
      return { blended: pixelAt(decoded, 1, 1), untouched: pixelAt(decoded, 9, 9) };
    `)) as { blended: number[]; untouched: number[] };

    expect(result.blended[0]).toBeGreaterThan(100);
    expect(result.blended[0]).toBeLessThan(160);
    expect(result.untouched).toEqual([0, 0, 0, 255]);
  });

  it("converts between formats and refuses one it cannot encode", async () => {
    const result = (await run(`
      ${SOLID(8, 8, "#ff8800")}
      const webp = await image.convert(solid, { format: "webp" });
      let error = null;
      try { await image.convert(solid, { format: "tiff" }); }
      catch (e) { error = e.message; }
      return { webp: Array.from(webp.slice(0, 4)), error };
    `)) as { webp: number[]; error: string };

    expect(String.fromCharCode(...result.webp)).toBe("RIFF");
    expect(result.error).toMatch(/format must be one of/);
  });

  it("round-trips raw pixels through decode and encode", async () => {
    const result = (await run(`
      ${PIXEL}
      const decoded = await image.decode(await (async () => {
        ${SOLID(6, 6, "#00ff00")}
        return solid;
      })());
      const again = await image.decode(await image.encode(decoded));
      return { size: [again.width, again.height], pixel: pixelAt(again, 3, 3) };
    `)) as { size: number[]; pixel: number[] };

    expect(result.size).toEqual([6, 6]);
    expect(result.pixel).toEqual([0, 255, 0, 255]);
  });

  it("reports a decode failure with the format it sniffed", async () => {
    const message = await run(`
      try { await image.info(utf8Encode("not an image at all")); return "no throw"; }
      catch (e) { return e.message; }
    `);
    expect(message).toMatch(/could not decode the image \(unknown\)/);
  });
});

describe("byte coercion and format sniffing", () => {
  it("accepts a numeric-keyed object as bytes", () => {
    expect(asImageBytes({ 0: 1, 1: 2, length: 2 }, "x")).toEqual(
      new Uint8Array([1, 2])
    );
  });

  it("refuses a value that is not byte-shaped", () => {
    expect(() => asImageBytes("png", "image.info: bytes")).toThrow(
      /must be a Uint8Array/
    );
  });

  it("names the container formats by magic number", () => {
    expect(sniffImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(
      "png"
    );
    expect(sniffImageFormat(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("jpeg");
    expect(
      sniffImageFormat(new TextEncoder().encode("RIFF????WEBPVP8 "))
    ).toBe("webp");
    expect(sniffImageFormat(new Uint8Array([1, 2, 3, 4]))).toBe("unknown");
  });
});
