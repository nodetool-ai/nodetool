import { describe, expect, it } from "vitest";
import { clipFadeGain, makeClip, type TimelineClip } from "../src/index.js";
import {
  DEFAULT_AUTO_CROSSFADE_MS,
  applyAutoCrossfade,
  autoCrossfadeMsOf
} from "../src/autoCrossfade.js";

const audio = (id: string, startMs: number, durationMs: number, over: Partial<TimelineClip> = {}) =>
  makeClip({
    id,
    trackId: "t1",
    name: id,
    startMs,
    durationMs,
    mediaType: "audio",
    ...over
  });

const byId = (clips: readonly TimelineClip[], id: string) => clips.find((c) => c.id === id)!;

describe("CE7 automatic crossfade (D54)", () => {
  it("defaults to 10 ms in a music project and off elsewhere", () => {
    expect(DEFAULT_AUTO_CROSSFADE_MS).toBe(10);
    expect(autoCrossfadeMsOf({ music: {} })).toBe(10);
    expect(autoCrossfadeMsOf({ music: { autoCrossfadeMs: 25 } })).toBe(25);
    expect(autoCrossfadeMsOf({ music: { autoCrossfadeMs: 0 } })).toBe(0);
    expect(autoCrossfadeMsOf({})).toBe(0);
  });

  it("fades both sides of a touching cut, half the length each", () => {
    const out = applyAutoCrossfade([audio("a", 0, 1000), audio("b", 1000, 1000)], 10);
    expect(byId(out, "a").fadeOutMs).toBe(5);
    expect(byId(out, "b").fadeInMs).toBe(5);
  });

  it("crossfades an overlap along its length with equal power", () => {
    const out = applyAutoCrossfade([audio("a", 0, 1000), audio("b", 996, 1000)], 10);
    expect(byId(out, "a").fadeOutMs).toBe(4);
    expect(byId(out, "b").fadeInMs).toBe(4);
    expect(byId(out, "a").fadeOutShape).toBe("plus3dB");
    expect(byId(out, "b").fadeInShape).toBe("plus3dB");
  });

  it("leaves stored fades alone", () => {
    const out = applyAutoCrossfade(
      [audio("a", 0, 1000, { fadeOutMs: 200 }), audio("b", 1000, 1000, { fadeInMs: 50 })],
      10
    );
    expect(byId(out, "a").fadeOutMs).toBe(200);
    expect(byId(out, "b").fadeInMs).toBe(50);
  });

  it("ignores gaps, other tracks, other media and a zero setting", () => {
    const gap = [audio("a", 0, 1000), audio("b", 1100, 1000)];
    expect(applyAutoCrossfade(gap, 10)).toBe(gap);
    const other = [audio("a", 0, 1000), audio("b", 1000, 1000, { trackId: "t2" })];
    expect(applyAutoCrossfade(other, 10)).toBe(other);
    const video = [audio("a", 0, 1000), audio("b", 1000, 1000, { mediaType: "video" })];
    expect(applyAutoCrossfade(video, 10)).toBe(video);
    const touching = [audio("a", 0, 1000), audio("b", 1000, 1000)];
    expect(applyAutoCrossfade(touching, 0)).toBe(touching);
  });

  it("does not change the input clips and caps at half a short clip", () => {
    const a = audio("a", 0, 1000);
    const b = audio("b", 1000, 4);
    const out = applyAutoCrossfade([a, b], 10);
    expect(a.fadeOutMs).toBeUndefined();
    expect(byId(out, "b").fadeInMs).toBe(2);
  });

  it("chains across three clips", () => {
    const out = applyAutoCrossfade(
      [audio("a", 0, 1000), audio("b", 1000, 1000), audio("c", 2000, 1000)],
      10
    );
    expect(byId(out, "b").fadeInMs).toBe(5);
    expect(byId(out, "b").fadeOutMs).toBe(5);
    expect(byId(out, "c").fadeInMs).toBe(5);
  });
});

describe("CE7 round 2", () => {
  it("F24: the cut of A takes one envelope when two clips start inside it", () => {
    const out = applyAutoCrossfade(
      [audio("a", 0, 1000), audio("b", 900, 1100), audio("c", 995, 1005)],
      10
    );
    expect(byId(out, "a").fadeOutMs).toBe(5);
    expect(byId(out, "a").fadeOutShape).toBe("plus3dB");
    expect(byId(out, "c").fadeInMs).toBe(5);
    expect(byId(out, "c").fadeInShape).toBe("plus3dB");
  });

  it("F25: a clip contained in another fades out as well as in", () => {
    const out = applyAutoCrossfade([audio("a", 0, 2000), audio("b", 500, 500)], 10);
    expect(byId(out, "b").fadeInMs).toBe(10);
    expect(byId(out, "b").fadeOutMs).toBe(10);
  });
});

describe("CE7 A22r fixes", () => {
  it("R1: keeps explicit stored zero fades instead of overwriting them", () => {
    const input = [
      audio("a", 0, 1000, { fadeOutMs: 0 }),
      audio("b", 1000, 1000, { fadeInMs: 0 })
    ];
    const out = applyAutoCrossfade(input, 10);
    expect(out).toBe(input);
    expect(byId(out, "a").fadeOutMs).toBe(0);
    expect(byId(out, "b").fadeInMs).toBe(0);

    const mixed = applyAutoCrossfade(
      [audio("a", 0, 1000, { fadeOutMs: 0 }), audio("b", 1000, 1000)],
      10
    );
    expect(byId(mixed, "a").fadeOutMs).toBe(0);
    expect(byId(mixed, "b").fadeInMs).toBe(5);
  });

  it("R2: gives a short overlap longer than the setting a real equal-power crossfade", () => {
    const out = applyAutoCrossfade([audio("a", 0, 1020), audio("b", 1000, 1000)], 10);
    const a = byId(out, "a");
    const b = byId(out, "b");
    expect(a.fadeOutMs).toBe(20);
    expect(b.fadeInMs).toBe(20);
    expect(a.fadeOutShape).toBe("plus3dB");
    expect(b.fadeInShape).toBe("plus3dB");

    for (const t of [1005, 1010, 1015]) {
      const gainA = clipFadeGain(a, a.durationMs, t - a.startMs);
      const gainB = clipFadeGain(b, b.durationMs, t - b.startMs);
      expect(gainA).toBeLessThan(1);
      expect(gainB).toBeLessThan(1);
      expect(gainA * gainA + gainB * gainB).toBeCloseTo(1, 6);
    }
  });
});
