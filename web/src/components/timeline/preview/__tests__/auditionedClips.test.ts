import { describe, it, expect } from "@jest/globals";
import { makeClip } from "@nodetool-ai/timeline";
import { auditionedClips } from "../auditionedClips";

const audio = (id: string, startMs: number, extra: Partial<Parameters<typeof makeClip>[0]> = {}) =>
  makeClip({
    id,
    trackId: "a1",
    mediaType: "audio",
    startMs,
    durationMs: 1000,
    currentAssetId: `asset-${id}`,
    status: "generated",
    ...extra
  } as never);

const doc = (music?: { autoCrossfadeMs?: number }) =>
  ({ tracks: [], tempo: undefined, music }) as never;

describe("auditionedClips crossfade (CE7)", () => {
  it("crossfades abutting audio clips of a music project", () => {
    const out = auditionedClips(
      [audio("a", 0), audio("b", 1000)],
      null,
      doc({ autoCrossfadeMs: 10 })
    );
    expect(out[0]!.fadeOutMs).toBeGreaterThan(0);
    expect(out[1]!.fadeInMs).toBeGreaterThan(0);
  });

  it("leaves clips alone outside a music project", () => {
    const out = auditionedClips([audio("a", 0), audio("b", 1000)], null, doc());
    expect(out[0]!.fadeOutMs).toBeUndefined();
  });

  it("does not fade against a muted neighbour", () => {
    const out = auditionedClips(
      [audio("a", 0), audio("b", 1000, { muted: true })],
      null,
      doc({ autoCrossfadeMs: 10 })
    );
    expect(out[0]!.fadeOutMs).toBeUndefined();
  });
});

describe("auditionedClips round 2", () => {
  it("F26: an assetless clip made playable by an audition is crossfaded", () => {
    const pending = makeClip({
      id: "x",
      trackId: "a1",
      mediaType: "audio",
      startMs: 0,
      durationMs: 1000,
      status: "generated",
      versions: [{ id: "t1", status: "success", assetId: "asset-t1" }]
    } as never);
    const out = auditionedClips(
      [pending, audio("b", 1000)],
      { clipId: "x", takeId: "t1" } as never,
      doc({ autoCrossfadeMs: 10 })
    );
    expect(out.find((c) => c.id === "x")!.fadeOutMs).toBeGreaterThan(0);
    expect(out.find((c) => c.id === "b")!.fadeInMs).toBeGreaterThan(0);
  });
});

