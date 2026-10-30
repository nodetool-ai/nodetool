/**
 * The bundled libav must carry every filter and encoder the server's media
 * code names. A prebuild that dropped one would fail a render at run time, so
 * this runs on every platform CI builds for (risk R7 in
 * docs/ffmpeg-in-process-plan.md).
 */

import { describe, expect, it } from "vitest";

import { hasEncoder, hasFilter } from "../../src/media/index.js";

const FILTERS = [
  "scale", "fps", "setpts", "asetpts", "trim", "atrim", "format", "aformat",
  "atempo", "afade", "adelay", "amix", "apad", "pan", "aresample", "volume",
  "overlay", "xfade", "acrossfade", "colorbalance", "nlmeans", "deshake",
  "cropdetect", "unsharp", "boxblur", "eq", "drawtext", "subtitles", "colorkey",
  "reverse", "areverse", "rotate", "select", "showwavespic", "concat", "anullsrc",
  "color", "loudnorm", "zscale", "highpass", "lowpass", "equalizer",
  "acompressor", "alimiter", "aecho"
];

const ENCODERS = [
  "libx264", "libx265", "libvpx-vp9", "libvpx", "libsvtav1", "prores_ks", "png",
  "mjpeg", "ffv1", "aac", "libfdk_aac", "libopus", "libmp3lame", "flac",
  "pcm_s16le", "pcm_f32le"
];

describe("bundled libav build", () => {
  it.each(FILTERS)("has the %s filter", async (name) => {
    expect(await hasFilter(name)).toBe(true);
  });

  it.each(ENCODERS)("has the %s encoder", async (name) => {
    expect(await hasEncoder(name)).toBe(true);
  });

  it("answers false for an encoder the build lacks", async () => {
    // AV1 goes through libsvtav1; no call site uses libaom.
    expect(await hasEncoder("libaom-av1")).toBe(false);
    expect(await hasFilter("no_such_filter")).toBe(false);
  });
});
