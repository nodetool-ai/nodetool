import {
  getDefaultRasterBounds,
  serializeLayerData,
  deserializeLayerData,
  SERIALIZED_LAYER_DATA_PREFIX
} from "../layerIO";

describe("getDefaultRasterBounds", () => {
  it("rounds fractional coordinates", () => {
    const result = getDefaultRasterBounds({
      x: 10.4,
      y: 20.6,
      width: 100.3,
      height: 200.8
    });
    expect(result.x).toBe(10);
    expect(result.y).toBe(21);
    expect(result.width).toBe(100);
    expect(result.height).toBe(201);
  });

  it("clamps width and height to minimum of 1", () => {
    const result = getDefaultRasterBounds({
      x: 0,
      y: 0,
      width: 0,
      height: -5
    });
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it("preserves integer bounds", () => {
    const result = getDefaultRasterBounds({
      x: 10,
      y: 20,
      width: 100,
      height: 200
    });
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });
});

describe("serializeLayerData / deserializeLayerData round-trip", () => {
  const bounds = { x: 10, y: 20, width: 100, height: 200 };
  const fallbackBounds = { x: 0, y: 0, width: 512, height: 512 };

  it("round-trips image data and bounds", () => {
    const image = "data:image/png;base64,abc123";
    const serialized = serializeLayerData(image, bounds);
    expect(serialized.startsWith(SERIALIZED_LAYER_DATA_PREFIX)).toBe(true);

    const deserialized = deserializeLayerData(serialized, fallbackBounds);
    expect(deserialized.image).toBe(image);
    expect(deserialized.bounds).toEqual(
      getDefaultRasterBounds(bounds)
    );
  });

  it("round-trips null image", () => {
    const serialized = serializeLayerData(null, bounds);
    const deserialized = deserializeLayerData(serialized, fallbackBounds);
    expect(deserialized.image).toBeNull();
    expect(deserialized.bounds).toEqual(
      getDefaultRasterBounds(bounds)
    );
  });
});

describe("deserializeLayerData edge cases", () => {
  const fallback = { x: 0, y: 0, width: 512, height: 512 };

  it("returns null image and fallback bounds for null data", () => {
    const result = deserializeLayerData(null, fallback);
    expect(result.image).toBeNull();
    expect(result.bounds).toEqual(getDefaultRasterBounds(fallback));
  });

  it("returns null image and fallback bounds for empty string", () => {
    const result = deserializeLayerData("", fallback);
    expect(result.image).toBeNull();
  });

  it("treats non-prefixed data as legacy raw image", () => {
    const legacy = "data:image/png;base64,legacyContent";
    const result = deserializeLayerData(legacy, fallback);
    expect(result.image).toBe(legacy);
    expect(result.bounds).toEqual(getDefaultRasterBounds(fallback));
  });

  it("returns null image for malformed base64 payload", () => {
    const malformed = `${SERIALIZED_LAYER_DATA_PREFIX}!!!notbase64!!!`;
    const result = deserializeLayerData(malformed, fallback);
    expect(result.image).toBeNull();
    expect(result.bounds).toEqual(getDefaultRasterBounds(fallback));
  });
});
