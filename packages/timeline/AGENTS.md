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
