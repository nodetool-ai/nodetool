# Timeline effects

The app compiles `EffectsRegistrations.cpp` directly into its executable.
It registers hooks only with a `QGuiApplication`, so `--dump-plan` keeps the
existing plan. Blend handlers receive container-sized premultiplied surfaces
with opacity already applied. They undo premultiplication for the channel
functions and write a complete premultiplied container.

The formulas and numeric IDs follow
[WGSL blends](../../../../../packages/gpu/src/blend/wgsl.ts) and the
[export compositor](../../../../../packages/gpu/src/compositor/shaders.ts).
`add` follows the compositor's Canvas lighter branch, which adds
premultiplied color and alpha with saturation.

Run from `native/timeline/` on a machine with a working Qt RHI backend:

```sh
xvfb-run -a env QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan ctest --test-dir build -R '^tst_effects(blend|clip|matte|adjustment)_render$' --output-on-failure
xvfb-run -a env QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan node src/preview/effects/check-effects.mjs --bin build/nodetool-timeline
```

The script accepts `--only blend-modes,blend-group,blend-nested-group`,
`--min-psnr 40` and `--json` (one JSON record per frame). Each fixture's
`goldenFrames` lists frame indices and the exit criterion covered. The
protocol's sequence schema accepts this extra field. Media paths are relative
to the fixture, matching [golden-import](../../../scripts/golden-import.mjs).
The fixtures use media from `fixtures/media/` and checked-in RGB PNG patterns.

`blend-modes` covers every non-normal mode at full and half opacity across
most of the frame. The other fixtures cover group opacity and blends both
outside and inside nested surfaces. Clip and group effect chains include the
step 2 effects, all stylize modes, all generator modes, shape masks and mattes.

`stylize-modes` and `generator-modes` place each mode in its own one-second
clip. `visualFxFixtures` in `check-effects.mjs` lists every mode and frame.
Animated stylize and generator effects receive clip evaluation time in seconds,
stepped for leaves and unstepped for groups. The context hooks in
[`SceneHooks.h`](../layers/SceneHooks.h) also carry the document, the clip's
track, clip evaluation time, sequence time, fps and sequence frame index.
Fixed grain keeps its authored seed.
Animated grain uses the context's sequence frame index,
`floor(sequenceTimeMs * fps / 1000)`, on both leaf and group chains. The
sequence clock stays unstepped for grouped clips and temporal echoes.
Missing document fps defaults to 30 in the timeline parser.
The driver compares every listed frame with the export.

`clip-grain-animated` and `group-grain-animated` use a static image at 24 fps,
with golden frames 17 and 18. An optional `distinctFrames` array lists pairs
of golden frame indices whose native stills must differ. The script rejects
pairs with PSNR above 40 dB, including identical images, independently of
the export comparison threshold.

The `track-*` fixtures cover color correction, video blur, sharpen, vignette,
chroma key, clip-plus-track aggregation and a grouped leaf. Track audio kinds
and disabled effects drop out. Track chroma key runs before the clip shader
steps, color and blur aggregate across both scopes, then the first enabled
track sharpen and vignette run. Group surfaces carry only group effects,
matching the export.

Adjustment decorators fill `SceneFrame::adjustments` through
`registerContextAdjustmentDecorator`, using the same token and snapshot lifetime
as the layer and group hooks. They accept records with enabled clip effects,
including animation channels, and omit track effects. The scene resolves fade,
animated opacity, wipe and the containing surface. No adjustment fields enter
the plan JSON. Leaves and adjustments share effect and mask style-track
sampling and append additive color and blur channels once, covered at distinct
frames 6 and 24 by `clip-effect-animated`. Groups retain authored effects
without style-track or additive sampling and omit shape masks, matching the
web precomposite.

`registerBackdropStage` snapshots factories when a renderer initializes its QRhi.
At an adjustment's z, after pictures at equal z, the compositor copies the
container's premultiplied accumulation into a distinct pooled texture. The
stage treats that copy and writes a complete replacement. Frame and group
surfaces use the same container loop for preview and stills. J keeps the clip
chain output premultiplied, then mixes every premultiplied channel by
opacity times mask coverage times wipe. Shape-mask inversion is baked into the
coverage raster. Both the chain and mix retire resources through their last use.

`adjustment-two-layers` covers overlapping pictures with color and blur, a
partial mask and faded opacity. `adjustment-group` treats a translucent group
child while leaving an outside picture untreated, with an inverted mask.
Both fixtures use frames 6 and 18. `tst_effectsadjustment_render` also checks
neutral treatment on half-alpha group pixels and equal-z ordering.

The GLSL port follows the exporter's fullscreen triangle so hash cells and
glitch rows use the same UV interpolation. Spatial samples clamp to the layer
edge. These modes keep the source dimensions and report no outset.

Each stage owns a `DrawCache` for its shaders, sampler, vertex buffer, binding
layout and pipelines. Pipelines retain compatible render-pass descriptors.
A frame owns its changing uniforms and texture bindings, and reuses two
scratch surfaces, or three while retaining a recipe source. The retire queue
keeps those resources and their shared cache alive through the last GPU use,
including a recorded prefix of a failed chain. The LUT cache holds eight
entries, keyed by a SHA-256 content digest, and retires the least recently
used entry when inserting a ninth.

The pixel test distinguishes real group surfaces from opacity-only groups.
Its document checks run without a GPU. See the [pixel oracle](pixel-oracle.md)
for the export math and the diagnosis of the driver's failing rows.

For generated mattes, the script first imports a pending-matte copy with
absolute picture paths through golden-import. `import-matte.mjs` then imports
the matte videos into that same scratch store, binds their asset ids and
re-renders the ready-matte document. The native fixture keeps its relative
`generatedMatte.mediaPath`. Asset-id-only documents need an asset resolver
that the native layer decorator does not expose.

Shape masks rasterize at source size, capped at 2048, with a bounded coverage
and texture cache. The shape stage follows the clip chain, before placement.
Rounded rects use `kind: rect` with `radiusPx`. Unknown kinds and invalid paths
leave the layer unmasked. The web group precomposite has no shape-mask pass,
so native group masks are ignored too. Path and rounded-rect feathers use a
CPU Gaussian approximation to Canvas filter blur. Feather is finite and
bounded before radius conversion, with the Gaussian support capped at the
raster extent. GPU blur radii, including generated and track matte feather,
are capped at 256 pixels before narrowing or shader offset conversion. Inverted feathered ellipses
reproduce the export rasterizer's destination-out clipping at the ellipse
centre, covered by `mask-invert`. That raster differs from a full complement
in browser Canvas. Inverted path and rounded-rect feathers also reproduce
the export's second filter application under destination-out.

Track mattes read frame-sized premultiplied surfaces through S4. Luma retains
the source coverage, inversion precedes keyhole blur, and the layer opacity
and blend meet the stack once. The stage supports strength and feather in
`LayerMatte`. Web track documents expose neither field, so their coverage
runs through direct stage tests. Generated matte documents expose both.
Generated matte videos use the picture source clock and dimensions, keeping
the same placement through a separate matte-source entry. That entry keeps
geometry, timing and resolved clip effects, shape masks and animated layer
masks regardless of decorator order. It drops track effects, transition reveals
and dip solids, uses opacity 1 and normal blending, following exporter output
rather than the comment above `resolveGeneratedMatte`.
`generated-matte-effects` checks clip brightness and a feathered shape mask on
both sources, with track brightness only on the picture, at frames 0 and 21.

The `clip-posterize-midpoint` golden establishes byte 127 on the driver GPU.
The pixel test uses that value and the shader keeps the step 2 UNORM write.
Its frame metadata requires identical pixels, so a finite PSNR fails regardless
of `--min-psnr`.

The script calls golden-import without changing it, forces native software
decode and defaults to an offscreen Qt platform. Set `QT_QPA_PLATFORM=xcb`
under Xvfb when Qt's offscreen plugin cannot create a Vulkan instance.
The script uses the same RGB24 PSNR filter as
[compare-golden](../../../scripts/compare-golden.mjs). Outputs go under
`build/golden/effects-*` and `build/native-stills/effects-*`. It fails on any
render error, missing still, below-threshold comparison or empty selection.

The script, registration and document tests need no GPU:

```sh
node --test src/preview/effects/check-effects.test.mjs
ctest --test-dir build -R '^(tst_masks|tst_effectplan|tst_effectresources|effects_golden_script|tst_effectsblend_registry|tst_effectsblend_documents)$' --output-on-failure
```

`tst_effectresources` uses QRhi’s Null backend to check cache reuse, bounded
LUT eviction and resource lifetime without a GPU.
