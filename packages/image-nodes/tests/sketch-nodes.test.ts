/**
 * Behavior tests for sketch nodes (RenderSketchNode, SketchLayersNode,
 * CreateSketchNode). GPU compositing is mocked so the tests assert layer
 * selection, placement, opacity/blend wiring, and document round-trips
 * without requiring a Dawn device.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

type MockHeadlessLayer = {
  rgba: Uint8Array;
  width: number;
  height: number;
  opacity: number;
  blendModeId: number;
  transform?: { x: number; y: number; scaleX: number; scaleY: number; rotation: number };
};

let compositeCalls: Array<{
  layers: MockHeadlessLayer[];
  width: number;
  height: number;
}> = [];

vi.mock("@nodetool-ai/gpu/node", () => ({
  compositeImageLayers: vi.fn(
    async (layers: MockHeadlessLayer[], width: number, height: number) => {
      compositeCalls.push({ layers, width, height });
      return { rgba: new Uint8Array(width * height * 4), width, height };
    }
  )
}));

const { RenderSketchNode, SketchLayersNode, CreateSketchNode } = await import(
  "../src/nodes/sketch.js"
);

async function pngDataUrl(
  width: number,
  height: number,
  color: { r: number; g: number; b: number }
): Promise<string> {
  const png = await sharp({
    create: { width, height, channels: 4, background: { ...color, alpha: 1 } }
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function ntLayerData(
  imageDataUrl: string,
  bounds: { x: number; y: number; width: number; height: number }
): string {
  return `ntlayer:${Buffer.from(
    JSON.stringify({ version: 1, image: imageDataUrl, bounds }),
    "utf8"
  ).toString("base64")}`;
}

beforeEach(() => {
  compositeCalls = [];
});

describe("RenderSketchNode", () => {
  it("composites only visible raster layers, with placement and opacity", async () => {
    const layerImage = await pngDataUrl(4, 4, { r: 255, g: 0, b: 0 });
    const sketch = {
      canvas: { width: 16, height: 8 },
      layers: [
        {
          id: "l1",
          name: "Visible",
          type: "raster",
          visible: true,
          opacity: 0.5,
          blendMode: "multiply",
          data: ntLayerData(layerImage, { x: 2, y: 1, width: 4, height: 4 }),
          transform: { kind: "affine", x: 3, y: 2, scaleX: 1, scaleY: 1, rotation: 0 }
        },
        {
          id: "l2",
          name: "Hidden",
          type: "raster",
          visible: false,
          opacity: 1,
          blendMode: "normal",
          data: ntLayerData(layerImage, { x: 0, y: 0, width: 4, height: 4 })
        }
      ],
      maskLayerId: null
    };
    const context = {
      getImageDocument: vi.fn(async () => ({ document: { sketch } }))
    };

    const node = new RenderSketchNode();
    node.assign({ sketch: { type: "sketch", id: "doc-1" } });
    const result = (await node.process(context as never)) as {
      image: { width: number; height: number };
      mask?: unknown;
    };

    expect(context.getImageDocument).toHaveBeenCalledWith("doc-1");
    expect(compositeCalls).toHaveLength(1);
    expect(compositeCalls[0].width).toBe(16);
    expect(compositeCalls[0].height).toBe(8);
    expect(compositeCalls[0].layers).toHaveLength(1);

    const layer = compositeCalls[0].layers[0];
    expect(layer.opacity).toBe(0.5);
    expect(layer.blendModeId).toBeGreaterThan(0); // multiply, not normal
    // Top-left = transform (3,2) + bounds (2,1); GPU transform is the center.
    expect(layer.transform).toMatchObject({ x: 5 + 2, y: 3 + 2 });

    expect(result.image).toMatchObject({ width: 16, height: 8 });
    expect(result.mask).toBeUndefined();
  });

  it("renders the designated mask layer separately", async () => {
    const layerImage = await pngDataUrl(2, 2, { r: 255, g: 255, b: 255 });
    const sketch = {
      canvas: { width: 8, height: 8 },
      layers: [
        {
          id: "paint",
          name: "Paint",
          type: "raster",
          visible: true,
          data: ntLayerData(layerImage, { x: 0, y: 0, width: 2, height: 2 })
        },
        {
          id: "mask-1",
          name: "Mask",
          type: "mask",
          visible: true,
          data: ntLayerData(layerImage, { x: 0, y: 0, width: 2, height: 2 })
        }
      ],
      maskLayerId: "mask-1"
    };
    const context = {
      getImageDocument: vi.fn(async () => ({ document: { sketch } }))
    };

    const node = new RenderSketchNode();
    node.assign({ sketch: { type: "sketch", id: "doc-1" } });
    const result = (await node.process(context as never)) as {
      mask?: { width: number; height: number };
    };

    // One composite for the image (mask layer excluded), one for the mask.
    expect(compositeCalls).toHaveLength(2);
    expect(compositeCalls[0].layers).toHaveLength(1);
    expect(compositeCalls[1].layers).toHaveLength(1);
    expect(result.mask).toMatchObject({ width: 8, height: 8 });
  });

  it("accepts an inline document payload when no id is set", async () => {
    const layerImage = await pngDataUrl(2, 2, { r: 0, g: 255, b: 0 });
    const node = new RenderSketchNode();
    node.assign({
      sketch: {
        type: "sketch",
        id: null,
        data: {
          canvas: { width: 4, height: 4 },
          layers: [
            {
              id: "l1",
              name: "L1",
              type: "raster",
              visible: true,
              data: ntLayerData(layerImage, { x: 0, y: 0, width: 2, height: 2 })
            }
          ]
        }
      }
    });
    const result = (await node.process()) as {
      image: { width: number; height: number };
    };
    expect(result.image).toMatchObject({ width: 4, height: 4 });
  });

  it("throws a helpful error for an empty sketch input", async () => {
    const node = new RenderSketchNode();
    node.assign({ sketch: { type: "sketch", id: null, data: null } });
    await expect(node.process()).rejects.toThrow(/Sketch input is empty/);
  });
});

describe("SketchLayersNode", () => {
  it("returns one image and name per visible layer", async () => {
    const layerImage = await pngDataUrl(2, 2, { r: 0, g: 0, b: 255 });
    const sketch = {
      canvas: { width: 4, height: 4 },
      layers: [
        {
          id: "bg",
          name: "Background",
          type: "raster",
          visible: true,
          data: ntLayerData(layerImage, { x: 0, y: 0, width: 2, height: 2 })
        },
        {
          id: "fg",
          name: "Foreground",
          type: "raster",
          visible: true,
          data: ntLayerData(layerImage, { x: 0, y: 0, width: 2, height: 2 })
        },
        { id: "empty", name: "Empty", type: "raster", visible: true, data: null }
      ]
    };
    const context = {
      getImageDocument: vi.fn(async () => ({ document: { sketch } }))
    };

    const node = new SketchLayersNode();
    node.assign({ sketch: { type: "sketch", id: "doc-2" } });
    const result = (await node.process(context as never)) as {
      layers: unknown[];
      names: string[];
    };

    expect(result.names).toEqual(["Background", "Foreground"]);
    expect(result.layers).toHaveLength(2);
    expect(compositeCalls).toHaveLength(2);
  });
});

describe("CreateSketchNode", () => {
  it("creates a persisted sketch document with the image on the base layer", async () => {
    const png = await sharp({
      create: {
        width: 6,
        height: 3,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 }
      }
    })
      .png()
      .toBuffer();

    const createImageDocument = vi.fn(async () => ({ id: "new-doc" }));
    const context = { createImageDocument };

    const node = new CreateSketchNode();
    node.assign({
      image: { type: "image", data: new Uint8Array(png) },
      name: "My sketch"
    });
    const result = (await node.process(context as never)) as {
      output: { type: string; id: string };
    };

    expect(result.output).toEqual({ type: "sketch", id: "new-doc" });
    expect(createImageDocument).toHaveBeenCalledTimes(1);
    const args = createImageDocument.mock.calls[0][0] as {
      name: string;
      width: number;
      height: number;
      document: { sketch: { layers: Array<{ data: string }> } };
    };
    expect(args.name).toBe("My sketch");
    expect(args.width).toBe(6);
    expect(args.height).toBe(3);
    expect(args.document.sketch.layers).toHaveLength(1);
    expect(args.document.sketch.layers[0].data.startsWith("ntlayer:")).toBe(
      true
    );
  });
});
