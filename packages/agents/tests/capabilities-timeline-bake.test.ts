/**
 * `bake_model3d_clip` through the `edit_timeline` capability (design §D6).
 *
 * Blender and ffmpeg are both mocked: what is under test is the request the
 * capability builds — one model time and one camera per output frame, at the
 * sequence's own fps and size — and what it writes back on the clip, not what
 * a renderer draws for it. The transparent refusal is checked here too,
 * because until T13 it is the op's contract.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runHostBinary } = vi.hoisted(() => ({
  // ffmpeg is a host binary the mux shells out to; the fake writes the file
  // the real one would, so the bake still ends in bytes.
  runHostBinary: vi.fn(
    async (_cmd: string, args: string[], opts: { cwd: string }) => {
      writeFileSync(join(opts.cwd, args[args.length - 1]!), FAKE_MP4);
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  )
}));

vi.mock("@nodetool-ai/runtime", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@nodetool-ai/runtime")>();
  return { ...actual, runHostBinary };
});

import { ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  computeModel3DBakeHash,
  DEFAULT_MODEL3D_STYLE,
  type TimelineClip
} from "@nodetool-ai/timeline";
import {
  MIME_FOR_FORMAT,
  serializeModel3D,
  type GltfJson
} from "@nodetool-ai/model3d";
import {
  __setBlenderRunnerForTesting,
  type BlenderJob,
  type BlenderRunResult
} from "@nodetool-ai/blender-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import { withGenerationSeam } from "./_helpers/generation-seam.js";

/** Enough of an MP4 to tell "the bake was stored" from "nothing was". */
const FAKE_MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

const USER = "u-bake";
const FPS = 30;

/** A one-second animation, which is all the sampler wraps against. */
function animatedGlb(): Uint8Array {
  const json: GltfJson = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    accessors: [
      { componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] }
    ],
    animations: [
      {
        name: "Spin",
        samplers: [{ input: 0, output: 0, interpolation: "LINEAR" }],
        channels: []
      }
    ]
  };
  return serializeModel3D({ json, bin: null, format: "glb" });
}

interface BakeHarness {
  context: ProcessingContext;
  bytesOf: (assetId: string) => Uint8Array | undefined;
  scratch: string;
  cleanup: () => void;
}

function harness(): BakeHarness {
  const store = new Map<string, Uint8Array>();
  const glbId = "asset-glb";
  store.set(glbId, animatedGlb());
  const scratch = mkdtempSync(join(tmpdir(), "nodetool-bake-test-"));
  let created = 0;
  const context = withGenerationSeam({
    userId: USER,
    getSetting: async () => null,
    workspace: { scratchDir: async () => scratch },
    hasModelInterface: () => true,
    resolveAssetBytes: async (uri: string) => ({
      bytes: store.get(uri.replace("asset://", "").replace(/\.[a-z0-9]+$/i, ""))
    }),
    createAsset: async (args: { content: Uint8Array }) => {
      const id = `asset-out-${++created}`;
      store.set(id, args.content);
      return { id };
    }
  }) as unknown as ProcessingContext;
  return {
    context,
    bytesOf: (id) => store.get(id),
    scratch,
    cleanup: () => rmSync(scratch, { recursive: true, force: true })
  };
}

/** A Blender that answers one PNG per declared frame output. */
function fakeBlender(calls: BlenderJob[]) {
  return {
    kind: "local" as const,
    run: async (job: BlenderJob): Promise<BlenderRunResult> => {
      calls.push(job);
      const outputs: Record<string, Uint8Array> = {};
      for (const name of Object.keys(job.outputs)) outputs[name] = FAKE_PNG;
      return {
        outputs,
        stats: { blender_version: "5.2.0-test", render_seconds: 2 }
      };
    }
  };
}

describe("bake_model3d_clip through edit_timeline", () => {
  let bench: BakeHarness | null = null;

  beforeEach(() => {
    initTestDb();
    bench = harness();
  });

  afterEach(() => {
    __setBlenderRunnerForTesting(null);
    ModelObserver.clear();
    bench?.cleanup();
    bench = null;
  });

  const run = () =>
    createCapabilityRun({ context: bench!.context, gate: UNGATED });

  /** A timeline holding one opaque 3D clip, and that clip's id. */
  async function timelineWithClip(
    style: Record<string, unknown> = {}
  ): Promise<{ timelineId: string; clipId: string }> {
    const created = (await run().invoke("create_timeline", {
      name: "Turntable",
      fps: FPS,
      width: 640,
      height: 360
    })) as { timeline_id: string };
    const added = (await run().invoke("edit_timeline", {
      timeline_id: created.timeline_id,
      ops: [
        {
          op: "add_model3d_clip",
          assetId: "asset-glb",
          durationMs: 200,
          style: {
            background: { transparent: false, color: "#101010" },
            ...style
          }
        }
      ]
    })) as { failed: number; ops: Array<{ result?: { clip?: { id: string } } }> };
    expect(added.failed).toBe(0);
    return {
      timelineId: created.timeline_id,
      clipId: added.ops[0]!.result!.clip!.id
    };
  }

  const clipOf = async (timelineId: string): Promise<TimelineClip> => {
    const read = (await run().invoke("get_timeline", {
      timeline_id: timelineId
    })) as { timeline: { clips: TimelineClip[] } };
    return read.timeline.clips[0]!;
  };

  it("renders the clip's samples and stores the bake on it", async () => {
    const jobs: BlenderJob[] = [];
    __setBlenderRunnerForTesting(fakeBlender(jobs));
    const { timelineId, clipId } = await timelineWithClip();

    const baked = (await run().invoke("edit_timeline", {
      timeline_id: timelineId,
      ops: [{ op: "bake_model3d_clip", target: clipId }]
    })) as {
      failed: number;
      ops: Array<{ ok: boolean; result?: { bakeStarted?: boolean } }>;
    };
    expect(baked.failed).toBe(0);
    expect(baked.ops[0]!.result?.bakeStarted).toBe(true);

    // 200 ms at 30 fps is six output frames, each with its own camera, and
    // the whole job carries the sequence's own size.
    expect(jobs).toHaveLength(1);
    const params = jobs[0]!.job.params as Record<string, unknown>;
    expect(params["frame_times"]).toHaveLength(6);
    expect(params["cameras"]).toHaveLength(6);
    expect(params["width"]).toBe(640);
    expect(params["height"]).toBe(360);
    expect(params["fps"]).toBe(FPS);
    // No animation is named, so every one plays (the D2 default).
    expect(params["animation_name"]).toBeUndefined();
    expect(params["transparent"]).toBe(false);
    expect(params["background_color"]).toBe("#101010");
    expect(Object.keys(jobs[0]!.outputs)).toHaveLength(6);

    // ffmpeg muxed the sequence, and the bytes reached an asset.
    expect(runHostBinary).toHaveBeenCalledTimes(1);
    expect(runHostBinary.mock.calls[0]![0]).toBe("ffmpeg");

    const clip = await clipOf(timelineId);
    const bake = clip.model3dStyle?.bake;
    expect(bake?.assetId).toBeDefined();
    expect(bench!.bytesOf(bake!.assetId)).toEqual(FAKE_MP4);
    expect(bake?.dependencyHash).toBe(
      computeModel3DBakeHash(clip, { fps: FPS, width: 640, height: 360 })
    );
    // The bake joins the clip's version history, naming what it rendered.
    expect(clip.versions).toHaveLength(1);
    expect(clip.versions![0]).toMatchObject({
      assetId: bake!.assetId,
      dependencyHash: bake!.dependencyHash
    });
  });

  it("names the animation the style selected", async () => {
    const jobs: BlenderJob[] = [];
    __setBlenderRunnerForTesting(fakeBlender(jobs));
    const { timelineId, clipId } = await timelineWithClip({
      animation: { ...DEFAULT_MODEL3D_STYLE.animation, clipName: "Spin" }
    });
    await run().invoke("edit_timeline", {
      timeline_id: timelineId,
      ops: [{ op: "bake_model3d_clip", target: clipId }]
    });
    expect(
      (jobs[0]!.job.params as Record<string, unknown>)["animation_name"]
    ).toBe("Spin");
  });

  it("refuses a transparent style and names why", async () => {
    const jobs: BlenderJob[] = [];
    __setBlenderRunnerForTesting(fakeBlender(jobs));
    const { timelineId, clipId } = await timelineWithClip({
      background: { transparent: true }
    });

    const refused = (await run().invoke("edit_timeline", {
      timeline_id: timelineId,
      ops: [{ op: "bake_model3d_clip", target: clipId }]
    })) as { failed: number; ops: Array<{ ok: boolean; error?: string }> };
    expect(refused.failed).toBe(1);
    expect(refused.ops[0]!.error).toMatch(/WebM VP9/);
    expect(jobs).toHaveLength(0);

    const clip = await clipOf(timelineId);
    expect(clip.model3dStyle?.bake).toBeUndefined();
  });
});
