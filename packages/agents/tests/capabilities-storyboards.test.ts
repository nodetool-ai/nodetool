/**
 * The `storyboards` capability module.
 *
 * A well-formed, correctly classified module; specs byte-identical to the
 * wire surface they replaced; and implementations that still render, revise, assemble,
 * and direct. `tests/storyboard-render-tools.test.ts` and
 * `tests/document-edit-tools.test.ts` run unmodified against those classes and
 * remain the deep behavioural net.
 */

import { withGenerationSeam } from "./_helpers/generation-seam.js";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  Script,
  Storyboard,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import type { Shot } from "@nodetool-ai/protocol";
import { module as storyboards } from "../src/capabilities/storyboards.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { Tool } from "../src/tools/base-tool.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const MP4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

/** The same fake surface `tests/storyboard-render-tools.test.ts` builds. */
function ctx(userId = "u1") {
  const created: Array<{ id: string; bytes: Uint8Array }> = [];
  const context = {
    userId,
    runProviderPrediction: vi.fn(async (req: never) => {
      const request = req as unknown as { capability: string };
      return request.capability === "text_to_image" ? PNG : MP4;
    }),
    hasModelInterface: (name: string) => name === "createAsset",
    createAsset: vi.fn(
      async (args: {
        name: string;
        contentType: string;
        content: Uint8Array;
      }) => {
        const asset = await Asset.create<Asset>({
          user_id: "u1",
          name: args.name,
          content_type: args.contentType
        });
        created.push({ id: asset.id, bytes: args.content });
        return asset;
      }
    ),
    resolveAssetBytes: vi.fn(async (uri: string) => {
      const id = uri.replace("asset://", "").split(".")[0];
      return { bytes: created.find((c) => c.id === id)?.bytes };
    })
  };
  return withGenerationSeam(context) as unknown as ProcessingContext & {
    runProviderPrediction: ReturnType<typeof vi.fn>;
  };
}

const run = (context: ProcessingContext) =>
  createCapabilityRun({ context, gate: UNGATED });

const shot = (
  overrides: Partial<Shot> & { id: string; index: number }
): Shot => ({
  type: "shot",
  action: `action ${overrides.index}`,
  status: "planned",
  ...overrides
});

async function makeBoard(
  shots: Shot[],
  document: Partial<Record<string, unknown>> = {}
): Promise<Storyboard> {
  return Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Board",
    document: JSON.stringify({
      screenplay: null,
      shots,
      brief: "",
      style: "moody neon",
      entityIds: [],
      aspectRatio: "16:9",
      directorModel: null,
      imageModel: { type: "image_model", id: "img-1", provider: "fal_ai" },
      videoModel: { type: "video_model", id: "vid-1", provider: "fal_ai" },
      ...document
    })
  });
}

/** A shot that assembles: rendered, with a persisted clip asset. */
const renderedShot = (
  id: string,
  index: number,
  scriptLineIds?: string[]
): Shot =>
  shot({
    id,
    index,
    status: "rendered",
    clip: { type: "video", asset_id: `clip-${id}` },
    ...(scriptLineIds ? { script_line_ids: scriptLineIds } : {})
  });

/** Two voiced lines, 1200ms and 800ms of audio. */
async function makeVoicedScript(): Promise<Script> {
  const take = (lineId: string, durationMs: number) => ({
    id: `take-${lineId}`,
    assetId: `asset-${lineId}`,
    durationMs,
    words: [{ word: lineId, startMs: 0, endMs: durationMs }],
    textSnapshot: `text of ${lineId}`,
    voiceSnapshot: null,
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  const line = (lineId: string, durationMs: number) => ({
    id: lineId,
    speakerId: "sp1",
    text: `text of ${lineId}`,
    currentTakeId: `take-${lineId}`,
    takes: [take(lineId, durationMs)]
  });
  return Script.create<Script>({
    user_id: "u1",
    project_id: "default",
    name: "Script",
    document: JSON.stringify({
      cast: [
        {
          id: "sp1",
          name: "Narrator",
          voice: { provider: "openai", model: "tts-1", voice: "alloy" }
        }
      ],
      sections: [
        {
          id: "sec1",
          title: "Main",
          lines: [line("l1", 1200), line("l2", 800)]
        }
      ]
    })
  });
}

const sequenceOf = async (id: string): Promise<TimelineSequence> => {
  const row = await TimelineSequence.findById(id);
  if (!row) throw new Error(`No sequence ${id}`);
  return row;
};

/** Every capability paired with the `Tool` the belt builds for it. */
const PAIRS: Array<[string, () => Tool]> = [
  ["list_storyboards", () => toolForCapabilityName("list_storyboards")],
  ["create_storyboard", () => toolForCapabilityName("create_storyboard")],
  ["get_storyboard", () => toolForCapabilityName("get_storyboard")],
  [
    "render_storyboard_stills",
    () => toolForCapabilityName("render_storyboard_stills")
  ],
  [
    "render_storyboard_clips",
    () => toolForCapabilityName("render_storyboard_clips")
  ],
  [
    "revise_storyboard_clip",
    () => toolForCapabilityName("revise_storyboard_clip")
  ],
  [
    "assemble_storyboard_timeline",
    () => toolForCapabilityName("assemble_storyboard_timeline")
  ],
  ["edit_storyboard", () => toolForCapabilityName("edit_storyboard")],
  [
    "extract_script_from_storyboard",
    () => toolForCapabilityName("extract_script_from_storyboard")
  ]
];

describe("storyboards capability module", () => {
  it("is well-formed and declares itself as storyboards", () => {
    expect(capabilityModuleIssues("storyboards", storyboards)).toEqual([]);
    expect(storyboards.exports.map((e) => e.spec.name)).toEqual([
      "list_storyboards",
      "create_storyboard",
      "get_storyboard",
      "render_storyboard_stills",
      "render_storyboard_clips",
      "revise_storyboard_clip",
      "assemble_storyboard_timeline",
      "edit_storyboard",
      "extract_script_from_storyboard",
      "delete_storyboard"
    ]);
  });

  it("classifies every export the way the gate's map does", () => {
    for (const entry of storyboards.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("keeps the wire surface the belt offers", () => {
    for (const [name, make] of PAIRS) {
      const spec = storyboards.exports.find((e) => e.spec.name === name)?.spec;
      const tool = make();
      expect(spec).toBeDefined();
      expect(tool.name).toBe(name);
      expect(tool.description).toBe(spec?.description);
      expect(tool.inputSchema).toEqual(spec?.inputSchema);
    }
  });

  it("renders the user-facing messages", () => {
    const args = {
      storyboard_id: "b1",
      target: "s1",
      targets: ["s1", "s2"],
      ops: [{ op: "add_shot", action: "Wide" }]
    };
    for (const [name, make] of PAIRS) {
      const spec = storyboards.exports.find((e) => e.spec.name === name)!.spec;
      expect([name, spec.userMessage?.(args)]).toEqual([
        name,
        make().userMessage(args)
      ]);
    }
  });
});

describe("storyboards capability behaviour", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("returns the new board id under `id` as well as `storyboard_id`", async () => {
    const created = (await run(ctx()).invoke("create_storyboard", {
      name: "Ids"
    })) as { storyboard_id: string; id: string };
    // Reading `.id` off this result and passing the undefined onward is what a
    // create/edit pair actually did; the edit then blamed a missing argument.
    expect(created.id).toBe(created.storyboard_id);
    expect(typeof created.id).toBe("string");
  });

  it("set_board stores the board's image and video models", async () => {
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "Models"
    })) as { storyboard_id: string };

    const imageModel = {
      type: "image_model",
      provider: "atlascloud",
      id: "openai/gpt-image-2/text-to-image"
    };
    const edited = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [{ op: "set_board", image_model: imageModel }]
    })) as { applied: number };
    expect(edited.applied).toBe(1);

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: created.storyboard_id
    })) as { image_model: Record<string, unknown> | null };
    // Before this the keys were dropped silently: the op reported success and
    // the render then refused for want of a model.
    expect(read.image_model).toMatchObject({
      provider: "atlascloud",
      id: "openai/gpt-image-2/text-to-image"
    });
  });

  it("casts entities through the op name the browser tool goes by", async () => {
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "Cast"
    })) as { storyboard_id: string };

    // The browser tool is `ui_storyboard_set_entities`, so a script written
    // against it reaches for `set_entities` here. That used to be refused with
    // a list of five op names, none of which said which one takes entity_ids.
    const edited = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [{ op: "set_entities", entity_ids: ["style-1", "char-1"] }]
    })) as { applied: number; failed: number };
    expect(edited.failed).toBe(0);
    expect(edited.applied).toBe(1);

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: created.storyboard_id
    })) as { entity_ids: string[] };
    expect(read.entity_ids).toEqual(["style-1", "char-1"]);
  });

  it("still refuses an op name that means nothing", async () => {
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "Bogus"
    })) as { storyboard_id: string };
    const refused = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [{ op: "set_everything", entity_ids: ["a"] }]
    })) as { error?: string };
    expect(refused.error).toMatch(/expected one of/);
  });

  it("set_board clears a model when passed null", async () => {
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "Clear"
    })) as { storyboard_id: string };
    await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [{ op: "set_board", video_model: { provider: "fal_ai", id: "x" } }]
    });
    await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [{ op: "set_board", video_model: null }]
    });
    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: created.storyboard_id
    })) as { video_model: unknown };
    expect(read.video_model).toBeNull();
  });

  it("refuses an op key it does not know instead of dropping it", async () => {
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "Unknown keys"
    })) as { storyboard_id: string };

    const refused = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      // `set_entities` is the op name a caller reached for; it does not exist,
      // and passing its argument to set_board used to succeed and change nothing.
      ops: [{ op: "set_board", entities: ["a", "b"] }]
    })) as {
      applied: number;
      failed: number;
      ops: Array<{ error?: string }>;
    };
    expect(refused.applied).toBe(0);
    expect(refused.failed).toBe(1);
    expect(refused.ops[0].error).toContain("`entities`");
    expect(refused.ops[0].error).toContain("entity_ids");
  });

  it("sets a shot's duration source, and refuses an unknown one", async () => {
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "Interview"
    })) as { storyboard_id: string };

    const edited = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [
        {
          op: "add_shot",
          action: "Talking head",
          duration_seconds: 4,
          duration_source: "audio"
        }
      ]
    })) as { applied: number };
    expect(edited.applied).toBe(1);

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: created.storyboard_id
    })) as { shots: Array<{ id: string; duration_source?: string }> };
    expect(read.shots[0].duration_source).toBe("audio");

    const refused = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [
        {
          op: "update_shot",
          target: read.shots[0].id,
          duration_source: "vibes"
        }
      ]
    })) as { failed: number; ops: Array<{ ok: boolean; error?: string }> };
    expect(refused.failed).toBe(1);
    expect(refused.ops[0].error).toContain('"audio" or "manual"');
  });

  it("refuses a shot field it does not set, instead of dropping it", async () => {
    // `{op: "update_shot", target, clip: "asset://…"}` came back applied: 1
    // and changed nothing. The session read that as the board rejecting its
    // asset rather than as the op ignoring a field it never had, and went
    // looking for a different way to attach media that does not exist.
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "The Last Drop"
    })) as { storyboard_id: string };
    await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [{ op: "add_shot", action: "Desert push-in" }]
    });
    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: created.storyboard_id
    })) as { shots: Array<{ id: string }> };

    const refused = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [
        {
          op: "update_shot",
          target: read.shots[0].id,
          clip: "asset://abc.mp4"
        }
      ]
    })) as { applied: number; failed: number; ops: Array<{ error?: string }> };
    expect(refused.applied).toBe(0);
    expect(refused.failed).toBe(1);
    expect(refused.ops[0].error).toContain("`clip`");
    expect(refused.ops[0].error).toContain("render_storyboard_clips");
  });

  it("creates a blank board the caller can then edit", async () => {
    const context = ctx();
    const created = (await run(context).invoke("create_storyboard", {
      name: "Lighthouse",
      brief: "A keeper at dusk",
      style: "moody neon",
      aspect_ratio: "2.39:1"
    })) as {
      ok: boolean;
      storyboard_id: string;
      name: string;
      shots: number;
    };
    expect(created).toMatchObject({
      ok: true,
      name: "Lighthouse",
      shots: 0
    });
    expect(created.storyboard_id).toBeTruthy();

    const listed = (await run(context).invoke("list_storyboards", {})) as {
      storyboards: Array<{ id: string; name: string; shots: number }>;
    };
    expect(listed.storyboards).toEqual([
      expect.objectContaining({
        id: created.storyboard_id,
        name: "Lighthouse",
        shots: 0
      })
    ]);

    const edited = (await run(context).invoke("edit_storyboard", {
      storyboard_id: created.storyboard_id,
      ops: [{ op: "add_shot", action: "Wide of the lighthouse at dusk" }]
    })) as { applied: number; shots: Array<{ action: string }> };
    expect(edited.applied).toBe(1);
    expect(edited.shots.map((shot) => shot.action)).toEqual([
      "Wide of the lighthouse at dusk"
    ]);

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: created.storyboard_id
    })) as { brief: string; style: string; aspect_ratio: string };
    expect(read).toMatchObject({
      brief: "A keeper at dusk",
      style: "moody neon",
      aspect_ratio: "2.39:1"
    });
  });

  it("returns the existing board when create is retried with the same id", async () => {
    const context = ctx();
    const first = (await run(context).invoke("create_storyboard", {
      name: "Poster",
      id: "board-1"
    })) as { storyboard_id: string; name: string };
    const second = (await run(context).invoke("create_storyboard", {
      name: "Other",
      id: "board-1"
    })) as { storyboard_id: string; name: string };
    expect(second.storyboard_id).toBe(first.storyboard_id);
    expect(second.name).toBe("Poster");
  });

  it("refuses an empty name", async () => {
    const result = (await run(ctx()).invoke("create_storyboard", {
      name: "  "
    })) as { error: string };
    expect(result.error).toMatch(/name is required/);
  });

  it("lists and reads a board, and hides another user's", async () => {
    const board = await makeBoard([
      shot({ id: "s1", index: 0, slug: "opening" }),
      shot({
        id: "s2",
        index: 1,
        status: "keyframe_ready",
        keyframe: { type: "image", asset_id: "a1", uri: "asset://a1.png" }
      })
    ]);
    const context = ctx();

    const listed = (await run(context).invoke("list_storyboards", {})) as {
      storyboards: Array<{ id: string; shots: number; with_keyframe: number }>;
    };
    expect(listed.storyboards[0]).toMatchObject({
      id: board.id,
      shots: 2,
      with_keyframe: 1
    });

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: board.id
    })) as { shots: Array<{ id: string }> };
    expect(read.shots.map((s) => s.id)).toEqual(["s1", "s2"]);

    const other = (await run(ctx("other")).invoke("get_storyboard", {
      storyboard_id: board.id
    })) as { error: string };
    expect(other.error).toContain("not found");
  });

  it("renders every shot missing a still, then animates them", async () => {
    const board = await makeBoard([
      shot({ id: "s1", index: 0, camera: { framing: "wide" } }),
      shot({ id: "s2", index: 1 })
    ]);
    const context = ctx();

    const stills = (await run(context).invoke("render_storyboard_stills", {
      storyboard_id: board.id
    })) as { rendered: number; failed: number };
    expect(stills).toMatchObject({ rendered: 2, failed: 0 });

    const clips = (await run(context).invoke("render_storyboard_clips", {
      storyboard_id: board.id
    })) as { rendered: number; failed: number };
    expect(clips).toMatchObject({ rendered: 2, failed: 0 });

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: board.id
    })) as { shots: Array<{ has_clip: boolean; status: string }> };
    expect(read.shots.every((s) => s.has_clip && s.status === "rendered")).toBe(
      true
    );
  });

  it("names find_model when the board has no model and none is passed", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })], {
      imageModel: null
    });
    const result = (await run(ctx()).invoke("render_storyboard_stills", {
      storyboard_id: board.id
    })) as { error: string };
    expect(result.error).toContain("find_model");
  });

  it("refuses to revise a shot with no clip", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const result = (await run(ctx()).invoke("revise_storyboard_clip", {
      storyboard_id: board.id,
      target: "s1",
      instruction: "make it darker"
    })) as { error: string };
    expect(result.error).toContain("Run render_storyboard_clips first");
  });

  describe("clip length on a script-linked board", () => {
    /** A script whose one line has a 3.4 s take, plus 250 ms of silence. */
    const makeScript = async (voiced: boolean): Promise<Script> =>
      Script.create<Script>({
        user_id: "u1",
        project_id: "default",
        name: "Script",
        document: JSON.stringify({
          cast: [{ id: "sp1", name: "Keeper", voice: null }],
          sections: [
            {
              id: "sec1",
              lines: [
                {
                  id: "line-1",
                  speakerId: "sp1",
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
        })
      });

    const linkedBoard = async (
      scriptId: string,
      shotOverrides: Partial<Shot> = {}
    ): Promise<Storyboard> =>
      makeBoard(
        [
          shot({
            id: "s1",
            index: 0,
            duration_seconds: 8,
            script_line_ids: ["line-1"],
            ...shotOverrides
          })
        ],
        { screenplay: { type: "screenplay", id: "sp", script_id: scriptId } }
      );

    /** The `duration_seconds` the image_to_video prediction asked for. */
    const renderedDuration = async (
      board: Storyboard,
      context: ReturnType<typeof ctx>
    ): Promise<unknown> => {
      await run(context).invoke("render_storyboard_stills", {
        storyboard_id: board.id
      });
      await run(context).invoke("render_storyboard_clips", {
        storyboard_id: board.id
      });
      const call = context.runProviderPrediction.mock.calls
        .map((c) => c[0] as { capability: string; params: Record<string, unknown> })
        .find((c) => c.capability === "image_to_video");
      return call?.params["duration_seconds"];
    };

    it("renders a linked shot as long as the takes it covers", async () => {
      const script = await makeScript(true);
      const board = await linkedBoard(script.id);
      // 3400 ms + 250 ms of silence, rounded up to whole seconds.
      expect(await renderedDuration(board, ctx())).toBe(4);
    });

    it("keeps the shot's own length when it is pinned to manual", async () => {
      const script = await makeScript(true);
      const board = await linkedBoard(script.id, { duration_source: "manual" });
      expect(await renderedDuration(board, ctx())).toBe(8);
    });

    it("keeps the shot's own length when the linked line is unvoiced", async () => {
      const script = await makeScript(false);
      const board = await linkedBoard(script.id);
      expect(await renderedDuration(board, ctx())).toBe(8);
    });

    it("leaves an unlinked board's shots alone", async () => {
      const board = await makeBoard([
        shot({ id: "s1", index: 0, duration_seconds: 8 })
      ]);
      expect(await renderedDuration(board, ctx())).toBe(8);
    });
  });

  it("assembles the rendered clips into a timeline", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const context = ctx();

    const empty = (await run(context).invoke("assemble_storyboard_timeline", {
      storyboard_id: board.id
    })) as { error: string };
    expect(empty.error).toContain("render_storyboard_stills");

    await run(context).invoke("render_storyboard_stills", {
      storyboard_id: board.id
    });
    await run(context).invoke("render_storyboard_clips", {
      storyboard_id: board.id
    });
    const assembled = (await run(context).invoke(
      "assemble_storyboard_timeline",
      { storyboard_id: board.id }
    )) as { ok: boolean; clip_count: number; width: number; height: number };
    expect(assembled).toMatchObject({
      ok: true,
      // The shot's clip and the audio twin that carries its sound.
      clip_count: 2,
      width: 1920,
      height: 1080
    });
  });

  it("cuts a linked board against the script's takes", async () => {
    const script = await makeVoicedScript();
    const board = await makeBoard(
      [renderedShot("s1", 0, ["l1"]), renderedShot("s2", 1, ["l2"])],
      { screenplay: { script_id: script.id } }
    );
    const context = ctx();

    const assembled = (await run(context).invoke(
      "assemble_storyboard_timeline",
      { storyboard_id: board.id }
    )) as {
      ok: boolean;
      timeline_id: string;
      script_id: string | null;
      duration_ms: number;
      skipped_line_ids: string[];
    };
    expect(assembled).toMatchObject({
      ok: true,
      script_id: script.id,
      skipped_line_ids: []
    });
    // Shot lengths come from the takes (1200 + 800), not DEFAULT_SHOT_MS.
    expect(assembled.duration_ms).toBe(2000);

    const document = (await sequenceOf(assembled.timeline_id)).toDocument();
    expect(document.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Voiceover"
    ]);
    const voiceover = document.clips.filter((c) => c.scriptLineId);
    expect(voiceover.map((c) => [c.scriptLineId, c.storyboardShotId])).toEqual([
      ["l1", "s1"],
      ["l2", "s2"]
    ]);
    expect(voiceover.every((c) => c.scriptId === script.id)).toBe(true);
  });

  it("leaves an unlinked board on the storyboard-only cut", async () => {
    const board = await makeBoard([renderedShot("s1", 0)], {
      screenplay: { narration: "A quiet town at dusk." }
    });
    const context = ctx();

    const assembled = (await run(context).invoke(
      "assemble_storyboard_timeline",
      { storyboard_id: board.id }
    )) as { timeline_id: string; script_id: string | null };
    expect(assembled.script_id).toBeNull();

    const document = (await sequenceOf(assembled.timeline_id)).toDocument();
    expect(document.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Narration"
    ]);
    expect(
      document.clips.some((c) => c.prompt === "A quiet town at dusk.")
    ).toBe(true);
  });

  it("falls back to the unlinked cut when the linked script is gone", async () => {
    const board = await makeBoard([renderedShot("s1", 0, ["l1"])], {
      screenplay: { script_id: "sc-deleted" }
    });

    const assembled = (await run(ctx()).invoke("assemble_storyboard_timeline", {
      storyboard_id: board.id
    })) as {
      ok: boolean;
      script_id: string | null;
      warnings?: string[];
      timeline_id: string;
    };
    expect(assembled.ok).toBe(true);
    expect(assembled.script_id).toBeNull();
    expect(assembled.warnings?.[0]).toContain("sc-deleted");

    const document = (await sequenceOf(assembled.timeline_id)).toDocument();
    expect(document.tracks.map((t) => t.name)).toEqual(["Shots", "Shot Audio"]);
  });

  it("keeps tracks the board does not own when re-assembling", async () => {
    const script = await makeVoicedScript();
    const board = await makeBoard([renderedShot("s1", 0, ["l1"])], {
      screenplay: { script_id: script.id }
    });
    const context = ctx();

    const first = (await run(context).invoke("assemble_storyboard_timeline", {
      storyboard_id: board.id
    })) as { timeline_id: string };

    // Something else — the editor, another document — adds a track.
    const sequence = await sequenceOf(first.timeline_id);
    const previous = sequence.toDocument();
    const foreignTrack = {
      id: "t-foreign",
      name: "Sound design",
      type: "audio" as const,
      index: 9,
      visible: true,
      locked: false
    };
    sequence.fromDocument({
      ...previous,
      tracks: [...previous.tracks, foreignTrack],
      clips: [
        ...previous.clips,
        {
          ...previous.clips[0],
          id: "c-foreign",
          trackId: "t-foreign",
          name: "Wind",
          scriptId: undefined,
          storyboardBoardId: undefined,
          storyboardShotId: undefined
        }
      ]
    });
    await sequence.save();

    const second = (await run(context).invoke("assemble_storyboard_timeline", {
      storyboard_id: board.id
    })) as { timeline_id: string };
    expect(second.timeline_id).toBe(first.timeline_id);

    const document = (await sequenceOf(first.timeline_id)).toDocument();
    expect(document.tracks.map((t) => t.name)).toContain("Sound design");
    expect(document.clips.filter((c) => c.name === "Wind")).toHaveLength(1);
    // The board's own clips were rewritten, not doubled: one shot clip, its
    // audio twin, and one voiceover clip for the single linked line.
    expect(
      document.clips.filter((c) => c.storyboardShotId === "s1").length
    ).toBe(3);
    expect(document.tracks.map((t) => t.name)).toEqual([
      "Shots",
      "Shot Audio",
      "Voiceover",
      "Sound design"
    ]);
  });

  it("adds and reorders shots, and records an op naming a shot the board lacks", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const context = ctx();

    const result = (await run(context).invoke("edit_storyboard", {
      storyboard_id: board.id,
      ops: [
        { op: "add_shot", action: "Wide of the lighthouse", slug: "wide" },
        { op: "reorder_shot", target: "wide", index: 0 },
        { op: "remove_shot", target: "nope" }
      ]
    })) as {
      applied: number;
      failed: number;
      ops: Array<{ error?: string }>;
      shots: Array<{ slug?: string; index: number }>;
    };
    expect(result).toMatchObject({ applied: 2, failed: 1 });
    expect(result.ops[2].error).toContain('No shot matches "nope"');
    expect(result.shots[0].slug).toBe("wide");
  });

  // A model that renders a fixed 5.184s window covers several 1.5-2.2s beats
  // in one generation. The clip lands on the first shot of the run; before
  // `covered_by` the siblings stayed `has_clip: false` for the rest of the
  // session, so the board read as half unrendered when the cut was locked and
  // the default clip selection offered to generate them again.
  describe("fused shots", () => {
    const fusedBoard = () =>
      makeBoard([
        shot({
          id: "event",
          index: 0,
          status: "rendered",
          duration_seconds: 2.5,
          clip: { type: "video", asset_id: "clip-fused", duration: 5.184 }
        }),
        shot({
          id: "reception",
          index: 1,
          status: "keyframe_ready",
          keyframe: { type: "image", asset_id: "still-reception" }
        })
      ]);

    const cover = async (context: ProcessingContext, boardId: string) =>
      (await run(context).invoke("edit_storyboard", {
        storyboard_id: boardId,
        ops: [
          {
            op: "update_shot",
            target: "reception",
            covered_by: {
              shot_id: "event",
              start_seconds: 2.5,
              end_seconds: 5.184
            }
          }
        ]
      })) as { applied: number; failed: number; ops: Array<{ error?: string }> };

    it("reads a covered shot back as rendered, with its window", async () => {
      const board = await fusedBoard();
      const context = ctx();
      expect(await cover(context, board.id)).toMatchObject({
        applied: 1,
        failed: 0
      });

      const read = (await run(context).invoke("get_storyboard", {
        storyboard_id: board.id
      })) as {
        shots: Array<{
          id: string;
          status: string;
          has_clip: boolean;
          covered_by: { shot_id: string; start_seconds?: number } | null;
        }>;
      };
      expect(read.shots[1]).toMatchObject({
        id: "reception",
        status: "rendered",
        has_clip: true,
        covered_by: {
          shot_id: "event",
          start_seconds: 2.5,
          end_seconds: 5.184
        }
      });
      expect(read.shots[0].covered_by).toBeNull();
    });

    it("does not offer a covered shot up for another render", async () => {
      const board = await fusedBoard();
      const context = ctx();
      await cover(context, board.id);

      // Nothing is selected at all — not "selected and then failed", which is
      // what the old `!s.clip` predicate produced on a shot whose picture had
      // already been generated into its sibling.
      const clips = (await run(context).invoke("render_storyboard_clips", {
        storyboard_id: board.id
      })) as { rendered: number; results: unknown[]; note?: string };
      expect(clips).toMatchObject({ rendered: 0, results: [] });
      expect(clips.note).toContain("No shot is ready for a clip");
    });

    it("assembles the covered shot as a slice of the covering clip", async () => {
      const board = await fusedBoard();
      const context = ctx();
      await cover(context, board.id);

      const assembled = (await run(context).invoke(
        "assemble_storyboard_timeline",
        { storyboard_id: board.id }
      )) as { timeline_id: string };
      const sequence = await sequenceOf(assembled.timeline_id);
      const picture = sequence
        .toDocument()
        .clips.filter((c) => c.mediaType !== "audio");

      expect(picture).toHaveLength(2);
      expect(picture[1]).toMatchObject({
        currentAssetId: "clip-fused",
        startMs: 2500,
        inPointMs: 2500,
        outPointMs: 5184
      });
    });

    it("refuses coverage that names a shot, itself, or another window", async () => {
      const board = await fusedBoard();
      const context = ctx();
      const refused = (await run(context).invoke("edit_storyboard", {
        storyboard_id: board.id,
        ops: [
          { op: "update_shot", target: "reception", covered_by: "ghost" },
          { op: "update_shot", target: "event", covered_by: "event" },
          {
            op: "update_shot",
            target: "reception",
            covered_by: { shot_id: "event", start_seconds: 3, end_seconds: 1 }
          }
        ]
      })) as { failed: number; ops: Array<{ error?: string }> };
      expect(refused.failed).toBe(3);
      expect(refused.ops[0].error).toContain('covered_by names no shot: "ghost"');
      expect(refused.ops[1].error).toContain("cannot cover itself");
      expect(refused.ops[2].error).toContain("must be after start_seconds");
    });

    it("uncovers the dependents when the covering shot is removed", async () => {
      const board = await fusedBoard();
      const context = ctx();
      await cover(context, board.id);

      const removed = (await run(context).invoke("edit_storyboard", {
        storyboard_id: board.id,
        ops: [{ op: "remove_shot", target: "event" }]
      })) as { ops: Array<{ result?: { uncovered?: string[] } }> };
      expect(removed.ops[0].result?.uncovered).toEqual(["reception"]);

      const read = (await run(context).invoke("get_storyboard", {
        storyboard_id: board.id
      })) as {
        shots: Array<{ id: string; status: string; has_clip: boolean }>;
      };
      expect(read.shots).toEqual([
        expect.objectContaining({
          id: "reception",
          status: "keyframe_ready",
          has_clip: false
        })
      ]);
    });
  });
});
