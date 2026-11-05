# N1 native working resources

N1's functional gate is met on Vulkan/lavapipe, Metal and D3D11/WARP. A30, A31, A33 and A35 have production-compositor tests in the combined CI logs. A109 is implemented and tested against actual renders in the [N2 result](n2-native-export.md#a109-color-match-working-format-model). FP16 remains off by default. See the [clause audit](plan-status-audit.md) for test names, evidence locations and hardware limits.

The N1 resource changes did not alter schema, document settings, capture, export or presentation behavior. The internal entry point remains `PreviewCompositor::setWorkingFormat(nt::WorkingFormat::Rgba16F)`.

## Full-scene qualification

`tst_sceneprecision` evaluates parsed timeline documents through `PreviewCompositor`, with the production effect and raster-source registrations. `QQuickRenderControl` runs without showing a window. A hook compiled only into this test observes the working canvas before presentation. It reads RGBA16F components as `qfloat16`, or RGBA8 components as bytes. It does not call production capture to obtain numerical pixels.

| Task | Evidence |
|---|---|
| A30 | Canvas dimensions change through 96×48, 32×16 and 64×32. Paused resolution changes through Half, Quarter, Eighth and Full. RGBA8/FP16 changes on the same compositor assert the actual storage format. Group effects retain their existing full-canvas exception. Existing surface-pool tests cover format identity, reuse, eviction, release and byte budgets. |
| A31 | A half-float ramp enters the complete scene, passes inverse Levels, Screen over transparency, group effects and fixed-function composition. FP16 beats the RGBA8 control. Spatial denoise and following Levels process tiny alpha. Every read frame is checked for finite components. The detector itself rejects injected NaN, infinity and black pixels. |
| A33 | A 640×360 document contains real raster text and shape sources, an ellipse mask, a crossfade, a group effect and four-sample shutter accumulation. The same document is compared in both formats. Tests observe the previous-canvas state and a completed-canvas copy during clock advancement. Backward seeks reproduce the original settled pixels exactly. Document replacement restarts accumulation and prevents copying the old completed canvas in FP16. Format switches render successfully through the same instance. |
| A35 | Sixty iterations alternate two decoded 720p H.264 sources, seek backward and forward, and replace Levels parameters. Temporal denoise requests before/after decoded frames. Both in-place clip edits and document-generation replacements run. Effects use a central crop to bound software shader cost. Every settled sample has exact media, no missing media, no resource failures and successful loader reports. Open decoders stay within two paths times current/before/after sources. Process RSS and QRhi allocator usage are sampled and bounded after warmup. |

## Numerical results

The full scene uses gray values `(x+1)/65`, uploaded as premultiplied half floats. Maximum RGB error is measured against those uploaded samples. Inverse Levels compresses output white to 0.1 and expands input white from 0.1. Its bound is `max(2e-7, alpha * 0.002)`, allowing accumulated half-float rounding through the complete chain. No failed numerical bound was widened.

| Alpha | Operations | RGBA8 maximum error | RGBA16F maximum error |
|---|---|---:|---:|
| 1 | Inverse Levels, Screen, group Levels | 0.0214892 | 0.00146484 |
| 0.001 | Inverse Levels, Screen, group Levels | 0.000984192 | 0.00000190735 |
| 0.00001 | Identity Levels, Screen, group Levels | 0.00000983477 | 0.000000178814 |
| 0.0000001 | Identity Levels, Screen, group Levels | 0.000000119209 | 0 |
| 0 | Identity Levels, Screen, group Levels | 0 | 0 |

Each alpha also runs with spatial denoise before the Levels chain. FP16 settled output remains finite and nonblack for every nonzero alpha. Zero-alpha output is exactly zero. Intermediate read frames are checked for NaN and infinity as well.

There is a storage limit, separate from division safety. Half-float's smallest positive subnormal is about `5.96e-8`. Compressing RGB by ten at alpha `1e-7` necessarily rounds all RGB to zero. At alpha `1e-5`, the compression moves samples into the coarser subnormal region. The tiny-alpha safety scenes therefore use identity Levels and spatial denoise, retaining representable premultiplied RGB. The inverse-Levels benefit is qualified at alpha 1 and 0.001. This does not promise reversible processing below half-float storage precision.

The ancillary scene's maximum RGBA8/FP16 difference is 0.00847662, below its declared `4/255` bound for byte quantization across effect, mask, group and composition stages. This comparison preserves the existing byte alpha bridges in RGBA8 and omits them in FP16. It is not a claim of bit-identical filtering. No NaN, infinity or unexplained black settled frame was observed. No production renderer bug required a fix.

## Frame metadata audit

`ClipEffects.cpp::frameFor` calls `LayerFrame::rgbaFormat`, so every RGBA16F texture it receives is tagged `Rgba16FPremultiplied`. Its caller is `Encoder::result`. The encoder's intermediate targets all come from ScratchPool with `EffectContext::workingFormat`. Consequently those targets are RGBA8 in default mode. The float LUT is a separate sampler, never an `Encoder::result` frame.

The conversion near `PreviewCompositor.cpp:1180` applies to second-source frames, not every primary frame. A second source not tagged RGBA8 is converted into the selected working format before effects. Real decoded temporal-denoise sources exercise this seam in the FP16 stress scene. A primary registered float source also runs through the RGBA8 numerical control. Shader float behavior is selected by `EffectContext::workingFormat`, not the enum's integer value.

The native `LayerFrame` references were enumerated with ripgrep. Format consumers use named equality tests, ternaries or switches. `modeFor` and `Encoder::draw` explicitly map I420/NV12 to shader modes. No numeric serialization, ordinal cast, array indexing or arithmetic on `LayerFrame::Format` was found. Adding the float enumerator does not change those mappings. Audit output is saved under the build directory.

## Cost and memory

These measurements are preliminary. Other work was running on the machine. The scene is 640×360 with text, shape/mask, crossfade, group effects and four shutter samples. Each format renders 32 changed timeline times after warmup. Wall cost includes event processing, all shutter taps, synchronous test readbacks and GPU completion. It is not a playback throughput or isolated GPU-time measurement. Recording cost averages the whole scene run, including qualification operations.

| Working format | Wall ms / settled frame | Recording ms / render | Final pooled surface bytes |
|---|---:|---:|---:|
| RGBA8 | 72.2956 | 3.62819 | 1,859,584 |
| RGBA16F | 72.9251 | 3.07144 | 3,719,168 |

The whole ancillary run, which also switches formats, peaks at 22,308,828 Vulkan allocator bytes in each mode. These timing differences do not establish a speed advantage.

The decoded stress run peaks at 14,893,056 pooled surface bytes and 27,525,276 Vulkan allocator bytes. Warm/end allocator usage is identical at 21,995,676 bytes. Process peak RSS is 755,776 KiB. Warm/end RSS is 726,260 / 745,624 KiB. The latter half grows by 19,364 KiB, below the asserted 64 MiB bound. The GPU warm/end allowance is 16 MiB. Longer-duration process growth remains unverified.

QRhi `statistics().usedBytes` measures Vulkan allocator usage, including effects and temporal resources, rather than only the compositor pool. It excludes untracked driver allocations. On lavapipe this is software-device allocation, not a physical GPU VRAM measurement. Process peak RSS includes earlier numerical and ancillary scenes. The finite stress run meets these bounds. It does not prove indefinite-session behavior.

## Verification and remaining work

The native build passed with `ntbuild color-n0 tst_sceneprecision tst_workingprecision tst_effectsblend tst_surfacepool tst_framecache`. Exit status was 0.

`citest color-n0 '^(tst_sceneprecision|tst_workingprecision|tst_effectsblend_render|tst_effectsclip_render|tst_effectsmatte_render|tst_effectsadjustment_render|tst_surfacepool)$' -V` passed all nine entries, including preferences and media setup. Exit status was 0. The final source-generation reset assertion was then built and rerun with `citest color-n0 '^tst_sceneprecision$' -V`. All three CTest entries passed, with six QtTest cases and zero failures or skips. Exit status was 0.

The logged backend is Vulkan on `llvmpipe (LLVM 23.1.3, 256 bits)`. The helper used Xvfb, lavapipe, software decoding and isolated configuration.

Build and test logs are under `/home/mg/Projects/nodetool-film/build/color-n0/`: `n1-scene-build.log`, `n1-scene-final.log` and `n1-scene-reset.log`. `git diff --check` and a control-byte scan passed. No QML changed. No TypeScript checks, full CTest suite, desktop window or sound was used.

Production FP16 capture still rejects the request with `FP16 working capture requires the N2 delivery boundary`. The new test asserts both the rejection and absence of a byte capture. The hook is absent from production builds. N2 was not started.

At this local checkpoint, the compositor exit checks passed on the named software backend. Color Match still modeled byte intermediates. The later A109 implementation and combined CI supersede that limitation, as linked above.

Metal, D3D11/WARP, Windows hardware, OpenGL, FP16 hardware-decode interop, device loss, constrained physical-GPU peaks and release performance remain unverified. This run does not enable FP16 or qualify a release backend. Unsupported-format fallback remains N3 work.

## A30 transfer declaration

`LayerFrame::transfer` records the RGB transfer after matrix conversion using
FFmpeg transfer names. Its default is `unknown`. Decoding prefers the frame's
transfer tag, then the stream tag. Missing or unrecognized metadata stays
`unknown`. Software uploads, hardware frames and independent hardware cache
copies carry the declaration. Swscale's matrix/range and layout conversions do
not decode transfer, so they retain the source declaration.

Synthetic QPainter patterns and CSS/QColor raster sources declare sRGB
(`iec61966-2-1`). No upload, shader, conversion, schema or renderer default
changes. Compositor frame copies preserve the source declaration across storage
promotion, crop and effect-stage boundaries. Mixed container frames remain
`unknown`, since existing composition does not establish a common transfer.

`transferSurvivesLayerContracts` registers a BT.709 source and checks the frame
received after production clip effects and masking in RGBA8 and RGBA16F.
It also checks that a default frame remains unknown.

The transfer mismatch remains: export sets `AVCOL_TRC_BT709`, while native
exposure decodes and re-encodes sRGB, and Color Match models sRGB. A source tag
is evidence about its incoming samples, not proof that this mixed encoded-domain
pipeline or its export has that transfer. N4 must reconcile these assumptions.

The focused build passed with `ntbuild color-n0 tst_sceneprecision
tst_workingprecision tst_clipeffects`. The Vulkan/lavapipe scene suite passed
seven cases with no failures or skips, including the transfer-contract check.
The initial combined CTest run exited 0. Its clip-effects suite skipped the
artifact-producing `exportDocuments` case without `NT_D6_OUTPUT`, so it was rerun with
`NT_D6_OUTPUT` pointing into the build directory. It passed 67 cases with no
failures or skips. The restored working-precision suite also passed six cases
without skips. This final CTest run exited 0. Logs are `n1-transfer-build.log`,
`n1-transfer-tests.log` and `n1-final-tests.log` in the build directory.

## A31 shared inverse-Levels vectors

The native test loads
[`packages/gpu/tests/fixtures/inverse-levels.json`](../../../../packages/gpu/tests/fixtures/inverse-levels.json).
It records all 256 opaque gray byte inputs, the identity reference, gamma 0.5
then 2, the common clamp/nearest-integer delivery quantizer, FP16 acceptance
bounds and S0's observed results. `film/color-s0` must adopt this file in
`precisionBenefit.test.ts`. That worktree was read only for this task.

`sharedInverseLevels` uploads those exact bytes and runs the production
`ClipEffectStage` and qsb shader pipeline in both formats. It checks every RGB
component against the same reference, finite working values, opaque alpha,
monotonicity and the final distinct-level count. Readback uses a test-local
transfer-source texture, without opening production FP16 capture.

| Working format | Native distinct codes | Native maximum code error | Shared S0 distinct / maximum code error | Native maximum working error in codes |
|---|---:|---:|---:|---:|
| RGBA8 | 192 | 11 | 192 / 11 | 11 |
| RGBA16F | 256 | 0 | 256 / 0 | 0.248535 |

The final diagnostic metrics agree with S0's `a81-benefit.md`. The shared report
does not record diagnostic working-error values or individual output samples,
so these results do not establish component-wise working-texture equality.
The existing native white-point compression/expansion and tiny-alpha tests are
retained as complementary checks. They are not substituted for the shared
gamma diagnostic. No numeric bounds or effect meanings changed.

A negative control changed the fixture's gammas to identity. The byte route
then retained all 256 codes and correctly failed the assertion that detects
intermediate precision loss. CTest exited 8. The fixture was restored, and the
final working-precision suite passed six cases with no failures or skips.
The control log is `n1-shared-negative.log`.

Both focused builds exited 0. `n1-shared-build.log` and
`n1-shared-readback-build.log` record them. The diagnostic measurements are in
`n1-shared-vectors.log`. The final run used
`NT_D6_OUTPUT=<build>/n1-clipeffects-artifacts citest color-n0
'^(tst_clipeffects|tst_workingprecision)$' -V` and exited 0. Clip effects passed
67 cases, including artifact export, with no skips. Scene precision had already
passed seven cases without skips in `n1-transfer-tests.log`.

`git diff --check` and the changed-file control-byte scan passed. No TypeScript
tests, typecheck, lint, affected tests, harness gate or full CTest suite ran.
FP16 remains off by default. At this checkpoint, N2 and A109 had not started. No schema or setting
was added.
