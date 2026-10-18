import { describe, expect, it } from "vitest";
import {
  computeCompositeOffset,
  fitImageRect,
  getAncestorGroupOpacityProduct,
  isLayerCompositeVisible,
  layerEffectsFilter,
  normalizeLayerEffects,
  normalizeLayerTransform,
  normalizeRenderDocument
} from "../src/render/index.js";

describe("normalizeLayerTransform", () => {
  it("keeps a canonical affine and fills missing fields with identity", () => {
    expect(normalizeLayerTransform({ kind: "affine", x: 3, scaleX: 2 })).toEqual({
      kind: "affine",
      x: 3,
      y: 0,
      scaleX: 2,
      scaleY: 1,
      rotation: 0
    });
    expect(normalizeLayerTransform(undefined)).toMatchObject({ kind: "affine", scaleX: 1 });
  });

  it("migrates legacy quad modes and the dual-quad payload", () => {
    const quad = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 }
    ];
    expect(normalizeLayerTransform({ mode: "warp", quad })).toMatchObject({
      kind: "quad",
      mode: "distort"
    });
    expect(normalizeLayerTransform({ mode: "perspective-distort", quad })).toMatchObject({
      mode: "perspective"
    });
    expect(normalizeLayerTransform({ kind: "dual-quad", quad })).toMatchObject({
      kind: "quad",
      mode: "perspective"
    });
    // An unknown mode or a malformed quad falls back to an affine.
    expect(normalizeLayerTransform({ mode: "twist", quad }).kind).toBe("affine");
    expect(normalizeLayerTransform({ mode: "distort", quad: quad.slice(0, 3) }).kind).toBe(
      "affine"
    );
  });
});

describe("normalizeLayerEffects", () => {
  it("renames legacy params and drops unknown effects", () => {
    expect(
      normalizeLayerEffects([
        { type: "hue_saturation", enabled: true, params: { hue: 30 } },
        { type: "exposure", enabled: true, params: { exposure: -1 } },
        { type: "glow", enabled: true, params: {} },
        "junk"
      ])
    ).toEqual([
      {
        type: "hue_saturation",
        enabled: true,
        params: { hueDegrees: 30, saturation: 0, lightness: 0 }
      },
      { type: "exposure", enabled: true, params: { exposureStops: -1 } }
    ]);
  });
});

describe("layerEffectsFilter", () => {
  it("chains the enabled effects that change anything, in stack order", () => {
    expect(
      layerEffectsFilter([
        { type: "brightness_contrast", enabled: true, params: { brightness: 0.5, contrast: 0 } },
        { type: "exposure", enabled: false, params: { exposureStops: 3 } },
        { type: "exposure", enabled: true, params: { exposureStops: 1 } }
      ])
    ).toBe("brightness(1.5) brightness(2)");
    expect(
      layerEffectsFilter([
        { type: "hue_saturation", enabled: true, params: { hueDegrees: 0, saturation: 0, lightness: 0 } }
      ])
    ).toBeNull();
  });
});

describe("normalizeRenderDocument", () => {
  it("reads the ImageDocumentData wrapper and applies the editor's layer defaults", () => {
    const doc = normalizeRenderDocument({
      sketch: {
        canvas: { width: 300, height: 200 },
        layers: [{ id: "a" }, { id: "b", type: "bogus", visible: false, opacity: 0.25, data: "" }],
        maskLayerId: "gone"
      },
      layerBindings: []
    });
    expect(doc.canvas).toEqual({ width: 300, height: 200 });
    expect(doc.maskLayerId).toBeNull();
    expect(doc.layers[0]).toMatchObject({
      id: "a",
      type: "raster",
      visible: true,
      opacity: 1,
      blendMode: "normal",
      data: null,
      contentBounds: { x: 0, y: 0, width: 300, height: 200 }
    });
    expect(doc.layers[1]).toMatchObject({ type: "raster", visible: false, opacity: 0.25 });
  });

  it("keeps an image reference's fit only when it is one the editor knows", () => {
    const doc = normalizeRenderDocument({
      layers: [
        { id: "a", imageReference: { uri: "asset://x.png", objectFit: "cover" } },
        { id: "b", imageReference: { uri: "asset://y.png", objectFit: "zoom" } },
        { id: "c", imageReference: { uri: "" } }
      ]
    });
    expect(doc.layers.map((layer) => layer.imageReference)).toEqual([
      { uri: "asset://x.png", objectFit: "cover" },
      { uri: "asset://y.png" },
      null
    ]);
  });
});

describe("group visibility and opacity", () => {
  const layers = [
    { id: "outer", type: "group", visible: true, opacity: 0.5, parentId: null },
    { id: "inner", type: "group", visible: true, opacity: 0.5, parentId: "outer" },
    { id: "leaf", type: "raster", visible: true, opacity: 1, parentId: "inner" },
    { id: "hidden", type: "group", visible: false, opacity: 1, parentId: null },
    { id: "under-hidden", type: "raster", visible: true, opacity: 1, parentId: "hidden" }
  ];
  const byId = (id: string) => layers.find((layer) => layer.id === id)!;

  it("multiplies every ancestor group's opacity", () => {
    expect(getAncestorGroupOpacityProduct(layers, byId("leaf"), null)).toBe(0.25);
    expect(getAncestorGroupOpacityProduct(layers, byId("leaf"), "leaf")).toBe(1);
  });

  it("hides a layer under a hidden group unless it is isolated", () => {
    expect(isLayerCompositeVisible(layers, byId("leaf"), null)).toBe(true);
    expect(isLayerCompositeVisible(layers, byId("under-hidden"), null)).toBe(false);
    expect(isLayerCompositeVisible(layers, byId("under-hidden"), "under-hidden")).toBe(true);
  });

  it("ends on a parent cycle instead of looping", () => {
    const cyclic = [
      { id: "a", type: "group", visible: true, opacity: 0.5, parentId: "b" },
      { id: "b", type: "group", visible: true, opacity: 0.5, parentId: "a" }
    ];
    expect(isLayerCompositeVisible(cyclic, cyclic[0]!, null)).toBe(true);
    expect(getAncestorGroupOpacityProduct(cyclic, cyclic[0]!, null)).toBeGreaterThan(0);
  });
});

describe("placement", () => {
  it("offsets an affine layer by its raster bounds and a quad by its extents", () => {
    const bounds = { x: 5, y: 7, width: 10, height: 10 };
    expect(
      computeCompositeOffset(
        { kind: "affine", x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 },
        bounds
      )
    ).toEqual({ x: 6, y: 9 });
    expect(
      computeCompositeOffset(
        {
          kind: "quad",
          mode: "distort",
          quad: [
            { x: 4, y: 9 },
            { x: 20, y: 3 },
            { x: 22, y: 30 },
            { x: 2, y: 28 }
          ]
        },
        bounds
      )
    ).toEqual({ x: 2, y: 3 });
  });

  it("fits an image the way an image reference asks", () => {
    expect(fitImageRect(20, 10, 40, 40, undefined)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
    expect(fitImageRect(20, 10, 40, 40, "fill")).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(fitImageRect(20, 10, 40, 40, "contain")).toEqual({ x: 0, y: 10, width: 40, height: 20 });
    expect(fitImageRect(20, 10, 40, 40, "cover")).toEqual({ x: -20, y: 0, width: 80, height: 40 });
  });
});
