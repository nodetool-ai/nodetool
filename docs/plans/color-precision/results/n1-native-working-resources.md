# N1 native working resources

Partial N1 implementation on Qt RHI. FP16 remains off by default. No schema, document, QML property or preference was added. The C++ entry point is `PreviewCompositor::setWorkingFormat(nt::WorkingFormat::Rgba16F)`.

## Task status

| Task | Implementation | Qualification still required |
|---|---|---|
| A30 | Format-aware canvas, group surfaces, previous canvas and effect scratch. Explicit premultiplied FP16 frame tag. Format participates in reuse, byte budgets and render-pass selection. Existing float blur and LUT storage retained. | Full compositor resize and format-switch tests on actual platform devices. |
| A31 | FP16 bypasses straight-byte leaf filtering and paired byte alpha bridges. Effect, denoise and blend unpremultiplication preserve low alpha. Chroma Key consumes straight RGB directly in float mode. Posterize, parameter plans and ordering remain unchanged. Existing qsb pipeline compiles the shaders. | Shared-vector comparison and full compositor orchestration coverage. |
| A33 | Blend, adjustment, shape-mask and image-matte stages accept float frames. Byte-generated raster sources remain byte inputs and promote when sampled into a working target. Seek, source-document generation and format changes invalidate FP16 temporal state. | FP16 text, shape, group, transition, blur accumulation and previous-frame numerical scenes. Ancillary resource tests use QRhi Null and establish allocation/recording contracts only. |
| A35 | Mixed-format scratch stress and existing frame-cache/render regression selection. Hardware cache and NV12 interop code unchanged. | Decoded-source switches, backward scrubbing and repeated effect edits in a complete FP16 scene, process/GPU peak memory and decode-failure monitoring. |

## Numerical checks

`tst_workingprecision::inverseLevelsAndAlpha` uploads sixteen premultiplied half-float gray values, compresses Levels output to 0.1, expands Levels input from 0.1, then composites through the native Screen blend shader over transparency. It reads a dedicated RGBA16F render target as typed `qfloat16` components. Alpha values are 1, 0.5, 0.001 and 0. The RGBA8 control must exhibit intermediate quantization loss. Float tolerance scales with alpha, with a two-millionths absolute floor.

These are native vectors awaiting reconciliation with `film/color-s0`. That shared set was unavailable during implementation. This tests the production effect and blend implementations, but does not drive the complete `PreviewCompositor` scene evaluator, fixed-function over pass or temporal orchestration.

## Default behavior and boundaries

WorkingFormat defaults to RGBA8 in both the compositor and EffectContext. Existing allocation formats, leaf filtering, alpha bridges and alpha floors remain selected in that mode. Existing render assertions were retained. This is a regression-test claim within the selected scenes, not an exhaustive proof for every document.

Production capture/export remains byte-only. An internal FP16 capture request is rejected with `FP16 working capture requires the N2 delivery boundary` instead of interpreting half-float storage as RGBA8888. The test owns its separate typed readback. No A84 delivery conversion, export or presentation work was started.

Color Match still models RGBA8 intermediates in `ColorMatch.cpp`. It is not qualified for FP16. Matching against float output must wait for a precision-aware solver contract and the N2 capture boundary, because current match analysis receives byte captures and has no renderer precision input. FP16 is not exposed as a user setting and its byte capture is rejected. The default Color Match model remains correct for the unchanged byte route.

LayerFrame's YUV matrix remains unchanged. No transfer field or linear-light conversion was added. Source depth, transfer interpretation, NV12 imports, independent hardware frame-cache copies and hardware retirement rules remain outside this change.

## Verification results

Build passed with `ntbuild color-n0 tst_surfacepool tst_workingprecision tst_effectresources tst_clipeffects tst_keyedrender tst_effectsblend tst_framecache` (exit 0).

The selected `citest` run passed all nine CTest entries (exit 0): preferences setup, clip effects, keyed render, working precision, effect resources, blend rendering, clip-effect rendering, frame cache and surface pool. It used Xvfb, lavapipe and fresh HOME/config directories. Existing keyed-render and blend/clip pixel assertions passed without changes. No TypeScript checks or full ctest suite ran. No QML changed.

Typed readback succeeded on `llvmpipe (LLVM 23.1.3, 256 bits)`:

| Alpha | RGBA8 maximum error | RGBA16F maximum error |
|---|---:|---:|
| 1 | 0.0197228 | 0.000976563 |
| 0.5 | 0.0197084 | 0.000488281 |
| 0.001 | 0.0010004 | 0.000000715256 |
| 0 | 0 | 0 |

The 600-iteration scratch test measured a peak of 49,152 accounted texture bytes and ended with five pooled slots. Format, size, lease exclusion and reuse assertions passed. This is a bounded pool test, not process or full-scene peak memory.

The first run contained two existing internal skips. `exportDocuments` requires `NT_D6_OUTPUT`, so it was rerun with an output directory under the build tree. The complete clip-effects rerun passed all 67 cases with zero skips (CTest exit 0). `doesNotPinWindowsDecoderSurfaces` is compiled only on Windows and cannot be exercised on this Linux host. The new precision tests and other selected render tests had no skips.

Build and first-run logs are preserved under `/home/mg/Projects/nodetool-film/build/color-n0/n1-logs/`, outside Git. `git diff --check` and a control-byte scan passed.

## Cost and remaining gate

No per-frame scene cost comparison was obtained. Concurrent builds make timings noisy, and the small numerical test is not a playback benchmark. RGBA16F uses eight texture bytes per pixel versus four for RGBA8. Pool counters measure texture storage only, excluding drivers, render-pass objects, decoders and retirement queues.

The full N1 exit gate is not met. Numerical effect/blend evidence alone does not establish complete FP16 scene lifetime and scrubbing safety. Keep FP16 disabled. Metal, D3D11/WARP, actual Windows hardware, OpenGL, hardware decode interop under FP16, device loss and full-scene allocation peaks remain unverified. Unsupported-device format fallback is not implemented and belongs to N3.
