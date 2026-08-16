/**
 * The `storyboards` capability module.
 *
 * A well-formed, correctly classified module; specs byte-identical to the
 * wire surface they replaced; and implementations that still render, revise, assemble,
 * and direct. `tests/storyboard-render-tools.test.ts` and
 * `tests/document-edit-tools.test.ts` run unmodified against those classes and
 * remain the deep behavioural net.
 */

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
import { capabilityModuleIssues } from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
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
  return context as unknown as ProcessingContext & {
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
      "get_storyboard",
      "render_storyboard_stills",
      "render_storyboard_clips",
      "revise_storyboard_clip",
      "assemble_storyboard_timeline",
      "edit_storyboard",
      "extract_script_from_storyboard"
    ]);
  });

  it("classifies every export the way the gate's map does", () => {
    for (const entry of storyboards.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        permissionCategoryFor(entry.spec.name)
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
      clip_count: 1,
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
    expect(document.tracks.map((t) => t.name)).toEqual(["Shots", "Voiceover"]);
    const voiceover = document.clips.filter((c) => c.mediaType === "audio");
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
    expect(document.tracks.map((t) => t.name)).toEqual(["Shots", "Narration"]);
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
    expect(document.tracks.map((t) => t.name)).toEqual(["Shots"]);
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
    // The board's own clips were rewritten, not doubled: one shot clip and
    // one voiceover clip for the single linked line.
    expect(
      document.clips.filter((c) => c.storyboardShotId === "s1").length
    ).toBe(2);
    expect(document.tracks.map((t) => t.name)).toEqual([
      "Shots",
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
});
