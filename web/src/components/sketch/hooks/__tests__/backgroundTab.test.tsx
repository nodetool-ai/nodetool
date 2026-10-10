/**
 * @jest-environment jsdom
 *
 * Every open image tab stays mounted, and the agent's `ui_sketch_*` tools
 * address a document by id, so a crop, merge or flatten can run on a tab the
 * creator is not looking at. A paste also waits on the system clipboard, which
 * can show a permission prompt, and an asset drop waits on a download. Reading
 * the document through `useSketchStore.getState()` there resolved to the
 * focused tab, not the tab the action belongs to.
 */
import React, { type RefObject } from "react";
import { act, render, renderHook } from "@testing-library/react";

let resolveClipboard: (canvas: HTMLCanvasElement | null) => void = () => {};
jest.mock("../../sketchClipboard", () => {
  const actual = jest.requireActual("../../sketchClipboard");
  return {
    ...actual,
    resolveSketchPasteImageCanvas: () =>
      new Promise<HTMLCanvasElement | null>((resolve) => {
        resolveClipboard = resolve;
      })
  };
});

import { stub } from "../../../../test-utils/doubles";
import { useCanvasGeometryActions } from "../useCanvasGeometryActions";
import { useLayerActions } from "../useLayerActions";
import { useCanvasImperativeHandle } from "../../sketchCanvasHooks/useCanvasImperativeHandle";
import type { SketchRuntime } from "../../rendering";
import type { SketchCanvasRef } from "../../SketchCanvas";
import type { Asset } from "../../../../stores/ApiTypes";
import {
  SketchProvider,
  createSketchInstance,
  type SketchInstance
} from "../../../../stores/sketch/SketchInstance";
import { createDefaultDocument, createDefaultLayer } from "../../types";

const seedTab = (
  width: number,
  layerNames: string[]
): { tab: SketchInstance; layerIds: string[] } => {
  const tab = createSketchInstance();
  const layers = layerNames.map((name) =>
    createDefaultLayer(name, "raster", width, width)
  );
  const base = createDefaultDocument();
  tab.editor.setState({
    document: {
      ...base,
      canvas: { ...base.canvas, width, height: width },
      layers,
      activeLayerId: layers[layers.length - 1].id
    }
  });
  return { tab, layerIds: layers.map((layer) => layer.id) };
};

const backgroundWrapper = (instance: SketchInstance) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <SketchProvider instance={instance} active={false}>
      {children}
    </SketchProvider>
  );
  return Wrapper;
};

/** Mounts another tab as the focused editor. */
const focusOtherTab = (other: SketchInstance) =>
  render(
    <SketchProvider instance={other} active>
      {null}
    </SketchProvider>
  );

const geometryParams = (
  tab: SketchInstance,
  canvas: Partial<SketchCanvasRef>
) => {
  const store = tab.editor.getState();
  return {
    canvasRef: stub<RefObject<SketchCanvasRef | null>>({ current: canvas }),
    document: store.document,
    pushHistory: store.pushHistory,
    updateLayerData: store.updateLayerData,
    setDocument: store.setDocument,
    setZoom: store.setZoom,
    setPan: store.setPan,
    resizeCanvas: store.resizeCanvas,
    offsetAllPaintLayersTransform: store.offsetAllPaintLayersTransform,
    commitPixelLayerChange: jest.fn(),
    syncPixelLayerFromCanvas: jest.fn(),
    reconcileAllLayerTransforms: jest.fn(),
    syncSketchOutputsNow: jest.fn()
  };
};

const layerParams = (
  tab: SketchInstance,
  canvas: Partial<SketchCanvasRef>
) => {
  const store = tab.editor.getState();
  return {
    canvasRef: stub<RefObject<SketchCanvasRef | null>>({ current: canvas }),
    document: store.document,
    pushHistory: store.pushHistory,
    addLayer: store.addLayer,
    removeLayer: store.removeLayer,
    duplicateLayer: store.duplicateLayer,
    reorderLayers: store.reorderLayers,
    toggleLayerVisibility: store.toggleLayerVisibility,
    setLayerOpacity: store.setLayerOpacity,
    setLayerBlendMode: store.setLayerBlendMode,
    renameLayer: store.renameLayer,
    updateLayerData: store.updateLayerData,
    setMaskLayer: store.setMaskLayer,
    toggleAlphaLock: store.toggleAlphaLock,
    toggleLayerExposedInput: store.toggleLayerExposedInput,
    toggleLayerExposedOutput: store.toggleLayerExposedOutput,
    mergeLayerDown: store.mergeLayerDown,
    flattenVisible: store.flattenVisible,
    addGroup: store.addGroup,
    toggleGroupCollapsed: store.toggleGroupCollapsed,
    moveLayerToGroup: store.moveLayerToGroup,
    ungroupLayer: store.ungroupLayer,
    groupLayers: store.groupLayers
  };
};

describe("sketch edits on a tab that is not focused", () => {
  it("crops the tab's own document and leaves the focused one alone", () => {
    const { tab } = seedTab(200, ["Photo"]);
    const { tab: other } = seedTab(512, ["Other"]);
    focusOtherTab(other);
    const { result } = renderHook(
      () =>
        useCanvasGeometryActions(
          geometryParams(tab, {
            cropCanvas: jest.fn(),
            getLayerData: jest.fn(() => null)
          })
        ),
      { wrapper: backgroundWrapper(tab) }
    );

    act(() => {
      result.current.handleCropComplete(10, 10, 100, 80);
    });

    expect(tab.editor.getState().document.canvas).toMatchObject({
      width: 100,
      height: 80
    });
    expect(other.editor.getState().document.canvas).toMatchObject({
      width: 512,
      height: 512
    });
    expect(other.editor.getState().document.layers[0].name).toBe("Other");
  });

  it("merges a layer down in the tab's own document", () => {
    const { tab, layerIds } = seedTab(200, ["Bottom", "Top"]);
    const { tab: other } = seedTab(512, ["Other"]);
    focusOtherTab(other);
    const { result } = renderHook(
      () =>
        useLayerActions(
          layerParams(tab, { mergeLayerDown: jest.fn(() => "merged-pixels") })
        ),
      { wrapper: backgroundWrapper(tab) }
    );

    let survivor: string | null = null;
    act(() => {
      survivor = result.current.handleMergeLayerDown(layerIds[1]);
    });

    expect(survivor).toBe(layerIds[0]);
    const layers = tab.editor.getState().document.layers;
    expect(layers.map((layer) => layer.id)).toEqual([layerIds[0]]);
    expect(layers[0].data).toBe("merged-pixels");
  });

  it("keeps the flattened pixels on the tab's own flattened layer", () => {
    const { tab } = seedTab(200, ["Bottom", "Top"]);
    const { tab: other } = seedTab(512, ["Other"]);
    focusOtherTab(other);
    const setLayerData = jest.fn();
    const { result } = renderHook(
      () =>
        useLayerActions(
          layerParams(tab, {
            flattenVisible: jest.fn(() => "flat-pixels"),
            setLayerData
          })
        ),
      { wrapper: backgroundWrapper(tab) }
    );

    act(() => {
      result.current.handleFlattenVisible();
    });

    const layers = tab.editor.getState().document.layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].data).toBe("flat-pixels");
    expect(setLayerData).toHaveBeenCalledWith(layers[0].id, "flat-pixels");
    expect(other.editor.getState().document.layers[0].data).toBeNull();
  });

  it("centers a pasted layer on its own canvas after a tab switch during the clipboard read", async () => {
    const { tab } = seedTab(200, ["Photo"]);
    const { tab: other } = seedTab(512, ["Other"]);
    let tabActive = true;
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <SketchProvider instance={tab} active={tabActive}>
        {children}
      </SketchProvider>
    );
    const drawImage = jest.fn();
    const snapshot = { getContext: () => ({ drawImage }) };
    const { result, rerender } = renderHook(
      () =>
        useCanvasGeometryActions(
          geometryParams(tab, {
            setLayerData: jest.fn(),
            snapshotLayerCanvas: jest.fn(
              () => snapshot as unknown as HTMLCanvasElement
            ),
            getPasteAnchorDocumentPoint: jest.fn(() => null),
            restoreLayerCanvas: jest.fn(),
            redrawDisplay: jest.fn()
          })
        ),
      { wrapper: Wrapper }
    );

    let paste: Promise<string | null> = Promise.resolve(null);
    act(() => {
      paste = result.current.handlePasteAsNewLayer(() =>
        tab.editor.getState().addLayer("Pasted")
      );
    });
    tabActive = false;
    rerender();
    focusOtherTab(other);
    await act(async () => {
      resolveClipboard(
        stub<HTMLCanvasElement>({ width: 20, height: 20 })
      );
      await paste;
    });

    // 200 / 2 - 20 / 2, not 512 / 2 - 20 / 2.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 90, 90);
  });

  it("keeps edits made while a dropped asset downloads", async () => {
    const { tab, layerIds } = seedTab(200, ["Photo"]);
    let finishDownload: () => void = () => {};
    const fetchMock = jest.fn(
      () =>
        new Promise((resolve) => {
          finishDownload = () =>
            resolve({ ok: true, blob: async () => new Blob(["x"]) });
        })
    );
    const originalFetch = global.fetch;
    const originalBitmap = (global as { createImageBitmap?: unknown })
      .createImageBitmap;
    global.fetch = fetchMock as unknown as typeof fetch;
    (global as { createImageBitmap?: unknown }).createImageBitmap = jest.fn(
      async () => ({ width: 40, height: 30, close: jest.fn() })
    );
    try {
      const { result } = renderHook(
        () => useCanvasGeometryActions(geometryParams(tab, {})),
        { wrapper: backgroundWrapper(tab) }
      );

      let drop: Promise<void> = Promise.resolve();
      act(() => {
        drop = result.current.handleDropAsset(
          stub<Asset>({ id: "a".repeat(32), name: "Logo", get_url: "/logo.png" })
        );
      });
      act(() => {
        tab.editor.getState().updateLayerData(layerIds[0], "stroke-pixels");
      });
      await act(async () => {
        finishDownload();
        await drop;
      });

      const layers = tab.editor.getState().document.layers;
      expect(layers.map((layer) => layer.name)).toEqual(["Photo", "Logo"]);
      expect(layers[0].data).toBe("stroke-pixels");
    } finally {
      global.fetch = originalFetch;
      (global as { createImageBitmap?: unknown }).createImageBitmap =
        originalBitmap;
    }
  });

  it("flattens the canvas runtime against the tab's own layers", () => {
    const { tab, layerIds } = seedTab(200, ["Bottom", "Top"]);
    const { tab: other } = seedTab(512, ["Other"]);
    focusOtherTab(other);
    const flattenVisible = jest.fn(() => "flat-pixels");
    const ref = React.createRef<SketchCanvasRef>();
    renderHook(
      () =>
        useCanvasImperativeHandle({
          ref,
          doc: tab.editor.getState().document,
          runtime: stub<SketchRuntime>({ flattenVisible }),
          containerRef: { current: null },
          displayCanvasRef: { current: null },
          overlayCanvasRef: { current: null },
          redraw: jest.fn(),
          drainPendingStrokeCommit: jest.fn(),
          zoom: 1,
          lastPointerClientRef: { current: null },
          cancelActiveTool: jest.fn(),
          commitPendingCrop: jest.fn()
        }),
      { wrapper: backgroundWrapper(tab) }
    );

    ref.current?.flattenVisible();

    expect(flattenVisible).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: [
          expect.objectContaining({ id: layerIds[0] }),
          expect.objectContaining({ id: layerIds[1] })
        ]
      })
    );
  });
});
