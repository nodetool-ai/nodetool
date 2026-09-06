/**
 * @jest-environment jsdom
 *
 * PRD § 8.7 criterion 6: clips that land after the tab was closed appear on
 * reopen. The subscription died with the tab, so what makes that work is the
 * persisted request id and the re-subscribe this test drives.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type Handler = (msg: unknown) => void;
const handlers = new Map<string, Handler>();
const subscribeMock = jest.fn((id: string, handler: Handler) => {
  handlers.set(id, handler);
  return () => handlers.delete(id);
});
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: jest.fn(async () => {}),
    subscribe: (id: string, handler: Handler) => subscribeMock(id, handler),
    setResumeJobIdProvider: jest.fn()
  }
}));

import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useDirectGenPendingStore } from "../directGenPending";
import { reattachSequenceJobs } from "../useTimelineDirectGenJob";

const seedSequence = () => {
  const store = createTimelineStore();
  store.getState().loadSequence({
    id: "seq-1",
    projectId: "p1",
    name: "Cut",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 4000,
    tracks: [
      {
        id: "t1",
        name: "Video",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    clips: [
      {
        id: "c1",
        trackId: "t1",
        name: "Beat 1",
        startMs: 0,
        durationMs: 4000,
        mediaType: "video",
        sourceType: "generated",
        bindingKind: "text-to-video",
        prompt: "the kerb",
        provider: "nodetool",
        model: "nodetool/kling-turbo",
        status: "generating",
        locked: false,
        versions: []
      }
    ],
    markers: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
  return store;
};

beforeEach(() => {
  handlers.clear();
  subscribeMock.mockClear();
  useDirectGenPendingStore.setState({ pending: {}, durationSamples: {} });
});

describe("reattachSequenceJobs (criterion 6)", () => {
  it("re-subscribes to a request that was in flight when the tab closed", async () => {
    const store = seedSequence();
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c1",
      requestId: "req-1",
      startedAt: Date.now() - 1000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });

    await reattachSequenceJobs(store, "seq-1");

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    handlers.get("req-1")?.({
      type: "rpc_response",
      request_id: "req-1",
      result: { asset_ids: ["asset-9"] }
    });

    const clip = store.getState().clips[0];
    expect(clip.status).toBe("generated");
    expect(clip.currentAssetId).toBe("asset-9");
  });

  it("files how long the request took, so a later batch can say (D14)", async () => {
    const store = seedSequence();
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c1",
      requestId: "req-1",
      startedAt: Date.now() - 20_000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });
    await reattachSequenceJobs(store, "seq-1");
    handlers.get("req-1")?.({
      type: "rpc_response",
      request_id: "req-1",
      result: { asset_ids: ["asset-9"] }
    });

    const samples =
      useDirectGenPendingStore.getState().durationSamples[
        "text-to-video:nodetool/kling-turbo"
      ];
    expect(samples).toHaveLength(1);
    expect(samples[0]).toBeGreaterThanOrEqual(20_000);
  });

  it("files nothing when the request came back refused", async () => {
    const store = seedSequence();
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c1",
      requestId: "req-1",
      startedAt: Date.now() - 20_000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });
    await reattachSequenceJobs(store, "seq-1");
    handlers.get("req-1")?.({
      type: "rpc_response",
      request_id: "req-1",
      error: { message: "provider refused" }
    });

    expect(store.getState().clips[0].status).toBe("failed");
    expect(useDirectGenPendingStore.getState().durationSamples).toEqual({});
  });

  it("drops an entry for a clip the sequence no longer has", async () => {
    const store = seedSequence();
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "gone",
      requestId: "req-2",
      startedAt: Date.now(),
      bucket: "text-to-video:m"
    });
    await reattachSequenceJobs(store, "seq-1");
    expect(subscribeMock).not.toHaveBeenCalled();
    expect(useDirectGenPendingStore.getState().pending["seq-1"]).toBeUndefined();
  });

  it("drops an entry too old to ever be answered", async () => {
    const store = seedSequence();
    useDirectGenPendingStore.setState({
      pending: {
        "seq-1": [
          {
            clipId: "c1",
            requestId: "req-old",
            startedAt: Date.now() - 60 * 60 * 1000,
            bucket: "text-to-video:m"
          }
        ]
      },
      durationSamples: {}
    });
    await reattachSequenceJobs(store, "seq-1");
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});
