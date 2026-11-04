# I0 Sketch precision proof

Recommendation: defer I1. Keep current editing and persistence defaults. The owner makes the final decision. This branch contains only isolated tests and this report. No user path imports the proof, and no plans were edited.

## Status

| Task | Result |
|---|---|
| A36.1 | Bounded requirement and codec proof complete for the selected fixtures. Existing Sharp/libvips preserves explicitly selected 16-bit codes, straight alpha and tested PNG metadata. This does not qualify the current Sketch I/O wrappers. |
| A85 | Partial. Node/Dawn/lavapipe and headless Chromium/SwiftShader numerical proofs pass. Real browser hardware is **not done**. Current Canvas commit and shared agent/CLI reader comparisons expose precision loss. Full editor history, storage lifecycle and command entry points are not qualified. |
| A89 | Budgets set before measurement, costs recorded, recommendation complete. I0's exit gate does **not** pass. Do not start I1–I3. |

Worktree: `/home/mg/Projects/nodetool-film/wt/color-i0`, branch `film/color-i0`, base `33963a5d7111bda52f116392d1b7c34eab7e3430`. Proof commit: `1d65e8f4f1`.

## A36.1: selected workloads and requirement

Ordinary editing examples are ImageIO's Chelsea photograph (451×300, 8-bit) with a low-opacity white annotation/retouch, and a generated 1024×256 neutral gradient with the same brush. The photograph needs predictable stroke accumulation, not source-code identity after edits. The gradient needs small increments to accumulate without per-commit byte rounding. No customer usage or market demand is inferred from these selections.

The real 16-bit input is ImageIO's `calcium_imaging.tif`, first frame of the microscopy stack. Sharp reports 40×30, grey16/ushort, 16 bits per sample, 1,000 pages, no ICC profile and no alpha. The selected still has 813 distinct source values. The proposed still workload is gentle local annotation/retouch while retaining unedited quantitative source samples. Exact codes are required only for opaque unedited samples in the same encoding. Edited samples use numerical error bounds. This tiny scientific still demonstrates real source depth, not representative photographic size or a proven requirement for all Sketch projects. Original TIFF bytes remain outside the repository and unchanged. The other frames and acquisition metadata are not converted into a Sketch document.

Sources downloaded into `/home/mg/Projects/nodetool-film/tmp/color-i0/`:

| File | Source | SHA-256 |
|---|---|---|
| `calcium_imaging.tif` | [ImageIO fixture](https://raw.githubusercontent.com/imageio/imageio-binaries/master/images/calcium_imaging.tif) | `ebce782afe67efabf60a452c1b460b59f6dd3a422a68f021022ab6b9bd65fe4b` |
| `chelsea.png` | [ImageIO fixture](https://raw.githubusercontent.com/imageio/imageio-binaries/master/images/chelsea.png) | `97403c9c171d1aedd2026c7515e20208ef865eaab56d462c3c2eefade9b7d779` |

The required visible benefit is accumulation of repeated low-opacity strokes, particularly in dark smooth regions. The proof measures that benefit separately from opaque source identity. FP16 Canvas was not tried: the selected identity contract includes every 16-bit code, which FP16 cannot represent. This is a bounded scientific-image requirement, not a claim that ordinary photo edits require exact source codes.

### Existing codec route

The existing dependency is Sharp/libvips, already used by image-node I/O. The proof invokes its depth-preserving APIs directly. The current image-node and Sketch wrappers still return byte data and are not certified by this result.

- A1: Decode the scientific still with `toColourspace("grey16").raw({depth:"ushort"})`. Encoding through `toColourspace("grey16").png()` and decoding back preserves every selected sample exactly. PNG IHDR confirms 16-bit output. Default `.raw({depth:"ushort"})` without the explicit output encoding had already reduced the samples. Merely asking for ushort is insufficient.
- A2: Encode a `Uint16Array` RGBA input through `toColourspace("rgb16").png()`. Decode with `ignoreIcc:true`, `toColourspace("rgb16")`, `ensureAlpha()` and `raw({depth:"ushort"})`. All 65,536 channel codes survive three no-edit PNG cycles. The GPU identity check independently uploads codes divided by 65,535 and rounds the unchanged FP32 readback back to exact codes. This checks full-range scaling and bypasses Canvas2D.
- A3: Test straight alpha separately at alpha codes 1 and 257, with nontrivial RGB. Plain PNG16 preserves these integer values. An already tagged PNG preserves its decoded integer codes, 144 DPI density and 480-byte ICC payload through `ignoreIcc:true` / `keepMetadata()` / `toColourspace("rgb16")` / PNG. This intentionally preserves the declared encoding rather than converting profiles. Adding tags with `withMetadata()` changed samples in the initial trial, so that creation step is not an identity reference. The test uses the actual tagged decoder output as its reference. Arbitrary profiles, EXIF fields and TIFF acquisition metadata are unqualified.

No transfer conversion is added. Float storage is not labeled linear light. The untagged microscopy values are quantitative gray samples. The photographic and generated examples retain the current encoded-domain arithmetic. There is no promise of hidden RGB recovery from premultiplied transparent pixels.

## A85: what was exercised

The test-only [brush](../../../../packages/gpu/tests/sketchI0/brush.ts) uses the existing `WGSL_PREMUL_HELPERS.premulOver` helper with an isolated disk-dab compute wrapper. Two `rgba32float` textures ping-pong with `textureLoad` and storage writes. It needs no FP32 filtering, fixed-function FP32 blending or shader-f16 feature. This is one flat brush interior, not a replacement for the existing brush engine. Canvas has antialiased disk edges while this proof uses a binary boundary, so edge differences are not precision-parity evidence.

[PaintSession](../../../../web/src/components/sketch/painting/PaintSession.ts) commits the stroke buffer using `globalAlpha` and `drawImage`. The baseline exercises that primitive on native Skia Canvas2D. The browser comparison uses repeated Canvas2D fills over the brush interior. Neither loads the full editor UI. [WebGPURuntime](../../../../web/src/components/sketch/rendering/WebGPURuntime.ts) still delegates pixel authority and readback to Canvas2DRuntime.

At an opaque black brush interior, 25 white strokes at opacity 0.001 give:

| Measurement | Value |
|---|---:|
| CPU recurrence reference | 0.024702287403 |
| Dawn and SwiftShader FP32 result | 0.024702291936 |
| Native and browser Canvas result | 0, alpha 255 |
| Single final byte conversion of FP32 | approximately 6/255 |
| Maximum brush PNG16 save error | 2.06451506921e-06, or 0.135 stored code |
| Allowed opaque PNG16 quantization error | 0.5/65535 |

PNG16 decode returns exactly the saved integer codes. PNG8 export is an explicit final conversion. Low-alpha composition is tested separately from identity: input alpha 1/65,535 becomes 0.001015243819 after one dab. The reference checks premultiplied RGB and alpha independently. Straight-alpha save explicitly divides by nonzero alpha without the shared helper's 1/255 floor. Zero-alpha RGB is explicitly zero. The helper's floor is therefore not qualified for high-depth unassociation.

The proof captures completed pre/post-stroke FP32 snapshots. Undo and redo reproduce their bits exactly on Dawn and SwiftShader. After destroying the Dawn device, a new adapter/device restores the completed checkpoint exactly. This does not test spontaneous device loss during an in-flight stroke/readback, browser device-loss recovery, stale completions, process interruption, autosave replacement or existing delta-history integration. Newer unsnapshotted edits have no recovery guarantee. PNG16 save is not claimed to preserve arbitrary FP32 bits.

The existing shared [document renderer](../../../../packages/image-editor/src/render/document.ts) is exercised with the same Skia decode/surface primitive used by the [agent host](../../../../packages/agents/src/sketch-render/render.ts). It accepts the opaque PNG16 fixture but exports PNG8. The [CLI render command](../../../../packages/cli-sketch/src/commands/sketch-render.ts) delegates to that agent host. Reader success therefore proves availability, not depth preservation. Actual agent capability and CLI command execution, and agent raster writes, remain **not done**. No headless writer is switched.

### Images and visible comparison

All paths below are relative to `/home/mg/Projects/nodetool-film/tmp/color-i0/`. Numeric differences include the disk-edge mismatch and do not establish improved fidelity by themselves.

| Scene | FP32 save / final export / Canvas baseline | PNG16 / PNG8 bytes | Max / RMS final byte delta |
| photo | `photo-edited16.png` / `photo-edited8.png` / `photo-canvas8.png` | 449,273 / 337,143 | 6 / 2.784 |
| gradient | `gradient-edited16.png` / `gradient-edited8.png` / `gradient-canvas8.png` | 50,252 / 26,687 | 6 / 2.894 |
| calcium | `calcium-edited16.png` / `calcium-edited8.png` / `calcium-canvas8.png` | 3,385 / 981 | 7 / 4.712 |

Other artifacts: `opaque-all-codes.png`, `low-alpha.png`, `low-alpha-edited.png`, `calcium-still16.png`, `brush-fp32.png`, `brush-canvas8.png`, `brush-export8.png`, `reader-export8.png`, `measurements.json`, `test.log`.

Visual inspection of the photographic pair shows a subtle local lightening, not a dramatic improvement. The generated gradient stays recognizable and the dark brush diagnostic exposes the lost increments. This is useful numerical and diagnostic evidence, not a completed blinded visible-quality study. It does not justify a broad editor/history migration.

## A89: budgets and preliminary cost

Budgets were stated before running the proof: at 1024×1024, completed brush commit p95 ≤33 ms, undo or checkpoint restoration ≤100 ms, save and reopen ≤2 seconds each, process peak RSS ≤768 MiB, PNG16 size ≤3× PNG8 of the same edited content. These apply only to this software-adapter proof. Hardware responsiveness, large photographic documents and concurrent server behavior need separate qualification.

Node 24.22.1, Dawn `webgpu`, Vulkan ICD `/usr/share/vulkan/icd.d/lvp_icd.json`, adapter `llvmpipe: Mesa 26.2.5-arch1.1 (LLVM 23.1.3)`, vendor `mesa`, architecture `software`. Both `VK_ICD_FILENAMES` and `VK_DRIVER_FILES` explicitly select lavapipe. Headless Chromium reports vendor `google`, architecture `swiftshader`. No real browser hardware run was obtained. No desktop window was opened.

Dawn advertised: `texture-component-swizzle`, `primitive-index`, `subgroups`, `dual-source-blending`, `core-features-and-limits`, `float32-filterable`, `depth-clip-control`, `float32-blendable`, `depth32float-stencil8`, `clip-distances`, `texture-compression-bc`, `texture-compression-bc-sliced-3d`, `timestamp-query`, `indirect-first-instance`, `shader-f16`, `rg11b10ufloat-renderable`, `bgra8unorm-storage`. Only default device feature `core-features-and-limits` was enabled. Browser features and stroke samples are in `measurements.json`.

The brush comparison uses five warmups and twenty measured completed strokes. Times include a queue completion wait, not just submission. Canvas includes a pixel read to complete its byte commit. They are primitive benchmarks, not complete UI frame times. Shared-machine contention from other builds makes all costs preliminary. No contention sweep or 4K measurement was run.

| Cost | Measurement | Budget assessment |
|---|---:|---|
| Dawn cold instance/adapter/device acquisition | 39.74 ms | Recorded separately |
| First pipeline compilation | 4.20 ms | Recorded separately |
| Dawn brush median / p95 | 7.51 / 10.44 ms | Pass ≤33 ms p95 |
| Canvas commit median / p95 | 2.99 / 3.17 ms | Faster than GPU primitive here |
| Initial 16 MiB upload including completion | 35.89 ms | Recorded separately |
| Completed 16 MiB readback including CPU copy | 25.00 ms | Recorded separately |
| Undo plus redo uploads/readbacks | 59.38 ms total | Within 100 ms in this sample |
| Checkpoint restore proof after device recreation | 124.07 ms | Fails 100 ms |
| PNG16 encode / decode | 19.97 / 20.06 ms | Pass ≤2 seconds each |
| Brush PNG16 / PNG8 | 54,370 / 27,501 bytes | 1.98×, pass |
| Photo / gradient / calcium PNG16 size ratios | 1.33× / 1.88× / 3.45× | Calcium fails 3× |
| GPU textures plus staging buffer | 48 MiB | Two FP32 textures + one readback |
| Minimum CPU pre/post snapshots | 32 MiB | Excludes codec/fixture/test copies |
| Observed worker RSS / high-water RSS at brush measurement | 688.2 / 874.7 MiB | Peak fails 768 MiB |

The RSS figure includes Vitest assertions, native libraries and fixtures. It is not a measured production-editor footprint, does not include the separate browser process and is not a proof of a renderer leak. No memory rescue architecture was attempted.

The brush run performs three 16 MiB uploads and three 16 MiB readbacks: initial upload, undo upload, redo upload, and final/undo/redo captures. There are no uploads/readbacks between dabs. Checkpoint validation separately repeats that transfer pattern with zero dabs and includes pipeline setup in its reported restore cost. The restore timer excludes adapter/device acquisition. Encode cost excludes float-to-integer quantization; decode cost includes the ushort buffer copy. Neither includes durable storage or network I/O. Save size uses Sharp defaults for both depths.

Reuse is limited but useful: the existing premultiplied source-over helper and existing Sharp PNG codec work. The current whole compositor, tool geometry, selection masks, falloff brushes, delta history, autosave and agent writers are not reused by this small compute proof. Those are substantial remaining migration boundaries. Keep current internals until they are independently qualified. No tile engine, custom float storage, alternate user precision mode or float16 Canvas path was added.

## Verification and reproduction

Download the two source fixtures above into the artifact directory, verify their hashes, then run only the added test file:

```bash
cd /home/mg/Projects/nodetool-film/wt/color-i0/packages/gpu
source /home/mg/Projects/nodetool-film/bin/ntenv
export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json
export VK_DRIVER_FILES=/usr/share/vulkan/icd.d/lvp_icd.json
NODETOOL_TEST_WORKERS=1 node ../../scripts/run-vitest.mjs run tests/sketchI0.test.ts
```

Latest result: exit 0, one file passed, six tests passed, zero skipped. Initial trials caught a reserved WGSL identifier, implicit codec conversion, metadata conversion and Dawn's consumed-adapter rule. One intermediate run hung after releasing a Dawn instance; the proof now retains instances for the worker lifetime, as the existing Node GPU module does. The final runner exits cleanly.

`node_modules` remains the provided symlink to integration. The shader helper and shared document renderer are imported by relative source paths from this worktree. The document renderer's protocol import still resolves through integration, and native third-party versions come from that dependency tree. The depth result uses actual codec and GPU output, not an integration-built GPU module. Full agent/CLI execution is deliberately not claimed from those potentially stale exports.

Not run, per the task instructions: `test:affected`, root `npm run typecheck`, `npm run lint`, `harness gate`, `/verify`, full suites, package rebuilds and environment setup that could replace the supplied dependencies. Vitest transpiles this proof but does not establish TypeScript checking. `git diff --check` passed. No AGENTS.md files changed.

Changed files:

- A4: `packages/gpu/tests/sketchI0.test.ts`
- A5: `packages/gpu/tests/sketchI0/brush.ts`
- A6: `docs/plans/color-precision/results/i0-sketch-proof.md`
