import { buildSeededImageDocument } from "../buildSeededImageDocument";
import type { sketch } from "@nodetool-ai/protocol/api-schemas";

const SERIALIZED_PREFIX = "ntlayer:";

function makeBaseDoc(): sketch.ImageDocumentData {
  return {
    sketch: {
      version: 3,
      canvas: { width: 10, height: 20, backgroundColor: "#ffffff" },
      layers: [
        {
          id: "L1",
          name: "Layer 1",
          type: "raster",
          visible: true,
          opacity: 1,
          locked: false,
          alphaLock: false,
          blendMode: "normal",
          data: null,
          transform: { x: 0, y: 0 },
          contentBounds: { x: 0, y: 0, width: 10, height: 20 },
          effects: []
        }
      ],
      activeLayerId: "L1",
      maskLayerId: null
    },
    layerBindings: []
  } as unknown as sketch.ImageDocumentData;
}

describe("buildSeededImageDocument", () => {
  it("seeds the first layer with the given image URI and full-canvas bounds", () => {
    const result = buildSeededImageDocument(makeBaseDoc(), {
      imageUri: "asset://asset-123.png",
      width: 10,
      height: 20,
      name: "photo.png"
    });

    const layer = result.sketch.layers[0] as Record<string, unknown>;
    expect(layer.name).toBe("photo.png");
    expect(layer.contentBounds).toEqual({ x: 0, y: 0, width: 10, height: 20 });
    expect(typeof layer.data).toBe("string");
    expect((layer.data as string).startsWith(SERIALIZED_PREFIX)).toBe(true);

    const decoded = JSON.parse(
      atob((layer.data as string).slice(SERIALIZED_PREFIX.length))
    );
    // The reference must carry the file extension — a bare asset://{id} would
    // resolve to /api/storage/{id} and 404.
    expect(decoded.image).toBe("asset://asset-123.png");
    expect(decoded.bounds).toEqual({ x: 0, y: 0, width: 10, height: 20 });
  });

  it("preserves canvas, active layer, and bindings from the source document", () => {
    const result = buildSeededImageDocument(makeBaseDoc(), {
      imageUri: "asset://a.png",
      width: 10,
      height: 20,
      name: "x"
    });

    expect(result.sketch.canvas).toEqual({
      width: 10,
      height: 20,
      backgroundColor: "#ffffff"
    });
    expect(result.sketch.activeLayerId).toBe("L1");
    expect(result.layerBindings).toEqual([]);
    expect(result.sketch.layers).toHaveLength(1);
  });
});
