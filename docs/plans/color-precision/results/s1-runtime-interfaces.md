# S1 runtime interfaces

Current gate: S1 passes for “colour doesn't change” under the
2026-11-05 owner decision. See [S1 owner closeout](#s1-owner-closeout).
Earlier rounds below retain their measured results and gate states at the time.

Work: `film/color-s0`, starting at `b0e76741bb`.
Merged `origin/feat/native-timeline` with merge commit `eebdb5840c`.
Owner decision committed first after the merge: `b7ed14d1dc`.
The A82 measured verdicts are unchanged.

## Task status

- A15 complete: `8ec6d24c6b`. `workingFormat` on the existing compositor
  options selects `rgba8unorm` or `rgba16float`. Omit it or select RGBA8 to
  roll back. Headless rendering accepts the same option. No caller enables
  FP16 by default. No configuration service, menu or document field was added.
- A14 complete: `27a23270dd`. `WorkingFrame` describes byte, binary16-bit or
  GPU texture storage, dimensions, row stride, alpha and interpretation.
  GPU results expose the descriptor. Interpretation stays `unknown` pending
  A97. The final exports live behind `gpu/webgpu` to keep the pure catalog
  independent of WebGPU types. Raw RGBA MIME meanings are untouched.
- A19 complete for the affected resource interfaces: `e633a2a3c5`.
  Core FP16 texture storage and optional `shaderF16` arithmetic are separate.
  No device feature requests changed. Render allocations check dimensions,
  formats and applicable storage usages, including existing BGRA presentation.
  `checkRenderTexture` exposes an asynchronous allocation probe with validation
  and out-of-memory error scopes for qualification. It is not automatically
  inserted into the existing render route. Device loss produces an error,
  without selecting a fallback. A synchronous partial resize failure destroys
  the new partial pair and preserves the old pair.
- A18 complete for these interfaces: the commit containing this report.
  Scratch keys include format, usage, physical dimensions and existing metadata.
  An optional retained-byte budget counts physical storage and evicts on
  release. The default retention policy stays unchanged. Compute pipeline keys
  include output storage format. Crop copies preserve source format and reject
  incompatible reuse. Source uploads retain revision and dimension checks,
  including a first upload whose revision is an empty string. Typed readback
  helpers copy rows before unmap. Headless delivery retains RGBA8 buffers,
  checks the buffer limit and cleans up partial buffer allocation failures.

S2 has not started. Effect modules, recipes and alpha conversion scratch keep
existing formats. Selecting FP16 accumulation does not certify a complete
FP16 effect chain. No shader module, timeline schema, document identity,
`workingColorSpaceVersion`, Python transport or provider transport changed.

## Verification

Used Node 24 through `/home/mg/Projects/nodetool-film/bin/ntenv`, lavapipe via
`VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json`, `LP_NUM_THREADS=2`
and `NODETOOL_TEST_WORKERS=1`. Both changed packages built and passed their
package-only `run-tsc.mjs --noEmit` checks. Integration was not installed into
or modified. Its dependency tree and available package dist directories were
copied with `cp -R --reflink=always`, then workspace symlinks were retargeted
locally. Only GPU and timeline builds were run.

The final focused GPU selection passed 28 files, 583 tests. Seven existing
straight-alpha cases in `premulInvariant.test.ts` are marked skipped by that
suite because its premultiplied invariant does not apply. No new test has a skip
guard and no adapter-backed test was skipped for lack of a device. A subsequent
scratch-pool run passed both tests after adding independent mixed-format reuse.
The timeline file passed both tests. No failing checks remain.

Default behavior was checked with default and explicit RGBA8 rendering of the
same translucent pixel, both producing `[80, 40, 20, 255]`. The opt-in FP16
check covers byte delivery, crop copies, revision changes, size changes and
source eviction under a WebGPU validation scope. This is focused evidence,
not qualification of every scene or browser route.

The mixed-format compute regression was also run with the old key restored.
It failed with incompatible bind-group layouts. Restoring the format-aware key
passed. The shared inverse-Levels fixture was copied unchanged from `color-n0`,
verified with `cmp`, and now supplies ramp samples, gammas and expected limits.
`git diff --check` and a control-byte scan passed.

Focused GPU command, from the worktree root after sourcing `ntenv`:

```bash
npm run test --workspace=packages/gpu -- \
  tests/workingFrame.test.ts tests/scratchPool.test.ts \
  tests/resourceValidation.test.ts tests/precisionBenefit.test.ts \
  tests/variant.test.ts tests/module.test.ts tests/blendModes.test.ts \
  tests/executorValidation.test.ts tests/uniformRing.test.ts \
  tests/alphaConvert.test.ts tests/headlessComposite.test.ts \
  tests/maskSlot.test.ts tests/vignette.test.ts tests/latentRegressions.test.ts \
  tests/recipeSmoke.test.ts tests/inverseAffine.test.ts tests/grain.test.ts \
  tests/glow.test.ts tests/transform.test.ts tests/precision.test.ts \
  tests/premulValidator.test.ts tests/premulInvariant.test.ts \
  tests/placedLayerRect.test.ts tests/computeSmoke.test.ts \
  tests/canarySmoke.test.ts tests/sharpenRadius.test.ts \
  tests/precisionCost.test.ts tests/effectsBehavior.test.ts --no-file-parallelism
npm run test --workspace=packages/timeline -- tests/render.workingPrecision.gpu.test.ts
node scripts/run-tsc.mjs -p packages/gpu/tsconfig.json --noEmit
node scripts/run-tsc.mjs -p packages/timeline/tsconfig.json --noEmit
```

The cost test's explicit measurement mode was not enabled. No new cost claim
comes from this run. API latency, growth soak, weak GPUs and real browsers
remain unmeasured and gate browser rollout. Physical OOM was not induced.
Allocation validation, injected synchronous failure and device destruction were
exercised. Real browser/device recovery and concurrent use remain unqualified.

Per the requested scope, `test:affected`, root typecheck, lint, harness gate,
`/verify` and full suites were not run. No push was performed.

## A97 and A98 handoff

A97 should trace producers and consumers before replacing `unknown` or existing
colour labels. Scratch compatibility already includes those existing labels.
No transfer conversion or mismatch enforcement was introduced here. A98 should
add real decoder/render/encoder identity fixtures, including low alpha. The
inverse-Levels fixture remains a separate precision-benefit test and cannot
certify unchanged-colour boundaries. Both tasks remain unstarted.

## Changed files

Paths below exclude changes brought in by the upstream merge.

- `docs/plans/color-precision/results/a82-cost.md`
- `docs/plans/color-precision/results/s1-runtime-interfaces.md`
- `packages/gpu/src/compositor/compositor.ts`
- `packages/gpu/src/context.ts`
- `packages/gpu/src/executor.ts`
- `packages/gpu/src/module.ts`
- `packages/gpu/src/resourceValidation.ts`
- `packages/gpu/src/webgpu/index.ts`
- `packages/gpu/src/workingFrame.ts`
- `packages/gpu/tests/fixtures/inverse-levels.json`
- `packages/gpu/tests/precisionBenefit.test.ts`
- `packages/gpu/tests/resourceValidation.test.ts`
- `packages/gpu/tests/scratchPool.test.ts`
- `packages/gpu/tests/variant.test.ts`
- `packages/gpu/tests/workingFrame.test.ts`
- `packages/timeline/src/render/frameCompositor.ts`
- `packages/timeline/tests/render.workingPrecision.gpu.test.ts`


## A97 implementation round (partial)

The corrected plan is present at the requested starting HEAD `3635b5c79f`.
The working-frame result now declares `encoded-sdr` and premultiplied alpha,
independent of RGBA8 or FP16 storage. Only this metadata value changes in
production. Default precision, shader code, formats and document schemas do
not change. The new descriptor test covers both formats.

[Transfer inventory](a97-transfer-inventory.md) enumerates all 74 module files
and their 173 colour labels (106 `linear`, 67 `srgb`). It separates traced
boundaries from unresolved declarations. A97 remains incomplete: the per-slot
colour/mask/data classification and coordinated producer/consumer corrections
are not done. Mismatch enforcement remains disabled. S1's exit gate is not met.
S2 has not started.

Timeline package typecheck passed. Existing compositor tests were selected by
`rg -l frameCompositor packages/timeline/tests/*.ts`, run sequentially with
Node 24, lavapipe, `LP_NUM_THREADS=2`, `NODETOOL_TEST_WORKERS=1`.
Of 321 cases in 18 files, 313 passed and eight failed, with no skips.
Restoring the original `unknown` production descriptor and rerunning the two
failing files reproduced the same eight failures. Seven are grain CPU/GPU
parity tolerances (including maximum channel error 3 versus allowed 1), and
one is the persisted-effect enumeration in `render.parity.gpu.test.ts`.
These failures remain unfixed because this task must not change pixels.
The focused working-precision test passes all three cases, including unchanged
RGBA8 bytes `[80, 40, 20, 255]` and opt-in FP16 byte delivery.

Files in this A97 round:

- `packages/timeline/src/render/frameCompositor.ts`
- `packages/timeline/tests/render.workingPrecision.gpu.test.ts`
- `docs/plans/color-precision/results/a97-transfer-inventory.md`
- `docs/plans/color-precision/results/s1-runtime-interfaces.md`

Per the requested scope, test:affected, root typecheck, lint, harness gate,
/verify and full suites were not run. No push was performed.


## A98 implementation round (partial)

`packages/timeline/tests/render.colorBoundary.gpu.test.ts` adds deterministic
256-code SDR ramps and low-alpha coloured rows (alpha 1, 2, 8, 16, 32, 64,
128, 255). They are independent of A81 and S6 scenes. PNG uses the same
canvas writer sequence as the server PNG-sequence boundary. H.264 uses the
runtime encoder with the server's default BT.709 matrix/range filter and
transfer tags. Both decode through the runtime libav RGBA reader with the
server's accurate-rounding/full-chroma scale flags. These exercise the codec
primitives and shared compositor, not the complete RenderTimeline node.

Expected rendering starts from actual decoded bytes. Opaque ramp samples stay
unchanged. Partial alpha follows existing byte premultiplication quantization
and straight-alpha resolve, allowing one code of GPU rounding. Import and
export codec errors are checked separately: five codes for the opaque H.264
ramp, exact opaque PNG, and at most ceil(127.5/alpha) RGB codes for the canvas
PNG writer's byte-alpha round trip. This alpha loss is not transfer conversion.
A direct encode of the independently calculated expected render is compared
with delivery from the rendered frame, within one code.

Deliberately inserting an extra sRGB decode before upload failed both fixtures.
Inserting an extra sRGB encode also failed both. Both mutations were restored.
No conversion was added to production, and FP16 remains off by default.
These fixtures pin current encoded-domain behavior, not transfer-correct
BT.709 delivery. Browser/native delivery, JPEG/WebP input, alternate video
codecs, video alpha, profile-tagged stills and metadata probing remain
unverified. A98 is partial and S1's exit gate remains unmet.

The only A98 files are this report and
`packages/timeline/tests/render.colorBoundary.gpu.test.ts`.

Final A98 verification: the boundary and working-precision files passed together
(five tests, no skips), and timeline-only typecheck passed again. Commands:

```bash
source /home/mg/Projects/nodetool-film/bin/ntenv
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json LP_NUM_THREADS=2 NODETOOL_TEST_WORKERS=1 \
  npm test --workspace=packages/timeline -- tests/render.colorBoundary.gpu.test.ts tests/render.workingPrecision.gpu.test.ts --no-file-parallelism
node scripts/run-tsc.mjs -p packages/timeline/tsconfig.json --noEmit
```

`git diff --check` and a control-byte scan of all five changed files passed.

## A97 completion round

A97's module-slot classification and coordinated colour metadata corrections
are complete for the shared pool, image nodes and timeline effects.
[Inventory](a97-transfer-inventory.md#slot-classification) records every slot,
recipe allocation, caller interpretation and label reader. Internal metadata
adds encoded-sdr and data tags. No persisted schema, working format, alpha
conversion, shader math or default precision changed. FP16 remains opt-in.
S2 has not started. No push was performed.

S1's full exit gate is **not yet met**. A97's missing classification is closed,
but A98 is still limited to the PNG/H.264 codec primitives and shared compositor
listed above. Complete supported-route import/export qualification is not
established by these tests. This round does not promote that partial evidence
to a complete browser/native/profile-tagged boundary qualification.

### Checks

Node 24 from `bin/ntenv`, lavapipe with
`VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json`, `LP_NUM_THREADS=2`,
`NODETOOL_TEST_WORKERS=1`, sequential files. No tests were skipped.

- A1: GPU selection passed 19 files and 140 cases. Added recipe metadata test
  passed separately. Final inventory/recipe rerun passed 3 files and 4 cases.
  The deliberately wrong exposure source label failed the inventory test with
  exit 1. Restoring encoded-sdr passed. New/unclassified files fail the file-set
  equality, while unclassified exports/slots fail the full slot-set equality.
- A2: Image-node GPU smoke passed 36 cases. Timeline selection passed 221 cases
  and reproduced the eight failures below. A98 PNG/H.264 and default/explicit
  RGBA8 plus opt-in FP16 checks passed, including the unchanged `[80,40,20,255]`
  default result. Existing pixel assertions and tolerances were not edited.
- A3: GPU, timeline and image-nodes package-only typechecks passed. GPU build
  passed so consumers tested the updated package. `git diff --check` and a
  control-byte scan passed. Source comparison verified that all 73 changed
  shader modules differ only in colour-label literals.

The scoped GPU command selected:

```bash
npm test --workspace=packages/gpu -- tests/transferInventory.test.ts \
 tests/sourceModules.test.ts tests/shaderCorrectness.test.ts tests/scratchPool.test.ts \
 tests/recipeSmoke.test.ts tests/alphaConvert.test.ts tests/computeSmoke.test.ts \
 tests/canarySmoke.test.ts tests/maskSlot.test.ts tests/glow.test.ts \
 tests/transform.test.ts tests/precision.test.ts tests/grain.test.ts \
 tests/vignette.test.ts tests/latentRegressions.test.ts tests/effectsBehavior.test.ts \
 tests/sharpenRadius.test.ts tests/module.test.ts tests/executorValidation.test.ts \
 --no-file-parallelism
npm test --workspace=packages/gpu -- tests/recipeTransfer.test.ts \
 tests/recipeSmoke.test.ts tests/transferInventory.test.ts --no-file-parallelism
npm test --workspace=packages/image-nodes -- tests/lib-image-gpu-smoke.test.ts --no-file-parallelism
npm test --workspace=packages/timeline -- tests/render.colorBoundary.gpu.test.ts \
 tests/render.workingPrecision.gpu.test.ts tests/render.grain.gpu.test.ts \
 tests/render.parity.gpu.test.ts --no-file-parallelism
node scripts/run-tsc.mjs -p packages/gpu/tsconfig.json --noEmit
node scripts/run-tsc.mjs -p packages/timeline/tsconfig.json --noEmit
node scripts/run-tsc.mjs -p packages/image-nodes/tsconfig.json --noEmit
```

### Existing failures

All seven parameter cases of `render.grain.gpu.test.ts` test
`matches CPU grain with size $size, softness $softness and alpha $alpha` fail.
The tuple columns disambiguate repeated test names.

| Size | Roughness | Softness | Colour | Seed | Alpha | Failure |
|---|---|---|---|---|---|---|
| 1 | 0.5 | 0.25 | 0 | 7 | 255 | Mean 0.02325439453125 exceeds 0.02 |
| 3.5 | 0 | 0 | 0 | 2203 | 255 | Mean 0.0242919921875 exceeds 0.02 |
| 8 | 1 | 1 | 1 | -3 | 255 | Mean 0.02203369140625 exceeds 0.02 |
| 16 | 0.4 | 0.6 | 0.3 | 1234567 | 255 | Mean 0.02349853515625 exceeds 0.02 |
| 16 | 0 | 0 | 0 | 7 | 255 | Mean 0.023681640625 exceeds 0.02 |
| 16 | 1 | 1 | 1 | 91 | 128 | Maximum 3 exceeds 1 |
| 3.5 | 0.7 | 0.4 | 1 | 91 | 128 | Maximum 3 exceeds 1 |

These compare live CPU and GPU rendering, not stored golden images. They are
real numerical parity disagreements on lavapipe. The earlier original-code
rerun reproduced them. This run does not establish whether other devices also
fail, so they cannot be dismissed as machine-only failures. They remain
unchanged as instructed.

The eighth is `render.parity.gpu.test.ts` / `enumerates every persisted effect
and blend mode`. The fixture omits deband, deflicker, denoise, exposure,
secondaryColor and stabilize. This is a device-independent coverage gap in the
test fixture. It is not caused by these metadata changes and remains unfixed.

Per the task constraints, `test:affected`, root typecheck, lint, harness gate,
`/verify` and full suites were not run. No dependencies were installed and no
root setup/build ran on the prepared worktree.

### Files changed in this round

- `docs/plans/color-precision/results/a97-transfer-inventory.md`
- `docs/plans/color-precision/results/s1-runtime-interfaces.md`
- `packages/gpu/src/context.ts`
- `packages/gpu/src/recipe.ts`
- `packages/gpu/src/shaders/_canary/passthrough/v1/module.ts`
- `packages/gpu/src/shaders/alpha/premulToStraight/v1/module.ts`
- `packages/gpu/src/shaders/alpha/straightToPremul/v1/module.ts`
- `packages/gpu/src/shaders/color/brightnessContrast/v1/module.ts`
- `packages/gpu/src/shaders/color/cdl/v1/module.ts`
- `packages/gpu/src/shaders/color/channelMerge/v1/module.ts`
- `packages/gpu/src/shaders/color/channelShuffle/v1/module.ts`
- `packages/gpu/src/shaders/color/channelSplit/v1/module.ts`
- `packages/gpu/src/shaders/color/colorBalance/v1/module.ts`
- `packages/gpu/src/shaders/color/cubeLut/v1/module.ts`
- `packages/gpu/src/shaders/color/curveTransfer/v1/module.ts`
- `packages/gpu/src/shaders/color/curves/v1/module.ts`
- `packages/gpu/src/shaders/color/exposure/v1/module.ts`
- `packages/gpu/src/shaders/color/exposureTone/v1/module.ts`
- `packages/gpu/src/shaders/color/filmLook/v1/module.ts`
- `packages/gpu/src/shaders/color/grade/v1/module.ts`
- `packages/gpu/src/shaders/color/grayscale/v1/module.ts`
- `packages/gpu/src/shaders/color/hsb/v1/module.ts`
- `packages/gpu/src/shaders/color/hslAdjust/v1/module.ts`
- `packages/gpu/src/shaders/color/invert/v1/module.ts`
- `packages/gpu/src/shaders/color/levels/v1/module.ts`
- `packages/gpu/src/shaders/color/liftGammaGain/v1/module.ts`
- `packages/gpu/src/shaders/color/posterize/v1/module.ts`
- `packages/gpu/src/shaders/color/secondary/v1/module.ts`
- `packages/gpu/src/shaders/color/solarize/v1/module.ts`
- `packages/gpu/src/shaders/color/splitToning/v1/module.ts`
- `packages/gpu/src/shaders/filters/blur/gaussian/v1/module.ts`
- `packages/gpu/src/shaders/filters/blur/separable/v1/module.ts`
- `packages/gpu/src/shaders/filters/convolve3x3/v1/module.ts`
- `packages/gpu/src/shaders/filters/deband/v1/module.ts`
- `packages/gpu/src/shaders/filters/denoise/v1/module.ts`
- `packages/gpu/src/shaders/filters/glow/v1/module.ts`
- `packages/gpu/src/shaders/filters/grain/v1/module.ts`
- `packages/gpu/src/shaders/filters/grain/v2/module.ts`
- `packages/gpu/src/shaders/filters/pixelate/v1/module.ts`
- `packages/gpu/src/shaders/filters/sharpen/combine/v1/module.ts`
- `packages/gpu/src/shaders/filters/sharpen/gaussian/v1/module.ts`
- `packages/gpu/src/shaders/filters/sharpen/unsharpMask/v1/module.ts`
- `packages/gpu/src/shaders/filters/threshold/v1/module.ts`
- `packages/gpu/src/shaders/filters/vignette/v1/module.ts`
- `packages/gpu/src/shaders/filters/vignette/v2/module.ts`
- `packages/gpu/src/shaders/filters/visualFx/v1/module.ts`
- `packages/gpu/src/shaders/keyer/chromaKey/v1/module.ts`
- `packages/gpu/src/shaders/keyer/lumaKey/v1/module.ts`
- `packages/gpu/src/shaders/mask/apply/v1/module.ts`
- `packages/gpu/src/shaders/mask/fromImage/v1/module.ts`
- `packages/gpu/src/shaders/mask/invert/v1/module.ts`
- `packages/gpu/src/shaders/mixer/add/v1/module.ts`
- `packages/gpu/src/shaders/mixer/colorOverlay/v1/module.ts`
- `packages/gpu/src/shaders/mixer/dropShadow/v1/module.ts`
- `packages/gpu/src/shaders/mixer/outline/v1/module.ts`
- `packages/gpu/src/shaders/mixer/over/v1/module.ts`
- `packages/gpu/src/shaders/mixer/shadowCompose/v1/module.ts`
- `packages/gpu/src/shaders/sources/angularGradient/v1/module.ts`
- `packages/gpu/src/shaders/sources/checkerboard/v1/module.ts`
- `packages/gpu/src/shaders/sources/diamondGradient/v1/module.ts`
- `packages/gpu/src/shaders/sources/gaussianNoise/v1/module.ts`
- `packages/gpu/src/shaders/sources/linearGradient/v1/module.ts`
- `packages/gpu/src/shaders/sources/radialGradient/v1/module.ts`
- `packages/gpu/src/shaders/sources/solid/v1/module.ts`
- `packages/gpu/src/shaders/transform/affine/v1/module.ts`
- `packages/gpu/src/shaders/transform/cornerPin/v1/module.ts`
- `packages/gpu/src/shaders/transform/crop/v1/module.ts`
- `packages/gpu/src/shaders/transform/displace/v1/module.ts`
- `packages/gpu/src/shaders/transform/mirror/v1/module.ts`
- `packages/gpu/src/shaders/transform/offset/v1/module.ts`
- `packages/gpu/src/shaders/transform/pad/v1/module.ts`
- `packages/gpu/src/shaders/transform/polarRemap/v1/module.ts`
- `packages/gpu/src/shaders/transform/resize/v1/module.ts`
- `packages/gpu/src/shaders/transform/rotate90/v1/module.ts`
- `packages/gpu/src/shaders/transform/spherize/v1/module.ts`
- `packages/gpu/src/shaders/transform/stabilize/v1/module.ts`
- `packages/gpu/src/shaders/transform/tile/v1/module.ts`
- `packages/gpu/src/texture.ts`
- `packages/gpu/src/types.ts`
- `packages/gpu/tests/recipeTransfer.test.ts`
- `packages/gpu/tests/shaderCorrectness.test.ts`
- `packages/gpu/tests/sourceModules.test.ts`
- `packages/gpu/tests/transferInventory.test.ts`
- `packages/image-nodes/src/nodes/lib-shader-utils.ts`
- `packages/timeline/src/render/effects.ts`

### Commits

- `64b2156800`: pool declarations, producer metadata, complete inventory and checks.
- `123c913a7f`: image-node upload/output and timeline effect/LUT metadata.
- The following documentation commit records scoped verification and gate status.

## A98 supported-route qualification round

Started at `64423c204f` on `film/color-s0`. Tests and this report changed.
Production pixels, behavior and precision defaults did not change. S2 did not
start. A98 remains partial. S1's exit gate is **not met**.

### Supported routes checked from source

[Server output table](../../../../packages/video-nodes/src/nodes/timeline/outputFormats.ts)
supports H.264/MP4, VP9/WebM, ProRes/MOV and PNG sequence delivery. WebM,
MOV and PNG sequence accept alpha. MP4 rejects alpha. JPEG and WebP are
supported inputs, not timeline delivery formats. Their delivery and MP4 alpha
are out of scope, with refusal assertions retained.

[Server import](../../../../packages/video-nodes/src/nodes/timeline/rawFrames.ts)
uses libav RGBA decoding for PNG/JPEG/WebP and video, with a Skia SVG fallback.
The new still fixtures call `decodeStillRgba`, including its size probe.
Video fixtures use the production output resolver and encoder-argument parser,
then the runtime encoder/decoder and shared compositor. They do not run the
whole RenderTimeline node, bundles, audio or PNG ZIP packaging. SVG's separate
rasterization route was read but is not qualified by these fixtures.

The MP4 codec override is open-ended and encoder availability is build-specific.
Runtime probes found libx264, libvpx-vp9, prores_ks and libx265 here, but no
libaom-av1. Encoder presence does not establish delivery support. HEVC's actual
MP4 encode fails below. AV1 server qualification needs an installed encoder and
working mux/decode path. No AV1 pass is claimed.

[Browser delivery](../../../../web/src/components/timeline/render/TimelineRenderer.ts)
uses mediabunny CanvasSource and WebCodecs. Defaults are AVC/MP4 and VP9/WebM,
with runtime codec overrides. The headless browser request also lists AV1 and
PNG frame delivery. Browser MP4 alpha is refused. No browser codec is counted
as qualified from API presence.

### Results on confirmed lavapipe

The final changed-file run exited **1**: **16 passed, 6 failed, no skipped
cases**. Node 24 came from `ntenv`. The adapter reports Mesa software,
`llvmpipe-llvm-23-1-3-256-bits-`, Mesa 26.2.5, LLVM 23.1.3.

| Route | Measured result |
|---|---|
| Original PNG ramp/low-alpha and H.264 ramp | Pass, unchanged assertions. |
| PNG, JPEG, WebP input, untagged and sRGB ICC | Decoded-sample render/PNG delivery identity passes. PNG/WebP include alpha 0, 1, 2, 8, 16, 32, 128, 255. JPEG is opaque. |
| P3 ICC PNG/JPEG/WebP input | Decoded-sample identity passes. This does not certify profile normalization. |
| Profile-aware P3 PNG to sRGB reference | Fails, maximum RGB difference 55 codes versus allowance 2. |
| Opaque H.264, VP9, ProRes | Import/render/delivery codec identity passes. Declared-transfer checks fail separately. |
| ProRes 4444 alpha | Identity passes. Decoded alpha differs by at most 1 code. Actual stream is `yuva444p12le`, despite the requested `yuva444p10le`. |
| VP9 alpha | Fails before rendering, maximum alpha difference 255. File advertises `alpha_mode=1`, but runtime RGBA decoding loses alpha. This does not isolate encoder versus decoder failure. |
| H.264/VP9/ProRes declared BT.709 delivery | Fail, transfer errors 17/17/16 codes. Independent reference codec loss is 2/2/0 codes. |
| HEVC MP4 override | Fails on the first encoded packet, before rendering or transfer comparison. No HEVC color result. |

Still input loss is measured before rendering. Untagged and sRGB PNG have
maximum error 0, JPEG 3, WebP 8 codes. P3 generation includes a deliberate
profile transformation, so its source-to-decoder differences (117/119/115)
are not ordinary codec loss and are not charged to the GPU. On lavapipe, all
new decoded-sample rendering comparisons have maximum error 0 against the
independent premultiplied-byte/straight-resolve oracle. PNG output has separate
alpha-dependent codec tolerances. Video reference delivery encodes the
independently computed expected rendering with the same codec settings.

F1: Transfer conversion is missing for the asserted sRGB-origin to BT.709
route. ffprobe observes limited range and BT.709 matrix, primaries and transfer
on actual H.264, VP9 and ProRes files. The test independently decodes sRGB to
linear and applies the BT.709 OETF, then encodes that reference with identical
settings. Its separate codec-loss check passes. Actual delivery remains near
the supplied sRGB codes rather than that BT.709 reference. The existing scaler
converts matrix/range, not transfer. Failing assertions remain, tolerance 5.
No conversion was added or changed.

F2: The still loader accepts P3 ICC files, but measured P3 PNG import disagrees
with a LittleCMS-backed sRGB normalization of the same encoded file by 55
codes. Passing raw-sample identity is not passing profile handling. JPEG/WebP
P3 normalization and other ICC profiles still need independent qualification.

F3: VP9 alpha cannot pass this runtime decoder route. ProRes alpha passes the
boundary fixture on lavapipe, but does not remove F1's transfer failure. HEVC
needs a working runtime HEVC/MP4 mux path. Its exact error is
`Failed to write packet: Not yet implemented in FFmpeg, patches welcome`.
The test bounds x265's worker pool only, using
`x265-params=pools=none:frame-threads=1`. It retains the production resolver's
codec, pixel format, range filter and transfer tags. No test is skipped or
converted into an expected failure.

### Browser, native and device limits

The existing Playwright Chromium launches headlessly, with no desktop windows.
On a local HTTP origin, Chromium `148.0.7778.96` reports `navigator.gpu`, but
`requestAdapter()` returns **null**. It used no WebGPU adapter. The probe used
exactly the existing web Playwright launch arguments:
`--enable-features=Vulkan,UseSkiaRenderer`, `--use-gl=angle`,
`--use-angle=swiftshader`, `--enable-webgpu-developer-features`.
The same result occurs with NVIDIA's environment and with confirmed lavapipe
selection. No browser delivery test was added for this unavailable prerequisite.
Qualification needs a headless Chromium setup that actually returns a WebGPU
adapter, then real compositor upload/presentation and CanvasSource/WebCodecs
export fixtures with decoded-output and metadata measurements. Neither browser
preview nor delivery is counted as passed.

The read-only `color-n2` report at
`/home/mg/Projects/nodetool-film/wt/color-n2/docs/plans/color-precision/results/n2-native-export.md`
records default-output equality but an unmet native exit gate, identity-edge
failures and remaining spatial/transfer qualification. No native tests or
native code were changed here. Native qualification needs that branch's
completed capture/export work and its own decoded-delivery edge/reference
checks. Native results were not imported as an S1 pass.

An initial environment audit found that `ntenv` also sets `VK_DRIVER_FILES`
to NVIDIA. That takes precedence over `VK_ICD_FILENAMES`. The initial run
therefore measured RTX 3060, not lavapipe: 9 passed, 12 failed in 21 cases.
Seven additional low-alpha render comparisons fail there, including decoded
`[128,128,128,1]` becoming `[0,0,0,1]` versus the byte oracle's
`[255,255,255,1]`. This is a measured cross-device disagreement, not evidence
of a transfer conversion. The assertions were retained. The final run below
explicitly unsets the override and verifies the adapter. Hardware parity is
not established by the lavapipe pass.

### Verification and remaining gate

```bash
cd /home/mg/Projects/nodetool-film/wt/color-s0
source /home/mg/Projects/nodetool-film/bin/ntenv
unset VK_DRIVER_FILES
export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json
export LP_NUM_THREADS=2 NODETOOL_TEST_WORKERS=1
npm test --workspace=packages/timeline -- tests/render.colorBoundary.gpu.test.ts \
  --no-file-parallelism --reporter=verbose
```

Final log: `/home/mg/Projects/nodetool-film/tmp/a98-boundary-lavapipe-final.log`.
`git diff --check` and a control-byte scan passed. Only the changed Vitest file
was run. No dependencies were installed. `test:affected`, root typecheck,
lint, harness gate, `/verify` and full suites were not run, as requested.

A98 and S1 remain blocked by F1's declared-transfer failures, F2's profile
normalization failure and unqualified JPEG/WebP/other profile conversion,
F3's VP9 alpha and HEVC runtime paths, browser preview/delivery, native
delivery and the NVIDIA low-alpha disagreement. SVG rasterization, AV1 where
supported, and complete RenderTimeline route qualification remain outside the
passing evidence. None is counted as passed. These require separate route
qualification or product fixes, not weakened identity fixtures. S2 remains
unstarted. No push was performed.

Changed files in this round:

- `packages/timeline/tests/render.colorBoundary.gpu.test.ts`
- `docs/plans/color-precision/results/s1-runtime-interfaces.md`


## S1 owner closeout

Owner decision, 2026-11-05: **S1 passes for “colour doesn't change”.** Today's
export behavior stays. S1 closes the internal interfaces and unchanged encoded
sample behavior covered by these fixtures. It does not certify strict BT.709
transfer conversion or every supported import/export route. S2 has not started.

Merged `origin/feat/native-timeline` at `61ffcdc2b3` into `film/color-s0` with
merge commit `66bf6ff83e`, starting at `e491a0ff0f`. No conflicts occurred.
Upstream changes to `render.parity.gpu.test.ts` and `render.clipEffects.test.ts`
were retained. No production code changed in this closeout after the merge.

The later [A101 owner decision](../high-precision-media-processing.md#s6-linear-light-sdr-after-fp16-delivery)
chooses O1: pass-through with today's BT.709 tag. The inaccurate transfer tag
is accepted to preserve source appearance. See the [Q27 evidence](q27-bt709-delivery.md).
The three BT.709 tests now pin unconverted source values and stream tags.
VP9 alpha delivery passes on lavapipe with the explicit libvpx decoder. The default decoder
still drops alpha, tracked as B216. P3 PNG normalization and HEVC remain
expected failures B215 and B217 in the
[backlog](../../../../native/timeline/docs/gaps-backlog.md). B218–B221 record
grain parity, Windows reconnect cadence, macOS frame hold pointer reachability
and high-gain Color Match discrepancies. These entries do not claim fixes.

Browser delivery and native delivery from this path remain unqualified. The
NVIDIA low-alpha disagreement remains unresolved. Passing lavapipe identity
fixtures does not resolve hardware parity or qualify browser/native delivery.
A82's unfinished API-latency, growth-soak and weak-GPU measurements still gate
browser rollout. The A82 measured verdicts are unchanged.

### Known failures and focused verification

Historical S1 verification, before the Q27 decision and decoder correction:
before adding `it.fails`, the unchanged boundary file exited 1 on lavapipe:
16 ordinary passes and exactly six failures. The failure sites were inspected
individually, including setup and metadata checks before the final assertions.

| Known failure | Observed failure before marking | Tracking |
|---|---|---|
| H.264 declared BT.709 | `declared BT.709 transfer error, excluding codec loss`: 17 > 5. Metadata and separate reference codec-loss assertions pass, codec loss 2. | S6/A101 |
| VP9 declared BT.709 | Same transfer assertion: 17 > 5. Metadata and reference codec-loss assertions pass, codec loss 2. | S6/A101 |
| ProRes declared BT.709 | Same transfer assertion: 16 > 5. Metadata and reference codec-loss assertions pass, codec loss 0. | S6/A101 |
| Display P3 PNG normalization | `profile normalization before sRGB delivery`: 55 > 2. Import succeeds and reaches the independent sRGB comparison. | B215 |
| VP9 alpha | `input codec alpha error`: 255 > 1, before rendering. ffprobe reports `alpha_mode=1`. | B216 |
| HEVC MP4 override | `encoder.finish()` fails writing the first encoded packet: `Failed to write packet: Not yet implemented in FFmpeg, patches welcome`. No transfer assertion is reached. | B217 |

HEVC is a known encoder/mux setup failure, not a measured color assertion.
Marking it does not qualify its transfer behavior. The other five reach the
expected assertions above rather than failing in setup. All original assertions
and tolerances remain intact. Only these six cases use `it.fails`, with a reason
and tracking reference. Passing cases in the video loop remain ordinary `it`.
No case is skipped. A future passing known-failure case makes Vitest fail.

Final focused run exited 0: 16 ordinary passes and six executed expected
failures, 22 cases total. Node 24 came from `ntenv`. `VK_DRIVER_FILES` was explicitly unset
because `ntenv` sets an NVIDIA override that takes precedence over
`VK_ICD_FILENAMES`. The command was:

```bash
cd /home/mg/Projects/nodetool-film/wt/color-s0
source /home/mg/Projects/nodetool-film/bin/ntenv
unset VK_DRIVER_FILES
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json LP_NUM_THREADS=2 NODETOOL_TEST_WORKERS=1 \
  npm test --workspace=packages/timeline -- tests/render.colorBoundary.gpu.test.ts \
  --no-file-parallelism --reporter=verbose
```

The initial run before unsetting the override reproduced additional NVIDIA
low-alpha failures and is not counted as lavapipe evidence. Only the boundary
test file was run. The upstream parity and clip-effects files were not run.
`test:affected`, root typecheck, lint, harness gate, `/verify` and full suites
were not run, per scope. No dependencies were installed and no push was made.
