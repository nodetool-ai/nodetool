import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

jest.mock("../../../trpc/client", () =>
  jest.requireActual("../../../__mocks__/trpcClientMock")
);

import { trpcClient } from "../../../__mocks__/trpcClientMock";
import { createDefaultDocument, type HistoryEntry } from "../../../components/sketch/types";
import { useSketchStore } from "../../../components/sketch/state";
import { useAssetStore } from "../../AssetStore";
import { useNotificationStore } from "../../NotificationStore";
import { useStandaloneSketchDocument, useSketchDocumentStore } from "../SketchDocumentStore";
import { useSketchLayerBindingsStore } from "../SketchLayerBindingsStore";

const updateMutate = trpcClient.sketch.update.mutate as unknown as jest.Mock;

function buildHistoryEntry(layerId: string, data: string): HistoryEntry {
  return {
    layerSnapshots: { [layerId]: data },
    layerStructure: [
      {
        id: layerId,
        name: "Layer 1",
        type: "raster",
        visible: true,
        opacity: 1,
        locked: false,
        alphaLock: false,
        blendMode: "normal",
        transform: { x: 0, y: 0 },
        contentBounds: { x: 0, y: 0, width: 32, height: 32 },
        effects: []
      }
    ],
    documentCanvas: {
      width: 32,
      height: 32,
      backgroundColor: "#ffffff"
    },
    activeLayerId: layerId,
    maskLayerId: null,
    restoreMode: "full",
    action: "paint",
    timestamp: 1
  };
}

function buildResponse() {
  const doc = createDefaultDocument(32, 32);
  doc.canvas.backgroundColor = "#ffffff";
  return {
    id: "doc-1",
    projectId: "proj-1",
    name: "Sketch",
    width: 32,
    height: 32,
    backgroundColor: "#ffffff",
    document: {
      sketch: {
        ...doc,
        activeTool: "brush",
        viewport: { zoom: 1, pan: { x: 0, y: 0 } },
        history: [],
        historyIndex: -1
      },
      layerBindings: []
    },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };
}

describe("useStandaloneSketchDocument", () => {
  const originalCreateAsset = useAssetStore.getState().createAsset;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    updateMutate.mockReset();
    updateMutate.mockResolvedValue({
      ...buildResponse(),
      updatedAt: "2026-01-01T00:00:01Z"
    });
    useSketchStore.getState().resetDocument();
    useSketchLayerBindingsStore.getState().reset();
    useSketchDocumentStore.getState().reset();
    useNotificationStore.getState().clearNotifications();
    useAssetStore.setState({
      createAsset: jest.fn(async () => ({
        id: "asset-1",
        user_id: "user-1",
        parent_id: "",
        name: "layer.png",
        content_type: "image/png",
        workflow_id: null,
        created_at: "2026-01-01T00:00:00Z",
        get_url: null,
        thumb_url: null
      }))
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["layer"], { type: "image/png" })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    useAssetStore.setState({ createAsset: originalCreateAsset });
    global.fetch = originalFetch;
  });

  it("persists active tool, viewport, and history snapshots during autosave", async () => {
    renderHook(() => useStandaloneSketchDocument(buildResponse(), true));

    const layerId = useSketchStore.getState().document.layers[0]!.id;
    const historyEntry = buildHistoryEntry(
      layerId,
      "data:image/png;base64,AAAA"
    );

    act(() => {
      useSketchStore.setState((state) => ({
        ...state,
        activeTool: "eraser",
        zoom: 2.5,
        pan: { x: 10, y: -4 },
        history: [historyEntry],
        historyIndex: 0
      }));
    });

    act(() => {
      jest.advanceTimersByTime(800);
    });

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    const input = updateMutate.mock.calls[0][0] as {
      baseUpdatedAt?: string;
      document: { sketch: Record<string, unknown> };
    };
    expect(input.baseUpdatedAt).toBe("2026-01-01T00:00:00Z");
    expect(input.document.sketch.activeTool).toBe("eraser");
    expect(input.document.sketch.viewport).toEqual({
      zoom: 2.5,
      pan: { x: 10, y: -4 }
    });
    expect(input.document.sketch.historyIndex).toBe(0);
    expect(input.document.sketch.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "paint",
          layerSnapshots: { [layerId]: "data:image/png;base64,AAAA" }
        })
      ])
    );
  });

  it("externalizes oversized layer data into asset references before autosave", async () => {
    renderHook(() => useStandaloneSketchDocument(buildResponse(), true));

    const largeDataUrl = `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024, 1).toString("base64")}`;
    const layerId = useSketchStore.getState().document.layers[0]!.id;

    act(() => {
      useSketchStore.setState((state) => ({
        ...state,
        activeTool: "move",
        document: {
          ...state.document,
          layers: state.document.layers.map((layer) =>
            layer.id === layerId
              ? { ...layer, data: largeDataUrl }
              : layer
          )
        },
        history: [buildHistoryEntry(layerId, largeDataUrl)],
        historyIndex: 0
      }));
    });

    act(() => {
      jest.advanceTimersByTime(800);
    });

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));

    const createAsset = useAssetStore.getState().createAsset as unknown as jest.Mock;
    expect(createAsset).toHaveBeenCalledTimes(1);

    const input = updateMutate.mock.calls[0][0] as {
      document: { sketch: Record<string, unknown> };
    };
    const sketch = input.document.sketch as {
      layers: Array<Record<string, unknown>>;
      history: Array<Record<string, unknown>>;
    };
    expect(sketch.layers[0]?.data).toBeNull();
    expect(sketch.layers[0]?.imageReference).toEqual(
      expect.objectContaining({ uri: "asset://asset-1" })
    );
    expect(sketch.history[0]?.layerSnapshots).toEqual({
      [layerId]: "asset://asset-1"
    });
    expect(
      useNotificationStore
        .getState()
        .notifications.some((n) => n.content.includes("externalized"))
    ).toBe(true);
  });
});
