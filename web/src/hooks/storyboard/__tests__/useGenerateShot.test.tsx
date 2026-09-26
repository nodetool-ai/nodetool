/**
 * @jest-environment jsdom
 *
 * Regression test: concurrent shot-generation starts are single-flight — the
 * pre-registration async window must not admit a second paid request. Also
 * pins the direct `generate_media` request shapes for stills and clips
 * (entity tokens vs client-side descriptor seasoning, image-to-video source,
 * script-timed duration, revise mode).
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
// The hook resolves board entities through React Query; the tests below seed
// these arrays per scenario.
const mockEntities: unknown[] = [];
const mockImageModels: Array<{
  id: string;
  provider: string;
  supported_tasks?: string[];
}> = [];
const mockVideoModels: Array<{
  id: string;
  provider: string;
  supported_tasks?: string[];
}> = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));
jest.mock("../../useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: mockImageModels }),
  useVideoModelsByProvider: () => ({ models: mockVideoModels })
}));
// The clip render reads the linked script to time the shot; this stands in for
// the tRPC round trip.
const scriptQuery = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {},
  trpcClient: {
    scripts: { get: { query: (input: { id: string }) => scriptQuery(input) } }
  }
}));

import {
  useGenerateShot,
  __resetStartingShotsForTests
} from "../useGenerateShot";
import { compileRenderBatchRequestPlan } from "../renderBatchRequestPlan";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";
import {
  __handleShotJobMessageForTests,
  settleCancelledShotJob
} from "../../../stores/storyboard/StoryboardGenerationStore";
import {
  clipPrompt,
  directClipPrompt,
  keyframePrompt
} from "@nodetool-ai/protocol";
import type { Entity, Scene, Shot } from "@nodetool-ai/protocol";
import { mediaEditGenerateMediaData } from "@nodetool-ai/timeline";

const BOARD = "board-sf";
const shot: Shot = {
  type: "shot",
  id: "shot-sf",
  index: 0,
  action: "a lighthouse",
  status: "planned"
};

/** A location entity — `entitiesForShot` applies locations unconditionally. */
const location: Entity = {
  type: "entity",
  id: "ent-1",
  name: "The Shore",
  kind: "location",
  descriptor: "a basalt coast under a grey sky",
  reference_images: [{ type: "image", asset_id: "ref-1" }]
};

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
  mockEntities.length = 0;
  mockImageModels.length = 0;
  mockVideoModels.length = 0;
  __resetStartingShotsForTests();
  useStoryboardGenerationStore.setState({ requestRecords: {} });
  useStoryboardGenerationStore.getState().clear(shot.id);
  useStoryboardStore.getState().ensureBoard(BOARD);
  useStoryboardStore.getState().upsertShot(BOARD, shot);
});

describe("mixed-mode clip generation", () => {
  const boardId = "mixed-modes";
  const videoModel = {
    type: "video_model" as const,
    id: "mixed-model",
    provider: "fal_ai" as const,
    name: "Mixed"
  };
  const shots: Shot[] = [
    {
      ...shot,
      id: "mixed-keyframe",
      render_mode: "keyframe",
      keyframe: { type: "image", asset_id: "start" }
    },
    { ...shot, id: "mixed-direct", render_mode: "direct" },
    { ...shot, id: "mixed-reference", render_mode: "reference" }
  ];

  beforeEach(() => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(boardId);
    store.setVideoModel(boardId, videoModel);
    store.setEntityIds(boardId, [location.id]);
    mockEntities.push(location);
    for (const value of shots) {
      store.upsertShot(boardId, value);
      useStoryboardGenerationStore.getState().clear(value.id);
    }
  });

  it("uses and stores a different compatible model for each shot mode", async () => {
    const models = {
      keyframe: {
        id: "image-video",
        provider: "atlascloud",
        name: "Image video"
      },
      direct: { id: "text-video", provider: "atlascloud", name: "Text video" },
      reference: {
        id: "reference-video",
        provider: "atlascloud",
        name: "Reference video"
      }
    } as const;
    mockVideoModels.push(
      { ...models.keyframe, supported_tasks: ["image_to_video"] },
      { ...models.direct, supported_tasks: ["text_to_video"] },
      { ...models.reference, supported_tasks: ["reference_to_video"] }
    );
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateClip(boardId, shots[0], models.keyframe);
      await result.current.generateClip(boardId, shots[1], models.direct);
      await result.current.generateClip(boardId, shots[2], models.reference);
    });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0].data).toMatchObject({
      model: "image-video",
      source_asset_id: "start"
    });
    expect(send.mock.calls[1][0].data).toMatchObject({ model: "text-video" });
    expect(send.mock.calls[2][0].data).toMatchObject({
      model: "reference-video",
      capability: "reference_to_video"
    });

    const stored = useStoryboardStore.getState().getBoard(boardId)?.shots;
    expect(stored?.[0].clip_model).toEqual(models.keyframe);
    expect(stored?.[1].clip_model).toEqual(models.direct);
    expect(stored?.[2].clip_model).toEqual(models.reference);
  });
});

describe("production clip generation", () => {
  it("dispatches one stable request per take with resolved reference asset ids", async () => {
    const productionShot: Shot = {
      ...shot,
      id: "shot-production",
      render_mode: "direct",
      production: {
        schema_version: 1,
        speech_mode: "none",
        reference_bindings: [
          { kind: "product", asset_id: "product-reference" }
        ],
        requested_take_count: 3,
        duration_ms: 9_000
      }
    };
    useStoryboardStore.getState().setEntityIds(BOARD, [location.id]);
    useStoryboardStore.getState().upsertShot(BOARD, productionShot);
    mockEntities.push(location);
    const { result } = renderHook(() => useGenerateShot());

    await act(async () => {
      await result.current.generateClip(BOARD, productionShot);
    });

    expect(send).toHaveBeenCalledTimes(3);
    const frames = send.mock.calls.map(
      (call) =>
        call[0] as {
          request_id: string;
          data: Record<string, unknown>;
        }
    );
    expect(new Set(frames.map((frame) => frame.request_id)).size).toBe(3);
    const quotedPlan = compileRenderBatchRequestPlan({
      shots: [productionShot],
      step: "clip",
      linesById: new Map(),
      modelForShot: () => null
    });
    expect(quotedPlan.map((request) => request.seconds)).toEqual([9, 9, 9]);
    expect(frames.map((frame) => frame.data.duration)).toEqual([9, 9, 9]);
    expect(
      frames.map(
        (frame) =>
          useStoryboardGenerationStore.getState().productionJobs[
            frame.request_id
          ]?.production?.identity.variationIndex
      )
    ).toEqual([1, 2, 3]);
    for (const frame of frames) {
      expect(frame.data).toMatchObject({
        capability: "reference_to_video",
        reference_images: [{ type: "image", asset_id: "product-reference" }]
      });
    }
  });

  it("rejects unsupported on-camera performance without dispatching imagery", async () => {
    const performanceShot: Shot = {
      ...shot,
      id: "shot-performance",
      render_mode: "direct",
      production: {
        schema_version: 1,
        speech_mode: "on_camera",
        speech_binding: { audio_asset_id: "speech-1" },
        reference_bindings: [{ kind: "character", asset_id: "character-1" }],
        requested_take_count: 1
      }
    };
    useStoryboardStore.getState().upsertShot(BOARD, performanceShot);
    const { result } = renderHook(() => useGenerateShot());

    await expect(
      act(() => result.current.generateClip(BOARD, performanceShot))
    ).rejects.toThrow(/does not support audio-driven/i);
    expect(send).not.toHaveBeenCalled();
  });
});

it("reuses the model remembered on a shot when regenerating", async () => {
  const model = {
    id: "atlas/still-v1",
    provider: "atlascloud" as const,
    name: "Atlas Still"
  };
  const { result } = renderHook(() => useGenerateShot());

  await act(async () => {
    await result.current.generateKeyframe(BOARD, shot, model);
  });
  useStoryboardGenerationStore.getState().clear(shot.id);
  const remembered = useStoryboardStore
    .getState()
    .getBoard(BOARD)
    ?.shots.find((value) => value.id === shot.id);

  await act(async () => {
    await result.current.generateKeyframe(BOARD, remembered ?? shot);
  });

  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[1][0].data).toMatchObject({
    provider: "atlascloud",
    model: "atlas/still-v1"
  });
});

it("rejects a remembered clip model that is no longer in the catalog", async () => {
  const unavailable: Shot = {
    ...shot,
    render_mode: "direct",
    clip_model: {
      id: "atlas/removed",
      provider: "atlascloud",
      name: "Removed Atlas model"
    }
  };
  useStoryboardStore.getState().upsertShot(BOARD, unavailable);
  const { result } = renderHook(() => useGenerateShot());

  await expect(
    act(() => result.current.generateClip(BOARD, unavailable))
  ).rejects.toThrow("is no longer available");
  expect(send).not.toHaveBeenCalled();
});

it("starts exactly one generation for concurrent generateKeyframe calls", async () => {
  let release: () => void = () => {};
  send.mockImplementation(
    () => new Promise<void>((resolve) => (release = resolve))
  );

  const { result } = renderHook(() => useGenerateShot());
  await act(async () => {
    const first = result.current.generateKeyframe(BOARD, shot);
    const second = result.current.generateKeyframe(BOARD, shot);
    // Second call must return without starting a request while the first is
    // in its pre-registration window.
    await second;
    // Flush every pending microtask so the first start reaches its send.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(send).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
  expect(send).toHaveBeenCalledTimes(1);
});

it("allows a new start after the previous one settles", async () => {
  const { result } = renderHook(() => useGenerateShot());
  await act(async () => {
    await result.current.generateKeyframe(BOARD, shot);
  });
  // The request registered a queued job — still busy, so a re-run is refused
  // until it settles.
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.generateKeyframe(BOARD, shot);
  });
  expect(send).toHaveBeenCalledTimes(1);
});

it("keeps an active ordinary render when an invalid revise arrives", async () => {
  const activeShot: Shot = {
    ...shot,
    id: "shot-active-ordinary",
    render_mode: "direct",
    duration_seconds: 4
  };
  useStoryboardStore.getState().upsertShot(BOARD, activeShot);
  const { result } = renderHook(() => useGenerateShot());

  await act(async () => {
    await result.current.generateClip(BOARD, activeShot);
  });

  const originalJob =
    useStoryboardGenerationStore.getState().shotJobs[activeShot.id];
  expect(originalJob?.status).toBe("running");

  await act(async () => {
    await result.current.generateRevisedClip(BOARD, activeShot, "");
  });

  expect(send).toHaveBeenCalledTimes(1);
  expect(useStoryboardGenerationStore.getState().shotJobs[activeShot.id]).toBe(
    originalJob
  );
  expect(
    useStoryboardGenerationStore
      .getState()
      .pendingJobs[BOARD]?.find((entry) => entry.shotId === activeShot.id)
      ?.jobId
  ).toBe(originalJob?.jobId);
});

describe("keyframe prompt composition", () => {
  const stillModel = {
    type: "image_model",
    id: "model-1",
    provider: "prov",
    name: "Still Model",
    path: ""
  } as unknown as import("../../../stores/ApiTypes").ImageModelValue;

  /** The `data` payload of the first generate_media send. */
  const sentData = (): Record<string, unknown> => {
    const frame = send.mock.calls[0][0] as {
      data?: Record<string, unknown>;
    };
    return frame.data ?? {};
  };

  const frameWithModel = async (
    shotToRender: Shot,
    supportedTasks: string[]
  ): Promise<Record<string, unknown>> => {
    mockImageModels.push({
      id: "model-1",
      provider: "prov",
      supported_tasks: supportedTasks
    });
    const store = useStoryboardStore.getState();
    store.setImageModel(BOARD, stillModel);
    store.setEntityIds(BOARD, ["ent-1"]);
    store.upsertShot(BOARD, shotToRender);
    mockEntities.push(location);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateKeyframe(BOARD, shotToRender);
    });
    return sentData();
  };

  it("sends every keyframe param when the still model can take reference images", async () => {
    const data = await frameWithModel(
      { ...shot, id: "shot-edit", entity_ids: ["ent-1"] },
      ["image_to_image"]
    );
    expect(data).toEqual({
      mode: "image",
      provider: "prov",
      model: "model-1",
      prompt: "a lighthouse\nentity://ent-1",
      aspect_ratio: "16:9",
      resolution: "1K",
      variations: 1
    });
    expect(String(data.prompt)).not.toContain("Consistency references");
  });

  it("uses the selected provider when model IDs share different edit capabilities", async () => {
    mockImageModels.push({
      id: "model-1",
      provider: "other",
      supported_tasks: ["image_to_image"]
    });
    const data = await frameWithModel(
      { ...shot, id: "shot-provider", entity_ids: ["ent-1"] },
      []
    );
    expect(String(data.prompt)).toContain("Consistency references");
    expect(String(data.prompt)).not.toContain("entity://ent-1");
  });

  it("sends every keyframe param when the model cannot edit", async () => {
    const data = await frameWithModel(
      { ...shot, id: "shot-noedit", entity_ids: ["ent-1"] },
      []
    );
    // Same envelope as the edit path — only the prompt seasoning differs.
    expect(data).toEqual({
      mode: "image",
      provider: "prov",
      model: "model-1",
      prompt:
        "a lighthouse\n\nConsistency references:\n" +
        "- The Shore: a basalt coast under a grey sky",
      aspect_ratio: "16:9",
      resolution: "1K",
      variations: 1
    });
    expect(String(data.prompt)).not.toContain("entity://");
  });
});

describe("clip generation on a script-linked board", () => {
  // A fresh board per test: `ensureBoard` keeps whatever screenplay a previous
  // test put on the id.
  let boardSeq = 0;
  let LINKED = "";
  const linkedShot: Shot = {
    type: "shot",
    id: "shot-linked",
    index: 0,
    action: "a lighthouse",
    status: "keyframe_ready",
    keyframe: { type: "image", uri: "asset://still-1", asset_id: "still-1" },
    duration_seconds: 8,
    script_line_ids: ["line-1"]
  };

  /** A script whose one line has a 3.4 s take plus 250 ms of silence. */
  const script = (voiced: boolean) => ({
    document: {
      cast: [],
      sections: [
        {
          id: "sec1",
          lines: [
            {
              id: "line-1",
              text: "We are closed.",
              pauseAfterMs: 250,
              currentTakeId: voiced ? "take-1" : null,
              takes: voiced
                ? [
                    {
                      id: "take-1",
                      assetId: "audio-1",
                      durationMs: 3400,
                      words: [],
                      textSnapshot: "We are closed.",
                      voiceSnapshot: null,
                      createdAt: "2026-01-01T00:00:00.000Z"
                    }
                  ]
                : []
            }
          ]
        }
      ]
    }
  });

  /** The `data` payload of the first generate_media send. */
  const sentData = (): Record<string, unknown> => {
    const frame = send.mock.calls[0][0] as {
      data?: Record<string, unknown>;
    };
    return frame.data ?? {};
  };

  const renderClip = async (
    shotToRender: Shot
  ): Promise<Record<string, unknown>> => {
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateClip(LINKED, shotToRender);
    });
    return sentData();
  };

  let shotToSeed: Shot = linkedShot;
  const seedBoard = (scriptId: string | null): void => {
    boardSeq += 1;
    LINKED = `board-linked-${boardSeq}`;
    useStoryboardStore.getState().ensureBoard(LINKED);
    if (scriptId) {
      useStoryboardStore.getState().setScreenplay(LINKED, {
        type: "screenplay",
        id: "sp-1",
        title: "Film",
        script_id: scriptId,
        shots: []
      });
    }
    useStoryboardStore.getState().upsertShot(LINKED, shotToSeed);
  };

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    scriptQuery.mockReset();
    __resetStartingShotsForTests();
    useStoryboardGenerationStore.getState().clear(linkedShot.id);
    shotToSeed = linkedShot;
    mockEntities.length = 0;
    mockVideoModels.length = 0;
    mockVideoModels.push({
      id: "vid-1",
      provider: "vprov",
      supported_tasks: ["image_to_video", "text_to_video", "video_to_video"]
    });
  });

  const videoModel = {
    type: "video_model",
    id: "vid-1",
    provider: "vprov",
    name: "Clip Model",
    path: null
  } as unknown as import("../../../stores/ApiTypes").VideoModelValue;

  it("sends the keyframe as the image-to-video source with every param", async () => {
    seedBoard(null);
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const data = await renderClip(linkedShot);
    expect(data).toEqual({
      mode: "video",
      provider: "vprov",
      model: "vid-1",
      prompt: "a lighthouse",
      source_asset_id: "still-1",
      aspect_ratio: "16:9",
      resolution: "1080p",
      duration: 8,
      variations: 1
    });
    expect(scriptQuery).not.toHaveBeenCalled();
  });

  it("renders a linked shot as long as the takes it covers", async () => {
    seedBoard("script-1");
    scriptQuery.mockResolvedValue(script(true));
    // 3400 ms + 250 ms of silence, rounded up to whole seconds.
    expect(await renderClip(linkedShot)).toMatchObject({ duration: 4 });
    expect(scriptQuery).toHaveBeenCalledWith({ id: "script-1" });
  });

  it("keeps the shot's own length when it is pinned to manual", async () => {
    seedBoard("script-1");
    scriptQuery.mockResolvedValue(script(true));
    expect(
      await renderClip({ ...linkedShot, duration_source: "manual" })
    ).toMatchObject({ duration: 8 });
    expect(scriptQuery).not.toHaveBeenCalled();
  });

  it("keeps the shot's own length when the linked line is unvoiced", async () => {
    seedBoard("script-1");
    scriptQuery.mockResolvedValue(script(false));
    expect(await renderClip(linkedShot)).toMatchObject({ duration: 8 });
  });

  it("seasons clip prompts with entity tokens for the server to expand", async () => {
    seedBoard(null);
    mockEntities.push(location);
    useStoryboardStore.getState().setEntityIds(LINKED, ["ent-1"]);
    const data = await renderClip(linkedShot);
    expect(String(data.prompt)).toBe("a lighthouse\nentity://ent-1");
    expect(String(data.prompt)).not.toContain("Consistency references");
  });

  it("revises a rendered clip through video_edit with every param", async () => {
    seedBoard(null);
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-revised",
      status: "rendered",
      clip: { type: "video", uri: "asset://clip-9", asset_id: "clip-9" }
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateRevisedClip(LINKED, revised, "more fog");
    });
    expect(sentData()).toEqual({
      mode: "video_edit",
      provider: "vprov",
      model: "vid-1",
      prompt: "more fog",
      source_asset_id: "clip-9",
      source_context: {
        sequence_id: LINKED,
        clip_id: "shot-revised",
        source_asset_id: "clip-9",
        source_start_ms: 0,
        source_end_ms: 8_000,
        timeline_start_ms: 0,
        timeline_duration_ms: 8_000,
        speed_multiplier: 1
      },
      strength: undefined,
      resolution: undefined,
      duration: 8,
      variations: 1
    });
  });

  it("uses the selected clip duration before linked script timing for revise", async () => {
    seedBoard("script-1");
    scriptQuery.mockResolvedValue(script(true));
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-revise-duration",
      status: "rendered",
      clip: {
        type: "video",
        uri: "asset://clip-duration",
        asset_id: "clip-duration",
        duration: 5
      }
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);

    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateRevisedClip(
        LINKED,
        revised,
        "keep the boat"
      );
    });

    expect(sentData()).toMatchObject({
      source_context: {
        source_end_ms: 5_000,
        timeline_duration_ms: 5_000
      },
      duration: 5
    });
  });

  it("does not overwrite an ordinary render started during revise duration lookup", async () => {
    seedBoard("script-1");
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-revise-duration-race",
      status: "rendered",
      clip: {
        type: "video",
        uri: "asset://duration-race-source",
        asset_id: "duration-race-source"
      }
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);
    mockVideoModels[0].supported_tasks = ["text_to_video"];

    let resolveDuration: (value: ReturnType<typeof script>) => void = () => {};
    const durationLookup = new Promise<ReturnType<typeof script>>((resolve) => {
      resolveDuration = resolve;
    });
    scriptQuery.mockReturnValue(durationLookup);

    const { result } = renderHook(() => useGenerateShot());
    const revisePromise = result.current.generateRevisedClip(
      LINKED,
      revised,
      "preserve the framing"
    );
    expect(scriptQuery).toHaveBeenCalledWith({ id: "script-1" });

    await act(async () => {
      await result.current.generateKeyframe(LINKED, revised);
    });
    const ordinaryJob =
      useStoryboardGenerationStore.getState().shotJobs[revised.id];
    expect(ordinaryJob?.status).toBe("running");

    resolveDuration(script(true));
    await act(async () => {
      await revisePromise;
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(useStoryboardGenerationStore.getState().shotJobs[revised.id]).toBe(
      ordinaryJob
    );
    expect(ordinaryJob?.mediaEdit).toBeUndefined();
  });

  it("keeps captured revise inputs when preflight rejects the model", async () => {
    seedBoard(null);
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-revise-preflight",
      status: "approved",
      clip: {
        type: "video",
        uri: "asset://preflight-source",
        asset_id: "preflight-source",
        duration: 5
      },
      clip_model: videoModel
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);
    mockVideoModels.length = 0;
    mockVideoModels.push({
      id: videoModel.id,
      provider: videoModel.provider,
      supported_tasks: ["text_to_video"]
    });

    const { result } = renderHook(() => useGenerateShot());
    await expect(
      act(() =>
        result.current.generateRevisedClip(
          LINKED,
          revised,
          "preserve the subject"
        )
      )
    ).rejects.toThrow("supports video to video");

    const job = useStoryboardGenerationStore.getState().shotJobs[revised.id];
    expect(job?.status).toBe("failed");
    expect(job?.acceptedShotStatus).toBe("approved");
    expect(job?.mediaEdit).toMatchObject({
      instruction: "preserve the subject",
      provider: videoModel.provider,
      model: videoModel.id,
      sourceContext: {
        sequenceId: LINKED,
        clipId: revised.id,
        sourceAssetId: "preflight-source",
        sourceEndMs: 5_000,
        timelineDurationMs: 5_000
      }
    });
  });

  it("uses the shared request envelope and lands an inactive candidate", async () => {
    seedBoard(null);
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-candidate",
      status: "rendered",
      clip: { type: "video", uri: "asset://source", asset_id: "source" }
    };
    const other: Shot = {
      ...revised,
      id: "shot-other",
      clip: { type: "video", uri: "asset://other", asset_id: "other" }
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);
    useStoryboardStore.getState().upsertShot(LINKED, other);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateRevisedClip(LINKED, revised, "remove fog");
    });

    const job = useStoryboardGenerationStore.getState().shotJobs[revised.id];
    const request = useStoryboardGenerationStore
      .getState()
      .pendingJobs[
        LINKED
      ]?.find((entry) => entry.shotId === revised.id)?.mediaEdit;
    expect(request).toBeDefined();
    expect(sentData()).toEqual(mediaEditGenerateMediaData(request!));

    __handleShotJobMessageForTests(
      job!.jobId,
      { shotId: revised.id, boardId: LINKED, kind: "clip", mediaEdit: request },
      {
        type: "rpc_response",
        request_id: job!.jobId,
        result: { asset_ids: ["candidate"] }
      } as never
    );

    const landed = useStoryboardStore
      .getState()
      .getBoard(LINKED)
      ?.shots.find((value) => value.id === revised.id);
    expect(landed?.clip?.asset_id).toBe("source");
    expect(landed?.clip_versions).toHaveLength(2);
    expect(landed?.clip_versions?.[1]).toMatchObject({
      asset_id: "candidate",
      mediaEdit: {
        action: "video_edit",
        modelTask: "video_to_video",
        requestId: job!.jobId,
        instruction: "remove fog",
        provider: "vprov",
        model: "vid-1",
        sourceContext: request!.sourceContext
      }
    });
    expect(
      useStoryboardStore
        .getState()
        .getBoard(LINKED)
        ?.shots.find((value) => value.id === other.id)?.clip?.asset_id
    ).toBe("other");

    useStoryboardStore.getState().acceptClipVersion(LINKED, revised.id, 1);
    expect(
      useStoryboardStore
        .getState()
        .getBoard(LINKED)
        ?.shots.find((value) => value.id === revised.id)?.clip?.asset_id
    ).toBe("candidate");
  });

  it("stops tracking a revise without changing the accepted shot clip", async () => {
    seedBoard(null);
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-cancel",
      status: "rendered",
      clip: { type: "video", uri: "asset://source", asset_id: "source" }
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateRevisedClip(LINKED, revised, "cancel me");
    });
    settleCancelledShotJob(revised.id);
    const job = useStoryboardGenerationStore.getState().shotJobs[revised.id];
    expect(job?.status).toBe("stopped");
    expect(job?.mediaEdit?.instruction).toBe("cancel me");
    expect(
      useStoryboardStore
        .getState()
        .getBoard(LINKED)
        ?.shots.find((value) => value.id === revised.id)?.clip?.asset_id
    ).toBe("source");
  });

  it("restores an approved shot after an asynchronous revise failure", async () => {
    seedBoard(null);
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-revise-async-failure",
      status: "approved",
      clip: {
        type: "video",
        uri: "asset://async-source",
        asset_id: "async-source",
        duration: 5
      }
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);
    mockVideoModels.push({
      id: videoModel.id,
      provider: videoModel.provider,
      supported_tasks: ["video_to_video"]
    });
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateRevisedClip(
        LINKED,
        revised,
        "keep the approved framing"
      );
    });

    const job = useStoryboardGenerationStore.getState().shotJobs[revised.id];
    __handleShotJobMessageForTests(
      job!.jobId,
      {
        shotId: revised.id,
        boardId: LINKED,
        kind: "clip",
        mediaEdit: job!.mediaEdit,
        acceptedShotStatus: job!.acceptedShotStatus
      },
      {
        type: "rpc_response",
        request_id: job!.jobId,
        error: { code: "PROVIDER_ERROR", message: "provider unavailable" }
      } as never
    );

    expect(
      useStoryboardStore
        .getState()
        .getBoard(LINKED)
        ?.shots.find((candidate) => candidate.id === revised.id)?.status
    ).toBe("approved");
    expect(
      useStoryboardGenerationStore.getState().shotJobs[revised.id]
    ).toMatchObject({
      status: "failed",
      acceptedShotStatus: "approved",
      mediaEdit: { instruction: "keep the approved framing" }
    });
  });

  it("retries the recorded revision source after another clip becomes current", async () => {
    seedBoard(null);
    useStoryboardStore.getState().setVideoModel(LINKED, videoModel);
    const revised: Shot = {
      ...linkedShot,
      id: "shot-retry-recorded-source",
      status: "rendered",
      clip: {
        type: "video",
        uri: "asset://source-a",
        asset_id: "source-a",
        duration: 5
      }
    };
    useStoryboardStore.getState().upsertShot(LINKED, revised);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateRevisedClip(
        LINKED,
        revised,
        "preserve the first take"
      );
    });

    const originalJob =
      useStoryboardGenerationStore.getState().shotJobs[revised.id];
    const originalData = send.mock.calls[0][0].data;
    __handleShotJobMessageForTests(
      originalJob!.jobId,
      {
        shotId: revised.id,
        boardId: LINKED,
        kind: "clip",
        mediaEdit: originalJob!.mediaEdit,
        acceptedShotStatus: originalJob!.acceptedShotStatus
      },
      {
        type: "rpc_response",
        request_id: originalJob!.jobId,
        error: { code: "PROVIDER_ERROR", message: "provider unavailable" }
      } as never
    );
    useStoryboardStore.getState().updateShot(LINKED, revised.id, {
      clip: {
        type: "video",
        uri: "asset://source-b",
        asset_id: "source-b",
        duration: 7
      }
    });

    await act(async () => {
      await result.current.retryFailedRequest(originalJob!.jobId);
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].request_id).not.toBe(originalJob!.jobId);
    expect(send.mock.calls[1][0].data).toEqual(originalData);
    expect(send.mock.calls[1][0].data).toMatchObject({
      source_asset_id: "source-a",
      duration: 5
    });
    expect(
      useStoryboardGenerationStore.getState().requestRecords[originalJob!.jobId]
        ?.retriedAt
    ).toEqual(expect.any(Number));
  });
});

describe("a start that fails", () => {
  it("records the reason on the shot and rethrows", async () => {
    send.mockRejectedValue(new Error("No image model configured"));
    const { result } = renderHook(() => useGenerateShot());

    await act(async () => {
      await expect(
        result.current.generateKeyframe(BOARD, shot)
      ).rejects.toThrow("No image model configured");
    });

    const job = useStoryboardGenerationStore.getState().shotJobs[shot.id];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("No image model configured");
    expect(useStoryboardStore.getState().getBoard(BOARD)?.shots[0].status).toBe(
      "failed"
    );
    const records = Object.values(
      useStoryboardGenerationStore.getState().requestRecords
    ).filter((record) => record.shotId === shot.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      jobId: job?.jobId,
      status: "failed",
      errorMessage: "No image model configured",
      operation: {
        data: expect.objectContaining({ mode: "image", prompt: "a lighthouse" })
      }
    });
    expect(records[0].settledAt).toEqual(expect.any(Number));
  });

  it("keeps a failed revise inspectable without changing the accepted shot", async () => {
    const revised: Shot = {
      ...shot,
      id: "shot-revise-send-failure",
      status: "approved",
      clip: {
        type: "video",
        uri: "asset://accepted-clip",
        asset_id: "accepted-clip",
        duration: 5
      },
      clip_model: {
        id: "revision-model",
        provider: "vprov",
        name: "Revision model"
      }
    };
    useStoryboardStore.getState().upsertShot(BOARD, revised);
    mockVideoModels.push({
      id: "revision-model",
      provider: "vprov",
      supported_tasks: ["video_to_video"]
    });
    send.mockRejectedValue(new Error("socket closed"));

    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await expect(
        result.current.generateRevisedClip(BOARD, revised, "preserve the take")
      ).rejects.toThrow("socket closed");
    });

    const job = useStoryboardGenerationStore.getState().shotJobs[revised.id];
    expect(job?.status).toBe("failed");
    expect(job?.mediaEdit?.instruction).toBe("preserve the take");
    expect(job?.mediaEdit?.model).toBe("revision-model");
    expect(
      useStoryboardStore
        .getState()
        .getBoard(BOARD)
        ?.shots.find((candidate) => candidate.id === revised.id)?.status
    ).toBe("approved");
  });

  it("records a reason when a clip's request fails to send", async () => {
    const clipShot: Shot = {
      ...shot,
      id: "shot-clip-send-fail",
      status: "keyframe_ready",
      keyframe: { type: "image", asset_id: "still-2" }
    };
    useStoryboardStore.getState().upsertShot(BOARD, clipShot);
    useStoryboardGenerationStore.getState().clear(clipShot.id);
    send.mockRejectedValue(new Error("socket closed"));
    const { result } = renderHook(() => useGenerateShot());

    await act(async () => {
      await expect(
        result.current.generateClip(BOARD, clipShot)
      ).rejects.toThrow("socket closed");
    });

    const job = useStoryboardGenerationStore.getState().shotJobs[clipShot.id];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("socket closed");
    const records = Object.values(
      useStoryboardGenerationStore.getState().requestRecords
    ).filter((record) => record.shotId === clipShot.id);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      jobId: job?.jobId,
      status: "failed",
      errorMessage: "socket closed",
      operation: {
        data: expect.objectContaining({
          mode: "video",
          source_asset_id: "still-2"
        })
      }
    });
    expect(records[0].settledAt).toEqual(expect.any(Number));
  });
});

describe("prompts come from the shared shot-prompt module", () => {
  // The hook must not compose prompts of its own: what it sends has to equal
  // what `@nodetool-ai/protocol` composes, or the same board renders
  // differently in the editor than through the headless capabilities.
  const scene: Scene = {
    type: "scene",
    id: "sc-1",
    slugline: "EXT. HEADLAND — DUSK",
    lighting: "last light, sodium spill from the road"
  };
  const STYLE = "grainy 16mm, muted palette";
  const directed: Shot = {
    type: "shot",
    id: "shot-directed",
    index: 0,
    action: "a lighthouse",
    scene_id: "sc-1",
    camera: {
      framing: "wide",
      angle: "low angle",
      lens: "85mm",
      movement: "slow push in",
      equipment: "steadicam"
    },
    motion: "the beam sweeps across the water",
    dialogue: "Nobody is coming",
    notes: "reshoot at golden hour",
    duration_seconds: 6,
    status: "planned"
  };

  let boardId = "";
  const seed = (shotToRender: Shot): void => {
    boardId = `board-prompt-${shotToRender.id}`;
    const store = useStoryboardStore.getState();
    store.ensureBoard(boardId);
    store.setScreenplay(boardId, {
      type: "screenplay",
      id: "sp-prompt",
      title: "Film",
      style_bible: STYLE,
      scenes: [scene],
      shots: []
    });
    store.upsertShot(boardId, shotToRender);
    useStoryboardGenerationStore.getState().clear(shotToRender.id);
  };

  const promptSent = (): string => {
    const frame = send.mock.calls[0][0] as { data?: { prompt?: unknown } };
    return String(frame.data?.prompt ?? "");
  };

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    __resetStartingShotsForTests();
    mockEntities.length = 0;
    mockImageModels.length = 0;
  });

  it("sends the module's still prompt", async () => {
    seed(directed);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateKeyframe(boardId, directed);
    });
    expect(promptSent()).toBe(
      keyframePrompt(directed, { scene, style: STYLE })
    );
  });

  it("sends the module's keyframe-mode clip prompt", async () => {
    const withStill: Shot = {
      ...directed,
      id: "shot-directed-clip",
      status: "keyframe_ready",
      keyframe: { type: "image", uri: "asset://still-3", asset_id: "still-3" }
    };
    seed(withStill);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateClip(boardId, withStill);
    });
    expect(promptSent()).toBe(clipPrompt(withStill));
  });

  it("sends the module's direct clip prompt", async () => {
    const direct: Shot = {
      ...directed,
      id: "shot-directed-direct",
      render_mode: "direct"
    };
    seed(direct);
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateClip(boardId, direct);
    });
    expect(promptSent()).toBe(
      directClipPrompt(direct, { scene, style: STYLE })
    );
  });
});

/**
 * The board context the enqueue path hands the generation store (PRD § 7.7.4).
 * `style_entity_id` is derived from the board's entities here, not in the
 * store — the store holds ids, the kinds live in the entity query.
 */
describe("render record context", () => {
  const styleEntity: Entity = {
    type: "entity",
    id: "ent-style",
    name: "Noir",
    kind: "style",
    descriptor: "high-contrast noir"
  };

  it("records the board's still model and style entity when a keyframe starts", async () => {
    mockEntities.push(styleEntity, location);
    const store = useStoryboardStore.getState();
    store.setImageModel(BOARD, {
      type: "image_model",
      id: "model-still",
      provider: "prov",
      name: "Still",
      path: ""
    });
    store.setEntityIds(BOARD, ["ent-1", "ent-style"]);

    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateKeyframe(BOARD, shot);
    });

    const record =
      useStoryboardGenerationStore.getState().shotJobs[shot.id]?.renderInputs;
    expect(record?.kind).toBe("keyframe");
    expect(record?.model).toBe("model-still");
    expect(record?.style_entity_id).toBe("ent-style");
    expect(record?.recorded_at).toEqual(expect.any(String));
  });

  it("leaves a clip revision without a record — it is never stale", async () => {
    const revisable: Shot = {
      ...shot,
      id: "shot-revise-record",
      duration_seconds: 8,
      clip: { type: "video", asset_id: "clip-1", uri: "asset://clip-1" }
    };
    useStoryboardStore.getState().upsertShot(BOARD, revisable);
    useStoryboardStore.getState().setVideoModel(BOARD, {
      type: "video_model",
      id: "revision-model",
      provider: "vprov",
      name: "Revision model"
    } as unknown as import("../../../stores/ApiTypes").VideoModelValue);
    mockVideoModels.push({
      id: "revision-model",
      provider: "vprov",
      supported_tasks: ["video_to_video"]
    });

    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateRevisedClip(BOARD, revisable, "brighter");
    });

    expect(
      useStoryboardGenerationStore.getState().shotJobs[revisable.id]
        ?.renderInputs
    ).toBeUndefined();
  });
});
