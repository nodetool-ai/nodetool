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
  settleCancelledShotJob,
  __handleShotJobMessageForTests,
  __resetStoryboardSubscriptionsForTests,
  type StoryboardJobContext
} from "../StoryboardGenerationStore";
import { useStoryboardStore } from "../StoryboardStore";
import { useNotificationStore } from "../../NotificationStore";

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

describe("cancelled jobs", () => {
  it("settles a cancelled keyframe job back to planned when the shot has no still", () => {
    seedShot("s-cxl");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-cxl", BOARD, "job-cxl", "wf", "keyframe");

    __handleShotJobMessageForTests("job-cxl", context("s-cxl", "keyframe"), {
      type: "job_update",
      status: "cancelled"
    } as never);

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-cxl");
    expect(shot?.status).toBe("planned");
    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-cxl"]
    ).toBeUndefined();
  });

  it("keeps an existing still when a cancelled regenerate settles", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s-regen",
      index: 0,
      action: "test shot",
      status: "keyframe_ready",
      keyframe: { type: "image", uri: "asset://still" }
    } as never);
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-regen", BOARD, "job-regen", "wf", "keyframe");

    settleCancelledShotJob("s-regen");

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-regen");
    expect(shot?.status).toBe("keyframe_ready");
    expect(shot?.keyframe?.uri).toBe("asset://still");
  });

  it("settles a cancelled clip job back to keyframe_ready", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s-clip-cxl",
      index: 0,
      action: "test shot",
      status: "clip_generating",
      keyframe: { type: "image", uri: "asset://still" }
    } as never);
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-clip-cxl", BOARD, "job-clip-cxl", "wf", "clip");

    settleCancelledShotJob("s-clip-cxl");

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-clip-cxl");
    expect(shot?.status).toBe("keyframe_ready");
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

describe("direct generation responses (generate_media rpc)", () => {
  const directContext = (shotId: string) => ({
    shotId,
    boardId: BOARD,
    kind: "keyframe" as const
  });

  beforeEach(() => {
    useNotificationStore.getState().clearNotifications();
  });

  it("writes the returned asset onto the shot and clears the job", () => {
    seedShot("s-direct");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-direct", BOARD, "req-1", "", "keyframe");

    __handleShotJobMessageForTests(
      "req-1",
      directContext("s-direct"),
      {
        type: "rpc_response",
        request_id: "req-1",
        result: { asset_ids: ["ast-1"] }
      } as never
    );

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-direct");
    expect(shot?.status).toBe("keyframe_ready");
    expect(shot?.keyframe?.asset_id).toBe("ast-1");
    expect(shot?.keyframe?.uri).toBe("asset://ast-1");
    // A completed job leaves no row behind — the shot is settled.
    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-direct"]
    ).toBeUndefined();
  });

  it("fails the shot and keeps the reason when the rpc carries an error", () => {
    seedShot("s-direct-err");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-direct-err", BOARD, "req-2", "", "keyframe");

    __handleShotJobMessageForTests(
      "req-2",
      directContext("s-direct-err"),
      {
        type: "rpc_response",
        request_id: "req-2",
        error: { code: "INTERNAL_ERROR", message: "model unavailable" }
      } as never
    );

    const job =
      useStoryboardGenerationStore.getState().shotJobs["s-direct-err"];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("model unavailable");
    expect(useStoryboardStore.getState().getBoard(BOARD)?.shots.find((s) => s.id === "s-direct-err")?.status).toBe("failed");
    expect(
      useNotificationStore.getState().notifications.at(-1)?.content
    ).toContain("model unavailable");
  });

  it("reports an rpc_response that names no asset", () => {
    seedShot("s-direct-empty");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-direct-empty", BOARD, "req-3", "", "keyframe");

    __handleShotJobMessageForTests(
      "req-3",
      directContext("s-direct-empty"),
      {
        type: "rpc_response",
        request_id: "req-3",
        result: {}
      } as never
    );

    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-direct-empty"]
        ?.errorMessage
    ).toContain("returned no asset");
  });

  it("ignores a workflow job's context for rpc messages", () => {
    seedShot("s-wf-rpc");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-wf-rpc", BOARD, "job-wf-rpc", "wf-x", "keyframe");

    __handleShotJobMessageForTests(
      "job-wf-rpc",
      context("s-wf-rpc", "keyframe"),
      {
        type: "rpc_response",
        request_id: "job-wf-rpc",
        result: { asset_ids: ["ast-x"] }
      } as never
    );

    // The workflow job is untouched — only a direct request settles on rpc.
    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-wf-rpc"]?.status
    ).toBe("queued");
  });
});

describe("failure reporting", () => {
  beforeEach(() => {
    useNotificationStore.getState().clearNotifications();
  });

  it("keeps the job error and notifies when a job fails", () => {
    seedShot("s-fail");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-fail", BOARD, "job-fail", "wf", "keyframe");

    __handleShotJobMessageForTests("job-fail", context("s-fail", "keyframe"), {
      type: "job_update",
      status: "failed",
      error: "Provider rejected the prompt"
    } as never);

    const job = useStoryboardGenerationStore.getState().shotJobs["s-fail"];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("Provider rejected the prompt");

    const notification =
      useNotificationStore.getState().notifications.at(-1);
    expect(notification?.type).toBe("error");
    expect(notification?.content).toContain("Provider rejected the prompt");
  });

  it("reports a completed job that produced no output", () => {
    seedShot("s-empty");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s-empty", BOARD, "job-empty", "wf", "keyframe");

    __handleShotJobMessageForTests("job-empty", context("s-empty", "keyframe"), {
      type: "job_update",
      status: "completed"
    } as never);

    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-empty"]?.errorMessage
    ).toBe("Workflow finished without producing an output.");
    expect(
      useNotificationStore.getState().notifications.at(-1)?.content
    ).toContain("Workflow finished without producing an output.");
  });

  it("records a failure that happened before any job existed", () => {
    seedShot("s-unstarted");
    useStoryboardGenerationStore
      .getState()
      .recordStartFailure("s-unstarted", BOARD, "keyframe", "No model chosen");

    const job =
      useStoryboardGenerationStore.getState().shotJobs["s-unstarted"];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("No model chosen");
    expect(
      useStoryboardGenerationStore.getState().failedShotIds
    ).toContain("s-unstarted");
    expect(
      useStoryboardStore
        .getState()
        .getBoard(BOARD)
        ?.shots.find((s) => s.id === "s-unstarted")?.status
    ).toBe("failed");
    expect(
      useNotificationStore.getState().notifications.at(-1)?.content
    ).toContain("No model chosen");
  });
});
