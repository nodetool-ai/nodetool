/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

interface RunOptions {
  workflowId: string;
  signal?: AbortSignal;
  graph: { nodes: { id: string; type: string; data: Record<string, unknown> }[] };
}
type RunResult = { success: boolean; outputs: Record<string, unknown>; error?: string };

const runMock = jest.fn(async (_options: RunOptions): Promise<RunResult> => ({ success: true, outputs: {} }));
jest.mock("../../../lib/workflow/runInlineGraphJob", () => ({
  runInlineGraphJob: (options: RunOptions) => runMock(options)
}));

import { useSceneBlenderRender, type SceneBlenderRenderRequest } from "../useSceneBlenderRender";
import { useAssetStore } from "../../../stores/AssetStore";
import { DEFAULT_BLENDER_RENDER_SETTINGS } from "../../../components/model_editor/blenderRender";

const createAsset = jest.fn(async (file: File) =>
  file.type === "image/png" ? { id: "render-1", name: file.name } : { id: "scene-1", name: file.name }
);
const deleteAsset = jest.fn(async (_id: string) => []);

const request: SceneBlenderRenderRequest = {
  scene: new Blob([new Uint8Array([1, 2, 3])], { type: "model/gltf-binary" }),
  settings: { ...DEFAULT_BLENDER_RENDER_SETTINGS, engine: "cycles", samples: 128 },
  name: "room"
};

// jsdom's File has no arrayBuffer(), so read it the old way.
const bytesOf = (file: File): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

beforeEach(() => {
  runMock.mockReset();
  createAsset.mockClear();
  deleteAsset.mockClear();
  useAssetStore.setState({ createAsset, delete: deleteAsset } as never);
});

describe("useSceneBlenderRender", () => {
  it("renders the uploaded scene with the RenderImage node and stores the PNG", async () => {
    runMock.mockResolvedValue({ success: true, outputs: { render: { image: { type: "image", data: "AQID" } } } });
    const { result } = renderHook(() => useSceneBlenderRender());

    let assetId = "";
    await act(async () => {
      assetId = await result.current.render("r1", request);
    });

    expect(assetId).toBe("render-1");
    const scene = createAsset.mock.calls[0][0];
    expect(scene.name).toBe("room-blender-scene.glb");
    expect(scene.type).toBe("model/gltf-binary");
    const node = runMock.mock.calls[0][0].graph.nodes[0];
    expect(node.type).toBe("nodetool.blender.RenderImage");
    expect(node.data).toMatchObject({
      model: { asset_id: "scene-1" },
      engine: "cycles",
      samples: 128
    });
    const png = createAsset.mock.calls[1][0];
    expect(png.name).toBe("room-blender.png");
    expect(await bytesOf(png)).toEqual(new Uint8Array([1, 2, 3]));
    expect(deleteAsset).toHaveBeenCalledWith("scene-1");
  });

  it("passes the job's failure on and still drops the uploaded scene", async () => {
    runMock.mockResolvedValue({
      success: false,
      outputs: {},
      error: "nodetool.blender.RenderImage: blender was not found. Install Blender 5.2 or newer."
    });
    const { result } = renderHook(() => useSceneBlenderRender());

    await act(async () => {
      await expect(result.current.render("r1", request)).rejects.toThrow(/blender was not found/);
    });
    expect(deleteAsset).toHaveBeenCalledWith("scene-1");
    expect(createAsset).toHaveBeenCalledTimes(1);
  });

  it("cancels the job through its signal", async () => {
    let signal: AbortSignal | undefined;
    runMock.mockImplementation(
      (options) =>
        new Promise<RunResult>((resolve) => {
          signal = options.signal;
          options.signal?.addEventListener("abort", () =>
            resolve({ success: false, outputs: {}, error: "Aborted" })
          );
        })
    );
    const { result } = renderHook(() => useSceneBlenderRender());

    await act(async () => {
      const pending = result.current.render("r1", request);
      await Promise.resolve();
      await Promise.resolve();
      result.current.cancel("r1");
      await expect(pending).rejects.toThrow("Cancelled");
    });
    expect(signal?.aborted).toBe(true);
    expect(deleteAsset).toHaveBeenCalledWith("scene-1");
  });

  it("aborts renders still running when the editor unmounts", async () => {
    let signal: AbortSignal | undefined;
    runMock.mockImplementation((options) => {
      signal = options.signal;
      return new Promise<RunResult>(() => undefined);
    });
    const { result, unmount } = renderHook(() => useSceneBlenderRender());

    await act(async () => {
      void result.current.render("r1", request);
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
