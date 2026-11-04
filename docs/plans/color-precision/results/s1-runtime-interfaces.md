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
