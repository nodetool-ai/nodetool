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
xvfb-run -a env QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan ctest --test-dir build -R '^tst_effects(blend|clip)_render$' --output-on-failure
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
step 2 effects, all stylize modes and all generator modes. Masks and mattes
remain for the next Package J step.

`stylize-modes` and `generator-modes` place each mode in its own one-second
clip. `visualFxFixtures` in `check-effects.mjs` lists every mode and frame.
Animated stylize and generator effects receive sequence time in seconds from
both scene decorators. The grain seed still needs an fps/frame-index seam.
See the [step 3 report](REPORT-step3.md) for coverage, evidence and limits.

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
ctest --test-dir build -R '^(tst_effectplan|tst_effectresources|effects_golden_script|tst_effectsblend_registry|tst_effectsblend_documents)$' --output-on-failure
```

`tst_effectresources` uses QRhi’s Null backend to check cache reuse, bounded
LUT eviction and resource lifetime without a GPU.
