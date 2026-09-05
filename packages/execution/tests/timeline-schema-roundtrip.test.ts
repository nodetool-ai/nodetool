/**
 * Schema mirror (I1): every field on `TimelineClip` and its children exists in
 * both `packages/timeline/src/types.ts` and the Zod schema in
 * `packages/protocol/src/api-schemas/timeline.ts`. A field missing from the Zod
 * side is not an error — it is silent data loss on the next autosave, which is
 * exactly what `field_stripped` reports.
 *
 * The fixture below is one document that sets every field the motion-graphics
 * document model adds. `NEW_FIELD_PATHS` names them, and the first test asserts
 * the fixture really carries each one, so a field added to the design without a
 * fixture value cannot pass by not being exercised.
 */
import { describe, expect, it } from "vitest";

import {
  timelineDocument,
  type CaptionStyle as WireCaptionStyle,
  type CaptionWord as WireCaptionWord,
  type ClipAnimation as WireAnimation,
  type ClipCaption as WireCaption,
  type ClipMask as WireMask,
  type ClipMatte as WireMatte,
  type ClipShapeStyle as WireShapeStyle,
  type ClipTextStyle as WireTextStyle,
  type ClipTimeRemap as WireTimeRemap,
  type ClipTransform as WireTransform,
  type ClipVersion as WireVersion,
  type CustomClipAnimation as WireCustomAnimation,
  type ShapeFill as WireShapeFill,
  type TimelineClip as WireClip,
  type TimelineDocument as WireDocument,
  type TimelineMarker as WireMarker,
  type TimelineSequenceResponse as WireSequence,
  type TimelineTrack as WireTrack,
  type TrackEffect as WireTrackEffect,
  type TranscriptLine as WireTranscriptLine,
  type KnownClipEffect as WireKnownEffect,
  type KnownClipTransition as WireKnownTransition,
  type UnknownClipEffect as WireUnknownEffect,
  type UnknownClipTransition as WireUnknownTransition
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type {
  AnimationStagger as ModelStagger,
  CaptionStyle as ModelCaptionStyle,
  CaptionWord as ModelCaptionWord,
  ClipAnimation as ModelAnimation,
  ClipCaption as ModelCaption,
  ClipMask as ModelMask,
  ClipMatte as ModelMatte,
  ClipShapeStyle as ModelShapeStyle,
  ClipTextStyle as ModelTextStyle,
  ClipTimeRemap as ModelTimeRemap,
  ClipTransform as ModelTransform,
  ClipVersion as ModelVersion,
  CustomClipAnimation as ModelCustomAnimation,
  ShapeFill as ModelShapeFill,
  TimelineClip as ModelClip,
  TimelineMarker as ModelMarker,
  TimelineSequence as ModelSequence,
  TimelineTrack as ModelTrack,
  TrackEffect as ModelTrackEffect,
  TranscriptLine as ModelTranscriptLine,
  ClipEffect as ModelClipEffect,
  ClipTransition as ModelClipTransition,
  KnownClipEffect as ModelKnownEffect,
  KnownClipTransition as ModelKnownTransition,
  UnknownClipEffect as ModelUnknownEffect,
  UnknownClipTransition as ModelUnknownTransition
} from "@nodetool-ai/timeline";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

// ── Type mirror (I1) ─────────────────────────────────────────────────────────
// `packages/protocol` cannot import `@nodetool-ai/timeline` (the dependency runs
// the other way), so the mirror lives here, in the one package that holds both.
//
// `SameKeys` is the guard. It names every key one side declares and the other
// does not, PLUS every shared key whose value types drifted. The key half is
// what a whole-object `MutuallyAssignable` cannot see: an OPTIONAL field added
// to the model and never mirrored — the class that lost `aspectRatio` and
// `resolution` — because `{ id: string; aspectRatio?: string }` and
// `{ id: string }` are mutually assignable. The value half is what a key diff
// alone cannot see. A whole-clip `MutuallyAssignable` is therefore redundant
// and misleading, and is gone; the remaining `MutuallyAssignable` constants
// stand over unions, where `keyof` says nothing useful.
//
// Both are compile-time only — Vitest strips types and never typechecks — so
// they fail through `npm run lint --workspace=packages/execution`, which runs
// `tsconfig.tests.json` over this file.
type Extends<A, B> = A extends B ? true : false;
/** `true` only when each side is assignable to the other. */
type MutuallyAssignable<A, B> = Extends<A, B> & Extends<B, A>;

/** Every key one of the two objects declares and the other does not. */
type KeyDiff<A, B> = Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>;

/** Every key both declare whose value types are not mutually assignable. */
type ValueDiff<A, B> = {
  [K in keyof A & keyof B]-?: MutuallyAssignable<A[K], B[K]> extends true
    ? never
    : K;
}[keyof A & keyof B];

/**
 * `{}` satisfies this only while both diffs are `never`. One unmirrored key,
 * or one shared key whose types drifted, turns it into a required property, so
 * `const x: SameKeys<A, B> = {}` stops compiling and names the key.
 */
type SameKeys<A, B> = Record<KeyDiff<A, B> | ValueDiff<A, B>, never>;

/**
 * The same, per member of a discriminated union. A union's `keyof` is the
 * INTERSECTION of its members' keys, so a plain `SameKeys` over
 * `KnownClipTransition` would ignore every field that is not on all six cuts.
 * This names a variant one side does not carry, plus the key diff of each
 * variant both sides do.
 */
type VariantKeyDiff<A extends { type: string }, B extends { type: string }> =
  | Exclude<A["type"], B["type"]>
  | Exclude<B["type"], A["type"]>
  | {
      [K in A["type"] & B["type"]]: KeyDiff<
        Extract<A, { type: K }>,
        Extract<B, { type: K }>
      >;
    }[A["type"] & B["type"]];
type SameVariantKeys<
  A extends { type: string },
  B extends { type: string }
> = Record<VariantKeyDiff<A, B>, never>;

/** The document half of the model's `TimelineSequence` — what a save writes. */
type ModelDocument = Pick<
  ModelSequence,
  "tracks" | "clips" | "markers" | "transcript" | "scriptEnabled"
>;

/** Unwrap an optional property so its own key set can be compared. */
type Prop<T, K extends keyof T> = NonNullable<T[K]>;

const clipKeys: SameKeys<ModelClip, WireClip> = {};
const trackKeys: SameKeys<ModelTrack, WireTrack> = {};
const documentKeys: SameKeys<ModelDocument, WireDocument> = {};
const sequenceKeys: SameKeys<ModelSequence, WireSequence> = {};
const markerKeys: SameKeys<ModelMarker, WireMarker> = {};
const versionKeys: SameKeys<ModelVersion, WireVersion> = {};
const transcriptLineKeys: SameKeys<
  ModelTranscriptLine,
  WireTranscriptLine
> = {};
const transformKeys: SameKeys<ModelTransform, WireTransform> = {};
const maskKeys: SameKeys<ModelMask, WireMask> = {};
const matteKeys: SameKeys<ModelMatte, WireMatte> = {};
const timeRemapKeys: SameKeys<ModelTimeRemap, WireTimeRemap> = {};
const timeRemapKeyframeKeys: SameKeys<
  ModelTimeRemap["keyframes"][number],
  WireTimeRemap["keyframes"][number]
> = {};
const captionKeys: SameKeys<ModelCaption, WireCaption> = {};
const captionWordKeys: SameKeys<ModelCaptionWord, WireCaptionWord> = {};
const captionStyleKeys: SameKeys<ModelCaptionStyle, WireCaptionStyle> = {};
const captionOutlineKeys: SameKeys<
  Prop<ModelCaptionStyle, "outline">,
  Prop<WireCaptionStyle, "outline">
> = {};
const captionBackgroundKeys: SameKeys<
  Prop<ModelCaptionStyle, "background">,
  Prop<WireCaptionStyle, "background">
> = {};
const textStyleKeys: SameKeys<ModelTextStyle, WireTextStyle> = {};
const textStrokeKeys: SameKeys<
  Prop<ModelTextStyle, "stroke">,
  Prop<WireTextStyle, "stroke">
> = {};
const textShadowKeys: SameKeys<
  Prop<ModelTextStyle, "shadow">,
  Prop<WireTextStyle, "shadow">
> = {};
const textBackgroundKeys: SameKeys<
  Prop<ModelTextStyle, "background">,
  Prop<WireTextStyle, "background">
> = {};
const shapeStyleKeys: SameKeys<ModelShapeStyle, WireShapeStyle> = {};
const animationKeys: SameKeys<ModelAnimation, WireAnimation> = {};
const staggerKeys: SameKeys<ModelStagger, Prop<WireAnimation, "stagger">> = {};
const customAnimationKeys: SameKeys<
  ModelCustomAnimation,
  WireCustomAnimation
> = {};
const customCurveKeys: SameKeys<
  ModelCustomAnimation["curves"][number],
  WireCustomAnimation["curves"][number]
> = {};
const customKeyframeKeys: SameKeys<
  ModelCustomAnimation["curves"][number]["keyframes"][number],
  WireCustomAnimation["curves"][number]["keyframes"][number]
> = {};
const customMaskKeys: SameKeys<
  Prop<ModelCustomAnimation, "mask">,
  Prop<WireCustomAnimation, "mask">
> = {};
const shapeFillKeys: SameVariantKeys<ModelShapeFill, WireShapeFill> = {};
const trackEffectKeys: SameVariantKeys<ModelTrackEffect, WireTrackEffect> = {};
const knownTransitionKeys: SameVariantKeys<
  ModelKnownTransition,
  WireKnownTransition
> = {};
const knownEffectKeys: SameVariantKeys<ModelKnownEffect, WireKnownEffect> = {};

/**
 * The two catch-alls carry `[key: string]: unknown`, so `keyof` is `string`
 * on both sides and a key diff over them is vacuously empty. They stay on
 * `MutuallyAssignable` below, which does say something about them.
 */
const MIRRORED_KEY_SETS = [
  clipKeys,
  trackKeys,
  documentKeys,
  sequenceKeys,
  markerKeys,
  versionKeys,
  transcriptLineKeys,
  transformKeys,
  maskKeys,
  matteKeys,
  timeRemapKeys,
  timeRemapKeyframeKeys,
  captionKeys,
  captionWordKeys,
  captionStyleKeys,
  captionOutlineKeys,
  captionBackgroundKeys,
  textStyleKeys,
  textStrokeKeys,
  textShadowKeys,
  textBackgroundKeys,
  shapeStyleKeys,
  animationKeys,
  staggerKeys,
  customAnimationKeys,
  customCurveKeys,
  customKeyframeKeys,
  customMaskKeys,
  shapeFillKeys,
  trackEffectKeys,
  knownTransitionKeys,
  knownEffectKeys
];

/** The fields this schema landing adds, plus the two it widened. */
type MotionFieldKeys =
  | "mediaType"
  | "parentId"
  | "mask"
  | "matte"
  | "timeRemap"
  | "compositionId"
  | "compositionParams"
  | "transitionIn"
  | "effects"
  | "textStyle"
  | "shapeStyle"
  | "caption";

const motionFieldMirror: MutuallyAssignable<
  Pick<WireClip, MotionFieldKeys>,
  Pick<ModelClip, MotionFieldKeys>
> = true;
const effectMirror: MutuallyAssignable<
  NonNullable<WireClip["effects"]>[number],
  ModelClipEffect
> = true;
const transitionMirror: MutuallyAssignable<
  NonNullable<WireClip["transitionIn"]>,
  ModelClipTransition
> = true;
// Both unions are open by I2, so the two above would still hold with a known
// member deleted — the catch-all absorbs it. These pin the halves separately:
// the named members field by field, and the catch-all's own shared shape.
const knownEffectMirror: MutuallyAssignable<WireKnownEffect, ModelKnownEffect> =
  true;
const knownTransitionMirror: MutuallyAssignable<
  WireKnownTransition,
  ModelKnownTransition
> = true;
const unknownEffectMirror: MutuallyAssignable<
  WireUnknownEffect,
  ModelUnknownEffect
> = true;
const unknownTransitionMirror: MutuallyAssignable<
  WireUnknownTransition,
  ModelUnknownTransition
> = true;

const clip = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  trackId: "track-1",
  name: "Clip",
  durationMs: 1000,
  mediaType: "video",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...overrides
});

const solidFill = { type: "solid", color: "#101010" };
const linearFill = {
  type: "linear",
  angle: 45,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 1, color: "#0000ff" }
  ]
};
const radialFill = {
  type: "radial",
  stops: [
    { offset: 0, color: "#ffffff" },
    { offset: 1, color: "#000000" }
  ]
};

/** One document carrying every field the motion-graphics model adds. */
function motionDocument(): Record<string, unknown> {
  return {
    tracks: [
      {
        id: "track-1",
        name: "Video 1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    markers: [],
    clips: [
      clip({ id: "group-1", startMs: 0, mediaType: "group", name: "Rig" }),
      clip({
        id: "child-1",
        startMs: 1000,
        parentId: "group-1",
        mask: {
          kind: "path",
          x: 0.1,
          y: 0.2,
          width: 0.6,
          height: 0.5,
          d: "M0 0 L1 0 L1 1 Z",
          featherPx: 12,
          invert: true
        },
        matte: { sourceClipId: "matte-src", mode: "luma", invert: true },
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 1, sourceMs: 500, easing: "cubic-bezier(0.42,0,0.58,1)" }
          ]
        },
        compositionId: "comp-lower-third",
        compositionParams: { title: "Ada", lines: 2, boxed: true },
        aspectRatio: "16:9",
        resolution: "720p"
      }),
      clip({ id: "matte-src", startMs: 2000, mediaType: "shape" }),
      clip({
        id: "text-1",
        startMs: 3000,
        mediaType: "text",
        textStyle: {
          text: "Title",
          fontSizePx: 96,
          color: "#ffffff",
          fontStyle: "italic",
          letterSpacingPx: 4,
          lineHeight: 1.4,
          verticalAlign: "top",
          stroke: { color: "#000000", widthPx: 3 },
          shadow: {
            color: "#00000080",
            blurPx: 8,
            offsetX: 2,
            offsetY: 4
          },
          background: { color: "#000000", paddingPx: 16, radiusPx: 8 },
          fill: linearFill
        },
        caption: {
          words: [
            { word: "um", startMs: 0, endMs: 200, kind: "filler", confidence: 0.4 },
            { word: "hello", startMs: 200, endMs: 700, kind: "word", confidence: 0.98 }
          ],
          style: {
            fontFamily: "Bebas Neue",
            fontSizeFrac: 0.07,
            color: "#eeeeee",
            activeColor: "#ffd60a",
            outline: { color: "#000000", widthPx: 2 },
            bottomMarginFrac: 0.08,
            background: { color: "#00000099", paddingPx: 12, radiusPx: 6 }
          }
        }
      }),
      clip({
        id: "shape-1",
        startMs: 4000,
        mediaType: "shape",
        shapeStyle: {
          kind: "star",
          d: "M0 0 C0.5 0 0.5 1 1 1 Z",
          sides: 5,
          innerRadius: 0.4,
          cornerRadius: 0.05,
          fillStyle: radialFill,
          dash: [0.02, 0.01],
          lineCap: "round",
          lineJoin: "bevel",
          trimStart: 0.1,
          trimEnd: 0.8
        }
      }),
      clip({
        id: "shape-2",
        startMs: 5000,
        mediaType: "shape",
        shapeStyle: { kind: "polygon", sides: 6, fillStyle: solidFill }
      }),
      clip({
        id: "fx-1",
        startMs: 6000,
        effects: [
          { id: "e-glow", type: "glow", enabled: true, radius: 12, intensity: 0.8, color: "#ffeecc" },
          {
            id: "e-shadow",
            type: "dropShadow",
            enabled: true,
            offsetX: 6,
            offsetY: 8,
            blur: 10,
            color: "#000000",
            opacity: 0.6
          },
          { id: "e-vig", type: "vignette", enabled: true, amount: 0.4, softness: 0.6 },
          { id: "e-sharp", type: "sharpen", enabled: true, amount: 0.5, radius: 2 },
          {
            id: "e-key",
            type: "chromaKey",
            enabled: true,
            color: "#00ff00",
            tolerance: 0.2,
            softness: 0.1,
            spill: 0.5
          },
          {
            id: "e-curves",
            type: "curves",
            enabled: true,
            master: [
              { x: 0, y: 0 },
              { x: 1, y: 1 }
            ],
            r: [{ x: 0.5, y: 0.6 }],
            g: [{ x: 0.5, y: 0.5 }],
            b: [{ x: 0.5, y: 0.4 }]
          },
          {
            id: "e-levels",
            type: "levels",
            enabled: true,
            inBlack: 0.05,
            inWhite: 0.95,
            gamma: 1.2,
            outBlack: 0,
            outWhite: 1
          },
          {
            id: "e-lgg",
            type: "liftGammaGain",
            enabled: true,
            lift: [0.01, 0.02, 0.03],
            gamma: [1, 1.1, 0.9],
            gain: [1.05, 1, 0.95]
          }
        ]
      }),
      clip({
        id: "tr-crossfade",
        startMs: 7000,
        transitionIn: { type: "crossfade", durationMs: 300, easing: "easeInOut" }
      }),
      clip({
        id: "tr-dip",
        startMs: 8000,
        transitionIn: {
          type: "dipToColor",
          durationMs: 400,
          color: "#000000",
          easing: "linear"
        }
      }),
      clip({
        id: "tr-wipe",
        startMs: 9000,
        transitionIn: {
          type: "wipe",
          durationMs: 500,
          direction: "left",
          softness: 0.2,
          easing: "easeOut"
        }
      }),
      clip({
        id: "tr-push",
        startMs: 10000,
        transitionIn: {
          type: "push",
          durationMs: 250,
          direction: "up",
          easing: "spring(180,12,1)"
        }
      }),
      clip({
        id: "tr-slide",
        startMs: 11000,
        transitionIn: {
          type: "slide",
          durationMs: 250,
          direction: "right",
          easing: "easeIn"
        }
      }),
      clip({
        id: "tr-zoom",
        startMs: 12000,
        transitionIn: { type: "zoom", durationMs: 250, easing: "easeOutBack" }
      })
    ]
  };
}

/**
 * Every path the motion-graphics document model adds, in the shape
 * `field_stripped` reports (`clips[*].mask.featherPx`). The fixture must set
 * every one of them.
 */
const NEW_FIELD_PATHS = [
  "clips[*].aspectRatio",
  "clips[*].resolution",
  "clips[*].parentId",
  "clips[*].mask.kind",
  "clips[*].mask.x",
  "clips[*].mask.y",
  "clips[*].mask.width",
  "clips[*].mask.height",
  "clips[*].mask.d",
  "clips[*].mask.featherPx",
  "clips[*].mask.invert",
  "clips[*].matte.sourceClipId",
  "clips[*].matte.mode",
  "clips[*].matte.invert",
  "clips[*].timeRemap.keyframes[*].t",
  "clips[*].timeRemap.keyframes[*].sourceMs",
  "clips[*].timeRemap.keyframes[*].easing",
  "clips[*].compositionId",
  "clips[*].compositionParams.title",
  "clips[*].transitionIn.easing",
  "clips[*].transitionIn.color",
  "clips[*].transitionIn.direction",
  "clips[*].transitionIn.softness",
  "clips[*].effects[*].intensity",
  "clips[*].effects[*].offsetX",
  "clips[*].effects[*].offsetY",
  "clips[*].effects[*].blur",
  "clips[*].effects[*].opacity",
  "clips[*].effects[*].amount",
  "clips[*].effects[*].softness",
  "clips[*].effects[*].tolerance",
  "clips[*].effects[*].spill",
  "clips[*].effects[*].master[*].x",
  "clips[*].effects[*].master[*].y",
  "clips[*].effects[*].r[*].x",
  "clips[*].effects[*].g[*].x",
  "clips[*].effects[*].b[*].x",
  "clips[*].effects[*].inBlack",
  "clips[*].effects[*].inWhite",
  "clips[*].effects[*].gamma",
  "clips[*].effects[*].outBlack",
  "clips[*].effects[*].outWhite",
  "clips[*].effects[*].lift[*]",
  "clips[*].effects[*].gain[*]",
  "clips[*].textStyle.fontStyle",
  "clips[*].textStyle.letterSpacingPx",
  "clips[*].textStyle.lineHeight",
  "clips[*].textStyle.verticalAlign",
  "clips[*].textStyle.stroke.color",
  "clips[*].textStyle.stroke.widthPx",
  "clips[*].textStyle.shadow.color",
  "clips[*].textStyle.shadow.blurPx",
  "clips[*].textStyle.shadow.offsetX",
  "clips[*].textStyle.shadow.offsetY",
  "clips[*].textStyle.background.color",
  "clips[*].textStyle.background.paddingPx",
  "clips[*].textStyle.background.radiusPx",
  "clips[*].textStyle.fill.type",
  "clips[*].textStyle.fill.angle",
  "clips[*].textStyle.fill.stops[*].offset",
  "clips[*].textStyle.fill.stops[*].color",
  "clips[*].shapeStyle.d",
  "clips[*].shapeStyle.sides",
  "clips[*].shapeStyle.innerRadius",
  "clips[*].shapeStyle.cornerRadius",
  "clips[*].shapeStyle.fillStyle.type",
  "clips[*].shapeStyle.fillStyle.stops[*].offset",
  "clips[*].shapeStyle.fillStyle.color",
  "clips[*].shapeStyle.dash[*]",
  "clips[*].shapeStyle.lineCap",
  "clips[*].shapeStyle.lineJoin",
  "clips[*].shapeStyle.trimStart",
  "clips[*].shapeStyle.trimEnd",
  "clips[*].caption.style.fontFamily",
  "clips[*].caption.style.fontSizeFrac",
  "clips[*].caption.style.color",
  "clips[*].caption.style.activeColor",
  "clips[*].caption.style.outline.color",
  "clips[*].caption.style.outline.widthPx",
  "clips[*].caption.style.bottomMarginFrac",
  "clips[*].caption.style.background.color",
  "clips[*].caption.style.background.paddingPx",
  "clips[*].caption.style.background.radiusPx",
  "clips[*].caption.words[*].kind",
  "clips[*].caption.words[*].confidence"
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Collect every path the document carries, in `field_stripped`'s shape. */
function collectPaths(value: unknown, path: string, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      const childPath = `${path}[*]`;
      found.add(childPath);
      collectPaths(item, childPath, found);
    }
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    const childPath = path ? `${path}.${key}` : key;
    found.add(childPath);
    collectPaths(child, childPath, found);
  }
}

const strippedPaths = (raw: unknown): string[] =>
  validateTimelineSequence(raw)
    .warnings.filter((issue) => issue.code === "field_stripped")
    .map((issue) => issue.path ?? "");

describe("timeline schema round trip — motion-graphics fields", () => {
  it("the fixture sets every field the document model adds", () => {
    const present = new Set<string>();
    collectPaths(motionDocument(), "", present);
    const missing = NEW_FIELD_PATHS.filter((path) => !present.has(path));
    expect(missing).toEqual([]);
  });

  it("parses without a schema error", () => {
    const parsed = timelineDocument.safeParse(motionDocument());
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it("strips nothing, and reports no other issue", () => {
    const result = validateTimelineSequence(motionDocument());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("survives a parse round trip unchanged", () => {
    const raw = motionDocument();
    expect(timelineDocument.parse(raw)).toEqual(raw);
  });

  // I12: a check that has only ever been green is indistinguishable from one
  // that examines nothing. These feed fields the schema does not carry, at the
  // three depths the new fields live at, and the detector must name each one.
  it("reports a stripped field on the clip", () => {
    const doc = motionDocument();
    const clips = doc.clips as Record<string, unknown>[];
    clips[0].notAClipField = "lost on the next save";
    expect(strippedPaths(doc)).toEqual(["clips[*].notAClipField"]);
  });

  it("reports a stripped field inside a new nested object", () => {
    const doc = motionDocument();
    const clips = doc.clips as Record<string, unknown>[];
    (clips[1].mask as Record<string, unknown>).notAMaskField = 1;
    expect(strippedPaths(doc)).toEqual(["clips[*].mask.notAMaskField"]);
  });

  it("reports a stripped field inside a widened style object", () => {
    const doc = motionDocument();
    const clips = doc.clips as Record<string, unknown>[];
    (clips[3].textStyle as Record<string, unknown>).notATextField = true;
    expect(strippedPaths(doc)).toEqual(["clips[*].textStyle.notATextField"]);
  });

  it("mirrors every document object's key set (I1)", () => {
    // The constants are the assertion: each is `Record<never, never>` only
    // while the two sides declare the same keys, so `{}` stops compiling the
    // moment one drifts. Reading them here keeps `noUnusedLocals` — and a
    // reader tidying unused bindings — from deleting the guard.
    expect(
      MIRRORED_KEY_SETS.filter((set) => Object.keys(set).length > 0)
    ).toEqual([]);
  });

  it("keeps the wire and model clip types mutually assignable", () => {
    // The three constants above are compile-time assertions: each is typed
    // `true & true` only while both directions hold, so a field on one side
    // only stops this file compiling. Asserting them here keeps a reader from
    // deleting them as unused.
    expect([
      motionFieldMirror,
      effectMirror,
      transitionMirror,
      knownEffectMirror,
      knownTransitionMirror,
      unknownEffectMirror,
      unknownTransitionMirror
    ]).toEqual([true, true, true, true, true, true, true]);
  });
});

/**
 * I2, forward compatibility by string. A `transitionIn.type` or an
 * `effects[].type` this build does not know reaches the document as a plain
 * string: the parse carries it, the round trip keeps whatever parameters came
 * with it, and the validator warns instead of failing the whole document.
 *
 * Before this, both were closed discriminated unions, so one unknown type
 * failed the parse and every check below it was skipped — reported as
 * `schema_invalid`, which says a shape is wrong and not which cut the newer
 * build asked for.
 */
function newerBuildDocument(): Record<string, unknown> {
  return {
    tracks: [
      {
        id: "track-1",
        name: "Video 1",
        type: "video",
        index: 0,
        visible: true,
        locked: false
      }
    ],
    markers: [],
    clips: [
      clip({ id: "under", startMs: 0, durationMs: 2000 }),
      clip({
        id: "over",
        startMs: 1000,
        durationMs: 2000,
        transitionIn: {
          type: "futureWipe3D",
          durationMs: 500,
          easing: "easeOut",
          axis: "z",
          bend: { degrees: 45 }
        },
        effects: [
          {
            id: "fx-grain",
            type: "filmGrain",
            enabled: true,
            size: 2,
            strength: 0.4,
            channels: ["r", "g", "b"]
          }
        ]
      })
    ]
  };
}

describe("timeline schema round trip — a document from a newer build (I2)", () => {
  it("parses instead of failing the whole document", () => {
    const parsed = timelineDocument.safeParse(newerBuildDocument());
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  });

  it("carries the unknown type's own parameters through the round trip", () => {
    const raw = newerBuildDocument();
    expect(timelineDocument.parse(raw)).toEqual(raw);
  });

  it("strips nothing", () => {
    const result = validateTimelineSequence(newerBuildDocument());
    expect(
      result.warnings.filter((issue) => issue.code === "field_stripped")
    ).toEqual([]);
  });

  it("validates, and names the cut it cannot draw", () => {
    const result = validateTimelineSequence(newerBuildDocument());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    const issue = result.warnings.find(
      (w) => w.code === "unknown_transition" && w.path === "transitionIn.type"
    );
    expect(issue?.message).toContain('"futureWipe3D"');
    expect(issue?.message).toContain("cross-fades instead");
    expect(issue?.clipId).toBe("over");
  });

  // The permissive branch is the risk this pair exists to bound: a known type
  // must not reach it. Both fail, and the message names the field rather than
  // the type — an effect chain that stopped checking `blur.radius` would be a
  // far worse regression than the one this task fixed.
  it("still fails a known transition type with a bad field", () => {
    const doc = newerBuildDocument();
    const clips = doc.clips as Record<string, unknown>[];
    clips[1].transitionIn = { type: "crossfade", durationMs: "300" };
    const result = validateTimelineSequence(doc);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (issue) =>
          issue.code === "schema_invalid" &&
          issue.path === "clips.1.transitionIn.durationMs"
      )
    ).toBe(true);
  });

  // The field the catch-all does not declare is where a hole would open: the
  // catch-all requires `durationMs`, so a bad one fails either way, but a bad
  // `direction` is only caught because the catch-all refuses `wipe` outright.
  it("still fails a known transition type on a field only that type has", () => {
    const doc = newerBuildDocument();
    const clips = doc.clips as Record<string, unknown>[];
    clips[1].transitionIn = { type: "wipe", durationMs: 300, direction: 42 };
    const result = validateTimelineSequence(doc);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (issue) =>
          issue.code === "schema_invalid" &&
          issue.path === "clips.1.transitionIn.direction"
      )
    ).toBe(true);
  });

  it("still fails a known effect type with a bad field", () => {
    const doc = newerBuildDocument();
    const clips = doc.clips as Record<string, unknown>[];
    clips[1].effects = [{ id: "e1", type: "blur", enabled: true, radius: "8" }];
    const result = validateTimelineSequence(doc);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (issue) =>
          issue.code === "schema_invalid" &&
          issue.path === "clips.1.effects.0.radius"
      )
    ).toBe(true);
  });

  it("still requires the shape every transition and effect shares", () => {
    const noDuration = newerBuildDocument();
    (noDuration.clips as Record<string, unknown>[])[1].transitionIn = {
      type: "futureWipe3D"
    };
    expect(validateTimelineSequence(noDuration).ok).toBe(false);

    const noId = newerBuildDocument();
    (noId.clips as Record<string, unknown>[])[1].effects = [
      { type: "filmGrain", enabled: true }
    ];
    expect(validateTimelineSequence(noId).ok).toBe(false);
  });
});
