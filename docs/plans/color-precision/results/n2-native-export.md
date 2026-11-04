# N2 native capture and delivery, partial implementation

A84.1 is implemented and qualified on Vulkan/lavapipe. The export connection remains unfinished. N2's exit gate is **not met**. FP16 remains off by
default. No schema, setting, QML property, transfer conversion, workflow or
CTest ordering changed. Nothing was pushed.

## Task status

| Task | Status |
|---|---|
| A84.1 | Complete on Vulkan/lavapipe. Typed, owned, undithered working capture and format-preserving offscreen capture. |
| A84.2 | Partial. Tested float alpha, resize and PNG conversion helpers exist. ExportEngine is not connected. Float YUV conversion matching the existing chroma filter remains. |
| A32 | Not implemented. The outer target remains RGBA8 and capture bypasses it, but final presentation dithering and OpenGL qualification remain. |
| A84.3 | Not complete. Existing capture/cancellation tests pass. FP16 PNG/ZIP delivery and alpha-zero conversion acceptance remain. |
| A41.3 | Not complete. Legacy output tags were inspected, but FP16 delivery is not connected. |
| A43.3 | Partial evidence only. Capture equals the compositor's raw working pixels with display options and reduced preview resolution. Full preview/offscreen parity fixtures remain. |
| A45.2 | Partial evidence only. Full-resolution FP16 capture survives Full/Half/Quarter/Eighth preferences. Allocation and geometry qualification remain. |
| A109 | Not implemented. Color Match still models byte intermediate rounding. |

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
claim A84.2 complete. No transfer conversion was added. The BT.709 tags versus
sRGB exposure/Color Match assumptions remain unresolved as previously recorded.

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
