/**
 * The output-format table (F13, T27): which container carries alpha, what
 * ffmpeg is told, and which pairs are refused.
 *
 * The refusals are the point. `mp4 + alpha` cannot be encoded — H.264 in MP4
 * has no alpha plane a player reads — and a render that quietly dropped the
 * channel would look like it worked. Each refusal below is driven by an input
 * that triggers it, so the check cannot pass by never firing (I12).
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHUTTER_ANGLE,
  MAX_MOTION_BLUR_SAMPLES
} from "@nodetool-ai/timeline/render";

import {
  ALPHA_OUTPUT_FORMATS,
  AlphaFormatError,
  TIMELINE_OUTPUT_FORMATS,
  parseOutputFormat,
  resolveTimelineOutput
} from "../src/nodes/timeline/outputFormats.js";

describe("resolveTimelineOutput — alpha refusals", () => {
  it("refuses mp4 with alpha and names the formats that carry it", () => {
    expect(() => resolveTimelineOutput({ format: "mp4", alpha: true })).toThrow(
      AlphaFormatError
    );
    expect(() =>
      resolveTimelineOutput({ format: "mp4", alpha: true })
    ).toThrow(/webm, mov, png_sequence/);
  });

  it("accepts every format it lists as alpha-capable", () => {
    for (const format of ALPHA_OUTPUT_FORMATS) {
      expect(resolveTimelineOutput({ format, alpha: true }).alpha).toBe(true);
    }
  });

  it("still writes mp4 without alpha", () => {
    expect(resolveTimelineOutput({ format: "mp4" }).alpha).toBe(false);
  });
});

describe("parseOutputFormat", () => {
  it("names the choices when the format is not one of them", () => {
    expect(() => parseOutputFormat("gif")).toThrow(
      /Unknown render format "gif"/
    );
    expect(() => parseOutputFormat("gif")).toThrow(/mp4, webm, mov, png_sequence/);
  });

  it("defaults to mp4 and tolerates case and padding", () => {
    expect(parseOutputFormat(null)).toBe("mp4");
    expect(parseOutputFormat("  WebM ")).toBe("webm");
  });
});

describe("resolveTimelineOutput — encoder arguments", () => {
  it("routes webm alpha through VP9 at yuva420p", () => {
    const out = resolveTimelineOutput({ format: "webm", alpha: true });
    expect(out.encoderArgs).toEqual([
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p"
    ]);
    expect(out.requiredEncoder).toBe("libvpx-vp9");
    // AAC is not a legal WebM track; the mux pass has to be told Opus.
    expect(out.audioCodec).toBe("libopus");
    expect(out.extension).toBe("webm");
  });

  it("drops webm to yuv420p without alpha", () => {
    expect(
      resolveTimelineOutput({ format: "webm" }).encoderArgs
    ).toContain("yuv420p");
  });

  it("routes mov alpha through ProRes 4444 at yuva444p10le", () => {
    const out = resolveTimelineOutput({ format: "mov", alpha: true });
    expect(out.encoderArgs).toEqual([
      "-c:v",
      "prores_ks",
      "-profile:v",
      "4444",
      "-pix_fmt",
      "yuva444p10le"
    ]);
    expect(out.requiredEncoder).toBe("prores_ks");
  });

  it("uses ProRes 422 HQ for an opaque mov", () => {
    const out = resolveTimelineOutput({ format: "mov" });
    expect(out.encoderArgs).toEqual([
      "-c:v",
      "prores_ks",
      "-profile:v",
      "3",
      "-pix_fmt",
      "yuv422p10le"
    ]);
  });

  it("keeps the png sequence away from ffmpeg entirely", () => {
    const out = resolveTimelineOutput({ format: "png_sequence", alpha: true });
    expect(out.encoderArgs).toEqual([]);
    expect(out.requiredEncoder).toBeNull();
    expect(out.audioCodec).toBeNull();
    expect(out.extension).toBe("zip");
    expect(out.mimeType).toBe("application/zip");
  });

  it("appends a bitrate only when one was asked for", () => {
    expect(
      resolveTimelineOutput({ format: "mp4", bitrate: 8_000_000 }).encoderArgs
    ).toEqual(expect.arrayContaining(["-b:v", "8000000"]));
    expect(
      resolveTimelineOutput({ format: "mp4", bitrate: 0 }).encoderArgs
    ).not.toContain("-b:v");
  });

  it("resolves motion blur once, clamped, on every format", () => {
    // The render reads `output.motionBlur` rather than re-parsing the node's
    // props, so a format that forgot to carry it would silently render sharp.
    for (const format of TIMELINE_OUTPUT_FORMATS) {
      const out = resolveTimelineOutput({
        format,
        motionBlurSamples: 200,
        shutterAngle: 900
      });
      expect(out.motionBlur.samplesPerFrame).toBe(MAX_MOTION_BLUR_SAMPLES);
      expect(out.motionBlur.shutterAngle).toBe(360);
    }
  });

  it("is blur off when nothing asks for it", () => {
    const out = resolveTimelineOutput({ format: "mp4" });
    expect(out.motionBlur.samplesPerFrame).toBe(1);
    expect(out.motionBlur.shutterAngle).toBe(DEFAULT_SHUTTER_ANGLE);
  });

  it("takes a codec override on mp4 and never on the alpha containers", () => {
    expect(
      resolveTimelineOutput({ format: "mp4", videoCodec: "libx265" }).encoderArgs
    ).toEqual(["-c:v", "libx265", "-pix_fmt", "yuv420p"]);
    // VP9 is the only WebM codec with an alpha plane, so the override cannot
    // reach it — silently losing alpha to a codec choice is the bug.
    expect(
      resolveTimelineOutput({ format: "webm", videoCodec: "libx265" }).encoderArgs
    ).toContain("libvpx-vp9");
  });
});
