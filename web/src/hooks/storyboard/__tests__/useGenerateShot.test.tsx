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
const mockImageModels: Array<{ id: string; supported_tasks?: string[] }> = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));
jest.mock("../../useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: mockImageModels })
}));
// The clip render reads the linked script to time the shot; this stands in for
// the tRPC round trip.
const scriptQuery = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {},
  trpcClient: { scripts: { get: { query: (input: { id: string }) => scriptQuery(input) } } }
}));

import { useGenerateShot, __resetStartingShotsForTests } from "../useGenerateShot";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";
import {
  clipPrompt,
  directClipPrompt,
  keyframePrompt
} from "@nodetool-ai/protocol";
import type { Entity, Scene, Shot } from "@nodetool-ai/protocol";

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
  __resetStartingShotsForTests();
  useStoryboardGenerationStore.getState().clear(shot.id);
  useStoryboardStore.getState().ensureBoard(BOARD);
  useStoryboardStore.getState().upsertShot(BOARD, shot);
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
    mockImageModels.push({ id: "model-1", supported_tasks: supportedTasks });
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
      source_asset_id: "clip-9"
    });
  });
});

describe("a start that fails", () => {
  it("records the reason on the shot and rethrows", async () => {
    send.mockRejectedValue(new Error("No image model configured"));
    const { result } = renderHook(() => useGenerateShot());

    await act(async () => {
      await expect(result.current.generateKeyframe(BOARD, shot)).rejects.toThrow(
        "No image model configured"
      );
    });

    const job = useStoryboardGenerationStore.getState().shotJobs[shot.id];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("No image model configured");
    expect(
      useStoryboardStore.getState().getBoard(BOARD)?.shots[0].status
    ).toBe("failed");
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
    expect(promptSent()).toBe(directClipPrompt(direct, { scene, style: STYLE }));
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
      clip: { type: "video", asset_id: "clip-1", uri: "asset://clip-1" }
    };
    useStoryboardStore.getState().upsertShot(BOARD, revisable);

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
