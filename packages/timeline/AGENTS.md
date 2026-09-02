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

## Splitting / cloning entities

- **When you split or clone by spreading `...clip`, explicitly clear the
  properties that belong only to the original outer boundary** — `delete
  leftClip.fadeOutMs`, `delete rightClip.fadeInMs`/`transitionIn`. A full spread
  duplicates boundary fades/crossfades onto the new interior hard cut.
- **Partition time-positioned children, don't copy them to both halves.**
  `splitClip` must assign each caption word to exactly one side (clamping the
  straddling word) and **rebase** the moved side's local timings
  (`startMs - splitMs`), not copy the whole `words` array to both.

## Snapping & placement

- **Generate snap-point ticks as `i * interval`, never `t += interval`** —
  fractional intervals (`1000/30`) drift under accumulation and stop deduping
  against integer boundaries.
- **Track `snapped` as an explicit boolean set when a within-threshold candidate
  is adopted**, not `closest !== timeMs` — the latter is wrong when the snap target
  lands exactly on the input.
- **Exclude the moving entity's own footprint from overlap/collision checks**
  (`excludeClipIds`) — otherwise a dragged clip reports overlapping itself.

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
  back the bitmap a key hits, so a field `textStyleSignature` does not read
  renders as the frame drawn before that field changed. The check is the
  `Object.keys` enumeration in `tests/render.textStyle.test.ts`, which walks the
  document schema, so a field added under I1 fails there until the key reads it.
- **A rasterized layer's pixels can depend on its animation sample.** A shape's
  `trimStart`/`trimEnd` change the outline, so every host rasterizes
  `AnimatedLayerProps.shapeStyle`, not the clip's own; a host that reaches for
  `layer.shapeStyle` renders a trim animation as a held first frame.
