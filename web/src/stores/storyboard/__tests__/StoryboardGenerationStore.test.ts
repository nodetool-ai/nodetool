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
  stopTrackingShotRequest,
  __handleShotJobMessageForTests,
  __resetStoryboardSubscriptionsForTests,
  type DirectShotJobContext
} from "../StoryboardGenerationStore";
import type { BoardRenderContext, Shot } from "@nodetool-ai/protocol";
import { isVersionStale } from "@nodetool-ai/protocol";
import {
  compileProductionCandidates,
  type CompiledProductionCandidate
} from "@nodetool-ai/timeline";
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
    expect(useStoryboardGenerationStore.getState().generatingShotIds).toContain(
      "s-running"
    );
  });

  it("selects the first returned still on its shot and clears the job", () => {
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
    expect(shot?.keyframe_versions?.[0]).toMatchObject({
      asset_id: "ast-1",
      uri: "asset://ast-1"
    });
    // A completed request leaves no row behind — the shot is settled.
    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-direct"]
    ).toBeUndefined();
  });

  it("records a returned clip as a candidate until it is accepted", () => {
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
    expect(shot?.status).toBe("planned");
    expect(shot?.clip).toBeUndefined();
    expect(shot?.clip_versions?.[0]?.asset_id).toBe("ast-clip");
  });

  it("keeps accepted media current when a new direct result arrives", () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s-regen-preserve",
      index: 0,
      action: "test shot",
      status: "keyframe_ready",
      keyframe: {
        type: "image",
        uri: "asset://accepted",
        asset_id: "accepted"
      }
    });
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-regen-preserve", BOARD, "req-regen-preserve", "keyframe");

    __handleShotJobMessageForTests(
      "req-regen-preserve",
      context("s-regen-preserve", "keyframe"),
      {
        type: "rpc_response",
        request_id: "req-regen-preserve",
        result: { asset_ids: ["candidate"] }
      } as never
    );

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((value) => value.id === "s-regen-preserve");
    expect(shot?.keyframe?.asset_id).toBe("accepted");
    expect(shot?.keyframe_versions?.map((version) => version.asset_id)).toEqual(
      ["accepted", "candidate"]
    );
    expect(shot?.status).toBe("keyframe_ready");
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

describe("production candidate responses", () => {
  const candidatesFor = (shotId: string): CompiledProductionCandidate[] =>
    compileProductionCandidates({
      batchId: "batch-storyboard",
      destinationId: shotId,
      destinationKind: "storyboard_shot",
      operation: "initial_generation",
      prompt: "three reviewed takes",
      requirement: {
        schema_version: 1,
        speech_mode: "none",
        requested_take_count: 3
      },
      routeSupport: {
        referenceToVideo: true,
        audioDrivenPerformance: false
      }
    });

  it("lands out-of-order takes as inactive candidates in variation order", () => {
    const shotId = "s-production-order";
    seedShot(shotId);
    const candidates = candidatesFor(shotId);
    const third = candidates[2];
    const first = candidates[0];
    if (!third || !first) throw new Error("Expected production candidates.");
    for (const production of [third, first]) {
      useStoryboardGenerationStore
        .getState()
        .registerJob(
          shotId,
          BOARD,
          production.identity.requestId,
          "clip",
          undefined,
          undefined,
          "planned",
          production
        );
    }

    for (const [production, assetId] of [
      [third, "asset-3"],
      [first, "asset-1"]
    ] as const) {
      __handleShotJobMessageForTests(
        production.identity.requestId,
        {
          shotId,
          boardId: BOARD,
          kind: "clip",
          acceptedShotStatus: "planned",
          production
        },
        {
          type: "rpc_response",
          request_id: production.identity.requestId,
          result: { asset_ids: [assetId] }
        } as never
      );
    }

    const landed = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((candidate) => candidate.id === shotId);
    expect(landed?.clip).toBeUndefined();
    expect(
      landed?.clip_versions?.map((version) => version.variationIndex)
    ).toEqual([1, 3]);
    expect(landed?.status).toBe("planned");
  });
});

describe("cancelled renders", () => {
  it("stops local tracking without claiming to cancel the provider request", () => {
    seedShot("s-cxl");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s-cxl", BOARD, "req-cxl", "keyframe");

    stopTrackingShotRequest("req-cxl");

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-cxl");
    expect(shot?.status).toBe("planned");
    expect(
      useStoryboardGenerationStore.getState().shotJobs["s-cxl"]?.status
    ).toBe("stopped");
    expect(
      useStoryboardGenerationStore.getState().requestRecords["req-cxl"]?.status
    ).toBe("stopped");
    expect(
      useStoryboardGenerationStore.getState().pendingJobs[BOARD]
    ).toContainEqual(expect.objectContaining({ jobId: "req-cxl" }));
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

    stopTrackingShotRequest("req-regen");

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

    stopTrackingShotRequest("req-clip-cxl");

    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s-clip-cxl");
    expect(shot?.status).toBe("keyframe_ready");
  });
});

describe("persistent request receipts", () => {
  it("retains each request outcome after live shot rows settle", () => {
    seedShot("receipt-1");
    seedShot("receipt-2");
    const store = useStoryboardGenerationStore.getState();
    store.registerJob(
      "receipt-1",
      BOARD,
      "receipt-ok",
      "keyframe",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "batch-six"
    );
    store.registerJob(
      "receipt-2",
      BOARD,
      "receipt-failed",
      "clip",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "batch-six"
    );
    store.updateJobStatus("receipt-ok", "completed", { assetId: "asset-ok" });
    store.updateJobStatus("receipt-failed", "failed", {
      errorMessage: "provider refused"
    });
    store.clear("receipt-1");

    expect(
      useStoryboardGenerationStore.getState().requestRecords
    ).toMatchObject({
      "receipt-ok": {
        batchId: "batch-six",
        status: "completed",
        assetId: "asset-ok"
      },
      "receipt-failed": {
        batchId: "batch-six",
        status: "failed",
        errorMessage: "provider refused"
      }
    });
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

    const job = useStoryboardGenerationStore.getState().shotJobs["s-unstarted"];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("No model chosen");
    expect(useStoryboardGenerationStore.getState().failedShotIds).toContain(
      "s-unstarted"
    );
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
    const candidate = landed.keyframe_versions?.at(-1);
    expect(candidate?.render_inputs).toBeDefined();
    expect(isVersionStale(candidate, landed, boardB)).toBe(true);
    // Against the board it was enqueued on it is current — which is what
    // proves the record was taken at enqueue and not at landing.
    expect(isVersionStale(candidate, landed, boardA)).toBe(false);
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
    expect(
      isVersionStale(landed.keyframe_versions?.at(-1), landed, boardA)
    ).toBe(true);
  });

  it("a still enqueued and landed on the same board reads current", () => {
    seedShot("s-current");
    enqueueAndLand("s-current", "req-current", "keyframe", {
      shot: shotOf("s-current"),
      board: boardA
    });

    const landed = shotOf("s-current");
    expect(
      isVersionStale(landed.keyframe_versions?.at(-1), landed, boardA)
    ).toBe(false);
  });

  it("a version that lands without a record is never stale", () => {
    seedShot("s-legacy");
    enqueueAndLand("s-legacy", "req-legacy", "keyframe");

    const landed = shotOf("s-legacy");
    const candidate = landed.keyframe_versions?.at(-1);
    expect(candidate?.render_inputs).toBeUndefined();
    expect(isVersionStale(candidate, landed, boardB)).toBe(false);
  });

  it("records the board's still model for a keyframe", () => {
    seedShot("s-model-still");
    enqueueAndLand("s-model-still", "req-model-still", "keyframe", {
      shot: shotOf("s-model-still"),
      board: boardA
    });

    const record =
      shotOf("s-model-still").keyframe_versions?.at(-1)?.render_inputs;
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

    const record = shotOf("s-model-clip").clip_versions?.at(-1)?.render_inputs;
    expect(record?.kind).toBe("clip");
    expect(record?.model).toBe(boardA.video_model);
  });
});
