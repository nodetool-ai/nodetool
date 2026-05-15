/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import { createDefaultDocument, makeAffineTransform, type LayerTransform } from "../types";
import {
  clearActiveLayerTransformPreview,
  resolveDisplayedActiveLayerTransform,
  setActiveLayerTransformPreview,
  useDisplayedActiveLayerTransform,
  type LayerTransformPreview
} from "../activeLayerTransform";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
    clearActiveLayerTransformPreview();
  });
});

describe("resolveDisplayedActiveLayerTransform", () => {
  it("uses the document transform when there is no preview", () => {
    const doc = createDefaultDocument(64, 64);
    const storedTransform: LayerTransform = makeAffineTransform({
      x: 12,
      y: 8,
      scaleX: 1.25,
      scaleY: 0.75,
      rotation: Math.PI / 6
    });
    doc.layers[0].transform = storedTransform;

    expect(resolveDisplayedActiveLayerTransform(doc, null)).toEqual(storedTransform);
  });

  it("uses the active layer preview transform when available", () => {
    const doc = createDefaultDocument(64, 64);
    doc.layers[0].transform = makeAffineTransform({});
    const preview: LayerTransformPreview = {
      layerId: doc.activeLayerId,
      transform: makeAffineTransform({
        x: 20,
        y: -4,
        scaleX: 1.4,
        scaleY: 0.9,
        rotation: Math.PI / 4
      })
    };

    expect(resolveDisplayedActiveLayerTransform(doc, preview)).toEqual(preview.transform);
  });

  it("ignores previews for non-active layers", () => {
    const doc = createDefaultDocument(64, 64);
    doc.layers[0].transform = makeAffineTransform({
      x: 3,
      y: 7,
      scaleX: 0.8,
      scaleY: 1.1,
      rotation: Math.PI / 8
    });
    const preview: LayerTransformPreview = {
      layerId: "other-layer",
      transform: makeAffineTransform({
        x: 50,
        y: 60,
        scaleX: 2,
        scaleY: 2,
        rotation: Math.PI / 2
      })
    };

    expect(resolveDisplayedActiveLayerTransform(doc, preview)).toEqual(
      doc.layers[0].transform
    );
  });
});

describe("useDisplayedActiveLayerTransform", () => {
  it("uses preview during active drag and falls back after clearing", () => {
    act(() => {
      useSketchStore.getState().resetDocument();
    });

    const { result } = renderHook(() => useDisplayedActiveLayerTransform());
    expect(result.current).toEqual(
      useSketchStore.getState().document.layers[0].transform
    );

    const previewTransform: LayerTransform = makeAffineTransform({
      x: 24,
      y: -6,
      scaleX: 1.5,
      scaleY: 0.8,
      rotation: Math.PI / 3
    });

    act(() => {
      setActiveLayerTransformPreview({
        layerId: useSketchStore.getState().document.activeLayerId,
        transform: previewTransform
      });
    });
    expect(result.current).toEqual(previewTransform);

    act(() => {
      clearActiveLayerTransformPreview();
    });
    expect(result.current).toEqual(
      useSketchStore.getState().document.layers[0].transform
    );
  });

  it("ignores preview updates for a different layer id", () => {
    const { result } = renderHook(() => useDisplayedActiveLayerTransform());
    const stored = useSketchStore.getState().document.layers[0].transform;

    act(() => {
      setActiveLayerTransformPreview({
        layerId: "different-layer",
        transform: makeAffineTransform({
          x: 100,
          y: 100,
          scaleX: 2,
          scaleY: 2,
          rotation: Math.PI / 2
        })
      });
    });

    expect(result.current).toEqual(stored);
  });
});
