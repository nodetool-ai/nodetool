/**
 * The headless sketch renderer and the `render_sketch` capability over it.
 *
 * Every case builds a document whose correct output is known without running
 * the code (a red square at a known offset, a half-opacity layer over white, a
 * layer inside a hidden group) and reads the pixel back. A test that only
 * checked a PNG came back would pass on a blank canvas.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ImageDocument, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { encodeSketchLayerData } from "@nodetool-ai/protocol/api-schemas/sketch.js";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { renderSketch } from "../src/sketch-render/render.js";

const W = 40;
const H = 20;

function solidPng(width: number, height: number, color: string): string {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function raster(
  id: string,
  bounds: Bounds,
  color: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    name: id,
    type: "raster",
    visible: true,
    opacity: 1,
    blendMode: "normal",
    alphaLock: false,
    data: encodeSketchLayerData(solidPng(bounds.width, bounds.height, color), bounds),
    transform: { kind: "affine", x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    contentBounds: bounds,
    effects: [],
    ...overrides
  };
}

function sketch(layers: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    sketch: {
      version: 1,
      canvas: { width: W, height: H, backgroundColor: "#ffffff" },
      layers,
      activeLayerId: "",
      maskLayerId: null,
      ...extra
    },
    layerBindings: []
  };
}

const FULL = { x: 0, y: 0, width: W, height: H };

async function pixel(png: Uint8Array, x: number, y: number): Promise<number[]> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return Array.from(ctx.getImageData(x, y, 1, 1).data);
}

async function size(png: Uint8Array): Promise<[number, number]> {
  const image = await loadImage(Buffer.from(png));
  return [image.width, image.height];
}

function near(actual: number[], expected: number[], tolerance = 2): void {
  expect(actual).toHaveLength(4);
  actual.forEach((channel, i) => {
    expect(Math.abs(channel - (expected[i] ?? 0))).toBeLessThanOrEqual(tolerance);
  });
}

describe("renderSketch", () => {
  it("places each layer at its stored bounds, bottom of the stack first", async () => {
    const result = await renderSketch(
      sketch([
        raster("white", FULL, "#ffffff"),
        raster("red", { x: 10, y: 5, width: 10, height: 10 }, "#ff0000"),
        raster("blue", { x: 15, y: 5, width: 10, height: 10 }, "#0000ff")
      ])
    );
    expect(result.mimeType).toBe("image/png");
    expect(await size(result.bytes)).toEqual([W, H]);
    near(await pixel(result.bytes, 2, 2), [255, 255, 255, 255]);
    near(await pixel(result.bytes, 12, 8), [255, 0, 0, 255]);
    // Where they overlap, the upper layer covers the lower.
    near(await pixel(result.bytes, 17, 8), [0, 0, 255, 255]);
    expect(result.layers.map((layer) => layer.drawn)).toEqual([true, true, true]);
  });

  it("leaves the canvas transparent, as the editor's PNG export does", async () => {
    const result = await renderSketch(
      sketch([raster("red", { x: 0, y: 0, width: 10, height: 10 }, "#ff0000")])
    );
    expect((await pixel(result.bytes, 30, 15))[3]).toBe(0);
  });

  it("applies opacity, group opacity and blend modes", async () => {
    const result = await renderSketch(
      sketch([
        raster("white", FULL, "#ffffff"),
        raster("half", { x: 0, y: 0, width: 10, height: 10 }, "#000000", { opacity: 0.5 }),
        { ...raster("group", FULL, "#000000"), type: "group", data: null, opacity: 0.5 },
        raster("in-group", { x: 10, y: 0, width: 10, height: 10 }, "#000000", {
          parentId: "group",
          opacity: 0.5
        }),
        raster("multiply", { x: 20, y: 0, width: 10, height: 10 }, "#808080", {
          blendMode: "multiply"
        })
      ])
    );
    near(await pixel(result.bytes, 5, 5), [128, 128, 128, 255]);
    // 0.5 own × 0.5 group: a quarter of the black shows.
    near(await pixel(result.bytes, 15, 5), [191, 191, 191, 255]);
    near(await pixel(result.bytes, 25, 5), [128, 128, 128, 255]);
  });

  it("skips hidden layers and every layer inside a hidden group", async () => {
    const result = await renderSketch(
      sketch([
        raster("white", FULL, "#ffffff"),
        raster("hidden", FULL, "#ff0000", { visible: false }),
        { ...raster("group", FULL, "#000000"), type: "group", data: null, visible: false },
        raster("in-hidden-group", FULL, "#00ff00", { parentId: "group" })
      ])
    );
    near(await pixel(result.bytes, 20, 10), [255, 255, 255, 255]);
    expect(result.layers.find((layer) => layer.id === "hidden")?.drawn).toBe(false);
  });

  it("moves and scales a layer with its affine transform", async () => {
    const result = await renderSketch(
      sketch([
        raster("red", { x: 0, y: 0, width: 4, height: 4 }, "#ff0000", {
          transform: { kind: "affine", x: 20, y: 6, scaleX: 2, scaleY: 2, rotation: 0 }
        })
      ])
    );
    // A 4×4 square at (20, 6), scaled 2× around its center, spans 18..26 × 4..12.
    near(await pixel(result.bytes, 19, 5), [255, 0, 0, 255]);
    near(await pixel(result.bytes, 25, 11), [255, 0, 0, 255]);
    expect((await pixel(result.bytes, 17, 8))[3]).toBe(0);
  });

  it("evaluates layer effects", async () => {
    const result = await renderSketch(
      sketch([
        raster("grey", FULL, "#404040", {
          effects: [{ type: "exposure", enabled: true, params: { exposureStops: 1 } }]
        })
      ])
    );
    near(await pixel(result.bytes, 5, 5), [128, 128, 128, 255]);
  });

  it("fits an image reference into the layer", async () => {
    const result = await renderSketch(
      sketch([
        {
          ...raster("photo", { x: 0, y: 0, width: 40, height: 20 }, "#000000"),
          data: null,
          imageReference: { uri: solidPng(2, 1, "#00ff00"), objectFit: "fill" }
        }
      ])
    );
    near(await pixel(result.bytes, 39, 19), [0, 255, 0, 255]);
  });

  it("resizes the output and keeps the aspect ratio when given one side", async () => {
    const doc = sketch([raster("red", FULL, "#ff0000")]);
    const scaled = await renderSketch(doc, { width: 80 });
    expect([scaled.width, scaled.height]).toEqual([80, 40]);
    expect(await size(scaled.bytes)).toEqual([80, 40]);
    const background = await renderSketch(
      sketch([raster("red", { x: 0, y: 0, width: 10, height: 10 }, "#ff0000")]),
      { background: "#0000ff" }
    );
    near(await pixel(background.bytes, 30, 15), [0, 0, 255, 255]);
  });

  it("renders one layer alone without its opacity", async () => {
    const result = await renderSketch(
      sketch([
        raster("white", FULL, "#ffffff"),
        raster("faint", { x: 0, y: 0, width: 10, height: 10 }, "#ff0000", {
          opacity: 0.2,
          visible: false
        })
      ]),
      { layerId: "faint" }
    );
    expect(result.layerId).toBe("faint");
    near(await pixel(result.bytes, 5, 5), [255, 0, 0, 255]);
    expect((await pixel(result.bytes, 30, 15))[3]).toBe(0);
  });

  it("leaves the mask out of the image and renders it on request", async () => {
    const doc = sketch(
      [
        raster("white", FULL, "#ffffff"),
        raster("mask", { x: 0, y: 0, width: 10, height: 10 }, "#000000", { type: "mask" })
      ],
      { maskLayerId: "mask" }
    );
    const image = await renderSketch(doc);
    near(await pixel(image.bytes, 5, 5), [255, 255, 255, 255]);
    const mask = await renderSketch(doc, { mask: true });
    near(await pixel(mask.bytes, 5, 5), [0, 0, 0, 255]);

    const hidden = sketch(
      [raster("mask", FULL, "#000000", { type: "mask", visible: false })],
      { maskLayerId: "mask" }
    );
    await expect(renderSketch(hidden, { mask: true })).rejects.toThrow(/hidden/);
    await expect(renderSketch(sketch([]), { mask: true })).rejects.toThrow(/no inpainting mask/);
  });

  it("writes a layered PSD and refuses PNG-only options with it", async () => {
    const doc = sketch([
      raster("white", FULL, "#ffffff"),
      raster("red", { x: 10, y: 5, width: 10, height: 10 }, "#ff0000", { blendMode: "multiply" })
    ]);
    const psd = await renderSketch(doc, { format: "psd" });
    expect(psd.mimeType).toBe("image/vnd.adobe.photoshop");
    expect(Buffer.from(psd.bytes.subarray(0, 4)).toString("latin1")).toBe("8BPS");
    const text = Buffer.from(psd.bytes).toString("latin1");
    // Each layer keeps its blend key: "mul " is Photoshop's multiply.
    expect(text).toContain("8BIMmul ");
    await expect(renderSketch(doc, { format: "psd", width: 10 })).rejects.toThrow(
      /cannot apply/
    );
  });

  it("reports a layer whose image cannot be read instead of failing the render", async () => {
    const result = await renderSketch(
      sketch([
        raster("white", FULL, "#ffffff"),
        {
          ...raster("remote", FULL, "#000000"),
          data: encodeSketchLayerData("asset://0123456789abcdef0123456789abcdef.png", FULL)
        }
      ])
    );
    const remote = result.layers.find((layer) => layer.id === "remote");
    expect(remote?.drawn).toBe(false);
    expect(remote?.issue).toMatch(/could not be loaded/);
    near(await pixel(result.bytes, 5, 5), [255, 255, 255, 255]);
  });

  it("refuses a layer whose stored bounds are past the surface limit", async () => {
    await expect(
      renderSketch(
        sketch([
          {
            ...raster("huge", FULL, "#000000"),
            data: encodeSketchLayerData(solidPng(1, 1, "#000"), {
              x: 0,
              y: 0,
              width: 100000,
              height: 100000
            })
          }
        ])
      )
    ).rejects.toThrow(/over the render limit/);
  });

  it("names an unknown layer", async () => {
    await expect(
      renderSketch(sketch([raster("a", FULL, "#fff")]), { layerId: "nope" })
    ).rejects.toThrow(/no layer nope/);
  });
});

describe("render_sketch capability", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  /** A context whose asset writes are captured instead of stored. */
  function capturingRun(userId = "u1") {
    const saved: Array<{ name: string; contentType: string; content: Uint8Array }> = [];
    const context = {
      userId,
      hasModelInterface: (name: string) => name === "createAsset",
      createAsset: async (asset: { name: string; contentType: string; content: Uint8Array }) => {
        saved.push(asset);
        return { id: "a".repeat(32) };
      }
    } as unknown as ProcessingContext;
    return { saved, run: createCapabilityRun({ context, gate: UNGATED }) };
  }

  it("renders an inline document and saves the PNG as an asset", async () => {
    const { saved, run } = capturingRun();
    const result = (await run.invoke("render_sketch", {
      document: sketch([raster("red", FULL, "#ff0000")]),
      width: 20
    })) as Record<string, unknown>;
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      format: "png",
      width: 20,
      height: 10,
      canvas_width: W,
      canvas_height: H,
      image: { type: "image", mime_type: "image/png", asset_uri: `asset://${"a".repeat(32)}.png` }
    });
    expect(saved).toHaveLength(1);
    near(await pixel(saved[0]!.content, 5, 5), [255, 0, 0, 255]);
  });

  it("renders a saved sketch only for its owner", async () => {
    const row = await ImageDocument.create<ImageDocument>({
      user_id: "u1",
      project_id: "default",
      name: "Poster",
      width: W,
      height: H,
      background_color: "#ffffff",
      document: JSON.stringify(sketch([raster("blue", FULL, "#0000ff")]))
    });
    const owner = capturingRun("u1");
    const result = (await owner.run.invoke("render_sketch", {
      image_document_id: row.id,
      format: "psd"
    })) as Record<string, unknown>;
    expect(result).toMatchObject({
      format: "psd",
      image_document_id: row.id,
      image: { mime_type: "image/vnd.adobe.photoshop" }
    });
    expect(owner.saved[0]?.name).toMatch(/\.psd$/);

    const stranger = capturingRun("u2");
    expect(
      await stranger.run.invoke("render_sketch", { image_document_id: row.id })
    ).toEqual({ error: `Sketch ${row.id} was not found.` });
    expect(stranger.saved).toHaveLength(0);
  });

  it("does not read local files named by a layer", async () => {
    const { run } = capturingRun();
    const result = (await run.invoke("render_sketch", {
      document: sketch([
        {
          ...raster("local", FULL, "#000000"),
          data: encodeSketchLayerData("file:///etc/hostname", FULL)
        }
      ])
    })) as { layers: Array<{ id: string; drawn: boolean; issue?: string }> };
    expect(result.layers[0]).toMatchObject({ id: "local", drawn: false });
    expect(result.layers[0]?.issue).toMatch(/could not be read/);
  });

  it("answers an error for a call with nothing to render or a bad option", async () => {
    const { run } = capturingRun();
    expect(await run.invoke("render_sketch", {})).toMatchObject({
      error: expect.stringMatching(/No sketch to render/)
    });
    expect(
      await run.invoke("render_sketch", {
        document: sketch([raster("a", FULL, "#fff")]),
        layer_id: "missing"
      })
    ).toMatchObject({ error: expect.stringMatching(/no layer missing/) });
  });
});
