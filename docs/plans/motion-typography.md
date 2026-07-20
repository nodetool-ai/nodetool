# Motion Typography — Per-Word Staggered Text Animation

Status: implemented (July 2026).
Companion doc: [motion-design.md](motion-design.md) (the preset/curve/sampler
substrate this builds on).

## Goal

Jitter is mostly motion typography, and the signature move is the **stagger**:
words of a title animating in sequence, each offset in time from the previous —
a headline whose words pop in one after another, a kicker that slides away word
by word. The motion-design system animates a text clip as one block; this
design splits the block into words without breaking the one-clip-one-layer
model.

Authoring stays preset-shaped: a stagger is not a new animation type but a
modifier on an existing `ClipAnimation` — "run this pop-in once per word,
120 ms apart". The agent (`ui_timeline_animate_clip`) is the primary authoring
surface; the inspector gets a thin stagger row on text clips.

v1 unit is **words**. Characters and lines can follow behind the same
`stagger.unit` field without a schema break.

## Architecture: stagger inside the text rasterizer

Two candidates were on the table:

- **A (chosen). Time-dependent text raster.** Keep one layer per text clip.
  The `TextRasterizer` already measures every word to wrap lines, so per-word
  geometry is one refactor away. At draw time each word evaluates its own
  animation sample (same compiled curves, per-word time offset) and is drawn
  into the block's canvas with its own translate/rotate/scale/alpha — 2D
  canvas transforms per word are cheap. The compositor, layer model, and
  `computeActiveLayersWithHorizon`'s change-horizon contract are untouched.
  Preview/export parity is free because both paths already rasterize through
  the same class.
- **B (rejected). One sub-layer per word.** Explode the clip into N word
  layers in the scene model, each animated via `resolveAnimatedLayerProps`
  with a time offset. GPU-composited words stay crisper under extreme
  scale/rotate, but it breaks the layer-set caching and horizon assumptions,
  multiplies layer count by word count, and touches every layer consumer
  (compositors, gizmo, placeholder DOM, video-slot bookkeeping). That price
  buys quality headroom v1 does not need — a word rotating inside a
  sequence-resolution raster is more than good enough for titles.

The cost of A is cacheability: while a stagger window is active the raster is
a function of time, not just style. That is exactly the caption situation
(karaoke highlight), and the same remedy applies (see Caching).

## Data model

`ClipAnimation` gains one optional field (engine `animation/types.ts`, wire
schema `packages/protocol/src/api-schemas/timeline.ts` — the zod field is
mandatory or PATCH strips it):

```ts
export interface AnimationStagger {
  unit: string; // "word" — unknown units compile un-staggered (forward compat)
  offsetMs: number; // delay between successive words; must be > 0
  from?: "start" | "end" | "center"; // which word leads; default "start"
}

export interface ClipAnimation {
  // …existing fields…
  stagger?: AnimationStagger;
}
```

`from` ordering: `"start"` = first word first, `"end"` = last word first,
`"center"` = middle words first, rippling outward (delay =
`|i − (N−1)/2| × offsetMs`).

Stagger is only meaningful on text clips. The agent bridge rejects it on any
other clip; a hand-edited document that carries it elsewhere (or an unknown
`unit`) compiles as a plain block animation — same degrade-gracefully posture
as unknown presets.

## Window and duration semantics

**`durationMs` is the per-word duration; the total span stretches.** Word `i`
runs the full preset curve over `durationMs`, delayed `delay(i)` from the
span start, so the span is `durationMs + maxDelay` where
`maxDelay = maxFactor(from, N) × offsetMs`. This is the reading an agent
setting it expects — "each word pops for 400 ms, 120 ms apart" — and it keeps
`durationMs` meaning the same thing with and without a stagger. The
alternative (squeeze N word-windows inside `durationMs`) makes the per-word
motion speed depend on word count, which reads as a bug when the text changes.

Anchoring per role:

- **in / emphasis**: span grows forward from `delayMs`; the first word starts
  where the un-staggered window would have.
- **out**: span grows backward, so the last word to leave still finishes at
  `clipEnd − delayMs` — the clip ends empty, like an un-staggered out.
- **loop**: no span change; `delay(i)` is a phase shift on the cycle.

**Short clips shrink the offset, never the word duration.** When
`durationMs + maxDelay` does not fit the clip, the effective `offsetMs` is
scaled down so the last word still completes inside the clip. If no positive
offset fits (the clip is shorter than one word's duration), the stagger drops
and the animation compiles as a plain block window, clamped as before.

Compiled form: `compileClipAnimations` takes `options.staggerCount` (the word
count — `countStaggerUnits(text)`, whitespace-split, matching the
rasterizer's wrap tokenization). A compiled stagger rides on the animation as
`CompiledAnimation.stagger` (`count`, effective `offsetMs`, `from`,
`unitDurationMs`, `maxDelayMs`), and `windowStartMs..windowEndMs` covers the
**full span**. That one choice keeps the rest of the system ignorant of
staggering: `hasActiveAnimationWindow` (and therefore the preview's redraw
gate and the compile cache) see one window that happens to be longer.

## Sampling: block/word split

A staggered animation's curves are split across two samplers:

- `sampleAnimations` (block level, unchanged signature) folds only its
  **effect/mask** curves (`blur`, `brightness`, `saturation`,
  `wipeProgress`), over the full span. Transform/opacity curves are skipped —
  they belong to the words.
- `sampleStaggeredAnimations(compiled, localMs, wordIndex, out?)` (new, pure)
  folds only **transform/opacity** curves of staggered animations, each word
  evaluated at its own window `[spanStart + delay(i), + unitDurationMs]` with
  the role's usual holds (in: hold t=0 before, identity after; out: identity
  before, hold t=1 after; loop: phase shift). Un-staggered animations are
  skipped — they already applied at the layer.

So on a text clip, per-word offset/scale/rotation/opacity come from the
raster; block-level animations (a Ken Burns drift, a wipe, an added fade)
compose on the layer exactly as before, and a staggered blur preset still
blurs the whole block while its opacity fade runs per word. Per-word masks
and effect parameters are explicitly out of scope for v1 (see Non-goals).

## Rendering integration

`TextRasterizer.rasterize` gains an optional stagger argument
(`{ compiled, localMs }`). Without it the block draw path is byte-identical
to before. With it, the rasterizer lays out word boxes (line breaks use the
same measured-candidate rule as the block path, so a staggered title wraps
exactly like its un-staggered self) and draws each word about its own center:

```
translate(wordCenter + sample.offset) → rotate → scale → alpha → fillText
```

The per-frame context is resolved by one shared helper,
`resolveTextStaggerContext(clip, timeMs, canvas, cache)` in `sceneModel.ts`,
called from the only three text draw sites — `PreviewCompositor`,
`TimelineRenderer`, and `rasterClipFrames` (the agent's
`ui_timeline_get_clip_frames` path) — so preview, export, and agent frames
render per-word motion from one code path.

The preview's redraw gate needs no change: `hasActiveAnimation` reads the
compiled full-span window, so the compositor keeps redrawing every rAF tick
until the last word lands.

## Caching

The style-hash bitmap cache cannot serve a mid-stagger frame. Policy, per
`rasterize` call:

- **Active** (clip-local time inside any staggered animation's span): draw
  fresh, uncached — a new bitmap per frame, like captions during a karaoke
  highlight. The rasterizer keeps the latest active bitmap per style key and
  closes the previous one on the next call (the caller has composited it by
  then), so playback does not accumulate full-frame bitmaps. Per-frame cost
  is one offscreen canvas fill of a few dozen words plus a texture upload —
  the price captions already pay, negligible next to video decode. Time-
  bucketed caching was rejected: 64 cached 1080p frames is ~0.5 GB.
- **Held** (before/after the span): the frame is static (hold or identity)
  but differs from the plain raster, so it caches under the normal key plus a
  suffix of the compiled-array identity and a per-animation phase signature
  (before/after). Steady state after a stagger completes is one cached bitmap
  again — the GPU re-uses the uploaded texture.

## Agent surface

`ui_timeline_animate_clip` accepts `stagger: { unit: "word", offsetMs,
from? }` per animation, documented in the tool description with the
motion-typography use case. Validation lives where preset/role validation
already lives: `buildClipAnimation` checks the unit and offset, the bridge
handler rejects stagger on non-text clips with a corrective message. Ids,
defaults, and the returned clip node are unchanged.
`ui_timeline_list_animation_presets` is untouched — stagger is orthogonal to
the catalog and composes with any non-full-clip preset.

## Manual UI

Text clips get two rows inside each animation's editor in the Animate
section: a "Stagger words" toggle and, when on, a word-offset pill (ms).
`from` stays agent/JSON-only until demand appears. Hidden for non-text clips
and full-clip presets (kenBurns ignores stagger).

## Editing semantics

Nothing new to store: `splitClip`/`duplicateClip` copy `animations`
wholesale (stagger included), and trims re-clamp at compile time exactly like
plain windows — the compile cache keys on clip duration and word count, so
editing the text re-derives the span.

## Non-goals

- **Character and line units** — the schema (`unit`) and the sampler
  (unit index/count) are ready; the rasterizer would need per-glyph layout.
- **Per-word effect/mask properties** — blur/brightness/saturation and wipes
  stay block-level; per-word canvas filters would cost a save/filter/restore
  per word per frame for little visible gain at title sizes.
- **Caption stagger** — captions have real word *timings*; their karaoke path
  stays separate.
- **Per-word easing/curve overrides** — one curve, offset in time, is the
  Jitter look; anything richer belongs to a future curve editor.

## Risks

- **Stale raster mid-stagger**: a cached bitmap served during the window
  would freeze the motion. Covered by the active-window cache bypass and a
  regression test; the phase-suffixed keys cover the held frames.
- **Word-count drift**: the engine counts words by whitespace split, the
  rasterizer by the same split during wrap. A divergence would mis-time later
  words. Both sides share the tokenization rule (`countStaggerUnits` is
  documented against the rasterizer) and the compile cache re-keys on count.
- **Raster churn during playback**: while a stagger is active over a playing
  video, every frame re-rasterizes and re-uploads the text. Accepted (caption
  precedent); if profiling ever flags it, quantizing `localMs` to the frame
  rate inside `resolveTextStaggerContext` is a local fix.
