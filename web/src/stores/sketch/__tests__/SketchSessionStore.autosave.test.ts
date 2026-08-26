import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import { asMock, installGlobal, stub } from "../../../test-utils/doubles";
import { act, renderHook, waitFor } from "@testing-library/react";

jest.mock("../../../trpc/client", () =>
  jest.requireActual("../../../__mocks__/trpcClientMock")
);

import { trpcClient } from "../../../__mocks__/trpcClientMock";
import { createDefaultDocument, type HistoryEntry } from "../../../components/sketch/types";
import { useSketchStore } from "../../../components/sketch/state";
import { useAssetStore } from "../../AssetStore";
import { useNotificationStore } from "../../NotificationStore";
import {
  renameSketchDocument,
  useStandaloneSketchDocument,
  useSketchSessionStore
} from "../SketchSessionStore";
import { fromPersistedSketchEditorState } from "../persistence";
import { getActiveSketchInstance } from "../SketchInstance";
import { handleDocumentResourceChange } from "../../documentSync";
import { useConflictStore } from "../../ConflictStore";

const updateMutate = asMock(trpcClient.sketch.update.mutate);
type StandaloneResponse = NonNullable<
  Parameters<typeof useStandaloneSketchDocument>[0]
>;

function buildHistoryEntry(layerId: string, data: string): HistoryEntry {
  return {
    layerSnapshots: { [layerId]: data },
    layerStructure: [
      {
        id: layerId,
        name: "Background",
        type: "raster",
        visible: true,
        opacity: 1,
        locked: false,
        alphaLock: false,
        blendMode: "normal",
        transform: { kind: "affine", x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
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

function buildResponse(): StandaloneResponse {
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
      sketch: stub<StandaloneResponse["document"]["sketch"]>({
        ...doc,
        toolSettings: { ...doc.toolSettings },
        activeTool: "brush",
        viewport: { zoom: 1, pan: { x: 0, y: 0 } },
        history: [],
        historyIndex: -1
      }),
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
    (updateMutate as any).mockResolvedValue({
      ...buildResponse(),
      updatedAt: "2026-01-01T00:00:01Z"
    });
    useSketchStore.getState().resetDocument();
    useSketchSessionStore.getState().reset();
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
    installGlobal(
      "fetch",
      jest.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["layer"], { type: "image/png" })
      }))
    );
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

    const createAsset = asMock(useAssetStore.getState().createAsset);
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

describe("renameSketchDocument", () => {
  beforeEach(() => {
    updateMutate.mockReset();
    (updateMutate as any).mockResolvedValue({
      ...buildResponse(),
      name: "Fox",
      updatedAt: "2026-01-01T00:00:02Z"
    });
    useSketchSessionStore.getState().reset();
  });

  it("sets the session name and persists it", async () => {
    const instance = getActiveSketchInstance();
    instance.session.getState().setLoadedDocument(
      { id: "doc-1", name: "Sketch", updatedAt: "2026-01-01T00:00:00Z" },
      "hash-1"
    );

    await renameSketchDocument(instance, "Fox");

    expect(instance.session.getState().name).toBe("Fox");
    expect(updateMutate).toHaveBeenCalledWith({
      id: "doc-1",
      name: "Fox",
      baseUpdatedAt: "2026-01-01T00:00:00Z"
    });
    expect(instance.session.getState().baseUpdatedAt).toBe(
      "2026-01-01T00:00:02Z"
    );
  });

  it("retries once after a concurrency conflict", async () => {
    const instance = getActiveSketchInstance();
    instance.session.getState().setLoadedDocument(
      { id: "doc-1", name: "Sketch", updatedAt: "2026-01-01T00:00:00Z" },
      "hash-1"
    );
    (updateMutate as any)
      .mockRejectedValueOnce(new Error("Document was modified (concurrent)"))
      .mockResolvedValueOnce({
        ...buildResponse(),
        name: "Fox",
        updatedAt: "2026-01-01T00:00:03Z"
      });

    await renameSketchDocument(instance, "Fox");

    expect(updateMutate).toHaveBeenCalledTimes(2);
    expect(instance.session.getState().name).toBe("Fox");
  });
});

describe("useStandaloneSketchDocument merge", () => {
  const originalCreateAsset = useAssetStore.getState().createAsset;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    updateMutate.mockReset();
    (updateMutate as any).mockResolvedValue({
      ...buildResponse(),
      updatedAt: "2026-01-01T00:00:01Z"
    });
    useSketchStore.getState().resetDocument();
    useSketchSessionStore.getState().reset();
    useConflictStore.setState({ byKey: {} });
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
    installGlobal(
      "fetch",
      jest.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["layer"], { type: "image/png" })
      }))
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    useAssetStore.setState({ createAsset: originalCreateAsset });
    global.fetch = originalFetch;
    useConflictStore.getState().clear("imagedocument:doc-1");
  });

  it("merges an external add_layer into a dirty draft — both layers present", async () => {
    const getQuery = trpcClient.sketch.get.query as unknown as {
      mockResolvedValue: (v: unknown) => void;
    };
    const initial = buildResponse();
    getQuery.mockResolvedValue(initial);

    renderHook(() => useStandaloneSketchDocument(initial, true));

    // Simulate hydration: the editor holds this exact document.
    act(() => {
      useSketchStore.getState().setDocument(
        JSON.parse(JSON.stringify(initial.document.sketch))
      );
    });

    // The user paints on layer A; the draft is dirty.
    act(() => {
      useSketchStore.getState().updateLayerData(
        useSketchStore.getState().document.layers[0]!.id,
        "data:image/png;base64,BBBB"
      );
    });

    // An agent adds Layer B and saves the document elsewhere.
    // The agent edits the row that was just read, so layer A keeps its id.
    const layerA = JSON.parse(
      JSON.stringify(initial.document.sketch.layers[0])
    );
    const layerB = { ...layerA, id: "layer_agent_b", name: "Layer B" };
    getQuery.mockResolvedValue({
      ...initial,
      updatedAt: "2026-01-01T00:05:00Z",
      document: {
        sketch: { ...initial.document.sketch, layers: [layerA, layerB] },
        layerBindings: []
      }
    });

    await act(async () => {
      handleDocumentResourceChange("imagedocument", {
        event: "updated",
        id: "doc-1",
        updatedAt: "2026-01-01T00:05:00Z",
        ops: [{ tool: "add_layer", input: { name: "Layer B" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const layers = useSketchStore.getState().document.layers;
    expect(layers.map((l) => l.name)).toEqual(["Background", "Layer B"]);
    // The dirty stroke survives the merge.
    expect(layers.find((l) => l.name === "Background")?.data).toBe(
      "data:image/png;base64,BBBB"
    );
    // The token rolled onto the external write's revision.
    expect(useSketchSessionStore.getState().baseUpdatedAt).toBe(
      "2026-01-01T00:05:00Z"
    );
    // No conflicts — the write touched only the new layer.
    expect(
      useConflictStore.getState().byKey["imagedocument:doc-1"]
    ).toBeUndefined();

    // The merged result autosaves on top of the new revision.
    act(() => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    const lastCall = updateMutate.mock.calls[
      updateMutate.mock.calls.length - 1
    ][0] as {
      baseUpdatedAt?: string;
      document: { sketch: { layers: { name?: string }[] } };
    };
    expect(lastCall.baseUpdatedAt).toBe("2026-01-01T00:05:00Z");
    expect(lastCall.document.sketch.layers.map((l) => l.name)).toEqual([
      "Background",
      "Layer B"
    ]);
  });

  it("keeps a dirty stroke over an external edit to the same layer and lists it", async () => {
    const getQuery = trpcClient.sketch.get.query as unknown as {
      mockResolvedValue: (v: unknown) => void;
    };
    const initial = buildResponse();
    getQuery.mockResolvedValue(initial);

    renderHook(() => useStandaloneSketchDocument(initial, true));

    // Simulate hydration: the editor holds this exact document.
    act(() => {
      useSketchStore.getState().setDocument(
        JSON.parse(JSON.stringify(initial.document.sketch))
      );
    });

    act(() => {
      useSketchStore.getState().updateLayerData(
        useSketchStore.getState().document.layers[0]!.id,
        "data:image/png;base64,DRAFT"
      );
    });

    // The agent rewrote the same layer's pixels (same id — it edits the row
    // the editor last read).
    const agentLayer = JSON.parse(
      JSON.stringify(initial.document.sketch.layers[0])
    );
    agentLayer.data = "data:image/png;base64,AGENT";
    getQuery.mockResolvedValue({
      ...initial,
      updatedAt: "2026-01-01T00:06:00Z",
      document: {
        sketch: { ...initial.document.sketch, layers: [agentLayer] },
        layerBindings: []
      }
    });

    await act(async () => {
      handleDocumentResourceChange("imagedocument", {
        event: "updated",
        id: "doc-1",
        updatedAt: "2026-01-01T00:06:00Z",
        ops: [
          {
            tool: "set_layer_props",
            input: { target: useSketchStore.getState().document.layers[0]!.id }
          }
        ]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The draft wins; the refused value is offered in the banner.
    expect(useSketchStore.getState().document.layers[0]?.data).toBe(
      "data:image/png;base64,DRAFT"
    );
    const conflicts =
      useConflictStore.getState().byKey["imagedocument:doc-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ reason: "edited" });
    expect(conflicts[0].external).toMatchObject({
      data: "data:image/png;base64,AGENT"
    });
  });

  it("does not contest an untouched layer that only differs by persist defaults", async () => {
    const getQuery = trpcClient.sketch.get.query as unknown as {
      mockResolvedValue: (v: unknown) => void;
    };
    const initial = buildResponse();
    const layerA = initial.document.sketch.layers[0]! as {
      id: string;
      name: string;
      data: unknown;
    };
    const layerB = { ...layerA, id: "layer_b", name: "Layer B" };
    const sparse = (layer: { id: string; name: string; data: unknown }) => ({
      id: layer.id,
      name: layer.name,
      data: layer.data
    });
    const sparseSketch = {
      ...initial.document.sketch,
      layers: [sparse(layerA), sparse(layerB)]
    };
    const response = {
      ...initial,
      document: { sketch: sparseSketch, layerBindings: [] }
    };
    getQuery.mockResolvedValue(response);

    renderHook(() => useStandaloneSketchDocument(response, true));

    const normalized = fromPersistedSketchEditorState(sparseSketch);
    act(() => {
      useSketchStore.getState().setDocument(normalized.document);
    });
    const layerAId = normalized.document.layers[0]!.id;
    act(() => {
      useSketchStore.getState().updateLayerData(
        layerAId,
        "data:image/png;base64,DRAFT"
      );
    });

    getQuery.mockResolvedValue({
      ...response,
      updatedAt: "2026-01-01T00:07:00Z",
      document: {
        sketch: {
          ...sparseSketch,
          layers: [
            sparse(layerA),
            { ...sparse(layerB), data: "data:image/png;base64,AGENT" }
          ]
        },
        layerBindings: []
      }
    });

    await act(async () => {
      handleDocumentResourceChange("imagedocument", {
        event: "updated",
        id: "doc-1",
        updatedAt: "2026-01-01T00:07:00Z",
        ops: [{ tool: "set_layer_props", input: { target: "layer_b" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const layers = useSketchStore.getState().document.layers;
    expect(layers.find((l) => l.id === layerAId)?.data).toBe(
      "data:image/png;base64,DRAFT"
    );
    expect(layers.find((l) => l.id === "layer_b")?.data).toBe(
      "data:image/png;base64,AGENT"
    );
    expect(
      useConflictStore.getState().byKey["imagedocument:doc-1"]
    ).toBeUndefined();
  });

  // Undo after a merge (ADR 0001): Cmd-Z reverts the user's own edits only.
  // It must never revert — and then autosave away — an external write.
  describe("undo after a merge", () => {
    const getQuery = (): { mockResolvedValue: (v: unknown) => void } =>
      trpcClient.sketch.get.query as unknown as {
        mockResolvedValue: (v: unknown) => void;
      };

    // The response type erases the persisted layer shape to `{}`; these tests
  // address layers by id.
  interface FixtureLayer {
    id: string;
    name: string;
    data: string | null;
    opacity: number;
  }
  const firstLayer = (response: StandaloneResponse): FixtureLayer =>
    // SAFETY: the fixture comes from `createDefaultDocument`, whose layers
    // carry all four fields.
    response.document.sketch.layers[0] as unknown as FixtureLayer;

  /** Hydrate the editor with `response`, then check point a baseline. */
    const hydrate = (response: StandaloneResponse): void => {
      renderHook(() => useStandaloneSketchDocument(response, true));
      act(() => {
        useSketchStore
          .getState()
          .setDocument(
            fromPersistedSketchEditorState(response.document.sketch).document
          );
        useSketchStore.getState().pushHistory("baseline");
      });
    };

    const notifyMerge = async (
      updatedAt: string,
      ops: { tool: string; input: Record<string, unknown> }[]
    ): Promise<void> => {
      await act(async () => {
        handleDocumentResourceChange("imagedocument", {
          event: "updated",
          id: "doc-1",
          updatedAt,
          ops
        });
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    it("reverts the user's stroke but keeps an externally added layer", async () => {
      const initial = buildResponse();
      getQuery().mockResolvedValue(initial);
      hydrate(initial);

      const layerA = firstLayer(initial);
      const before = useSketchStore.getState().document.layers[0]!.data;
      act(() => {
        useSketchStore
          .getState()
          .updateLayerData(layerA.id, "data:image/png;base64,DRAFT");
      });

      // The agent puts its layer *under* A, so an entry that appends the
      // absorbed layer instead of placing it lands in the wrong order.
      const layerB = { ...layerA, id: "layer_agent_b", name: "Layer B" };
      getQuery().mockResolvedValue({
        ...initial,
        updatedAt: "2026-01-01T00:10:00Z",
        document: {
          sketch: { ...initial.document.sketch, layers: [layerB, layerA] },
          layerBindings: []
        }
      });
      await notifyMerge("2026-01-01T00:10:00Z", [
        { tool: "add_layer", input: { name: "Layer B" } }
      ]);

      act(() => {
        useSketchStore.getState().undo();
      });

      const layers = useSketchStore.getState().document.layers;
      expect(layers.map((l) => l.id)).toEqual(["layer_agent_b", layerA.id]);
      expect(layers.find((l) => l.id === layerA.id)?.data).toBe(before);
    });

    it("keeps an externally removed layer removed", async () => {
      const base = buildResponse();
      const layerA = firstLayer(base);
      const layerC = { ...layerA, id: "layer_c", name: "Layer C" };
      const start = {
        ...base,
        document: {
          sketch: { ...base.document.sketch, layers: [layerA, layerC] },
          layerBindings: []
        }
      };
      getQuery().mockResolvedValue(start);
      hydrate(start);

      // The user paints on A; C is untouched.
      act(() => {
        useSketchStore
          .getState()
          .updateLayerData(layerA.id, "data:image/png;base64,DRAFT");
      });

      getQuery().mockResolvedValue({
        ...start,
        updatedAt: "2026-01-01T00:11:00Z",
        document: {
          sketch: { ...base.document.sketch, layers: [layerA] },
          layerBindings: []
        }
      });
      await notifyMerge("2026-01-01T00:11:00Z", [
        { tool: "remove_layer", input: { target: "layer_c" } }
      ]);
      expect(
        useSketchStore.getState().document.layers.map((l) => l.id)
      ).toEqual([layerA.id]);

      act(() => {
        useSketchStore.getState().undo();
      });

      expect(
        useSketchStore.getState().document.layers.map((l) => l.id)
      ).toEqual([layerA.id]);
    });

    it("keeps externally set props on a layer the user never touched", async () => {
      const base = buildResponse();
      const layerA = firstLayer(base);
      const layerD = { ...layerA, id: "layer_d", name: "Layer D" };
      const start = {
        ...base,
        document: {
          sketch: { ...base.document.sketch, layers: [layerA, layerD] },
          layerBindings: []
        }
      };
      getQuery().mockResolvedValue(start);
      hydrate(start);

      act(() => {
        useSketchStore
          .getState()
          .updateLayerData(layerA.id, "data:image/png;base64,DRAFT");
      });

      getQuery().mockResolvedValue({
        ...start,
        updatedAt: "2026-01-01T00:12:00Z",
        document: {
          sketch: {
            ...base.document.sketch,
            layers: [layerA, { ...layerD, opacity: 0.25 }]
          },
          layerBindings: []
        }
      });
      await notifyMerge("2026-01-01T00:12:00Z", [
        { tool: "set_layer_props", input: { target: "layer_d", opacity: 0.25 } }
      ]);
      expect(
        useSketchStore
          .getState()
          .document.layers.find((l) => l.id === "layer_d")?.opacity
      ).toBe(0.25);

      act(() => {
        useSketchStore.getState().undo();
      });

      expect(
        useSketchStore
          .getState()
          .document.layers.find((l) => l.id === "layer_d")?.opacity
      ).toBe(0.25);
    });

    // The engine drops an external reorder (merged order follows the draft),
    // so this guards that undo does not reintroduce a different order.
    it("keeps the merged layer order across an external reorder", async () => {
      const base = buildResponse();
      const layerA = firstLayer(base);
      const layerD = { ...layerA, id: "layer_d", name: "Layer D" };
      const start = {
        ...base,
        document: {
          sketch: { ...base.document.sketch, layers: [layerA, layerD] },
          layerBindings: []
        }
      };
      getQuery().mockResolvedValue(start);
      hydrate(start);

      act(() => {
        useSketchStore
          .getState()
          .updateLayerData(layerA.id, "data:image/png;base64,DRAFT");
      });

      getQuery().mockResolvedValue({
        ...start,
        updatedAt: "2026-01-01T00:13:00Z",
        document: {
          sketch: { ...base.document.sketch, layers: [layerD, layerA] },
          layerBindings: []
        }
      });
      await notifyMerge("2026-01-01T00:13:00Z", [
        { tool: "reorder_layer", input: { target: "layer_d", index: 0 } }
      ]);
      const merged = useSketchStore
        .getState()
        .document.layers.map((l) => l.id);

      act(() => {
        useSketchStore.getState().undo();
      });

      expect(
        useSketchStore.getState().document.layers.map((l) => l.id)
      ).toEqual(merged);
    });
  });

  it("does not autosave a replaced resize over the user's draft", async () => {
    const getQuery = trpcClient.sketch.get.query as unknown as {
      mockResolvedValue: (v: unknown) => void;
    };
    const initial = buildResponse();
    getQuery.mockResolvedValue(initial);

    renderHook(() => useStandaloneSketchDocument(initial, true));
    act(() => {
      useSketchStore.getState().setDocument(
        JSON.parse(JSON.stringify(initial.document.sketch))
      );
    });
    act(() => {
      useSketchStore.getState().updateLayerData(
        useSketchStore.getState().document.layers[0]!.id,
        "data:image/png;base64,DRAFT"
      );
    });

    getQuery.mockResolvedValue({
      ...initial,
      updatedAt: "2026-01-01T00:08:00Z",
      document: {
        sketch: {
          ...initial.document.sketch,
          canvas: { ...initial.document.sketch.canvas, width: 64, height: 64 }
        },
        layerBindings: []
      }
    });

    await act(async () => {
      handleDocumentResourceChange("imagedocument", {
        event: "updated",
        id: "doc-1",
        updatedAt: "2026-01-01T00:08:00Z",
        ops: [{ tool: "resize_canvas", input: { width: 64, height: 64 } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const conflicts =
      useConflictStore.getState().byKey["imagedocument:doc-1"]?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe("replaced");

    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("moves the selection off a layer removed elsewhere", async () => {
    const getQuery = trpcClient.sketch.get.query as unknown as {
      mockResolvedValue: (v: unknown) => void;
    };
    const initial = buildResponse();
    const layerA = JSON.parse(
      JSON.stringify(initial.document.sketch.layers[0])
    ) as { id: string; name: string };
    const layerB = { ...layerA, id: "layer_b", name: "Layer B" };
    // The editor opened with two layers and Layer B selected.
    const twoLayers = {
      ...initial,
      document: {
        sketch: {
          ...initial.document.sketch,
          layers: [layerA, layerB],
          activeLayerId: layerB.id
        },
        layerBindings: []
      }
    };
    getQuery.mockResolvedValue(twoLayers);

    renderHook(() =>
      useStandaloneSketchDocument(twoLayers as StandaloneResponse, true)
    );
    act(() => {
      useSketchStore.getState().setDocument(
        JSON.parse(JSON.stringify(twoLayers.document.sketch))
      );
    });

    // The user paints on Layer A, so the draft is dirty and merges instead of
    // reloading.
    act(() => {
      useSketchStore
        .getState()
        .updateLayerData(layerA.id, "data:image/png;base64,DRAFT");
    });

    // The agent deletes the selected layer.
    getQuery.mockResolvedValue({
      ...twoLayers,
      updatedAt: "2026-01-01T00:09:00Z",
      document: {
        sketch: { ...twoLayers.document.sketch, layers: [layerA] },
        layerBindings: []
      }
    });

    await act(async () => {
      handleDocumentResourceChange("imagedocument", {
        event: "updated",
        id: "doc-1",
        updatedAt: "2026-01-01T00:09:00Z",
        ops: [{ tool: "remove_layer", input: { target: layerB.id } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const document = useSketchStore.getState().document;
    expect(document.layers.map((l) => l.id)).toEqual([layerA.id]);
    // The selection must name a layer that still exists.
    expect(document.activeLayerId).toBe(layerA.id);
  });
});
