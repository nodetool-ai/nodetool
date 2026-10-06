import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
    expect(args).toEqual([
      "-filter_complex",
      "[0:v]setpts='(0+(T-0)*1)/TB',fps=25,trim=end=2[v]",
      "-map",
      "[v]"
    ]);
  });

  it("retimes audio stretch by stretch and bounds it to the output", () => {
    const args = easeCurveFilterGraph({
      segments: easeCurveSegments(2000, 4000, "easeInOut"),
      outputDurationMs: 4000,
      fps: 25,
      withAudio: true
    });
    const graph = args[1]!;
    expect(graph).toContain("asplit=");
    expect(graph).toContain("atempo=");
    expect(graph).toContain("asetpts=N/SR/TB,atrim=end=4,apad=whole_dur=4[a]");
    expect(args.slice(2)).toEqual(["-map", "[v]", "-map", "[a]"]);
  });
});

describe("EaseCurveVideoNode", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  /** Mean luma of the output frame shown at `atSec`. */
  function lumaAt(file: string, atSec: number): number {
    const raw = execFileSync("ffmpeg", [
      "-v", "error", "-ss", String(atSec), "-i", file,
      "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"
    ]);
    return raw.reduce((sum, v) => sum + v, 0) / raw.length;
  }

  it.skipIf(process.platform === "win32")(
    "plays the source slowly first for easeIn and fills the requested duration",
    async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "ease-curve-"));
      const source = path.join(dir, "source.mp4");
      // Brightness rises with the frame number, so luma tells which source
      // frame the output is showing.
      execFileSync("ffmpeg", [
        "-v", "error", "-y",
        "-f", "lavfi", "-i", "color=c=black:s=32x32:r=25:d=2,format=gray,geq=lum='N*5'",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source
      ]);

      const node = new EaseCurveVideoNode();
      node.assign({
        video: { type: "video", data: (await readFile(source)).toString("base64") },
        easing: "easeIn",
        duration: 4
      });
      const { output } = await node.process();
      const out = path.join(dir, "out.mp4");
      await writeFile(out, Buffer.from(output.data as string, "base64"));

      const duration = Number(
        execFileSync("ffprobe", [
          "-v", "error", "-show_entries", "format=duration",
          "-of", "default=noprint_wrappers=1:nokey=1", out
        ]).toString()
      );
      expect(duration).toBeGreaterThan(3.8);
      expect(duration).toBeLessThan(4.2);
      const streams = execFileSync("ffprobe", [
        "-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out
      ]).toString();
      expect(streams).toContain("audio");
      // The sped-up second half still sounds: the stretches are retimed, not dropped.
      const { stderr } = spawnSync(
        "ffmpeg",
        ["-ss", "2", "-i", out, "-vn", "-af", "volumedetect", "-f", "null", "-"],
        { encoding: "utf8" }
      );
      const meanDb = Number(/mean_volume: (-?[\d.]+) dB/.exec(stderr)?.[1]);
      expect(meanDb).toBeGreaterThan(-40);

      // Cubic ease in: halfway through the output is 1/8 of the way through
      // the source (frame ~6, luma ~30). A linear retime would show frame 25.
      expect(lumaAt(out, 2)).toBeLessThan(70);
      expect(lumaAt(out, 3.9)).toBeGreaterThan(180);
    },
    60_000
  );
});
