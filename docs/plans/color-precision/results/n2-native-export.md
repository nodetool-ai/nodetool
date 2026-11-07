# N2 native capture and delivery

A32, A45.2 and A84.2 are implemented and qualified on the tested routes.
The decoded full-frame resize comparison closes A84.2's remaining clause on
Vulkan/lavapipe. FP16 remains off by default. The new comparison has not yet
run on Metal, D3D11/WARP or OpenGL.

Combined CI passes on Metal, D3D11/WARP and Vulkan/lavapipe under sanitizers.
The logs are `/home/mg/Projects/nodetool-film/tmp/x84m.log`, `x84w.log` and
`x84s.log`. Each records passes for `export_precision`, `native_backend_routes`,
`tst_workingprecision`, `tst_sceneprecision`, `tst_monitorcompositor`,
`tst_framecapture`, `tst_colormatch_render` and `tst_deliveryframe`.
OpenGL has separate local scene, monitor and capture evidence below and in
[backend qualification](n3-native-backends.md). These results do not qualify
physical Windows GPUs, hardware decode interop or release throughput.

## Task status

| Task | Status and evidence |
|---|---|
| A84.1 | Met. `typedWorkingCapture` and `offscreenTypedCapture` check typed, owned, undithered capture, layout, orientation and cancellation. |
| A84.2 | Met on Vulkan/lavapipe. `export_precision` compares every decoded PNG RGB and MP4 YUV sample against an independently resized float canvas for fit/fill up/down and odd-canvas video. Pre-encode resize and codec errors are measured separately. |
| A32 | Met. `presentationQuantization` checks final dithering, paused stability and undithered capture. OpenGL scene and monitor checks qualify orientation independently. |
| A84.3 | Met. `export_precision` covers PNG/ZIP and MP4, opaque/low-alpha edges, cancellation and cleanup. `alphaAndPng` separately checks straight/zero-alpha conversion. |
| A41.3 | Met. `export_precision` inspects actual decoded pixels, YUV420P/range/BT.709 tags and codec loss separately from pre-encode identity. O1 retains the transfer-tag mismatch. |
| A43.3 | Met. `previewOffscreenWorkingParity` compares decoded original and float fixtures, fixed seeds and capture isolation in both precisions. |
| A45.2 | Met. Monitor resolution/group/shutter tests and scene mask/outset tests check observed float canvas/scratch allocation, geometry and full-size capture. |
| A109 | Met. `colorMatchWorkingFormat` compares solved parameters with an actual render. `floatAnalysisPreservesSubByteSamples` checks float analysis. |

The current codec comparison in `check-precision.py` permits at most one code
of added p99 error and 0.5 code of added mean error for FP16 relative to RGBA8.
Each encode also requires absolute mean error at most one YUV code.
Pre-encode identity remains at most one code per plane. The historical
maximum/0.1-mean comparison below was superseded. Decoded RGB uses the measured
codec maxima as a separate sanity bound, not as a working-precision oracle.

See the [clause audit](plan-status-audit.md) for source/test links and remaining
work.

## A84.2 decoded spatial acceptance

The existing `export_precision` check now renders an asymmetric, three-color
65x49 scene with inverse Levels in FP16. `NT_TEST_EXPORT_FLOAT` observes the
straight FP32 canvas before resizing. Python computes the two-dimensional
reference from that same canvas with cell-overlap area integration for shrinking
and pixel-center bilinear interpolation for enlargement. Expected fit sizes,
bar offsets and fill crops are explicit fixture values. The oracle calls no
Qt scaling or delivery resize helper. It checks the complete frame, including
edges, bars and crops. Existing helper tests retain their tighter float checks.

PNG is compared in decoded RGB codes. For MP4, FFmpeg converts the independently
resized reference to wide YUV at the same size, using the existing BT.709 matrix,
range and chroma filter. It performs no spatial resize. The reference planes
remain fractional 8-bit codes. Every unencoded YUV sample must be within one
code of that reference. Every decoded YUV sample must be within one code plus
the measured maximum codec loss. The one-code allowance comes from rounding
by at most half a code plus centered dithering by less than half a code, not
from fitting measured results. Codec loss retains its existing independent
mean and regression gates. This qualifies resize/delivery, not renderer
accuracy or an independent implementation of the YUV color conversion.

All numbers below are code errors on Vulkan, adapter
`llvmpipe (LLVM 23.1.3, 256 bits)`. PNG is lossless, so its resize and decoded
errors are the same. MP4 used the system FFmpeg software H.264 encoder.

| Format / geometry | Resize max / mean | Decoded max / mean | Codec max / mean |
|---|---:|---:|---:|
| PNG fit down | 0.967534 / 0.151773 | 0.967534 / 0.151773 | 0 / 0 |
| PNG fill down | 0.960167 / 0.190124 | 0.960167 / 0.190124 | 0 / 0 |
| PNG fit up | 0.991372 / 0.155106 | 0.991372 / 0.155106 | 0 / 0 |
| PNG fill up | 0.981125 / 0.189099 | 0.981125 / 0.189099 | 0 / 0 |
| MP4 fit down | 0.988281 / 0.165154 | 1.894531 / 0.210314 | 1 / 0.123698 |
| MP4 fill down | 0.968750 / 0.203601 | 1.953125 / 0.257621 | 1 / 0.152778 |
| MP4 fit up | 0.976563 / 0.160205 | 1.925781 / 0.171976 | 1 / 0.056076 |
| MP4 fill up | 0.992188 / 0.192900 | 2.273438 / 0.214132 | 2 / 0.070747 |
| MP4 odd canvas | 0.980469 / 0.184594 | 1.894531 / 0.217346 | 1 / 0.104601 |

A deliberate mutation forced the FP16 export call to use fill for fit requests.
The first full-frame PNG fit-down comparison failed with maximum error
139.869793 codes and mean 12.947266, against the unchanged one-code bound.
CTest reported one failed test and exited 8. Restoring the mode, rebuilding
and rerunning passed. No resize defect was exposed. Production resizing,
RGBA8 output calculations, FP16 defaults, BT.709 tags and pass-through remain
unchanged. Only the opt-in float observation was added to export code.

Verification used `ntbuild color-n2 nodetool-timeline tst_deliveryframe` and
`citest color-n2 '^(export_precision|tst_deliveryframe)$' -V`. Both passed,
including the preferences fixture, with zero failed or skipped tests.
The default Qt-linked FFmpeg initially failed with an unavailable encoder.
The local LGPL build uses libavcodec ABI 62, while this binary needs ABI 63.
`CITEST_LD=/home/mg/Projects/nodetool-film/tmp/a842-system-ffmpeg` supplies
symlinks to the system ABI-compatible FFmpeg libraries without replacing Qt.
`TMPDIR` stayed under `/home/mg/Projects/nodetool-film/tmp`.

Logs in that directory are `a842-build.log`, `a842-test.log`,
`a842-system-test.log`, `a842-negative-build.log`, `a842-negative-test.log`,
`a842-restored-build.log`, `a842-restored-test.log` and `a842-adapter.log`.
No TypeScript tests, typecheck, lint, `harness gate`, `/verify`, full native
suite, sanitizer build or additional adapter tests ran in this round.

## Historical checkpoints

The sections below retain the implementation sequence and local evidence.
Their status statements describe those checkpoints. The table above supersedes
claims that A32, A45.2 or A109 are unimplemented or that Metal/D3D11 await CI.
The resize-helper pass below is separate from the decoded spatial test added here.

## Capture boundary

[PreviewCompositor](../../../../native/timeline/src/preview/PreviewCompositor.cpp)
now reads its canvas using `Format_RGBA8888_Premultiplied` or
`Format_RGBA16FPx4_Premultiplied`, selected from the captured texture. The
completion lambda retains that format rather than consulting mutable renderer
state. It copies the readback before reuse and retains the existing backend
vertical flip and request-generation handling. Capture stays before the item
blit, independent of the outer RGBA8 scene target.

[OffscreenFrames](../../../../native/timeline/src/export/OffscreenFrames.h)
accepts an internal working-format argument, defaulting to RGBA8.
`captureWorkingAt` returns the owned premultiplied image without conversion.
`captureAt` preserves the legacy RGBA8 straight conversion. For FP16 it returns
straight RGBA32F through Qt's float image conversion, without byte quantization.
The final delivery boundary, including alpha-zero behavior, resampling and
dithering, is still A84.2. Do not enable FP16 export using this change alone.

`typedWorkingCapture` compares every captured component with the existing raw
GPU observer. Maximum capture error is **0** in both formats. It checks
64x32 dimensions, tight row strides of 256/512 bytes, vertical asymmetry,
repeat stability, owned-image lifetime and one-shot consumption. Full, Half,
Quarter and Eighth preview preferences all yield the same full-size capture,
even when alpha display and transparency grid are enabled.

`offscreenTypedCapture` exercises a 65x49 registered premultiplied image source
with partial alpha. Both formats retain the opaque capture background. It
checks raw and straight image formats, repeated captures, cancellation followed
by another request and vertical orientation. The test source is registered
explicitly. The first version omitted registration and received synthetic
pixels instead, so its orientation assertion failed. The corrected test passes.

The existing scene suite still covers inverse Levels, tiny alpha, text, shapes,
groups, masks, temporal reuse and decoded backward scrubbing. Its opaque
compression/expansion scene reports maximum normalized working error 0.0214892
for RGBA8 and 0.00146484 for FP16. These are working measurements. This round
establishes no FP16 precision numbers through final delivery.

## Direct default-output comparison

Before production edits, the binary was built from `5b9272ecbd`. A build-local
Python driver exported a one-frame 65x49 shape document with a Levels grade.
The same driver then ran against the changed binary. Each run used isolated
`XDG_CONFIG_HOME`, Xvfb, `QSG_RHI_BACKEND=vulkan`, lavapipe and software decoding.
No application window or sound was used.

The comparison decoded each actual PNG or MP4 frame to RGBA with FFmpeg and
compared every byte. All six frames are **byte-identical**:

| Route | PNG dimensions | Video dimensions | Comparison |
|---|---|---|---|
| Native odd canvas | 65x49 | 64x48 | Exact |
| Explicit fit downscale | 48x32 | 48x32 | Exact |
| Explicit fill upscale | 96x80 | 96x80 | Exact |

The fixture produces nonblack pixels and different spatial values after
resampling. This is a default-route regression comparison, not acceptance of
FP16 resampling. A84.2 still needs both scale modes in both size directions,
float-reference comparisons and separate codec-error measurements.

`ffprobe` reports ordinary `yuv420p`, limited range (`tv`), and BT.709 matrix,
transfer and primaries on the native-size MP4. No higher-depth delivery is
claimed. The BT.709 transfer tag still disagrees with exposure and Color
Match's sRGB assumptions. Exact before/after equality does not establish a
correct common transfer interpretation. No transfer behavior changed here.

The reported headless backend is **Vulkan**, device
`llvmpipe (LLVM 23.1.3, 256 bits)`. The backend was explicitly selected. Its
unset-environment default, OpenGL orientation, physical GPUs, Metal and
D3D11/WARP remain unverified. No timing or release-performance claim is made.

## Verification

All logs and comparison artifacts are under
`/home/mg/Projects/nodetool-film/build/color-n0`, outside the commit.

- `ntbuild color-n0 nodetool-timeline tst_framecapture` built the baseline, exit 0.
- The new typed-capture test ran before the implementation and failed at the
  existing FP16 rejection, exit 1. RGBA8 passed. Log: `n2-capture-negative.log`.
- `ntbuild color-n0 tst_sceneprecision tst_framecapture nodetool-timeline`
  passed, exit 0. Log: `n2-capture-build.log`.
- `citest color-n0 '^tst_sceneprecision$' -V` passed eight QtTest cases, with
  zero failures or skips, exit 0. Log: `n2-scene.log`.
- The corrected frame-capture build passed, exit 0. Log:
  `n2-capture-final-build.log`.
- `citest color-n0 '^tst_framecapture$' -V` passed seventeen QtTest cases, with
  zero failures or skips, exit 0. Log: `n2-framecapture-final.log`.
- `python3 <build>/n2-compare.py before` and `after` passed, exit 0. Driver,
  fixtures, exports, decoded frame bytes and SHA-256 values are retained in
  `n2-compare.py`, `n2-compare.json`, `n2-before/`, `n2-after/`, `n2-before.log`
  and `n2-after.log`. An initial concurrent after-run hit an Xvfb cleanup error
  after completing its first export. The successful comparison reran serially.
- `git diff --check`, changed-file control-byte checks and local Markdown
  file-link checks passed.

Only the affected native suites and their fixture prerequisites ran. No test
was skipped. No full CTest suite, TypeScript checks or QML edits were used.

## A84.2 follow-up: conversion helpers only

This round stops before connecting ExportEngine. A84.2 is **not complete**,
and A84.3 and A41.3 were not started as separate tasks. The N2 exit gate is
**not met**. There is no FP16 export selector, schema change, setting or QML
property. FP16 remains off by default. No export throughput measurement was
made because no FP16 export route was enabled.

[DeliveryFrame.h](../../../../native/timeline/src/export/DeliveryFrame.h)
provides the internal conversion groundwork. It promotes premultiplied FP16
capture to FP32, divides RGB by positive alpha, and sets hidden RGB to zero
at zero or negative alpha. Nonfinite captured components are rejected.
It retains straight FP32 through Qt smooth resizing, centered fit with opaque
black bars, centered fill crops, and odd-canvas stretching. Only the final
RGBA8 helper clamps and quantizes RGB. An 8x8 spatial Bayer tile is applied
once there. Alpha is rounded without dithering. The input images are unchanged.
These helpers are currently used only by the new test. They do not yet prove
precision survives an ExportEngine scene.

### Why the video connection remains open

The installed libswscale 10.1.102 legacy path was probed with blue impulses
using the exact RGBA input, YUV420P output, SWS_BICUBIC flag and BT.709
full-to-limited conversion from ExportEngine. Horizontal chroma averages
adjacent pixels. Vertical chroma has wider bicubic support and negative lobes.
For a blue row at source y=4, U offsets from neutral across output rows are
`[-1, 14, 49, -5, 0, 0, 0, 0]`. For a blue column at x=4, they are
`[0, 0, 56, 0, 0, 0, 0, 0]`. Blue luma is code 32, consistent with limited
BT.709. A direct 2x2 float average would change coloured edges. The new test
pins the horizontal pair and verifies positive and negative vertical support.
It does not establish full chroma-siting equivalence for a replacement.

The next implementation must preserve that sampling behavior from float data,
then dither the final limited-range Y, U and V codes after subsampling.
It must also qualify the odd-canvas resize against a float reference.
Do not connect the PNG helper ahead of an unqualified video conversion and
claim A84.2 complete. No transfer conversion was added. The later
[A101 owner decision](../high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery)
accepts the BT.709 transfer-tag mismatch and keeps pass-through delivery (O1).

### Verification for this partial round

`ntbuild color-n0 tst_deliveryframe nodetool-timeline` passed, exit 0.
`citest color-n0 '^tst_deliveryframe$' -V` passed seven QtTest cases,
zero failures and zero skips, exit 0. Its preferences fixture also passed.
An earlier test invocation raced CMake regeneration and found no tests. That
invocation is not counted as verification.

The quantizer test sweeps 25,501 constant code values across complete 8x8
tiles. It asserts maximum error at most one code, absolute mean bias below
0.1 code, unique tile ranks, zero-mean noise and spatial repeatability.
Actual PNG files are encoded and decoded for seven constant patches. Their
RGB errors satisfy the same bounds and alpha stays 255. Separate tests check
zero/low-alpha division, PNG byte round trips, input preservation, float
resampling at 48x32, 96x80 and 64x48, both fit and fill, and odd-canvas stretch.
These are helper-level results, not inverse-Levels scene-delivery results.
No lossless-versus-video precision benefit or codec-error number is established.

The six-export harness was run before and after this round using isolated
configuration and Vulkan/lavapipe. PNG and video at odd canvas, fit downscale
and fill upscale remain byte-identical, also matching the original N2 baseline.
The app's export code is unchanged. No physical-GPU qualification is claimed.

Build-local artifacts are `a842-final-build.log`, `a842-tests.log`,
`a842-before.log`, `a842-after.log`, `a842-compare-check.py`,
`n2-a842-before/`, `n2-a842-after/`, and `chroma-probe.cpp`.
Nothing under the build directory is committed. Full scene-delivery precision,
FP16 cancellation/cleanup, complete chroma compatibility, output-tag validation
of FP16 video, and export throughput remain unverified.

Disabling the dither deliberately made `tst_deliveryframe` fail, exit 8.
The original implementation was restored, rebuilt and retested successfully,
exit 0. Logs are `a842-negative-build.log`, `a842-negative-test.log`,
`a842-restored-build.log` and `a842-restored-test.log`. Changed-file control-byte
checks, local Markdown links and `git diff --check` passed.

## A84.2 export connection

The connection is now implemented. `NT_TEST_EXPORT_FP16=1` selects it only
for export diagnostics. The default remains RGBA8. No document field, saved
setting, QML property, transfer change or higher-depth output was added.

FP16 capture is unpremultiplied and resized in FP32. PNG uses the existing
final RGBA8 quantizer. Video rounds into native-endian RGBA64 staging, then
uses the existing BT.709 full-to-limited bicubic swscale conversion with
YUV420P16 staging. The final plane quantizer divides limited-range codes by
256 and applies the spatial tile once, after chroma subsampling. Swscale
staging dithering is disabled. The extra buffers are per-frame and reused.
The encoder still receives YUV420P.

The proposed direct RGBA64-to-YUV420P route retained the filter but introduced
swscale's own spatial dither. The 16-bit output staging avoids that extra
8-bit rounding. RGB row/column impulse tests at every position in a 16x16
image compare all three planes against the legacy conversion. The maximum
allowed difference is one code, including negative bicubic lobes. They pass.
This measures filter/matrix/range compatibility, not bit-identical FP16 output.

`ntbuild color-n0 nodetool-timeline tst_deliveryframe` and the focused
`citest color-n0 '^tst_deliveryframe$' -V` passed with no skips. All six decoded
default exports exactly match `n2-a842-before/`. The comparison artifacts are
`n2-connected/`, `n2-connected-baseline.log` and `n2-rgb-chroma.log` in the build
directory. No build artifacts are committed.

The scene driver has also demonstrated lower inverse-Levels error through
PNG and MP4 in every requested output geometry. Further delivery qualification
is recorded below. Full spatial comparison against an independently resampled
float reference remains open, so A84.2 acceptance and the N2 exit gate are not
yet fully met.


## A84.3 delivery acceptance checks

`export_precision` now exports inverse Levels through real PNG/ZIP and MP4,
decodes both, checks native odd dimensions and fit/fill upscales and downscales,
and asserts an FP16 improvement against the expected RGB constant. It checks
opaque output alpha, the ZIP manifest, cancellation after one encoded frame,
absence of published partial output and removal of staging directories.
Identity scenes include opacity 1 and 0.001 over the existing capture background.
Every identity pixel is compared, not only the interior patch.

The conversion test explicitly covers FP32-to-RGBA64 rounding and the final
limited-range plane conversion. Across a complete dither tile, one code interval
has 65 distinct means in steps of 1/64. Individual delivered samples remain
8-bit. Alpha-zero handling and undithered alpha rounding remain covered.

The final helper suite passes eight QtTest cases with no failures or skips.
The end-to-end acceptance check deliberately remains failing: the even 64x48,
no-export-resize identity scene differs at opaque shape edges by up to 25 RGB
codes in PNG and 26 in decoded MP4 on lavapipe. Low-opacity full-frame deltas
are at most one code. Cancellation and cleanup pass for both formats and both
working precisions. A84.3 is therefore exercised but not fully accepted.

Earlier odd-canvas identity video differed by 18 codes at edges. That comparison
also changes the resize implementation, from legacy swscale to float Qt resize.
The even-canvas PNG failure proves that resizing at the export seam and codec
loss cannot account for the entire same-picture discrepancy. Do not widen the
identity tolerance or enable FP16 by default on this evidence.

The latest build also included concurrent, uncommitted changes to `clip.frag`
that this task did not author or commit. The even-canvas PNG failure was already
reproduced before that rebuild. Those renderer edits did not remove it.
The unrelated working-precision test and package-lock edits were left untouched.
Build and CI logs are `n2-a843-build.log` and `n2-a843-ci.log`. The CI command
exits 8 because `export_precision` fails, not because a test was skipped.


## A41.3 decoded output and codec separation

The test-only `NT_TEST_EXPORT_YUV` observer saves the actual packed YUV420P
frame immediately before encoding. The acceptance driver decodes the MP4 to
YUV420P and compares every sample with that observation. This measures codec
loss without conflating RGB conversion, chroma subsampling or renderer error.
It separately decodes to RGBA for the expected-scene comparison.

On Vulkan/lavapipe, the final 8x8 interior-patch comparison reports these mean
absolute RGB errors in byte codes. The smaller patch excludes antialiased shape
boundaries in the downscaled case.

| Native-size inverse Levels | RGBA8 working | FP16 working |
|---|---:|---:|
| PNG, lossless delivery | 4.333333 | 0.171875 |
| Decoded MP4 | 3.000000 | 0.921875 |

FP16 improves the interior metric for all five geometries in both formats.
This does not turn the full-frame edge failure into a pass. The earlier 16x16
native-size patch measured MP4 errors 3.166667 and 0.923177. The real-GPU helper
run measured 4.166667 and 0.923177 on that larger patch, and the same PNG errors.
Do not compare differently sized patches as a performance or precision trend.

Across the final test's actual video files, codec error is at most two YUV
codes, with worst whole-frame mean absolute error 0.072483. For native-size
inverse Levels it is at most one code, with means 0.035373 for RGBA8 and
0.028429 for FP16. These values are much smaller than the identity-edge failure.

Every inspected MP4 is `yuv420p`, limited range `tv`, with BT.709 matrix,
transfer and primaries tags. PNG is ordinary 8-bit RGB/RGBA with opaque alpha.
These tags retain existing behavior. They do not resolve the previously noted
BT.709-tag versus sRGB-assumption mismatch. No higher-depth delivery is claimed.

A single preliminary FP16 measurement exported one 65x49 scene frame to 64x48
MP4 at **1.841 frames/second including process startup**, on lavapipe. It is
recorded in `n2-delivery-proof2/metrics.json`. No cost sweep or repeated
throughput measurement was made, and this tiny export is not a release-speed
claim. The final test driver does not collect timing.

### Final verification and stopping point

`ntbuild color-n0 nodetool-timeline tst_deliveryframe` exits 0.
`citest color-n0 '^(tst_deliveryframe|export_precision)$' -V` and the same regex
through `nttest`, with isolated `XDG_CONFIG_HOME`, both exit 8 solely on the
identity-edge assertion. The helper suite passes all eight cases on both.
Lavapipe's PNG/MP4 maximum deltas are 25/26 codes. The real-GPU helper run's
are 26/25. Neither run skips a test. The final A41.3 rerun also exits 8 on the
same two identity assertions. Its codec, tag, opacity, cancellation, precision
and dimension assertions all pass. Logs: `n2-a843-ci.log`, `n2-a843-gpu.log`
and `n2-a413-ci.log`.

The latest binary's six FP16-off decoded exports still match
`n2-a842-before/` byte for byte, including the concurrent shader edit present
in that build. Artifacts: `n2-connected-final/` and
`n2-connected-final-baseline.log`.

The N2 exit gate is **not met**. The sound stopping point is a default-off
FP16 export connection, explicit quantization tests, and a reproducible failing
same-picture gate. Resolve the opaque shape-edge discrepancy before enabling
FP16. Full-frame explicit-size comparison against an independent float-resize
oracle is also unverified. OpenGL, Metal, D3D11/WARP, longer streaming/resource
runs and release throughput remain unqualified. Nothing was pushed.


## Clean-tree edge investigation

This round starts at `312086a4c4` in `film/color-n2`. It does not use the
uncommitted `color-n0` shader or test edits. The clean lavapipe reproduction
still reports maximum identity differences of 25 PNG codes and 26 decoded
MP4 codes. Both low-opacity comparisons remain at one code. The earlier
lavapipe numbers therefore did not change when reproduced without those edits.

The new `identityShapeWorkingCapture` test compares typed compositor captures
before delivery. Its maximum RGB difference is 24.9956 codes. Captured alpha
is opaque and identical. Transparent preview working pixels have the same
24.9956-code RGB difference and a 1.02198-code maximum alpha difference.
This locates the failure in N1 leaf placement, before export conversion,
resizing, dithering or encoding. Preview uses the same affected evaluation.

`composite.frag` explicitly implements the web placement contract: unpremultiply
each leaf texel, interpolate straight RGB and alpha, then premultiply the
result. N1 selected that path only for RGBA8 working mode. FP16 instead used
hardware filtering of premultiplied texels. The shape raster source itself is
RGBA8 in both modes. This identity scene has no effect chain, so `straight()`
in `clip.frag` and the effect alpha bridges cannot cause its discrepancy.

The independent two-texel reference places opaque red next to transparent
black and doubles its size. At the sampled output pixel, interpolation gives
straight red 3/4 and alpha 3/4. The intended premultiplied red is therefore
9/16 = 0.5625. RGBA8 gives 0.560784 with alpha 0.749020, within one byte code.
Before the fix, FP16 gives red and alpha 0.748535. Adding identity Levels gives
FP16 red and alpha 0.75. Both fail the reference. Premultiplied filtering is a
different reasonable rendering convention, but it is not the declared leaf
placement contract. RGBA8 is the intended picture for this compatibility gate.

The fix selects the existing straight-byte filter for byte leaf sources in
both working modes. FP16 leaf effect results use a separate straight-float
mode, without byte rounding or clamping. Group composition is unchanged.
The new float mode is restricted to FP16 working mode. Default RGBA8 behavior,
`clip.frag`, delivery tolerances and the failing export test are unchanged.
No alpha bridge, transfer conversion, setting, schema or QML property was
added. FP16 remains off by default.


### Edge-fix results and remaining delivery gate

After the fix, typed working capture has maximum RGB error 0.442137 byte
codes and identical opaque alpha. Transparent preview RGBA and alpha errors
are at most 0.486940 codes. Both two-texel cases produce exactly red 0.5625
and alpha 0.75 in FP16, including the identity-effect promotion path.

`export_precision` still exits 8 through CTest. PNG identity now passes at
one code. Decoded MP4 identity reaches five codes against the unchanged
four-code limit. Both low-opacity comparisons remain at one code. The
inverse-Levels improvement, output tags, dimensions, alpha and cancellation
checks still pass. The renderer edge blocker is fixed, but the complete N2
exit gate is **not met**.

The retained artifacts separate this residual from rendering. For the opaque
identity MP4, pre-encode Y, U and V each differ by at most one code between
working modes. Decoding those unencoded planes with the same BT.709 limited
interpretation gives maximum RGB difference four. Each encoded file differs
from its own unencoded YUV by at most one code. At output pixel (20, 14),
pre-encode RGB is (113, 145, 186) for RGBA8 and (115, 144, 188) for FP16.
Decoded MP4 RGB is (111, 146, 188) and (116, 145, 189), respectively. The
five-code red difference combines delivery rounding and codec loss. No
exporter or codec adjustment was made to force this fixture under its limit.

All six decoded FP16-off exports from the final binary match the read-only
`color-n0/n2-a842-before/` baseline byte for byte. This covers PNG and MP4 at
native size, fit downscale and fill upscale. The source and build are confined
to `wt/color-n2` and `build/color-n2`. Nothing in `wt/color-n0` was edited.

Artifacts are under `/home/mg/Projects/nodetool-film/build/color-n2`:
`n2-clean-tests.log` records the negative regression tests, `n2-final-build.log`
records the final successful build, and `n2-fixed-tests.log` records the
requested native checks. `n2-fixed-artifacts/` retains the scenes, decoded
pixels, unencoded YUV and codec measurements. `n2-final/` and
`n2-final-byte-comparison.txt` retain the default-output evidence. The initial
build log is `/home/mg/Projects/nodetool-film/tmp/n2-clean-build.log`.

The final native verification ran with `citest color-n2` and isolated
configuration. `tst_deliveryframe`, `tst_workingprecision` and
`tst_sceneprecision` pass with no skips. The first `tst_clipeffects` invocation
skipped its opt-in fixture exporter. Rerunning with
`NT_D6_OUTPUT=build/color-n2/n2-clipeffects-documents` completes all 67 cases,
with zero failures and zero skips, exit 0. Its log is
`n2-clipeffects-noskip.log`. `export_precision` remains the sole failing
requested check, for the residual decoded MP4 difference described above.
No test was removed or relaxed. No TypeScript checks or full CTest suite ran.
`git diff --check`, changed-file control-byte checks and local document links
pass. The renderer and regression tests are committed as `43e41a545e`.
Nothing was pushed.

## MP4 identity gate correction

A41.3 now asserts same-picture identity before encoding. Retained opaque and
low-opacity exports measure maximum Y/U/V differences of 1/1/1 code. The
new plane assertion permits one code. A deliberately shifted opaque Y plane
fails that same assertion at 96 codes. The original bytes pass again. No
production shader or input artifact was changed for this proof.

The separate codec gate remains maximum eight codes and mean absolute error
one code in YUV. Decoded RGB deltas remain reported, with a sanity bound
derived from two codec errors plus the one-code delivery difference and the
BT.709 limited conversion gain. PNG identity retains its one-code bound.
No other tolerance changed.

`citest color-n2 '^export_precision$' -V` passes, exit 0. The fresh opaque
MP4 identity still measures five decoded RGB codes, with unencoded Y/U/V
differences of 1/1/1. Low-opacity MP4 measures one decoded RGB code and
1/1/1 unencoded codes. Logs in `build/color-n2`: `n2-yuv-final.log` and
`n2-yuv-negative-proof.log`. FP16 remains off by default.

## A43.3 preview/offscreen qualification

`previewOffscreenWorkingParity` compares every undithered working component
from preview capture with `OffscreenFrames::captureWorkingAt`. Both use the
same original frame at 500 ms, capture background, Levels gamma 0.8 and fixed
grain seed 17. The fixtures cover an original decoded 720p video frame and
a vertically asymmetric float frame with alpha 0.37. Both RGBA8 and FP16
match exactly at Full, Half, Quarter and Eighth preferences, with zoom, alpha
display and transparency grid enabled in preview. Repeated offscreen
captures also match. Changing the seed to 18 produces a valid, different
image. Restoring seed 17 restores exact equality.

This adds test coverage through the production compositor and offscreen
evaluator. It changes no production renderer, resolution control, format,
setting or document. The outer export render target remains RGBA8.

The final native build passes with `ntbuild color-n2 nodetool-timeline
tst_sceneprecision tst_deliveryframe tst_workingprecision tst_clipeffects`.
The requested five-check regex passes through `citest color-n2`, exit 0.
Clip-effects completes all 67 cases with zero skips. Logs are
`build/color-n2/n2-round-final-build.log` and `n2-round-final-tests.log`.
A final test-only change requires the changed-seed image to be non-null
before accepting its difference. Its separate build and scene-suite rerun
both pass, exit 0, with zero skips. They are recorded in `n2-parity-proof-build.log` and `n2-parity-proof-tests.log`.

### Stopping point

This round stops after the MP4 assertion and A43.3. A45.2 remains partial:
full-resolution capture isolation now has preview/offscreen parity evidence,
but actual allocation, project geometry and mask/outset qualification across
resolution controls remains. A32 remains unimplemented: the final FP16
presentation conversion/dither and GL orientation proof need a separate
renderer change and qualification round. No presentation shader was changed.

N2's exit gate is **not met**, even excluding A109 and other backends. The
independent full-picture float-resize oracle also remains unverified. This
round qualifies Vulkan/lavapipe only. It makes no hardware, throughput,
long-run resource, OpenGL, Metal or D3D11/WARP claim. FP16 stays off by
default. Nothing was pushed.

The final FP16-off comparison reruns PNG and MP4 at native size, fit downscale
and fill upscale. All six decoded RGBA frames are byte-identical to the
read-only `/home/mg/Projects/nodetool-film/build/color-n0/n2-a842-before/`
baseline. Export and comparison both exit 0. Artifacts are in
`build/color-n2/n2-a433-final/`, `n2-a433-final-default.log` and
`n2-a433-final-byte-comparison.txt`. The comparison explicitly enumerates
and checks all six frames. `git diff --check`, control-byte checks and the
three local document links pass. No TypeScript checks or full CTest suite ran.


## Independent float-resize oracle and correction

The new `spatialFloatResampling` test computes expected values without Qt
scaling or delivery helpers. An asymmetric 8x4 RGB fixture contains non-byte
values. Four rows cover fit and fill, enlargement and reduction. Every output
component is checked, including opaque bars and centered crops. Enlargement
uses pixel-center bilinear interpolation. Reduction uses independent 2x2 area
averages. The input image must remain unchanged.

The original implementation fails all four rows at the new test's `1e-6`
bound. First failing component errors range from about `1.2e-6` to `3.6e-6`.
The bound was not relaxed. `DeliveryFrame.h` now resizes in float with
separable bilinear enlargement and area reduction. The intermediate uses
FP32, with double accumulation. Mixed-axis resizing shrinks first to bound
intermediate storage. Existing fit/fill geometry and black bars remain.
The default RGBA8 export path does not call this helper.

`NT_JOBS=1 ntbuild color-n2 tst_deliveryframe nodetool-timeline` passes.
`citest color-n2 '^(tst_deliveryframe|export_precision)$' -V` passes, exit 0,
including the preferences prerequisite. DeliveryFrameTest reports 12 passed,
zero failures and zero skips. Export precision retains its existing bounds.
The original failing test log is `build/color-n2/n2-resize-tests.log`.
Successful logs are `n2-resize-fixed-build.log` and `n2-resize-fixed-tests.log`
in that same build directory. Tests use isolated configuration and headless
Vulkan/lavapipe. No QML or TypeScript checks were needed.

This round stops after the resize task. A45.2 still needs actual allocation,
geometry, mask/outset and full-canvas exception qualification. A32 still needs
presentation conversion/dither and GL orientation proof. A109 still needs
route precision propagated through capture and analysis, format-aware modeled
passes, exact default solved-parameter regression checks and actual-render
validation. Neither default preview pixels nor Color Match results were
remeasured in this round. Their implementation was not changed.

N2's exit gate remains **not met**, even apart from other backends. OpenGL,
Metal, D3D11/WARP, physical GPUs and resize throughput remain unverified.
FP16 stays off by default. No schema, setting, QML property, transfer or
10-bit change was made. Nothing was pushed.

The final default-route run exports and decodes all six PNG/MP4 fixtures at
native size, fit downscale and fill upscale. Every byte matches the read-only
`build/color-n0/n2-a842-before/` baseline. Export and comparison exit 0.
Artifacts are `build/color-n2/n2-resize-final/`, `n2-resize-default.log` and
`n2-resize-byte-comparison.txt`. Changed-file control-byte checks, local
Markdown links and `git diff --check` pass.


## A45.2 resolution qualification

The monitor suite now runs both RGBA8 and FP16 through existing playback and
paused controls, project-space placement, view options, capture isolation,
group effects and a group that begins inside the shutter. Scratch reuse is
checked over 60 redraws. No renderer behavior changed.

The scene suite adds translated glow with feathered and inverted ellipse
masks. It checks observed texture size/format, nonempty coverage, project-space
coverage centroid, empty outside pixels and exact full-resolution capture at
every denominator. Backdrop adjustments starting inside a shutter retain the
full canvas, stay stable on redraw and return to reduced size outside the
adjustment. Existing full-canvas exceptions remain unchanged.

For the 256x128 mask fixture, actual canvas storage is 262144, 65536, 16384
and 4096 bytes in FP16 at Full/Half/Quarter/Eighth. RGBA8 uses half those
bytes. The pooled group scratch at 640x360 uses 1843200, 460800, 115200 and
28800 bytes in FP16, also twice RGBA8. These are texture payloads from observed
sizes/formats and pool accounting, not driver overhead or a performance claim.

`NT_JOBS=1 ntbuild color-n2 tst_sceneprecision tst_monitorcompositor` and
focused `citest` runs pass. Scene precision has 15 passes and monitor has 26,
with zero failures or skips. Initial new mask assertions incorrectly assumed
an inverted feathered glow had binary centre coverage. The final test uses
coverage geometry and exact capture equality, without changing existing bounds.
Logs are `n2-a452-pass.log` and `n2-a452-monitor.log` under `build/color-n2`.

All six decoded exports in `n2-a452-final/` match the recorded read-only
`build/color-n0/n2-a842-before/` baseline: 98956 RGBA bytes, zero differences.
Direct default presentation before/after uses four fixed 320x180 frames:
921600 RGBA bytes, zero differences. Artifacts are `presentation-before/`
and `presentation-a452/`. The renderer is unchanged in this commit.

Vulkan/lavapipe is qualified here. A preliminary Mesa OpenGL monitor run also
passes all 26 cases, but full GL scene/capture qualification belongs to A32.
Metal CI must build and run `tst_monitorcompositor` and `tst_sceneprecision`
on the branch after a push. Metal and D3D11 remain unverified locally.
FP16 stays off by default. No QML changed and nothing was pushed.

## A32 working pixels and presentation

FP16 working storage now uses a separate final presentation pipeline into the
existing RGBA8 item target. It preserves encoded SDR values and applies a stable
8x8 Bayer quantizer to RGB after presentation sampling and grid composition.
It does not change alpha, the alpha diagnostic, working textures or numerical
capture. Capture still precedes the item blit. The RGBA8 working route retains
its existing pipeline. No schema, setting, QML, transfer or 10-bit change was
made. FP16 remains off by default.

The monitor regression measures 220 opaque constant interior patches, each
covering a complete dither tile after 2:1 presentation resampling. Vulkan/lavapipe
and OpenGL/llvmpipe both report maximum error **0.990723 code** and maximum
absolute tile bias **0.00637817 code**. Both meet A88's unchanged limits of
one code and bias below 0.1. Four paused redraws match exactly. Raw working
capture retains its expected format and constant patch bytes. Alpha display
leaves capture unchanged.

The initial test against the HEAD renderer fails the bias assertion at
0.498535 code. The inherited fixture also included resampled patch boundaries
and measured 1.0376 codes after dithering. The final fixture uses larger patches
and measures an interior 8x8 tile, so the constant-patch assertion excludes
boundary interpolation. No acceptance tolerance was widened.

Default presentation was measured directly with the HEAD production renderer
rebuilt before restoring A32, then with the final renderer. Four fixed 320x180
frames at Full/Half/Quarter/Eighth match across **921600 RGBA bytes**, with zero
differences. The six final FP16-off PNG/MP4 exports at native size, fit downscale
and fill upscale match the recorded read-only `color-n0/n2-a842-before/` baseline
across **98756 decoded RGBA bytes**, with zero differences. This enumerated total
corrects the byte total in the preceding A45.2 entry.

Mesa OpenGL is available headlessly through Xvfb and EGL. The initial GLX route
failed to create a context. Setting `QT_XCB_GL_INTEGRATION=xcb_egl`,
`LIBGL_ALWAYS_SOFTWARE=1` and the Mesa EGL vendor file selects llvmpipe.
The scene observer now normalizes Y-up readback rows before numerical checks.
The scene suite passes asymmetric typed-capture orientation, exact
preview/offscreen parity, resolution, mask/outset and capture-isolation checks.
The monitor suite passes asymmetric presentation orientation and grid checks.
No orientation pass is inferred from Vulkan alone.

Final targeted Vulkan checks are `tst_monitorcompositor`, `tst_sceneprecision`
and `export_precision`, through `citest color-n2`. The monitor and scene suites
also run directly on Mesa OpenGL with isolated configuration. Monitor reports
28 passes and scene reports 15, with no failures or skips on either backend.
All direct runs set temporary `XDG_CONFIG_HOME`. Builds use `NT_JOBS=1 ntbuild`.
No TypeScript checks, full CTest suite or QML checks were run.

Artifacts under `/home/mg/Projects/nodetool-film/build/color-n2` include
`a32-before/`, `a32-after/`, `a32-presentation-comparison.txt`, `n2-a32-final/`
and `a32-export-comparison.txt`. Build and test logs are `a32-build-final.log`,
`a32-final-tests.log`, `a32-gl-monitor-final.log` and `a32-gl-scene.log`.
The negative baseline run is `a32-before.log`.

A32 is complete on the tested Mesa backends. N2's local functional exit gate is
met apart from A109 and qualification on other backends. Metal and D3D11/WARP
remain unverified. After a push, CI must build `nodetool-timeline`,
`tst_monitorcompositor`, `tst_sceneprecision` and `tst_deliveryframe`, then run
those three test suites and `export_precision` on each backend, with isolated
configuration and no skips. Physical GPU, long-run resource and release
throughput qualification remain outside this result. Nothing was pushed.

## A109: Color Match working-format model

Implemented with FP16 still off by default. The solver takes the matched route's
internal working format. RGBA8 retains byte analysis and per-pass byte rounding.
FP16 takes opaque, undithered `captureWorkingAt` images, preserves float samples
through analysis, and rounds each modeled pass to half float. Both retain the
shader's clamps. Delivery dithering must not enter analysis. The editor's
FrameCapture/frame-server route remains RGBA8 and explicitly selects that model.
No schema, setting, QML property or transfer behavior changed.

The existing fixtures produced exactly identical before/after solver output:
13 results, 182 hexadecimal floating values, including all ten parameters and
four metrics. This compares full doubles before effect serialization. Baseline
production code was `0b57cd5c20`, with only test logging added.

A registered production effect stage renders a 64×32 opaque color ramp through
solved LGG, Levels, CDL and aggregate Grade. Maximum model/render RGB error is
0.00392156839 for RGBA8 and 0.00146484375 for FP16. Actual mean-Oklab difference
falls from 0.0204972291 to 0.000105553974 for RGBA8 and from 0.0203592101 to
0.000490771013 for FP16. Bounds remain one byte code and 0.002 respectively.
Forcing byte rounding in FP16 fails both new tests, with render error
0.00520642102. Restoring half rounding passes.

An initial fixture omitted effect registration and was corrected. A subsequent
10× compression/expansion render exposed the unchanged byte model's rounding
discontinuities, reaching 0.0431372523 maximum error. The render qualification
uses ordinary Levels instead. Compression/expansion remains in the unit test.
This does not qualify arbitrary high-gain chains.

Focused builds and `citest color-a109 '^(tst_colormatch|tst_colormatch_render)$' -V`
pass on Vulkan/lavapipe, with no skips. The suites report 23 and 4 passing cases.
The negative control exits 8. Logs and exact comparison output are in
`/home/mg/Projects/nodetool-film/build/color-a109/`, including `before.log`,
`solver-comparison.txt`, `negative.log` and `restored.log`.

Other GPU backends, physical GPUs and an FP16 editor capture route remain
unverified. Color Match still assumes sRGB for Oklab statistics, while native
export tags BT.709. These numerical working-pixel checks do not validate that
perceptual assumption or exported playback appearance. Transfer reconciliation
remains outside A109.


## Export precision codec comparison (PR #7217)

The old eight-code maximum came from local libx264 output. Linux CI links
FFmpeg 8.0 from `build-ffmpeg-lgpl.sh`, which enables OpenH264 and excludes
GPL libx264. Its observed maximum was 10 with mean 0.526259. The local binary
links system FFmpeg 9.0.2 and libx264, selected by `h264Encoder()`. macOS CI
installs Homebrew FFmpeg 9.0.2 and selects `h264_videotoolbox` first. Windows
links the pinned BtbN LGPL shared FFmpeg 8.0.1 build and selects an available
software H.264 encoder. Its exact runtime encoder is not established here.
The GPL FFmpeg command-line tools used for fixtures and decoding do not select
the application's encoder.

Every MP4 retains absolute mean codec error at most one YUV code. Matched
FP16/RGBA8 exports now compare codec loss for the same scene and encoder.
FP16 may add at most one code to the maximum and 0.1 code to the mean.
These margins allow one quantization step at an edge and one tenth of the
absolute mean budget across the frame. There is no absolute maximum codec
limit. Decoded-RGB sanity uses the sum of the two measured codec maxima,
plus the unchanged one-code delivery allowance, through the existing BT.709
conversion bound. Unencoded YUV identity remains at most one code per plane.
Both modes' measured losses print before assertions.

Local codec results, shown as maximum / mean in YUV codes:

| Scene | RGBA8 | FP16 |
|---|---|---|
| Canvas | 1 / 0.035373 | 1 / 0.035807 |
| Fit down | 1 / 0.008247 | 1 / 0.052083 |
| Fill down | 1 / 0.027344 | 1 / 0.063368 |
| Fit up | 1 / 0.016493 | 2 / 0.041580 |
| Fill up | 1 / 0.008594 | 1 / 0.055816 |
| Identity, opacity 1 | 1 / 0.010200 | 1 / 0.034939 |
| Identity, opacity 0.001 | 0 / 0 | 1 / 0.002170 |

Three temporary decoded-YUV mutations each made `export_precision` exit 8.
Zeroing the frame failed the absolute mean at 74.618490. Replacing the first
FP16 sample with the opposite byte extreme failed the relative maximum at
239 versus 1, while its mean 0.087674 passed the absolute limit. Adding one
code to every fourth FP16 sample failed the relative mean at 0.275608 versus
0.035373, while both maxima remained 1. All mutations were removed.
Logs are `codec-negative-{corrupt,fp16-max,fp16-mean}.log` under
`/home/mg/Projects/nodetool-film/build/color-n2`.

`ntbuild color-n2 nodetool-timeline tst_deliveryframe` passed.
After restoration, `citest color-n2 '^export_precision$' -V` and
`citest color-n2 '^tst_deliveryframe$' -V` passed with no skips. Logs are
`codec-restored.log` and `codec-deliveryframe.log`. Direct before/after runs
used temporary `XDG_CONFIG_HOME`. FP16-off MP4 files, PNG payloads, unencoded
YUV and decoded RGBA matched across 36 files and 289383 bytes, with zero
differences. See `codec-byte-comparison.txt` and `codec-bytes-{before,after}/`.
Only the test script and this note changed. FP16 stays off by default.
No TypeScript checks, full CTest suite or push was performed. Other platform
encoders were inspected in source and logs, without running this change there.
