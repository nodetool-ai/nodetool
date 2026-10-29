import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  generateMedia,
  inspectMedia,
  meanRgba,
  readPcm,
  readRgbaFrames,
  rmsBetween
} from "@nodetool-ai/runtime/media/testing";
import { afterEach, describe, expect, it } from "vitest";
import {
  easeCurveEasing,
  easeCurveFilterGraph,
  easeCurveSegments
} from "../src/nodes/easeCurve.js";
import { EaseCurveVideoNode } from "../src/nodes/video.js";

const BEZIER = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };

describe("easeCurveEasing", () => {
  it("passes a preset through as the timeline easing id", () => {
    expect(easeCurveEasing("easeIn", BEZIER)).toBe("easeIn");
  });

  it("clamps custom control points so the curve stays monotonic", () => {
    expect(easeCurveEasing("custom", { x1: -1, y1: 1.6, x2: 2, y2: -0.5 })).toBe(
      "cubic-bezier(0,1,1,0)"
    );
  });

  it("refuses an unknown preset, including an overshooting one", () => {
    expect(() => easeCurveEasing("easeOutBack", BEZIER)).toThrow(/Unknown easing/);
  });
});

describe("easeCurveSegments", () => {
  it("is one constant-rate stretch for linear", () => {
    const segments = easeCurveSegments(2000, 4000, "linear");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      timelineStartMs: 0,
      timelineEndMs: 4000,
      sourceStartMs: 0,
      sourceEndMs: 2000,
      rate: 0.5
    });
  });

  it("covers the whole source contiguously and speeds up for easeIn", () => {
    const segments = easeCurveSegments(2000, 2000, "easeIn");
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0]!.sourceStartMs).toBe(0);
    expect(segments.at(-1)!.sourceEndMs).toBeCloseTo(2000, 6);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]!.sourceStartMs).toBeCloseTo(segments[i - 1]!.sourceEndMs, 6);
      expect(segments[i]!.rate).toBeGreaterThan(segments[i - 1]!.rate);
    }
  });
});

describe("easeCurveFilterGraph", () => {
  it("maps only the picture when the source has no audio", () => {
    const args = easeCurveFilterGraph({
      segments: easeCurveSegments(2000, 2000, "linear"),
      outputDurationMs: 2000,
      fps: 25,
      withAudio: false
    });
    expect(args).toEqual({
      video: "[0:v]setpts='(0+(T-0)*1)/TB',fps=25,trim=end=2[v]",
      audio: null
    });
  });

  it("retimes audio stretch by stretch and bounds it to the output", () => {
    const args = easeCurveFilterGraph({
      segments: easeCurveSegments(2000, 4000, "easeInOut"),
      outputDurationMs: 4000,
      fps: 25,
      withAudio: true
    });
    const graph = args.audio!;
    expect(graph).toContain("asplit=");
    expect(graph).toContain("atempo=");
    expect(graph).toMatch(/asetpts=N\/SR\/TB,atrim=end=4,apad=whole_dur=4\[a\]$/);
    expect(args.video).toMatch(/\[v\]$/);
  });
});

describe("EaseCurveVideoNode", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it(
    "plays the source slowly first for easeIn and fills the requested duration",
    async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "ease-curve-"));
      const source = path.join(dir, "source.mp4");
      // Brightness rises with the frame number, so luma tells which source
      // frame the output is showing.
      await generateMedia({
        outPath: source,
        video: {
          source: "color=c=black:s=32x32:r=25:d=2",
          filter: "format=gray,geq=lum='N*5'"
        },
        audio: { source: "sine=frequency=440:sample_rate=48000:duration=2" }
      });

      const node = new EaseCurveVideoNode();
      node.assign({
        video: { type: "video", data: (await readFile(source)).toString("base64") },
        easing: "easeIn",
        duration: 4
      });
      const { output } = await node.process();
      const out = path.join(dir, "out.mp4");
      await writeFile(out, Buffer.from(output.data as string, "base64"));

      const report = await inspectMedia(out);
      expect(report.durationSec).toBeGreaterThan(3.8);
      expect(report.durationSec).toBeLessThan(4.2);
      expect(report.audio).not.toBeNull();
      // The sped-up second half still sounds: the stretches are retimed, not dropped.
      const pcm = await readPcm(out, { sampleRate: 48000, channels: 1 });
      expect(rmsBetween(pcm, 2, 3.9)).toBeGreaterThan(0.01);

      // Cubic ease in: halfway through the output is 1/8 of the way through
      // the source (frame ~6, luma ~30). A linear retime would show frame 25.
      const frames = await readRgbaFrames(out, { width: 32, height: 32 });
      const lumaAt = (atSec: number): number => meanRgba(frames[Math.floor(atSec * 25)]!)[0];
      expect(lumaAt(2)).toBeLessThan(70);
      expect(lumaAt(3.9)).toBeGreaterThan(180);
    },
    60_000
  );
});
