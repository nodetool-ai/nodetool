# N1 native working resources

The requested full-scene numerical and lifetime qualification passes on Vulkan/lavapipe. The complete corrected N1 task list is not finished. A30's transfer declaration, A31's shared-vector comparison and A109's precision-aware Color Match model remain outstanding. Keep FP16 off by default.

No schema, document setting, capture, export or presentation behavior changed. The internal entry point remains `PreviewCompositor::setWorkingFormat(nt::WorkingFormat::Rgba16F)`.

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

The local compositor exit checks now pass on the named software backend. The full corrected N1 plan remains incomplete: the LayerFrame transfer declaration is absent, native vectors have not been reconciled with the shared set, and Color Match still models byte intermediates. A109 belongs to N1 in the corrected plan. Its implementation is not postponed to N2 merely because production capture remains byte-only.

Metal, D3D11/WARP, Windows hardware, OpenGL, FP16 hardware-decode interop, device loss, constrained physical-GPU peaks and release performance remain unverified. This run does not enable FP16 or qualify a release backend. Unsupported-format fallback remains N3 work.
