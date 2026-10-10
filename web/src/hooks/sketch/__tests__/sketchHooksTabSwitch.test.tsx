/**
 * @jest-environment jsdom
 *
 * Sketch hooks whose work settles after a round trip. An inactive workspace
 * tab stays mounted but leaves the activation stack, so `getState()` on the
 * shared hooks then reads the focused document, or an empty default one. Each
 * hook must still write to the editor it was mounted in.
 */
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";

import { trpcClient, mockWorkflowsGet } from "../../../__mocks__/trpcClientMock";
import { useCreateGeneratedLayer } from "../useCreateGeneratedLayer";
import { useInpaintHere } from "../useInpaintHere";
import { useSketchWorkflowFreshnessCheck } from "../useSketchWorkflowFreshnessCheck";
import {
  SketchProvider,
  createSketchInstance,
  type SketchInstance
} from "../../../stores/sketch/SketchInstance";
import type { LayerWorkflowBinding } from "../../../stores/sketch/SketchSessionStore";

const createAsset = jest.fn();
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: { getState: () => ({ createAsset }) }
}));

/** A tab's provider; `tabActive` is flipped like a tab switch. */
let tabActive = true;
const tabWrapper = (instance: SketchInstance) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <SketchProvider instance={instance} active={tabActive}>
      {children}
    </SketchProvider>
  );
  return Wrapper;
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const seedTab = (): SketchInstance => {
  const instance = createSketchInstance();
  instance.session.setState({ documentId: "doc-1" });
  return instance;
};

beforeEach(() => {
  tabActive = true;
  createAsset.mockReset();
  mockWorkflowsGet.mockReset();
});

describe("a generated layer created across a tab switch", () => {
  it("binds the layer in the editor it was asked from", async () => {
    const tab = seedTab();
    const answer = deferred<LayerWorkflowBinding>();
    const create = trpcClient.sketch.layers.create.mutate as jest.Mock;
    create.mockReturnValueOnce(answer.promise);
    const { result, rerender } = renderHook(() => useCreateGeneratedLayer(), {
      wrapper: tabWrapper(tab)
    });

    let outcome: Promise<{ ok: boolean }> = Promise.resolve({ ok: false });
    act(() => {
      outcome = result.current.createGeneratedLayer({ workflowId: "wf-1" });
    });
    const layerId = tab.editor.getState().document.activeLayerId;
    tabActive = false;
    rerender();
    await act(async () => {
      answer.resolve({
        layerId,
        kind: "workflow",
        workflowId: "wf-1",
        status: "draft",
        versions: []
      } as LayerWorkflowBinding);
      await outcome;
    });

    await expect(outcome).resolves.toMatchObject({ ok: true });
    expect(tab.session.getState().bindings[layerId]?.workflowId).toBe("wf-1");
    expect(tab.editor.getState().document.activeLayerId).toBe(layerId);
  });
});

describe("an edit started before a tab switch", () => {
  const originalFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = jest.fn(async () => ({
      blob: async () => new Blob(["png"], { type: "image/png" })
    })) as unknown as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds its layer and binding to the editor it was started from", async () => {
    const tab = seedTab();
    tab.editor.setState({
      selection: { kind: "rect" },
      hasActiveSelection: true
    } as never);
    tab.canvasRef.setState({
      flattenToDataUrl: () => "data:image/png;base64,AA"
    } as never);
    const upload = deferred<{ id: string }>();
    createAsset.mockReturnValueOnce(upload.promise);
    const { result, rerender } = renderHook(() => useInpaintHere(), {
      wrapper: tabWrapper(tab)
    });

    let outcome: ReturnType<typeof result.current.inpaintHere> =
      Promise.resolve({ ok: false, reason: "no-document" });
    act(() => {
      outcome = result.current.inpaintHere({
        prompt: "make it night",
        provider: "fal",
        model: "flux-edit",
        mode: "edit"
      });
    });
    tabActive = false;
    rerender();
    await act(async () => {
      upload.resolve({ id: "asset-src" });
      await outcome;
    });

    const settled = await outcome;
    if (!settled.ok) {
      throw new Error("Inpaint did not settle");
    }
    const layerId = settled.layerId;
    expect(
      tab.editor.getState().document.layers.some((layer) => layer.id === layerId)
    ).toBe(true);
    expect(tab.session.getState().bindings[layerId]?.sourceAssetId).toBe(
      "asset-src"
    );
  });
});

describe("the freshness check of a tab loaded in the background", () => {
  it("checks the workflows its own layers are bound to", async () => {
    tabActive = false;
    const tab = seedTab();
    tab.session.setState({
      bindings: {
        "layer-1": {
          layerId: "layer-1",
          kind: "workflow",
          workflowId: "wf-background",
          status: "generated",
          versions: []
        } as LayerWorkflowBinding
      }
    });
    mockWorkflowsGet.mockResolvedValue({
      id: "wf-background",
      updated_at: "2026-01-01T00:00:00Z",
      graph: { nodes: [], edges: [] }
    });

    renderHook(() => useSketchWorkflowFreshnessCheck("doc-1"), {
      wrapper: tabWrapper(tab)
    });

    await waitFor(() =>
      expect(mockWorkflowsGet).toHaveBeenCalledWith({ id: "wf-background" })
    );
  });
});
