# Colour precision plan status audit

This audit checks the requested plan clauses against the merged source, test
assertions and retained results. It does not run new rendering or hardware
measurements. A passing suite qualifies only its actual backend and fixtures.
FP16 remains off by default.

## Evidence scope

The combined CI logs are outside the repository at
`/home/mg/Projects/nodetool-film/tmp/x84s.log` (Linux sanitizers), `x84m.log`
(Metal) and `x84w.log` (D3D11/WARP). All record passing `export_precision`,
`native_backend_routes`, `tst_workingprecision`, `tst_sceneprecision`,
`tst_framecapture`, `tst_monitorcompositor`, `tst_colormatch_render`,
`tst_colormatch`, `tst_deliveryframe` and `tst_surfacepool` suites.
The Linux numerical route is Vulkan/lavapipe. OpenGL has independent local
scene/monitor/capture evidence in [N2](n2-native-export.md#a32-working-pixels-and-presentation)
and [N3](n3-native-backends.md). WARP is software, not Windows hardware qualification.

The table uses these source references:

- [Compositor](../../../../native/timeline/src/preview/PreviewCompositor.cpp), [frame contracts](../../../../native/timeline/src/preview/LayerSource.h), [layer contracts](../../../../native/timeline/src/preview/layers/LayerRegistry.h), [compose contracts](../../../../native/timeline/src/preview/compose/ComposeRegistry.h), [surface pool](../../../../native/timeline/src/preview/SurfacePool.h) and [scratch pool](../../../../native/timeline/src/motion/capacity/ScratchPool.h).
- [Scene tests](../../../../native/timeline/src/preview/effects/tst_sceneprecision.cpp), [monitor tests](../../../../native/timeline/src/preview/tst_monitorcompositor.cpp), [capture tests](../../../../native/timeline/src/export/tst_framecapture.cpp), [pool tests](../../../../native/timeline/tests/tst_surfacepool.cpp) and [working-precision tests](../../../../native/timeline/src/preview/effects/tst_workingprecision.cpp).
- [ExportEngine](../../../../native/timeline/src/export/ExportEngine.cpp), [OffscreenFrames](../../../../native/timeline/src/export/OffscreenFrames.cpp), [delivery helpers](../../../../native/timeline/src/export/DeliveryFrame.h), [delivery tests](../../../../native/timeline/src/export/tst_deliveryframe.cpp) and [export acceptance driver](../../../../native/timeline/src/export/check-precision.py).

## Clause decisions

| Task | Decision | Implementation and test evidence | Missing or qualification limit |
|---|---|---|---|
| A96 | Partly met | [A96 investigation](a96-native-rendering-direction.md) checks SDK acquisition, explicit binding/packing proposals, Qt/decode/cache boundaries and Metal/Vulkan sharing feasibility. It explicitly records no compiled or executed WGSL and no C++ bridge. | Execute the shared effect and decoded-frame processing/presentation/export proof, validate packing/lifetime/backward seeks and compare copying, synchronization and playback/export cost against Windows. A recommendation to retain Qt does not complete those clauses. |
| A30 | Met | Compositor selects working canvas, previous canvas and pooled surfaces by format. ScratchPool keys format and budgets bytes. LayerFrame declares transfer and distinguishes float pixels. Scene `transferSurvivesLayerContracts`, `ancillaryTemporalResizeAndCost` and pool `workingFormatsHaveSeparateIdentityAndBudgets` exercise metadata, resize, reuse, eviction and release. Blur/LUT storage remains float. | No missing functional clause in the tested routes. No schema change or transfer conversion is implied. |
| A31 | Met | [ClipEffects](../../../../native/timeline/src/preview/effects/ClipEffects.cpp) restricts byte alpha bridges to RGBA8. [composite.frag](../../../../native/timeline/shaders/composite.frag) restricts byte rounding to byte leaves. Existing qsb build remains. `inverseLevelsAndTinyAlpha` and `tst_workingprecision` exercise shared inverse-Levels/alpha vectors through production shaders. Existing clip-effect tests retain effect ordering and Posterize semantics. | No missing functional clause in the tested routes. |
| A33 | Met | Scene `ancillaryTemporalResizeAndCost` contains text, shapes, masks, transitions, group effects and shutter accumulation. It checks previous-canvas copying, seeks, document replacement and format switches. Compositor resets temporal state for source/seek/format changes. | No missing functional clause in the tested routes. |
| A35 | Met | Scene `decodedScrubAndEdits` alternates decoded sources, backward seeks and effect edits, asserts exact media and successful reports, bounds decoder bursts/drain and pooled/GPU growth, and records allocator peaks. Linux also asserts warmed RSS growth. Existing hardware cache/retirement implementation is retained. [N1](n1-native-working-resources.md) records local measurements. | Software-decoded stress does not establish hardware decode interop or Windows GPU performance. Those remain A49.2. |
| A109 | Met | [ColorMatch](../../../../native/timeline/src/color/ColorMatch.cpp) follows the route format, using byte or half rounding. Capture `colorMatchWorkingFormat` solves and compares the modeled grade with actual production rendering in both formats. [Unit tests](../../../../native/timeline/src/color/tst_colormatch.cpp) include `floatAnalysisPreservesSubByteSamples`. [N2](n2-native-export.md#a109-color-match-working-format-model) records exact default solver comparisons and a failing byte-rounding control. | No missing clause for this precision-model change. Arbitrary high-gain chains and transfer reconciliation are not qualified. |
| A32 | Met | Compositor uses a separate FP16 final presentation pipeline with an RGBA8 outer target. Monitor `presentationQuantization` checks stable dither after sampling, paused redraws, alpha behavior and undithered capture. Independent OpenGL scene/monitor checks cover row orientation. | No missing functional clause in the tested routes. |
| A45.2 | Met | Monitor `resolution`, `groupEffectsKeepTheFullCanvas`, `canvasDecisionHoldsAcrossAShutter`, `captureIsolation` and reuse tests cover both formats. Scene `resolutionMaskOutset` and `backdropResolutionAcrossShutter` check project geometry, observed allocation sizes/formats, masks, outsets and full-canvas exceptions. | No missing functional clause in the tested routes. No new selector or exception optimization is required. |
| A84.1 | Met | Compositor captures the canvas with the matching premultiplied QImage format, owns readback and retains request completion/orientation handling. OffscreenFrames preserves the working image. `typedWorkingCapture` compares all components with the raw observer, stride and lifetime. `offscreenTypedCapture` checks asymmetric dimensions, orientation and cancellation. | No missing functional clause in the tested routes. |
| A84.2 | Met on Vulkan/lavapipe | ExportEngine retains float resize and final quantization. `spatialFloatResampling` checks the helper. The existing `export_precision` now checks every decoded PNG RGB and MP4 YUV sample against an independently resized float canvas for fit/fill up/down and odd-canvas video, with separate unencoded resize and codec bounds. A deliberately wrong fit mode fails. See [measurements](n2-native-export.md#a842-decoded-spatial-acceptance). | No missing functional clause on the tested adapter. The new assertions have not yet run on Metal, D3D11/WARP or OpenGL. |
| A84.3 | Met | `export_precision` decodes real PNG/ZIP and MP4, checks opaque alpha and low-opacity edges, manifest/layout, cancellation and removal of staging/partial output. `alphaAndPng` checks straight/zero-alpha separately. ExportEngine and delivery helpers make each staging/final quantization explicit. | No missing clause for existing opaque delivery. Transparent export is not claimed. |
| A41.3 | Met | `export_precision` inspects decoded YUV420P, limited range and BT.709 tags, compares pre-encode planes separately from measured codec error and retains ordinary 8-bit PNG/video. Current bounds are p99 regression <=1 code, mean regression <=0.5 code and absolute mean <=1 YUV code. | The O1 transfer-tag mismatch remains accepted. No higher-depth delivery is claimed. |
| A43.3 | Met | Scene `previewOffscreenWorkingParity` compares all undithered working pixels from preview and offscreen at the same original decoded frame/time/background/grade/seed, in both formats. It varies preview resolution, zoom, alpha/grid, checks repetition and changes/restores the seed. Export acceptance keeps dithering and codec tolerances separate. | No missing functional clause in the tested routes. |
| A90 | Met | [Surface inventory](a90-surface-inventory.md) enumerates browser/server/agent/CLI/native callers, tests, lazy prerequisites and CPU raster/save boundaries. Current `frames.ts`, `compositeRender.ts`, CLI render and sketch WebGPURuntime retain the identified seams. Agent migration and native typed capture are later changes recorded in S5/N2. | An inventory is source evidence, not a claim that its listed tests ran. Historical RGBA8/CPU descriptions apply to the inventory revision. |
| A82 | Partly met | [precisionCost.test.ts](../../../../packages/gpu/tests/precisionCost.test.ts) and [raw records](a82-cost.md#reproduction-and-artifacts) provide hardware/lavapipe cold, steady-state, allocation, transfer and lifecycle samples with the stated warmup/alternation. Budgets were declared before measurement. Owner accepted the RTX 3060 median overrun. [S3 probe](../../../../packages/video-nodes/tests/a49-operational-probe.mjs) and [server results](s3-operational-budgets.md) add actual health-route latency/errors under load. | Health-only contention, interrupted 4K batches and a different server workload do not qualify representative API latency within budget. Strict no-growth soak and constrained GPU remain missing. |

## Contradictions and checkbox changes

F1: A32, A45.2 and A109 were still described as missing in N1/N2 despite their
later code and passing tests. Their requested checkboxes are now checked.
Historical N2 checkpoints are explicitly separated from the current status.
A84.2's decoded spatial-resize gap is now closed on Vulkan/lavapipe by the
full-frame comparison recorded above.

F2: A34 was checked while its paragraph and N3 local checkpoint still said
Metal/D3D11 awaited CI. Combined CI supplies those passes. A34 stays checked.
No hardware task was changed.

F3: A43.2 was checked and excluded agents until A91, although A91 is now met.
The [browser parity test](../../../../packages/timeline/tests/render.a432Browser.gpu.test.ts)
has only Node/Chromium working-frame paths. S5's decoded-PNG/Canvas2D comparison
does not supply the required migrated-agent working-frame comparison.
**A43.2 was unticked** by this audit. The subsequent
[migrated-agent comparison](s3-parity.md#migrated-agent-comparison-after-a91)
closes that gap with real child output, exact delivery-stage accounting and
same-adapter lavapipe measurements. A43.2 is now checked.

F4: A91's plan note called minimal installation blocked, while S5 records a
clean local-tarball install that loads agents and gives actionable addon
installation guidance. That satisfies its stated minimal-install clause.
A91 stays checked. Registry publishability and a clean installed-addon render
remain release limitations. A42 stays checked because its tested admission,
cleanup and missing-driver behavior are distinct from A49/A50's unmet
production operational budgets.

F5: N2's historical codec note described relative maximum/0.1-code mean limits.
The current driver and passing combined CI instead use p99/0.5-code mean
regression bounds. The current N2 summary now states the implemented limits.

A45 and A47, hardware work and production defaults were not changed. No other
checkbox was unticked. Earlier S1/S2/S5 failure checkpoints are superseded by
their later scoped results, not evidence that those completed tasks failed again.
