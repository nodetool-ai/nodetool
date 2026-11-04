# S2 working chain

A21 and A22 started from e6c9a7944c. A23.1 and A23.2 continue from
72801af622 on film/color-s2. No host enables FP16 by default.

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

At the A22 handoff, A23.3 onward had not started. The A23 continuation below changes opt-in
compositor geometry. Temporal caches, settings and persisted schemas are
unchanged. Existing callers keep the byte route. Browser, hardware-GPU and native execution are unverified.
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

## A23.1 continuation

Implemented straight-alpha byte-source promotion before crop. One promotion
pass per leaf per frame writes a reusable source-sized FP16 texture. The generic
uploader can mutate a texture without exposing a version, so promotion is
refreshed each frame. Crop inherits that format and the existing transform
blend target retains FP16. Source uploads and final byte delivery stay separate.
Masks and temporal neighbors retain their existing routes for A23.3/A23.4.

The full-frame identity fixture compares every channel of 1536 pixels, with
antialiased circle coverage, alpha 3/255, crop, rotation and fractional placement
at a display size different from the source. It uses an opaque background,
where precision should not change the image. Maximum difference is 1 code and
mean absolute difference is 0.0009765625 code. That one-code difference is
consistent with binary16 storage rounding before the final byte resolve.
Transparent export at low alpha is not certified by this fixture.

The four working-precision tests and timeline-only typecheck passed. The five
workingFormat tests passed, including all 71 byte-identical resolved RGBA8 WGSL
strings. No GPU shader source changed. Existing compositor pixel tests are
being checked separately, with failures recorded in the continuation below.

Changed files for A23.1: this report,
`packages/timeline/src/render/frameCompositor.ts` and
`packages/timeline/tests/render.workingPrecision.gpu.test.ts`.


## A23.2 continuation

The existing compositor already selects working precision for blend targets,
group accumulation, group resolve and adjustment mixing. New tests exercise
all 13 blend modes, both direct and grouped, and all 12 transition types.
The non-neutral Levels fixture runs on both a promoted leaf and a composed
group. It checks actual output values, so silently dropping the effect fails.
Effect input labels now report the actual texture format. Effect pool targets,
alpha conversion scratch and recipe intermediates remain byte-backed.
A23.3 is still required before claiming a continuous FP16 effect chain.

The strengthened identity fixture uses black transparent texels beside coloured
coverage, so changing leaf alpha filtering cannot hide behind constant RGB.
No transfer function, effect parameter, shader, schema or default was changed.

Final focused verification passed nine files and 56 tests, including the
strengthened identity fixture, blend/transition checks and existing effect,
mask, adjustment and group tests. Timeline-only typecheck passed with exit 0.

### Baseline findings

The existing compositor selection ran 19 files: 343 tests passed, six retained
expected failures, and 14 failures. The same 14 failures reproduced after
restoring frameCompositor.ts and effects.ts from 72801af622, with identical
reported error values. The working files were restored after that comparison.

Seven grain cases fail. Five opaque cases have mean errors from
0.02203369140625 to 0.0242919921875 against the existing 0.02 limit. Two
translucent cases have maximum error 3 against the existing one-code limit.
Seven colour-boundary cases fail at maximum error 255 in low-alpha samples:
six PNG/WebP profile combinations and MOV alpha delivery. These are unresolved
baseline findings. No tolerance, skip or expected-failure marker was changed.
The hard requirement that every existing pixel test pass remains unmet.

Logs are in `/home/mg/Projects/nodetool-film/tmp/color-s2/`: `compositor.log`,
`baseline.log`, `wgsl.log`, `identity.log`, `final.log` and
`typecheck-final.log`. Runs use Node 24 through `bin/ntenv`, lavapipe,
LP_NUM_THREADS=2, NODETOOL_TEST_WORKERS=1 and no file parallelism.
Only selected Vitest files and timeline package typecheck ran.
Not run: test:affected, root typecheck, lint, harness gate, /verify or full suites.
Browser, hardware GPU, native execution, transparent low-alpha identity and
A23.3/A23.4 remain unverified. No push was performed.

Changed files for this continuation:

- `docs/plans/color-precision/results/s2-working-chain.md`
- `packages/timeline/src/render/frameCompositor.ts`
- `packages/timeline/src/render/effects.ts`
- `packages/timeline/tests/render.workingPrecision.gpu.test.ts`
- `packages/timeline/tests/render.workingBlend.gpu.test.ts`

A23.1 commit: 35f68b1d06. A23.2 is the commit containing this continuation.

## A23.3 continuation

Effect ping-pong targets now inherit FP16 inputs. Every ordinary, LUT and recipe
dispatch receives that working format. Pools rebuild when their format changes.
The existing recipe runner propagates it into nested colour intermediates.
Masks remain fixed byte resources. Apply-mask colour bridges are pending A24.

Promotion textures already had removal and dispose cleanup. They now have a
64 MiB retained-byte limit, charged at eight bytes per source pixel. Eviction
runs after submission. Active-frame storage can exceed the retained limit.
A 20-layer test with a 16-byte limit proves eviction and reuse, plus removal
and dispose destruction.

Nine tests in workingPrecision and workingBlend passed on confirmed lavapipe.
Timeline-only typecheck passed. Existing effectsParity and adjustment tests
passed in the preceding run. The inverse-Levels ramp recovers 256 distinct
codes in FP16 versus 192 in bytes, with at most one-code FP16 error.
Glow, group effects and an adjustment allocate FP16 effect targets without
validation errors. This does not remeasure the three A81 scenes.

The original geometry identity remains within one code, mean 0.007649739583333333
on lavapipe. Adding neutral Levels to its low-alpha source measured a maximum
nine-code difference. Byte alpha bridges quantize colour before unpremultiplying.
That fixture is not a precision-independent effect oracle. Its original
one-code assertion remains unchanged. Full transparent qualification is pending.

Verification correction: timeline initially loaded GPU dist from before A22.
Built only packages/gpu locally, then reran. Also ntenv sets VK_DRIVER_FILES
to NVIDIA, overriding VK_ICD_FILENAMES. Subsequent runs explicitly set both
to /usr/share/vulkan/icd.d/lvp_icd.json. Earlier baseline adapter labels in
this report are not reliable.

Changed files: this report, packages/timeline/src/render/effects.ts,
packages/timeline/src/render/frameCompositor.ts and
packages/timeline/tests/render.workingPrecision.gpu.test.ts.
Logs: a233-built.log, a233-final.log, a233-final-tsc.log and gpu-build.log
under the existing color-s2 log directory. Restricted checks only.

## A23.4 continuation

Temporal denoise neighbors now use the same promotion and format-aware crop
route as the current source. Per-frame uploads are refreshed through the
existing version contract. Seek-back, source replacement and an empty-frame
cache reset reproduce the original output. Neighbor promotions are released
by the existing live-source sweep and charged to the promotion cache limit.
Existing motion accumulation remains rgba16float with f32 arithmetic.

The working-precision, grain and colour-boundary selection passed:
41 ordinary tests and six retained expected failures. Timeline-only typecheck
passed. Logs: a234.log and a234-tsc.log. Changed files: this report,
packages/timeline/src/render/frameCompositor.ts and
packages/timeline/tests/render.workingPrecision.gpu.test.ts.

### Correction and explanation of the 14 previous failures

All 14 pass with both Vulkan environment variables pointing at lavapipe.
The earlier report set only VK_ICD_FILENAMES after sourcing ntenv, leaving
its NVIDIA VK_DRIVER_FILES override active. This was not a Node-version
failure. No existing test, tolerance or expected-failure marker changed.

The failures by exact test name were:

| Finding | Test name |
|---|---|
| F1 | matches CPU grain with size 1, softness 0.25 and alpha 255 |
| F2 | matches CPU grain with size 3.5, softness 0 and alpha 255 |
| F3 | matches CPU grain with size 8, softness 1 and alpha 255 |
| F4 | matches CPU grain with size 16, softness 0.6 and alpha 255 |
| F5 | matches CPU grain with size 16, softness 0 and alpha 255 |
| F6 | matches CPU grain with size 16, softness 1 and alpha 128 |
| F7 | matches CPU grain with size 3.5, softness 0.4 and alpha 128 |
| F8 | imports png untagged decoder samples without a second transfer |
| F9 | imports png srgb decoder samples without a second transfer |
| F10 | imports png p3 decoder samples without a second transfer |
| F11 | imports webp untagged decoder samples without a second transfer |
| F12 | imports webp srgb decoder samples without a second transfer |
| F13 | imports webp p3 decoder samples without a second transfer |
| F14 | preserves mov alpha=true decoded samples through the server codec boundary |

F1–F7 are B218's parameter cases. Their CPU/GPU quantization parity differs
on the inherited NVIDIA route. They pass on this machine's lavapipe.

At alpha 1, the old log shows [113,142,56,1] becoming [0,0,0,1] instead of the
byte oracle's [0,255,0,1]. This is the previously recorded NVIDIA low-alpha
disagreement in S1, not a demonstrated transfer conversion. They pass on
confirmed lavapipe. The driver-level cause of the NVIDIA disagreement remains
unresolved and that route is not qualified.

Inspected recent test-packages-core job 126827592139 in
[run 41901649421](https://github.com/nodetool-ai/nodetool/actions/runs/41901649421).
It passed all 17 grain tests. Its failure was register-available-packs.test.ts.
Node was 24.22.1, as here. CI installed Mesa 25.2.8 on Ubuntu.
This machine's A81 adapter record is Mesa 26.2.5 on Arch.
The CI commit e1067e4d28 does not contain render.colorBoundary.gpu.test.ts,
so this log cannot establish CI results for the seven newer boundary cases.
The downloaded evidence is ci-core.log. No CI pass is claimed for absent tests.

## A24 continuation

Mask application and its explicit premultiplied-to-straight bridge now retain
FP16 colour. Luma-matte weighting uses a separate FP16 colour pool before the
fixed-byte coverage output. Auto-bridges receive the working format.
The fixed mask and LUT contracts remain unchanged. Effect precision is explicitly
gated by the compositor option, including for callers supplying float sources
while FP16 is off. Omission still selects RGBA8.

No shader arithmetic changed. The Levels alpha floor, temporal alpha floor,
effect clamps and parameter discretization remain under D10. Posterize still
returns exactly [0,85,170,255] for a four-level opaque ramp. This removes storage
quantization from the colour chain, not intentional effect quantization.

### Identity and benefit

The original complete 1536-pixel geometry fixture retains its one-code bound.
A complete 256-pixel fixture includes neutral Levels, a shape mask and a luma
matte, with alpha 0,1,2,3,8,16,128,255. It checks every channel against encoded
source-over references over black, white and transparency. The opaque variant
also retains the one-code RGBA8/FP16 bound. The low-alpha transparent comparison
uses source colour as its reference because intermediate byte premultiplication
cannot preserve that colour. No assertion or tolerance was widened.

A81's three scenes now execute production working-format dispatches rather
than test-local effect clones. A test-local identity upload pass promotes the
byte input first. The pipeline-cache clone test remains separate.
At 768×432, working RMS/max deltas in codes are:
dark-fade 9.161025/16.126228, sky 0.315827/1.224127,
grade-glow 0.722831/2.218201. Undithered final maximum deltas are 16,1,2.
The inverse-Levels diagnostic gives 256 codes and zero maximum error in FP16,
versus 192 codes and error 11 in RGBA8. Source promotion adds binary16 rounding
before the first effect, so scene numbers differ slightly from A81's old
test-local first-pass promotion.

The dark fade/lift chain retains the demonstrated precision benefit. Small sky
and grade/glow deltas alone do not establish a visible improvement. These are
shared-chain measurements, not complete timeline recreations of those scenes.
Artifacts and adapter evidence are in tmp/color-s2/a81-current, outside git.

### Remaining qualification

Browser, NVIDIA, native execution, arbitrary effect parameters and out-of-range
float outputs are unqualified. Removing implicit UNORM saturation can expose
out-of-range values to later passes. That requires A28 effect qualification.
Fixed-byte mask precision and Levels' existing low-alpha floor are retained,
not claimed as FP16 colour storage. No transfer, linear-light, schema, default,
setting or user-visible change was made.

Changed files for A24: this report,
packages/timeline/src/render/effects.ts,
packages/timeline/src/render/frameCompositor.ts,
packages/timeline/tests/render.workingPrecision.gpu.test.ts and
packages/gpu/tests/precisionBenefit.test.ts.

Not run: test:affected, root typecheck, lint, harness gate, /verify or full
suites. Only selected Vitest files and GPU/timeline package typechecks ran.
No dependency install and no push.

Final A24 verification passed 39 tests across workingPrecision, mask,
motionBlur, effectsParity and adjustment, plus eight GPU tests across
workingFormat and precisionBenefit. Both package typechecks exited 0.
All 71 resolved RGBA8 shader strings remain byte-identical.
Diff whitespace and changed-file control-byte checks passed.

With Levels, shape mask and luma matte together, full-frame reference maximum
error is one code for every background. Mean errors are 0.03125 over black,
0.0625 over white and 0.1875 over transparency. Maximum differences from the
byte path are 1,1,80 respectively. The 80-code transparent difference is
precision recovery after byte alpha quantization, not a one-code parity pass.
The opaque effect identity retains its original one-code requirement.

Final logs: a24-final.log, a24-final-tsc.log, a24-gpu.log and a24-gpu-tsc.log.
A23.3 commit: 7e44a12cfb. A23.4 commit: 2a39993564.
A24 is the commit containing this section.

## A88 delivery investigation

A88 is incomplete. No delivery implementation from this investigation is shipped.
The trial used native DeliveryFrame's centered 8x8 Bayer ranks after the final
headless alpha resolve. It preserved the byte shader and raw working textures.
On confirmed lavapipe (llvmpipe, Mesa 26.2.5, LLVM 23.1.3), the end-to-end opaque
patch test measured a maximum tile bias of 0.125 code, failing the required
less-than-0.1 limit. The trial also failed the existing exact source-upload,
inverse-Levels histogram and Posterize assertions. No assertion was weakened.
The production edit was restored after the experiment.

The candidate patch, reproduction test and confirmed-adapter log are saved in
`/home/mg/Projects/nodetool-film/tmp/color-s2/` as `a88-candidate.patch`,
`render.delivery.gpu.test.ts` and `a88-confirmed-lvp.log`. These are diagnostic
artifacts, not a delivered feature. The remaining work is to distinguish final
quantization error from accumulated FP16 storage error, preserve the raw
precision assertions, and qualify delivery after that distinction. NVIDIA
delivery and browser delivery were not tested.

## A28 adapter evidence

A28 remains incomplete. The catalog dispatch test now uploads nonzero constant
inputs and reads every working FP16 output, rejecting NaN and infinity. Its
expectation is finiteness at default parameters, not full effect fidelity.
Both confirmed adapters pass the five workingFormat tests, including every
resolved RGBA8 shader's byte-for-byte comparison. The 66 float-output probes
produce only values in [0,1] on this fixture. The family inventory is:

| Family | Float outputs | Lavapipe | NVIDIA RTX 3060 |
|---|---:|---|---|
| Colour | 24 | Finite, [0,1] | Finite, [0,1] |
| Filters and recipes | 17 | Finite, [0,1] | Finite, [0,1] |
| Geometry | 13 | Finite, [0,1] | Finite, [0,1] |
| Mixers and recipes | 6 | Finite, [0,1] | Finite, [0,1] |
| Keyers | 2 | Finite, [0,1] | Finite, [0,1] |
| Alpha conversion | 2 | Finite, [0,1] | Finite, [0,1] |
| Colour mask application | 1 | Finite, [0,1] | Finite, [0,1] |
| Passthrough | 1 | Finite, [0,1] | Finite, [0,1] |

Fixed-format sources and masks retain their allocation/dispatch checks.
Constant/default input cannot establish bounds for non-neutral settings or
edges. No per-effect saturation decision is justified by this probe. The plan's
29 unclamped modules remain unresolved, as do per-effect numerical expectations,
non-neutral parameter coverage, host caller qualification and cross-adapter
pixel comparisons. These tests do not certify the whole effect catalog.

### Grain and colour boundaries

Confirmed lavapipe identifies as llvmpipe, Mesa 26.2.5, LLVM 23.1.3.
Confirmed hardware identifies as NVIDIA RTX 3060, driver 610.57.04.
Both VK_ICD_FILENAMES and VK_DRIVER_FILES were set after sourcing ntenv.
The grain test prints explicit adapter fields and every CPU/GPU error metric.

Lavapipe passes 33 ordinary tests and six retained expected failures across
render.grain.gpu.test.ts and render.colorBoundary.gpu.test.ts. All seven grain
parameter comparisons are byte-identical to CPU, maximum and mean error zero.
NVIDIA passes 19 ordinary tests and six retained expected failures, but fails
14 cases. Its five opaque grain cases have maximum error 1 code and means
0.02325439453125, 0.0242919921875, 0.02203369140625,
0.02349853515625 and 0.023681640625 codes in test order. Its two translucent
grain cases have maximum error 3 and means 0.17327880859375 and
0.14599609375 codes. The assertions remain maximum <=1 and mean <0.02.
This demonstrates a real CPU/hardware disagreement on these fixtures. It does
not establish the shader arithmetic or driver operation responsible.

The other seven NVIDIA failures are PNG and WebP with untagged, sRGB and P3
profiles, plus MOV alpha delivery. They reproduce maximum error 255 at
low-alpha colour boundaries. B218 now records the actual adapters and keeps
the hardware discrepancy open. No tolerance, skip or it.fails was changed.

### Gate and verification

S2's exit gate is **not met**. A88 delivery is not implemented, A28's full
effect semantics and saturation audit are unfinished, and hardware baseline
pixel discrepancies remain. A81's established visible benefit is the dark fade
only. The sky and grade/glow scenes do not establish another visible benefit.
Those scenes were not rerun in this continuation.

GPU and timeline package typechecks passed (adapter-independent). Only the
selected Vitest files ran. Not run: test:affected, root typecheck, lint,
harness gate, /verify or full suites. No push was performed.

Logs under `/home/mg/Projects/nodetool-film/tmp/color-s2/`:
`catalog-lvp-final.log`, `catalog-nvidia.log`, `boundary-lvp.log`,
`boundary-nvidia.log`, `gpu-tsc.log` and `timeline-tsc.log`.
The final catalog logs identify their adapters. Each catalog run passes five
tests. Typecheck command: `node scripts/run-tsc.mjs -p packages/<gpu|timeline>/tsconfig.json --noEmit`.
Vitest commands use `npm test --workspace=packages/<package> -- <files>
--no-file-parallelism`, with LP_NUM_THREADS=2 and NODETOOL_TEST_WORKERS=1.

Changed files in this continuation:

- `packages/gpu/tests/workingFormat.test.ts`
- `packages/timeline/tests/render.grain.gpu.test.ts`
- `native/timeline/docs/gaps-backlog.md`
- `docs/plans/color-precision/results/s2-working-chain.md`

No production source change remains from this continuation.
