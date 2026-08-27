import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  Storyboard,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import type { Shot } from "@nodetool-ai/protocol";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const MP4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

interface CtxOptions {
  userId?: string;
  prediction?: (req: {
    capability: string;
    params: Record<string, unknown>;
  }) => Promise<Uint8Array> | Uint8Array;
}

/** A context with just what the tools touch: a user, prediction, asset writes. */
function ctx(options: CtxOptions = {}) {
  const created: Array<{ id: string; bytes: Uint8Array }> = [];
  const context = {
    userId: options.userId ?? "u1",
    runProviderPrediction: vi.fn(async (req: never) => {
      const request = req as unknown as {
        capability: string;
        params: Record<string, unknown>;
      };
      const result = options.prediction
        ? await options.prediction(request)
        : request.capability === "text_to_image"
          ? PNG
          : MP4;
      return result;
    }),
    hasModelInterface: (name: string) => name === "createAsset",
    createAsset: vi.fn(
      async (args: { name: string; contentType: string; content: Uint8Array }) => {
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

const shot = (overrides: Partial<Shot> & { id: string; index: number }): Shot => ({
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

describe("storyboard render tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("registers as built-ins with sane permissions", () => {
    const names = BUILTIN_TOOL_NAMES;
    expect(names).toEqual(
      expect.arrayContaining([
        "list_storyboards",
        "create_storyboard",
        "get_storyboard",
        "render_storyboard_stills",
        "render_storyboard_clips",
        "revise_storyboard_clip",
        "assemble_storyboard_timeline"
      ])
    );
    expect(permissionCategoryFor("get_storyboard")).toBe("read");
    expect(permissionCategoryFor("create_storyboard")).toBe("write");
    expect(permissionCategoryFor("render_storyboard_clips")).toBe("write");
  });

  it("lists and reads a board", async () => {
    const board = await makeBoard([
      shot({ id: "s1", index: 0, slug: "opening" }),
      shot({
        id: "s2",
        index: 1,
        status: "keyframe_ready",
        keyframe: { type: "image", asset_id: "a1", uri: "asset://a1.png" }
      })
    ]);

    const listed = (await toolForCapabilityName("list_storyboards").process(ctx(), {})) as {
      storyboards: Array<{ id: string; shots: number; with_keyframe: number }>;
    };
    expect(listed.storyboards[0]).toMatchObject({
      id: board.id,
      shots: 2,
      with_keyframe: 1
    });

    const read = (await toolForCapabilityName("get_storyboard").process(ctx(), {
      storyboard_id: board.id
    })) as { shots: Array<{ id: string; has_keyframe: boolean }> };
    expect(read.shots.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(read.shots[1].has_keyframe).toBe(true);
  });

  it("hides a board owned by another user", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const result = (await toolForCapabilityName("get_storyboard").process(ctx({ userId: "other" }), {
      storyboard_id: board.id
    })) as { error: string };
    expect(result.error).toContain("not found");
  });

  it("renders stills for every shot that lacks one and saves them to the board", async () => {
    const board = await makeBoard([
      shot({ id: "s1", index: 0, camera: { framing: "wide" } }),
      shot({
        id: "s2",
        index: 1,
        status: "keyframe_ready",
        keyframe: { type: "image", asset_id: "a1", uri: "asset://a1.png" }
      }),
      shot({ id: "s3", index: 2 })
    ]);
    const context = ctx();

    const result = (await toolForCapabilityName("render_storyboard_stills").process(context, {
      storyboard_id: board.id
    })) as { rendered: number; failed: number; results: Array<{ shot_id: string }> };

    expect(result.rendered).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results.map((r) => r.shot_id)).toEqual(["s1", "s3"]);

    const prompt = context.runProviderPrediction.mock.calls[0][0] as {
      capability: string;
      model: string;
      params: { prompt: string; aspect_ratio: string };
    };
    expect(prompt.capability).toBe("text_to_image");
    expect(prompt.model).toBe("img-1");
    expect(prompt.params.prompt).toBe("action 0, wide shot, moody neon");
    expect(prompt.params.aspect_ratio).toBe("16:9");

    const saved = (await Storyboard.findById(board.id))!.toDocument();
    expect(saved.shots[0].status).toBe("keyframe_ready");
    expect(saved.shots[0].keyframe?.asset_id).toBeTruthy();
    expect(saved.shots[0].keyframe_versions).toHaveLength(1);
    // The shot that already had a still is untouched.
    expect(saved.shots[1].keyframe?.asset_id).toBe("a1");
  });

  it("reports a failed render per shot and marks the shot failed", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const context = ctx({
      prediction: () => {
        throw new Error("provider exploded");
      }
    });

    const result = (await toolForCapabilityName("render_storyboard_stills").process(context, {
      storyboard_id: board.id
    })) as { rendered: number; failed: number; results: Array<{ error?: string }> };

    expect(result.rendered).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toContain("provider exploded");
    expect((await Storyboard.findById(board.id))!.toDocument().shots[0].status).toBe(
      "failed"
    );
  });

  it("refuses to render without a model and names find_model", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })], {
      imageModel: null
    });
    const result = (await toolForCapabilityName("render_storyboard_stills").process(ctx(), {
      storyboard_id: board.id
    })) as { error: string };
    expect(result.error).toContain("find_model");
  });

  it("animates the shot's still into a clip and seeds the model with it", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0, motion: "slow push in" })]);
    const context = ctx();
    await toolForCapabilityName("render_storyboard_stills").process(context, {
      storyboard_id: board.id
    });

    const result = (await toolForCapabilityName("render_storyboard_clips").process(context, {
      storyboard_id: board.id
    })) as { rendered: number; results: Array<{ asset_id?: string }> };
    expect(result.rendered).toBe(1);

    const call = context.runProviderPrediction.mock.calls.at(-1)![0] as {
      capability: string;
      params: { images: Uint8Array[]; prompt: string };
    };
    expect(call.capability).toBe("image_to_video");
    expect(call.params.images[0]).toEqual(PNG);
    expect(call.params.prompt).toBe("slow push in, action 0");

    const saved = (await Storyboard.findById(board.id))!.toDocument();
    expect(saved.shots[0].status).toBe("rendered");
    expect(saved.shots[0].clip?.asset_id).toBe(result.results[0].asset_id);
  });

  it("says what to do when no shot has a still to animate", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const result = (await toolForCapabilityName("render_storyboard_clips").process(ctx(), {
      storyboard_id: board.id
    })) as { rendered: number; note: string };
    expect(result.rendered).toBe(0);
    expect(result.note).toContain("render_storyboard_stills");
  });

  it("renders a direct-mode shot straight from text, with no still", async () => {
    const board = await makeBoard([
      shot({
        id: "s1",
        index: 0,
        motion: "handheld sprint",
        camera: { framing: "wide" },
        render_mode: "direct"
      })
    ]);
    const context = ctx();

    const stills = (await toolForCapabilityName("render_storyboard_stills").process(context, {
      storyboard_id: board.id
    })) as { rendered: number; note: string };
    expect(stills.rendered).toBe(0);
    expect(stills.note).toContain("directly");

    const result = (await toolForCapabilityName("render_storyboard_clips").process(context, {
      storyboard_id: board.id
    })) as { rendered: number; results: Array<{ render_mode?: string }> };
    expect(result.rendered).toBe(1);
    expect(result.results[0].render_mode).toBe("direct");

    const call = context.runProviderPrediction.mock.calls.at(-1)![0] as {
      capability: string;
      params: { images?: Uint8Array[]; prompt: string };
    };
    expect(call.capability).toBe("text_to_video");
    expect(call.params.images).toBeUndefined();
    // No still carries the look, so framing and board style ride the prompt.
    expect(call.params.prompt).toBe(
      "action 0, wide shot, handheld sprint, moody neon"
    );

    const saved = (await Storyboard.findById(board.id))!.toDocument();
    expect(saved.shots[0].status).toBe("rendered");
    expect(saved.shots[0].keyframe).toBeUndefined();
  });

  it("mode: direct overrides a keyframe shot for one call only", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const context = ctx();

    const result = (await toolForCapabilityName("render_storyboard_clips").process(context, {
      storyboard_id: board.id,
      mode: "direct"
    })) as { rendered: number };
    expect(result.rendered).toBe(1);
    expect(
      (context.runProviderPrediction.mock.calls.at(-1)![0] as { capability: string })
        .capability
    ).toBe("text_to_video");

    // The shot itself is untouched: it still says keyframe.
    const saved = (await Storyboard.findById(board.id))!.toDocument();
    expect(saved.shots[0].render_mode).toBeUndefined();
  });

  it("sets a shot's render_mode through edit_storyboard", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    await toolForCapabilityName("edit_storyboard").process(ctx(), {
      storyboard_id: board.id,
      ops: [{ op: "update_shot", target: "s1", render_mode: "direct" }]
    });
    expect(
      (await Storyboard.findById(board.id))!.toDocument().shots[0].render_mode
    ).toBe("direct");

    const rejected = (await toolForCapabilityName("edit_storyboard").process(ctx(), {
      storyboard_id: board.id,
      ops: [{ op: "update_shot", target: "s1", render_mode: "sideways" }]
    })) as { failed: number; ops: Array<{ error?: string }> };
    expect(rejected.failed).toBe(1);
    expect(rejected.ops[0].error).toContain('"keyframe" or "direct"');
  });

  it("revises a clip in place, keeping the previous take as a version", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const context = ctx();
    await toolForCapabilityName("render_storyboard_stills").process(context, { storyboard_id: board.id });
    await toolForCapabilityName("render_storyboard_clips").process(context, { storyboard_id: board.id });
    const firstTake = (await Storyboard.findById(board.id))!.toDocument().shots[0].clip;

    const result = (await toolForCapabilityName("revise_storyboard_clip").process(context, {
      storyboard_id: board.id,
      target: "0",
      instruction: "make it darker"
    })) as { ok: boolean; asset_id: string };
    expect(result.ok).toBe(true);

    const call = context.runProviderPrediction.mock.calls.at(-1)![0] as {
      capability: string;
      params: { prompt: string };
    };
    expect(call.capability).toBe("video_to_video");
    expect(call.params.prompt).toBe("make it darker");

    const saved = (await Storyboard.findById(board.id))!.toDocument();
    expect(saved.shots[0].clip?.asset_id).toBe(result.asset_id);
    expect(saved.shots[0].clip_versions?.[0].asset_id).toBe(firstTake?.asset_id);
  });

  it("assembles rendered clips into a timeline and links it to the board", async () => {
    const board = await makeBoard(
      [
        shot({
          id: "s1",
          index: 0,
          slug: "opening",
          duration_seconds: 3,
          status: "rendered",
          clip: { type: "video", asset_id: "v1", uri: "asset://v1.mp4" }
        }),
        shot({ id: "s2", index: 1, status: "planned" }),
        shot({
          id: "s3",
          index: 2,
          duration_seconds: 2,
          status: "rendered",
          clip: { type: "video", asset_id: "v3", uri: "asset://v3.mp4" }
        })
      ],
      {
        aspectRatio: "9:16",
        screenplay: {
          type: "screenplay",
          id: "sp1",
          title: "Cut",
          shots: [],
          narration: "a voice in the dark"
        }
      }
    );

    const result = (await toolForCapabilityName("assemble_storyboard_timeline").process(ctx(), {
      storyboard_id: board.id
    })) as {
      timeline_id: string;
      duration_ms: number;
      clip_count: number;
      width: number;
      height: number;
      skipped_shot_ids: string[];
    };

    expect(result.duration_ms).toBe(5000);
    // Two shot clips, their audio twins, plus the narration clip.
    expect(result.clip_count).toBe(5);
    expect(result.skipped_shot_ids).toEqual(["s2"]);
    expect(result).toMatchObject({ width: 1080, height: 1920 });

    const sequence = (await TimelineSequence.findById(result.timeline_id))!;
    const document = sequence.toDocument();
    expect(document.clips[0]).toMatchObject({
      name: "opening",
      startMs: 0,
      durationMs: 3000,
      currentAssetId: "v1",
      storyboardShotId: "s1"
    });
    expect((await Storyboard.findById(board.id))!.timeline_id).toBe(result.timeline_id);

    // Re-assembling updates the same sequence rather than orphaning it.
    const again = (await toolForCapabilityName("assemble_storyboard_timeline").process(ctx(), {
      storyboard_id: board.id
    })) as { timeline_id: string };
    expect(again.timeline_id).toBe(result.timeline_id);
  });

  it("refuses to assemble a board with nothing rendered", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const result = (await toolForCapabilityName("assemble_storyboard_timeline").process(ctx(), {
      storyboard_id: board.id
    })) as { error: string };
    expect(result.error).toContain("render_storyboard_stills");
  });

  it("seasons prompts with the board's entities", async () => {
    const entity = await Asset.create<Asset>({
      user_id: "u1",
      name: "kira.png",
      content_type: "image/png",
      metadata: {
        nodetool_entity: {
          kind: "character",
          name: "Kira",
          descriptor: "a courier with a scarred jaw"
        }
      }
    });
    const board = await makeBoard(
      [
        shot({ id: "s1", index: 0, action: "Kira runs the rooftop" }),
        shot({ id: "s2", index: 1, action: "an empty street" })
      ],
      { entityIds: [entity.id] }
    );
    const context = ctx();

    await toolForCapabilityName("render_storyboard_stills").process(context, {
      storyboard_id: board.id,
      concurrency: 1
    });

    const calls = context.runProviderPrediction.mock.calls.map(
      (c) => c[0] as { params: { entities: Array<{ name: string }> } }
    );
    expect(calls[0].params.entities.map((e) => e.name)).toEqual(["Kira"]);
    // The character is not in shot 2's text, so it does not season that prompt.
    expect(calls[1].params.entities).toEqual([]);
  });
});
