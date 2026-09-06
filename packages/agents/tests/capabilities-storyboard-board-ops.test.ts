/**
 * The board operations `edit_storyboard` grew for the guided storyboard flow,
 * plus `direct_storyboard` and `stale_only`.
 *
 * These mirror `web/src/lib/tools/builtin/__tests__/storyboardDocumentTools.test.tsx`
 * assertion for assertion: the two surfaces write the same document, and a
 * divergence between them is what this file exists to catch. Each case asserts
 * the persisted document, not that an op reported success — an op that returns
 * `applied: 1` and changes nothing is the failure this suite is for.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  Storyboard,
  initTestDb
} from "@nodetool-ai/models";
import {
  currentRenderInputs,
  stampRenderInputs
} from "@nodetool-ai/protocol";
import type { RenderInputs, Scene, Shot } from "@nodetool-ai/protocol";
import type { StoryboardDocument } from "@nodetool-ai/models";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/** A context that renders a fixed PNG and can answer a director tool call. */
function ctx(directorAnswer?: Record<string, unknown>) {
  const context = {
    userId: "u1",
    runProviderPrediction: vi.fn(async () => PNG),
    runGeneration: vi.fn(async () => ({
      assets: [{ asset_id: "asset-1", uri: "asset://asset-1" }],
      output: null
    })),
    hasModelInterface: (name: string) => name === "createAsset",
    getProvider: vi.fn(async () => ({
      generateMessage: vi.fn(async () => ({
        content: "",
        toolCalls: directorAnswer
          ? [{ name: "screenplay", args: directorAnswer }]
          : []
      }))
    }))
  };
  return context as unknown as ProcessingContext;
}

const run = (context: ProcessingContext) =>
  createCapabilityRun({ context, gate: UNGATED });

const shot = (
  overrides: Partial<Shot> & { id: string; index: number }
): Shot => ({
  type: "shot",
  action: `beat ${overrides.index}`,
  status: "planned",
  ...overrides
});

const SCENE_A: Scene = { type: "scene", id: "sc-a", slugline: "INT. HALL" };
const SCENE_B: Scene = { type: "scene", id: "sc-b", slugline: "EXT. PIER" };

const DEFAULT_SHOTS = (): Shot[] => [
  shot({ id: "s1", index: 0, scene_id: "sc-a" }),
  shot({ id: "s2", index: 1, scene_id: "sc-a" }),
  shot({ id: "s3", index: 2, scene_id: "sc-b" })
];

async function makeBoard(
  overrides: Partial<StoryboardDocument> = {}
): Promise<Storyboard> {
  const shots = overrides.shots ?? DEFAULT_SHOTS();
  return Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Board",
    document: JSON.stringify({
      screenplay: {
        type: "screenplay",
        id: "sp-1",
        title: "Dark Water",
        shots: [],
        scenes: [SCENE_A, SCENE_B]
      },
      brief: "A lighthouse keeper loses the light.",
      style: "grainy 16mm",
      entityIds: [],
      aspectRatio: "16:9",
      setupStage: "done",
      genre: "",
      directorModel: {
        type: "language_model",
        id: "claude-sonnet-5",
        provider: "anthropic"
      },
      imageModel: { type: "image_model", id: "flux", provider: "fal_ai" },
      videoModel: { type: "video_model", id: "vid-1", provider: "fal_ai" },
      ...overrides,
      shots
    })
  });
}

const reread = async (id: string): Promise<StoryboardDocument> => {
  const row = await Storyboard.findById(id);
  if (!row) throw new Error(`no board ${id}`);
  return (row as Storyboard).toDocument();
};

interface EditResult {
  applied: number;
  failed: number;
  ops: { ok: boolean; error?: string; result?: unknown }[];
}

const edit = async (
  context: ProcessingContext,
  boardId: string,
  ops: Record<string, unknown>[]
): Promise<EditResult> =>
  (await run(context).invoke("edit_storyboard", {
    storyboard_id: boardId,
    ops
  })) as EditResult;

/** An entity asset the library resolves, so `set_style` can read it. */
async function makeStyleEntity(
  id: string,
  name: string,
  descriptor: string,
  kind = "style"
): Promise<string> {
  const asset = await Asset.create<Asset>({
    id,
    user_id: "u1",
    name,
    content_type: "image/png",
    metadata: { nodetool_entity: { kind, name, descriptor } }
  });
  return asset.id;
}

beforeEach(() => initTestDb());
afterEach(() => ModelObserver.clear());

describe("set_setup", () => {
  it("writes brief, genre and stage together", async () => {
    const context = ctx();
    const board = await makeBoard();
    const result = await edit(context, board.id, [
      {
        op: "set_setup",
        brief: "A ferry captain loses the tide.",
        genre: "noir thriller",
        stage: "review"
      }
    ]);
    expect(result.failed).toBe(0);

    const doc = await reread(board.id);
    expect(doc.brief).toBe("A ferry captain loses the tide.");
    expect(doc.genre).toBe("noir thriller");
    expect(doc.setupStage).toBe("review");
  });

  it("leaves the fields it is not given, and refuses an unknown stage", async () => {
    const context = ctx();
    const board = await makeBoard();
    await edit(context, board.id, [{ op: "set_setup", stage: "look" }]);
    expect((await reread(board.id)).setupStage).toBe("look");
    expect((await reread(board.id)).brief).toBe(
      "A lighthouse keeper loses the light."
    );

    const refused = await edit(context, board.id, [
      { op: "set_setup", stage: "look-dev" }
    ]);
    expect(refused.ops[0].error).toMatch(/stage must be one of/);
    expect((await reread(board.id)).setupStage).toBe("look");
  });
});

describe("ordering ops", () => {
  it("move_shot changes scene and reindexes contiguously", async () => {
    const context = ctx();
    const board = await makeBoard();
    const result = await edit(context, board.id, [
      { op: "move_shot", target: "s3", scene_id: "sc-a", position: 0 }
    ]);
    expect(result.failed).toBe(0);

    const doc = await reread(board.id);
    expect(doc.shots.map((s) => s.id)).toEqual(["s3", "s1", "s2"]);
    expect(doc.shots.map((s) => s.scene_id)).toEqual(["sc-a", "sc-a", "sc-a"]);
    expect(doc.shots.map((s) => s.index)).toEqual([0, 1, 2]);
    // The emptied scene is dropped: a scene's position is its first shot's.
    expect(doc.screenplay?.scenes?.map((s) => s.id)).toEqual(["sc-a"]);
  });

  it("move_shot keeps the shot's own scene when none is named", async () => {
    const context = ctx();
    const board = await makeBoard();
    await edit(context, board.id, [
      { op: "move_shot", target: "s1", position: 1 }
    ]);

    const doc = await reread(board.id);
    expect(doc.shots.map((s) => s.id)).toEqual(["s2", "s1", "s3"]);
    expect(doc.shots.find((s) => s.id === "s1")?.scene_id).toBe("sc-a");
  });

  it("duplicate_shot copies in place and drops the script link", async () => {
    const context = ctx();
    const board = await makeBoard({
      shots: [
        shot({
          id: "s1",
          index: 0,
          scene_id: "sc-a",
          script_line_ids: ["line-1"],
          script_text_snapshot: "hello",
          duration_source: "audio"
        }),
        shot({ id: "s2", index: 1, scene_id: "sc-a" }),
        shot({ id: "s3", index: 2, scene_id: "sc-b" })
      ]
    });
    await edit(context, board.id, [{ op: "duplicate_shot", target: "s1" }]);

    const doc = await reread(board.id);
    const copy = doc.shots[1];
    expect(copy.id).not.toBe("s1");
    expect(copy.action).toBe(doc.shots[0].action);
    expect(copy.scene_id).toBe("sc-a");
    expect(copy.script_line_ids).toBeUndefined();
    expect(copy.script_text_snapshot).toBeUndefined();
    expect(copy.duration_source).toBe("manual");
    expect(doc.shots.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("add_shot inserts after after_shot_id, in that shot's scene", async () => {
    const context = ctx();
    const board = await makeBoard();
    await edit(context, board.id, [
      {
        op: "add_shot",
        action: "insert on the stairs",
        slug: "Stairs",
        after_shot_id: "s1"
      }
    ]);

    const doc = await reread(board.id);
    expect(doc.shots[1].action).toBe("insert on the stairs");
    expect(doc.shots[1].slug).toBe("Stairs");
    expect(doc.shots[1].scene_id).toBe("sc-a");
    expect(doc.shots.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("remove_shot deletes and renumbers", async () => {
    const context = ctx();
    const board = await makeBoard();
    await edit(context, board.id, [{ op: "remove_shot", target: "s2" }]);

    const doc = await reread(board.id);
    expect(doc.shots.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(doc.shots.map((s) => s.index)).toEqual([0, 1]);
  });
});

describe("scene ops", () => {
  it("update_scene writes the slugline and lighting", async () => {
    const context = ctx();
    const board = await makeBoard();
    await edit(context, board.id, [
      {
        op: "update_scene",
        scene_id: "sc-a",
        slugline: "INT. HALL - NIGHT",
        lighting: "single practical, hard shadows"
      }
    ]);

    const doc = await reread(board.id);
    expect(doc.screenplay?.scenes?.[0]).toMatchObject({
      id: "sc-a",
      slugline: "INT. HALL - NIGHT",
      lighting: "single practical, hard shadows"
    });
  });

  it("create_scene adds a scene holding one blank shot", async () => {
    const context = ctx();
    const board = await makeBoard();
    const result = await edit(context, board.id, [
      { op: "create_scene", after_scene_id: "sc-a" }
    ]);
    const created = result.ops[0].result as { id: string; shot_id: string };

    const doc = await reread(board.id);
    expect(doc.screenplay?.scenes?.map((s) => s.id)).toContain(created.id);
    expect(doc.shots[2].id).toBe(created.shot_id);
    expect(doc.shots[2].scene_id).toBe(created.id);
    expect(doc.shots[2].action).toBe("");
    expect(doc.shots.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("merge_scene folds a scene into the one before it, and refuses the first", async () => {
    const context = ctx();
    const board = await makeBoard();
    const merged = await edit(context, board.id, [
      { op: "merge_scene", scene_id: "sc-b" }
    ]);
    expect(merged.ops[0].result).toEqual({ merged: "sc-b", into: "sc-a" });

    const doc = await reread(board.id);
    expect(doc.shots.map((s) => s.scene_id)).toEqual(["sc-a", "sc-a", "sc-a"]);
    expect(doc.screenplay?.scenes?.map((s) => s.id)).toEqual(["sc-a"]);

    const refused = await edit(context, board.id, [
      { op: "merge_scene", scene_id: "sc-a" }
    ]);
    expect(refused.ops[0].error).toMatch(/first scene/);
  });
});

describe("set_style", () => {
  it("applies an entity id as a preset, replacing the previous style", async () => {
    const context = ctx();
    await makeStyleEntity("style-noir", "Noir", "hard shadows, wet streets");
    await makeStyleEntity("style-warm", "Warm", "golden hour");
    await makeStyleEntity(
      "char-1",
      "Sophia",
      "a keeper in a yellow coat",
      "character"
    );
    const board = await makeBoard({ entityIds: ["style-warm", "char-1"] });

    const result = await edit(context, board.id, [
      { op: "set_style", entity_id: "style-noir" }
    ]);
    expect(result.failed).toBe(0);

    const doc = await reread(board.id);
    expect(doc.style).toBe("hard shadows, wet streets");
    expect(doc.entityIds).toEqual(["char-1", "style-noir"]);
  });

  it("sets the style text alone when given a descriptor", async () => {
    const context = ctx();
    const board = await makeBoard();
    await edit(context, board.id, [
      { op: "set_style", style: "bleach bypass, high contrast" }
    ]);

    const doc = await reread(board.id);
    expect(doc.style).toBe("bleach bypass, high contrast");
    expect(doc.entityIds).toEqual([]);
  });

  it("refuses an entity that is not a style", async () => {
    const context = ctx();
    await makeStyleEntity("char-1", "Sophia", "yellow coat", "character");
    const board = await makeBoard({ entityIds: ["char-1"] });

    const result = await edit(context, board.id, [
      { op: "set_style", entity_id: "char-1" }
    ]);
    expect(result.ops[0].error).toMatch(/is a character, not a style/);
    expect((await reread(board.id)).style).toBe("grainy 16mm");
  });
});

describe("version ops", () => {
  const still = (id: string) => ({
    type: "image" as const,
    asset_id: id,
    uri: `asset://${id}`
  });

  const withStills = () =>
    makeBoard({
      shots: [
        shot({
          id: "s1",
          index: 0,
          scene_id: "sc-a",
          status: "keyframe_ready",
          keyframe: still("a2"),
          keyframe_versions: [still("a1"), still("a2")]
        }),
        shot({ id: "s2", index: 1, scene_id: "sc-a" })
      ]
    });

  it("select_version picks a preserved still", async () => {
    const context = ctx();
    const board = await withStills();
    await edit(context, board.id, [
      { op: "select_version", target: "s1", kind: "keyframe", version: 0 }
    ]);

    const doc = await reread(board.id);
    expect(doc.shots[0].keyframe?.asset_id).toBe("a1");
    expect(doc.shots[0].keyframe_versions).toHaveLength(2);
  });

  it("delete_version removes one and re-selects a neighbour", async () => {
    const context = ctx();
    const board = await withStills();
    await edit(context, board.id, [
      { op: "delete_version", target: "s1", kind: "keyframe", version: 1 }
    ]);

    const doc = await reread(board.id);
    expect(doc.shots[0].keyframe_versions?.map((v) => v.asset_id)).toEqual([
      "a1"
    ]);
    expect(doc.shots[0].keyframe?.asset_id).toBe("a1");
  });

  it("delete_version refuses an index the shot does not hold", async () => {
    const context = ctx();
    const board = await withStills();
    const result = await edit(context, board.id, [
      { op: "delete_version", target: "s1", kind: "keyframe", version: 7 }
    ]);
    expect(result.ops[0].error).toMatch(/version must be an integer/);
    expect((await reread(board.id)).shots[0].keyframe_versions).toHaveLength(2);
  });

  it("add_keyframe_version appends and selects, never overwrites", async () => {
    const context = ctx();
    const board = await withStills();
    await edit(context, board.id, [
      {
        op: "add_keyframe_version",
        target: "s1",
        asset_id: "a3",
        flip_of: "a2"
      }
    ]);

    const doc = await reread(board.id);
    expect(doc.shots[0].keyframe_versions?.map((v) => v.asset_id)).toEqual([
      "a1",
      "a2",
      "a3"
    ]);
    expect(doc.shots[0].keyframe?.asset_id).toBe("a3");
    expect(doc.shots[0].keyframe).toMatchObject({ flip_of: "a2" });
    // An upload or a flip is not a render, so it can never read stale.
    expect(doc.shots[0].keyframe?.render_inputs).toBeUndefined();
  });
});

describe("stale_only", () => {
  /** The board values a render record is compared against. */
  const renderContext = (doc: StoryboardDocument) => ({
    aspect_ratio: doc.aspectRatio,
    image_model: "flux",
    video_model: "vid-1",
    style_entity_id: null,
    style: doc.style,
    scenes: doc.screenplay?.scenes ?? null
  });

  /** A still recorded with `overrides` applied to today's inputs. */
  const recordedStill = (
    target: Shot,
    doc: StoryboardDocument,
    assetId: string,
    overrides: Partial<RenderInputs> = {}
  ) => ({
    type: "image" as const,
    asset_id: assetId,
    uri: `asset://${assetId}`,
    render_inputs: {
      ...stampRenderInputs(
        currentRenderInputs(target, renderContext(doc), "keyframe")
      ),
      ...overrides
    }
  });

  it("renders only the shots whose selected still is out of date", async () => {
    const base = await makeBoard();
    const doc = await reread(base.id);
    // s1's still records the board as it stands; s2's records a style entity
    // the board no longer carries; s3 has no still, so no record to be out of
    // date with.
    const current = recordedStill(doc.shots[0], doc, "a1");
    const stale = recordedStill(doc.shots[1], doc, "a2", {
      style_entity_id: "style-gone"
    });
    const row = await Storyboard.findById(base.id);
    await Storyboard.updateFieldsIfUnchanged(
      base.id,
      (row as Storyboard).updated_at,
      {
        document: JSON.stringify({
          ...doc,
          shots: [
            { ...doc.shots[0], keyframe: current, keyframe_versions: [current] },
            { ...doc.shots[1], keyframe: stale, keyframe_versions: [stale] },
            doc.shots[2]
          ]
        })
      }
    );

    const rendered = (await run(ctx()).invoke("render_storyboard_stills", {
      storyboard_id: base.id,
      targets: ["s1", "s2", "s3"],
      stale_only: true
    })) as { rendered: number; skipped: string[]; results: { shot_id: string }[] };

    expect(rendered.results.map((r) => r.shot_id)).toEqual(["s2"]);
    expect(rendered.skipped).toEqual(["s1", "s3"]);
  });

  it("filters clips the same way, off the selected take's record", async () => {
    const base = await makeBoard();
    const doc = await reread(base.id);
    const clipRecord = (target: Shot, overrides: Partial<RenderInputs> = {}) => ({
      type: "video" as const,
      asset_id: `clip-${target.id}`,
      uri: `asset://clip-${target.id}`,
      render_inputs: {
        ...stampRenderInputs(
          currentRenderInputs(target, renderContext(doc), "clip")
        ),
        ...overrides
      }
    });
    const still = (id: string) => ({
      type: "image" as const,
      asset_id: id,
      uri: `asset://${id}`
    });
    const row = await Storyboard.findById(base.id);
    await Storyboard.updateFieldsIfUnchanged(
      base.id,
      (row as Storyboard).updated_at,
      {
        document: JSON.stringify({
          ...doc,
          shots: doc.shots.slice(0, 2).map((s, i) => ({
            ...s,
            status: "rendered",
            keyframe: still(`k${i}`),
            clip: clipRecord(
              { ...s, keyframe: still(`k${i}`) } as Shot,
              i === 1 ? { model: "vid-old" } : {}
            )
          }))
        })
      }
    );

    const rendered = (await run(ctx()).invoke("render_storyboard_clips", {
      storyboard_id: base.id,
      targets: ["s1", "s2"],
      stale_only: true
    })) as { skipped: string[]; results: { shot_id: string }[] };

    expect(rendered.results.map((r) => r.shot_id)).toEqual(["s2"]);
    expect(rendered.skipped).toEqual(["s1"]);
  });

  it("renders every selected shot when stale_only is absent", async () => {
    const base = await makeBoard();

    const rendered = (await run(ctx()).invoke("render_storyboard_stills", {
      storyboard_id: base.id,
      targets: ["s1", "s2", "s3"]
    })) as { skipped: string[]; results: { shot_id: string }[] };

    expect(rendered.results.map((r) => r.shot_id)).toEqual(["s1", "s2", "s3"]);
    expect(rendered.skipped).toEqual([]);
  });

  // The two halves of the contract have to meet: `stale_only` reads a record
  // only the render path can write. Every case above hand-writes one, so this
  // is the one that fails if the headless render stops stamping — which it did
  // when the flow first shipped, leaving `stale_only` permanently empty.
  it("records what it rendered, so a later stale_only can read it", async () => {
    const base = await makeBoard();
    await run(ctx()).invoke("render_storyboard_stills", {
      storyboard_id: base.id,
      targets: ["s1"]
    });

    const afterRender = await reread(base.id);
    const record = afterRender.shots[0].keyframe?.render_inputs;
    expect(record?.kind).toBe("keyframe");
    expect(record?.model).toBe(afterRender.imageModel?.id);
    expect(record?.aspect_ratio).toBe(afterRender.aspectRatio);

    // Nothing about the board moved, so the still it just rendered is current.
    const unchanged = (await run(ctx()).invoke("render_storyboard_stills", {
      storyboard_id: base.id,
      targets: ["s1"],
      stale_only: true
    })) as { skipped: string[] };
    expect(unchanged.skipped).toEqual(["s1"]);

    await run(ctx()).invoke("edit_storyboard", {
      storyboard_id: base.id,
      ops: [{ op: "set_style", descriptor: "warm tungsten, soft halation" }]
    });

    const afterStyle = (await run(ctx()).invoke("render_storyboard_stills", {
      storyboard_id: base.id,
      targets: ["s1"],
      stale_only: true
    })) as { skipped: string[]; results: { shot_id: string }[] };
    expect(afterStyle.results.map((r) => r.shot_id)).toEqual(["s1"]);
    expect(afterStyle.skipped).toEqual([]);
  });
});

describe("direct_storyboard", () => {
  const answer = (shots: Record<string, unknown>[]) => ({
    title: "Dark Water",
    shots
  });

  it("refuses to overwrite existing shots without redirect", async () => {
    const board = await makeBoard();
    const result = (await run(ctx()).invoke("direct_storyboard", {
      storyboard_id: board.id
    })) as { error?: string };
    expect(result.error).toMatch(/already has 3 shots/);
  });

  it("refuses a board with no brief", async () => {
    const board = await makeBoard({ brief: "", shots: [] });
    const result = (await run(ctx()).invoke("direct_storyboard", {
      storyboard_id: board.id
    })) as { error?: string };
    expect(result.error).toMatch(/no brief/);
  });

  it("writes the directed screenplay onto an empty board", async () => {
    const context = ctx(
      answer([
        { slug: "One", action: "wide of the pier" },
        { slug: "Two", action: "close on the lamp" }
      ])
    );
    const board = await makeBoard({ shots: [], genre: "noir thriller" });

    const result = (await run(context).invoke("direct_storyboard", {
      storyboard_id: board.id,
      shot_count: 2
    })) as { shots: { action: string }[] };
    expect(result.shots.map((s) => s.action)).toEqual([
      "wide of the pier",
      "close on the lamp"
    ]);

    const doc = await reread(board.id);
    expect(doc.shots.map((s) => s.action)).toEqual([
      "wide of the pier",
      "close on the lamp"
    ]);
    expect(doc.screenplay?.genre).toBe("noir thriller");
  });

  it("re-directs in place, keeping the media of a retained shot", async () => {
    const context = ctx(
      answer([
        { slug: "One", action: "rewritten wide of the pier" },
        { slug: "Two", action: "close on the lamp" }
      ])
    );
    // A directed board's shots are `shot-N` — the ids parseScreenplay stamps —
    // so a re-direct of the same length lands on the same ids.
    const board = await makeBoard({
      shots: [
        shot({
          id: "shot-0",
          index: 0,
          status: "keyframe_ready",
          keyframe: { type: "image", asset_id: "a1", uri: "asset://a1" }
        }),
        shot({ id: "shot-1", index: 1 })
      ],
      screenplay: null
    });

    await run(context).invoke("direct_storyboard", {
      storyboard_id: board.id,
      redirect: true,
      shot_count: 2
    });

    const doc = await reread(board.id);
    const retained = doc.shots.find((s) => s.id === "shot-0");
    expect(retained?.action).toBe("rewritten wide of the pier");
    expect(retained?.keyframe?.asset_id).toBe("a1");
    expect(retained?.status).toBe("keyframe_ready");
    expect(doc.shots).toHaveLength(2);
  });
});
