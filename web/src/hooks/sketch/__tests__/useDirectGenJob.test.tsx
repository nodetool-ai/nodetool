/**
 * @jest-environment jsdom
 *
 * Pins every parameter the sketch editor's direct-gen request sends over the
 * `generate_media` RPC for each layer binding kind.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

const sendMock = jest.fn(async (_frame?: unknown) => {});
const subscribeMock = jest.fn(
  (_id: string, _handler: (msg: unknown) => void): (() => void) => () => {}
);
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (...args: unknown[]) => sendMock(...(args as [unknown])),
    subscribe: (...args: unknown[]) => subscribeMock(...(args as [string, (msg: unknown) => void])),
    // Import-time side effect of the workflow runner module graph.
    setResumeJobIdProvider: jest.fn()
  }
}));

import { useDirectGenJob } from "../useDirectGenJob";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import type { LayerWorkflowBinding } from "../../../stores/sketch/SketchSessionStore";

const seedBinding = (binding: Partial<LayerWorkflowBinding>): void => {
  const existing =
    useSketchSessionStore.getState().bindings["layer-1"] ?? ({} as never);
  act(() => {
    useSketchSessionStore.setState({
      bindings: {
        "layer-1": {
          ...existing,
          ...binding
        }
      }
    } as never);
  });
};

const start = async (): Promise<void> => {
  const { result } = renderHook(() => useDirectGenJob());
  await act(async () => {
    await result.current.start("layer-1");
  });
};

const sentData = (): Record<string, unknown> => {
  const frame = sendMock.mock.calls[0][0] as {
    command?: string;
    data?: Record<string, unknown>;
  };
  expect(frame.command).toBe("generate_media");
  return frame.data ?? {};
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
  subscribeMock.mockClear();
  act(() => {
    useSketchSessionStore.setState({ bindings: {} } as never);
  });
});

describe("useDirectGenJob request payloads", () => {
  it("text-to-image: sends provider, model, prompt and framing", async () => {
    seedBinding({
      kind: "text-to-image",
      provider: "prov",
      model: "model-1",
      prompt: "a watercolor heron",
      width: 768,
      height: 512,
      aspectRatio: "3:2",
      resolution: "1K",
      strength: 0.5,
      numInferenceSteps: 25,
      status: "draft"
    } as never);
    await start();
    expect(sentData()).toEqual({
      mode: "image",
      provider: "prov",
      model: "model-1",
      prompt: "a watercolor heron",
      source_asset_id: undefined,
      mask_asset_id: undefined,
      width: 768,
      height: 512,
      aspect_ratio: "3:2",
      resolution: "1K",
      strength: 0.5,
      num_inference_steps: 25,
      variations: 1
    });
  });

  it("image-to-image: passes the binding's uploaded source asset", async () => {
    seedBinding({
      kind: "image-to-image",
      provider: "prov",
      model: "edit-1",
      prompt: "make it night",
      sourceAssetId: "src-upload",
      status: "draft"
    } as never);
    await start();
    expect(sentData()).toMatchObject({
      mode: "image_edit",
      source_asset_id: "src-upload",
      prompt: "make it night"
    });
  });

  it("inpaint: passes both the source and the mask", async () => {
    seedBinding({
      kind: "inpaint",
      provider: "prov",
      model: "inpaint-1",
      prompt: "fill the sky",
      sourceAssetId: "src-comp",
      maskAssetId: "mask-sel",
      strength: 0.9,
      status: "draft"
    } as never);
    await start();
    expect(sentData()).toMatchObject({
      mode: "inpaint",
      source_asset_id: "src-comp",
      mask_asset_id: "mask-sel",
      prompt: "fill the sky",
      strength: 0.9
    });
  });

  it("routes the reply through a subscription on the sent request id", async () => {
    seedBinding({
      kind: "text-to-image",
      provider: "prov",
      model: "model-1",
      prompt: "x",
      status: "draft"
    } as never);
    await start();
    const frame = sendMock.mock.calls[0][0] as { request_id?: string };
    expect(frame.request_id).not.toBeNull();
    // The reply subscription is keyed by the same id the request carries.
    expect(subscribeMock.mock.calls[0][0]).toBe(frame.request_id);
  });
});
