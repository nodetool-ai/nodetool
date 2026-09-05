/**
 * @jest-environment jsdom
 *
 * The `ui_storyboard_*` tools against the real store.
 *
 * `storyboardTools.test.ts` pins the wire surface with a mocked handler; this
 * suite drives the same tools through the live bridge and asserts what the
 * board document holds afterwards, because a tool that calls the right handler
 * method and leaves the document wrong is the failure the mock cannot see.
 *
 * Only the three things the browser owns are faked: the render jobs
 * (`useGenerateShot`), the entity library query, and the Director's provider
 * call. Everything else is the shipped store, the shipped bridge and the
 * shipped tools.
 */
import { renderHook, act } from "@testing-library/react";
import type { Entity, RenderInputs, Scene, Shot } from "@nodetool-ai/protocol";
import { currentRenderInputs, stampRenderInputs } from "@nodetool-ai/protocol";

const generateKeyframe = jest.fn(async (_boardId: string, _shot: Shot) => {});
const generateClip = jest.fn(async (_boardId: string, _shot: Shot) => {});
const generateRevisedClip = jest.fn(async () => {});
jest.mock("../../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe,
    generateClip,
    generateRevisedClip
  })
}));
jest.mock("../../../../hooks/storyboard/useAssembleTimeline", () => ({
  useAssembleTimeline: () => ({ assemble: jest.fn() })
}));
jest.mock("../../../../hooks/storyboard/useExtractScriptFromBoard", () => ({
  useExtractScriptFromBoard: () => ({ extract: jest.fn() })
}));
jest.mock("../../../../hooks/storyboard/useReprojectShots", () => ({
  useReprojectShots: () => ({ reproject: jest.fn() })
}));

let library: Entity[] = [];
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: library })
}));

const rpcRequest = jest.fn();
jest.mock("../../../websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-test"
}));

import { FrontendToolRegistry } from "../../frontendTools";
import type { FrontendToolState } from "../../frontendTools";
import { useStoryboardAgentBridge } from "../../../../hooks/storyboard/useStoryboardAgentBridge";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../../../stores/storyboard/StoryboardStore";
import "../storyboard";

const BOARD = "board-doc";
const ctx = { getState: () => ({}) as FrontendToolState };

const call = (name: string, args: Record<string, unknown>): Promise<unknown> =>
  FrontendToolRegistry.call(
    name,
    { storyboard_id: BOARD, ...args },
    `tc-${name}`,
    ctx
  );

const shot = (overrides: Partial<Shot> & { id: string; index: number }): Shot =>
  ({
    type: "shot",
    action: `beat ${overrides.index}`,
    status: "planned",
    ...overrides
  }) as Shot;

const SCENE_A: Scene = { type: "scene", id: "sc-a", slugline: "INT. HALL" };
const SCENE_B: Scene = { type: "scene", id: "sc-b", slugline: "EXT. PIER" };

const board = (): StoryboardBoard => {
  const found = useStoryboardStore.getState().getBoard(BOARD);
  if (!found) throw new Error("board vanished");
  return found;
};

const shotIds = (): string[] => board().shots.map((s) => s.id);

/** Seed a two-scene board: sc-a holds s1/s2, sc-b holds s3. */
const seed = (shots?: Shot[], scenes?: Scene[]): void => {
  const store = useStoryboardStore.getState();
  store.loadBoard(BOARD, {
    screenplay: {
      type: "screenplay",
      id: "sp-1",
      title: "Dark Water",
      shots: [],
      scenes: scenes ?? [SCENE_A, SCENE_B]
    },
    shots:
      shots ??
      [
        shot({ id: "s1", index: 0, scene_id: "sc-a" }),
        shot({ id: "s2", index: 1, scene_id: "sc-a" }),
        shot({ id: "s3", index: 2, scene_id: "sc-b" })
      ],
    title: "Dark Water",
    brief: "A lighthouse keeper loses the light.",
    style: "grainy 16mm",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "done",
    genre: "",
    directorModel: {
      type: "language_model",
      provider: "anthropic",
      id: "claude-sonnet-5"
    } as StoryboardBoard["directorModel"],
    imageModel: {
      type: "image_model",
      provider: "fal_ai",
      id: "flux"
    } as StoryboardBoard["imageModel"],
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

const mountBridge = (): void => {
  renderHook(() => useStoryboardAgentBridge(BOARD));
};

beforeEach(() => {
  library = [];
  rpcRequest.mockReset();
  generateKeyframe.mockClear();
  generateClip.mockClear();
  useStoryboardStore.setState({ boards: {}, history: {} } as never);
  seed();
  mountBridge();
});

describe("ui_storyboard_set_setup", () => {
  it("writes brief, genre and stage as one undoable edit", async () => {
    await call("ui_storyboard_set_setup", {
      brief: "A ferry captain loses the tide.",
      genre: "noir thriller",
      stage: "review"
    });

    expect(board().brief).toBe("A ferry captain loses the tide.");
    expect(board().genre).toBe("noir thriller");
    expect(board().setupStage).toBe("review");

    act(() => useStoryboardStore.getState().undo(BOARD));
    expect(board().genre).toBe("");
    expect(board().setupStage).toBe("done");
  });

  it("leaves the fields it is not given", async () => {
    await call("ui_storyboard_set_setup", { stage: "look" });
    expect(board().setupStage).toBe("look");
    expect(board().brief).toBe("A lighthouse keeper loses the light.");
  });
});

describe("ui_storyboard_direct", () => {
  const answer = (shots: Record<string, unknown>[]) => ({
    text: "",
    data: { title: "Dark Water", shots }
  });

  it("refuses to overwrite an existing screenplay without redirect", async () => {
    await expect(
      call("ui_storyboard_direct", { redirect: false })
    ).rejects.toThrow(/already has a screenplay/);
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it("re-directs in place, keeping the media of a retained shot", async () => {
    // A directed board's shots are `shot-N` — the ids parseScreenplay stamps —
    // so a re-direct of the same length lands on the same ids and setScreenplay
    // keeps their media.
    seed([
      shot({ id: "shot-0", index: 0 }),
      shot({ id: "shot-1", index: 1 })
    ], []);
    mountBridge();
    useStoryboardStore.getState().setShotKeyframe(BOARD, "shot-0", {
      type: "image",
      asset_id: "a1",
      uri: "asset://a1"
    });
    rpcRequest.mockResolvedValue(
      answer([
        { slug: "One", action: "rewritten wide of the pier" },
        { slug: "Two", action: "close on the lamp" }
      ])
    );

    await act(async () => {
      await call("ui_storyboard_direct", { redirect: true, shotCount: 2 });
    });

    const retained = board().shots.find((s) => s.id === "shot-0");
    expect(retained?.action).toBe("rewritten wide of the pier");
    expect(retained?.keyframe?.asset_id).toBe("a1");
    expect(board().shots).toHaveLength(2);
  });

  it("fails the call when the Director run produces nothing", async () => {
    seed([], []);
    useStoryboardStore.getState().applyMerged(BOARD, {
      ...board(),
      screenplay: null
    });
    mountBridge();
    rpcRequest.mockRejectedValue(new Error("provider is down"));

    await expect(
      call("ui_storyboard_direct", { redirect: false, shotCount: 2 })
    ).rejects.toThrow(/produced no screenplay/);
    expect(board().shots).toEqual([]);
  });

  it("directs a board that has no screenplay yet", async () => {
    seed([], []);
    useStoryboardStore.getState().applyMerged(BOARD, {
      ...board(),
      screenplay: null
    });
    mountBridge();
    rpcRequest.mockResolvedValue(
      answer([
        { slug: "One", action: "wide of the pier" },
        { slug: "Two", action: "close on the lamp" }
      ])
    );

    await act(async () => {
      await call("ui_storyboard_direct", { redirect: false, shotCount: 2 });
    });

    expect(board().shots.map((s) => s.action)).toEqual([
      "wide of the pier",
      "close on the lamp"
    ]);
  });
});

describe("ordering tools", () => {
  it("ui_storyboard_move_shot changes scene and reindexes contiguously", async () => {
    await call("ui_storyboard_move_shot", {
      target: "s3",
      sceneId: "sc-a",
      position: 0
    });

    expect(shotIds()).toEqual(["s3", "s1", "s2"]);
    expect(board().shots.map((s) => s.scene_id)).toEqual([
      "sc-a",
      "sc-a",
      "sc-a"
    ]);
    expect(board().shots.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("ui_storyboard_duplicate_shot copies in place and drops the script link", async () => {
    useStoryboardStore.getState().updateShot(BOARD, "s1", {
      script_line_ids: ["line-1"],
      script_text_snapshot: "hello",
      duration_source: "audio"
    });

    const result = (await call("ui_storyboard_duplicate_shot", {
      target: "s1"
    })) as { shot: { id: string } };

    const copy = board().shots[1];
    expect(copy.id).toBe(result.shot.id);
    expect(copy.action).toBe(board().shots[0].action);
    expect(copy.scene_id).toBe("sc-a");
    expect(copy.script_line_ids).toBeUndefined();
    expect(copy.script_text_snapshot).toBeUndefined();
    expect(copy.duration_source).toBe("manual");
    expect(shotIds()).toEqual(["s1", copy.id, "s2", "s3"]);
  });

  it("ui_storyboard_remove_shot deletes the shot and renumbers", async () => {
    await call("ui_storyboard_remove_shot", { target: "s2" });

    expect(shotIds()).toEqual(["s1", "s3"]);
    expect(board().shots.map((s) => s.index)).toEqual([0, 1]);
  });

  it("ui_storyboard_add_shot inserts after afterShotId, in that shot's scene", async () => {
    const result = (await call("ui_storyboard_add_shot", {
      action: "insert on the stairs",
      slug: "Stairs",
      afterShotId: "s1"
    })) as { shot: { id: string } };

    const added = board().shots[1];
    expect(added.id).toBe(result.shot.id);
    expect(added.action).toBe("insert on the stairs");
    expect(added.slug).toBe("Stairs");
    expect(added.scene_id).toBe("sc-a");
    expect(board().shots.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });
});

describe("scene tools", () => {
  it("ui_storyboard_update_scene writes the slugline and lighting", async () => {
    await call("ui_storyboard_update_scene", {
      sceneId: "sc-a",
      slugline: "INT. HALL - NIGHT",
      lighting: "single practical, hard shadows"
    });

    const scenes = board().screenplay?.scenes ?? [];
    expect(scenes[0]).toMatchObject({
      id: "sc-a",
      slugline: "INT. HALL - NIGHT",
      lighting: "single practical, hard shadows"
    });
  });

  it("ui_storyboard_create_scene adds a scene holding one blank shot", async () => {
    const result = (await call("ui_storyboard_create_scene", {
      afterSceneId: "sc-a"
    })) as { scene: { id: string; shotIds: string[] } };

    const scenes = board().screenplay?.scenes ?? [];
    expect(scenes.map((s) => s.id)).toContain(result.scene.id);
    const added = board().shots[2];
    expect(added.scene_id).toBe(result.scene.id);
    expect(added.action).toBe("");
    expect(board().shots.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("ui_storyboard_merge_scene folds a scene into the one before it", async () => {
    const result = (await call("ui_storyboard_merge_scene", {
      sceneId: "sc-b"
    })) as { merged: string; into: string };

    expect(result).toMatchObject({ merged: "sc-b", into: "sc-a" });
    expect(board().shots.map((s) => s.scene_id)).toEqual([
      "sc-a",
      "sc-a",
      "sc-a"
    ]);
    expect(board().screenplay?.scenes?.map((s) => s.id)).toEqual(["sc-a"]);
  });

  it("ui_storyboard_merge_scene refuses the first scene", async () => {
    await expect(
      call("ui_storyboard_merge_scene", { sceneId: "sc-a" })
    ).rejects.toThrow(/first scene/);
  });
});

describe("ui_storyboard_set_style", () => {
  const styleEntity: Entity = {
    type: "entity",
    id: "style-noir",
    kind: "style",
    name: "Noir",
    descriptor: "hard shadows, wet streets"
  };
  const otherStyle: Entity = {
    type: "entity",
    id: "style-warm",
    kind: "style",
    name: "Warm",
    descriptor: "golden hour"
  };
  const character: Entity = {
    type: "entity",
    id: "char-1",
    kind: "character",
    name: "Sophia",
    descriptor: "a keeper in a yellow coat"
  };

  it("applies an entity id as a preset, replacing the previous style", async () => {
    library = [styleEntity, otherStyle, character];
    useStoryboardStore
      .getState()
      .setEntityIds(BOARD, ["style-warm", "char-1"]);
    mountBridge();

    await call("ui_storyboard_set_style", { entityId: "style-noir" });

    expect(board().style).toBe("hard shadows, wet streets");
    expect(board().entityIds).toEqual(["char-1", "style-noir"]);
  });

  it("sets the style text alone when given a descriptor", async () => {
    await call("ui_storyboard_set_style", {
      descriptor: "bleach bypass, high contrast"
    });

    expect(board().style).toBe("bleach bypass, high contrast");
    expect(board().entityIds).toEqual([]);
  });

  it("refuses an entity that is not a style", async () => {
    library = [character];
    mountBridge();

    await expect(
      call("ui_storyboard_set_style", { entityId: "char-1" })
    ).rejects.toThrow(/is a character, not a style/);
  });
});

describe("version tools", () => {
  const still = (id: string) => ({
    type: "image" as const,
    asset_id: id,
    uri: `asset://${id}`
  });

  it("ui_storyboard_select_version picks a preserved still", async () => {
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, "s1", still("a1"));
    store.setShotKeyframe(BOARD, "s1", still("a2"));

    await call("ui_storyboard_select_version", {
      target: "s1",
      kind: "keyframe",
      version: 0
    });

    const target = board().shots[0];
    expect(target.keyframe?.asset_id).toBe("a1");
    expect(target.keyframe_versions).toHaveLength(2);
  });

  it("ui_storyboard_delete_version removes one and re-selects a neighbour", async () => {
    const store = useStoryboardStore.getState();
    store.setShotKeyframe(BOARD, "s1", still("a1"));
    store.setShotKeyframe(BOARD, "s1", still("a2"));

    await call("ui_storyboard_delete_version", {
      target: "s1",
      kind: "keyframe",
      version: 1
    });

    const target = board().shots[0];
    expect(target.keyframe_versions?.map((v) => v.asset_id)).toEqual(["a1"]);
    expect(target.keyframe?.asset_id).toBe("a1");
  });

  it("ui_storyboard_add_keyframe_version appends and selects, never overwrites", async () => {
    useStoryboardStore.getState().setShotKeyframe(BOARD, "s1", still("a1"));

    await call("ui_storyboard_add_keyframe_version", {
      target: "s1",
      assetId: "a2",
      flipOf: "a1"
    });

    const target = board().shots[0];
    expect(target.keyframe_versions?.map((v) => v.asset_id)).toEqual([
      "a1",
      "a2"
    ]);
    expect(target.keyframe?.asset_id).toBe("a2");
    expect(target.keyframe).toMatchObject({ flip_of: "a1" });
    // An upload or a flip is not a render, so it can never read stale.
    expect(target.keyframe?.render_inputs).toBeUndefined();
  });
});

describe("staleOnly", () => {
  /** The board values a render record is compared against. */
  const context = () => ({
    aspect_ratio: "16:9",
    image_model: "flux",
    video_model: "",
    style_entity_id: null,
    style: board().style,
    scenes: board().screenplay?.scenes ?? null
  });

  /** Give `shotId` a still recorded with `overrides` applied to today's inputs. */
  const recordStill = (
    shotId: string,
    assetId: string,
    overrides: Partial<RenderInputs> = {}
  ): void => {
    const target = board().shots.find((s) => s.id === shotId);
    if (!target) throw new Error(`no shot ${shotId}`);
    const keyframe = {
      type: "image" as const,
      asset_id: assetId,
      uri: `asset://${assetId}`,
      render_inputs: {
        ...stampRenderInputs(currentRenderInputs(target, context(), "keyframe")),
        ...overrides
      }
    };
    useStoryboardStore
      .getState()
      .updateShot(BOARD, shotId, { keyframe, keyframe_versions: [keyframe] });
  };

  it("renders only the shots whose selected still is out of date", async () => {
    recordStill("s1", "a1");
    // Rendered under a style entity the board no longer carries.
    recordStill("s2", "a2", { style_entity_id: "style-gone" });
    // s3 has no still at all: no record, so nothing to be out of date with.

    const result = (await call("ui_storyboard_generate_keyframe", {
      target: "all",
      staleOnly: true
    })) as { shots: { id: string }[]; skipped: string[] };

    expect(result.shots.map((s) => s.id)).toEqual(["s2"]);
    expect(result.skipped).toEqual(["s1", "s3"]);
    expect(generateKeyframe).toHaveBeenCalledTimes(1);
    expect(generateKeyframe.mock.calls[0][1]).toMatchObject({ id: "s2" });
  });

  it("renders every selected shot when staleOnly is absent", async () => {
    recordStill("s1", "a1");
    recordStill("s2", "a2", { style_entity_id: "style-gone" });

    const result = (await call("ui_storyboard_generate_keyframe", {
      target: "all"
    })) as { shots: { id: string }[]; skipped: string[] };

    expect(result.shots.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(result.skipped).toEqual([]);
    expect(generateKeyframe).toHaveBeenCalledTimes(3);
  });

  it("keeps the single-target shape for one shot", async () => {
    const result = (await call("ui_storyboard_generate_clip", {
      target: "s1"
    })) as { shot: { id: string } | null };

    expect(result.shot?.id).toBe("s1");
    expect(generateClip).toHaveBeenCalledTimes(1);
  });
});

describe("ui_storyboard_update_shot", () => {
  it("writes equipment, dialogue, notes and durationSource", async () => {
    await call("ui_storyboard_update_shot", {
      target: "s1",
      camera: { framing: "close-up", equipment: "steadicam" },
      dialogue: "The light's gone out.",
      notes: "hold two beats past the line",
      durationSource: "audio"
    });

    expect(board().shots[0]).toMatchObject({
      camera: { framing: "close-up", equipment: "steadicam" },
      dialogue: "The light's gone out.",
      notes: "hold two beats past the line",
      duration_source: "audio"
    });
  });
});

describe("ui_storyboard_set_screenplay", () => {
  it("loads genre, scenes and per-shot sceneId through the normalizer", async () => {
    await call("ui_storyboard_set_screenplay", {
      screenplay: {
        type: "screenplay",
        title: "Dark Water",
        genre: "noir thriller",
        scenes: [
          { id: "sc-x", slugline: "EXT. HARBOUR - DAWN", lighting: "flat grey" }
        ],
        shots: [
          { action: "wide of the harbour", sceneId: "sc-x" },
          { action: "close on the rope", sceneId: "sc-x" }
        ]
      }
    });

    expect(board().screenplay?.genre).toBe("noir thriller");
    expect(board().screenplay?.scenes).toEqual([
      {
        type: "scene",
        id: "sc-x",
        slugline: "EXT. HARBOUR - DAWN",
        lighting: "flat grey"
      }
    ]);
    expect(board().shots.map((s) => s.scene_id)).toEqual(["sc-x", "sc-x"]);
  });
});
