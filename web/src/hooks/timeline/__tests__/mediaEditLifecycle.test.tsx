/** @jest-environment jsdom */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

type Handler = (message: unknown) => void;
const handlers = new Map<string, Handler>();
const sendMock = jest.fn(async (..._args: unknown[]) => {});
const subscribeMock = jest.fn((requestId: string, handler: Handler) => {
  handlers.set(requestId, handler);
  return () => handlers.delete(requestId);
});

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (...args: unknown[]) => sendMock(...args),
    subscribe: (requestId: string, handler: Handler) =>
      subscribeMock(requestId, handler),
    setResumeJobIdProvider: jest.fn()
  }
}));

const lookupMock = jest.fn(async (_ids: readonly string[]) => new Map());
jest.mock("../../../lib/websocket/lookupGenerations", () => ({
  __esModule: true,
  isSettled: (status: string) => status !== "running",
  lookupGenerations: (ids: readonly string[]) => lookupMock(ids)
}));

import { createTimelineInstance, TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import type { TimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { createTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  acknowledgePersistedMediaEdits,
  useDirectGenPendingStore
} from "../directGenPending";
import {
  landMediaEdit,
  reattachSequenceJobs,
  subscribeDirectGen,
  useTimelineDirectGenJob
} from "../useTimelineDirectGenJob";
import { createMediaEditRequest } from "@nodetool-ai/timeline";
import type { MediaEditRequest } from "@nodetool-ai/timeline";
import { __resetGenerationWatchesForTests } from "../../../lib/websocket/generationWatch";

const sourceContext = {
  sequenceId: "seq-1",
  clipId: "c1",
  sourceAssetId: "asset-source",
  sourceStartMs: 40_000,
  sourceEndMs: 44_000,
  timelineStartMs: 0,
  timelineDurationMs: 4_000,
  speedMultiplier: 1
};

const makeRequest = (): MediaEditRequest =>
  createMediaEditRequest({
    sourceContext,
    instruction: "make the station deserted",
    provider: "nodetool",
    model: "edit-model"
  });

const loadSequence = (
  store: TimelineStoreApi,
  sequenceId = "seq-1"
): void => {
  store.getState().loadSequence({
    id: sequenceId,
    projectId: "p1",
    name: "Cut",
    fps: 30,
    width: 1920,
    height: 1080,
    durationMs: 4_000,
    tracks: [
      {
        id: "track-1",
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
        trackId: "track-1",
        name: "Beat 1",
        startMs: 0,
        durationMs: 4_000,
        mediaType: "video",
        sourceType: "imported",
        currentAssetId: "asset-source",
        provider: "nodetool",
        model: "edit-model",
        status: "generated",
        locked: false,
        versions: []
      }
    ],
    markers: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
};

const rememberEdit = (
  requestId: string,
  request: MediaEditRequest = makeRequest()
): void => {
  useDirectGenPendingStore.getState().remember("seq-1", {
    clipId: "c1",
    requestId,
    startedAt: Date.now() - 1_000,
    bucket: "video_edit:edit-model",
    mediaEdit: request
  });
};

beforeEach(() => {
  handlers.clear();
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
  subscribeMock.mockClear();
  lookupMock.mockReset();
  lookupMock.mockResolvedValue(new Map());
  __resetGenerationWatchesForTests();
  useDirectGenPendingStore.setState({
    pending: {},
    durationSamples: {},
    editSettlements: {}
  });
});

describe("native media edit destination lifecycle", () => {
  it("recovers a completed edit after reconnect and lands one candidate", async () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-reconnect", request);
    lookupMock.mockResolvedValue(
      new Map([
        [
          "req-reconnect",
          {
            requestId: "req-reconnect",
            generationId: "gen-1",
            status: "completed",
            assetIds: ["asset-candidate"],
            error: null
          }
        ]
      ])
    );

    await reattachSequenceJobs(store, "seq-1");

    expect(subscribeMock).not.toHaveBeenCalled();
    expect(store.getState().clips[0].versions).toHaveLength(2);
    expect(
      store.getState().clips[0].versions?.some(
        (version) => version.assetId === "asset-candidate"
      )
    ).toBe(true);
    expect(
      useDirectGenPendingStore.getState().editSettlements["req-reconnect"]
    ).toMatchObject({ status: "completed" });
  });

  it("replays a completed candidate after a crash before autosave", async () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-before-autosave", request);

    landMediaEdit(store, "c1", "req-before-autosave", "seq-1", request, {
      assetIds: ["asset-before-autosave"],
      errored: false
    });

    // A reload starts from the last server document, which did not contain
    // the candidate because the autosave had not accepted it yet.
    const reopened = createTimelineStore();
    loadSequence(reopened);
    await reattachSequenceJobs(reopened, "seq-1");

    expect(
      reopened
        .getState()
        .clips[0].versions?.some(
          (version) => version.assetId === "asset-before-autosave"
        )
    ).toBe(true);
    expect(
      useDirectGenPendingStore.getState().editSettlements[
        "req-before-autosave"
      ]?.acknowledgedAt
    ).toBeUndefined();
  });

  it("does not resurrect a candidate deleted after durable autosave", async () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-durable-delete", request);

    landMediaEdit(store, "c1", "req-durable-delete", "seq-1", request, {
      assetIds: ["asset-durable-delete"],
      errored: false
    });
    const candidate = store
      .getState()
      .clips[0].versions?.find(
        (version) => version.assetId === "asset-durable-delete"
      );
    expect(candidate).toBeDefined();

    // Simulate the successful autosave response. The candidate is now
    // durable, so the settlement becomes a non-replayable tombstone.
    acknowledgePersistedMediaEdits("seq-1", store.getState().clips);
    expect(
      useDirectGenPendingStore.getState().editSettlements[
        "req-durable-delete"
      ]?.acknowledgedAt
    ).toBeDefined();

    expect(store.getState().deleteTake("c1", candidate?.id ?? "")).toBeNull();

    const reopened = createTimelineStore();
    loadSequence(reopened);
    await reattachSequenceJobs(reopened, "seq-1");

    expect(
      reopened
        .getState()
        .clips[0].versions?.some(
          (version) => version.assetId === "asset-durable-delete"
        )
    ).toBe(false);
    expect(
      useDirectGenPendingStore.getState().editSettlements[
        "req-durable-delete"
      ]?.status
    ).toBe("completed");
  });

  it("defers a result while another sequence is open, then lands on its destination", async () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-switched", request);
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

    landMediaEdit(store, "c1", "req-switched", "seq-1", request, {
      assetIds: ["asset-switched"],
      errored: false
    });

    expect(store.getState().clips).toHaveLength(0);
    expect(store.getState().sequenceId).toBe("seq-2");
    expect(
      useDirectGenPendingStore.getState().editSettlements["req-switched"]
        ?.status
    ).toBe("completed");

    loadSequence(store);
    expect(store.getState().sequenceId).toBe("seq-1");
    await reattachSequenceJobs(store, "seq-1");
    expect(
      store.getState().clips[0].versions?.some(
        (version) => version.assetId === "asset-switched"
      )
    ).toBe(true);
  });

  it("marks a deleted destination orphaned without recreating its clip", () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-deleted", request);
    store.getState().loadSequence({
      id: "seq-1",
      projectId: "p1",
      name: "Cut without the clip",
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

    landMediaEdit(store, "c1", "req-deleted", "seq-1", request, {
      assetIds: ["asset-orphan"],
      errored: false
    });

    expect(store.getState().clips).toHaveLength(0);
    expect(
      useDirectGenPendingStore.getState().editSettlements["req-deleted"]
        ?.status
    ).toBe("orphaned");
  });

  it("keeps cancellation inspectable and leaves accepted media unchanged", async () => {
    const instance = createTimelineInstance();
    loadSequence(instance.doc);
    const { result } = renderHook(() => useTimelineDirectGenJob(), {
      wrapper: ({ children }) => (
        <TimelineProvider instance={instance}>{children}</TimelineProvider>
      )
    });

    let requestId: string | null = null;
    await act(async () => {
      requestId = await result.current.startEdit({
        clipId: "c1",
        instruction: "remove the crowd",
        provider: "nodetool",
        model: "edit-model"
      });
    });
    if (!requestId) {
      throw new Error("The edit request was not submitted");
    }
    const before = instance.doc.getState().clips[0];
    act(() => result.current.cancel("c1"));

    expect(instance.doc.getState().clips[0].currentAssetId).toBe(
      before.currentAssetId
    );
    expect(instance.doc.getState().clips[0].versions).toEqual(
      before.versions
    );
    expect(
      useDirectGenPendingStore.getState().editSettlements[requestId]
        ?.status
    ).toBe("cancelled");
    expect(useDirectGenPendingStore.getState().pending["seq-1"]).toBeUndefined();

    const cancelled =
      useDirectGenPendingStore.getState().editSettlements[requestId];
    expect(cancelled).toBeDefined();
    landMediaEdit(
      instance.doc,
      "c1",
      requestId,
      "seq-1",
      cancelled?.mediaEdit ?? makeRequest(),
      { assetIds: ["asset-late"], errored: false }
    );
    expect(instance.doc.getState().clips[0].versions).toEqual(before.versions);
  });

  it("keeps a provider failure inspectable without mutating accepted media", () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-failed", request);
    const before = store.getState().clips[0];

    landMediaEdit(store, "c1", "req-failed", "seq-1", request, {
      assetIds: [],
      errored: true
    });

    expect(store.getState().clips[0]).toEqual(before);
    expect(
      useDirectGenPendingStore.getState().editSettlements["req-failed"]
        ?.status
    ).toBe("failed");
    expect(
      useDirectGenPendingStore.getState().editSettlements["req-failed"]
        ?.mediaEdit.sourceContext.sourceAssetId
    ).toBe("asset-source");
  });

  it("preserves a cancelled terminal status during reconnect lookup", async () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-cancelled-reconnect", request);
    lookupMock.mockResolvedValue(
      new Map([
        [
          "req-cancelled-reconnect",
          {
            requestId: "req-cancelled-reconnect",
            generationId: "gen-cancelled",
            status: "cancelled",
            assetIds: [],
            error: "cancelled by user"
          }
        ]
      ])
    );

    await reattachSequenceJobs(store, "seq-1");

    expect(
      useDirectGenPendingStore.getState().editSettlements[
        "req-cancelled-reconnect"
      ]
    ).toMatchObject({ status: "cancelled", assetIds: [] });
    expect(store.getState().clips[0].versions).toHaveLength(0);
  });

  it("keeps same clip IDs in different sequences independently subscribed", () => {
    const first = createTimelineStore();
    const second = createTimelineStore();
    loadSequence(first);
    loadSequence(second, "seq-2");
    const firstRequest = makeRequest();
    const secondRequest = createMediaEditRequest({
      sourceContext: { ...sourceContext, sequenceId: "seq-2" },
      instruction: "make the station bright",
      provider: "nodetool",
      model: "edit-model"
    });

    const firstCleanup = subscribeDirectGen(
      first,
      "c1",
      "req-seq-1",
      "seq-1",
      undefined,
      firstRequest
    );
    const secondCleanup = subscribeDirectGen(
      second,
      "c1",
      "req-seq-2",
      "seq-2",
      undefined,
      secondRequest
    );

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    firstCleanup();
    secondCleanup();
  });

  it("claims a socket and lookup race once, so one request appends one candidate", () => {
    const store = createTimelineStore();
    loadSequence(store);
    const request = makeRequest();
    rememberEdit("req-duplicate", request);
    const outcome = { assetIds: ["asset-once"], errored: false };

    landMediaEdit(store, "c1", "req-duplicate", "seq-1", request, outcome);
    landMediaEdit(store, "c1", "req-duplicate", "seq-1", request, outcome);

    expect(store.getState().clips[0].versions).toHaveLength(2);
    expect(
      store.getState().clips[0].versions?.filter(
        (version) => version.assetId === "asset-once"
      )
    ).toHaveLength(1);
  });
});
