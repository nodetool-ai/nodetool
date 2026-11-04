# S1 runtime interfaces

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
