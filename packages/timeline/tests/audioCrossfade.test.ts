import { describe, expect, it } from "vitest";
import { applyAudioCrossfades } from "../src/audioCrossfade.js";
import type { TimelineClip } from "../src/types.js";

function clip(
  id: string,
  startMs: number,
  durationMs: number,
  extra: Partial<TimelineClip> = {}
): TimelineClip {
  return {
    id,
    trackId: "a1",
    name: id,
    startMs,
    durationMs,
    mediaType: "audio",
    sourceType: "imported",
    status: "draft",
    locked: false,
    versions: [],
    inPointMs: 0,
    ...extra
  };
}

const byId = (clips: readonly TimelineClip[], id: string): TimelineClip => {
  const found = clips.find((c) => c.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("applyAudioCrossfades", () => {
  it("overlaps the earlier clip under the later one at a cut", () => {
    const clips = [clip("a", 0, 2000), clip("b", 2000, 2000)];
    const out = applyAudioCrossfades(clips, new Set(["b"]), 500);
    expect(byId(out, "a").durationMs).toBe(2500);
    expect(byId(out, "a").fadeOutMs).toBe(500);
    expect(byId(out, "a").fadeOutShape).toBe("plus3dB");
    expect(byId(out, "b").fadeInMs).toBe(500);
    expect(byId(out, "b").startMs).toBe(2000);
  });

  it("fades a free edge from silence", () => {
    const clips = [clip("a", 0, 2000)];
    const out = applyAudioCrossfades(clips, new Set(["a"]), 500);
    expect(byId(out, "a").fadeInMs).toBe(500);
    expect(byId(out, "a").fadeOutMs).toBe(500);
    expect(byId(out, "a").durationMs).toBe(2000);
  });

  it("caps the overlap at the source the earlier clip has left", () => {
    const clips = [clip("a", 0, 2000, { outPointMs: 2000 }), clip("b", 2000, 2000)];
    const out = applyAudioCrossfades(clips, new Set(["b"]), 500, {
      sourceDurationMs: () => 2200
    });
    expect(byId(out, "a").durationMs).toBe(2200);
    expect(byId(out, "b").fadeInMs).toBe(200);
  });

  it("dips when the earlier clip has no source left", () => {
    const clips = [clip("a", 0, 2000, { outPointMs: 2000 }), clip("b", 2000, 2000)];
    const out = applyAudioCrossfades(clips, new Set(["a", "b"]), 500, {
      sourceDurationMs: () => 2000
    });
    expect(byId(out, "a").durationMs).toBe(2000);
    expect(byId(out, "a").fadeOutMs).toBe(250);
    expect(byId(out, "b").fadeInMs).toBe(250);
  });

  it("leaves video clips alone", () => {
    const clips = [clip("v", 0, 2000, { mediaType: "video" })];
    expect(applyAudioCrossfades(clips, new Set(["v"]), 500)).toBe(clips);
  });
});
