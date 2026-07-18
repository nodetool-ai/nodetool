/**
 * @jest-environment node
 *
 * Regression tests for the storyboard job completion path:
 *  - inline `data` outputs (no asset_id/uri) are successes, not failures
 *  - updateJobStatus never reclassifies a completed job as failed
 */

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {})
  }
}));

import {
  useStoryboardGenerationStore,
  __handleShotJobMessageForTests,
  __resetStoryboardSubscriptionsForTests,
  type StoryboardJobContext
} from "../StoryboardGenerationStore";
import { useStoryboardStore } from "../StoryboardStore";

const BOARD = "board-t";
const context = (shotId: string, kind: "keyframe" | "clip"): StoryboardJobContext => ({
  shotId,
  boardId: BOARD,
  workflowId: `wf-${shotId}`,
  kind,
  outputNodeId: "out"
});

const seedShot = (shotId: string): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, {
    type: "shot",
    id: shotId,
    index: 0,
    action: "test shot",
    status: "planned"
  });
};

afterEach(() => {
  __resetStoryboardSubscriptionsForTests();
});

describe("inline data outputs", () => {
  it("completes a keyframe job whose image ref has only inline data", () => {
    seedShot("s-img");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-img", BOARD, "job-img", "wf-s-img", "keyframe");

    __handleShotJobMessageForTests("job-img", context("s-img", "keyframe"), {
      type: "output_update",
      node_id: "out",
      value: { type: "image", data: "aGVsbG8=" }
    } as never);
    __handleShotJobMessageForTests("job-img", context("s-img", "keyframe"), {
      type: "job_update",
      status: "completed"
    } as never);

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-img");
    expect(shot?.status).toBe("keyframe_ready");
    expect(shot?.keyframe?.data).toBe("aGVsbG8=");
    expect(
      useStoryboardGenerationStore.getState().failedShotIds
    ).not.toContain("s-img");
  });

  it("completes a clip job whose video ref has only inline data", () => {
    seedShot("s-vid");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-vid", BOARD, "job-vid", "wf-s-vid", "clip");

    __handleShotJobMessageForTests("job-vid", context("s-vid", "clip"), {
      type: "output_update",
      node_id: "out",
      value: { type: "video", data: "d29ybGQ=" }
    } as never);
    __handleShotJobMessageForTests("job-vid", context("s-vid", "clip"), {
      type: "job_update",
      status: "completed"
    } as never);

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-vid");
    expect(shot?.status).toBe("rendered");
    expect(shot?.clip?.data).toBe("d29ybGQ=");
    expect(
      useStoryboardGenerationStore.getState().failedShotIds
    ).not.toContain("s-vid");
  });
});

describe("updateJobStatus", () => {
  it("keeps a completed job completed when no assetId is supplied", () => {
    seedShot("s-plain");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-plain", BOARD, "job-plain", "wf", "keyframe");
    gen.updateJobStatus("job-plain", "completed", {});

    const job = useStoryboardGenerationStore.getState().shotJobs["s-plain"];
    expect(job?.status).toBe("completed");
    expect(job?.errorMessage).toBeUndefined();
  });
});
