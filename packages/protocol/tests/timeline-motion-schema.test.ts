/**
 * Contract tests for the motion-graphics fields on the timeline schema
 * (`docs/plans/motion-graphics.md` § Document model).
 *
 * Two halves. The runtime half parses a clip carrying each new field and
 * asserts the parse hands it back — the Zod object strips what it does not
 * declare, so a missing field here is data loss on the next autosave, not an
 * error. The type half pins the shape `z.infer<typeof timelineClip>` produces
 * against the interface `packages/timeline/src/types.ts` declares, in both
 * directions, so a field that exists on one side only fails to compile.
 *
 * `packages/timeline` depends on this package, not the other way round, so the
 * mirror below is written out rather than imported; the check against the real
 * `TimelineClip` runs in `packages/execution/tests/timeline-schema-roundtrip.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  timelineClip,
  type TimelineClip,
  type ClipEffect,
  type ClipTransition,
  type KnownClipEffect,
  type KnownClipTransition,
  type ShapeFill,
  type UnknownClipEffect,
  type UnknownClipTransition
} from "../src/api-schemas/timeline.js";

const baseClip = {
  id: "c1",
  trackId: "t1",
  name: "Clip",
  startMs: 0,
  durationMs: 1000,
  mediaType: "video" as const,
  sourceType: "imported" as const,
  status: "generated" as const,
  locked: false,
  versions: []
};

// ── Type mirror ──────────────────────────────────────────────────────────────

type Extends<A, B> = A extends B ? true : false;
/** `true` only when each side is assignable to the other. */
type MutuallyAssignable<A, B> = Extends<A, B> & Extends<B, A>;

/** The motion-graphics half of `TimelineClip` as `types.ts` declares it. */
interface MotionClipFields {
  mediaType:
    | "image"
    | "video"
    | "audio"
    | "overlay"
    | "text"
    | "shape"
    | "group";
  parentId?: string;
  mask?: {
    kind: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    d?: string;
    featherPx?: number;
    invert?: boolean;
  };
  matte?: { sourceClipId: string; mode: string; invert?: boolean };
  timeRemap?: {
    keyframes: { t: number; sourceMs: number; easing?: string }[];
  };
  compositionId?: string;
  compositionParams?: Record<string, number | string | boolean>;
}

const motionFieldMirror: MutuallyAssignable<
  Pick<TimelineClip, keyof MotionClipFields>,
  MotionClipFields
> = true;

type MotionShapeFill =
  | { type: "solid"; color: string }
  | {
      type: "linear";
      angle: number;
      stops: { offset: number; color: string }[];
    }
  | { type: "radial"; stops: { offset: number; color: string }[] };

const shapeFillMirror: MutuallyAssignable<ShapeFill, MotionShapeFill> = true;

/**
 * Every transition type the design names, and no other — asserted against the
 * *known* half. The union itself is open by I2, so asserting on
 * `ClipTransition["type"]` would only say `string` and pin nothing.
 */
const transitionTypeMirror: MutuallyAssignable<
  KnownClipTransition["type"],
  "crossfade" | "dipToColor" | "wipe" | "push" | "slide" | "zoom"
> = true;

/** Every clip effect type the design names, and no other. */
const effectTypeMirror: MutuallyAssignable<
  KnownClipEffect["type"],
  | "color"
  | "blur"
  | "glow"
  | "dropShadow"
  | "vignette"
  | "sharpen"
  | "chromaKey"
  | "curves"
  | "levels"
  | "liftGammaGain"
> = true;

/**
 * And the door I2 requires: each union is its named members plus one catch-all
 * carrying the shared shape and whatever else the authoring build wrote.
 */
const openTransitionMirror: MutuallyAssignable<
  ClipTransition,
  KnownClipTransition | UnknownClipTransition
> = true;
const openEffectMirror: MutuallyAssignable<
  ClipEffect,
  KnownClipEffect | UnknownClipEffect
> = true;

/** The catch-alls as `packages/timeline/src/types.ts` declares them. */
interface MotionUnknownTransition {
  type: string;
  durationMs: number;
  easing?: string;
  [key: string]: unknown;
}
interface MotionUnknownEffect {
  id: string;
  type: string;
  enabled: boolean;
  [key: string]: unknown;
}
const unknownTransitionMirror: MutuallyAssignable<
  UnknownClipTransition,
  MotionUnknownTransition
> = true;
const unknownEffectMirror: MutuallyAssignable<
  UnknownClipEffect,
  MotionUnknownEffect
> = true;

describe("timelineClip — motion-graphics field types", () => {
  it("mirrors the TypeScript declaration in both directions", () => {
    // Each constant is typed `true & true` only while both directions hold, so
    // this file stops compiling when the two sides drift. Asserting them keeps
    // a reader from deleting them as unused.
    expect([
      motionFieldMirror,
      shapeFillMirror,
      transitionTypeMirror,
      effectTypeMirror,
      openTransitionMirror,
      openEffectMirror,
      unknownTransitionMirror,
      unknownEffectMirror
    ]).toEqual([true, true, true, true, true, true, true, true]);
  });
});

/**
 * I2, forward compatibility by string: a `type` this build does not declare
 * parses and carries its own parameters, and the permissive branch that lets
 * it through is unreachable for a type this build *does* declare — so the
 * strict half stays exactly as strict.
 */
describe("timelineClip — a type from a newer build", () => {
  it("parses a transition type this build cannot draw, parameters intact", () => {
    const transitionIn = {
      type: "futureWipe3D",
      durationMs: 500,
      easing: "easeOut",
      axis: "z",
      bend: { degrees: 45 }
    };
    const parsed = timelineClip.parse({ ...baseClip, transitionIn });
    expect(parsed.transitionIn).toEqual(transitionIn);
  });

  it("parses an effect type this build cannot apply, parameters intact", () => {
    const effects = [
      { id: "e1", type: "filmGrain", enabled: true, size: 2, strength: 0.4 }
    ];
    const parsed = timelineClip.parse({ ...baseClip, effects });
    expect(parsed.effects).toEqual(effects);
  });

  it("parses a shape kind this build cannot draw, geometry intact", () => {
    const shapeStyle = {
      kind: "arrow",
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.3,
      fill: "#ff0000",
      strokeWidthPx: 2
    };
    const parsed = timelineClip.parse({
      ...baseClip,
      mediaType: "shape" as const,
      shapeStyle
    });
    expect(parsed.shapeStyle).toEqual(shapeStyle);
  });

  it("still validates a known transition type field by field", () => {
    const parsed = timelineClip.safeParse({
      ...baseClip,
      transitionIn: { type: "crossfade", durationMs: "300" }
    });
    expect(parsed.success).toBe(false);
    // The permissive branch refuses every type the strict members claim, so a
    // bad `crossfade` cannot slide into it and be accepted.
    expect(JSON.stringify(parsed.error?.issues)).toContain("durationMs");
  });

  it("still validates a known effect type field by field", () => {
    const parsed = timelineClip.safeParse({
      ...baseClip,
      effects: [{ id: "e1", type: "blur", enabled: true, radius: "8" }]
    });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("radius");
  });

  it("still requires the shape every transition and effect shares", () => {
    expect(
      timelineClip.safeParse({
        ...baseClip,
        transitionIn: { type: "futureWipe3D" }
      }).success
    ).toBe(false);
    expect(
      timelineClip.safeParse({
        ...baseClip,
        effects: [{ type: "filmGrain", enabled: true }]
      }).success
    ).toBe(false);
  });
});

describe("timelineClip — motion-graphics round trips", () => {
  it("accepts a group clip", () => {
    const parsed = timelineClip.parse({ ...baseClip, mediaType: "group" });
    expect(parsed.mediaType).toBe("group");
  });

  it("preserves parenting, mask, matte, remap and composition provenance", () => {
    const clip = {
      ...baseClip,
      parentId: "group-1",
      mask: {
        kind: "ellipse",
        x: 0.1,
        y: 0.1,
        width: 0.8,
        height: 0.8,
        d: "M0 0 L1 1 Z",
        featherPx: 8,
        invert: true
      },
      matte: { sourceClipId: "src-1", mode: "alpha", invert: false },
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 2000, easing: "spring(180,12,1)" }
        ]
      },
      compositionId: "comp-1",
      compositionParams: { title: "Ada", lines: 2, boxed: true }
    };
    expect(timelineClip.parse(clip)).toEqual(clip);
  });

  it("preserves every transition type", () => {
    const transitions: ClipTransition[] = [
      { type: "crossfade", durationMs: 300, easing: "easeInOut" },
      { type: "dipToColor", durationMs: 300, color: "#000000" },
      { type: "wipe", durationMs: 300, direction: "left", softness: 0.2 },
      { type: "push", durationMs: 300, direction: "up" },
      { type: "slide", durationMs: 300, direction: "right" },
      { type: "zoom", durationMs: 300, easing: "easeOutBack" }
    ];
    for (const transitionIn of transitions) {
      const parsed = timelineClip.parse({ ...baseClip, transitionIn });
      expect(parsed.transitionIn).toEqual(transitionIn);
    }
  });

  it("preserves every new clip effect", () => {
    const effects: ClipEffect[] = [
      { id: "e1", type: "glow", enabled: true, radius: 8, intensity: 0.5, color: "#fff" },
      {
        id: "e2",
        type: "dropShadow",
        enabled: true,
        offsetX: 4,
        offsetY: 4,
        blur: 6,
        color: "#000",
        opacity: 0.5
      },
      { id: "e3", type: "vignette", enabled: true, amount: 0.3, softness: 0.5 },
      { id: "e4", type: "sharpen", enabled: true, amount: 0.4, radius: 2 },
      {
        id: "e5",
        type: "chromaKey",
        enabled: true,
        color: "#00ff00",
        tolerance: 0.2,
        softness: 0.1,
        spill: 0.4
      },
      {
        id: "e6",
        type: "curves",
        enabled: true,
        master: [
          { x: 0, y: 0 },
          { x: 1, y: 1 }
        ],
        r: [{ x: 0.5, y: 0.6 }]
      },
      {
        id: "e7",
        type: "levels",
        enabled: true,
        inBlack: 0.05,
        inWhite: 0.95,
        gamma: 1.1,
        outBlack: 0,
        outWhite: 1
      },
      {
        id: "e8",
        type: "liftGammaGain",
        enabled: true,
        lift: [0, 0, 0],
        gamma: [1, 1, 1],
        gain: [1, 1, 1]
      }
    ];
    const parsed = timelineClip.parse({ ...baseClip, effects });
    expect(parsed.effects).toEqual(effects);
  });

  it("preserves the text style additions", () => {
    const textStyle = {
      text: "Title",
      fontSizePx: 96,
      color: "#ffffff",
      fontStyle: "italic",
      letterSpacingPx: 2,
      lineHeight: 1.3,
      verticalAlign: "bottom",
      stroke: { color: "#000000", widthPx: 3 },
      shadow: { color: "#000000", blurPx: 6, offsetX: 2, offsetY: 2 },
      background: { color: "#000000", paddingPx: 12, radiusPx: 4 },
      fill: {
        type: "linear" as const,
        angle: 90,
        stops: [
          { offset: 0, color: "#fff" },
          { offset: 1, color: "#000" }
        ]
      }
    };
    const parsed = timelineClip.parse({
      ...baseClip,
      mediaType: "text" as const,
      textStyle
    });
    expect(parsed.textStyle).toEqual(textStyle);
  });

  it("preserves the shape style additions", () => {
    const shapeStyle = {
      kind: "star" as const,
      d: "M0 0 L1 1 Z",
      sides: 5,
      innerRadius: 0.5,
      cornerRadius: 0.02,
      fillStyle: {
        type: "radial" as const,
        stops: [
          { offset: 0, color: "#fff" },
          { offset: 1, color: "#000" }
        ]
      },
      dash: [0.02, 0.01],
      lineCap: "round",
      lineJoin: "miter",
      trimStart: 0.2,
      trimEnd: 0.9
    };
    const parsed = timelineClip.parse({
      ...baseClip,
      mediaType: "shape" as const,
      shapeStyle
    });
    expect(parsed.shapeStyle).toEqual(shapeStyle);
  });

  it("preserves caption word classification and caption style (F16)", () => {
    const caption = {
      words: [
        { word: "um", startMs: 0, endMs: 120, kind: "filler" as const, confidence: 0.3 },
        { word: "go", startMs: 120, endMs: 400, kind: "word" as const, confidence: 0.99 }
      ],
      style: {
        fontFamily: "Inter",
        fontSizeFrac: 0.06,
        color: "#ffffff",
        activeColor: "#ffd60a",
        outline: { color: "#000000", widthPx: 2 },
        bottomMarginFrac: 0.05,
        background: { color: "#000000", paddingPx: 10, radiusPx: 4 }
      }
    };
    const parsed = timelineClip.parse({ ...baseClip, caption });
    expect(parsed.caption).toEqual(caption);
  });
});
