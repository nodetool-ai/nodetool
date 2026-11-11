# A81: FP16 numerical and visible benefit

S0 proof only. Production code and timeline schemas are unchanged. The existing
RGBA8 inverse-Levels floor is retained rather than ported from the stale plan pin.
`precisionBenefit.test.ts` adds test-local clones of existing shared modules.
Only texture formats, storage binding declarations and matching resolved WGSL
storage declarations change. Shader math, pass order, parameters and 8-bit source
pixels are identical. The ordinary Executor encodes every pass.

## Environment and reproduction

Base: `33963a5d7111bda52f116392d1b7c34eab7e3430`, branch `film/color-s0`.
Node 24.22.1 from `ntenv`. Adapter: Mesa software llvmpipe,
`llvmpipe: Mesa 26.2.5-arch1.1 (LLVM 23.1.3)`, device
`llvmpipe-llvm-23-1-3-256-bits-`. Vulkan ICD is lavapipe.
`shader-f16` is disabled. RGBA16F textures work with f32 shader arithmetic.
No adapter feature is requested by the proof.

```bash
cd /home/mg/Projects/nodetool-film/wt/color-s0
source /home/mg/Projects/nodetool-film/bin/ntenv
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json \
VK_DRIVER_FILES=/usr/share/vulkan/icd.d/lvp_icd.json \
COLOR_S0_OUTPUT=/home/mg/Projects/nodetool-film/tmp/color-s0 \
npm test --workspace=packages/gpu -- tests/precision.test.ts tests/precisionBenefit.test.ts
```

The shared node_modules symlink is present. Tests import GPU source relatively to
avoid stale `@nodetool-ai/gpu` builds from integration. `node.ts` still imports
protocol's runtime-package error helper through the workspace dependency. No
stale-import failure occurred. No install or package build was run on the shared
tree. No tests skip when the adapter is absent.

## Diagnostic and measurement contract

The diagnostic uses all 256 byte values in an opaque gray ramp, Levels gamma 0.5
then gamma 2, with no dither. RGBA8 returns 192 distinct values and maximum error
11 codes. FP16 returns 256 distinct values and maximum error 0 codes. Both are
monotone. The mathematical reference for these inverse passes is the input ramp.
The FP16 requirement of 256 values and at most one-code error passes.

Scene measurements read working textures directly: normalized bytes for RGBA8,
decoded IEEE half values for FP16. Working deltas are RGB differences multiplied
by 255, before delivery quantization. They compare formats, not errors against an
independent FP32 reference. Alpha remains 1. Validation errors and nonfinite
samples fail the test.

Delivery is an identical clamp and nearest-integer quantizer for both branches,
with no transfer conversion. PNGs are lossless RGBA8 at 768×432. A second output
uses identical deterministic per-pixel hash noise in [-0.5, 0.5) code before
rounding. Dither is monochrome across RGB and applied only at delivery. It cannot
repair quantization already introduced inside an RGBA8 chain. This is a controlled
SDR still-output comparison, not a claim about a browser encoder or video codec.

## Scene results

| Scene | Undithered working RMS / maximum delta in codes | Final maximum delta, no dither / dither | Changed pixels, no dither / dither | Visible benefit |
|---|---:|---:|---:|---|
| dark-fade | 9.160918 / 16.064945 | 16 / 17 | 331776 / 331776 | Clear reduction in large bands and color steps |
| sky | 0.306545 / 1.104008 | 1 / 2 | 88045 / 176106 | No convincing benefit at normal size |
| grade-glow | 0.720512 / 2.218201 | 2 / 3 | 293620 / 300241 | No convincing benefit at normal size |

- F1: Dark fade is a sunset over hills. Existing encoded-sample exposure reduces
  RGB by 32 (stops -5), then lifts by 32 (stops +5). This is a severe fade/lift
  stress case with a known ideal identity, not a typical single final fade.
  RGBA8 loses smooth sunset steps and alters shadow colors. FP16 preserves them.
  Final dithering does not hide the intermediate loss. It demonstrates benefit
  when later processing recovers a dark intermediate, not every fade to black.
- F2: Sky contains a blue-to-horizon gradient, a soft cloud and hills. Vignette
  intensity 0.65 precedes horizontal and vertical Gaussian blur (radius 6,
  automatic sigma). Differences are small. Neither output convincingly improves
  the other at normal viewing size in this inspection.
- F3: Grade/glow contains a stylized night skyline with lamps and lit windows.
  Four grades use brightness -0.025, +0.035, -0.015, +0.020, each with contrast
  1.03, saturation 1.04 and temperature 0.03. Existing glow pass order is
  threshold (0.55, softness 0.15), Gaussian H/V (radius 12, automatic sigma),
  then add (gain 0.65, tint 1/0.85/0.7). Small color/halo changes are measurable,
  but a visible quality improvement is not established at normal size.

The author inspected the native-size PNGs, including dithered pairs. This is a
subjective inspection of synthetic recognizable scenes, not a blinded viewer
study or a display-calibrated assessment. No difference images or exposure-boosted
views were used to claim visible improvement.

## Artifacts

All images are outside the repository under
`/home/mg/Projects/nodetool-film/tmp/color-s0/`.

- `/home/mg/Projects/nodetool-film/tmp/color-s0/dark-fade-rgba8-undithered.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/dark-fade-rgba8-dither.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/dark-fade-fp16-undithered.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/dark-fade-fp16-dither.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/sky-rgba8-undithered.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/sky-rgba8-dither.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/sky-fp16-undithered.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/sky-fp16-dither.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/grade-glow-rgba8-undithered.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/grade-glow-rgba8-dither.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/grade-glow-fp16-undithered.png`
- `/home/mg/Projects/nodetool-film/tmp/color-s0/grade-glow-fp16-dither.png`

`measurements.json` contains full-precision scene numbers. `diagnostic.json`
contains ramp results. Artifacts are reproduced only when COLOR_S0_OUTPUT is set.
The PNG writer uses Node zlib and CRC32, with no new package dependency.

## Verification and gate

Both changed/added Vitest files pass: 3 tests, no skips. A deliberate negative
control routed the FP16 diagnostic through RGBA8 and failed the 256-level assertion
with 192 levels. The control was restored before the final successful run.

Not run, as requested: test:affected, root typecheck, lint, harness gate, /verify,
full package tests, A82 performance/resource trials and constrained-device trials.
No server/browser/native route or encoder was executed for this experiment.
Hardware adapters, real browser output, partial-alpha behavior, native float
readback and actual video delivery remain unqualified. No timing/cost conclusion
can be drawn from this shared-machine test run.

A90 supplies bounded static caller coverage. A81 passes the diagnostic and shows
visible benefit in the dark-intermediate recovery scene on lavapipe. The sky and
grade/glow scenes do not independently establish visible benefit. These results
support the coverage and benefit portion of S0 on this adapter. S0's full exit
gate is not met without A82. The owner decides whether this evidence is sufficient
to proceed after the remaining gate work. No S1 or later work was started.
