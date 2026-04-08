/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";
import { createDefaultDocument } from "../types";
import { useCompositing } from "../sketchCanvasHooks/useCompositing";

const requestRedrawMock = jest.fn();
const compositeToDisplayMock = jest.fn();

jest.mock("../sketchCanvasHooks/useRuntimeBootstrap", () => ({
  useRuntimeBootstrap: jest.fn(() => ({
    runtimeRef: { current: { dispose: jest.fn() } },
    runtime: { dispose: jest.fn() },
    backend: "canvas2d",
    bootstrapPhaseActive: false
  }))
}));

jest.mock("../sketchCanvasHooks/useTransformPreviewComposite", () => ({
  useTransformPreviewComposite: jest.fn(() => ({
    compositeToDisplay: compositeToDisplayMock,
    transformPreviewSignature: ""
  }))
}));

jest.mock("../sketchCanvasHooks/useRedrawScheduler", () => ({
  useRedrawScheduler: jest.fn(() => ({
    redrawRequestRef: { current: null },
    redraw: jest.fn(),
    redrawDirty: jest.fn(),
    requestRedraw: requestRedrawMock,
    requestDirtyRedraw: jest.fn(),
    drainPendingStrokeCommit: jest.fn()
  }))
}));

jest.mock("../sketchCanvasHooks/useLayerHydration", () => ({
  useLayerHydration: jest.fn(() => ({
    layerHydrationSignature: "",
    layerDisplayStackSignature: "",
    hydratedLayerStateRef: { current: new Map() },
    layerStableRasterSizeRef: { current: new Map() }
  }))
}));

describe("useCompositing", () => {
  beforeEach(() => {
    requestRedrawMock.mockClear();
    compositeToDisplayMock.mockClear();
  });

  it("requests redraw immediately when zoom changes", () => {
    jest.useFakeTimers();

    const doc = createDefaultDocument(64, 64);
    const activeStrokeRef = { current: null };
    const { rerender } = renderHook(
      ({ zoom }) =>
        useCompositing({
          doc,
          zoom,
          isolatedLayerId: null,
          activeStrokeRef
        }),
      {
        initialProps: { zoom: 1 }
      }
    );

    requestRedrawMock.mockClear();

    rerender({ zoom: 2 });

    expect(requestRedrawMock).toHaveBeenCalledTimes(1);

    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });
});
