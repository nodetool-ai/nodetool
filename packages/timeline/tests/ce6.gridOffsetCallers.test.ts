import { describe, expect, it } from "vitest";
import { makeClip, resolveDrop, rippleTrim, rollEdit, type TimelineClip } from "../src/index.js";

// 120 BPM: a quarter note is 960 ticks. A 100 ms grid offset is 192 ticks.
const OFFSET_MS = 100;
const looped = (id: string, startMs: number, trackId = "t"): TimelineClip =>
  makeClip({
    id,
    trackId,
    name: id,
    startMs,
    durationMs: 2000,
    loopLengthMs: 1000,
    mediaType: "midi",
    quantize: { grid: "1/4", strength: 100 },
    notes: [{ id: `${id}_n`, pitch: 60, velocity: 90, startTick: 100, durationTick: 50 }]
  });

const firstNoteTick = (clips: readonly TimelineClip[]): number[] =>
  clips
    .filter((c) => c.id !== "m" && c.id !== "b" && c.mediaType === "midi" && (c.notes?.length ?? 0) > 0)
    .sort((x, y) => x.startMs - y.startMs)
    .map((c) => c.notes![0]!.startTick);

describe("callers that unroll a looped midi clip pass the grid offset (F6)", () => {
  it("rippleTrim bakes quantize on the offset grid", () => {
    const out = rippleTrim([looped("a", 0)], "a", "start", 0, { bpm: 120, gridOffsetMs: OFFSET_MS });
    expect(firstNoteTick(out)[0]).toBe(192);
  });

  it("rollEdit bakes quantize on the offset grid", () => {
    const b = makeClip({ id: "b", trackId: "t", name: "b", startMs: 0, durationMs: 1000, mediaType: "midi", notes: [] });
    const out = rollEdit([b, looped("a", 1000)], "a", "start", 0, { bpm: 120, gridOffsetMs: OFFSET_MS });
    expect(firstNoteTick(out)[0]).toBe(192);
  });

  it("resolveDrop overwrite bakes quantize on the offset grid", () => {
    const mover = makeClip({ id: "m", trackId: "t", name: "m", startMs: 500, durationMs: 200, mediaType: "midi", notes: [] });
    const out = resolveDrop([looped("a", 0), mover], new Set(["m"]), "overwrite", { bpm: 120, gridOffsetMs: OFFSET_MS });
    expect(firstNoteTick(out)[0]).toBe(192);
  });

  it("resolveDrop insert bakes quantize on the offset grid", () => {
    const mover = makeClip({ id: "m", trackId: "t", name: "m", startMs: 500, durationMs: 200, mediaType: "midi", notes: [] });
    const out = resolveDrop([looped("a", 0), mover], new Set(["m"]), "insert", { bpm: 120, gridOffsetMs: OFFSET_MS });
    expect(firstNoteTick(out)[0]).toBe(192);
  });
});
