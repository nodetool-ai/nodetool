import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import { renderHook, act } from "@testing-library/react";

import { createDefaultDocument } from "../types";
import { useCanvasGeometryActions } from "../hooks/useCanvasGeometryActions";

describe("asset import", () => {
  const originalFetch = global.fetch;
  const originalCreateImageBitmap = global.createImageBitmap;

  beforeEach(() => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["image"], { type: "image/png" })
    })) as unknown as typeof fetch;
    global.createImageBitmap = jest.fn(async () => ({
      width: 64,
      height: 48,
      close: jest.fn()
    })) as typeof createImageBitmap;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.createImageBitmap = originalCreateImageBitmap;
  });

  it("creates a locked imported layer from a dropped asset", async () => {
    const document = createDefaultDocument(32, 32);
    document.canvas.backgroundColor = "#ffffff";
    const setDocument = jest.fn();
    const pushHistory = jest.fn();

    const { result } = renderHook(() =>
      useCanvasGeometryActions({
        canvasRef: { current: null },
        document,
        pushHistory,
        updateLayerData: jest.fn(),
        setDocument,
        setZoom: jest.fn(),
        setPan: jest.fn(),
        resizeCanvas: jest.fn(),
        offsetAllPaintLayersTransform: jest.fn(),
        commitPixelLayerChange: jest.fn(),
        syncPixelLayerFromCanvas: (() => null) as (
          layerId: string
        ) => string | null,
        reconcileAllLayerTransforms: jest.fn(),
        syncSketchOutputsNow: jest.fn()
      })
    );

    await act(async () => {
      await result.current.handleDropAsset({
        id: "asset-1",
        user_id: "user-1",
        parent_id: "",
        name: "Reference",
        content_type: "image/png",
        workflow_id: null,
        created_at: "2026-01-01T00:00:00Z",
        get_url: "/api/storage/asset-1",
        thumb_url: null
      });
    });

    expect(pushHistory).toHaveBeenCalledWith("import asset");
    expect(setDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        activeLayerId: expect.any(String),
        layers: expect.arrayContaining([
          expect.objectContaining({
            name: "Reference",
            locked: true,
            imageReference: expect.objectContaining({
              uri: "asset://asset-1",
              naturalWidth: 64,
              naturalHeight: 48,
              objectFit: "fill"
            })
          })
        ])
      })
    );
  });
});
