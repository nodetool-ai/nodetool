/**
 * @jest-environment jsdom
 *
 * The agent's drafted `ui_timeline_plan_beats` during the guided video flow
 * must make the same run the flow's Plan button makes (V6).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { makeClip } from "@nodetool-ai/timeline";

import {
  createTimelineStore,
  type TimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  createTimelineUIStore,
  type TimelineUIStoreApi
} from "../../../stores/timeline/TimelineUIStore";
import {
  createTimelinePlaybackStore,
  type TimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelinePlaybackStore";
import { getTimelineAgentHandler } from "../../../components/timeline/timelineAgentBridge";
import { rpcRequest } from "../../../lib/websocket/rpcRequest";
import { useTimelineAgentBridge } from "../useTimelineAgentBridge";
import {
  PLAN_CANCELED,
  PLAN_IN_PROGRESS,
  planContextOf,
  usePlanBeats,
  videoPlanFingerprint
} from "../usePlanBeats";

let mockDoc: TimelineStoreApi;
let mockUi: TimelineUIStoreApi;
let mockPlayback: TimelinePlaybackStoreApi;

jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn(async () => ({}))
}));
jest.mock("../../../stores/timeline/TimelineStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineStore"),
  useTimelineStoreApi: () => mockDoc
}));
jest.mock("../../../stores/timeline/TimelineUIStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelineUIStore"),
  useTimelineUIStoreApi: () => mockUi
}));
jest.mock("../../../stores/timeline/TimelinePlaybackStore", () => ({
  ...jest.requireActual("../../../stores/timeline/TimelinePlaybackStore"),
  useTimelinePlaybackStoreApi: () => mockPlayback
}));
jest.mock("../useTimelineDirectGenJob", () => ({
  ...jest.requireActual("../useTimelineDirectGenJob"),
  useTimelineDirectGenJob: () => ({ start: jest.fn(), startEdit: jest.fn() })
}));

const SEQ_ID = "seq-plan";
const mockRpc = rpcRequest as jest.Mock;

beforeEach(() => {
  mockDoc = createTimelineStore();
  mockDoc.setState({ sequenceId: SEQ_ID });
  mockUi = createTimelineUIStore();
  mockPlayback = createTimelinePlaybackStore();
  mockRpc.mockReset();
  mockRpc.mockImplementation(async () => ({}));
});

describe("useTimelineAgentBridge planBeats in the guided flow (V6)", () => {
  it("plans on the picked model, over the dropped clips, and records the inputs", async () => {
    mockDoc.getState().addTrack("video", "Video");
    const trackId = mockDoc.getState().tracks[0].id;
    mockDoc.getState().addClip(
      makeClip({
        id: "dropped-1",
        name: "kerb.mp4",
        trackId,
        mediaType: "video",
        sourceType: "imported",
        startMs: 0,
        durationMs: 3000
      })
    );
    mockDoc.getState().setSetup({
      stage: "format",
      brief: "a paper boat",
      format: "ad-15",
      directorModel: { id: "my-model", provider: "openai" }
    } as never);
    renderHook(() => useTimelineAgentBridge(SEQ_ID));

    const beats = await getTimelineAgentHandler(SEQ_ID).planBeats({});

    expect(mockRpc).toHaveBeenCalledWith(
      "generate_text",
      expect.objectContaining({ provider: "openai", model: "my-model" }),
      undefined,
      expect.any(AbortSignal)
    );
    // One beat per dropped clip, still linked to it.
    expect(beats).toHaveLength(1);
    expect(beats[0].source_clip_id).toBe("dropped-1");
    const setup = mockDoc.getState().setup;
    expect(setup?.stage).toBe("review");
    expect(setup?.["planFingerprint"]).toBe(
      videoPlanFingerprint({
        brief: "a paper boat",
        formatId: "ad-15",
        context: planContextOf(mockDoc)
      })
    );
  });
});

/** A Director answer the test releases by hand. */
const holdDirector = (): (() => void) => {
  let answer: (value: Record<string, unknown>) => void = () => undefined;
  mockRpc.mockImplementation(
    (_command: string, _data: unknown, _options: unknown, signal?: AbortSignal) =>
      new Promise((resolve, reject) => {
        answer = resolve;
        signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      })
  );
  return () => answer({});
};

const seedFormat = () =>
  mockDoc.getState().setSetup({
    stage: "format",
    brief: "a paper boat",
    format: "ad-15"
  });

describe("one Director run per sequence, flow or agent (V5)", () => {
  it("refuses the agent's plan while the flow's plan runs", async () => {
    seedFormat();
    const release = holdDirector();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    const flow = renderHook(() => usePlanBeats());

    let flowPlan: Promise<boolean> = Promise.resolve(false);
    act(() => {
      flowPlan = flow.result.current.plan();
    });

    await expect(
      getTimelineAgentHandler(SEQ_ID).planBeats({})
    ).rejects.toThrow(PLAN_IN_PROGRESS);
    await expect(
      getTimelineAgentHandler(SEQ_ID).planBeats({
        beats: [{ prompt: "the kerb", duration_ms: 3000 }]
      } as never)
    ).rejects.toThrow(PLAN_IN_PROGRESS);
    expect(mockRpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await flowPlan;
    });
    // The flow's answer was kept, not dropped as a changed setup.
    expect(mockDoc.getState().setup?.stage).toBe("review");
  });

  it("holds the flow on the agent's plan, and the flow can cancel it", async () => {
    seedFormat();
    holdDirector();
    renderHook(() => useTimelineAgentBridge(SEQ_ID));
    const flow = renderHook(() => usePlanBeats());

    let agentPlan: Promise<unknown> = Promise.resolve();
    act(() => {
      agentPlan = getTimelineAgentHandler(SEQ_ID).planBeats({});
    });
    await waitFor(() => expect(flow.result.current.planning).toBe(true));
    await expect(
      act(() => flow.result.current.plan())
    ).rejects.toThrow(PLAN_IN_PROGRESS);
    expect(mockRpc).toHaveBeenCalledTimes(1);

    act(() => flow.result.current.cancel());
    await expect(agentPlan).rejects.toThrow(PLAN_CANCELED);
    expect(flow.result.current.planning).toBe(false);
    expect(mockDoc.getState().setup?.stage).toBe("format");
    expect(mockDoc.getState().setup?.beats ?? []).toHaveLength(0);
  });
});
