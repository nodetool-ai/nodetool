# timeline — Clip Editing Math

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **timeline**

> Read [packages/AGENTS.md](../AGENTS.md) first (the bounds/float-math rules apply here). This package is pure functions over clips; the web store `web/src/stores/timeline/TimelineStore.ts` calls them, so forward and inverse ops must stay consistent.

## Timeline-space vs. source-space

- **Never conflate timeline duration with source duration.** A clip with an
  unbaked `speedMultiplier` consumes `rate` source-ms per timeline-ms. Convert
  through one shared `sourceRate(clip)` helper
  (`speedBaked ? 1 : max(0.0001, speedMultiplier ?? 1)`, guarding zero/negative)
  used by split, trim, merge, **and** the preview compositor — so they can't
  diverge. Source points scale (`inPointMs + leftDurationMs * rate`); timeline
  duration uses the raw delta.
- **An inverse op must use the same rate-aware quantity the forward op wrote.**
  Merge undoing split compares `outPointMs ?? (inPointMs + durationMs)` for
  contiguity — the `+ durationMs` reconstruction is only correct at 1× speed.
- **A `timeRemap` replaces the rate, it does not scale it** (`timeRemap.ts`,
  D13). Its keyframes name absolute source milliseconds against a `t`
  normalized over the clip's own window, so neither `speedMultiplier` nor
  `inPointMs` applies on top; `clipSourceTimeSec` asks `clipRemapSourceMs`
  first and falls back to `sourceRate` only when there is no curve. The
  interpolation is `evalCurve`'s — the segment is eased by its *ending*
  keyframe and held flat past both ends — so one keyframe is a freeze frame
  and the easing grammar is the one the rest of the document speaks.
- **A custom animation can be anchored to the media instead of the clip**
  (`custom.timeBase: "source"`). Its keyframes name absolute source
  milliseconds in `sourceMs` — the stored truth there, with `t` derived from it
  by `normalizeCustomCurves` — and the sampler evaluates them at
  `clipSourceMsAt`, the same source time the compositor seeks the video to, so
  speed and a time remap move the motion the way they move the footage. The
  caller passes that time to `sampleAnimations`; one that does not leaves such
  an animation at identity rather than replaying it on the clip's clock.
  Because the curve is placed in the media, **`trimClip` and `splitClip`
  re-slice it** (`animation/sourceCurves.ts`) instead of letting the window
  stretch it: keyframes outside the retained source window are dropped and an
  interpolated keyframe is put on each new edge, so the motion at a given
  timeline instant survives the edit — exactly for a linear segment (the
  default a custom animation compiles with), approximately when an eased
  segment is cut in half. A split hands each half the stretch of the curve its
  own source window shows, so role says nothing about which half carries it. A
  clip-based curve keeps stretching, which is what `t` over the window means.
  The validator reports a curve reaching past the clip's source window as
  `source_curve_outside_window`.
- **Split and trim refuse a remapped clip** (`assertNotTimeRemapped`). The
  curve is normalized over the window, so changing the window retimes every
  frame the clip shows, including the ones the edit did not touch. The refusal
  is the contract: there is no `bakeTimeRemap` in this build, and the message
  names `bake_time_remap` for the caller.

## Splitting / cloning entities

- **When you split or clone by spreading `...clip`, explicitly clear the
  properties that belong only to the original outer boundary** — `delete
  leftClip.fadeOutMs`, `delete rightClip.fadeInMs`/`transitionIn`. A full spread
  duplicates boundary fades/crossfades onto the new interior hard cut.
- **Partition time-positioned children, don't copy them to both halves.**
  `splitClip` must assign each caption word to exactly one side (clamping the
  straddling word) and **rebase** the moved side's local timings
  (`startMs - splitMs`), not copy the whole `words` array to both.

## Ripple and roll (`src/rippleEdit.ts`)

- **A ripple moves every unlocked track, not just the edited one.** A voiceover
  or caption sits against a shot; a ripple that only closed the video track
  would pull them out of sync. `shiftClipsFrom` is the one shift, and every
  ripple (`rippleTrim`, `rippleDelete`, `closeGap`) is a trim or removal
  followed by it, so the "what moves" rule lives in one place.
- **A ripple head-trim keeps the clip parked.** `rippleTrim(..., "start", d)`
  moves the in-point and the duration and puts `startMs` back; the downstream
  shift is measured from the clip's *old* end. The web trim gesture
  (`useClipTrim`) measures a head-trim against the duration at pointerdown for
  the same reason.
- **A roll is two trims that sum to zero.** `rollEdit` finds the neighbour
  across the cut (`findRollNeighbour`, 1 ms tolerance) and applies `trimClip`
  to both sides so the sequence length never changes; either side running out
  of source throws and the store leaves the document alone.

## Drop modes, transitions, keyframes

- **A drop settles once, on release** (`src/dropResolve.ts`). During a drag
  the store lets a clip overlap; `resolveDrop` then overwrites (trims, splits
  or removes what the mover covers on its track), inserts (cuts a straddler
  on the mover's track and shifts every later clip on unlocked tracks by the
  moved span) or leaves the overlap for the renderer. Linked siblings of a
  mover are never its victims.
- **A transition needs two pictures** (`src/transitionAtCut.ts`). The document
  keeps `transitionIn` on the incoming clip; `applyTransitionAtCut` also
  extends the abutting predecessor under it by the transition length, so a
  hard cut becomes a dissolve rather than a fade from transparent. It never
  exceeds the shorter of the two clips.
- **Hand-set keyframes are one custom animation** (`src/keyframes.ts`):
  `preset: "custom"`, role `emphasis`, `params.keyframed`, duration equal to
  the clip's, one curve per property. The sampler plays it like any custom
  animation. Times are `t` over the clip, so a trim stretches its keyframes;
  a caller that needs absolute times converts through `keyframeTimesMs`.

## Snapping & placement

- **Generate snap-point ticks as `i * interval`, never `t += interval`** —
  fractional intervals (`1000/30`) drift under accumulation and stop deduping
  against integer boundaries.
- **Track `snapped` as an explicit boolean set when a within-threshold candidate
  is adopted**, not `closest !== timeMs` — the latter is wrong when the snap target
  lands exactly on the input.
- **Exclude the moving entity's own footprint from overlap/collision checks**
  (`excludeClipIds`) — otherwise a dragged clip reports overlapping itself.

## Authored clips and track order

- **A track's index is its z-order, and `add_track` appends to the bottom.**
  Index 0 draws on top (`render/sceneModel.ts`), so a picture track added after
  its overlays covers all of them. `moveTrackOrder` (`src/trackOrder.ts`) is the
  one place the destination arithmetic lives — both `ui_timeline_move_track`
  surfaces call it and hand the ids it returns to `reorderTracks` — and it
  throws on a destination it cannot make rather than returning the same order.
- **`authoredStyles.ts` holds the defaults an under-specified text or shape clip
  gets**, for the same reason: the browser bridge and the headless one each had
  a copy, and the headless one stroked every shape white 8px — so a translucent
  scrim came back with a hard outline the same call in the editor did not draw.
  A shape the caller filled gets no stroke it did not ask for.

## Midi voices (`src/midi`, `src/midi/engines`)

- **One renderer, four synths.** `renderInstrumentEvents` switches on
  `instrument.type` and every host — the browser preview, the audition, the
  `RenderTimeline` node — goes through it. `subtractive` is the built-in voice;
  `wavetable`, `bass` and `drum` are ports of FableSynth's WT-1, BL-1 and DR-1
  ([github.com/georgi/fablesynth](https://github.com/georgi/fablesynth)),
  living in `src/midi/engines/`.
- **What was ported is the sound-shaping, not the plugin.** The band-limited
  wavetables and their mip ladder, the Cytomic SVF, the ADAA tanh drive, the
  envelopes, BL-1's accent and slide, DR-1's pad voice. Not ported: stereo
  (this renderer is mono), the LFOs and mod matrix, the FX racks, and the
  plugins' own sequencers — a track's effects live on the track and its notes
  live in the clip.
- **A render is reproducible or the cache is wrong.** No `Math.random` and no
  clock: DR-1's noise is a seeded xorshift keyed by the pad and the hit, and
  unison start phases are a fixed spread. `midiRenderKey` hands back a previous
  render, so a voice that drifted between two renders would play as whichever
  one was cached first.
- **`instrumentSignature` walks the instrument rather than listing its
  fields.** The FableSynth voices carry nested oscillators, envelopes and
  sixteen pads; a hand-written field list would go stale on the first one
  added, and the cache would serve audio from before the change.
- **A new instrument type is two edits, not one.** `types.ts` and
  `@nodetool-ai/protocol`'s `midiInstrument` schema both describe the union, and
  `tests/midi.protocolCompat.test.ts` parses every shipped preset through the
  schema — so a branch added on one side fails there rather than being stripped
  by Zod on the first autosave.

## Rendering (`src/render`, `@nodetool-ai/timeline/render`)

- **One scene model, one compositor, four hosts.** The live preview, the
  browser export, the server-side `RenderTimeline` node and the agent-facing
  `preview_timeline_frame` all resolve layers with `computeActiveLayers` +
  `resolveAnimatedLayerProps` and place them with `buildTransformMatrix`. A
  rule that lives in only one host is a rule the others will drift from — put
  it here.
- **Two compositors, one set of rules.** `frameCompositor.ts` is the GPU path;
  `canvas2d.ts` is the same placement, opacity, blend, wipe and rounded-corner
  math against a Canvas 2D context, and both the browser's WebGPU fallback and
  the headless frame preview draw through it. Effects are where the two
  genuinely differ, so `unsupportedEffectTypes` names what Canvas 2D drops
  rather than letting a caller show a different picture silently.
- **An adjustment clip is z-order, bottom-up, group-scoped, and mixed by its
  coverage.** `mediaType: "adjustment"` draws nothing: it treats the composite of
  everything already on the surface at its own track's z — every track with a
  higher index — runs its effect chain on that, and **mixes** the treated result
  into the untreated one by its coverage — resolved opacity × mask × wipe —
  rather than compositing it over: `out = original * (1 - c) + treated * c` on
  every premultiplied channel, alpha included, so a fully applied treatment
  *replaces* what it covers (1 fully treated, 0 a no-op). Blending it over
  instead added the copy's alpha to its own, and a neutral chain thickened every
  translucent pixel — 50% opaque came back at 75% — which only a group surface
  or an alpha export can see. Both compositors say so in one place each:
  `mixTreatment` in `canvas2d.ts` and in `frameCompositor.ts`. Stacked adjustments therefore
  apply bottom-up with no rule of their own: the higher one simply finds the
  lower one's result. Inside a group it treats that group's surface and nothing
  outside, which is why a group holding one always precomposites
  (`groupNeedsPrecomposite`). The scene model decides all of it — `computeActiveLayers`
  returns `AdjustmentLayer` records — so `canvas2d` and `frameCompositor`
  execute one plan instead of each deciding.
- **Nothing in `src/render` may be re-exported from the package root.** The root
  export stays runtime-dependency-free (mobile compiles it from source); the
  render module pulls in WebGPU through `@nodetool-ai/gpu`.
- **`./scene` is `./render` without the GPU.** It re-exports the scene model,
  transform math, draw rules and Canvas 2D rules — everything but
  `frameCompositor` and `effects`, the two files that import
  `@nodetool-ai/gpu/webgpu` and through it TypeGPU. A caller that only resolves
  and draws (`packages/agents`) imports `./scene`; a caller that wants the GPU
  compositor imports `./render`. Both re-export the same modules, so the paths
  cannot drift.
- **A frame's shutter window is decided in one place.** Motion blur is N
  sub-frame instants averaged (D10), and every surface asks
  `motionBlurSampleTimes` for those instants — the browser export, the server
  render and the agent frame preview. A host that computed its own offsets
  would blur a cut differently from the preview the user approved. One sample
  returns the frame's own time, so a render with blur off is byte-identical to
  the render it was before blur existed. The Canvas 2D accumulation is
  `accumulateBlurSample` (`lighter` at 1/N — a sum, not a fade); the GPU one is
  `HeadlessFrameCompositor.renderFrameSamples`, which folds premultiplied
  samples into an `rgba16float` texture and un-premultiplies once at the end.
- **Never read a WebGPU flag namespace (`GPUTextureUsage`, `GPUShaderStage`) at
  module scope.** Under Node those globals only exist after the Dawn adapter
  installs them with the device, so a module-scope read throws on import.
- **A custom animation's JavaScript runs once, at bake time, never at render
  time.** There is no JS engine in the browser compositor and there must not be
  one: the body returns keyframes (`animation/custom.ts`), they are stored on
  the clip, and every surface samples them like a preset's. `normalizeCustomCurves`
  is the single gate — the compiler, the validator, and the bake all call it, so
  curves that would render nothing are refused in one place. See
  [docs/timeline-custom-animations.md](../../docs/timeline-custom-animations.md).
- **Draw code takes a `RasterContext2D`, not a concrete canvas.** The browser
  passes an `OffscreenCanvas` context and the server `@napi-rs/canvas`; a type
  that only one of them satisfies breaks the other silently at build time.
- **Every shape resolves to one `PathSegment[]`** (`render/shapeGeometry.ts`),
  in surface pixels, arcs included as cubics. Trim, dashes and gradients then
  apply to a rect, an ellipse, a star and an authored `d` the same way — and a
  trimmed ellipse has an arc length to walk, which `ctx.ellipse` would not.
- **One text layout serves the plain draw, the stagger and the scrim**
  (`layoutTextBlock` in `render/textLayout.ts`). Wrapping, line height,
  alignment and letter spacing are decided once, and the block box it returns
  is what a `background` sits behind and what a gradient `fill` is measured
  against — the text, not the raster. A draw that computes its own wrap puts a
  staggered title somewhere its un-staggered self is not.
- **A raster cache key names every field of the style it caches.** A host hands
  back the bitmap a key hits, so a field `textStyleSignature` or
  `captionSignature` does not read renders as the frame drawn before that field
  changed. The checks are the `Object.keys` enumerations in
  `tests/render.textStyle.test.ts` and `tests/render.captionStyle.test.ts`,
  which walk the document schema, so a field added under I1 fails there until
  the key reads it.
- **A caption keeps its own layout, and its built-in look is a default rather
  than a constant.** `drawCaption` anchors an alphabetic baseline to the frame
  bottom and colours the block word by word, neither of which `layoutTextBlock`
  expresses; the two share the font shorthand and the scrim, which is where
  they agree. Every value `caption.style` leaves out is the one the drawing
  hard-coded before it was authorable, and
  `packages/agents/tests/timeline-caption-frames.test.ts` compares an unstyled
  caption against that prior drawing pixel for pixel — so a default nudged
  while "cleaning up" fails rather than quietly restyling every shipped
  caption.
- **A font family is resolved once, in `resolveFontFamily`, and nowhere else.**
  `textFontSpec` is the only builder of a `ctx.font` shorthand, and it takes
  its family list from there — so the editor preview, the browser export, the
  server render and the agent's frame preview all set the same string. The
  faces are `packages/timeline/fonts/` with their OFL licences beside them,
  listed in `src/fonts/catalog.ts` and registered in
  `@nodetool-ai/config`'s `PACKAGE_RUNTIME_ASSET_DIRS`, so
  `bundle-backend.mjs` stages the directory and `verify-backend-bundle.mjs`
  fails a build that ships without it. A family the catalog does not carry
  still draws, in front of the bundled default, and the validator reports it
  as `font_not_portable`.
- **`src/fonts/register-node.ts` is not reachable from the root export, or
  from `./fonts`.** It imports `@napi-rs/canvas`, and the root export has no
  runtime dependencies (AS2); Node hosts reach it as
  `@nodetool-ai/timeline/fonts/node` and call `registerBundledFonts()` before
  they draw. The catalog and the `@font-face` generator carry no imports at
  all, which is what lets the browser, the validator and the fonts endpoint
  read the same table.
- **A browser draws with a bundled face only after `document.fonts.load`
  resolves.** `fillText` never waits, so a title rasterized before its file
  arrives is set in the fallback — and `TextRasterizer` caches by style, not by
  face, so those glyphs stay until the entry is evicted. The editor awaits
  `ensureBundledFontsLoaded()` on mount, the export and the clip-frame stills
  await it before their first frame, and the rasterizer refuses to cache until
  `bundledFontsReady()`. Adding a face means regenerating
  `web/src/components/timeline/fonts.css` (`npm run timeline-fonts` in `web/`).
- **A rasterized layer's pixels can depend on its animation sample.** A shape's
  `trimStart`/`trimEnd` change the outline, so every host rasterizes
  `AnimatedLayerProps.shapeStyle`, not the clip's own; a host that reaches for
  `layer.shapeStyle` renders a trim animation as a held first frame.

## Crop (`src/crop.ts`)

- **A crop reframes; it does not knock out.** `clip.crop` is four normalized
  insets, and the rectangle they keep *becomes* the layer's picture: the contain
  fit is recomputed from the cropped size, the transform places the cropped
  frame, the border radius rounds its corners, and the effect chain and masks
  run on its pixels. Cropping a 16:9 shot to 1:1 therefore fills the frame the
  way a 1:1 source would. Hiding part of a layer that stays where it was is
  `ClipMask` with `kind: "rect"` — a different edit, and still the way to ask
  for it. The equivalence both compositors are held to is
  `render.crop.gpu.test.ts`'s: a cropped layer renders exactly like an uncropped
  layer whose source is the crop.
- **Insets, not pixels, and one place that resolves them.** Fractions survive
  the asset under them changing resolution — an upscale, or `restoreVersion`
  swapping in a generation rendered at another size. `cropRectPx` is the only
  reader: it clamps to the source, snaps to whole texels, and answers with the
  whole source when there is no usable crop, so a caller hands the result
  straight to a draw without branching.
- **Cropping happens before anything else looks at the pixels**, which is what
  lets the rest of both compositors stay unchanged. The GPU path narrows the
  upload with a `copyTextureToTexture` into a crop-sized texture cached by layer
  id (an axis-aligned region of whole texels has nothing to filter, so a copy is
  exact and cheaper than a pass); Canvas 2D blits the whole source at a negative
  offset onto a crop-sized surface, which is the 5-argument `drawImage` spelling
  of a sub-rectangle. A clip that *was* cropped and is not any more must drop the
  cached copy, or it keeps drawing the stale one.
- **A crop is source-space and says nothing about time**, so `trimClip` and
  `splitClip` carry it across untouched — the same argument `generatedMatte`
  makes for sharing the in-point.
- **Insets that keep no picture render uncropped rather than blanking the
  shot** — a slider dragged to the end should show the whole frame, not a hole.
  `isCropUsable` decides it in one place for the ops, the renderers and the
  validator's `crop_degenerate`. Canvas 2D needs a `cropSurface` from its host;
  without one it draws uncropped and reports `crop_skipped` (I7).

## Film grain (`filters.grain@1`)

- **Grain multiplies, it does not add.** The layer arrives premultiplied, so
  `rgb <= a` holds on every pixel and adding noise pushes a channel past its own
  alpha — invisible on an opaque layer, a bright fringe wherever it is
  translucent. A per-channel gain saturated against alpha preserves the
  invariant, and it is also how stock behaves: grain bites in the midtones and
  leaves black black. The case that catches the additive version is a *dark*
  half-opaque source; on a bright one the readback's own saturation hides it,
  which is why `render.grain.gpu.test.ts` says so where it picks its fixture.
- **The pattern is a hash of the grain cell and a seed — no clock, no
  `Math.random`.** `resolveAnimatedLayerProps` stamps the frame's time on an
  `animate` grain, so it rolls the way exposed stock does while two renders of
  the same frame stay byte-identical and a cached render can be handed back.
  That is the one place the roll happens, and it is why the shader has no
  `animate` knob: by the time the chain runs, the seed is already decided.
- **Canvas 2D has no noise to draw with**, so it reports `grain` through
  `unsupportedEffectTypes` rather than approximating it.

## Generated mattes (`src/generatedMatte.ts`, D2)

- **A generated matte is an attribute of the clip, not a second clip.**
  `clip.generatedMatte` names a luma mask video cut from the clip's own source
  frame for frame, so it shares the in-point, the speed, the window and the time
  remap by construction — every trim, split and move keeps it aligned, and
  `splitClip`/`trimClip` need nothing beyond copying the field across. The
  two-clip `matte` (`ClipMatte`, `matte.sourceClipId`) stays for a keyhole
  authored from another clip's picture; a clip carrying both is resolved by the
  generated one, because that is what the user asked the picture to be.
- **What can go wrong is staleness, not alignment.** The clip's asset can be
  regenerated under the matte, or its window can grow past the source the
  generation covered. `isGeneratedMatteStale` decides both, in one place, for
  the editor and for the validator's `generated_matte_stale`.
- **The capability that generates one never loses the matte already there.**
  `isolate_subject` (`packages/agents/src/capabilities/timeline-isolate-subject.ts`)
  marks the clip `status: "generating"` while keeping the current `assetId` and
  `versions`, and on a failure or a cancel it puts the previous ready result
  back — same asset, same versions, same knobs — so a regenerate the provider
  drops costs nothing but the call. Only a clip that had no matte at all is
  left with a `failed` marker. It sends the whole source asset, because the
  mask is read at the clip's own source time and a trimmed submission would
  need an offset the document does not carry. The knobs afterwards are the
  `set_generated_matte` op, which both hosts run through the helpers here.
- **The scene model resolves it into the same `matte` slot a track matte uses**
  (`mode: "luma"`, plus `strength` and `featherPx`), with the keyhole carrying
  the layer's own clip, placement and source time and none of its look — so both
  compositors apply one keyhole through one path. `status` other than `ready`
  draws unmatted rather than blanking the shot a generation is still cutting
  out. `featherPx` is GPU-only; Canvas 2D draws the edge hard and reports
  `generated_matte_feather_ignored`.
