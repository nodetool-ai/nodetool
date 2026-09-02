/**
 * Two-clip transitions (F6, T11).
 *
 * A transition is authored on the incoming clip and has to describe *both*
 * sides of the cut (D5), so every case here reads the incoming record and the
 * outgoing one together — a type that moves only the clip that declares it is
 * the bug this exists to prevent.
 *
 * Progress 0 and 0.5 are sampled through {@link resolveTransition}; progress 1
 * is the boundary where the cut is over, which the resolver answers by
 * reporting no records at all. Pixels are checked where a real canvas is:
 * `packages/agents/tests/timeline-transition-frames.test.ts` (Canvas 2D) and
 * `render.transition.gpu.test.ts` (WebGPU).
 */
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import type { ClipTransition, TimelineClip, TimelineTrack } from "../src/index.js";

import { computeActiveLayers } from "../src/render/sceneModel.js";
import {
  parseTransitionDirection,
  parseTransitionType,
  resolveTransition,
  transitionTransform,
  type ResolvedTransition
} from "../src/render/transition.js";

const OUT_START = 0;
const OUT_DURATION = 1200;
const IN_START = 800;
const CUT_MS = 400;

const outgoing = makeClip({
  id: "outgoing",
  trackId: "track-1",
  name: "Outgoing",
  status: "generated",
  currentAssetId: "asset-out",
  mediaType: "video",
  startMs: OUT_START,
  durationMs: OUT_DURATION
});

const incoming = (transitionIn?: ClipTransition): TimelineClip =>
  makeClip({
    id: "incoming",
    trackId: "track-1",
    name: "Incoming",
    status: "generated",
    currentAssetId: "asset-in",
    mediaType: "video",
    startMs: IN_START,
    durationMs: 1000,
    ...(transitionIn ? { transitionIn } : {})
  });

/** The timeline instant at which the cut sits `p` of the way through. */
const at = (p: number): number => IN_START + p * CUT_MS;

/** Both records of the cut `transitionIn` declares, at progress `p`. */
function pairAt(
  transitionIn: ClipTransition | undefined,
  p: number
): { incoming: ResolvedTransition; outgoing: ResolvedTransition } {
  const clip = incoming(transitionIn);
  const pair = resolveTransition(clip, [outgoing, clip], at(p));
  if (!pair?.outgoing) throw new Error(`no cut in flight at progress ${p}`);
  expect(pair.outgoingClip?.id).toBe("outgoing");
  return { incoming: pair.incoming, outgoing: pair.outgoing };
}

const cut = (over: Partial<ClipTransition> & { type: string }): ClipTransition =>
  // SAFETY: the cases below build each member of the union by hand; the
  // partial spread is what keeps the table readable.
  ({ durationMs: CUT_MS, ...over }) as ClipTransition;

describe("resolveTransition — roles", () => {
  it("reports no cut once the window has passed", () => {
    const clip = incoming({ type: "crossfade", durationMs: CUT_MS });
    expect(resolveTransition(clip, [outgoing, clip], at(1))).toBeNull();
    expect(resolveTransition(clip, [outgoing, clip], at(2))).toBeNull();
  });

  it("crossfade ramps the incoming and leaves the outgoing opaque", () => {
    const t = cut({ type: "crossfade" });
    expect(pairAt(t, 0).incoming.opacity).toBe(0);
    expect(pairAt(t, 0.5).incoming.opacity).toBeCloseTo(0.5);
    expect(pairAt(t, 0.999).incoming.opacity).toBeCloseTo(1, 2);
    for (const p of [0, 0.5, 0.999]) {
      expect(pairAt(t, p).outgoing.opacity).toBe(1);
    }
  });

  it("dipToColor peaks the solid at the midpoint with both clips gone", () => {
    const t = cut({ type: "dipToColor", color: "#ff0000" });

    const start = pairAt(t, 0);
    expect(start.outgoing.opacity).toBe(1);
    expect(start.incoming.opacity).toBe(0);
    expect(start.incoming.solid).toEqual({ color: "#ff0000", opacity: 0 });

    const middle = pairAt(t, 0.5);
    expect(middle.outgoing.opacity).toBeCloseTo(0);
    expect(middle.incoming.opacity).toBeCloseTo(0);
    expect(middle.incoming.solid?.opacity).toBeCloseTo(1);

    const end = pairAt(t, 0.999);
    expect(end.incoming.opacity).toBeCloseTo(1, 2);
    expect(end.incoming.solid?.opacity).toBeCloseTo(0, 2);
    // Only the incoming record carries the solid, so a frame draws it once
    // however many layers the cut touches.
    expect(end.outgoing.solid).toBeUndefined();
  });

  it("wipe reveals the incoming and leaves the outgoing beneath", () => {
    const t = cut({ type: "wipe", direction: "up", softness: 0.2 });
    for (const p of [0, 0.5, 0.999]) {
      const { incoming: i, outgoing: o } = pairAt(t, p);
      expect(i.opacity).toBe(1);
      expect(o.opacity).toBe(1);
      expect(o.mask).toBeUndefined();
      expect(i.mask?.direction).toBe("up");
      expect(i.mask?.softness).toBe(0.2);
    }
    expect(pairAt(t, 0).incoming.mask?.progress).toBe(0);
    expect(pairAt(t, 0.5).incoming.mask?.progress).toBeCloseTo(0.5);
    expect(pairAt(t, 0.999).incoming.mask?.progress).toBeCloseTo(1, 2);
  });

  it("push travels both clips one frame apart", () => {
    const t = cut({ type: "push", direction: "left" });

    // `left` is the edge the incoming arrives from, so it starts a whole frame
    // to the left and the outgoing leaves to the right.
    expect(pairAt(t, 0).incoming.offset?.x).toBeCloseTo(-1);
    expect(pairAt(t, 0).outgoing.offset?.x).toBeCloseTo(0);

    const middle = pairAt(t, 0.5);
    expect(middle.incoming.offset?.x).toBeCloseTo(-0.5);
    expect(middle.outgoing.offset?.x).toBeCloseTo(0.5);
    // One picture: the gap between the two stays exactly one frame.
    expect(
      middle.outgoing.offset!.x - middle.incoming.offset!.x
    ).toBeCloseTo(1);

    const end = pairAt(t, 0.999);
    expect(end.incoming.offset?.x).toBeCloseTo(0, 2);
    expect(end.outgoing.offset?.x).toBeCloseTo(1, 2);
  });

  it("push runs along the axis its direction names", () => {
    const down = pairAt(cut({ type: "push", direction: "down" }), 0.5).incoming;
    expect(down.offset?.x).toBeCloseTo(0);
    expect(down.offset?.y).toBeCloseTo(0.5);
    expect(pairAt(cut({ type: "push", direction: "right" }), 0.5).outgoing.offset?.x)
      .toBeCloseTo(-0.5);
  });

  it("slide moves only the incoming clip", () => {
    const t = cut({ type: "slide", direction: "right" });
    for (const p of [0, 0.5, 0.999]) {
      expect(pairAt(t, p).outgoing.offset).toBeUndefined();
      expect(pairAt(t, p).outgoing.opacity).toBe(1);
    }
    expect(pairAt(t, 0).incoming.offset?.x).toBeCloseTo(1);
    expect(pairAt(t, 0.5).incoming.offset?.x).toBeCloseTo(0.5);
    expect(pairAt(t, 0.999).incoming.offset?.x).toBeCloseTo(0, 2);
  });

  it("zoom grows the outgoing and brings the incoming in from 0.8", () => {
    const t = cut({ type: "zoom" });

    expect(pairAt(t, 0).outgoing.scale).toBeCloseTo(1);
    expect(pairAt(t, 0).incoming.scale).toBeCloseTo(0.8);
    expect(pairAt(t, 0).incoming.opacity).toBe(0);

    expect(pairAt(t, 0.5).outgoing.scale).toBeCloseTo(1.125);
    expect(pairAt(t, 0.5).incoming.scale).toBeCloseTo(0.9);
    expect(pairAt(t, 0.5).incoming.opacity).toBeCloseTo(0.5);

    expect(pairAt(t, 0.999).outgoing.scale).toBeCloseTo(1.25, 2);
    expect(pairAt(t, 0.999).incoming.scale).toBeCloseTo(1, 2);
  });

  it("names the role on both records", () => {
    const { incoming: i, outgoing: o } = pairAt(cut({ type: "push" }), 0.5);
    expect([i.role, o.role]).toEqual(["in", "out"]);
    expect([i.type, o.type]).toEqual(["push", "push"]);
  });
});

describe("resolveTransition — defaults and fallbacks", () => {
  it("auto-crossfades an overlap with no transition authored", () => {
    const clip = incoming();
    // The two overlap by 400ms, and the overlap is the whole cut.
    const pair = resolveTransition(clip, [outgoing, clip], at(0.5));
    expect(pair?.incoming.type).toBe("crossfade");
    expect(pair?.incoming.opacity).toBeCloseTo(0.5);
    expect(pair?.outgoingClip?.id).toBe("outgoing");
  });

  it("treats a zero-length transition as a hard cut", () => {
    const clip = incoming({ type: "push", durationMs: 0, direction: "left" });
    expect(resolveTransition(clip, [outgoing, clip], 900)).toBeNull();
  });

  it("reports no partner when nothing sits beneath the incoming clip", () => {
    const clip = incoming({ type: "push", durationMs: CUT_MS, direction: "left" });
    const pair = resolveTransition(clip, [clip], at(0.5));
    expect(pair?.outgoing).toBeUndefined();
    // The incoming half still runs: a push with nothing under it slides in.
    expect(pair?.incoming.offset?.x).toBeCloseTo(-0.5);
  });

  it("cross-fades a type this build cannot draw instead of throwing (I2)", () => {
    // No cast: the union carries a type from a newer build rather than
    // refusing it, which is what lets such a document parse at all (T11b).
    const flip: ClipTransition = { type: "flip", durationMs: CUT_MS };
    const clip = incoming(flip);
    const pair = resolveTransition(clip, [outgoing, clip], at(0.5));
    expect(pair?.incoming.type).toBe("crossfade");
    expect(pair?.incoming.opacity).toBeCloseTo(0.5);
  });

  it("runs a direction it cannot read toward the left edge (I2)", () => {
    const t = cut({ type: "push", direction: "diagonal" });
    expect(pairAt(t, 0.5).incoming.offset?.x).toBeCloseTo(-0.5);
  });

  it("eases the progress the whole cut is derived from", () => {
    const eased = cut({ type: "crossfade", easing: "easeOut" });
    const linear = cut({ type: "crossfade" });
    // easeOut is above the diagonal everywhere inside the window.
    expect(pairAt(eased, 0.5).incoming.opacity).toBeGreaterThan(
      pairAt(linear, 0.5).incoming.opacity
    );
    expect(pairAt(eased, 0).incoming.opacity).toBe(0);
  });

  it("falls back to linear on an easing it cannot parse (I2)", () => {
    const t = cut({ type: "crossfade", easing: "ease-out-ish" });
    expect(pairAt(t, 0.5).incoming.opacity).toBeCloseTo(0.5);
  });
});

describe("parseTransitionType / parseTransitionDirection", () => {
  it("narrows what this build draws and refuses the rest", () => {
    expect(parseTransitionType("zoom")).toBe("zoom");
    expect(parseTransitionType("flip")).toBeNull();
    expect(parseTransitionDirection("down")).toBe("down");
    expect(parseTransitionDirection("diagonal")).toBeNull();
  });
});

describe("transitionTransform", () => {
  const base = {
    position: { x: 10, y: 20 },
    scale: { x: 2, y: 2 },
    rotation: 0.5,
    anchor: { x: 0.5, y: 0.5 }
  };

  it("returns the layer's own transform when the cut moves nothing", () => {
    const record = pairAt(cut({ type: "crossfade" }), 0.5).incoming;
    expect(transitionTransform(base, record, 1920, 1080)).toBe(base);
    expect(transitionTransform(undefined, undefined, 1920, 1080)).toBeUndefined();
  });

  it("adds the offset in reference pixels and multiplies the scale", () => {
    const record = pairAt(cut({ type: "push", direction: "left" }), 0.5).incoming;
    const t = transitionTransform(base, record, 1920, 1080)!;
    expect(t.position.x).toBeCloseTo(10 - 960);
    expect(t.position.y).toBe(20);
    expect(t.scale).toEqual({ x: 2, y: 2 });
    expect(t.rotation).toBe(0.5);

    const zoomed = transitionTransform(
      base,
      pairAt(cut({ type: "zoom" }), 0.5).outgoing,
      1920,
      1080
    )!;
    expect(zoomed.scale.x).toBeCloseTo(2.25);
    expect(zoomed.scale.y).toBeCloseTo(2.25);
  });
});

describe("computeActiveLayers — transition on the layer", () => {
  const track: TimelineTrack = makeTrack({
    id: "track-1",
    type: "video",
    index: 0,
    visible: true
  });

  it("carries the complementary record on the clip beneath", () => {
    const clip = incoming(cut({ type: "push", direction: "left" }));
    const layers = computeActiveLayers(
      [track],
      [outgoing, clip],
      at(0.5),
      { canvas: { width: 1920, height: 1080 } }
    );
    const byId = new Map(layers.map((l) => [l.clipId, l]));
    expect(byId.get("incoming")?.transition?.role).toBe("in");
    expect(byId.get("outgoing")?.transition?.role).toBe("out");
    expect(byId.get("outgoing")?.transition?.type).toBe("push");
    expect(byId.get("outgoing")?.transition?.offset?.x).toBeCloseTo(0.5);
  });

  it("folds the cut's opacity into the layer's own", () => {
    const clip = incoming(cut({ type: "crossfade" }));
    clip.opacity = 0.5;
    const layers = computeActiveLayers([track], [outgoing, clip], at(0.5));
    const layer = layers.find((l) => l.clipId === "incoming");
    expect(layer?.opacity).toBeCloseTo(0.25);
  });

  it("leaves a hard cut with no record on either clip", () => {
    const clip = incoming({ type: "crossfade", durationMs: 0 });
    const layers = computeActiveLayers([track], [outgoing, clip], 900);
    for (const layer of layers) {
      expect(layer.transition).toBeUndefined();
      expect(layer.opacity).toBe(1);
    }
  });
});
