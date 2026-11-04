# S2 working chain, stage one

Scope is A21 and A22 on film/color-s2, based on e6c9a7944c.
A23 and later tasks are not started. No host enables FP16 by default.

## A21

Complete for the helpers touched by this stage.

Extracted the alpha expressions and exposure transfer functions into shared
WGSL text helpers. The expressions preserve their distinct zero-alpha and
low-alpha policies. No operation order, clamp, parameter or Posterize changes.

The existing native-shared inverse-levels.json fixture now also contains
zero/low-alpha vectors and samples below, at and above both sRGB breakpoints.
A GPU compute test evaluates the shared text against these numerical vectors.

Captured every exported module's resolved WGSL from the starting source before
editing. workingFormat.test.ts compares complete strings against that fixture.
The capture switch was removed after capture so normal tests cannot rewrite it.

A21 commit: 6cd1c68e2c. A22 is the commit containing this completed report.

## A22

Complete for the shared catalog: all 74 module files, 71 shader exports and
four recipes. Denoise exports two shaders, so the 17 storage-binding files
contain 18 storage shaders. The inventory test enumerates files and exports.

Each module declares its slot policies from
[A97](a97-transfer-inventory.md#slot-classification). Colour slots are working.
Source-generator outputs stay fixed RGBA8. Masks and numeric inputs stay fixed,
including the existing FP16 LUT input. Gaussian blur explicitly permits colour
or mask use. Drop-shadow mask intermediates stay RGBA8. Glow, separable blur and
Gaussian sharpen colour intermediates inherit the selected working format.

The internal executor and recipe arguments accept workingFormat. Omission
preserves RGBA8. Only an explicit FP16 call specializes working output contracts,
TypeGPU storage layouts and resolved storage declarations. Arithmetic remains
f32. The existing format-bearing pipeline keys receive the specialized output
contract, so neither compute nor fragment pipelines collide across formats.
Byte mode returns the original module object and layout.

Unknown slot policies, byte working inputs and byte working outputs fail.
Recipe preflight rejects unclassified passes/intermediates and fixed-byte colour
intermediates before allocation or dispatch. Gaussian mask use requires an
explicit fixed mask declaration. Scratch allocations are released on failures.
Auto-inserted alpha conversion retains an FP16 working input's storage.

No working module was blocked by FP16 storage on lavapipe. The test probes the
actual rgba16float descriptor with TEXTURE_BINDING, STORAGE_BINDING,
RENDER_ATTACHMENT, COPY_SRC and COPY_DST through A19's checkRenderTexture.
It dispatches every shader and recipe in RGBA8, FP16, then RGBA8 on one pipeline
cache under validation scopes. Fixed source and mask outputs intentionally stay
in their declared formats. This is allocation/binding qualification with default
parameters, not numerical qualification of every effect and parameter.

## Evidence

A21's five-file selection passed 23 tests. The initial A22 runtime selection
passed eight files and 38 tests. GPU-only typecheck passed. The pixel selection passed 25 files and 404 tests with no skips.
The final restored-state rerun passed four files and 22 tests with no skips.
GPU-only typecheck returned exit 0. Diff whitespace, control-byte scanning of
all 85 changed files and the report link target/anchor checks passed.

For the negative control, the actual canary module's output policy was changed
from working to fixed. The inventory test failed with exit 1 and identified
_canary.passthrough@1:output:fixed versus the expected working slot. The mutation
was restored in a finally block. The final rerun passed after restoration.
The check also exercises an unclassified module, missing policies, byte working
inputs/outputs and fixed-byte glow intermediates. No existing assertion,
tolerance or it.fails was edited.

The committed RGBA8 fixture contains every resolved shader string captured at
e6c9a7944c before editing. All 71 strings compare byte for byte after both tasks.
Recipe modules have no WGSL. The test separately checks every recipe slot.
RGBA8 resolution returns the same module object, and repeated RGBA8 dispatch
after FP16 must reuse the original pipeline object under the existing key.
Existing pixel assertions, tolerances and it.fails cases are unchanged.
Posterize arithmetic is unchanged.

The shared-vector compute test covers zero and sub-byte alpha and both transfer
breakpoints. The FP16 automatic-alpha test reads exact binary16 values for
RGB 0.5/0.25 at alpha 1/1024, proving that conversion scratch does not quantize
through RGBA8.

## Limits

A23 onward is not started. No host target, normalization route, compositor,
temporal cache, setting or persisted schema was upgraded. Existing callers keep
the byte route. Browser, hardware-GPU and native execution are unverified.
Native consumption of the added fixture fields is unverified. Default-parameter
dispatch does not certify arbitrary parameter ranges, float clamping semantics,
effect fidelity or complete host chains.

Not run as instructed: test:affected, root typecheck, lint, harness gate, /verify
and full suites. Only selected GPU Vitest files and GPU package typecheck ran.
No dependencies were installed. No push was performed.

## Commands

All commands ran from the specified worktree with Node 24 from bin/ntenv,
lavapipe, LP_NUM_THREADS=2 and NODETOOL_TEST_WORKERS=1.

```bash
npm test --workspace=packages/gpu -- tests/colorHelpers.test.ts tests/workingFormat.test.ts tests/alphaConvert.test.ts tests/effectsBehavior.test.ts tests/precisionBenefit.test.ts --no-file-parallelism --testTimeout=60000
npm test --workspace=packages/gpu -- tests/workingFormat.test.ts tests/recipe.test.ts tests/recipeSmoke.test.ts tests/recipeTransfer.test.ts tests/module.test.ts tests/variant.test.ts tests/executorValidation.test.ts tests/workingFrame.test.ts --no-file-parallelism --testTimeout=60000
npm test --workspace=packages/gpu -- tests/workingFormat.test.ts tests/colorHelpers.test.ts tests/transferInventory.test.ts tests/sourceModules.test.ts tests/shaderCorrectness.test.ts tests/alphaConvert.test.ts tests/computeSmoke.test.ts tests/canarySmoke.test.ts tests/maskSlot.test.ts tests/glow.test.ts tests/transform.test.ts tests/precision.test.ts tests/grain.test.ts tests/vignette.test.ts tests/latentRegressions.test.ts tests/effectsBehavior.test.ts tests/sharpenRadius.test.ts tests/precisionBenefit.test.ts tests/colorGradingModules.test.ts tests/timelineEffects.test.ts tests/batch1Modules.test.ts tests/batch3Transforms.test.ts tests/batch4Modules.test.ts tests/newPixelModules.test.ts tests/transformModules.test.ts --no-file-parallelism --testTimeout=60000
npm test --workspace=packages/gpu -- tests/workingFormat.test.ts tests/recipe.test.ts tests/recipeSmoke.test.ts tests/recipeTransfer.test.ts --no-file-parallelism --testTimeout=60000
npm test --workspace=packages/gpu -- tests/workingFormat.test.ts --testNamePattern="classifies the complete" --no-file-parallelism --testTimeout=60000
node scripts/run-tsc.mjs -p packages/gpu/tsconfig.json --noEmit
```

## Changed files

- `docs/plans/color-precision/results/s2-working-chain.md`
- `packages/gpu/src/colorHelpers.ts`
- `packages/gpu/src/executor.ts`
- `packages/gpu/src/module.ts`
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
- `packages/gpu/src/shaders/color/exposureLinear/v1/module.ts`
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
- `packages/gpu/src/workingFormat.ts`
- `packages/gpu/src/workingFrame.ts`
- `packages/gpu/tests/colorHelpers.test.ts`
- `packages/gpu/tests/fixtures/inverse-levels.json`
- `packages/gpu/tests/fixtures/rgba8-wgsl.json`
- `packages/gpu/tests/workingFormat.test.ts`
