/**
 * @jest-environment jsdom
 *
 * Cancel reaching the server, generation writes kept out of the undo
 * history, and orphaned import placeholders failing on load.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";

const storyboardQueryMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    storyboards: {
      get: { query: (...args: unknown[]) => storyboardQueryMock(...args) }
    }
  }
}));

const sendMock = jest.fn(async (_frame?: unknown) => {});
const handlers = new Map<string, (msg: unknown) => void>();
const unsubscribeMocks = new Map<string, jest.Mock>();
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (...args: unknown[]) => sendMock(...(args as [])),
    subscribe: jest.fn((id: string, handler: (msg: unknown) => void) => {
      handlers.set(id, handler);
      const unsub = jest.fn(() => {
        handlers.delete(id);
      });
      unsubscribeMocks.set(id, unsub);
      return unsub;
    }),
    setResumeJobIdProvider: jest.fn()
  }
}));
jest.mock("../../../lib/websocket/lookupGenerations", () => ({
  __esModule: true,
  isSettled: (status: string) => status !== "running",
  lookupGenerations: jest.fn(async () => new Map())
}));

import {
  createTimelineInstance,
  TimelineProvider,
  type TimelineInstance
} from "../../../stores/timeline/TimelineInstance";
import type { TimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { __resetGenerationWatchesForTests } from "../../../lib/websocket/generationWatch";
import {
  __resetDirectGenJobsForTests,
  reattachSequenceJobs,
  useTimelineDirectGenJob
} from "../useTimelineDirectGenJob";
import { useDirectGenPendingStore } from "../directGenPending";
import { useNotificationStore } from "../../../stores/NotificationStore";
import type { TimelineClip } from "@nodetool-ai/timeline";

let instance: TimelineInstance;
let doc: TimelineStoreApi;

const addClip = (overrides: Partial<TimelineClip> & { id: string }): void => {
  if (!doc.getState().tracks[0])
    act(() => doc.getState().addTrack("video", "V"));
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
      prompt: "a cat",
      ...overrides
    } as TimelineClip)
  );
};

const mountHook = () =>
  renderHook(() => useTimelineDirectGenJob(), {
    wrapper: ({ children }) => (
      <TimelineProvider instance={instance}>{children}</TimelineProvider>
    )
  });

const clipOf = (id: string): TimelineClip =>
  doc.getState().clips.find((c) => c.id === id) as TimelineClip;

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
  handlers.clear();
  unsubscribeMocks.clear();
  storyboardQueryMock.mockReset();
  __resetGenerationWatchesForTests();
  __resetDirectGenJobsForTests();
  useDirectGenPendingStore.setState({
    pending: {},
    durationSamples: {},
    productionSettlements: {},
    editSettlements: {},
    editFailures: {}
  });
  useNotificationStore.setState({ notifications: [] });
  instance = createTimelineInstance();
  doc = instance.doc;
  doc.setState({ sequenceId: "seq-1" });
});

const land = (requestId: string, assetId: string): void => {
  act(() =>
    handlers.get(requestId)?.({
      type: "rpc_response",
      request_id: requestId,
      command: "generate_media",
      result: { asset_ids: [assetId] }
    })
  );
};

describe("direct-gen cancel", () => {
  it("asks the server to cancel the request it sent", async () => {
    addClip({ id: "c", bindingKind: "text-to-image", mediaType: "image" });
    const { result } = mountHook();
    let requestId: string | null = null;
    await act(async () => {
      requestId = await result.current.start("c");
    });
    expect(requestId).not.toBeNull();

    act(() => result.current.cancel("c"));

    expect(sendMock).toHaveBeenCalledWith({
      command: "cancel_generation",
      request_id: expect.any(String),
      data: { request_ids: [requestId] }
    });
    expect(clipOf("c").status).toBe("draft");
  });
});

describe("direct-gen writes and undo", () => {
  it("keeps a landed take when the edit before it is undone", async () => {
    addClip({ id: "c", bindingKind: "text-to-image", mediaType: "image" });
    act(() => doc.getState().patchClip("c", { name: "Renamed" }));
    const { result } = mountHook();
    let requestId: string | null = null;
    await act(async () => {
      requestId = await result.current.start("c");
    });
    land(requestId!, "asset-1");
    expect(clipOf("c")).toMatchObject({
      status: "generated",
      currentAssetId: "asset-1"
    });

    act(() => doc.temporal.getState().undo());

    expect(clipOf("c").name).toBe("c");
    expect(clipOf("c")).toMatchObject({
      status: "generated",
      currentAssetId: "asset-1"
    });
    expect(clipOf("c").versions.map((version) => version.assetId)).toEqual([
      "asset-1"
    ]);
  });

  it("does not record the generating status or the result as undo steps", async () => {
    addClip({ id: "c", bindingKind: "text-to-image", mediaType: "image" });
    const depth = doc.temporal.getState().pastStates.length;
    const { result } = mountHook();
    let requestId: string | null = null;
    await act(async () => {
      requestId = await result.current.start("c");
    });
    land(requestId!, "asset-1");
    expect(doc.temporal.getState().pastStates).toHaveLength(depth);
  });

  it("undo during a render leaves the clip generating", async () => {
    addClip({ id: "c", bindingKind: "text-to-image", mediaType: "image" });
    act(() => doc.getState().patchClip("c", { name: "Renamed" }));
    const { result } = mountHook();
    await act(async () => {
      await result.current.start("c");
    });

    act(() => doc.temporal.getState().undo());

    expect(clipOf("c").status).toBe("generating");
  });
});

describe("orphaned import placeholders", () => {
  it("fails an extracted-audio placeholder still generating on load", async () => {
    addClip({
      id: "audio",
      mediaType: "audio",
      sourceType: "imported",
      status: "generating",
      provider: undefined,
      model: undefined,
      prompt: undefined
    });
    addClip({
      id: "done",
      mediaType: "audio",
      sourceType: "imported",
      status: "generated",
      currentAssetId: "asset-audio"
    });

    await reattachSequenceJobs(doc, "seq-1");

    expect(clipOf("audio").status).toBe("failed");
    expect(clipOf("done").status).toBe("generated");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});
