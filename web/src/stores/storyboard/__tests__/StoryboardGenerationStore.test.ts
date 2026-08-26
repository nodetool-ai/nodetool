/**
 * @jest-environment node
 *
 * Regression tests for the storyboard render path. Every render is a direct
 * `generate_media` request, so the store settles on one `rpc_response`:
 *  - a returned asset lands on the shot and clears the row
 *  - an error keeps the row so the card can read the reason, and notifies
 *  - a cancel restores the status the shot already held
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
  type DirectShotJobContext
} from "../StoryboardGenerationStore";
import { useStoryboardStore } from "../StoryboardStore";
import { useNotificationStore } from "../../NotificationStore";

const BOARD = "board-t";

const context = (
  shotId: string,
  kind: "keyframe" | "clip"
): DirectShotJobContext => ({ shotId, boardId: BOARD, kind });

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

describe("direct generation responses (generate_media rpc)", () => {
  beforeEach(() => {
    useNotificationStore.getState().clearNotifications();
  });

  it("registers a sent request as running — there is no server queue", () => {
    seedShot("s-running");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-running", BOARD, "req-0", "keyframe");

    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-running"]?.status
    ).toBe("running");
    expect(
      useStoryboardGenerationStore.getState().generatingShotIds
    ).toContain("s-running");
  });

  it("writes the returned asset onto the shot and clears the job", () => {
    seedShot("s-direct");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-direct", BOARD, "req-1", "keyframe");

    __handleShotJobMessageForTests("req-1", context("s-direct", "keyframe"), {
      type: "rpc_response",
      request_id: "req-1",
      result: { asset_ids: ["ast-1"] }
    } as never);

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-direct");
    expect(shot?.status).toBe("keyframe_ready");
    expect(shot?.keyframe?.asset_id).toBe("ast-1");
    expect(shot?.keyframe?.uri).toBe("asset://ast-1");
    // A completed request leaves no row behind — the shot is settled.
    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-direct"]
    ).toBeUndefined();
  });

  it("writes a clip asset and marks the shot rendered", () => {
    seedShot("s-direct-clip");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-direct-clip", BOARD, "req-clip", "clip");

    __handleShotJobMessageForTests(
      "req-clip",
      context("s-direct-clip", "clip"),
      {
        type: "rpc_response",
        request_id: "req-clip",
        result: { asset_ids: ["ast-clip"] }
      } as never
    );

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-direct-clip");
    expect(shot?.status).toBe("rendered");
    expect(shot?.clip?.asset_id).toBe("ast-clip");
  });

  it("fails the shot and keeps the reason when the rpc carries an error", () => {
    seedShot("s-direct-err");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-direct-err", BOARD, "req-2", "keyframe");

    __handleShotJobMessageForTests(
      "req-2",
      context("s-direct-err", "keyframe"),
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
    expect(
      useStoryboardStore
        .getState()
        .getBoard(BOARD)
        ?.shots.find((s) => s.id === "s-direct-err")?.status
    ).toBe("failed");
    expect(
      useNotificationStore.getState().notifications.at(-1)?.content
    ).toContain("model unavailable");
  });

  it("reports an rpc_response that names no asset", () => {
    seedShot("s-direct-empty");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-direct-empty", BOARD, "req-3", "keyframe");

    __handleShotJobMessageForTests(
      "req-3",
      context("s-direct-empty", "keyframe"),
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
});

describe("cancelled renders", () => {
  it("settles a cancelled keyframe render back to planned when the shot has no still", () => {
    seedShot("s-cxl");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-cxl", BOARD, "req-cxl", "keyframe");

    settleCancelledShotJob("s-cxl");

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
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-regen", BOARD, "req-regen", "keyframe");

    settleCancelledShotJob("s-regen");

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-regen");
    expect(shot?.status).toBe("keyframe_ready");
    expect(shot?.keyframe?.uri).toBe("asset://still");
  });

  it("settles a cancelled clip render back to keyframe_ready", () => {
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
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-clip-cxl", BOARD, "req-clip-cxl", "clip");

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
    gen.registerJob("s-plain", BOARD, "req-plain", "keyframe");
    gen.updateJobStatus("req-plain", "completed", {});

    const job = useStoryboardGenerationStore.getState().shotJobs["s-plain"];
    expect(job?.status).toBe("completed");
    expect(job?.errorMessage).toBeUndefined();
  });
});

describe("failure reporting", () => {
  beforeEach(() => {
    useNotificationStore.getState().clearNotifications();
  });

  it("records a failure that happened before the request was sent", () => {
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
