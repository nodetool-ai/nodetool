import { act, renderHook } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import type { SketchCanvasRef } from "../SketchCanvas";
import { useTransformActions } from "../hooks/useTransformActions";
import { createSketchStore } from "../state/useSketchStore";
import {
  createVectorLayer,
  getVectorSource,
  prepareVectorSvg
} from "../vectorLayer";
import { deserializeDocument, serializeDocument } from "../serialization";
import { layerAllowsTransformWhilePixelLocked } from "../types";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><text x="5" y="20">Café 海</text><path d="M0 0L100 70" stroke="red"/></svg>';

describe("vector layers", () => {
  it("retains SVG and Unicode through document save and load", () => {
    const store = createSketchStore();
    const id = store.getState().addVectorLayer("Title", svg);
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    const loaded = deserializeDocument(
      serializeDocument(store.getState().document)
    );
    const layer = loaded?.layers.find((entry) => entry.id === id);
    expect(layer).toMatchObject({
      type: "vector",
      locked: true,
      contentBounds: { width: 120, height: 80 }
    });
    expect(getVectorSource(layer!)).toContain("Café 海");
    expect(getVectorSource(layer!)).toContain('<path d="M0 0L100 70"');
    expect(layerAllowsTransformWhilePixelLocked(layer!)).toBe(true);
  });

  it("undoes and redoes import, source editing, and explicit rasterization", () => {
    const store = createSketchStore();
    const id = store.getState().addVectorLayer("Title", svg);
    const original = store.getState().document.layers.at(-1)!;
    store.getState().undo();
    expect(
      store.getState().document.layers.some((layer) => layer.id === id)
    ).toBe(false);
    store.getState().redo();
    expect(store.getState().document.layers.at(-1)?.data).toBe(original.data);
    store
      .getState()
      .setVectorLayerSource(id, svg.replace("Café 海", "New title"));
    const edited = store.getState().document.layers.at(-1)!;
    expect(getVectorSource(edited)).toContain("New title");
    store.getState().undo();
    expect(store.getState().document.layers.at(-1)?.data).toBe(original.data);
    store.getState().redo();
    store
      .getState()
      .rasterizeVectorLayer(id, "data:image/png;base64,AA==", edited.data);
    expect(store.getState().document.layers.at(-1)).toMatchObject({
      type: "raster",
      locked: false
    });
    store.getState().undo();
    expect(store.getState().document.layers.at(-1)).toMatchObject({
      type: "vector",
      data: edited.data
    });
    store.getState().redo();
    expect(store.getState().document.layers.at(-1)?.type).toBe("raster");
  });

  it("protects source from raster readbacks and stale conversions", () => {
    const store = createSketchStore();
    const id = store.getState().addVectorLayer("Title", svg);
    const original = store.getState().document.layers.at(-1)!;
    store.getState().updateLayerData(id, "data:image/png;base64,AA==");
    expect(store.getState().document.layers.at(-1)?.data).toBe(original.data);
    store
      .getState()
      .setVectorLayerSource(id, svg.replace("Café 海", "Changed"));
    expect(() =>
      store.getState().rasterizeVectorLayer(id, "png", original.data)
    ).toThrow("changed");
    store.getState().duplicateLayer(id);
    expect(store.getState().document.layers.at(-1)).toMatchObject({
      type: "vector",
      locked: true
    });
  });

  it("removes executable markup and external resources while preserving local gradients", () => {
    const source = prepareVectorSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80" onload="alert(1)"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><image href="https://example.com/a.png"/><style>@import "https://example.com/a.css";</style><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><rect width="100" height="80" fill="url(#g)"/><use href="https://example.com/a.svg#x"/></svg>'
    ).source;
    expect(source).not.toMatch(
      /script|onload|foreignObject|https:\/\/example|@import/
    );
    expect(source).toContain('fill="url(#g)"');
    expect(source).toContain("linearGradient");
  });

  it.each(["not svg", "<svg><path></svg>", '<svg width="999999"/>'])(
    "rejects invalid SVG: %s",
    (source) => {
      expect(() => createVectorLayer("Invalid", source)).toThrow();
    }
  );
});

it("renders transformed vector geometry from the SVG image, not its sampling buffer", async () => {
  const { drawWithTransform } = await import("../rendering/canvas2d/composite");
  const { setVectorSource } = await import("../rendering/vectorSource");
  const canvas = document.createElement("canvas");
  canvas.width = 120;
  canvas.height = 80;
  const image = new Image();
  setVectorSource(canvas, image);
  const context = document.createElement("canvas").getContext("2d")!;
  const draw = jest
    .spyOn(context, "drawImage")
    .mockImplementation(() => undefined);
  const layer = createVectorLayer("Title", svg);
  layer.transform = {
    kind: "affine",
    x: 30,
    y: 40,
    scaleX: 4,
    scaleY: 4,
    rotation: 0
  };
  drawWithTransform(context, canvas, { x: 30, y: 40 }, layer);
  expect(draw).toHaveBeenCalledWith(image, -60, -40, 120, 80);
  draw.mockClear();
  drawWithTransform(
    context,
    canvas,
    { x: 30, y: 40 },
    { ...layer, type: "raster" }
  );
  expect(draw).toHaveBeenCalledWith(canvas, -60, -40);
});


it("commits and undoes a vector transform without baking its pixels", () => {
  const store = createSketchStore();
  const id = store.getState().addVectorLayer("Title", svg);
  const original = store.getState().document.layers.at(-1)!;
  store.getState().pushHistory("before transform");
  store.getState().setLayerTransform(id, {
    kind: "affine", x: 40, y: 20, scaleX: 3, scaleY: 3, rotation: 0.2
  });
  const bake = jest.fn();
  const { result } = renderHook(() => useTransformActions({
    ...store.getState(),
    canvasRef: { current: stub<SketchCanvasRef>({ reconcileLayerToDocumentSpace: bake }) },
    syncSketchOutputsNow: jest.fn()
  }));
  act(() => { result.current.handleTransformCommit(); });
  expect(bake).not.toHaveBeenCalled();
  expect(store.getState().document.layers.at(-1)).toMatchObject({
    data: original.data, type: "vector", transform: { scaleX: 3, x: 40 }
  });
  store.getState().undo();
  expect(store.getState().document.layers.at(-1)).toMatchObject({
    data: original.data, type: "vector", transform: original.transform
  });
});
