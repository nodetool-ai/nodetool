# Motion Graphics Engine — Implementation Plan

Step-by-step plan for adding a motion graphics layer to the timeline editor:
property keyframes (animated opacity / position / scale / rotation), title
clips (styled text rendered as compositor layers), and an agent tool to drive
both. Written to be executed phase by phase without further design decisions.

## Why not Remotion

The timeline's core invariant: `sceneModel.ts` is a **pure function of time**
(`computeActiveLayers(tracks, clips, t)`), consumed by the *same*
WebGPU/Canvas2D compositor for live preview and for the in-browser
frame-by-frame export (`render/TimelineRenderer.ts`, WebCodecs + mediabunny).
Remotion is React → DOM, exported by screenshotting headless Chrome in Node —
it cannot composite into the GPU layer stack, would break preview/export
parity, and would add a server rendering dependency plus a paid company
license. Remotion stays where it is (the `demo/` marketing harness). The
motion engine is instead built by extending the scene model.

## Ground rules (read before every phase)

- **Never break scene-model purity.** Nothing in `sceneModel.ts`,
  `keyframes.ts`, or `packages/timeline` may touch the DOM, GPU, stores, or
  `Date.now()`. Everything is a function of its arguments.
- **Preview and export must stay 1:1.** Any per-frame value must come from a
  shared pure function, never computed differently in the two paths.
- Do not add dependencies in phases 1–8. Do not touch `demo/` or anything
  Remotion-related.
- TypeScript strict, no `any`. UI uses primitives from
  `web/src/components/ui_primitives/` — never raw MUI (see
  `web/src/components/ui_primitives/STRATEGY.md`), and design tokens from
  `docs/DESIGN.md` (no hardcoded px sizes, radii, transitions).
- Mutate clips through `TimelineStore.patchClip(clipId, patch)` only — do not
  add new store actions; build new clip values with pure helpers from
  `@nodetool-ai/timeline`.
- After each phase run, from the repo root:
  ```bash
  npm run typecheck && npm run lint
  npm run test --workspace=packages/timeline   # phases 1–2
  cd web && npm test -- --testPathPatterns='timeline'   # phases 3–8
  ```
  Commit each phase separately with the message given in that phase. All
  checks must pass before committing.
- `web/` imports `@nodetool-ai/timeline` — after changing
  `packages/timeline`, run `npm run build:packages` once before running web
  tests or the dev server.

---

## Phase 1 — Keyframe data model + evaluator (`packages/timeline`)

**Goal:** persisted keyframe tracks on a clip and a pure evaluator. No web
code in this phase.

### 1.1 Types — append to `packages/timeline/src/types.ts`

Add after the `ClipTransform` interface:

```ts
/** Property a keyframe track can animate. Numeric scalar per property. */
export type AnimatableProperty =
  | "opacity"     // [0, 1]
  | "positionX"   // canvas px relative to canvas center
  | "positionY"
  | "scaleX"      // multiplier on the contain-fit base scale
  | "scaleY"
  | "rotation";   // radians

/** Interpolation from a keyframe to the NEXT keyframe. */
export type KeyframeEasing =
  | "linear"
  | "hold"
  | "easeIn"
  | "easeOut"
  | "easeInOut";

/**
 * One keyframe. `timeMs` is clip-local (relative to `clip.startMs`, in
 * timeline-ms) — the same convention as `CaptionWord`, so moving a clip
 * never rewrites keyframes. Lists are kept sorted ascending by `timeMs`
 * with unique times; the evaluator assumes this.
 */
export interface Keyframe {
  timeMs: number;
  value: number;
  /** Easing toward the next keyframe. Default "linear". */
  easing?: KeyframeEasing;
}

/** Per-clip animation: property → sorted keyframe list. */
export interface ClipAnimation {
  tracks: Partial<Record<AnimatableProperty, Keyframe[]>>;
}
```

Add one field to `TimelineClip` (after the `effects?` field):

```ts
  /**
   * Keyframe animation. While a property has a non-empty track, its animated
   * value REPLACES the static field (`opacity`, `transform.*`) at render
   * time; static fields remain the fallback for un-animated properties.
   */
  animation?: ClipAnimation;
```

### 1.2 Evaluator — new file `packages/timeline/src/keyframes.ts`

Create with exactly this content (plus a file-header doc comment in the style
of `splitClip.ts`):

```ts
import type {
  AnimatableProperty,
  ClipAnimation,
  ClipTransform,
  Keyframe,
  KeyframeEasing,
  TimelineClip
} from "./types.js";

/**
 * Recompute cadence for continuously-animating values. Callers tracking a
 * change horizon treat an in-span animated clip as changing this often.
 */
export const ANIMATION_STEP_MS = 1000 / 60;

const ALL_PROPERTIES: readonly AnimatableProperty[] = [
  "opacity",
  "positionX",
  "positionY",
  "scaleX",
  "scaleY",
  "rotation"
];

export const IDENTITY_CLIP_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

/** Normalized progress [0,1] → eased progress [0,1]. */
export function applyEasing(t: number, easing: KeyframeEasing): number {
  switch (easing) {
    case "hold":
      return 0;
    case "easeIn":
      return t * t;
    case "easeOut":
      return t * (2 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "linear":
      return t;
  }
}

/**
 * Sample a sorted keyframe track at a clip-local time. Holds the first value
 * before the first keyframe and the last value after the last keyframe.
 * Returns undefined for an empty track.
 */
export function evaluateKeyframes(
  keyframes: readonly Keyframe[],
  localMs: number
): number | undefined {
  if (keyframes.length === 0) return undefined;
  if (localMs <= keyframes[0].timeMs) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (localMs >= last.timeMs) return last.value;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (localMs >= a.timeMs && localMs < b.timeMs) {
      const span = b.timeMs - a.timeMs;
      const t = span <= 0 ? 1 : (localMs - a.timeMs) / span;
      return a.value + (b.value - a.value) * applyEasing(t, a.easing ?? "linear");
    }
  }
  return last.value;
}

/** True when the clip has at least one non-empty keyframe track. */
export function clipHasAnimation(clip: TimelineClip): boolean {
  const tracks = clip.animation?.tracks;
  if (!tracks) return false;
  return Object.values(tracks).some((kfs) => kfs !== undefined && kfs.length > 0);
}

/** Animated values resolved at one instant. Absent field = not animated. */
export interface ResolvedAnimation {
  opacity?: number;
  transform?: ClipTransform;
}

/**
 * Resolve a clip's animated values at a timeline time. Animated properties
 * replace the corresponding static field; un-animated transform components
 * fall back to `clip.transform` (or identity). Returns undefined when the
 * clip has no animation, so callers can cheaply skip static clips.
 */
export function resolveAnimation(
  clip: TimelineClip,
  currentTimeMs: number
): ResolvedAnimation | undefined {
  if (!clipHasAnimation(clip)) return undefined;
  const tracks = clip.animation!.tracks;
  const localMs = currentTimeMs - clip.startMs;
  const sample = (p: AnimatableProperty): number | undefined => {
    const kfs = tracks[p];
    return kfs && kfs.length > 0 ? evaluateKeyframes(kfs, localMs) : undefined;
  };

  const opacity = sample("opacity");
  const px = sample("positionX");
  const py = sample("positionY");
  const sx = sample("scaleX");
  const sy = sample("scaleY");
  const rot = sample("rotation");

  let transform: ClipTransform | undefined;
  if (
    px !== undefined ||
    py !== undefined ||
    sx !== undefined ||
    sy !== undefined ||
    rot !== undefined
  ) {
    const base = clip.transform ?? IDENTITY_CLIP_TRANSFORM;
    transform = {
      position: { x: px ?? base.position.x, y: py ?? base.position.y },
      scale: { x: sx ?? base.scale.x, y: sy ?? base.scale.y },
      rotation: rot ?? base.rotation,
      anchor: base.anchor
    };
  }
  return { opacity, transform };
}

/**
 * The next timeline time (> currentTimeMs) at which the clip's animated
 * values could change. Infinity for un-animated clips and once past the last
 * keyframe; the next keyframe start before a track begins; one
 * ANIMATION_STEP_MS ahead while inside an animated span (conservative for
 * "hold" segments — a recompute that resamples the same value is harmless).
 */
export function nextAnimationChangeMs(
  clip: TimelineClip,
  currentTimeMs: number
): number {
  const tracks = clip.animation?.tracks;
  if (!tracks) return Number.POSITIVE_INFINITY;
  const localMs = currentTimeMs - clip.startMs;
  let next = Number.POSITIVE_INFINITY;
  for (const p of ALL_PROPERTIES) {
    const kfs = tracks[p];
    if (!kfs || kfs.length === 0) continue;
    const first = kfs[0];
    const last = kfs[kfs.length - 1];
    if (localMs < first.timeMs) {
      next = Math.min(next, clip.startMs + first.timeMs);
    } else if (localMs < last.timeMs) {
      next = Math.min(next, currentTimeMs + ANIMATION_STEP_MS);
    }
  }
  return next;
}

/**
 * Pure update helpers — the Inspector and agent tools build new clip values
 * with these and persist via `patchClip(clipId, { animation })`.
 */
export function withKeyframe(
  animation: ClipAnimation | undefined,
  property: AnimatableProperty,
  keyframe: Keyframe
): ClipAnimation {
  const tracks = { ...(animation?.tracks ?? {}) };
  const existing = tracks[property] ?? [];
  const rest = existing.filter((k) => k.timeMs !== keyframe.timeMs);
  tracks[property] = [...rest, keyframe].sort((a, b) => a.timeMs - b.timeMs);
  return { tracks };
}

/** Remove one keyframe; drops empty tracks; undefined when nothing is left. */
export function withoutKeyframe(
  animation: ClipAnimation | undefined,
  property: AnimatableProperty,
  timeMs: number
): ClipAnimation | undefined {
  const tracks = { ...(animation?.tracks ?? {}) };
  const existing = tracks[property];
  if (existing) {
    const rest = existing.filter((k) => k.timeMs !== timeMs);
    if (rest.length > 0) tracks[property] = rest;
    else delete tracks[property];
  }
  return Object.keys(tracks).length > 0 ? { tracks } : undefined;
}

/** Remove a whole property track (or all animation when property omitted). */
export function withoutAnimationTrack(
  animation: ClipAnimation | undefined,
  property?: AnimatableProperty
): ClipAnimation | undefined {
  if (property === undefined) return undefined;
  const tracks = { ...(animation?.tracks ?? {}) };
  delete tracks[property];
  return Object.keys(tracks).length > 0 ? { tracks } : undefined;
}
```

### 1.3 Export

In `packages/timeline/src/index.ts` add `export * from "./keyframes.js";`.

### 1.4 Tests — new file `packages/timeline/tests/keyframes.test.ts`

Follow the style of `tests/splitClip.test.ts` (Vitest). Cover at minimum:

- `evaluateKeyframes`: empty track → undefined; single keyframe → its value
  everywhere; hold before first / after last; linear midpoint of
  `[{0,0},{1000,100}]` at 500 → 50; `hold` easing keeps the earlier value
  until the next keyframe; `easeInOut` at t=0.5 → exactly halfway; two
  keyframes with equal `timeMs` never divide by zero.
- `resolveAnimation`: clip without animation → undefined; opacity-only track
  leaves `transform` undefined; positionX track merges with a static
  `clip.transform` (other components preserved, anchor preserved); values are
  sampled at `currentTimeMs - clip.startMs`.
- `nextAnimationChangeMs`: before span → first keyframe's absolute time;
  inside span → `currentTimeMs + ANIMATION_STEP_MS`; after span → Infinity;
  no animation → Infinity.
- `withKeyframe`: inserts sorted; replaces an existing keyframe at the same
  `timeMs`; `withoutKeyframe` drops empty tracks and returns undefined when
  the last track empties.

Use `makeClip()`-style helper mirroring existing tests to build a minimal
`TimelineClip` (copy the pattern from `tests/splitClip.test.ts`).

**Commit:** `feat(timeline): keyframe animation model + pure evaluator`

---

## Phase 2 — Keyframes survive the razor (`splitClip`)

**Goal:** splitting an animated clip preserves the motion on both halves.
Trim behavior is intentionally untouched in v1: keyframes stay relative to
the clip's start after trims (document this in the `animation` field's doc
comment if not already stated).

### 2.1 Edit `packages/timeline/src/splitClip.ts`

Add a helper next to `splitCaptionWords` (import `evaluateKeyframes` and the
animation types from `./keyframes.js` / `./types.js`):

```ts
function splitAnimation(
  animation: ClipAnimation,
  splitMs: number
): { left: ClipAnimation | undefined; right: ClipAnimation | undefined }
```

For each property track `kfs` (skip empty):

- `boundaryValue = evaluateKeyframes(kfs, splitMs)` (never undefined for a
  non-empty track).
- left track = `kfs.filter(k => k.timeMs < splitMs)` plus
  `{ timeMs: splitMs, value: boundaryValue }` appended — the left half ends
  exactly where the motion was at the cut.
- right track = `[{ timeMs: 0, value: boundaryValue }]` plus
  `kfs.filter(k => k.timeMs > splitMs).map(k => ({ ...k, timeMs: k.timeMs - splitMs }))`
  — the right half starts from the cut value and continues. A keyframe
  exactly at `splitMs` is represented by the boundary keyframe (its easing
  is dropped; acceptable).
- Drop a resulting track if it would hold a single constant value equal on
  both keyframes? **No** — keep it simple, keep all keyframes.

Return `{ tracks }` objects, or `undefined` sides when `animation.tracks`
had no non-empty tracks.

In `splitClip()`, after the caption handling: when `clip.animation` is set,
compute `splitAnimation(clip.animation, leftDurationMs)` and assign
`leftClip.animation` / `rightClip.animation` (deleting the field when the
helper returned undefined for that side).

### 2.2 Tests — extend `packages/timeline/tests/splitClip.test.ts`

- Splitting a clip with a linear opacity ramp `[{0,0},{4000,1}]` at its
  midpoint: left ends with a keyframe `{2000, 0.5}`, right starts with
  `{0, 0.5}` and ends `{2000, 1}`.
- Evaluating left at its end and right at 0 gives the same value the
  unsplit clip had at the cut (visual continuity).
- Splitting a clip without animation leaves both halves without `animation`.

**Commit:** `feat(timeline): partition keyframes across splitClip`

---

## Phase 3 — Scene model integration (`web`)

**Goal:** `computeActiveLayers` returns animated opacity/transform, and the
change horizon accounts for animation. Everything downstream (live preview,
export renderer, Canvas2D fallback) consumes `ActiveLayer`, so this is the
single integration point for playback correctness.

Run `npm run build:packages` first so web sees the new exports.

### 3.1 Edit `web/src/components/timeline/preview/sceneModel.ts`

- Import `clipHasAnimation`, `nextAnimationChangeMs`, `resolveAnimation`
  from `@nodetool-ai/timeline`.
- In `computeActiveLayersWithHorizon`, inside the `for (const clip of
  activeClips)` loop, right after the existing
  `considerBoundary(clip.startMs + clip.durationMs);` line, add:

  ```ts
  const anim = resolveAnimation(clip, currentTimeMs);
  if (clipHasAnimation(clip)) {
    considerBoundary(nextAnimationChangeMs(clip, currentTimeMs));
  }
  ```

- Replace `const baseOpacity = clip.opacity ?? 1;` with
  `const baseOpacity = anim?.opacity ?? clip.opacity ?? 1;`
  (animated opacity replaces the static value; the crossfade ramp still
  multiplies on top — leave that line untouched).
- Define `const transform = anim?.transform ?? clip.transform;` and use
  `transform` instead of `clip.transform` in **both** places layers are
  built: the caption layer push and the `common` object.
- Update the module doc comment: one sentence noting animated values come
  from `resolveAnimation` so both surfaces stay 1:1.

### 3.2 Tests — extend `web/src/components/timeline/preview/__tests__/sceneModel.test.ts`

Follow existing test structure. Add:

- A clip with opacity keyframes `[{0,0},{1000,1}]` yields layer opacity 0.5
  at `startMs + 500` and 1 at `startMs + 2000` (hold after last).
- A clip with a `positionX` track yields a layer whose
  `transform.position.x` is the interpolated value while `position.y`,
  `scale`, `rotation`, `anchor` come from the static transform.
- `computeActiveLayersWithHorizon` on an animated clip mid-span returns
  `nextChangeMs <= currentTimeMs + 1000 / 60 + 0.001`.
- A static clip's behavior is unchanged (existing tests keep passing).

**Commit:** `feat(timeline): animated opacity/transform in the scene model`

---

## Phase 4 — Live preview renders animation

**Goal:** the preview re-composites while an animated clip plays or the user
scrubs. The export renderer needs no change (it already recomputes every
frame); the live preview has two caching layers that must not skip animated
frames.

### 4.1 Edit `web/src/components/timeline/preview/PreviewCompositor.tsx`

Two spots (find by grep, line numbers drift):

1. **Layer signature** — grep for `sig +=` / the memo that builds a signature
   from active layers (near the comment about caption active-word index).
   Where the caption word index is appended, also append the animated state
   for animated clips:

   ```ts
   if (clipHasAnimation(l.clip)) {
     sig += `~${l.opacity.toFixed(4)}|${JSON.stringify(l.transform)}`;
   }
   ```

   Import `clipHasAnimation` from `@nodetool-ai/timeline`. This makes the
   memoized layer list refresh whenever an animated value changes.

2. **Static-scene skip** — the rAF loop skips recompute while
   `currentTimeMs < nextChangeMs` (the horizon from
   `computeActiveLayersWithHorizon`). Phase 3 already clamps the horizon to
   ~one frame for animated clips, so no edit should be needed here — verify
   by reading the loop and confirming it re-queries the scene when the
   horizon passes. If any additional "scene is static" fast-path checks only
   layer kinds (image/caption), extend the condition with
   `|| layers.some((l) => clipHasAnimation(l.clip))` so animated scenes are
   never treated as static.

Known v1 gap (do not fix): `TransformGizmoOverlay` shows the *static*
transform while the playhead sits inside an animated span. Leave as-is.

### 4.2 Manual verification (required before committing)

```bash
npm run build:packages && npm run dev
```

In the browser: open a timeline, drop an image clip, then in the devtools
console patch keyframes onto it via the store — or, simpler, temporarily run
Phase 6 first if already built. Otherwise verify with the automated tests
plus export verification in Phase 5. Play and scrub across the clip: the
image must move/fade smoothly, and hold its last value after the final
keyframe. No console errors.

**Commit:** `feat(timeline): live preview composites keyframe animation`

---

## Phase 5 — Export parity check

**Goal:** confirm the exported MP4 matches the animated preview. Expected
result: **zero code changes** — `render/TimelineRenderer.ts` calls
`computeActiveLayers` at exact `1/fps` steps and passes `layer.transform` /
`layer.opacity` through, and the Canvas2D fallback shares the transform math.

- Read `render/TimelineRenderer.ts` and confirm it consumes
  `ActiveLayer.transform` / `.opacity` (not `clip.transform` directly). If it
  reads from `clip.*` anywhere, switch those reads to the layer fields —
  that's the bug this phase exists to catch.
- Add a Jest test next to the renderer's existing tests (or extend
  `sceneModel.test.ts`) asserting `computeActiveLayers` at three consecutive
  frame times (`t`, `t + 1000/30`, `t + 2000/30`) returns three distinct
  interpolated transforms for an animated clip — the property the export
  loop depends on.
- Manual: export a short sequence containing the Phase 4 animated clip and
  eyeball the MP4.

**Commit (only if code changed):** `fix(timeline): export reads animated layer values`

---

## Phase 6 — Inspector keyframe UI (minimal)

**Goal:** users can add/remove keyframes at the playhead from the clip
inspector. No keyframe lanes on tracks in v1 — a fold section in the
inspector is enough.

### 6.1 New component `web/src/components/timeline/Inspector/ClipAnimationPanel.tsx`

Model the section structure, fold behavior (`usePersistedFold("animation")`),
and styling on `ClipAdjustments.tsx`. Props: `{ clip: TimelineClip }`.

Behavior:

- Read `patchClip` via `useTimelineStore((s) => s.patchClip)` and the
  playhead via the instance playback store (see
  `TimelineInspector.tsx`'s `useTimelinePlaybackStoreApi()` usage for the
  access pattern; read `currentTimeMs` from it at click time via
  `.getState()`, do not subscribe per-frame).
- A property `Select` (primitives) over the six `AnimatableProperty` values,
  labeled Opacity / Position X / Position Y / Scale X / Scale Y / Rotation.
- An **"Add keyframe at playhead"** button: computes
  `localMs = clamp(playheadMs - clip.startMs, 0, clip.durationMs)`, samples
  the property's *current* rendered value (via `resolveAnimation` when the
  track exists, else the static field / transform component, else the
  identity default: opacity 1, position 0, scale 1, rotation 0), then
  `patchClip(clip.id, { animation: withKeyframe(clip.animation, property, { timeMs: localMs, value }) })`.
  Rotation is edited in degrees in the UI but stored in radians (same
  convention as `ClipAdjustments`).
- Under the selector, list the selected property's keyframes as rows:
  formatted time (`mm:ss.mmm`, reuse the timecode helper other timeline
  components use — grep `formatTime` under `components/timeline/`), numeric
  value input, easing `Select` (`linear/hold/easeIn/easeOut/easeInOut`), and
  a delete icon button. Edits go through `withKeyframe`; delete through
  `withoutKeyframe`. Empty state: one caption-sized line, "No keyframes.".
- A "Clear track" text button calling `withoutAnimationTrack`.

### 6.2 Mount it

In `TimelineInspector.tsx`, render `ClipAnimationPanel` for the selected
clip directly after `ClipAdjustments` for non-audio clips (audio animation
is out of scope; volume automation is a later feature).

### 6.3 Tests — `web/src/components/timeline/Inspector/__tests__/ClipAnimationPanel.test.tsx`

React Testing Library (`getByRole`, `userEvent`), following the existing
inspector tests' provider/store setup:

- Clicking "Add keyframe at playhead" calls `patchClip` with an `animation`
  containing one keyframe at the playhead's clip-local time.
- Deleting the only keyframe patches `animation: undefined`.
- The list shows keyframes of the selected property sorted by time.

**Commit:** `feat(timeline): inspector keyframe editing panel`

---

## Phase 7 — Agent tool `ui_timeline_set_keyframes`

**Goal:** the timeline Assistant can animate clips. Mirrors how the existing
`ui_timeline_*` tools are wired (bridge type → handler impl → tool def →
README row).

### 7.1 `web/src/components/timeline/timelineAgentBridge.ts`

- Extend `TimelineClipNode` (the snapshot type) with
  `animation?: ClipAnimation` so `ui_timeline_get_state` exposes existing
  keyframes.
- Add to `TimelineAgentHandler`:

  ```ts
  setKeyframes(args: {
    clip: string;              // id | name | "selected" — same resolution as other tools
    property: AnimatableProperty;
    mode: "replace" | "merge" | "clear";
    keyframes?: Array<{ timeMs: number; value: number; easing?: KeyframeEasing }>;
  }): Promise<{ ok: boolean; message: string }>;
  ```

### 7.2 `web/src/hooks/timeline/useTimelineAgentBridge.ts`

Implement `setKeyframes` following the pattern of the existing clip-mutating
handlers (clip resolution helper, error strings for unknown clip/property):

- `clear` → `patchClip(id, { animation: withoutAnimationTrack(clip.animation, property) })`.
- `replace` → drop the property's track, then fold the given keyframes in
  with `withKeyframe` (validating each: finite numbers, `timeMs >= 0`).
- `merge` → fold keyframes into the existing animation with `withKeyframe`.

### 7.3 `web/src/lib/tools/builtin/timeline.ts`

Add the tool definition after `ui_timeline_set_clip_params`, copying its
structure: name `ui_timeline_set_keyframes`, description stating times are
clip-local ms, values are canvas px / multipliers / radians / 0–1 opacity,
and that `replace` is the default mode. JSON-schema the args to match 7.1.

### 7.4 Docs

Add a row to the tools table in
`web/src/components/timeline/README.md` and a short "Animation" subsection
describing the keyframe model (clip-local times, replace-semantics, split
behavior).

### 7.5 Tests

Extend the existing agent-bridge tests (grep `useTimelineAgentBridge` under
`web/src/hooks/timeline/__tests__/`): `setKeyframes` with `replace` writes a
sorted track; `clear` removes it; unknown property returns `ok: false`.

**Commit:** `feat(timeline): ui_timeline_set_keyframes agent tool`

---

## Phase 8 — Title clips (text layers)

**Goal:** a clip type that renders styled text through the compositor —
combined with Phase 1–5 this gives animated titles/lower-thirds in preview
and export identically. Modeled directly on the caption pipeline
(`captionRender.ts`), which already proves the raster-to-ImageBitmap path.

### 8.1 Types — `packages/timeline/src/types.ts`

```ts
/** Styled text rendered as a full-frame layer (titles, lower thirds). */
export interface ClipTitle {
  text: string;
  /** CSS font family list. Default "Inter, Arial, sans-serif". */
  fontFamily?: string;
  /** Font size as a fraction of frame height. Default 0.08. */
  fontSizeFrac?: number;
  /** CSS font-weight. Default 700. */
  weight?: number;
  /** Fill color, #rrggbb or rgba(). Default "#FFFFFF". */
  color?: string;
  /** Outline color. Default "rgba(0,0,0,0.85)"; "none" disables. */
  outlineColor?: string;
  /** Horizontal alignment. Default "center". */
  align?: "left" | "center" | "right";
  /** Vertical anchor as a fraction of frame height (0 top, 1 bottom). Default 0.5. */
  verticalFrac?: number;
}
```

On `TimelineClip`, after `caption?`: `title?: ClipTitle;` with a doc comment:
a title clip carries no asset; it contributes a text layer in preview and
export. Title clips live on `overlay` tracks with `mediaType: "overlay"`,
`sourceType: "imported"`, `status: "generated"`.

### 8.2 Scene model — `sceneModel.ts`

- Extend `ActiveLayer.kind` union with `"title"` and add
  `title?: ClipTitle` to `ActiveLayer`.
- In the active-clip loop, after the caption push and **before** the
  `if (!isVisual) continue;` picture logic: when `clip.title` is set, push a
  layer `{ kind: "title", clip, clipId, trackIndex: track.index, blendMode,
  opacity, assetId: undefined, transform, title: clip.title }` onto
  `mediaLayers`, then `continue` (a title clip contributes only its text).
  Titles composite at their track's z (unlike captions), so they can sit
  under other overlays.
- Text is static per clip — no extra horizon handling beyond clip
  boundaries and (already handled) animation.

### 8.3 Raster — new file `web/src/components/timeline/preview/titleRender.ts`

Copy the structure of `captionRender.ts` wholesale: a `TitleRasterizer`
class with an LRU cache keyed by a `titleSignature(title, width, height)`
string (text + every style field + dimensions), rasterizing to an
`ImageBitmap` at full frame resolution with an `OffscreenCanvas`: word-wrap
at 90% width (reuse the greedy wrap approach), honor `align`, place the
block's vertical center at `verticalFrac * height`, stroke outline then
fill. Export `titleSignature` for tests, as `captionRender` does.

Because the bitmap is full-frame, it contain-fits to identity in the
compositor and the clip's (possibly animated) `transform` moves/scales/
rotates it — no new GPU code.

### 8.4 Consume in both surfaces

- `PreviewCompositor.tsx`: mirror the caption handling — collect
  `kind === "title"` layers, rasterize via a `TitleRasterizer` ref, include
  the title signature in the layer signature memo, and emit a
  `CompositeLayer` with the bitmap source and the layer's transform/opacity/
  blend/z.
- `render/TimelineRenderer.ts`: mirror whatever it does for caption layers
  (grep `caption` in that file) with a `TitleRasterizer` instance.

### 8.5 Creation + editing UI

- `AddClipMenu.tsx`: add a "Title" item. It creates a clip via
  `TimelineStore.addClip` on the first `overlay` track (create one named
  "Titles" if none exists — follow `getOrCreateAudioTrack`'s pattern *in
  the menu's handler* using existing track-creation actions; do not add a
  store method unless one already exists for overlay tracks), with
  `startMs` = playhead, `durationMs` = 4000, `name` = "Title",
  `title: { text: "Title" }`, and the field defaults from 8.1 left unset.
- Inspector: in `TimelineInspector.tsx`, when `clip.title` is set render a
  new `Inspector/ClipTitlePanel.tsx` (text area + font size slider +
  color/outline inputs + align select + vertical slider, all primitives,
  all persisted via `patchClip(clip.id, { title: { ...clip.title, ... } })`).

### 8.6 Tests

- `sceneModel.test.ts`: an active title clip yields exactly one layer,
  `kind: "title"`, no asset, at the track's z; a hidden track yields none;
  title + opacity keyframes compose (animated opacity applies).
- `titleRender.test.ts`: signature changes with text and each style field;
  rasterizer caches (same signature → same bitmap instance), mirroring
  `captionRender.test.ts`.
- Inspector panel test: typing updates `patchClip` with the new text.

**Commit:** `feat(timeline): title clips — styled text layers in preview and export`

---

## Phase 9 (deferred — do not start without explicit go-ahead)

Lottie clip type: `lottie-web` renders pre-authored After Effects/Bodymovin
animations to a canvas with deterministic `goToAndStop(frame)` seeking. Plan
sketch, to be expanded into its own document when scheduled: new optional
dependency in `web/`; `clip.lottieAssetId` referencing an uploaded `.json`
asset; extend `CompositeSource` with `HTMLCanvasElement | OffscreenCanvas`
(both `copyExternalImageToTexture` and `drawImage` accept them); a player
pool in the preview and a per-frame `goToAndStop` in the renderer keyed off
`clipSourceTimeSec`. Out: Rive, effect-parameter keyframing, keyframe lanes
in the track UI, volume automation.

---

## Definition of done (whole plan)

- `npm run check` passes at every commit.
- An image clip with position + opacity keyframes animates identically in
  live preview and exported MP4 (spot-check by eye).
- Splitting an animated clip leaves no visual jump at the cut.
- A title clip is creatable from the Add menu, editable in the inspector,
  animatable with keyframes, and present in the export.
- The Assistant can run `ui_timeline_set_keyframes` end to end.
- `web/src/components/timeline/README.md` documents the animation model and
  the new tool; this plan file is updated if reality diverged from it.
