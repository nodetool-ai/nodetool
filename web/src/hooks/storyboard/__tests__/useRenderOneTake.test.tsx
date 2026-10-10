/**
 * @jest-environment jsdom
 *
 * A one-take render sends one `reference_to_video` request with the shot
 * stills only, as `[Image N]` in shot order,
 * attached to the first shot. The prompt is the creator's text, then the
 * block compiled from the board.
 * Its completion makes the clip the first shot's clip and covers every other
 * shot with its window of the take.
 */
import { renderHook, act } from "@testing-library/react";

const send = jest.fn();
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    send: (...args: unknown[]) => send(...(args as [])),
    subscribe: jest.fn().mockReturnValue(() => {})
  }
}));
const mockEntities: unknown[] = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));
const mockVideoModels: unknown[] = [];
jest.mock("../../useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: [] }),
  useVideoModelsByProvider: () => ({ models: mockVideoModels })
}));
jest.mock("../../../trpc/client", () => ({
  trpc: {},
  trpcClient: {}
}));

import type { Entity, OneTakeDirection, Shot } from "@nodetool-ai/protocol";
import {
  planOneTake,
  resolveOneTakeSettings,
  useRenderOneTake
} from "../useRenderOneTake";
import { useLastModelStore } from "../../../stores/lastModelStore";
import { __resetStartingShotsForTests } from "../useGenerateShot";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import {
  __handleShotJobMessageForTests,
  __resetStoryboardSubscriptionsForTests,
  useStoryboardGenerationStore
} from "../../../stores/storyboard/StoryboardGenerationStore";

const BOARD = "board-one-take";

const shot = (id: string, index: number, extra: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index,
  action: `beat ${index + 1}`,
  duration_seconds: 4,
  status: "planned",
  ...extra
});

const shots: Shot[] = [
  shot("s1", 0, {
    keyframe: { type: "image", uri: "asset://still-1.png", asset_id: "still-1" }
  }),
  shot("s2", 1, {
    duration_seconds: 6,
    clip: { type: "video", asset_id: "old-clip" }
  }),
  shot("s3", 2)
];

const hero: Entity = {
  type: "entity",
  id: "ent-hero",
  name: "Hero",
  kind: "character",
  descriptor: "a tall courier",
  reference_images: [{ type: "image", asset_id: "hero-ref" }]
};

const model = { id: "seedance-2", provider: "dreamina", name: "Seedance" };

const oneTake: OneTakeDirection = {
  prompt: "Warm dusk light. No cuts.",
  model
};

const seedBoard = (
  direction: OneTakeDirection | null = oneTake,
  entityIds: string[] = [hero.id]
): void => {
  const store = useStoryboardStore.getState();
  store.removeBoard(BOARD);
  store.ensureBoard(BOARD);
  store.setAspectRatio(BOARD, "9:16");
  for (const value of shots) {
    store.upsertShot(BOARD, value);
    useStoryboardGenerationStore.getState().clear(value.id);
  }
  // The board's `oneTake` field belongs to the board document; seed it raw.
  useStoryboardStore.setState((state) => ({
    boards: {
      ...state.boards,
      [BOARD]: { ...state.boards[BOARD], entityIds, oneTake: direction ?? undefined }
    }
  }));
};

const catalogSeedance = {
  type: "video_model",
  id: "seedance-2",
  provider: "dreamina",
  name: "Seedance",
  supported_tasks: ["reference_to_video"],
  resolutions: ["720p", "1080p"],
  durations: [5, 10, 15]
};

const board = () => useStoryboardStore.getState().getBoard(BOARD);

const completeTake = (assetId: string): void => {
  const requestId = send.mock.calls[0][0].request_id as string;
  const job = useStoryboardGenerationStore.getState().shotJobs.s1;
  act(() => {
    __handleShotJobMessageForTests(
      requestId,
      { shotId: "s1", boardId: BOARD, kind: "clip", oneTake: job.oneTake },
      {
        type: "rpc_response",
        request_id: requestId,
        result: { asset_ids: [assetId] }
      }
    );
  });
};

beforeEach(() => {
  mockVideoModels.length = 0;
  useLastModelStore.setState({ byTask: {}, byKind: {} });
  send.mockReset();
  send.mockResolvedValue(undefined);
  mockEntities.length = 0;
  mockEntities.push(hero);
  __resetStartingShotsForTests();
  __resetStoryboardSubscriptionsForTests();
  useStoryboardGenerationStore.setState({ requestRecords: {} });
  seedBoard();
});

describe("useRenderOneTake", () => {
  it("sends only the shot stills, in [Image N] order, with the full prompt", async () => {
    seedBoard({ ...oneTake, resolution: "720p" });
    const { result } = renderHook(() => useRenderOneTake(BOARD));
    await act(async () => {
      await result.current.renderOneTake();
    });

    expect(send).toHaveBeenCalledTimes(1);
    const data = send.mock.calls[0][0].data;
    expect(data).toMatchObject({
      mode: "video",
      capability: "reference_to_video",
      provider: "dreamina",
      model: "seedance-2",
      aspect_ratio: "9:16",
      resolution: "720p",
      duration: 14,
      // The board's entity sends no image: the stills carry the cast.
      reference_images: [{ type: "image", asset_id: "still-1" }]
    });
    expect(data.prompt).toBe(
      [
        "Warm dusk light. No cuts.",
        "REFS: [Image 1] is the still of shot 1 at 0-4s.",
        "STEP_01: 0-4s. beat 1.\nSTEP_02: 4-10s. beat 2.\nSTEP_03: 10-14s. beat 3."
      ].join("\n\n")
    );

    const job = useStoryboardGenerationStore.getState().shotJobs.s1;
    expect(job).toMatchObject({ kind: "clip", status: "running" });
    expect(job.oneTake?.steps.map((step) => step.shot_id)).toEqual([
      "s1",
      "s2",
      "s3"
    ]);
  });

  it("lands the clip on the first shot and covers the others with their windows", async () => {
    const { result } = renderHook(() => useRenderOneTake(BOARD));
    await act(async () => {
      await result.current.renderOneTake();
    });
    const requestId = send.mock.calls[0][0].request_id as string;
    const job = useStoryboardGenerationStore.getState().shotJobs.s1;

    act(() => {
      __handleShotJobMessageForTests(
        requestId,
        {
          shotId: "s1",
          boardId: BOARD,
          kind: "clip",
          oneTake: job.oneTake
        },
        {
          type: "rpc_response",
          request_id: requestId,
          result: { asset_ids: ["take-1"] }
        }
      );
    });

    const board = useStoryboardStore.getState().getBoard(BOARD);
    const [first, second, third] = board!.shots;
    expect(first.clip?.asset_id).toBe("take-1");
    expect(first.status).toBe("rendered");
    expect(first.covered_by ?? null).toBeNull();
    expect(second.covered_by).toEqual({
      shot_id: "s1",
      start_seconds: 4,
      end_seconds: 10
    });
    // A selected clip of its own would hide the coverage; the take stays.
    expect(second.clip ?? null).toBeNull();
    expect(second.clip_versions?.map((clip) => clip.asset_id)).toEqual([
      "old-clip"
    ]);
    expect(third.covered_by).toEqual({
      shot_id: "s1",
      start_seconds: 10,
      end_seconds: 14
    });
  });

  it("renders a board without a stored direction from the compiled block", () => {
    seedBoard(null);
    const { result } = renderHook(() => useRenderOneTake(BOARD));
    expect(result.current.plan?.compiled.prompt.startsWith("REFS:")).toBe(true);
  });

  it("refuses to send while the board has no images", async () => {
    seedBoard(oneTake, []);
    useStoryboardStore
      .getState()
      .upsertShot(BOARD, { ...shots[0], keyframe: undefined });
    const { result } = renderHook(() => useRenderOneTake(BOARD));
    expect(result.current.plan?.compiled.references).toEqual([]);
    await expect(result.current.renderOneTake()).rejects.toThrow(
      "Render a still for at least one shot."
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the stored settings over the board defaults and scales the windows", async () => {
    mockVideoModels.push(catalogSeedance, {
      type: "video_model",
      id: "kling-ref",
      provider: "kie",
      name: "Kling",
      supported_tasks: ["reference_to_video"]
    });
    seedBoard({
      ...oneTake,
      duration_seconds: 10,
      aspect_ratio: "1:1",
      resolution: "720p"
    });
    useStoryboardStore.getState().setVideoModel(BOARD, {
      type: "video_model",
      id: "kling-ref",
      provider: "kie",
      name: "Kling"
    });
    const { result } = renderHook(() => useRenderOneTake(BOARD));
    expect(result.current.blockers).toEqual([]);
    await act(async () => {
      await result.current.renderOneTake();
    });

    expect(send.mock.calls[0][0].data).toMatchObject({
      provider: "dreamina",
      model: "seedance-2",
      aspect_ratio: "1:1",
      resolution: "720p",
      duration: 10
    });
    expect(send.mock.calls[0][0].data.prompt).toContain(
      "STEP_02: 2.9-7.1s. beat 2."
    );

    completeTake("take-scaled");
    const [, second, third] = board()!.shots;
    // 14s of shots scale to the stored 10s take.
    expect(second.covered_by).toEqual({
      shot_id: "s1",
      start_seconds: 2.9,
      end_seconds: 7.1
    });
    expect(third.covered_by).toEqual({
      shot_id: "s1",
      start_seconds: 7.1,
      end_seconds: 10
    });
  });

  it("falls back to the board's model, its aspect ratio and 1080p", () => {
    mockVideoModels.push(catalogSeedance);
    seedBoard({ prompt: "" });
    useStoryboardStore.getState().setVideoModel(BOARD, {
      type: "video_model",
      id: "seedance-2",
      provider: "dreamina",
      name: "Seedance"
    });
    const settings = resolveOneTakeSettings(board(), [catalogSeedance]);
    expect(settings).toMatchObject({
      model: { id: "seedance-2", provider: "dreamina" },
      duration_seconds: 14,
      shot_total_seconds: 14,
      aspect_ratio: "9:16",
      resolution: "1080p"
    });
  });

  it("takes the model's first resolution when it does not offer 1080p", () => {
    seedBoard({ prompt: "", model: { id: "m", provider: "p" } });
    const settings = resolveOneTakeSettings(board(), [
      { id: "m", provider: "p", resolutions: ["480p", "720p"] }
    ]);
    expect(settings.resolution).toBe("480p");
  });

  it("blocks a duration the model does not offer", async () => {
    mockVideoModels.push(catalogSeedance);
    seedBoard(oneTake);
    const { result } = renderHook(() => useRenderOneTake(BOARD));
    const blocker =
      "Seedance does not offer a 14s clip. Pick one of 5s, 10s, 15s.";
    expect(result.current.blockers).toContain(blocker);
    await expect(result.current.renderOneTake()).rejects.toThrow(blocker);
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks without a video model", () => {
    seedBoard({ prompt: "" });
    const { result } = renderHook(() => useRenderOneTake(BOARD));
    expect(result.current.settings.model).toBeNull();
    expect(result.current.blockers).toContain("No video model chosen.");
  });

  it("plans nothing for a board without shots", () => {
    useStoryboardStore.getState().ensureBoard("board-plain");
    const board = useStoryboardStore.getState().getBoard("board-plain");
    expect(planOneTake(board)).toBeNull();
  });
});
