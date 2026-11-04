# N2 native capture, partial implementation

A84.1 is implemented and qualified on Vulkan/lavapipe. This round stops at the
working-capture boundary. N2's exit gate is **not met**. FP16 remains off by
default. No schema, setting, QML property, transfer conversion, workflow or
CTest ordering changed. Nothing was pushed.

## Task status

| Task | Status |
|---|---|
| A84.1 | Complete on Vulkan/lavapipe. Typed, owned, undithered working capture and format-preserving offscreen capture. |
| A84.2 | Not implemented. ExportEngine still resamples bytes on explicit-size and odd-canvas video routes. Float delivery conversion and A88 dithering are next. |
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
