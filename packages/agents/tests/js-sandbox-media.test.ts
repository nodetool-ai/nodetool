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
  imagePixelSize,
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

/** The same drawing, kept host-side: `toImage` answers with a handle. */
const SOLID_HANDLE = (
  width: number,
  height: number,
  color: string
): string => `
  const __ch = createCanvas(${width}, ${height});
  const __gh = __ch.getContext("2d");
  __gh.fillStyle = ${JSON.stringify(color)};
  __gh.fillRect(0, 0, ${width}, ${height});
  const solid = await __ch.toImage();
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
      // An op returns a handle; reading the encoded bytes is the explicit ask.
      const raw = await image.bytes(webp);
      return { webp: Array.from(raw.slice(0, 4)), mime: webp.mimeType, error };
    `)) as { webp: number[]; error: string };

    expect(String.fromCharCode(...result.webp)).toBe("RIFF");
    expect(result.error).toMatch(/format must be one of/);
  });

  it("decodes raw pixels out of an image", async () => {
    // `image.encode` is gone, so there is no pixels-in path to round-trip
    // against: `decode` is one-way now, for a body that reads pixels itself.
    const result = (await run(`
      ${PIXEL}
      ${SOLID(6, 6, "#00ff00")}
      const again = await image.decode(solid);
      return { size: [again.width, again.height], pixel: pixelAt(again, 3, 3) };
    `)) as { size: number[]; pixel: number[] };

    expect(result.size).toEqual([6, 6]);
    expect(result.pixel).toEqual([0, 255, 0, 255]);
  });

  it("reports a decode failure with the format it sniffed", async () => {
    const message = await run(`
      try { await image.info(new TextEncoder().encode("not an image at all")); return "no throw"; }
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

  /**
   * Asking a picture how big it is used to mean decoding it. The one caller
   * that needs the answer — `animate_image`, deciding what aspect to ask the
   * provider for — wants a number, not a rasterization it throws away.
   */
  it("reads pixel size out of the header", () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    const view = new DataView(png.buffer);
    view.setUint32(16, 720, false);
    view.setUint32(20, 1280, false);
    expect(imagePixelSize(png)).toEqual({ width: 720, height: 1280 });

    // JPEG: SOI, an APP0 to skip, then the SOF0 that carries the size.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
      0x08, 0x02, 0x80, 0x01, 0xe0, 0x03, 0x00, 0x00
    ]);
    expect(imagePixelSize(jpeg)).toEqual({ width: 480, height: 640 });

    const gif = new TextEncoder().encode("GIF89a\u0000\u0000\u0000\u0000");
    gif[6] = 0x20;
    gif[7] = 0x03;
    gif[8] = 0x00;
    gif[9] = 0x02;
    expect(imagePixelSize(gif)).toEqual({ width: 800, height: 512 });
  });

  it("says nothing for bytes it cannot read a size out of", () => {
    expect(imagePixelSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(imagePixelSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Media handles
//
// `image.*` trades in handles so an intermediate image never enters the guest.
// Before this, a chain moved the whole payload across the boundary on every
// hop — base64 out, decode back in — and a large enough run aborted the
// runtime at teardown, discarding an answer it had already computed.
// ---------------------------------------------------------------------------

describe("image handles", () => {
  it("returns a handle, not bytes, and reports the image without a round trip", async () => {
    const out = (await run(`
      ${SOLID_HANDLE(32, 16, "#3366ff")}
      return solid;
    `)) as Record<string, unknown>;

    expect(out.uri).toMatch(/^sandbox:\/\/media\//);
    expect(out.type).toBe("image");
    expect(out.mimeType).toBe("image/png");
    expect(out.width).toBe(32);
    expect(out.height).toBe(16);
    expect(typeof out.byteLength).toBe("number");
    // The bytes themselves are host-side; the guest holds a small object.
    expect(out["0"]).toBeUndefined();
  });

  it("chains handle → handle without the bytes crossing", async () => {
    const out = (await run(`
      ${SOLID(64, 64, "#ff0000")}
      let img = solid;
      for (let i = 0; i < 6; i++) {
        img = await image.resize(img, { width: 48, height: 48, fit: "cover" });
        img = await image.adjust(img, { brightness: 1.01 });
      }
      const info = await image.info(img);
      return { uri: img.uri, w: info.width, h: info.height };
    `)) as { uri: string; w: number; h: number };

    expect(out.uri).toMatch(/^sandbox:\/\/media\//);
    expect(out.w).toBe(48);
    expect(out.h).toBe(48);
  });

  it("accepts a media ref as input, so a generated image never enters the guest", async () => {
    const png = (await run(`${SOLID(8, 8, "#00ff00")} return await image.bytes(solid);`)) as Uint8Array;
    const ref = {
      type: "image",
      uri: `data:image/png;base64,${Buffer.from(png).toString("base64")}`
    };

    const result = await runInSandbox({
      // `source` is the shape a generation result has. It goes straight into
      // an op — no media.bytes, no fromBase64.
      code: `const out = await image.resize(source, { width: 4, height: 4, fit: "cover" });
             return { uri: out.uri, w: out.width, h: out.height };`,
      context: {} as never,
      timeoutMs: 60_000,
      globals: { source: ref }
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({ w: 4, h: 4 });
  });

  it("names how to resolve a generation result when this run has no loader", async () => {
    const result = await runInSandbox({
      code: `return await image.adjust(source, { grayscale: true });`,
      timeoutMs: 60_000,
      globals: {
        source: {
          type: "image",
          asset_id: "img1",
          asset_uri: "asset://img1.png",
          uri: "file:///var/assets/img1.png"
        }
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot resolve asset:\/\/img1\.png/);
    expect(result.error).toMatch(/generation result/);
  });

  it("loads a generation result through resolveMediaRef and accepts grayscale: true", async () => {
    const png = (await run(`${SOLID(8, 8, "#ff0000")} return await image.bytes(solid);`)) as Uint8Array;
    const seen: string[] = [];

    const result = await runInSandbox({
      code: `
        const grey = await image.adjust(source, { grayscale: true });
        const decoded = await image.decode(grey);
        const i = 0;
        return [decoded.pixels[i], decoded.pixels[i + 1], decoded.pixels[i + 2]];
      `,
      timeoutMs: 60_000,
      globals: {
        source: {
          type: "image",
          asset_id: "img1",
          asset_uri: "asset://img1.png",
          uri: "file:///secret/img1.png"
        }
      },
      resolveMediaRef: async (_where, ref) => {
        seen.push(String((ref as { uri?: string }).uri));
        return png;
      }
    });

    expect(result.error).toBeUndefined();
    expect(seen).toEqual(["asset://img1.png"]);
    const rgb = result.result as number[];
    expect(rgb[0]).toBe(rgb[1]);
    expect(rgb[1]).toBe(rgb[2]);
  });

  it("hands over real bytes only when asked", async () => {
    const bytes = (await run(`
      ${SOLID(8, 8, "#ffffff")}
      return await image.bytes(solid);
    `)) as Uint8Array;

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(sniffImageFormat(bytes)).toBe("png");
  });

  it("names the run's media budget instead of aborting the runtime", async () => {
    // The aggregate nothing used to bound: per-call caps existed, but fifty
    // legal calls could still kill the run with an Emscripten assertion.
    const result = await runInSandbox({
      code: `
        for (let i = 0; i < 200; i++) {
          await image.blank(2048, 2048, { color: "rgb(" + (i % 256) + ",40,90)" });
        }
        return "no limit hit";
      `,
      context: {} as never,
      timeoutMs: 300_000,
      limits: { runMediaBytes: 1024 * 1024 }
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/limit for one run/);
    expect(result.error).not.toMatch(/gc_obj_list|Assertion failed/);
  }, 300_000);

  it("survives inside one action but not across two, as an action's own sandbox implies", async () => {
    // The failed chat thread carried generated images between `execute_code`
    // actions in `state`. Each action is its own runInSandbox, so a handle
    // parked there is dead on arrival — the message has to say so, and say
    // what to do instead.
    const state: Record<string, unknown> = {};
    const first = await runInSandbox({
      code: `${SOLID_HANDLE(8, 8, "#abcdef")} state.img = solid; return solid.uri;`,
      context: {} as never,
      timeoutMs: 60_000,
      globals: { state }
    });
    expect(first.success).toBe(true);
    expect(String(first.result)).toMatch(/^sandbox:\/\/media\//);

    const second = await runInSandbox({
      code: `return await image.info(state.img);`,
      context: {} as never,
      timeoutMs: 60_000,
      globals: { state }
    });
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/only lives for the action that produced it/);
    expect(second.error).toMatch(/save it as an asset/);
  });

  it("says so when a handle outlives its run", async () => {
    const handle = (await run(
      `${SOLID_HANDLE(8, 8, "#123456")} return solid;`
    )) as Record<string, unknown>;

    const result = await runInSandbox({
      // Rebuilt inside the guest: a handle names bytes its own run holds, so
      // one from an earlier run resolves to nothing here.
      code: `return await image.info(${JSON.stringify(handle)});`,
      context: {} as never,
      timeoutMs: 60_000
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/only lives for the action that produced it/);
  });
});

// ---------------------------------------------------------------------------
// The ops that replaced `image.encode`
//
// `encode` took `width*height*4` bytes from the guest, and every observed use
// was a backdrop: 6 MB of zeros shipped across the boundary to make a 6 KB PNG,
// the largest guest→host payload left after handles. These do the same jobs
// host-side, and answer the questions decoding used to be needed for.
// ---------------------------------------------------------------------------

describe("image.blank / pad / grid / stats", () => {
  it("makes a surface with nothing crossing the boundary", async () => {
    const out = (await run(`
      const t = await image.blank(320, 200);
      const solid = await image.blank(320, 200, { color: "#204080" });
      const ts = await image.stats(t);
      const ss = await image.stats(solid);
      return {
        dims: [t.width, t.height],
        transparentAlpha: ts.channels.a.max,
        solidOpaque: ss.opaque,
        solidBlue: Math.round(ss.channels.b.mean)
      };
    `)) as Record<string, unknown>;

    expect(out.dims).toEqual([320, 200]);
    expect(out.transparentAlpha).toBe(0);
    expect(out.solidOpaque).toBe(true);
    expect(out.solidBlue).toBe(0x80);
  });

  it("pads without scaling, keeping the image where it was put", async () => {
    const out = (await run(`
      ${PIXEL}
      ${SOLID(10, 10, "#ff0000")}
      const padded = await image.pad(solid, { all: 5, color: "#0000ff" });
      const d = await image.decode(padded);
      return {
        dims: [padded.width, padded.height],
        margin: pixelAt(d, 1, 1),
        centre: pixelAt(d, 10, 10)
      };
    `)) as { dims: number[]; margin: number[]; centre: number[] };

    expect(out.dims).toEqual([20, 20]);
    expect(out.margin).toEqual([0, 0, 255, 255]);
    expect(out.centre).toEqual([255, 0, 0, 255]);
  });

  it("takes per-side padding, not just a uniform margin", async () => {
    const out = (await run(`
      ${SOLID(10, 10, "#ff0000")}
      const p = await image.pad(solid, { left: 4, top: 2 });
      return [p.width, p.height];
    `)) as number[];

    expect(out).toEqual([14, 12]);
  });

  it("combines images into a grid — the task that started all this", async () => {
    const out = (await run(`
      ${PIXEL}
      const a = await image.blank(20, 20, { color: "#ff0000" });
      const b = await image.blank(20, 20, { color: "#00ff00" });
      const row = await image.grid([a, b]);
      const wrapped = await image.grid([a, b, a, b], { columns: 2 });
      const d = await image.decode(row);
      return {
        row: [row.width, row.height],
        wrapped: [wrapped.width, wrapped.height],
        left: pixelAt(d, 5, 10),
        right: pixelAt(d, 25, 10)
      };
    `)) as Record<string, number[]>;

    // One row by default; columns wraps it.
    expect(out.row).toEqual([40, 20]);
    expect(out.wrapped).toEqual([40, 40]);
    expect(out.left).toEqual([255, 0, 0, 255]);
    expect(out.right).toEqual([0, 255, 0, 255]);
  });

  it("leaves a gap between cells when asked", async () => {
    const out = (await run(`
      const a = await image.blank(10, 10, { color: "#ff0000" });
      const g = await image.grid([a, a, a], { gap: 4 });
      return [g.width, g.height];
    `)) as number[];

    expect(out).toEqual([38, 10]);
  });

  it("reports what an image looks like without moving it", async () => {
    const out = (await run(`
      const dark = await image.blank(64, 64, { color: "#000000" });
      const light = await image.blank(64, 64, { color: "#ffffff" });
      const d = await image.stats(dark);
      const l = await image.stats(light);
      return { darkL: d.luminance, lightL: l.luminance, pixels: d.pixels };
    `)) as { darkL: number; lightL: number; pixels: number };

    expect(out.darkL).toBeCloseTo(0, 1);
    expect(out.lightL).toBeCloseTo(255, 1);
    expect(out.pixels).toBe(64 * 64);
  });

  it("has no image.encode left to ship pixels through", async () => {
    const result = await runInSandbox({
      code: `return typeof image.encode;`,
      context: {} as never,
      timeoutMs: 60_000
    });
    expect(result.result).toBe("undefined");
  });
});
