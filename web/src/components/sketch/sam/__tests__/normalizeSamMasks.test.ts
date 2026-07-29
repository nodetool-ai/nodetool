/** @jest-environment node */
jest.mock("../../../node/output/hooks", () => ({
  resolveAssetUri: (uri: string | undefined | null) => uri ?? ""
}));

import { normalizeSamMasks } from "../normalizeSamMasks";

describe("normalizeSamMasks", () => {
  const baseParams = {
    backendId: "fal" as const,
    modelId: "sam-2",
    nodeType: "nodetool.segment.Sam"
  };

  it("extracts masks from a flat array of image refs", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: [
        { uri: "asset://mask1", width: 100, height: 200 },
        { uri: "asset://mask2", width: 100, height: 200 }
      ]
    });
    expect(result.masks).toHaveLength(2);
    expect(result.masks[0].maskDataUrl).toBe("asset://mask1");
    expect(result.masks[1].maskDataUrl).toBe("asset://mask2");
  });

  it("extracts masks from { output: [...] } wrapper", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: {
        output: [{ uri: "asset://m1", width: 64, height: 64 }]
      }
    });
    expect(result.masks).toHaveLength(1);
    expect(result.masks[0].id).toBe("mask_0");
  });

  it("extracts a single image ref as a one-element mask list", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: { uri: "asset://single", width: 50, height: 50 }
    });
    expect(result.masks).toHaveLength(1);
    expect(result.masks[0].maskDataUrl).toBe("asset://single");
  });

  it("skips entries with no resolvable URI", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: [{ width: 10, height: 10 }]
    });
    expect(result.masks).toHaveLength(0);
  });

  it("uses url field when uri is missing", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: [{ url: "https://example.com/mask.png", width: 32, height: 32 }]
    });
    expect(result.masks).toHaveLength(1);
    expect(result.masks[0].maskDataUrl).toBe("https://example.com/mask.png");
  });

  it("assigns sequential mask ids", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: [
        { uri: "a://1", width: 10, height: 10 },
        { uri: "a://2", width: 10, height: 10 },
        { uri: "a://3", width: 10, height: 10 }
      ]
    });
    expect(result.masks.map((m) => m.id)).toEqual([
      "mask_0",
      "mask_1",
      "mask_2"
    ]);
  });

  it("uses explicit label from entry", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: [
        { uri: "a://1", width: 10, height: 10, label: "Person" }
      ]
    });
    expect(result.masks[0].label).toBe("Person");
  });

  it("uses name field as fallback label", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: [
        { uri: "a://1", width: 10, height: 10, name: "Background" }
      ]
    });
    expect(result.masks[0].label).toBe("Background");
  });

  it("generates default label when none provided", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: [{ uri: "a://1", width: 10, height: 10 }]
    });
    expect(result.masks[0].label).toBe("Mask 1");
  });

  it("applies inverse scale to width and height", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      scale: 2,
      rawOutput: [{ uri: "a://1", width: 200, height: 100 }]
    });
    expect(result.masks[0].bounds.width).toBe(100);
    expect(result.masks[0].bounds.height).toBe(50);
  });

  it("falls back to sourceMetadata dimensions", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      sourceMetadata: {
        layerId: "layer-1",
        layerTransform: { kind: "affine" as const, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        contentBounds: { x: 0, y: 0, width: 300, height: 150 },
        canvasSize: { width: 300, height: 150 },
        documentOrigin: { x: 0, y: 0 }
      },
      rawOutput: [{ uri: "a://1" }]
    });
    expect(result.masks[0].bounds.width).toBe(300);
    expect(result.masks[0].bounds.height).toBe(150);
  });

  it("returns empty masks for non-array non-object input", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: "not an object"
    });
    expect(result.masks).toHaveLength(0);
  });

  it("returns empty masks for null input", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: null
    });
    expect(result.masks).toHaveLength(0);
  });

  it("propagates metadata fields to the response", () => {
    const result = normalizeSamMasks({
      ...baseParams,
      rawOutput: []
    });
    expect(result.modelId).toBe("sam-2");
    expect(result.backendId).toBe("fal");
    expect(result.nodeType).toBe("nodetool.segment.Sam");
  });
});
