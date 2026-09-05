/**
 * @jest-environment jsdom
 *
 * jsdom, not node: the store persists its pending-job list to localStorage,
 * and zustand warns on every write when there is none.
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
import type { BoardRenderContext, Shot } from "@nodetool-ai/protocol";
import { isVersionStale } from "@nodetool-ai/protocol";
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

/**
 * Render records (PRD § 7.7.4, criterion 8).
 *
 * The record is taken when the job is enqueued, not when the asset lands, so a
 * render that finishes after a style change reads stale against the board it
 * finished on.
 */
describe("render record on enqueue and land", () => {
  const boardA: BoardRenderContext = {
    aspect_ratio: "16:9",
    image_model: "fal-ai/flux/dev",
    video_model: "fal-ai/kling/v2",
    style_entity_id: "ent-noir",
    style: "high-contrast noir, hard shadows",
    scenes: null
  };
  const boardB: BoardRenderContext = {
    ...boardA,
    style_entity_id: "ent-pastel",
    style: "soft pastel daylight"
  };

  const shotOf = (shotId: string): Shot => {
    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === shotId);
    if (!shot) {
      throw new Error(`shot ${shotId} was not seeded`);
    }
    return shot;
  };

  /** Enqueue with `render`, then land one asset on the shot. */
  const enqueueAndLand = (
    shotId: string,
    requestId: string,
    kind: "keyframe" | "clip",
    render?: { shot: Shot; board: BoardRenderContext }
  ): void => {
    useStoryboardGenerationStore
      .getState()
      .registerJob(shotId, BOARD, requestId, kind, render);
    __handleShotJobMessageForTests(requestId, context(shotId, kind), {
      type: "rpc_response",
      request_id: requestId,
      result: { asset_ids: [`ast-${requestId}`] }
    } as never);
  };

  it("a still enqueued before a style change reads stale after it lands", () => {
    seedShot("s-stale");
    const shot = shotOf("s-stale");

    // Enqueued against board A…
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-stale", BOARD, "req-stale", "keyframe", {
        shot,
        board: boardA
      });
    // …the style changes while the render is in flight, and only then does the
    // asset arrive.
    __handleShotJobMessageForTests(
      "req-stale",
      context("s-stale", "keyframe"),
      {
        type: "rpc_response",
        request_id: "req-stale",
        result: { asset_ids: ["ast-stale"] }
      } as never
    );

    const landed = shotOf("s-stale");
    expect(landed.keyframe?.render_inputs).toBeDefined();
    expect(isVersionStale(landed.keyframe, landed, boardB)).toBe(true);
    // Against the board it was enqueued on it is current — which is what
    // proves the record was taken at enqueue and not at landing.
    expect(isVersionStale(landed.keyframe, landed, boardA)).toBe(false);
  });

  it("records the shot as it read at enqueue, not as it reads on landing", () => {
    seedShot("s-timing");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-timing", BOARD, "req-timing", "keyframe", {
        shot: shotOf("s-timing"),
        board: boardA
      });
    // The action is rewritten while the render is in flight. A record stamped
    // on landing would hash the new action and read current; the enqueue-time
    // record hashes the action that was actually rendered, so the landed still
    // is stale.
    useStoryboardStore
      .getState()
      .updateShot(BOARD, "s-timing", { action: "a different action entirely" });
    __handleShotJobMessageForTests(
      "req-timing",
      context("s-timing", "keyframe"),
      {
        type: "rpc_response",
        request_id: "req-timing",
        result: { asset_ids: ["ast-timing"] }
      } as never
    );

    const landed = shotOf("s-timing");
    expect(isVersionStale(landed.keyframe, landed, boardA)).toBe(true);
  });

  it("a still enqueued and landed on the same board reads current", () => {
    seedShot("s-current");
    enqueueAndLand("s-current", "req-current", "keyframe", {
      shot: shotOf("s-current"),
      board: boardA
    });

    const landed = shotOf("s-current");
    expect(isVersionStale(landed.keyframe, landed, boardA)).toBe(false);
  });

  it("a version that lands without a record is never stale", () => {
    seedShot("s-legacy");
    enqueueAndLand("s-legacy", "req-legacy", "keyframe");

    const landed = shotOf("s-legacy");
    expect(landed.keyframe?.render_inputs).toBeUndefined();
    expect(isVersionStale(landed.keyframe, landed, boardB)).toBe(false);
  });

  it("records the board's still model for a keyframe", () => {
    seedShot("s-model-still");
    enqueueAndLand("s-model-still", "req-model-still", "keyframe", {
      shot: shotOf("s-model-still"),
      board: boardA
    });

    const record = shotOf("s-model-still").keyframe?.render_inputs;
    expect(record?.kind).toBe("keyframe");
    expect(record?.model).toBe(boardA.image_model);
    expect(record?.aspect_ratio).toBe(boardA.aspect_ratio);
    expect(record?.style_entity_id).toBe(boardA.style_entity_id);
  });

  it("records the board's video model for a clip", () => {
    seedShot("s-model-clip");
    enqueueAndLand("s-model-clip", "req-model-clip", "clip", {
      shot: shotOf("s-model-clip"),
      board: boardA
    });

    const record = shotOf("s-model-clip").clip?.render_inputs;
    expect(record?.kind).toBe("clip");
    expect(record?.model).toBe(boardA.video_model);
  });
});
