/**
 * `renderTimelineComposited` over a variable-frame-rate clip.
 *
 * `timeline-vfr-decode.test.ts` holds the forward stream to the per-frame
 * seek. This one checks the compositor picks it: a plain clip opens one
 * forward decode for the whole render, and only a remapped clip still
 * addresses its source by time. The decoders are the real ones, wrapped to
 * count how they were opened.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { generateMedia } from "@nodetool-ai/runtime/media/testing";
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";

const opened = { forward: 0, sourceTime: 0 };

vi.mock("../src/nodes/timeline/rawFrames.js", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("../src/nodes/timeline/rawFrames.js");
  return {
    ...original,
    openForwardSourceFrameStream: (...args: Parameters<typeof original.openForwardSourceFrameStream>) => {
      opened.forward++;
      return original.openForwardSourceFrameStream(...args);
    },
    openSourceFrameStream: (...args: Parameters<typeof original.openSourceFrameStream>) => {
      opened.sourceTime++;
      return original.openSourceFrameStream(...args);
    }
  };
});

const { renderTimelineComposited } = await import("../src/nodes/timeline/compositeRender.js");

const noAdapterReason = await (async (): Promise<string | null> => {
  try {
    const { getNodeGPUDevice } = await import("@nodetool-ai/gpu/node");
    await getNodeGPUDevice();
    return null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`timeline-vfr-render: skipping — no WebGPU device. ${reason}\n`);
    return reason;
  }
})();

const FPS = 30;
const DURATION_MS = 3000;
let directory = "";
let vfrPath = "";

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-vfr-render-"));
  vfrPath = path.join(directory, "vfr.mp4");
  // 60/1 nominal, about 24 fps on average: the generated-clip profile.
  await generateMedia({
    outPath: vfrPath,
    video: {
      source: `testsrc2=size=320x180:rate=60:duration=${DURATION_MS / 1000 + 1}`,
      filter: "select='lt(mod(n\\,5)\\,2)'",
      options: { preset: "ultrafast" }
    }
  });
});

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

function sequence(clip: Partial<TimelineClip>): TimelineSequence {
  return {
    id: "seq-vfr",
    name: "VFR",
    width: 320,
    height: 180,
    fps: FPS,
    durationMs: DURATION_MS,
    tracks: [{ id: "t-video", type: "video", index: 0, visible: true }],
    clips: [
      {
        id: "clip-vfr",
        trackId: "t-video",
        name: "Generated",
        startMs: 0,
        durationMs: DURATION_MS,
        mediaType: "video",
        sourceType: "generated",
        status: "generated",
        currentAssetId: "vfr",
        ...clip
      } as TimelineClip
    ]
  } as TimelineSequence;
}

async function render(seq: TimelineSequence): Promise<number> {
  const started = performance.now();
  await renderTimelineComposited({
    sequence: seq,
    width: 320,
    height: 180,
    fps: FPS,
    durationMs: DURATION_MS,
    resolveAssetPath: async (id) => (id === "vfr" ? vfrPath : null),
    outPath: path.join(directory, `out-${Date.now()}.mp4`)
  });
  return performance.now() - started;
}

describe.runIf(!noAdapterReason)("renderTimelineComposited with a VFR clip", () => {
  it("decodes a plain clip with one forward stream", async () => {
    opened.forward = 0;
    opened.sourceTime = 0;
    const ms = await render(sequence({}));
    process.stderr.write(`vfr render, ${(DURATION_MS / 1000) * FPS} frames: ${ms.toFixed(0)} ms\n`);
    expect(opened).toEqual({ forward: 1, sourceTime: 0 });
  }, 120_000);

  it("keeps the source-time decode for a time remap", async () => {
    opened.forward = 0;
    opened.sourceTime = 0;
    await render(
      sequence({
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 2000 },
            { t: 1, sourceMs: 0 }
          ]
        }
      } as Partial<TimelineClip>)
    );
    expect(opened).toEqual({ forward: 0, sourceTime: 1 });
  }, 120_000);
});
