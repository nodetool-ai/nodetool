/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useLayerHydration } from "../sketchCanvasHooks/useLayerHydration";
import type { DisplayFrameCoordinator } from "../sketchCanvasHooks/DisplayFrameCoordinator";
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

  it("marks hydration complete only after all async layer decodes finish", () => {
    const doc = createDefaultDocument(64, 64);
    doc.layers[0].data = "data:image/png;base64,layer-1";
    const extraLayer = {
      ...doc.layers[0],
      id: "layer-2",
      name: "Layer 2",
      data: "data:image/png;base64,layer-2"
    };
    doc.layers = [doc.layers[0], extraLayer];

    const setLayerDataCallbacks: Array<() => void> = [];
    const runtime = {
      deleteLayerCanvas: jest.fn(),
      setLayerData: jest.fn(
        (
          _layerId: string,
          _data: string | null,
          _bounds: unknown,
          onComplete?: () => void
        ) => {
          if (onComplete) {
            setLayerDataCallbacks.push(onComplete);
          }
        }
      )
    } as unknown as SketchRuntime;

    const layerCanvasesRef = {
      current: new Map<string, HTMLCanvasElement>()
    };
    const getOrCreateLayerCanvas = jest.fn((layerId: string) => {
      const canvas = window.document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      layerCanvasesRef.current.set(layerId, canvas);
      return canvas;
    });
    const invalidateLayer = jest.fn();
    const requestRedraw = jest.fn();
    const markHydrationComplete = jest.fn();
    const coordinatorRef = {
      current: { markHydrationComplete } as unknown as DisplayFrameCoordinator
    } as React.MutableRefObject<DisplayFrameCoordinator | null>;

    renderHook(() =>
      useLayerHydration({
        doc,
        runtime,
        layerCanvasesRef,
        runtimeRef: { current: runtime },
        getOrCreateLayerCanvas,
        invalidateLayer,
        requestRedraw,
        coordinatorRef
      })
    );

    expect(markHydrationComplete).not.toHaveBeenCalled();
    expect(setLayerDataCallbacks).toHaveLength(2);

    act(() => {
      setLayerDataCallbacks[0]();
    });
    expect(markHydrationComplete).not.toHaveBeenCalled();

    act(() => {
      setLayerDataCallbacks[1]();
    });
    expect(markHydrationComplete).toHaveBeenCalledTimes(1);
    expect(invalidateLayer).toHaveBeenCalledTimes(2);
    expect(requestRedraw).toHaveBeenCalledTimes(2);
  });
});
