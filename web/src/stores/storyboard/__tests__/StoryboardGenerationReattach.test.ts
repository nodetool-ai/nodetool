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
