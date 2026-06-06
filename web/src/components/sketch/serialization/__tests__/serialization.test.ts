import {
  serializeLayerData,
  deserializeLayerData,
  getLayerDataImageUrl,
  serializeDocument,
  deserializeDocument
} from "../index";
import {
  createDefaultDocument,
  SKETCH_FORMAT_VERSION
} from "../../types/document";

describe("serializeLayerData / deserializeLayerData (serialization module)", () => {
  const bounds = { x: 10, y: 20, width: 100, height: 200 };

  it("round-trips image data and bounds", () => {
    const imageData = "data:image/png;base64,abc123";
    const serialized = serializeLayerData(imageData, bounds);
    const deserialized = deserializeLayerData(serialized, 512, 512);
    expect(deserialized.image).toBe(imageData);
    expect(deserialized.bounds).toEqual(bounds);
  });

  it("round-trips null image", () => {
    const serialized = serializeLayerData(null, bounds);
    const deserialized = deserializeLayerData(serialized, 512, 512);
    expect(deserialized.image).toBeNull();
    expect(deserialized.bounds).toEqual(bounds);
  });

  it("returns null image and fallback bounds for null data", () => {
    const result = deserializeLayerData(null, 800, 600);
    expect(result.image).toBeNull();
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("returns null image and fallback bounds for empty string", () => {
    const result = deserializeLayerData("", 800, 600);
    expect(result.image).toBeNull();
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("treats legacy data (no prefix) as raw image with fallback bounds", () => {
    const legacy = "data:image/png;base64,legacyContent";
    const result = deserializeLayerData(legacy, 512, 512);
    expect(result.image).toBe(legacy);
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 512, height: 512 });
  });

  it("returns raw data for malformed base64 payload", () => {
    const malformed = "ntlayer:notvalidbase64!!!";
    const result = deserializeLayerData(malformed, 512, 512);
    expect(result.image).toBe(malformed);
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 512, height: 512 });
  });
});

describe("getLayerDataImageUrl", () => {
  it("extracts the image URL from serialized data", () => {
    const imageUrl = "data:image/png;base64,test123";
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const serialized = serializeLayerData(imageUrl, bounds);
    expect(getLayerDataImageUrl(serialized)).toBe(imageUrl);
  });

  it("returns null for null data", () => {
    expect(getLayerDataImageUrl(null)).toBeNull();
  });

  it("returns null for undefined data", () => {
    expect(getLayerDataImageUrl(undefined)).toBeNull();
  });

  it("returns legacy data URL directly", () => {
    const legacyUrl = "data:image/png;base64,legacy";
    expect(getLayerDataImageUrl(legacyUrl)).toBe(legacyUrl);
  });
});

describe("serializeDocument", () => {
  it("serializes a document to JSON", () => {
    const doc = createDefaultDocument(256, 256);
    const json = serializeDocument(doc);
    const parsed = JSON.parse(json);
    expect(parsed.canvas.width).toBe(256);
    expect(parsed.canvas.height).toBe(256);
    expect(parsed.layers).toHaveLength(1);
  });

  it("strips data from locked layers with imageReference", () => {
    const doc = createDefaultDocument(256, 256);
    doc.layers[0].locked = true;
    doc.layers[0].data = "some-data";
    doc.layers[0].imageReference = {
      uri: "https://example.com/img.png",
      naturalWidth: 100,
      naturalHeight: 100,
      objectFit: "fill"
    };
    const json = serializeDocument(doc);
    const parsed = JSON.parse(json);
    expect(parsed.layers[0].data).toBeNull();
  });

  it("preserves data for unlocked layers", () => {
    const doc = createDefaultDocument(256, 256);
    doc.layers[0].data = "data:image/png;base64,abc";
    doc.layers[0].locked = false;
    const json = serializeDocument(doc);
    const parsed = JSON.parse(json);
    expect(parsed.layers[0].data).toBe("data:image/png;base64,abc");
  });
});

describe("deserializeDocument", () => {
  it("returns null for null input", () => {
    expect(deserializeDocument(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(deserializeDocument("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(deserializeDocument("{invalid")).toBeNull();
  });

  it("returns null for valid JSON without version/layers", () => {
    expect(deserializeDocument('{"foo": "bar"}')).toBeNull();
  });

  it("deserializes and normalizes a valid document", () => {
    const doc = createDefaultDocument(1024, 768);
    const json = serializeDocument(doc);
    const result = deserializeDocument(json);
    expect(result).not.toBeNull();
    expect(result!.canvas.width).toBe(1024);
    expect(result!.canvas.height).toBe(768);
    expect(result!.version).toBe(SKETCH_FORMAT_VERSION);
    expect(result!.layers).toHaveLength(1);
  });

  it("normalizes layers with missing fields", () => {
    const minimal = JSON.stringify({
      version: 1,
      canvas: { width: 512, height: 512 },
      layers: [{ id: "l1", name: "Layer 1" }],
      activeLayerId: "l1"
    });
    const result = deserializeDocument(minimal);
    expect(result).not.toBeNull();
    const layer = result!.layers[0];
    expect(layer.type).toBe("raster");
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.locked).toBe(false);
    expect(layer.effects).toEqual([]);
  });
});
