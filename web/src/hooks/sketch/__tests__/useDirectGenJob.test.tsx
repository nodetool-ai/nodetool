/**
 * @jest-environment jsdom
 *
 * Pins every parameter the sketch editor's direct-gen request sends over the
 * `generate_media` RPC for each layer binding kind.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import React from "react";
import { act, render, renderHook } from "@testing-library/react";

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

import { directGenFailure, useDirectGenJob } from "../useDirectGenJob";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "../../../components/sketch/state/useSketchStore";
import { createDefaultDocument } from "../../../components/sketch/types";
import { useAssetStore } from "../../../stores/AssetStore";
import type { LayerWorkflowBinding } from "../../../stores/sketch/SketchSessionStore";
import {
  SketchProvider,
  createSketchInstance
} from "../../../stores/sketch/SketchInstance";

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

  it("image-to-image: uploads a placed photo nothing has painted on yet", async () => {
    // "Upload an image to edit" leaves the photo on a layer whose pixels are
    // still only the image it was placed from: `data` is null.
    let photoId = "";
    act(() => {
      useSketchStore.getState().setDocument(createDefaultDocument(800, 600));
      const doc = useSketchStore.getState().document;
      photoId = doc.layers[0].id;
      useSketchStore.getState().setDocument({
        ...doc,
        layers: doc.layers.map((layer) =>
          layer.id === photoId
            ? {
                ...layer,
                name: "holiday-photo.jpg",
                data: null,
                imageReference: {
                  uri: "/api/storage/1/photo.jpg",
                  naturalWidth: 800,
                  naturalHeight: 600,
                  objectFit: "contain"
                }
              }
            : layer
        )
      });
    });
    const photo = new Blob(["jpeg bytes"], { type: "image/jpeg" });
    const fetchMock = jest.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      blob: async () => photo
    }));
    global.fetch = fetchMock as never;
    const createAsset = jest.fn(async (_file: File) => ({ id: "photo-upload" }));
    useAssetStore.setState({ createAsset } as never);

    seedBinding({
      kind: "image-to-image",
      provider: "prov",
      model: "edit-1",
      prompt: "make it a sunset",
      sourceLayerId: photoId,
      status: "draft"
    } as never);
    await start();

    expect(directGenFailure("layer-1")).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/storage\/1\/photo\.jpg$/);
    expect(createAsset.mock.calls[0][0]).toMatchObject({
      name: "holiday-photo.jpg",
      type: "image/jpeg"
    });
    expect(sentData()).toMatchObject({
      mode: "image_edit",
      source_asset_id: "photo-upload"
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

/**
 * F7 — every path that ends in `status: "failed"` records why. A creator who
 * cannot tell a missing key from a refused prompt from a timeout has nothing
 * to act on, and the targeted retry just fails the same way.
 */
describe("failure reasons", () => {
  /** Hand the reply the RPC subscription is waiting for. */
  const reply = async (message: Record<string, unknown>): Promise<void> => {
    const handler = subscribeMock.mock.calls[0][1] as (msg: unknown) => void;
    await act(async () => {
      handler(message);
    });
  };

  const replyWithError = async (error: {
    code?: string;
    message?: string;
  }): Promise<void> => {
    const frame = sendMock.mock.calls[0][0] as { request_id?: string };
    await reply({
      type: "rpc_response",
      request_id: frame.request_id,
      command: "generate_media",
      error
    });
  };

  const statusOf = (): string | undefined =>
    useSketchSessionStore.getState().bindings["layer-1"]?.status;

  const ready = (): void => {
    seedBinding({
      kind: "text-to-image",
      provider: "prov",
      model: "model-1",
      prompt: "a watercolor heron",
      status: "draft"
    } as never);
  };

  it("names a missing model without calling the provider", async () => {
    seedBinding({
      kind: "text-to-image",
      prompt: "a watercolor heron",
      status: "draft"
    } as never);
    await start();
    expect(sendMock).not.toHaveBeenCalled();
    expect(statusOf()).toBe("failed");
    expect(directGenFailure("layer-1")).toMatchObject({ kind: "no-model" });
  });

  it("keeps a quota refusal apart from a content refusal", async () => {
    ready();
    await start();
    await replyWithError({
      code: "rate_limit_exceeded",
      message: "You exceeded your current quota"
    });
    expect(statusOf()).toBe("failed");
    expect(directGenFailure("layer-1")).toMatchObject({
      kind: "quota",
      detail: "You exceeded your current quota"
    });

    sendMock.mockClear();
    subscribeMock.mockClear();
    await start();
    await replyWithError({ message: "Blocked by the content policy" });
    expect(directGenFailure("layer-1")).toMatchObject({
      kind: "refused",
      detail: "Blocked by the content policy"
    });
  });

  it("reports a provider-side crash as a failed job, not a refusal", async () => {
    ready();
    await start();
    await replyWithError({
      message:
        "AtlasCloud job failed: [inference] AttributeError: module 'atlas_video.utils' has no attribute 'restore_letterbox_content_from_output' (flux_event.py:28) (predictionId: d691495695ac4155a69766e897a2f4cb)"
    });
    const failure = directGenFailure("layer-1");
    expect(failure?.kind).toBe("provider");
    expect(failure?.message).toBe(
      "The provider's job failed. Try again, or use another model."
    );
    expect(failure?.message).not.toMatch(/refused/i);
  });

  it("strips a credential out of a provider message", async () => {
    ready();
    await start();
    await replyWithError({
      code: "invalid_api_key",
      message: "Incorrect API key provided: sk-abcdefghijklmnop1234567890"
    });
    const failure = directGenFailure("layer-1");
    expect(failure?.kind).toBe("auth");
    expect(failure?.detail).not.toContain("sk-abcdefghijklmnop1234567890");
  });

  it("clears the last reason when the layer is tried again", async () => {
    ready();
    await start();
    await replyWithError({ message: "Blocked by the content policy" });
    expect(directGenFailure("layer-1")).not.toBeNull();

    sendMock.mockClear();
    subscribeMock.mockClear();
    seedBinding({ status: "draft" } as never);
    await start();
    expect(directGenFailure("layer-1")).toBeNull();
    expect(statusOf()).toBe("generating");
  });
});

/**
 * A variation lands while the creator is already working on the one they
 * picked. Placing it must not wipe their undo history, selection or tool
 * settings, and undoing their own edit must not take the result away again.
 */
describe("a result that lands mid-edit", () => {
  it("keeps undo history, selection and tool settings", async () => {
    let layerId = "";
    let otherId = "";
    act(() => {
      const sketch = useSketchStore.getState();
      sketch.setDocument(createDefaultDocument(512, 512));
      layerId = sketch.addLayer("Variation 2");
      otherId = useSketchStore.getState().addLayer("Picked");
      useSketchStore.getState().pushHistory("rename");
      useSketchStore.getState().pushHistory("paint");
      useSketchStore.getState().setBrushSettings({ size: 77 });
      useSketchStore.setState({ selectedLayerIds: [layerId, otherId] });
      useAssetStore.setState({
        get: async (id: string) => ({ id, get_url: `https://x.test/${id}.png` })
      } as never);
    });
    const historyLength = useSketchStore.getState().history.length;

    const existing = useSketchSessionStore.getState().bindings[layerId];
    act(() => {
      useSketchSessionStore.setState({
        bindings: {
          [layerId]: {
            ...(existing ?? {}),
            kind: "text-to-image",
            provider: "prov",
            model: "model-1",
            prompt: "a heron",
            status: "draft",
            versions: []
          }
        }
      } as never);
    });
    const { result } = renderHook(() => useDirectGenJob());
    await act(async () => {
      await result.current.start(layerId);
    });
    const frame = sendMock.mock.calls[0][0] as { request_id?: string };
    const handler = subscribeMock.mock.calls[0][1] as (msg: unknown) => void;
    await act(async () => {
      handler({
        type: "rpc_response",
        request_id: frame.request_id,
        command: "generate_media",
        result: { asset_ids: ["asset-heron"] }
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const state = useSketchStore.getState();
    const landed = state.document.layers.find((layer) => layer.id === layerId);
    expect(landed?.imageReference?.uri).toBe("https://x.test/asset-heron.png");
    expect(state.history).toHaveLength(historyLength);
    expect(state.selectedLayerIds).toEqual([layerId, otherId]);
    expect(state.toolSettings.brush.size).toBe(77);

    act(() => {
      useSketchStore.getState().undo();
    });
    expect(
      useSketchStore
        .getState()
        .document.layers.find((layer) => layer.id === layerId)?.imageReference
        ?.uri
    ).toBe("https://x.test/asset-heron.png");
  });
});

/**
 * An inactive workspace tab stays mounted but leaves the activation stack, so
 * the shared hooks' `getState()` then reads the focused document. A render
 * that settles after a tab switch must still land on its own tab.
 */
describe("a result that lands after a tab switch", () => {
  it("writes the image and the status to the tab that started it", async () => {
    const own = createSketchInstance();
    const other = createSketchInstance();
    let layerId = "";
    act(() => {
      own.editor.getState().setDocument(createDefaultDocument(512, 512));
      layerId = own.editor.getState().addLayer("Variation 1");
      own.session.setState({
        bindings: {
          [layerId]: {
            kind: "text-to-image",
            provider: "prov",
            model: "model-1",
            prompt: "a heron",
            status: "draft",
            versions: []
          }
        }
      } as never);
      useAssetStore.setState({
        get: async (id: string) => ({ id, get_url: `https://x.test/${id}.png` })
      } as never);
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SketchProvider instance={own} active={false}>
        {children}
      </SketchProvider>
    );
    const { result } = renderHook(() => useDirectGenJob(), { wrapper });
    // Another tab is focused while the take renders.
    render(
      <SketchProvider instance={other} active>
        <div />
      </SketchProvider>
    );
    await act(async () => {
      await result.current.start(layerId);
    });
    const frame = sendMock.mock.calls[0][0] as { request_id?: string };
    const handler = subscribeMock.mock.calls[0][1] as (msg: unknown) => void;
    await act(async () => {
      handler({
        type: "rpc_response",
        request_id: frame.request_id,
        command: "generate_media",
        result: { asset_ids: ["asset-heron"] }
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const landed = own.editor
      .getState()
      .document.layers.find((layer) => layer.id === layerId);
    expect(landed?.imageReference?.uri).toBe("https://x.test/asset-heron.png");
    expect(own.session.getState().bindings[layerId]?.status).not.toBe(
      "generating"
    );
    expect(other.session.getState().bindings[layerId]).toBeUndefined();
  });
});
