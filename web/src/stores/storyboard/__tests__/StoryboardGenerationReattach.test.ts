/**
 * Batch reattachment and the measured-duration table (PRD § 7.4, D14, R4).
 *
 * Both facts outlive the surface: a board closed mid-batch must land the
 * assets whose replies arrive after it reopens, and a duration measured once
 * must still be there after a reload. Everything else in the generation store
 * is rebuilt from them.
 */

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {})
  }
}));

const lookupMock = jest.fn(async (_ids: readonly string[]) => new Map());
jest.mock("../../../lib/websocket/lookupGenerations", () => ({
  __esModule: true,
  isSettled: (status: string) => status !== "running",
  lookupGenerations: (ids: readonly string[]) => lookupMock(ids)
}));

import type { BoardRenderContext, Shot } from "@nodetool-ai/protocol";

import {
  durationBucketKey,
  measuredDurationMs,
  reattachBoardJobs,
  useStoryboardGenerationStore,
  __handleShotJobMessageForTests,
  __resetStoryboardSubscriptionsForTests,
  type PendingShotJob
} from "../StoryboardGenerationStore";
import { useStoryboardStore } from "../StoryboardStore";
import { useNotificationStore } from "../../NotificationStore";

const BOARD = "board-reattach";
const STORAGE_KEY = "nodetool-storyboard-generation";

const board: BoardRenderContext = {
  aspect_ratio: "16:9",
  image_model: "provider/still-v1",
  video_model: "provider/clip-v1",
  style_entity_id: null,
  style: "noir",
  scenes: null
};

const shot = (id: string): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: "a shot",
  status: "planned"
});

const boardShot = (shotId: string): Shot | undefined =>
  useStoryboardStore
    .getState()
    .getBoard(BOARD)
    ?.shots.find((candidate) => candidate.id === shotId);

const seedBoard = (shotId: string): Shot => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  const created = shot(shotId);
  store.upsertShot(BOARD, created);
  return created;
};

const resetGeneration = (): void => {
  useStoryboardGenerationStore.setState({
    shotJobs: {},
    jobToShot: {},
    generatingShotIds: [],
    failedShotIds: [],
    pendingJobs: {},
    durationSamples: {}
  });
};

beforeEach(() => {
  localStorage.clear();
  resetGeneration();
  // Default: no row to read, so every entry falls through to a subscription —
  // the case where the socket outlived the board.
  lookupMock.mockClear();
  lookupMock.mockResolvedValue(new Map());
  useNotificationStore.getState().clearNotifications();
});

afterEach(() => {
  __resetStoryboardSubscriptionsForTests();
});

describe("pending-job persistence", () => {
  it("writes the in-flight request to localStorage and drops it when it settles", () => {
    const target = seedBoard("s-persist");
    useStoryboardGenerationStore
      .getState()
      .registerJob(target.id, BOARD, "req-persist", "keyframe", {
        shot: target,
        board
      });

    const persisted = (): Record<string, PendingShotJob[]> =>
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").state.pendingJobs;

    expect(persisted()[BOARD]).toHaveLength(1);
    expect(persisted()[BOARD][0].jobId).toBe("req-persist");

    useStoryboardGenerationStore.getState().clear(target.id);
    expect(persisted()[BOARD]).toBeUndefined();
  });

  it("drops an entry older than the reattach window instead of restoring it", () => {
    const target = seedBoard("s-expired");
    const hourAgo = Date.now() - 60 * 60 * 1000;
    useStoryboardGenerationStore.setState({
      pendingJobs: {
        [BOARD]: [
          {
            shotId: target.id,
            jobId: "req-expired",
            kind: "keyframe",
            startedAt: hourAgo
          }
        ]
      }
    });

    const restored = useStoryboardGenerationStore
      .getState()
      .restorePendingJobs(BOARD);

    expect(restored).toEqual([]);
    expect(useStoryboardGenerationStore.getState().pendingJobs[BOARD]).toBeUndefined();
  });
});

describe("a board closed mid-batch and reopened", () => {
  it("shows the version whose reply arrived after the reopen", async () => {
    // 1. The batch starts, then the board (and the whole tab) goes away.
    const target = seedBoard("s-reattach");
    useStoryboardGenerationStore
      .getState()
      .registerJob(target.id, BOARD, "req-reattach", "keyframe", {
        shot: target,
        board
      });
    const written = localStorage.getItem(STORAGE_KEY);
    expect(written).not.toBeNull();

    // 2. A fresh session: no rows, only what localStorage rehydrated.
    resetGeneration();
    const rehydrated = JSON.parse(written as string).state;
    useStoryboardGenerationStore.setState({
      pendingJobs: rehydrated.pendingJobs,
      durationSamples: rehydrated.durationSamples
    });
    useStoryboardStore.getState().setShotStatus(BOARD, target.id, "planned");
    expect(
      useStoryboardGenerationStore.getState().shotJobs[target.id]
    ).toBeUndefined();

    // 3. The board opens and reconciles its pending request by id.
    await reattachBoardJobs(BOARD);
    expect(
      useStoryboardGenerationStore.getState().shotJobs[target.id]?.jobId
    ).toBe("req-reattach");
    expect(boardShot(target.id)?.status).toBe("keyframe_generating");

    // 4. The reply lands afterwards and becomes the shot's version.
    __handleShotJobMessageForTests(
      "req-reattach",
      { shotId: target.id, boardId: BOARD, kind: "keyframe" },
      {
        type: "rpc_response",
        request_id: "req-reattach",
        result: { asset_ids: ["asset-late"] }
      }
    );

    const settled = boardShot(target.id);
    expect(settled?.keyframe?.asset_id).toBe("asset-late");
    expect(settled?.status).toBe("keyframe_ready");
    // The record stamped before the close survived with it.
    expect(settled?.keyframe?.render_inputs?.model).toBe("provider/still-v1");
    expect(
      useStoryboardGenerationStore.getState().pendingJobs[BOARD]
    ).toBeUndefined();
  });
});

describe("measured durations", () => {
  it("records a finished render under its model and kind, and nothing else", () => {
    const target = seedBoard("s-measured");
    const store = useStoryboardGenerationStore.getState();
    store.registerJob(target.id, BOARD, "req-measured", "keyframe", {
      shot: target,
      board
    });
    store.updateJobStatus("req-measured", "completed", { assetId: "a-1" });

    const samples = useStoryboardGenerationStore.getState().durationSamples;
    expect(
      samples[durationBucketKey("keyframe", "provider/still-v1")]
    ).toHaveLength(1);
    // Nothing was measured for clips, or for any other model.
    expect(samples[durationBucketKey("clip", "provider/clip-v1")]).toBeUndefined();
  });

  it("measures nothing for a render with no board context", () => {
    const target = seedBoard("s-unmeasured");
    const store = useStoryboardGenerationStore.getState();
    store.registerJob(target.id, BOARD, "req-unmeasured", "clip");
    store.updateJobStatus("req-unmeasured", "completed", { assetId: "a-2" });

    expect(useStoryboardGenerationStore.getState().durationSamples).toEqual({});
  });

  it("takes the median so one slow first run does not set the estimate", () => {
    expect(measuredDurationMs(undefined)).toBeNull();
    expect(measuredDurationMs([])).toBeNull();
    expect(measuredDurationMs([9000])).toBe(9000);
    expect(measuredDurationMs([240000, 8000, 9000])).toBe(9000);
    expect(measuredDurationMs([8000, 10000])).toBe(9000);
  });

  it("keeps only the five most recent samples per bucket", () => {
    const target = seedBoard("s-cap");
    for (let i = 0; i < 7; i += 1) {
      const store = useStoryboardGenerationStore.getState();
      store.registerJob(target.id, BOARD, `req-cap-${i}`, "keyframe", {
        shot: target,
        board
      });
      store.updateJobStatus(`req-cap-${i}`, "completed", { assetId: `a-${i}` });
    }
    expect(
      useStoryboardGenerationStore.getState().durationSamples[
        durationBucketKey("keyframe", "provider/still-v1")
      ]
    ).toHaveLength(5);
  });
});

/**
 * The reload case, which re-subscribing alone cannot recover.
 *
 * A `generate_media` reply is an `rpc_response` with no `job_id` and no
 * `thread_id`, so it goes to the socket that asked and is dropped if that
 * socket has gone. A render that finished while the browser was shut had its
 * reply delivered to nobody, and no subscription made afterwards can produce
 * it. The generation row outlives the socket, so the board reads it.
 */
describe("a board reopened after a reload", () => {
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
          assetIds: ["asset-recovered"],
          error: null,
          ...over
        }
      ]
    ]);

  /** Register a job, then rehydrate into a fresh session as a reload would. */
  const reloadedWithPending = (shotId: string, requestId: string): Shot => {
    const target = seedBoard(shotId);
    useStoryboardGenerationStore
      .getState()
      .registerJob(target.id, BOARD, requestId, "keyframe", {
        shot: target,
        board
      });
    const written = localStorage.getItem(STORAGE_KEY) as string;
    resetGeneration();
    const rehydrated = JSON.parse(written).state;
    useStoryboardGenerationStore.setState({
      pendingJobs: rehydrated.pendingJobs,
      durationSamples: rehydrated.durationSamples
    });
    useStoryboardStore.getState().setShotStatus(BOARD, target.id, "planned");
    return target;
  };

  it("lands the version from the row when the render finished while shut", async () => {
    const target = reloadedWithPending("s-reload", "req-reload");
    lookupMock.mockResolvedValue(settled("req-reload"));

    await reattachBoardJobs(BOARD);

    const shotNow = boardShot(target.id);
    expect(shotNow?.keyframe?.asset_id).toBe("asset-recovered");
    expect(shotNow?.status).toBe("keyframe_ready");
    // The record stamped before the reload survived onto the version.
    expect(shotNow?.keyframe?.render_inputs?.model).toBe("provider/still-v1");
    expect(
      useStoryboardGenerationStore.getState().pendingJobs[BOARD]
    ).toBeUndefined();
  });

  it("marks the shot failed when the row says the render failed", async () => {
    const target = reloadedWithPending("s-reload-fail", "req-fail");
    lookupMock.mockResolvedValue(
      settled("req-fail", {
        status: "failed",
        assetIds: [],
        error: "provider refused"
      })
    );

    await reattachBoardJobs(BOARD);

    expect(
      useStoryboardGenerationStore.getState().shotJobs[target.id]?.status
    ).toBe("failed");
  });

  it("still subscribes when the row says the render is running", async () => {
    const target = reloadedWithPending("s-reload-running", "req-running");
    lookupMock.mockResolvedValue(
      settled("req-running", { status: "running", assetIds: [] })
    );

    await reattachBoardJobs(BOARD);

    expect(
      useStoryboardGenerationStore.getState().shotJobs[target.id]?.jobId
    ).toBe("req-running");
    expect(boardShot(target.id)?.status).toBe("keyframe_generating");
  });
});
