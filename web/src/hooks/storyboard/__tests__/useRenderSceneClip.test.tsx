/**
 * @jest-environment jsdom
 *
 * A scene clip renders a run of consecutive shots as one `reference_to_video`
 * request: only the run's stills, `[Image N]` and the step windows counted
 * from the run's first shot. It lands on that shot, covers the rest of the
 * run, and leaves every shot outside the run alone except one whose coverage
 * pointed into the run.
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
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));
jest.mock("../../useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: [] }),
  useVideoModelsByProvider: () => ({ models: [] })
}));
jest.mock("../../../trpc/client", () => ({
  trpc: {},
  trpcClient: {}
}));

import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";
import {
  sceneClipDirectionWithFallbacks,
  useRenderSceneClip
} from "../useRenderSceneClip";
import { useLastModelStore } from "../../../stores/lastModelStore";
import { __resetStartingShotsForTests } from "../useGenerateShot";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import {
  __handleShotJobMessageForTests,
  __resetStoryboardSubscriptionsForTests,
  useStoryboardGenerationStore
} from "../../../stores/storyboard/StoryboardGenerationStore";

const BOARD = "board-scene-clip";
const model = { id: "seedance-2", provider: "dreamina", name: "Seedance" };

const still = (assetId: string) => ({
  type: "image" as const,
  uri: `asset://${assetId}`,
  asset_id: assetId
});

const shot = (id: string, index: number, extra: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index,
  action: `beat ${index + 1}`,
  duration_seconds: 4,
  status: "planned",
  scene_id: "scene-a",
  keyframe: still(`still-${index + 1}`),
  ...extra
});

const seed = (shots: Shot[]): void => {
  const store = useStoryboardStore.getState();
  store.removeBoard(BOARD);
  store.ensureBoard(BOARD);
  for (const value of shots) {
    store.upsertShot(BOARD, value);
    useStoryboardGenerationStore.getState().clear(value.id);
  }
  useStoryboardStore.setState((state) => ({
    boards: {
      ...state.boards,
      [BOARD]: {
        ...state.boards[BOARD],
        oneTake: { prompt: "Film-wide rules.", model, resolution: "720p" }
      }
    }
  }));
};

const clip: SceneClipDirection = {
  id: "clip-1",
  prompt: "One move from the door to the window.",
  shot_ids: ["s2", "s3"]
};

const board = () => useStoryboardStore.getState().getBoard(BOARD)!;

beforeEach(() => {
  useLastModelStore.setState({ byTask: {}, byKind: {} });
  send.mockReset();
  send.mockResolvedValue(undefined);
  __resetStartingShotsForTests();
  __resetStoryboardSubscriptionsForTests();
  useStoryboardGenerationStore.setState({ requestRecords: {} });
  seed([
    shot("s1", 0),
    shot("s2", 1, { duration_seconds: 3 }),
    shot("s3", 2, { clip: { type: "video", asset_id: "own-clip" } }),
    // Covered by s3's old clip, which the scene clip replaces.
    shot("s4", 3, { covered_by: { shot_id: "s3", start_seconds: 4 } })
  ]);
});

describe("useRenderSceneClip", () => {
  it("sends only the run, with its own prompt and the board's one-take settings", async () => {
    const { result } = renderHook(() => useRenderSceneClip(BOARD, clip));
    expect(result.current.blockers).toEqual([]);
    await act(async () => {
      await result.current.renderSceneClip(clip);
    });

    expect(send).toHaveBeenCalledTimes(1);
    const data = send.mock.calls[0][0].data;
    expect(data).toMatchObject({
      capability: "reference_to_video",
      model: "seedance-2",
      provider: "dreamina",
      resolution: "720p",
      duration: 7,
      reference_images: [
        { type: "image", asset_id: "still-2" },
        { type: "image", asset_id: "still-3" }
      ]
    });
    expect(data.prompt).toBe(
      [
        "One move from the door to the window.",
        "REFS: [Image 1] is the still of shot 2 at 0-3s. [Image 2] is the still of shot 3 at 3-7s.",
        "STEP_01: 0-3s. beat 2.\nSTEP_02: 3-7s. beat 3."
      ].join("\n\n")
    );
    // The job runs as the run's first shot's clip.
    expect(useStoryboardGenerationStore.getState().shotJobs.s2).toMatchObject({
      kind: "clip",
      status: "running"
    });
  });

  it("lands on the run's first shot and releases coverage that pointed into the run", async () => {
    const { result } = renderHook(() => useRenderSceneClip(BOARD, clip));
    await act(async () => {
      await result.current.renderSceneClip(clip);
    });
    const requestId = send.mock.calls[0][0].request_id as string;
    const job = useStoryboardGenerationStore.getState().shotJobs.s2;
    act(() => {
      __handleShotJobMessageForTests(
        requestId,
        { shotId: "s2", boardId: BOARD, kind: "clip", oneTake: job.oneTake },
        {
          type: "rpc_response",
          request_id: requestId,
          result: { asset_ids: ["scene-take"] }
        }
      );
    });

    const [s1, s2, s3, s4] = board().shots;
    expect(s1.covered_by ?? null).toBeNull();
    expect(s1.clip ?? null).toBeNull();
    expect(s2.clip?.asset_id).toBe("scene-take");
    expect(s3.covered_by).toEqual({
      shot_id: "s2",
      start_seconds: 3,
      end_seconds: 7
    });
    expect(s3.clip ?? null).toBeNull();
    expect(s3.clip_versions?.map((version) => version.asset_id)).toEqual([
      "own-clip"
    ]);
    // s3 holds no clip any more, so s4 has nothing to cut its window from.
    expect(s4.covered_by ?? null).toBeNull();
  });

  it("blocks a run whose shots are no longer next to each other", async () => {
    const split = { ...clip, shot_ids: ["s1", "s3"] };
    const { result } = renderHook(() => useRenderSceneClip(BOARD, split));
    expect(result.current.blockers).toContain(
      "The shots in this scene clip are no longer next to each other."
    );
    await expect(result.current.renderSceneClip(split)).rejects.toThrow(
      "no longer next to each other"
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps its own settings over the board's and never takes the film duration", () => {
    useStoryboardStore.setState((state) => ({
      boards: {
        ...state.boards,
        [BOARD]: {
          ...state.boards[BOARD],
          oneTake: { prompt: "", model, duration_seconds: 30, resolution: "720p" }
        }
      }
    }));
    expect(
      sceneClipDirectionWithFallbacks(board(), { ...clip, resolution: "1080p" })
    ).toEqual({
      prompt: clip.prompt,
      duration_seconds: null,
      model,
      aspect_ratio: null,
      resolution: "1080p"
    });
  });
});
