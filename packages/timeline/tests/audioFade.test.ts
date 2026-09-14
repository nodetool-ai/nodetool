/**
 * The fade curves, and the two things that must not drift from them: ffmpeg's
 * `afade` (the export renders the curve the preview sounds) and the protocol
 * enum (the document can carry every shape the math knows).
 */
import { describe, expect, it } from "vitest";

import { clipFadeShapeEnum } from "@nodetool-ai/protocol/api-schemas/timeline.js";

import {
  CLIP_FADE_SHAPES,
  canClipFade,
  clipFadeGain,
  fadeShapeGain,
  ffmpegFadeCurve,
  parseClipFadeShape,
  resolveClipFades,
  sampleFadeShape
} from "../src/audioFade.js";

/** ffmpeg's own gain functions, from `af_afade.c`, for the curves we map to. */
const FFMPEG_GAIN: Record<string, (g: number) => number> = {
  tri: (g) => g,
  hsin: (g) => (1 - Math.cos(g * Math.PI)) / 2,
  qsin: (g) => Math.sin((g * Math.PI) / 2),
  iqsin: (g) => 0.636943 * Math.asin(g)
};

describe("fadeShapeGain", () => {
  it("runs every shape from silence to full volume", () => {
    for (const shape of CLIP_FADE_SHAPES) {
      expect(fadeShapeGain(shape, 0)).toBeCloseTo(0, 3);
      expect(fadeShapeGain(shape, 1)).toBeCloseTo(1, 3);
    }
  });

  it("rises monotonically across every shape", () => {
    for (const shape of CLIP_FADE_SHAPES) {
      let previous = -1;
      for (let i = 0; i <= 40; i += 1) {
        const gain = fadeShapeGain(shape, i / 40);
        expect(gain).toBeGreaterThanOrEqual(previous);
        previous = gain;
      }
    }
  });

  it("places +3 dB three decibels above linear at the midpoint, and -3 dB below", () => {
    const db = (gain: number): number => 20 * Math.log10(gain);
    const linear = db(fadeShapeGain("linear", 0.5));
    expect(db(fadeShapeGain("plus3dB", 0.5)) - linear).toBeCloseTo(3.01, 2);
    expect(db(fadeShapeGain("minus3dB", 0.5))).toBeLessThan(linear);
    // The S-curve crosses the midpoint where the straight line does.
    expect(fadeShapeGain("sCurve", 0.5)).toBeCloseTo(0.5, 6);
  });

  it("clamps progress outside the fade", () => {
    expect(fadeShapeGain("plus3dB", -1)).toBe(0);
    expect(fadeShapeGain("plus3dB", 4)).toBe(1);
    expect(fadeShapeGain("linear", Number.NaN)).toBe(0);
  });
});

describe("ffmpegFadeCurve", () => {
  it("names a curve whose gain matches the shape at every point", () => {
    for (const shape of CLIP_FADE_SHAPES) {
      const ffmpeg = FFMPEG_GAIN[ffmpegFadeCurve(shape)];
      expect(ffmpeg).toBeDefined();
      for (let i = 0; i <= 20; i += 1) {
        const t = i / 20;
        // ffmpeg rounds 2/π to 0.636943, so `iqsin` runs up to 0.05% hot;
        // every other curve is exact.
        expect(Math.abs(fadeShapeGain(shape, t) - ffmpeg(t))).toBeLessThan(1e-3);
      }
    }
  });
});

describe("the protocol's fade-shape enum", () => {
  it("carries exactly the shapes the curves implement", () => {
    expect([...clipFadeShapeEnum.options].sort()).toEqual(
      [...CLIP_FADE_SHAPES].sort()
    );
  });
});

describe("parseClipFadeShape", () => {
  it("falls back to linear for anything it does not know", () => {
    expect(parseClipFadeShape("sCurve")).toBe("sCurve");
    expect(parseClipFadeShape("bogus")).toBe("linear");
    expect(parseClipFadeShape(undefined)).toBe("linear");
  });
});

describe("sampleFadeShape", () => {
  it("samples the requested span of the curve, ends included", () => {
    const curve = sampleFadeShape("linear", 0.25, 1, 3);
    expect(curve.length).toBe(4);
    expect(curve[0]).toBeCloseTo(0.25, 6);
    expect(curve[3]).toBeCloseTo(1, 6);
  });

  it("resumes mid-fade rather than restarting from silence", () => {
    const resumed = sampleFadeShape("plus3dB", 0.5, 1, 8);
    expect(resumed[0]).toBeCloseTo(fadeShapeGain("plus3dB", 0.5), 6);
  });
});

describe("resolveClipFades", () => {
  it("caps a single fade at the clip", () => {
    const fades = resolveClipFades({ fadeInMs: 9000 }, 1000);
    expect(fades.fadeInMs).toBe(1000);
    expect(fades.fadeOutMs).toBe(0);
  });

  it("meets two crossing fades in the middle", () => {
    const fades = resolveClipFades({ fadeInMs: 800, fadeOutMs: 800 }, 1000);
    expect(fades.fadeInMs).toBe(500);
    expect(fades.fadeOutMs).toBe(500);
  });

  it("leaves a fade that fits alone, clamping only the one that does not", () => {
    const fades = resolveClipFades({ fadeInMs: 200, fadeOutMs: 900 }, 1000);
    expect(fades.fadeInMs).toBe(200);
    expect(fades.fadeOutMs).toBe(500);
  });

  it("reads an absent or unknown shape as linear", () => {
    expect(resolveClipFades({}, 1000).fadeInShape).toBe("linear");
    expect(
      resolveClipFades({ fadeOutShape: "wobble" }, 1000).fadeOutShape
    ).toBe("linear");
  });
});

describe("clipFadeGain", () => {
  const clip = {
    fadeInMs: 200,
    fadeOutMs: 400,
    fadeInShape: "plus3dB",
    fadeOutShape: "sCurve"
  };

  it("ramps in, sustains, and ramps back out", () => {
    expect(clipFadeGain(clip, 1000, 0)).toBeCloseTo(0, 6);
    expect(clipFadeGain(clip, 1000, 100)).toBeCloseTo(
      fadeShapeGain("plus3dB", 0.5),
      6
    );
    expect(clipFadeGain(clip, 1000, 500)).toBe(1);
    expect(clipFadeGain(clip, 1000, 800)).toBeCloseTo(
      fadeShapeGain("sCurve", 0.5),
      6
    );
    expect(clipFadeGain(clip, 1000, 1000)).toBeCloseTo(0, 6);
  });

  it("is silent outside the clip", () => {
    expect(clipFadeGain(clip, 1000, -1)).toBe(0);
    expect(clipFadeGain(clip, 1000, 1001)).toBe(0);
  });
});

describe("canClipFade", () => {
  it("covers the media the mixer sounds, and nothing that only draws", () => {
    expect(canClipFade("audio")).toBe(true);
    expect(canClipFade("video")).toBe(true);
    expect(canClipFade("midi")).toBe(true);
    expect(canClipFade("text")).toBe(false);
    expect(canClipFade("adjustment")).toBe(false);
  });
});
