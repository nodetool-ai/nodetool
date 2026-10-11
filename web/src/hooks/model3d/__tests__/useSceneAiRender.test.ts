/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook, waitFor } from "@testing-library/react";

type Handler = (msg: unknown) => void;
const handlers = new Map<string, Handler>();
const sendMock = jest.fn(async (_frame: unknown) => {});
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    send: (frame: unknown) => sendMock(frame),
    subscribe: (id: string, handler: Handler) => {
      handlers.set(id, handler);
      return () => handlers.delete(id);
    },
    setResumeJobIdProvider: jest.fn()
  }
}));

import { useSceneAiRender, type SceneAiRenderRequest } from "../useSceneAiRender";
import { useAssetStore } from "../../../stores/AssetStore";

const createAsset = jest.fn(async (_file: File) => ({ id: "capture-1", name: "viewport-shaded.png" }));
const deleteAsset = jest.fn(async (_id: string) => []);

const request: SceneAiRenderRequest = {
  capture: "data:image/png;base64,iVBORw==",
  pass: "depth",
  prompt: "moonlit bedroom",
  provider: "prov",
  model: "edit-model",
  referenceAssetIds: ["style-1", "style-2"],
  aspectRatio: "16:9",
  resolution: "1K"
};

interface Frame {
  command: string;
  request_id: string;
  data: Record<string, unknown>;
}

const lastFrame = (): Frame => sendMock.mock.calls[sendMock.mock.calls.length - 1][0] as Frame;

beforeEach(() => {
  handlers.clear();
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
  createAsset.mockClear();
  deleteAsset.mockClear();
  useAssetStore.setState({ createAsset, delete: deleteAsset } as never);
});

describe("useSceneAiRender", () => {
  it("sends the capture as the source and the references after it", async () => {
    const { result } = renderHook(() => useSceneAiRender());
    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current.render(request);
    });
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    const frame = lastFrame();
    expect(frame.command).toBe("generate_media");
    expect(frame.data).toMatchObject({
      mode: "image_edit",
      provider: "prov",
      model: "edit-model",
      source_asset_id: "capture-1",
      reference_images: [
        { type: "image", asset_id: "style-1" },
        { type: "image", asset_id: "style-2" }
      ],
      aspect_ratio: "16:9",
      resolution: "1K",
      variations: 1
    });
    expect(frame.data.prompt).toMatch(/depth map/);
    expect(frame.data.prompt).toMatch(/moonlit bedroom/);

    await act(async () => {
      handlers.get(frame.request_id)!({ type: "rpc_response", result: { asset_ids: ["render-1"] } });
    });
    await expect(pending).resolves.toBe("render-1");
    expect(deleteAsset).toHaveBeenCalledWith("capture-1");
  });

  it("rejects with the provider's words and still drops the capture", async () => {
    const { result } = renderHook(() => useSceneAiRender());
    let pending!: Promise<string>;
    await act(async () => {
      pending = result.current.render(request);
    });
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    const frame = lastFrame();
    await act(async () => {
      handlers.get(frame.request_id)!({
        type: "rpc_response",
        error: { message: "Model does not accept input images" }
      });
    });
    await expect(pending).rejects.toThrow("Model does not accept input images");
    expect(deleteAsset).toHaveBeenCalledWith("capture-1");
  });

  it("cancels a render still in flight when the editor closes", async () => {
    const { result, unmount } = renderHook(() => useSceneAiRender());
    await act(async () => {
      void result.current.render(request);
    });
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    const renderId = lastFrame().request_id;
    unmount();
    const cancel = lastFrame();
    expect(cancel.command).toBe("cancel_generation");
    expect(cancel.data).toEqual({ request_ids: [renderId] });
    expect(handlers.has(renderId)).toBe(false);
    expect(deleteAsset).toHaveBeenCalledWith("capture-1");
  });
});
