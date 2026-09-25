import { afterEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeClip, makeTrack, type TimelineSequence } from "@nodetool-ai/timeline";
import { trackZ, type FrameSample } from "@nodetool-ai/timeline/render";

const rendered: FrameSample[][] = [];
const paths: string[] = [];

vi.mock("@nodetool-ai/gpu/node", () => ({
  getNodeGPUDevice: async () => ({})
}));

vi.mock("@nodetool-ai/timeline/render", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/timeline/render")>();
  class FakeCompositor {
    constructor(_device: unknown, private width: number, private height: number) {}
    async renderFrameSamples(samples: FrameSample[]): Promise<Uint8Array> {
      rendered.push(samples);
      return new Uint8Array(this.width * this.height * 4);
    }
    dispose(): void {}
  }
  return { ...original, HeadlessFrameCompositor: FakeCompositor };
});

const { renderTimelineComposited } = await import("../src/nodes/timeline/compositeRender.js");
const { resolveTimelineOutput } = await import("../src/nodes/timeline/outputFormats.js");

const width = 32;
const height = 16;
const grade = { id: "grey", type: "color" as const, enabled: true, saturation: 0 };

function sequence(): TimelineSequence {
  return {
    id: "adjustment-export",
    name: "Adjustment export",
    width,
    height,
    fps: 25,
    durationMs: 80,
    tracks: [
      makeTrack({ id: "top", type: "video", index: 0, visible: true }),
      makeTrack({ id: "middle", type: "video", index: 1, visible: true }),
      makeTrack({ id: "bottom", type: "video", index: 2, visible: true })
    ],
    clips: [
      makeClip({ id: "root-picture", trackId: "bottom", mediaType: "text", startMs: 0, durationMs: 1000, textStyle: { text: "root", fontSize: 12, color: "#ffffff" } }),
      makeClip({ id: "root-adjustment", trackId: "middle", mediaType: "adjustment", startMs: 0, durationMs: 1000, opacity: 0.6, effects: [grade], mask: { kind: "rect", radiusPx: 4 }, animations: [{ id: "wipe", role: "in", preset: "wipe", durationMs: 1000, easing: "linear", params: { direction: "down", softness: 0.2 } }] }),
      makeClip({ id: "group", trackId: "top", mediaType: "group", startMs: 0, durationMs: 1000 }),
      makeClip({ id: "child-picture", trackId: "bottom", parentId: "group", mediaType: "text", startMs: 0, durationMs: 1000, textStyle: { text: "child", fontSize: 12, color: "#ffffff" } }),
      makeClip({ id: "child-adjustment", trackId: "middle", parentId: "group", mediaType: "adjustment", startMs: 0, durationMs: 1000, effects: [grade] })
    ],
    transcript: []
  };
}

async function exportFrames(doc: TimelineSequence, blur = false): Promise<void> {
  const outPath = join(tmpdir(), `adjustment-export-${crypto.randomUUID()}.zip`);
  paths.push(outPath);
  await renderTimelineComposited({
    sequence: doc,
    width,
    height,
    fps: 25,
    durationMs: doc.durationMs,
    resolveAssetPath: async () => null,
    outPath,
    output: resolveTimelineOutput({ format: "png_sequence", motionBlurSamples: blur ? 8 : 1, shutterAngle: 180 })
  });
}

afterEach(async () => {
  rendered.length = 0;
  await Promise.all(paths.splice(0).map((path) => rm(path, { force: true })));
});

describe("server export adjustments", () => {
  it("passes root and nested adjustment treatments to the compositor", async () => {
    await exportFrames(sequence());
    const sample = rendered[0]?.[0];
    expect(sample?.precomposites?.map((group) => group.id)).toEqual(["group"]);
    expect(sample?.adjustments).toHaveLength(2);
    expect(sample?.adjustments).toContainEqual(expect.objectContaining({
      id: "root-adjustment",
      zIndex: trackZ(1),
      opacity: 0.6,
      effects: [grade],
      precomposeGroupId: undefined
    }));
    expect(sample?.adjustments).toContainEqual(expect.objectContaining({
      id: "child-adjustment",
      zIndex: trackZ(1),
      opacity: 1,
      effects: [grade],
      precomposeGroupId: "group"
    }));
    const root = sample?.adjustments?.find((adjustment) => adjustment.id === "root-adjustment");
    expect(root?.shapeMask?.width).toBe(width);
    expect(root?.shapeMask?.height).toBe(height);
    expect(root?.shapeMask?.rgba.length).toBe(width * height * 4);
    expect(root?.wipe).toEqual({ direction: "down", progress: 0, softness: 0.2 });
  });

  it("samples animated adjustment effects throughout the shutter window", async () => {
    const doc = sequence();
    doc.clips = doc.clips.filter((clip) => clip.id !== "root-adjustment" && clip.id !== "child-adjustment");
    doc.clips.push(makeClip({
      id: "animated-adjustment",
      trackId: "middle",
      mediaType: "adjustment",
      startMs: 0,
      durationMs: 1000,
      animations: [{ id: "fade", role: "in", preset: "colorFade", durationMs: 1000, easing: "linear" }]
    }));
    await exportFrames(doc, true);
    const samples = rendered[1];
    expect(samples).toHaveLength(8);
    expect(samples.every((sample) => sample.adjustments?.[0]?.id === "animated-adjustment")).toBe(true);
    const saturations = samples.map((sample) => sample.adjustments?.[0]?.effects?.find((effect) => effect.type === "color")?.saturation);
    expect(new Set(saturations).size).toBeGreaterThan(1);
  });
});
