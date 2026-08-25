/**
 * @jest-environment jsdom
 *
 * Pins every parameter each direct-gen binding kind sends over the
 * `generate_media` RPC, so a field added to the wire contract cannot be
 * dropped by the request builder unnoticed.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

const sendMock = jest.fn(async (_frame?: unknown) => {});
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (...args: unknown[]) => sendMock(...(args as [])),
    subscribe: jest.fn((_id: string, _handler: (msg: unknown) => void): (() => void) => () => {}),
    // Import-time side effect of the workflow runner module graph.
    setResumeJobIdProvider: jest.fn()
  }
}));

import { createTimelineInstance } from "../../../stores/timeline/TimelineInstance";
import type { TimelineInstance } from "../../../stores/timeline/TimelineInstance";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import type { TimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { useTimelineDirectGenJob } from "../useTimelineDirectGenJob";
import type { TimelineClip } from "@nodetool-ai/timeline";

let instance: TimelineInstance;
let doc: TimelineStoreApi;

/** A minimal clip of the given direct-gen kind carrying every framing param. */
const addClip = (overrides: Partial<TimelineClip> & { id: string }): void => {
  const trackId = doc.getState().tracks[0]?.id;
  if (!trackId) {
    act(() => doc.getState().addTrack("video", "V"));
  }
  const tid = doc.getState().tracks[0].id;
  act(() =>
    doc.getState().addClip({
      paragraphId: overrides.id,
      name: overrides.id,
      trackId: tid,
      startMs: 0,
      durationMs: 1000,
      mediaType: "video",
      sourceType: "generated",
      status: "draft",
      locked: false,
      versions: [],
      provider: "prov",
      model: "model-1",
      prompt: "a cat on a roof",
      width: 1024,
      height: 576,
      aspectRatio: "16:9",
      resolution: "1080p",
      strength: 0.65,
      numInferenceSteps: 30,
      voice: "alloy",
      ...overrides
    } as TimelineClip)
  );
};

const startClip = async (clipId: string): Promise<string | null> => {
  const { result } = renderHook(() => useTimelineDirectGenJob(), {
    wrapper: ({ children }) => (
      <TimelineProvider instance={instance}>{children}</TimelineProvider>
    )
  });
  let requestId: string | null = null;
  await act(async () => {
    requestId = await result.current.start(clipId);
  });
  return requestId;
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
  instance = createTimelineInstance();
  doc = instance.doc;
});

describe("useTimelineDirectGenJob request payloads", () => {
  it("text-to-image: sends provider, model, prompt and framing", async () => {
    addClip({ id: "clip-t2i", bindingKind: "text-to-image" });
    await startClip("clip-t2i");
    expect(sentData()).toEqual({
      mode: "image",
      provider: "prov",
      model: "model-1",
      prompt: "a cat on a roof",
      width: 1024,
      height: 576,
      strength: 0.65,
      num_inference_steps: 30,
      variations: 1,
      aspect_ratio: "16:9",
      resolution: "1080p"
    });
  });

  it("image-to-image: adds the source clip's asset id", async () => {
    addClip({
      id: "clip-src",
      bindingKind: "text-to-image",
      status: "generated",
      currentAssetId: "asset-src"
    });
    addClip({
      id: "clip-i2i",
      bindingKind: "image-to-image",
      sourceClipId: "clip-src"
    });
    await startClip("clip-i2i");
    expect(sentData()).toMatchObject({
      mode: "image_edit",
      source_asset_id: "asset-src",
      prompt: "a cat on a roof",
      strength: 0.65,
      num_inference_steps: 30
    });
  });

  it("text-to-video: derives whole-second duration from the clip length", async () => {
    addClip({
      id: "clip-t2v",
      bindingKind: "text-to-video",
      durationMs: 3500
    });
    await startClip("clip-t2v");
    expect(sentData()).toEqual({
      mode: "video",
      provider: "prov",
      model: "model-1",
      prompt: "a cat on a roof",
      width: 1024,
      height: 576,
      strength: 0.65,
      num_inference_steps: 30,
      variations: 1,
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: 4
    });
  });

  it("text-to-audio: sends the voice and omits the framing params", async () => {
    addClip({
      id: "clip-t2a",
      bindingKind: "text-to-audio",
      mediaType: "audio"
    });
    await startClip("clip-t2a");
    expect(sentData()).toEqual({
      mode: "audio",
      provider: "prov",
      model: "model-1",
      prompt: "a cat on a roof",
      // Always sent; unused by the audio branch server-side.
      source_asset_id: undefined,
      width: 1024,
      height: 576,
      strength: 0.65,
      num_inference_steps: 30,
      variations: 1,
      voice: "alloy"
    });
  });

  it("routes the reply through a subscription on the returned request id", async () => {
    addClip({ id: "clip-sub", bindingKind: "text-to-image" });
    const requestId = await startClip("clip-sub");
    expect(requestId).not.toBeNull();
    const frame = sendMock.mock.calls[0][0] as { request_id?: string };
    expect(frame.request_id).toBe(requestId);
  });
});
