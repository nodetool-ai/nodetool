/**
 * `get_storyboard_one_take` / `update_storyboard_one_take`, and the shot
 * fields (`end_state`, `sound`) `edit_storyboard` writes for a one-take step.
 *
 * Each case asserts the persisted document or the compiled prompt, not only
 * that a call reported success.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  Storyboard,
  initTestDb
} from "@nodetool-ai/models";
import type { StoryboardDocument } from "@nodetool-ai/models";
import {
  shortResourceId,
  type OneTakeDirection,
  type Shot
} from "@nodetool-ai/protocol";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

type OneTakeDoc = StoryboardDocument & { one_take?: OneTakeDirection };

interface OneTakeResult {
  error?: string;
  storyboard_id: string;
  revision: number;
  stored: boolean;
  prompt: string;
  compiled: string;
  full_prompt: string;
  references: Record<string, unknown>[];
  steps: {
    shot_id: string;
    index: number;
    slug?: string;
    start_seconds: number;
    end_seconds: number;
    end_state: string | null;
    sound: string | null;
  }[];
  duration_seconds: number;
  settings: {
    duration_seconds: number | null;
    aspect_ratio: string | null;
    resolution: string | null;
    model: Record<string, unknown> | null;
  };
  effective: {
    duration_seconds: number;
    shot_total_seconds: number;
    aspect_ratio: string | null;
    resolution: string | null;
    model: Record<string, unknown> | null;
  };
  warnings: string[];
}

const NO_MODEL = "No video model is chosen: set `model` here or the board's video model.";

const context = { userId: "u1" } as unknown as ProcessingContext;
const run = () => createCapabilityRun({ context, gate: UNGATED });

const call = async (
  name: string,
  params: Record<string, unknown>
): Promise<OneTakeResult> =>
  (await run().invoke(name, params)) as OneTakeResult;

const shot = (overrides: Partial<Shot> & { id: string; index: number }): Shot => ({
  type: "shot",
  action: `beat ${overrides.index}`,
  status: "planned",
  duration_seconds: 5,
  ...overrides
});

async function makeBoard(shots: Shot[], extra: Partial<OneTakeDoc> = {}) {
  return Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Board",
    document: JSON.stringify({
      screenplay: null,
      brief: "",
      style: "",
      entityIds: [],
      aspectRatio: "9:16",
      setupStage: "done",
      genre: "",
      directorModel: null,
      imageModel: null,
      videoModel: null,
      ...extra,
      shots
    })
  });
}

const makeEntity = (name: string) =>
  Asset.create<Asset>({
    user_id: "u1",
    name,
    content_type: "image/png",
    metadata: {
      nodetool_entity: { kind: "character", name, descriptor: `${name} descriptor` }
    }
  });

const reread = async (id: string): Promise<OneTakeDoc> => {
  const row = await Storyboard.findById(id);
  if (!row) throw new Error(`no board ${id}`);
  return row.toDocument() as OneTakeDoc;
};

const still = (assetId: string) => ({
  type: "image" as const,
  asset_id: assetId,
  uri: `asset://${assetId}.png`
});

beforeEach(() => initTestDb());
afterEach(() => ModelObserver.clear());

describe("get_storyboard_one_take", () => {
  it("compiles a board without a direction, by short id", async () => {
    const board = await makeBoard([
      shot({ id: "s1", index: 0, motion: "Push in", keyframe: still("k1") }),
      shot({ id: "s2", index: 1, duration_seconds: 3, keyframe: still("k2") })
    ]);

    const result = await call("get_storyboard_one_take", {
      storyboard_id: shortResourceId(board.id)
    });

    expect(result.error).toBeUndefined();
    expect(result.storyboard_id).toBe(board.id);
    expect(result.stored).toBe(false);
    expect(result.prompt).toBe("");
    expect(result.references).toEqual([
      {
        image_number: 1,
        marker: "[Image 1]",
        shot_id: "s1",
        asset_id: "k1",
        label: "the still of shot 1 at 0-5s"
      },
      {
        image_number: 2,
        marker: "[Image 2]",
        shot_id: "s2",
        asset_id: "k2",
        label: "the still of shot 2 at 5-8s"
      }
    ]);
    expect(result.duration_seconds).toBe(8);
    expect(
      result.steps.map((s) => [s.shot_id, s.index, s.start_seconds, s.end_seconds])
    ).toEqual([
      ["s1", 0, 0, 5],
      ["s2", 1, 5, 8]
    ]);
    expect(result.compiled).toBe(
      "REFS: [Image 1] is the still of shot 1 at 0-5s. [Image 2] is the still of shot 2 at 5-8s.\n\n" +
        "STEP_01: 0-5s. beat 0. Push in.\nSTEP_02: 5-8s. beat 1."
    );
    expect(result.full_prompt).toBe(result.compiled);
    expect(result.settings).toEqual({
      duration_seconds: null,
      aspect_ratio: null,
      resolution: null,
      model: null
    });
    expect(result.effective).toEqual({
      duration_seconds: 8,
      shot_total_seconds: 8,
      aspect_ratio: "9:16",
      resolution: null,
      model: null
    });
    expect(result.warnings).toEqual([NO_MODEL]);
  });

  it("refuses a board the caller does not own", async () => {
    const board = await Storyboard.create<Storyboard>({
      user_id: "someone-else",
      project_id: "default",
      name: "Theirs"
    });
    const result = await call("get_storyboard_one_take", { storyboard_id: board.id });
    expect(result.error).toContain("was not found");
  });

  it("warns past 30 seconds, past 9 images, and on shots without a still", async () => {
    const shots = [
      ...Array.from({ length: 10 }, (_, index) =>
        shot({ id: `s${index}`, index, keyframe: still(`k${index}`) })
      ),
      shot({ id: "bare", index: 10, slug: "the end" })
    ];
    const entity = await makeEntity("A");
    const board = await makeBoard(shots, { entityIds: [entity.id] });

    const result = await call("get_storyboard_one_take", { storyboard_id: board.id });

    expect(result.duration_seconds).toBe(55);
    // Only the stills go in: the board's entity sends no image.
    expect(result.references.map((r) => r["asset_id"])).toEqual(
      Array.from({ length: 10 }, (_, index) => `k${index}`)
    );
    expect(result.warnings).toEqual([
      NO_MODEL,
      "The take runs 55s, over the 30s one-take limit.",
      "10 reference images; one-take models accept at most 9.",
      "Shots without a still send no image: the end."
    ]);
  });
});

describe("update_storyboard_one_take", () => {
  it("stores the prompt and shot end/sound, and compiles the full prompt", async () => {
    const hero = await makeEntity("Hero");
    const board = await makeBoard(
      [
        shot({ id: "s1", index: 0, slug: "opening", keyframe: still("still-1") }),
        shot({ id: "s2", index: 1 })
      ],
      { entityIds: [hero.id] }
    );
    const writes: unknown[] = [];
    ModelObserver.subscribe((_instance, _event, meta) => {
      writes.push(meta?.ops);
    });

    const result = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      expected_revision: board.revision,
      prompt: "Brand: Acme. [Image 1] stays on screen.",
      shots: [
        { shot_id: "s1", end_state: "The fox looks up", sound: "wind" },
        { shot_id: "1", sound: "a bark" }
      ]
    });

    expect(result.error).toBeUndefined();
    expect(result.stored).toBe(true);
    expect(result.prompt).toBe("Brand: Acme. [Image 1] stays on screen.");
    expect(result.full_prompt).toBe(
      [
        "Brand: Acme. [Image 1] stays on screen.",
        "REFS: [Image 1] is the still of opening at 0-5s.",
        "STEP_01: 0-5s. beat 0. End: The fox looks up.\nSTEP_02: 5-10s. beat 1.",
        "AUDIO: <wind> at 0-5s · <a bark> at 5-10s"
      ].join("\n\n")
    );
    expect(result.references.map((r) => [r["marker"], r["asset_id"]])).toEqual([
      ["[Image 1]", "still-1"]
    ]);
    expect(result.steps.map((s) => [s.end_state, s.sound])).toEqual([
      ["The fox looks up", "wind"],
      [null, "a bark"]
    ]);
    expect(result.warnings).toEqual([NO_MODEL, "Shots without a still send no image: s2."]);

    const doc = await reread(board.id);
    expect(doc.one_take).toEqual({ prompt: "Brand: Acme. [Image 1] stays on screen." });
    expect(doc.shots.map((s) => [s.end_state, s.sound])).toEqual([
      ["The fox looks up", "wind"],
      [undefined, "a bark"]
    ]);
    expect(writes).toEqual([
      [
        { tool: "set_board", input: { one_take: doc.one_take } },
        { tool: "update_shot", input: { id: "s1", target: "s1" } },
        { tool: "update_shot", input: { id: "s2", target: "s2" } }
      ]
    ]);
  });

  it("keeps the stored prompt when only shots change, and clears a shot field", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0, sound: "rain" })], {
      one_take: { prompt: "No cuts." }
    });

    const result = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      shots: [{ shot_id: "s1", sound: null }]
    });

    expect(result.prompt).toBe("No cuts.");
    const doc = await reread(board.id);
    expect(doc.one_take).toEqual({ prompt: "No cuts." });
    expect(doc.shots[0]?.sound).toBeUndefined();
  });

  it.each([
    ["an unknown shot", { shots: [{ shot_id: "nope", sound: "x" }] }, 'No shot matches "nope"'],
    ["a non-string prompt", { prompt: 42 }, "prompt"],
    ["a zero duration", { duration_seconds: 0 }, "duration_seconds"],
    ["a string duration", { duration_seconds: "10" }, "duration_seconds"],
    ["a non-string aspect ratio", { aspect_ratio: 16 }, "aspect_ratio"],
    ["a non-string resolution", { resolution: 1080 }, "resolution"],
    ["a model without an id", { model: { provider: "fal" } }, "model.id"],
    ["a model as a string", { model: "kling" }, "model"],
    ["an empty call", {}, "Pass prompt, duration_seconds"]
  ])("refuses %s and saves nothing", async (_name, input, message) => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const before = board.revision;

    const result = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      ...input
    });

    expect(result.error).toContain(message);
    const row = await Storyboard.findById(board.id);
    if (!row) throw new Error("board vanished");
    expect(row.revision).toBe(before);
    expect((row.toDocument() as OneTakeDoc).one_take).toBeUndefined();
  });

  it("merges settings without dropping the prompt, and clears one with null", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })], {
      one_take: { prompt: "No cuts." }
    });

    const first = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      duration_seconds: 12,
      aspect_ratio: "16:9",
      resolution: "720p",
      model: { provider: "fal", id: "kling-video", name: "Kling" }
    });
    expect(first.error).toBeUndefined();
    expect(first.prompt).toBe("No cuts.");
    expect(first.settings).toEqual({
      duration_seconds: 12,
      aspect_ratio: "16:9",
      resolution: "720p",
      model: { provider: "fal", id: "kling-video", name: "Kling" }
    });
    expect(first.effective).toMatchObject({
      aspect_ratio: "16:9",
      resolution: "720p",
      model: { provider: "fal", id: "kling-video", name: "Kling" }
    });
    expect(first.warnings).not.toContain(NO_MODEL);

    const second = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      resolution: null,
      prompt: "One take."
    });
    expect(second.error).toBeUndefined();

    const doc = await reread(board.id);
    expect(doc.one_take).toEqual({
      prompt: "One take.",
      duration_seconds: 12,
      aspect_ratio: "16:9",
      model: { provider: "fal", id: "kling-video", name: "Kling" }
    });
    expect(second.settings.resolution).toBeNull();
    expect(second.effective.resolution).toBeNull();
    expect(second.settings.duration_seconds).toBe(12);
  });

  it("stores settings on a board without a direction, with an empty prompt", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const result = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      aspect_ratio: "1:1"
    });
    expect(result.error).toBeUndefined();
    expect((await reread(board.id)).one_take).toEqual({ prompt: "", aspect_ratio: "1:1" });
  });

  it("falls back to the board after clearing, and scales the steps to the duration", async () => {
    const board = await makeBoard(
      [
        shot({ id: "s1", index: 0, keyframe: still("k1") }),
        shot({ id: "s2", index: 1, duration_seconds: 3, keyframe: still("k2") })
      ],
      {
        aspectRatio: "4:5",
        videoModel: { type: "video_model", provider: "kie", id: "seedance", name: "Seedance" },
        one_take: {
          prompt: "",
          aspect_ratio: "16:9",
          model: { provider: "fal", id: "kling-video" }
        }
      }
    );

    const result = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      duration_seconds: 16,
      aspect_ratio: null,
      model: null
    });

    expect(result.error).toBeUndefined();
    expect(result.settings).toEqual({
      duration_seconds: 16,
      aspect_ratio: null,
      resolution: null,
      model: null
    });
    expect(result.effective).toEqual({
      duration_seconds: 16,
      shot_total_seconds: 8,
      aspect_ratio: "4:5",
      resolution: null,
      model: { provider: "kie", id: "seedance", name: "Seedance" }
    });
    expect(result.duration_seconds).toBe(16);
    expect(result.steps.map((s) => [s.start_seconds, s.end_seconds])).toEqual([
      [0, 10],
      [10, 16]
    ]);
    expect(result.warnings).toEqual([]);
    expect((await reread(board.id)).one_take).toEqual({ prompt: "", duration_seconds: 16 });
  });

  it("warns on the effective duration, not the shot total", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0, keyframe: still("k1") })], {
      one_take: { prompt: "", duration_seconds: 40, model: { provider: "fal", id: "m" } }
    });
    const result = await call("get_storyboard_one_take", { storyboard_id: board.id });
    expect(result.effective.shot_total_seconds).toBe(5);
    expect(result.warnings).toEqual(["The take runs 40s, over the 30s one-take limit."]);
  });

  it("refuses a stale expected_revision", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const result = await call("update_storyboard_one_take", {
      storyboard_id: board.id,
      expected_revision: board.revision + 1,
      prompt: "x"
    });
    expect(result.error).toContain("revision conflict");
    expect((await reread(board.id)).one_take).toBeUndefined();
  });
});

describe("edit_storyboard shot fields", () => {
  it("sets and clears end_state and sound, and get_storyboard reports them", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const edit = (ops: Record<string, unknown>[]) =>
      run().invoke("edit_storyboard", { storyboard_id: board.id, ops });

    await edit([{ op: "update_shot", target: "s1", end_state: "Door shuts", sound: "a creak" }]);
    const read = (await run().invoke("get_storyboard", {
      storyboard_id: board.id
    })) as { shots: { end_state?: string; sound?: string }[] };
    expect(read.shots[0]).toMatchObject({ end_state: "Door shuts", sound: "a creak" });

    await edit([{ op: "update_shot", target: "s1", end_state: "" }]);
    const doc = await reread(board.id);
    expect(doc.shots[0]?.end_state).toBeUndefined();
    expect(doc.shots[0]?.sound).toBe("a creak");
  });
});
