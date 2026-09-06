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

const lookupMock = jest.fn(async (_ids: readonly string[]) => new Map());
jest.mock("../../../lib/websocket/lookupGenerations", () => ({
  __esModule: true,
  isSettled: (status: string) => status !== "running",
  lookupGenerations: (ids: readonly string[]) => lookupMock(ids)
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
  // Default: no row to read, which is the pre-lookup behaviour — every entry
  // falls through to a subscription.
  lookupMock.mockClear();
  lookupMock.mockResolvedValue(new Map());
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

  // The reply lands minutes after the send, and the creator may have opened
  // another sequence by then. Settling against whatever is open now would leave
  // this sequence's entry in the pending list forever; reattachment would later
  // restore it, put the clip back to `generating` and subscribe to a request
  // that has already answered — a clip stuck rendering over a paid render that
  // was thrown away.
  it("settles the sequence the request was sent for, not the one now open", async () => {
    const store = seedSequence();
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c1",
      requestId: "req-1",
      startedAt: Date.now() - 1000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });

    await reattachSequenceJobs(store, "seq-1");

    // The creator moves to another sequence while the render is out.
    store.getState().loadSequence({
      id: "seq-2",
      projectId: "p1",
      name: "Another cut",
      fps: 30,
      width: 1920,
      height: 1080,
      durationMs: 0,
      tracks: [],
      clips: [],
      markers: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    handlers.get("req-1")?.({
      type: "rpc_response",
      request_id: "req-1",
      result: { asset_ids: ["asset-9"] }
    });

    // seq-1's entry is gone, so reopening it cannot resurrect a dead request.
    expect(
      useDirectGenPendingStore.getState().pending["seq-1"] ?? []
    ).toHaveLength(0);
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

/**
 * Recovery across a browser reload, which re-subscribing alone cannot do.
 *
 * A `generate_media` reply is an `rpc_response` with no `job_id` and no
 * `thread_id`, so the server writes it to the socket that asked and drops it
 * if that socket has gone. The reply for a render that finished while the
 * browser was shut was therefore already delivered to nobody — subscribing to
 * its request id afterwards can never produce it. The generation row outlives
 * the socket, so the entry is looked up against it first.
 */
describe("reattach recovers a render its socket never delivered", () => {
  const settled = (
    requestId: string,
    over: Partial<{ status: string; assetIds: string[]; error: string | null }> = {}
  ) =>
    new Map([
      [
        requestId,
        {
          requestId,
          generationId: "gen-1",
          status: "completed",
          assetIds: ["asset-9"],
          error: null,
          ...over
        }
      ]
    ]);

  const rememberOne = () => {
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c1",
      requestId: "req-1",
      startedAt: Date.now() - 1000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });
  };

  it("lands the asset from the row, without subscribing at all", async () => {
    const store = seedSequence();
    rememberOne();
    lookupMock.mockResolvedValue(settled("req-1"));

    await reattachSequenceJobs(store, "seq-1");

    const clip = store.getState().clips.find((c) => c.id === "c1");
    expect(clip?.currentAssetId).toBe("asset-9");
    expect(clip?.status).toBe("generated");
    // The reply is already gone; a subscription for it would wait forever.
    expect(subscribeMock).not.toHaveBeenCalled();
    // And the entry is settled, so reopening cannot restore a dead request.
    expect(
      useDirectGenPendingStore.getState().pending["seq-1"] ?? []
    ).toHaveLength(0);
  });

  it("fails the clip when the row says the render failed", async () => {
    const store = seedSequence();
    rememberOne();
    lookupMock.mockResolvedValue(
      settled("req-1", {
        status: "failed",
        assetIds: [],
        error: "provider refused"
      })
    );

    await reattachSequenceJobs(store, "seq-1");

    expect(store.getState().clips.find((c) => c.id === "c1")?.status).toBe(
      "failed"
    );
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("subscribes when the row still says running, so the reply can land", async () => {
    const store = seedSequence();
    rememberOne();
    lookupMock.mockResolvedValue(settled("req-1", { status: "running", assetIds: [] }));

    await reattachSequenceJobs(store, "seq-1");

    expect(store.getState().clips.find((c) => c.id === "c1")?.status).toBe(
      "generating"
    );
    expect(subscribeMock).toHaveBeenCalledWith("req-1", expect.any(Function));

    handlers.get("req-1")?.({
      type: "rpc_response",
      request_id: "req-1",
      result: { asset_ids: ["asset-late"] }
    });
    expect(store.getState().clips.find((c) => c.id === "c1")?.currentAssetId).toBe(
      "asset-late"
    );
  });

  it("only asks about the entries whose clips the sequence still has", async () => {
    const store = seedSequence();
    rememberOne();
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "gone",
      requestId: "req-gone",
      startedAt: Date.now() - 1000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });

    await reattachSequenceJobs(store, "seq-1");

    expect(lookupMock).toHaveBeenCalledWith(["req-1"]);
  });
});

/**
 * Landing from the row must also close any subscription still open for that
 * clip. Reopening a sequence inside one page session leaves the earlier
 * subscription live, and a second settle appends the same version twice — a
 * duplicate take the creator did not make.
 */
describe("landing from the row closes the live subscription", () => {
  it("does not append a second version when the reply arrives afterwards", async () => {
    const store = seedSequence();
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c1",
      requestId: "req-1",
      startedAt: Date.now() - 1000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });

    // First open: the row says running, so a subscription is made.
    await reattachSequenceJobs(store, "seq-1");
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    // Second open, and by now the row has settled.
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c1",
      requestId: "req-1",
      startedAt: Date.now() - 1000,
      bucket: "text-to-video:nodetool/kling-turbo"
    });
    lookupMock.mockResolvedValue(
      new Map([
        [
          "req-1",
          {
            requestId: "req-1",
            generationId: "gen-1",
            status: "completed",
            assetIds: ["asset-9"],
            error: null
          }
        ]
      ])
    );
    await reattachSequenceJobs(store, "seq-1");

    const afterLanding = store.getState().clips.find((c) => c.id === "c1");
    expect(afterLanding?.versions).toHaveLength(1);

    // The first subscription's reply arrives late. It must land nothing.
    handlers.get("req-1")?.({
      type: "rpc_response",
      request_id: "req-1",
      result: { asset_ids: ["asset-9"] }
    });

    expect(
      store.getState().clips.find((c) => c.id === "c1")?.versions
    ).toHaveLength(1);
  });
});
