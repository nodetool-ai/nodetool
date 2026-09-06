/**
 * T13: which bakes are probed, and what an undecodable one does to the scene.
 *
 * Both browser hosts share these two rules, so they are pinned once here
 * rather than through either host: only a transparent bake that a document
 * would actually play is worth a probe, and a bake that failed one has to
 * stop matching its clip — which is how the scene model comes to emit the
 * live 3D layer instead (§D6, §R6).
 */

import { DEFAULT_MODEL3D_STYLE, makeClip } from "@nodetool-ai/timeline";
import type { ClipModel3DStyle, TimelineClip } from "@nodetool-ai/timeline";

import { alphaBakesToProbe, guardBakeHash } from "../bakeDecoding";

const HASH = "hash-of-the-live-clip";

function clipWith(
  id: string,
  style: Partial<ClipModel3DStyle>,
  bake?: { assetId: string; dependencyHash: string }
): TimelineClip {
  const model3dStyle: ClipModel3DStyle = {
    ...DEFAULT_MODEL3D_STYLE,
    background: { transparent: true },
    ...style
  };
  if (bake) model3dStyle.bake = bake;
  return makeClip({
    id,
    trackId: "track-1",
    name: id,
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    startMs: 0,
    durationMs: 1000,
    currentAssetId: "asset-glb",
    model3dStyle
  });
}

const liveHash = (): string => HASH;

describe("alphaBakesToProbe", () => {
  it("names a transparent bake the document would play", () => {
    const clip = clipWith("cube", {}, { assetId: "bake-1", dependencyHash: HASH });
    expect(alphaBakesToProbe([clip], liveHash)).toEqual([
      { clipId: "cube", assetId: "bake-1" }
    ]);
  });

  it("leaves an opaque bake alone — it has no alpha to lose", () => {
    const clip = clipWith(
      "cube",
      { background: { transparent: false, color: "#101010" } },
      { assetId: "bake-1", dependencyHash: HASH }
    );
    expect(alphaBakesToProbe([clip], liveHash)).toEqual([]);
  });

  it("leaves a stale bake alone — nothing plays it", () => {
    const clip = clipWith(
      "cube",
      {},
      { assetId: "bake-1", dependencyHash: "an-older-picture" }
    );
    expect(alphaBakesToProbe([clip], liveHash)).toEqual([]);
  });

  it("leaves a clip with no bake alone", () => {
    expect(alphaBakesToProbe([clipWith("cube", {})], liveHash)).toEqual([]);
  });
});

describe("guardBakeHash", () => {
  const undecodable = [
    { clipId: "cube", assetId: "bake-1", reason: "no_alpha" as const }
  ];

  it("answers nothing for a bake this browser could not play", () => {
    const clip = clipWith("cube", {}, { assetId: "bake-1", dependencyHash: HASH });
    // The scene model plays a bake only when the hashes match, so no hash is
    // the live layer.
    expect(guardBakeHash(liveHash, undecodable)(clip)).toBeUndefined();
  });

  it("answers the live hash for every other bake", () => {
    const other = clipWith("ball", {}, { assetId: "bake-2", dependencyHash: HASH });
    expect(guardBakeHash(liveHash, undecodable)(other)).toBe(HASH);
    expect(guardBakeHash(liveHash, [])(other)).toBe(HASH);
  });
});
