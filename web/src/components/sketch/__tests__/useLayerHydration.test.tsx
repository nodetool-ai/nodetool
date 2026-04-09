/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook } from "@testing-library/react";
import { useLayerHydration } from "../sketchCanvasHooks/useLayerHydration";
import { createDefaultDocument } from "../types";
import type { SketchRuntime } from "../rendering";

describe("useLayerHydration", () => {
  it("hydrates image-backed layers from imageReference uri when layer data is null", () => {
    const doc = createDefaultDocument(64, 64);
    const layer = doc.layers[0];
    layer.locked = true;
    layer.data = null;
    layer.imageReference = {
      uri: "https://example.com/source.png",
      naturalWidth: 64,
      naturalHeight: 64,
      objectFit: "fill"
    };

    const runtime = {
      deleteLayerCanvas: jest.fn(),
      setLayerData: jest.fn(),
    } as unknown as SketchRuntime;

    const layerCanvasesRef = {
      current: new Map<string, HTMLCanvasElement>()
    };

    const getOrCreateLayerCanvas = jest.fn(() => {
      const canvas = window.document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      layerCanvasesRef.current.set(layer.id, canvas);
      return canvas;
    });

    renderHook(() =>
      useLayerHydration({
        doc,
        runtime,
        layerCanvasesRef,
        runtimeRef: { current: runtime },
        getOrCreateLayerCanvas,
        invalidateLayer: jest.fn(),
        requestRedraw: jest.fn()
      })
    );

    expect((runtime.setLayerData as jest.Mock)).toHaveBeenCalledWith(
      layer.id,
      layer.imageReference.uri,
      expect.any(Object),
      expect.any(Function)
    );
  });

  it("resolves asset-backed imageReference uris before hydrating locked input layers", () => {
    const doc = createDefaultDocument(64, 64);
    const layer = doc.layers[0];
    layer.locked = true;
    layer.data = null;
    layer.imageReference = {
      uri: "asset://input-layer.png",
      naturalWidth: 64,
      naturalHeight: 64,
      objectFit: "fill"
    };

    const runtime = {
      deleteLayerCanvas: jest.fn(),
      setLayerData: jest.fn(),
    } as unknown as SketchRuntime;

    const layerCanvasesRef = {
      current: new Map<string, HTMLCanvasElement>()
    };

    const getOrCreateLayerCanvas = jest.fn(() => {
      const canvas = window.document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      layerCanvasesRef.current.set(layer.id, canvas);
      return canvas;
    });

    renderHook(() =>
      useLayerHydration({
        doc,
        runtime,
        layerCanvasesRef,
        runtimeRef: { current: runtime },
        getOrCreateLayerCanvas,
        invalidateLayer: jest.fn(),
        requestRedraw: jest.fn()
      })
    );

    expect((runtime.setLayerData as jest.Mock)).toHaveBeenCalledWith(
      layer.id,
      "/api/storage/input-layer.png",
      expect.any(Object),
      expect.any(Function)
    );
  });
});
