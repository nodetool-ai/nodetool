/**
 * @jest-environment jsdom
 *
 * Request-scoped direct-gen jobs (F5, F6, F14, F37, F39, F40, F65).
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
  detachSequenceJobs,
  reattachSequenceJobs,
  subscribeDirectGen,
  useTimelineDirectGenJob
} from "../useTimelineDirectGenJob";
import { useDirectGenPendingStore } from "../directGenPending";
import { useNotificationStore } from "../../../stores/NotificationStore";
import type { TimelineClip } from "@nodetool-ai/timeline";

let instance: TimelineInstance;
let doc: TimelineStoreApi;

const addClip = (overrides: Partial<TimelineClip> & { id: string }): void => {
  if (!doc.getState().tracks[0]) act(() => doc.getState().addTrack("video", "V"));
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

describe("direct-gen request scope", () => {
  it("sends text-to-music as mode music (F14)", async () => {
    addClip({ id: "m", bindingKind: "text-to-music", mediaType: "audio" });
    const { result } = mountHook();
    await act(async () => {
      await result.current.start("m");
    });
    const frame = sendMock.mock.calls[0][0] as { data: { mode: string } };
    expect(frame.data.mode).toBe("music");
  });

  it("sends one request when a storyboard-linked clip is started twice at once (F40)", async () => {
    addClip({
      id: "sb",
      bindingKind: "text-to-image",
      storyboardBoardId: "board",
      storyboardShotId: "shot"
    });
    storyboardQueryMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ document: { shots: [{ id: "shot" }] } }),
            10
          )
        )
    );
    const { result } = mountHook();
    let results: Array<string | null> = [];
    await act(async () => {
      results = await Promise.all([
        result.current.start("sb"),
        result.current.start("sb")
      ]);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("refuses start while a New take is in flight and keeps its pending entry (F6)", async () => {
    addClip({ id: "c", bindingKind: "text-to-image" });
    subscribeDirectGen(instance.doc, "c", "take-req", "seq-1", Date.now() + 1000, undefined, undefined, true);
    useDirectGenPendingStore.getState().remember("seq-1", {
      clipId: "c",
      requestId: "take-req",
      startedAt: Date.now(),
      bucket: "b",
      candidateOnly: true
    });
    const { result } = mountHook();
    let requestId: string | null = "x";
    await act(async () => {
      requestId = await result.current.start("c");
    });
    expect(requestId).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
    expect(handlers.has("take-req")).toBe(true);
    expect(
      useDirectGenPendingStore
        .getState()
        .pending["seq-1"]?.some((j) => j.requestId === "take-req")
    ).toBe(true);
  });

  it("remembering a plain request keeps another request's entry on the clip (F6)", () => {
    const store = useDirectGenPendingStore.getState();
    store.remember("seq-1", {
      clipId: "c",
      requestId: "take-req",
      startedAt: Date.now(),
      bucket: "b",
      candidateOnly: true
    });
    store.remember("seq-1", {
      clipId: "c",
      requestId: "plain-req",
      startedAt: Date.now(),
      bucket: "b"
    });
    expect(
      useDirectGenPendingStore.getState().pending["seq-1"]?.map((j) => j.requestId)
    ).toEqual(["take-req", "plain-req"]);
  });

  it("detaching on editor close unsubscribes but keeps the pending entry (F5)", async () => {
    addClip({ id: "c", bindingKind: "text-to-image" });
    const { result } = mountHook();
    let requestId: string | null = null;
    await act(async () => {
      requestId = await result.current.start("c");
    });
    expect(requestId).not.toBeNull();
    detachSequenceJobs("seq-1");
    expect(unsubscribeMocks.get(requestId as unknown as string)).toHaveBeenCalled();
    expect(
      useDirectGenPendingStore.getState().pending["seq-1"]?.[0]?.requestId
    ).toBe(requestId);
  });

  it("records the params submitted, not the ones edited during the render (F37)", async () => {
    addClip({ id: "c", bindingKind: "text-to-image", prompt: "original" });
    const { result } = mountHook();
    let requestId = "";
    await act(async () => {
      requestId = (await result.current.start("c")) as string;
    });
    act(() => doc.getState().patchClip("c", { prompt: "edited mid-render" }));
    act(() => {
      handlers.get(requestId)?.({
        type: "rpc_response",
        request_id: requestId,
        result: { asset_ids: ["asset-1"] }
      });
    });
    const version = clipOf("c").versions?.find((v) => v.assetId === "asset-1");
    expect(version?.paramOverridesSnapshot).toMatchObject({ prompt: "original" });
  });

  it("fails an orphaned generating clip on reattach, with a notification (F39)", async () => {
    addClip({ id: "c", bindingKind: "text-to-image", status: "generating" });
    await reattachSequenceJobs(instance.doc, "seq-1");
    expect(clipOf("c").status).toBe("failed");
    expect(useNotificationStore.getState().notifications.length).toBeGreaterThan(0);
  });

  it("leaves a generating clip alone when its request is live (F39)", async () => {
    addClip({ id: "c", bindingKind: "text-to-image" });
    const { result } = mountHook();
    await act(async () => {
      await result.current.start("c");
    });
    await reattachSequenceJobs(instance.doc, "seq-1");
    expect(clipOf("c").status).toBe("generating");
  });

  it("says why a start was refused (F65)", async () => {
    addClip({ id: "c", bindingKind: "text-to-image", prompt: "  " });
    const { result } = mountHook();
    await act(async () => {
      await result.current.start("c");
    });
    expect(clipOf("c").status).toBe("failed");
    const notes = useNotificationStore.getState().notifications;
    expect(notes.some((n) => /prompt is empty/.test(n.content))).toBe(true);
  });

  it("cancelling a render does not cancel an edit on the same clip (F6)", async () => {
    addClip({ id: "c", bindingKind: "text-to-image" });
    subscribeDirectGen(instance.doc, "c", "take-req", "seq-1", Date.now() + 1000, undefined, undefined, true);
    const { result } = mountHook();
    await act(async () => {
      await result.current.start("c").catch(() => null);
    });
    // start refused (take in flight); a plain cancel with only a take open
    // falls back to the take, and a scoped edit cancel leaves it alone.
    act(() => result.current.cancelEdit("c"));
    expect(handlers.has("take-req")).toBe(true);
  });
});
