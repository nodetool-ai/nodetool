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

## A88 final output conversion

A88 is implemented for the shared headless renderer. FP16 delivery resolves
premultiplied alpha, clamps RGB, and quantizes RGB with native DeliveryFrame's
8x8 Bayer ranks and `(rank + 0.5) / 64 - 0.5`. Coordinates are final framebuffer
pixels. Conversion follows scene resampling and motion-sample accumulation.
Alpha receives no noise. FP16 remains opt-in. The default RGBA8 path retains
its original resolved WGSL, verified at shader creation, and exact byte output.
No transfer, linear-light, schema or setting change was made.

### Cause of the previous bias

Neither the matrix nor incomplete tile sampling caused the 0.125-code result.
The test compared delivery against intended scene values before FP16 storage.
Both adapters capture the intended 254.75-code patch as 254.62646484375 codes
before conversion. Its delivered 8x8 mean is 254.625. Storage contributes
-0.12353515625 code and final conversion contributes -0.00146484375 code.
The original end-to-end bias is still -0.125 code. This task does not correct
working-storage rounding or claim an end-to-end bias below 0.1 code.

The conversion oracle now uses the actual raw working input. An independent
row-major native Bayer matrix checks every delivered RGB pixel. All 64 ranks
appear once and their offsets sum to exactly zero. Complete opaque tiles must
still meet maximum error <=1 and absolute mean bias <0.1 code. No tolerance
was widened. Repeated frames, 1x1-to-8x8 resampling, motion accumulation,
zero/low alpha and raw-capture stability are covered.

### The three precision assertions

Source-upload versioning, inverse-Levels ramp recovery and intentional
Posterize levels describe working precision. Delivery dithering exposed
binary16 values just below integer codes, producing adjacent delivery codes.
The 1-row ramp also samples only one Bayer row, so its delivery histogram is
not a working-precision histogram.

These assertions now read owned raw working captures through
`renderWorkingFrame`, then round to nearest code in the test. Their exact
expected values remain unchanged: upload colours, 256 recovered ramp codes,
and Posterize levels [0,85,170,255]. All three pass on both adapters. Raw
captures preserve binary16 samples, premultiplied alpha and encoded-SDR
metadata without using the delivery shader or byte target.

### Adapter results

| Adapter | Maximum conversion error, codes | Maximum absolute tile bias, codes | Selected tests |
|---|---:|---:|---|
| Lavapipe, llvmpipe Mesa 26.2.5, LLVM 23.1.3 | 0.811279296875 | 0.00537109375 | 367 passed, 6 retained expected failures |
| NVIDIA RTX 3060, driver 610.57.04 | 0.811279296875 | 0.00537109375 | 353 passed, 14 failed, 6 retained expected failures |

Both selections contain the 21 Vitest files importing frameCompositor,
including the new delivery file. NVIDIA's failures are the same seven grain
and seven low-alpha colour-boundary cases documented above. No existing
failure marker, expected value or tolerance was changed to accommodate them.
Timeline-only typecheck exited 0. The broader S2 gate remains unmet because
A28 and the recorded hardware disagreements remain open.

Commands ran from color-s0 after sourcing bin/ntenv, with
LP_NUM_THREADS=2 and NODETOOL_TEST_WORKERS=1. Both VK_ICD_FILENAMES and
VK_DRIVER_FILES pointed to /usr/share/vulkan/icd.d/lvp_icd.json for lavapipe.
NVIDIA used ntenv's NVIDIA selection. Tests used --no-file-parallelism and
--testTimeout=60000. Typecheck used
`node scripts/run-tsc.mjs -p packages/timeline/tsconfig.json --noEmit`.
Logs are under /home/mg/Projects/nodetool-film/tmp/color-s2/:
`a88-final-lvp.log`, `a88-final-nvidia.log` and `a88-tsc.log`.

Disabling delivery dither made the new Bayer pixel oracle fail on lavapipe
(exit 1). Restoring the implementation passed both delivery tests (exit 0).
Logs: `a88-negative-lvp.log` and `a88-restored-lvp.log`.

Browser presentation, native execution, encoded video output and performance
were not verified. Native files were read only. Not run: test:affected, root
typecheck, lint, harness gate, /verify or full suites. No push was performed.

Changed files:

- `packages/timeline/src/render/frameCompositor.ts`
- `packages/timeline/tests/render.delivery.gpu.test.ts`
- `packages/timeline/tests/render.workingPrecision.gpu.test.ts`
- `packages/timeline/tests/workingCapture.ts`
- `docs/plans/color-precision/results/s2-working-chain.md`

## A28 parameter and saturation qualification

S2's exit gate is **not met**. This continuation extends qualification and fixes
two FP16 defects. It does not close complete-chain and caller qualification.
A88 is implemented, so its earlier absence is no longer a blocker.

### Scope and tolerances

The new GPU matrix enumerates shader and recipe exports, tests declared scalar
parameter endpoints, colour vectors, and explicit kernels, tables, transforms,
noise, denoise and visual-effect modes. Inputs include 0, 1/255, 2/255,
254/255 and 1, spatial edges, and alpha 0, 1, 2, 128, 254 and 255 codes.
Working input colours obey their declared alpha contract. Fixed sources and
masks remain byte resources. Bicubic and nearest resize use 16-to-23 scaling.
Each result records raw samples, minimum, maximum, non-finite count and parity.

The timeline matrix reuses the authored cases from
`packages/timeline/tests/render.parity.gpu.test.ts`, with an additional extreme
variant per effect and every blend mode. It asserts coverage against
CLIP_EFFECT_TYPES. All stylize and generator modes are included. Deflicker and
stabilize reuse their non-neutral analysis fixtures rather than fabricating
new analysis. Both opaque and transparent source edges render over an opaque
coloured background. This is not transparent-delivery qualification.
The agent render fixture in `packages/agents/tests/capabilities-timeline-render.test.ts`
checks clip timing and encoded output, not individual effect math. It was
inspected but not executed under this task's restricted test scope.

Compatibility uses the existing timeline parity limit of three codes mean
absolute error. Module comparisons use the same limit. Geometry additionally
uses a two-code maximum, with an independent texel-center oracle for nearest
resize. Posterize's module fixture uses a one-code maximum and an exact
half-intensity numerical assertion. These compare compatibility and geometry,
not precision improvement. RGBA8 is not used as a precision-benefit oracle.
Every raw float probe requires finite values in [0,1]. No existing assertion,
tolerance, skip or expected-failure marker changed.

### Reproduced defects and fixes

F15. Bicubic resize wrote negative and above-one values to FP16. The lavapipe
reproduction measured -0.07745361328125 to 1.1630859375. Catmull-Rom's negative
weights explain these excursions. They are not legitimate stored SDR values
under D10 because later passes previously consumed UNORM-saturated samples.
The FP16 shader now clamps all four components to [0,1] at that output.
It does not clamp RGB to alpha, which would change the byte path's semantics.
The new range assertions failed before this fix.

F16. NVIDIA Posterize put exact half-intensity premultiplied samples in the
lower bin in FP16. At two levels the local error was 254 codes. The fixture's
127/255 red and 254/255 alpha promote to an exact ratio of one half.
The FP16 specialization checks the candidate bin against multiplied boundaries,
correcting quotient rounding without an epsilon or a new threshold. The
one-code assertion failed before the fix. An independent calculation requires
that this exact half-intensity sample quantize to one before premultiplication.

ShaderModule has an optional internal working shader specialization. Both
specializations pass the existing premultiplication validator. Byte mode still
returns the original module. The resolved RGBA8 snapshot covers every shader
and remains unchanged. There is no persisted schema, transfer, linear-light,
setting or default change. FP16 remains opt-in.

F17. Lavapipe's RGBA8 nearest resize selects the left neighbour at output
(11,22) in the 16-to-23 fixture. FP16 and both NVIDIA formats select source
x=8, as the independent texel-center calculation requires. The byte/float local
delta is 128 codes. This is a geometry baseline disagreement, not lost FP16
colour precision. The new geometry test initially used byte pixels as its
oracle and failed. It now retains the same two-code maximum against computed
texel coordinates. The byte difference remains in the artifacts.

### Unclamped-module decisions

The plan's 29-module figure is historical. Repeating the WGSL-call inspection
at this task's starting commit identifies the following 30 module files,
including recipes without their own WGSL. Gaussian sharpen is included too.
This enumeration does not treat a historical count as a coverage assertion.
Each row states the decision for stored encoded-SDR colour. Internal signed
coordinates and kernel arithmetic are separate from stored colour.
No row authorizes out-of-range stored output. Decisions assume valid bounded
parameters and alpha contracts, not arbitrary malformed inputs.

| Module | Decision and reason |
|---|---|
| _canary.passthrough | No clamp needed for normalized tint. Multiplication cannot increase a bounded component. |
| alpha.premulToStraight | No clamp needed for valid premultiplied input. Division recovers bounded straight colour, with zero-alpha handling. |
| alpha.straightToPremul | No clamp needed. Bounded colour times bounded alpha remains bounded. |
| color.channelShuffle | No clamp needed for valid premultiplied input. Selects straight channels and premultiplies by selected alpha. |
| color.channelSplit | No clamp needed. Selects a bounded straight channel or a normalized weighted luma. |
| color.grayscale | No clamp needed. Normalized luma and interpolation remain bounded. |
| color.invert | No clamp needed. One minus bounded straight colour and coverage interpolation remain bounded. |
| color.solarize | No clamp needed. Selects original or inverted bounded straight colour. |
| filters.blur.gaussianSeparable | No additional recipe clamp. Its Gaussian passes use positive normalized weights. |
| filters.glow | No additional recipe clamp. Threshold attenuates, blur averages, and mixer.add explicitly clamps. |
| filters.pixelate | No clamp needed. Samples and interpolates bounded colour and alpha. |
| filters.sharpen.gaussian | No additional recipe clamp. Gaussian intermediates average, and sharpen.combine explicitly clamps. |
| filters.threshold | No clamp needed. Smoothstep coverage attenuates both colour and alpha. |
| keyer.lumaKey | No clamp needed. Product of bounded coverage terms attenuates both colour and alpha. |
| mask.apply | No clamp needed. Fixed coverage or its complement attenuates both colour and alpha. |
| mixer.dropShadow | No additional recipe clamp. Mask intermediates stay byte, and shadowCompose bounds shadow alpha. |
| mixer.outline | No clamp needed for normalized authored colour. Selects source, premultiplied outline or zero. |
| mixer.over | No clamp needed for valid premultiplied inputs and opacity. Source-over remains bounded. |
| sources.angularGradient | Fixed byte source. Convex interpolation of bounded endpoints is already bounded. |
| sources.checkerboard | Fixed byte source. Selects one bounded authored colour. |
| sources.solid | Fixed byte source. Returns bounded authored colour. |
| transform.affine | No clamp needed. Bilinear sampling or transparent black is bounded. |
| transform.cornerPin | No clamp needed. Guarded coordinate division selects bounded sampling or transparent black. |
| transform.crop | No clamp needed. Bilinear sampling or transparent black is bounded. |
| transform.displace | No clamp needed. Signed displacement changes coordinates, not sampled component bounds. |
| transform.mirror | No clamp needed. Reflection changes coordinates only. |
| transform.pad | No clamp needed for bounded fill colour. Selects fill or sampled input. |
| transform.polarRemap | No clamp needed. Coordinate remapping selects a bounded sample or zero. |
| transform.rotate90 | No clamp needed. Permutes sample coordinates. |
| transform.spherize | No clamp needed. Warped coordinates select a bounded sample or zero. |

Bicubic resize was outside this lexical list because its WGSL clamps sample
coordinates. Its output was not clamped. F15 demonstrates why searching for a
clamp call cannot qualify output bounds. Non-premultiplied intermediates,
unbounded caller parameters and arbitrary multi-effect combinations remain
outside the decisions above.

### Final measured results

Adapters: lavapipe llvmpipe, Mesa 26.2.5, LLVM 23.1.3, and NVIDIA RTX 3060,
driver 610.57.04. Both ran the same 361 module cases and 210 timeline cases.
All module outputs are finite and within [0,1] after the fixes.

The following entries are code-value errors. Mean entries are the largest
case mean in each family, not an average that dilutes a failing case. Sources
and fixed masks retain byte outputs. Cross-adapter values compare raw outputs.

| Family | Cases | Lavapipe parity max / mean | RTX 3060 parity max / mean | Cross-adapter raw max / mean |
|---|---:|---:|---:|---:|
| _canary | 2 | 0.0117 / 0.0008 | 0.0117 / 0.0008 | 0.0000 / 0.0000 |
| alpha | 2 | 0.5000 / 0.0567 | 0.5019 / 0.0569 | 0.1245 / 0.0022 |
| color | 122 | 1.0000 / 0.1347 | 0.8794 / 0.1355 | 0.1245 / 0.0088 |
| filters | 98 | 3.1782 / 0.7853 | 3.8848 / 0.7835 | 32.0618 / 0.2335 |
| keyer | 13 | 0.6138 / 0.1698 | 0.6143 / 0.1720 | 0.0010 / 0.0000 |
| mask | 7 | 1.0000 / 0.0039 | 0.0117 / 0.0008 | 1.0000 / 0.0215 |
| mixer | 34 | 0.5029 / 0.1272 | 0.5098 / 0.1283 | 1.6187 / 0.1186 |
| sources | 34 | 0.0000 / 0.0000 | 0.0000 / 0.0000 | 17.0000 / 0.1309 |
| transform | 49 | 128.0000 / 0.3995 | 0.5598 / 0.3016 | 1.0000 / 0.1005 |

Lavapipe timeline delivery: maximum local byte/float difference 128
codes, largest case mean 0.781250 codes.

RTX 3060 timeline delivery: maximum local byte/float difference 128
codes, largest case mean 0.781250 codes.

Across adapters, timeline FP16 delivery differs by at most 1 code,
with largest case mean 0.083225 codes.

F18. The timeline's local 128-code difference is Posterize at a bin boundary
on both adapters. Unlike F16, storage promotion moves a source value below a
threshold before the operation. For example, 170/255 is 2/3, but its binary16
representation is 0.66650390625. Three-level Posterize therefore sees a value
below its 2/3 boundary. This is precision-sensitive input to a discontinuous
effect. Changing its threshold or rounding every float input back to bytes
would need a semantics decision. Neither was done. The three-code mean passes,
but does not qualify this local visible change. A28 remains open for that reason.

The largest cross-adapter raw filter difference is legacy grain@1. The largest
source difference is Gaussian noise. Both also differ in RGBA8, so these are
not demonstrated FP16-only regressions. This matrix records them rather than
claiming cross-adapter pixel identity. Timeline FP16 delivery is within one
code across adapters on its different fixtures.

### Previously recorded NVIDIA cases

The seven colour-boundary failures are PNG untagged, PNG sRGB, PNG P3, WebP
untagged, WebP sRGB, WebP P3, and MOV with alpha=true. Their complete test names
remain F8–F14 above. They are low-alpha colour reconstruction disagreements,
with previously measured maximum error 255. The seven grain cases F1–F7 compare
CPU/GPU grain parameters and have much smaller quantization differences.
They are not the same demonstrated failure mechanism. F16 is another numerical
boundary issue, but this experiment does not establish a common driver cause.
Those fourteen existing cases were not rerun in this continuation because their
source files were not changed. Their prior evidence remains open.

### Verification and remaining gate work

Each adapter passed 180 tests across the six selected GPU files and the one
new timeline test containing 210 cases. The GPU range matrix contains 361
cases inside one test. GPU and timeline package typechecks passed. The GPU
package alone was rebuilt so timeline tests loaded the current shader changes.
Negative runs failed for bicubic bounds on lavapipe and exact Posterize bins on
NVIDIA. The resolved RGBA8 snapshot and existing shader pixel tests passed.
This establishes byte compatibility for the checked shaders and pixel fixtures,
not every caller or every possible picture.

A1. Resolve F18's visible Posterize boundary difference without changing effect
meaning. Add independent numerical expectations for the remaining effect
families, rather than relying on a global mean comparison alone.

A2. Qualify arbitrary multi-effect chains and host callers, including browser
presentation, native execution and encoded delivery. The current matrix covers
single clip effects, nested recipes and blend modes, not new full-stack host
fixtures. Agent migration remains A91's separate gate.

A3. Resolve or explicitly qualify the recorded hardware grain, noise and
low-alpha boundary disagreements. Keep geometry failures separate from
precision measurements. Test intermediates that violate premultiplied bounds
before concluding that alpha conversion needs no saturation in every chain.

A4. Recheck realistic output after these fixes. The prior dark-fade benefit
remains recorded, but the A81 scenes were not rerun here. Sky and grade/glow
still have no established visible improvement. Do not start S3 on a claim that
S2's exit gate has passed.

Commands used `source /home/mg/Projects/nodetool-film/bin/ntenv`,
`LP_NUM_THREADS=2` and `NODETOOL_TEST_WORKERS=1`. Lavapipe set both
VK_ICD_FILENAMES and VK_DRIVER_FILES to
`/usr/share/vulkan/icd.d/lvp_icd.json`. NVIDIA retained ntenv's selection.
Vitest used `npm test --workspace=packages/<gpu|timeline> -- <files>
--no-file-parallelism`. Typechecks used
`node scripts/run-tsc.mjs -p packages/<gpu|timeline>/tsconfig.json --noEmit`.

Selected GPU files: a28Parameters.test.ts, workingFormat.test.ts,
module.test.ts, batch3Transforms.test.ts, batch1Modules.test.ts and
shaderCorrectness.test.ts. Selected timeline file: render.a28.gpu.test.ts.

Artifacts are under `/home/mg/Projects/nodetool-film/tmp/color-s2/`:
`a28-{lvp,nvidia}.json`, `a28-timeline-{lvp,nvidia}.json`,
`a28-final-{lvp,nvidia}.log`, `a28-timeline-{lvp,nvidia}.log`,
`a28-negative.log`, `a28-posterize-negative.log`,
`a28-{gpu,timeline}-tsc.log`, `a28-gpu-build.log` and `a28-summary.txt`.
JSON contains per-case pixels and metrics, allowing direct adapter comparison.

Not run: test:affected, root typecheck, lint, harness gate, /verify and full
suites. No push was performed. All edits are confined to color-s0 on film/color-s2.

Changed files:

- `packages/gpu/src/module.ts`
- `packages/gpu/src/workingFormat.ts`
- `packages/gpu/src/shaders/transform/resize/v1/module.ts`
- `packages/gpu/src/shaders/color/posterize/v1/module.ts`
- `packages/gpu/tests/workingFormat.test.ts`
- `packages/gpu/tests/a28Parameters.test.ts`
- `packages/timeline/tests/render.a28.gpu.test.ts`
- `docs/plans/color-precision/results/s2-working-chain.md`

GPU fix and module reproduction commit: `0290962a42`.
The timeline matrix and this report are in the following qualification commit.

## A28 closeout and scoped S2 gate

This section supersedes the open A28 and hardware-blocker conclusions above.
Work started at `42bb253f9d` on `film/color-s2` in color-s0.

### Posterize decision and proof

Posterize intentionally selects discrete byte-domain bands. In FP16 only,
recover premultiplied RGB and alpha byte codes for bin selection. Divide their
integer-scaled ratio with the existing cross-multiplication boundary correction.
Keep float alpha, coverage and uncovered colour in the output. Snapping straight
RGB alone was insufficient: NVIDIA division could move an exact half-intensity
ratio below its rounding midpoint. The existing low-alpha module assertion
caught that attempt and passes with the final implementation.

The new full 0–255 opaque ramp covers levels 2, 3, 4, 5, 7, 16, 64, 128, 255
and 256. It checks RGBA8 compatibility and an independent integer-bin oracle
with a one-code delivery allowance. The pre-fix NVIDIA run failed at levels=3,
codes 85 and 170, with 127/128-code discrepancies. Both adapters pass after the
fix. The existing premultiplied low-alpha matrix also passes. This does not
promise identical outputs for every straight-alpha source whose premultiplication
itself differs between formats. Float intermediates intentionally use byte-domain
bin selection at Posterize, while other effects keep float precision.

All resolved RGBA8 WGSL strings remain byte-identical to the recorded snapshot.
Existing Posterize shader pixel tests pass. No default shader, transfer function,
schema, setting or failure marker changed. FP16 remains off by default.

### Combined effects and caller fixtures

The timeline matrix now contains 216 cases, including six combined cases.
Each combined scene applies non-neutral colour, blur, glow, curves and grain,
then a hard shape mask and wipe transition, over a coloured background. Normal,
screen and multiply blends run with opaque and low-alpha foregrounds. Grain
uses the authored payload from `capabilities-timelines-grain.test.ts`.
This reuses its rendering input, not the agent persistence test or CPU renderer.

Declared bounds are maximum four codes and mean three codes for combined
delivery. Every omitted effect must visibly change the picture by more than
one code. The excluded shape-mask rows must exactly equal a separately rendered
background. That control includes final dithering, which an initial direct
source-byte assertion incorrectly omitted. No tolerance was widened.

Values below are maximum / mean absolute differences in delivered RGBA codes.

| Stack | Alpha | NVIDIA RTX 3060 | Lavapipe llvmpipe |
|---|---|---:|---:|
| Normal | Opaque | 2 / 0.143555 | 2 / 0.167426 |
| Normal | Partial | 3 / 0.221354 | 3 / 0.211046 |
| Screen | Opaque | 2 / 0.141927 | 2 / 0.155382 |
| Screen | Partial | 2 / 0.157986 | 2 / 0.162869 |
| Multiply | Opaque | 2 / 0.138455 | 2 / 0.146593 |
| Multiply | Partial | 2 / 0.139865 | 2 / 0.132487 |

The prior module geometry oracle remains separate from compatibility. These
fixtures do not exhaust arbitrary graphs or prove host integration.

### Hardware discrepancies

Explicit RGBA8 reproduces the seven NVIDIA grain failures and the seven PNG,
WebP and MOV low-alpha failures. Lavapipe passes them. Six existing expected
failures remain unchanged on both adapters. These are not FP16 regressions.
The shader matrix independently measures cross-adapter legacy grain differences
of 32 codes in RGBA8 and 32.061768 in FP16. Gaussian noise differs by up to 17
codes identically in both modes because its source target remains byte.

[B218](../../../../native/timeline/docs/gaps-backlog.md) records these adapter
findings. No small correction preserving default pixels on both adapters was
established. Production behavior is unchanged. They do not block this scoped S2
precision gate.

### A81 scenes and final delivery

Artifacts are in `/home/mg/Projects/nodetool-film/tmp/color-s2/`.
`final-{nvidia,lvp}/` contains controlled-quantizer PNGs, working metrics and
diagnostic JSON. `delivery-{nvidia,lvp}/` contains production headless PNGs and
delivery JSON. All scenes are 768×432. The source fixtures are shared between
the module experiment and the timeline caller.

The diagnostic recovers 256 distinct levels with zero-code error on both
adapters. RGBA8 recovers 192 with maximum error 11. The module dark fade uses
an encoded exposure inverse pair. FP16 matches its source exactly undithered
and within one code dithered. RGBA8 loses up to 17 codes. Visual inspection of
the NVIDIA PNG pair confirms the removed colour blocks. Sky and grade/glow
have no separately established visible improvement.

| Module scene | NVIDIA working RMS / max | Lavapipe working RMS / max | Final dithered max, both adapters |
|---|---:|---:|---:|
| Dark fade | 9.235686 / 16.994869 | 9.161025 / 16.126228 | 17 |
| Sky | 0.306934 / 1.208502 | 0.315827 / 1.224127 | 2 |
| Grade/glow | 0.761576 / 2.275939 | 0.722831 / 2.218201 | 3 |

The production timeline exposure effect uses its existing linear-exposure
shader, unlike the encoded module experiment. Neither was changed. Its blur,
vignette and glow also use the existing caller mapping. These are caller
variants of the same source scenes, not claims of identical effect recipes.

| Production delivery scene | NVIDIA max / RGB mean | Lavapipe max / RGB mean |
|---|---:|---:|
| Dark fade | 6 / 2.279410 | 6 / 2.276590 |
| Sky | 1 / 0.252565 | 2 / 0.258802 |
| Grade/glow | 2 / 0.242725 | 2 / 0.243745 |

Dark-fade differences above are expected precision recovery, not a compatibility
failure. FP16 source-relative maximum error is one code, with means 0.094727
on NVIDIA and 0.095156 on lavapipe. Sky and grade/glow meet the predeclared
four-code maximum and three-code mean. Their source-relative errors do not
measure fidelity because those effects intentionally change colour.

### Gate and limits

S2's gate is **met for the opt-in shared GPU and headless timeline chain on
NVIDIA RTX 3060 and lavapipe**. The working chain retains precision, the dark
fade visibly improves, and selected non-neutral effect combinations preserve
meaning within declared bounds. A28 is complete for this shared-chain scope.
It does not qualify real browser preview/WebCodecs, native execution or agent
export integration. Those host gates remain A93, A94 and A91. No host was
enabled. No improvement is claimed for every scene or every parameter choice.

### Verification

Adapters are NVIDIA RTX 3060 driver 610.57.04 and lavapipe llvmpipe Mesa
26.2.5-arch1.1, LLVM 23.1.3. Both selected GPU runs pass 112 tests, including
the 361-case module matrix and unchanged-byte shader snapshot. Both final
combined matrices, Posterize ramps and production-delivery scene tests pass.
The lavapipe four-file timeline run passes 35 tests and retains six expected
failures. NVIDIA retains the fourteen explicit-RGBA8 failures described above.
GPU and timeline package typechecks exit zero.

Commands source `bin/ntenv`, set `NODETOOL_TEST_WORKERS=1`, and use Vitest
`--no-file-parallelism`. Lavapipe sets both Vulkan variables to
`/usr/share/vulkan/icd.d/lvp_icd.json` and `LP_NUM_THREADS=2`.
Only the changed tests and existing tests of the Posterize source ran.
After extracting the scene fixture, precisionBenefit.test.ts ran again on both
adapters. Logs use `closeout-*`, with `posterize-negative.log` retaining the
pre-fix failure. Per-case pixels use `closeout-{modules,timeline}-{adapter}.json`.

Not run: test:affected, root typecheck, lint, harness gate, /verify or full
suites. Browser/native/agent integration and native-shared vector consumption
were not reverified. No push was performed.

Commits: `3a8157a9d8` fixes Posterize, and `aab0b2d877` adds combined
qualification and explicit byte hardware tests. `1e8ac9d058` adds scene fixtures and final-delivery evidence. This record is
committed separately after these changes.

Changed files in this closeout:

- `packages/gpu/src/shaders/color/posterize/v1/module.ts`
- `packages/gpu/tests/precisionBenefit.test.ts`
- `packages/gpu/tests/fixtures/precisionScenes.ts`
- `packages/timeline/tests/render.posterizeRamp.gpu.test.ts`
- `packages/timeline/tests/render.a28.gpu.test.ts`
- `packages/timeline/tests/render.a81Delivery.gpu.test.ts`
- `packages/timeline/tests/render.grain.gpu.test.ts`
- `packages/timeline/tests/render.colorBoundary.gpu.test.ts`
- `native/timeline/docs/gaps-backlog.md`
- `docs/plans/color-precision/high-precision-media-processing.md`
- `docs/plans/color-precision/results/s2-working-chain.md`

A21–A24 and A88 checkboxes use the completed shared implementation and prior
verification recorded earlier in this report. Their entire selections were not
rerun in this closeout. A81 and A28 include the new evidence above.
