# S5 agent rendering qualification

A91 is met: one renderer child per parent, with the agent callers on shared
shaders. CI has not yet run this branch. A92 remains open after the caller audit below.
FP16 remains off.

## A92 caller audit and GPU assertion migration

A92 remains unchecked. The requested assertions now run through the default
RGBA8 shared GPU compositor, but the audit found no unused function in
`cpuLegacyEffects.ts`, `cpuVisualEffects.ts` or `canvas2d.ts`. No production
implementation was removed. Retiring their reachable browser callers would
require A94, which is outside this task. The explicit agent CPU qualification
argument also remains because retained regression callers use it. A decision
to retire that qualification route needs a separate change to its callers.
It is not an automatic missing-adapter fallback.

### Caller inventory and retained routes

The [function-by-function inventory](a92-cpu-callers.md) enumerates every
named function in those three modules, with direct call locations including
regression tests and internal helper calls. The inventory was captured before
the two test migrations. Searches covered checked-in `web`, all `packages`
(including agents, timeline, video-nodes, every cli-* package and image-editor),
`native` and `scripts`. Generated dist and dependency trees were excluded.
Text searches for symbols and module imports were followed by TypeScript AST
call enumeration. Generic private names were scoped to their defining module.
This is an in-repository caller audit, not a claim about downstream npm users.

| Area inspected | Callers and reachability | Decision |
|---|---|---|
| Timeline CPU effects | `canvas2d.applyCpuEffectChain` calls `applyCpuLegacyEffects`, `applyCpuVisualEffects`, `applyCpuDropShadows`, `applyCpuColorGrade`, `applyCpuGaussianBlur`, both effect predicates and `alphaBounds`. `drawTimelineLayer` calls `applyCpuIris`. Internal sampling, grain, blur and alpha helpers remain reachable. | Keep every function. None is an FP16 oracle. |
| Timeline CPU composition | `drawTimelineFrame` reaches stack, adjustment, group, layer, matte, crop, projective, transition, shadow and CSS-filter helpers. `layerCanvasAffine` also serves `ReframeFocusOverlay`. | Keep every function. Exact callers are in the inventory. |
| Web | `preview/gpu/canvas2dCompositor.ts` calls `drawTimelineFrame` and `unsupportedEffectTypes`. `createCompositor.ts` selects Canvas2D when needed. `rasterClipFrames.ts` constructs it directly. Preview and browser export share selection. | Keep compatibility selection for A94 and source rasterization. |
| Agents | `timeline-preview/frames.ts` retains `drawTimelineFrame` and `unsupportedEffectTypes` behind `sharedShaders=false`. `timeline-shared-preview.test.ts` and `timeline-preview-parity-regressions.test.ts` exercise that route. Production preview/comparison in `capabilities/timelines.ts`, storyboard reference/final renders in `agentic-storyboard-finish.ts`, `storyboard-layout-check.ts` and `timeline-clip-frames.ts` use the shared renderer default. | Keep the explicitly reached qualification branch. No default or error behavior changes. |
| Video nodes | `timeline/compositeRender.ts` uses the shared compositor. `timeline/browserRender.ts` drives the browser exporter, whose Canvas2D selection remains reachable. No direct call to the two CPU effect modules was found. | Keep browser behavior and restricted rough-cut routes. |
| CLI packages | No direct call to the three audited modules was found. Timeline rendering delegates to video-nodes. `cli-sketch/src/commands/sketch-render.ts` calls `agents/sketch-render`. | Keep delegates and sketch rendering. |
| Image editor and sketch hosts | `image-editor/src/render/document.ts` uses `layerEffectsFilter` and host canvas composition. `agents/src/sketch-render/render.ts` calls `renderSketchDocument` and provides `blendModeToCanvasOp`. Web sketch `rendering/canvas2d/resolvedOutput.ts` also uses `layerEffectsFilter`. | Keep separate sketch composition, editing and source-raster helpers. They were inspected as live routes, not candidates for timeline deletion. |
| Native tooling | No direct invocation/import of the audited TypeScript CPU modules was found. Native effect implementations and shader references are separate. | No native changes. B218 hardware differences were not qualified here. |

`@nodetool-ai/timeline/render` publishes `canvas2d.ts` through `export *`.
The individual CPU modules are not re-exported there and have no package
subpath exports. `agents` does not publish `timeline-preview/frames` as a
subpath, but does publish `sketch-render`. Image-editor's render surface stays
intact. No public symbol, package export map or capability spec changed.
No applicable Knip/unused-export script was found in the root or the inspected
timeline, agents, video-nodes, image-editor and cli-* package manifests.

### Assertions and default-output evidence

The original five tests passed before migration. Their GPU versions then
passed without changing any threshold:

| Migrated file | Preserved assertions |
|---|---|
| `render.precision.gpu.test.ts` | Inverse Levels retain at least 192 distinct values, maximum error at most 11 and monotonicity. Hidden transparent red cannot change the blur result. Compositing the white blur over black and white retains the one-byte error limit. |
| `render.curveFidelity.gpu.test.ts` | Red quarter tone remains 101–103 with exact unchanged green/blue/alpha. Lifted black and lowered white stay within one byte. Non-monotonic midpoint stays above 200. Master-before-channel ordering and endpoint holds retain the one-byte limits. |

`renderEffectsGpu.ts` drives `HeadlessFrameCompositor` with the existing
fixture pixels and default working format. It disposes each renderer in a
finally block. It neither calls a CPU renderer nor uses CPU output as a
reference. No `it.fails` was added or modified. The six color-boundary expected
failures remain byte-for-byte unchanged. No test invokes ffmpeg or ffprobe.

No production route was touched, so no new default-output hash baseline was
substituted for the existing fixtures. `git diff 8cd02f97a5 -- web/src
packages/*/src native` is empty. The following source tree hashes are unchanged
from that starting commit, proving that the browser, server and agent rendering
implementations and their FP16 defaults are identical:

| Source tree | Git tree hash |
|---|---|
| `packages/timeline/src` | `ec766372425eac869674ebbc72d1b3af08e7b134` |
| `packages/agents/src` | `b4166ac12098ce0bb9fbea9b88a21819b3a0142c` |
| `web/src` | `9fbc07e19bfabd71f177dd7e6b693cfe75a2f9a7` |
| `packages/video-nodes/src` | `fdc8f122980f4ea5e4790ca7ddf93ffb606ab865` |
| `packages/image-editor/src` | `aa2bb84593b2c81482fde4e869e34cbeea60b93e` |

A91's output fixtures and no-addon/no-adapter tests remain intact, including
`timeline-preview-lifetime.test.ts`, `timeline-render-child.test.ts` and their
probe fixtures. D7.1 still reports missing-addon installation guidance and
missing-adapter Mesa/ICD guidance, with no automatic CPU retry. Those untouched
agent tests were not rerun under the requested test-file restriction.

### Verification

Both migrated files passed, five tests, with one Vitest worker after rebuilding
only `packages/gpu` to refresh stale `workingFormat` declarations. The initial
run of both original and migrated files passed ten tests. Timeline-only
`run-tsc --noEmit` passed after that dependency rebuild. Enforced and plain
oxlint passed on the three new/changed test files. No production source
directory changed. Whitespace and control-byte checks passed.

GPU runs unset DISPLAY and set both Vulkan ICD variables to
`/usr/share/vulkan/icd.d/lvp_icd.json`. The acquired device reports vendor
`mesa`, architecture `software`, device `llvmpipe-llvm-23-1-3-256-bits-`,
description `llvmpipe: Mesa 26.2.5-arch1.1 (LLVM 23.1.3)`. No NVIDIA result is
claimed. TMPDIR and TMPPREFIX were under `/home/mg/Projects/nodetool-film/tmp`.
No large render output was created.

Not run: test:affected, root typecheck, root lint, harness gate, /verify, full
suites, full dependency builds, browser/native hardware qualification or
capabilities:sync. The capability spec did not change. No push, branch switch,
rebase, merge or PR occurred.

## Current qualification: queued child and migrated callers

This section supersedes the historical checkpoints below. The implemented
policy waits for the preceding render pass and its child exit before starting
the next child. There is no warm retained child, scheduler, routing service,
busy rejection or CPU fallback. The existing frame protocol still serializes
frames within a pass. Layout checks borrow the child across all same-size
backdrop and isolated-layer renders, then await its exit in a finally block.
A cancelled waiter rejects before the active pass ends
and does not release later waiters ahead of that pass. Child close rejects a
pending frame with exit status and releases ownership. A later pass starts a
fresh child. Real-child tests cover queueing, cancelled waiters, continued
rendering by another caller, SIGKILL during a pending frame and recovery.

### Memory and queue latency

The unchanged fixture renders two 160×90 shape frames per pass. Its parent
baseline is recorded after importing preview modules and one idle second.
Twenty serial passes precede batches of two and four concurrent requests.
Sampling is every 25 ms and may miss shorter peaks. The concurrent row covers
both batches. Added RSS is child peak plus maximum positive parent growth.
The combined column is a simultaneous sample, not a sum of separate maxima.

| Adapter / phase | Baseline MiB | Child peak MiB | Parent growth MiB | Added MiB | Combined MiB |
|---|---:|---:|---:|---:|---:|
| lavapipe / serial | 357.78 | 262.62 | 93.61 | 356.23 | 713.95 |
| lavapipe / concurrent 2 and 4 | 357.78 | 243.56 | 99.25 | 342.81 | 697.26 |
| RTX 3060 / serial | 358.46 | 283.39 | 92.87 | 376.25 | 732.46 |
| RTX 3060 / concurrent 2 and 4 | 358.46 | 282.24 | 98.73 | 380.96 | 738.21 |

Both adapters pass the owner-approved 512 MiB renderer-added gate. Parent
growth from the first to twentieth completed pass is 14.88 MiB on lavapipe and
13.99 MiB on RTX, below the existing 64 MiB limit. These are small-preview
measurements, not bounds for arbitrary resolution or source sizes.

| Adapter | Cold call ms | Two completions ms | Four completions ms | Added completion delay, last minus first ms |
|---|---:|---|---|---|
| lavapipe | 595.05 | 517.11, 1017.17 | 538.32, 1043.41, 1548.91, 2047.68 | 500.06 / 1509.36 |
| RTX 3060 | 988.36 | 701.02, 1377.21 | 701.28, 1408.44, 2122.08, 2813.76 | 676.19 / 2112.48 |

The last column reports added latency for two and four requests respectively.
It includes scheduling and render-duration variation, rather than pretending
to measure only time inside a queue. Calls and batch completion remain below
the existing ten-second small-fixture limits. Warm CPU calls measured last
were 3.11 and 3.18 ms. They are not cold-start baselines.

GPU runs unset DISPLAY. Lavapipe sets both ICD variables to
`/usr/share/vulkan/icd.d/lvp_icd.json`. RTX sources the NVIDIA 610 environment
after `bin/ntenv`. Long runs use a 6 GiB systemd scope. Available memory was
checked above 5 GB. No ffmpeg or ffprobe binary was used.

### Callers, outputs and cancellation

`renderTimelineFrames` now defaults to the headless child. Its explicit false
argument retains CPU qualification. This switches preview and comparison in
`capabilities/timelines.ts`, reference and final storyboard-finishing renders,
storyboard layout checks, and generated clip frame inspection. The callers
now pass their existing run or context AbortSignal into rendering. Source
rasterization, media decoding, frame geometry, timecodes, PNG encoding and
output persistence stay in the parent. Native initialization is lazy. The
child uses the existing 8-bit compositor default. BT.709 and the six expected
GPU boundary failures are unchanged.

The opaque fixture matches decoded RGBA exactly, including geometry, times
and reports. Existing preview regression assertions are retained. An unknown
mask kind initially produced a transparent mask in the shared adapter. The
adapter now respects the rasterizer's false return and preserves the CPU
unmasked behavior. The static-motion test now counts real shared draws and
still requires one draw for a static frame and eight for moving content.
Strict absent-field assertions were not changed.

The first broad caller run exposed 40 failing storyboard-finishing tests,
mostly at the unchanged 30-second test deadline. Starting a child for every
isolated layout frame was too slow. Reusing one child within each layout-check
batch made the first failing test pass in about 12 seconds. No Vitest wall timeout was
raised. The original failure log remains available. Two script-deadline cases
also needed their simulated script budget changed from two to ten seconds,
matching the cold-preview qualification budget. The real sandbox timer was
expiring during renderer preflight before the provider pause could be reached.
They still advance exactly to the deadline, require prompt cancellation and
reject a late commit within the unchanged twelve-second test wall limit.

`preview-output-differences.mjs` compares the existing Serein gap fixture at
eleven clip-midpoint times, 480×270, before PNG encoding differences can affect
the comparison. It decodes both PNGs and measures their RGBA channels. The
table below is populated from the retained adapter logs. Effects and visual
features are named by fixture, without treating Canvas2D as a precision oracle.

| Time ms | Max channel delta lavapipe / RTX | Mean absolute channel delta lavapipe / RTX | Changed channels lavapipe / RTX |
|---|---:|---:|---:|
| 600 | 63 / 63 | 0.035818 / 0.035745 | 757 / 661 |
| 1900 | 0 / 0 | 0.000000 / 0.000000 | 0 / 0 |
| 2850 | 63 / 63 | 0.026671 / 0.026603 | 867 / 816 |
| 3250 | 63 / 63 | 0.018991 / 0.018900 | 926 / 876 |
| 4100 | 55 / 55 | 0.012747 / 0.012654 | 369 / 332 |
| 4550 | 55 / 54 | 0.012458 / 0.013750 | 1826 / 2511 |
| 5500 | 55 / 55 | 0.021779 / 0.021661 | 717 / 641 |
| 6700 | 0 / 1 | 0.000000 / 0.027691 | 0 / 14355 |
| 7700 | 2 / 3 | 0.005866 / 0.011908 | 2954 / 5850 |
| 8700 | 44 / 44 | 0.141935 / 0.141713 | 3701 / 3311 |
| 9700 | 26 / 26 | 0.031034 / 0.030820 | 1216 / 1032 |

RGB split at 1900 ms and the gradient-field generator at 6700 ms match
exactly. Fitted-pill transitions, grouped text, gradient text, projective
depth cards and source clipping have the differences listed above. Both
renderers report no omitted effects on this fixture. The measurements report
differences rather than changing tolerances to suppress them. They do not
establish equivalence for arbitrary authored effects.

### CLI startup and API contention

The actual built CLI command `nodetool tools call preview_timeline_frame`
rendered an inline red shape, persisted its PNG and exited naturally with code
0 in 4.284 seconds on lavapipe and 4.750 seconds on RTX. The ten-second
completion gate passes. A cold `tools info preview_timeline_frame` completed
in 4.403 seconds. Those timings include process startup, tool registration,
database setup and output handling. A stale generated catalog initially
reported core 0.8.11 against CLI 0.8.10. Running `pack-core/build.mjs` copied
this branch's checked-in catalog into dist and resolved that mismatch.

The complete API server ran on isolated loopback ports with a separate SQLite
database. The retained client uses `/mcp`, `execute_code` and
`nodetool.timelines.preview`, including actual asset persistence. Six requests
per adapter all reported complete. Concurrent request arrival order is not
guaranteed through the sandbox, so the table reports final completion.

| Adapter | Two requests ms | Four requests ms | Health p95 during four ms | Health max during four ms |
|---|---:|---:|---:|---:|
| lavapipe | 1420.73 | 2258.85 | 2.06 | 23.67 |
| RTX 3060 | 2230.56 | 3686.56 | 4.08 | 16.71 |

Baseline health maxima were 3.22/4.06 ms. During the first pair, maxima were
39.41/63.45 ms. Server time from entering startup to listen was 1.905/1.915 seconds
on the successful lavapipe/RTX file-entry runs. This excludes module import.
The API servers were deliberately stopped after measurement because a server
is meant to stay alive. That is separate from the natural CLI exit check.

A smaller isolated HTTP capability probe also measured cold lazy-module
import contention. Its initial maximum stall was 1524.89 ms on lavapipe and
1392.89 ms on RTX. Warm four-request health maxima were 10.92/15.41 ms.
Those import stalls remain reported even though the complete server loads
more of those modules before accepting requests.

### Minimal installation and remaining boundary

Packed the current agents workspace and attempted installation into a new
directory with `npm install --omit=optional --ignore-scripts`. Installation
failed with registry HTTP 404 for required `@nodetool-ai/presets@*`, because
that package is not published yet. Published `@nodetool-ai/agents@0.8.10` does
not depend on it, so this affects the next release only.

Packing `agents`, `presets`, `timeline` and `gpu` from this branch and installing
those tarballs with the rest from npm gives a clean install of 303 packages with
no `webgpu` package. `better-sqlite3` then needs `npm rebuild` because of
`--ignore-scripts`. In that install, `@nodetool-ai/agents` loads, and rendering
through the real child reports:
`The optional "webgpu" package (WebGPU (Dawn)) is not installed.` with
`nodetool packs add webgpu --yes`, and the process exits 0. A render with the
addon installed from a clean install was not tried. The other sibling packages
came from npm at 0.8.10, so an install from a real release remains to be seen.

The isolated missing-addon fixture still proves ordinary tool registration
loads no Dawn and a child render returns `nodetool packs add webgpu --yes`.
The real child with invalid ICD variables returns `mesa-vulkan-drivers`
guidance. Neither failure silently retries through Canvas2D. A publishable
dependency closure is needed for a fresh-install result. No hardware purchase
or change to the memory budget is required by these measurements.

### Verification and logs

All checks used one Vitest worker on lavapipe. The selected preview baseline
passed 154 tests in 17 files. After migration, 151 initially passed and three
failed. The mask and draw-count corrections passed all 15 tests in those two
files. The final static test passed both cases after removing an inherited
conditional spread. After layout batching, shared-preview and mask regressions
passed 16 tests. The real-child lifecycle file passed all 14 tests.

The seven affected caller files initially passed 224 tests and failed 40 in
`capabilities-agentic-storyboard-finish.test.ts`. With layout batching, that
file passed 39 cases and failed four deadline/spy cases. The focused rerun
passed all four after correcting the script-deadline setup. Thus every one of
the 264 selected caller cases has passing evidence after its relevant fix.
The six other files were `capabilities-timelines`, `capabilities-timeline-render`,
`capabilities-timeline-preview`, `timelines-op-input`, `timeline-render-wait-budget`
and `timeline-headless-media-parity`. No dependency-resolution failure prevented
a test from running. The existing execution dist was available, so no temporary
Vitest configuration was required.

Agents build and agents-only typecheck passed. Enforced oxlint passed on
`src/timeline-preview` and `src/capabilities`, and on the changed tests.
It reported pre-existing unused-import/variable warnings in untouched
capability files including assets, ui, files, video-production, timeline-bridge,
scripts, models and memory. There were no enforced source errors.
Agent-doc validation, whitespace checks and the control-byte scan passed.

As requested, test:affected, root typecheck, root lint, harness gate, /verify,
full suites, full builds and full Electron packaging checks were not run.
No `it.fails` cases or pixel tolerances were added or weakened.

Logs are under `/home/mg/Projects/nodetool-film/tmp/color-s5/`, prefixed
`a91-queue-`, `a91-output-`, `a91-cli-`, `a91-api-`, `a91-full-api-`,
`a91-minimal-`, `a91-migration-`, `a91-callers-`, `a91-final-`, `a91-batch-`,
`a91-finishing-`, `a91-deadline-` and `a91-borrowed-`.
Only small JSON, text, database, PNG and package artifacts remain. No branch
switch, merge, rebase, push or PR occurred. The task started with the reported
38-commit deficit. A later read of the shared local tracking ref showed 73
missing commits. This task did not fetch or merge that ref.

## Historical checkpoints

The remaining sections preserve earlier evidence and decisions. Their claims
about the current implementation are superseded by the section above.

## Current gate after owner decision

Owner decision on 2026-11-05 replaces the combined 512 MiB RSS gate with
renderer-added RSS below 512 MiB. Measure the idle parent after loading agent
preview modules, before any render, in the same process that renders. Add the
child peak RSS to the parent's maximum positive growth above that baseline.
The twenty-cycle growth limit remains below 64 MiB. Cold render, concurrent
completion and one-shot completion limits remain unchanged. The historical
combined-gate failures below are retained as evidence, not the current policy.

A91 remains incomplete. Serial rendering passes this new memory gate on both
adapters. The existing two-child concurrency limit fails it on both adapters.
No production caller switched. A92 and FP16 remain excluded. Stopped at this
resource gate as requested. An owner decision is needed on reducing allowed
concurrency or further memory work before migration. This report does not
reinterpret 512 MiB as a separate allowance for each concurrent child.

### New memory measurements

Compiled `preview-child-full-path.mjs` loads the agent preview module and its
dependencies, waits one second idle, and records RSS before any render. It then
runs twenty serial two-frame 160×90 shape passes and two concurrent passes.
The CPU comparison runs last, outside memory sampling. No forced GC is used.
Each phase reports the peak simultaneous child RSS, maximum parent growth,
their sum, and peak simultaneous combined RSS. The sum is conservative because
its two maxima can occur at different samples. All RSS sampling is at 25 ms
and can miss shorter peaks. Individual child peaks remain in the JSON.

| Adapter / phase | Parent baseline MiB | Child RSS peak MiB | Parent growth MiB | Added sum MiB | Combined peak MiB | Added gate |
|---|---:|---:|---:|---:|---:|---|
| lavapipe / serial | 357.40 | 263.80 | 93.05 | 356.86 | 712.12 | Pass |
| lavapipe / concurrent | 357.40 | 495.07 | 95.02 | 590.09 | 946.59 | Fail |
| RTX 3060 / serial | 356.94 | 282.52 | 93.45 | 375.97 | 727.18 | Pass |
| RTX 3060 / concurrent | 356.94 | 546.84 | 95.35 | 642.19 | 997.86 | Fail |

Concurrent child RSS is the simultaneous total of both children. The baseline
is reused across both phases. Parent growth between completion of the first
and twentieth serial passes is 14.38 MiB on lavapipe and 14.24 MiB on RTX,
passing the unchanged 64 MiB limit. Combined totals remain reported for audit.
Even simultaneous combined peak minus baseline exceeds 512 MiB for both
concurrent phases, so independently timed maxima do not explain the failure.

The companion staged probe identified Mesa software llvmpipe, Mesa 26.2.5,
and NVIDIA Ampere GeForce RTX 3060, driver 610.57.04. DISPLAY was unset.
Lavapipe set both VK_ICD_FILENAMES and VK_DRIVER_FILES to
`/usr/share/vulkan/icd.d/lvp_icd.json`. RTX sourced
`/home/mg/.local/nvidia-610/env.sh` after the project `bin/ntenv`.
Twenty-cycle runs used `systemd-run --user --scope -p MemoryMax=6G`.
Available host memory exceeded 5 GB before the runs.

### Timing, completion and remaining qualification

Cold render calls took 0.641 s on lavapipe and 0.841 s on RTX. Serial calls
ranged 0.511–0.699 s and 0.678–0.841 s respectively. Concurrent pairs took
0.796 s and 0.896 s. These pass the existing ten-second call budgets on this
small fixture. They exclude module import and the deliberate idle second.
The CPU timing now runs warm at the end and is not a cold-start comparison.
Both full-path processes exited 0 naturally after the loops and awaited child
teardown. This establishes probe completion, not complete one-shot CLI startup
under ten seconds. No API-contention or representative-media claim is made.

B223 is not fixed or reproduced by this checkpoint. Inspection of
`capabilities/timelines.ts` shows `render_timeline` starts a workflow through
`runWorkflow`, not the child-preview compositor. The child removes retained
Dawn from the preview probe's parent lifetime. It does not change that export
path or its model-interface initializer. No job tracker was added.

The missing-addon simulation was rerun and exited 0: ordinary tool registration
loaded no Dawn, and child rendering returned `nodetool packs add webgpu --yes`.
This is still an import-hook simulation, not a fresh minimal installation.
A real minimal-install test, full CLI timing, representative numerical media
coverage and packaged runtime qualification remain outstanding. Earlier
correctness and cancellation evidence below was not rerun or broadened here.

### CI audit and verification

Reinspection confirms Mesa setup in quality-checks' agent matrix,
quality-assurance, mutation-testing and both quality-guard jobs. The latter
jobs received that setup in earlier commits on this branch. Root prerequisites
now explicitly say to set both ICD variables for lavapipe and keep deliberately
missing-addon/adapter tests separate. Adapter-backed tests must fail if an
adapter is unavailable. CI jobs were inspected, not executed.

Agents-only `run-tsc.mjs --noEmit` passed. The requested
`npx oxlint --config .oxlintrc.anti-slop-enforced.json packages/agents` exited 1
on existing errors in untouched files, including memory-propagation,
media-tools and timeline-motion-blur-static tests. The changed fixture passes
the same lint configuration. Unrelated package-wide lint cleanup was not made.
The fixture was exercised directly on both adapters. No Vitest file changed,
and no Vitest suite ran in this checkpoint. No ffmpeg or ffprobe was spawned.

As requested, test:affected, root typecheck, root lint, harness gate, /verify,
full suites, full builds and package installation were not run. Root agent-doc
validation and diff whitespace checks passed. No branch switch, merge, rebase,
push or PR occurred. Against the local origin/feat/native-timeline ref, this
branch had 31 unique commits and was missing 38 at the start. The missing
commits contain no changes under agents/src/timeline-preview, gpu or timeline,
so they do not block this measurement. That is not a qualification of their
other integration changes. No remote fetch was performed.

Raw logs are in `/home/mg/Projects/nodetool-film/tmp/color-s5/`:
`a91-owner-final-{lvp,rtx}.json`, `a91-owner-adapter-{lvp,rtx}.json`,
`a91-owner-lint.log` and `a91-owner-typecheck.log`. Earlier
`a91-owner-gate-*` measurements included a CPU render before the child calls
and are superseded by the final measurements. Only small logs were created.

## Qualification limits

For the existing small agent preview fixtures, set these trial limits before
measurement: cold render under 10 seconds, two concurrent render passes under
10 seconds, peak RSS below 512 MiB, and growth below 64 MiB across twenty
create/render/dispose cycles. A one-shot process must exit within 10 seconds
without a forced exit. These limits do not qualify 4K server exports or hardware.
Preserve existing correctness assertions. Record any changed pixel expectations
with their semantic cause before enabling the replacement.

## Runtime and CI audit

The GPU package already declares `webgpu` as an optional peer and imports it
inside device acquisition. No dependency or document schema change is needed.
Rendering requires the Dawn addon and a hardware adapter or Mesa lavapipe.
Non-rendering tool registration must remain independent of device acquisition.
D7.1 requires missing-addon and missing-adapter errors with installation guidance.

`quality-checks.yml` supplies Mesa for the agent package matrix, core, node and
harness jobs. Its setup action installs the matrix's `extra-apt` packages.
`quality-guard.yml` runs root tests after plain `npm ci` without an explicit Mesa
install. `quality-assurance.yaml` and `mutation-testing.yaml` invoke setup-build
without `extra-apt`. These alternate test entry points now receive explicit Mesa setup
in this change. No render tests may skip for absent adapters.

The retained Dawn instance in `packages/gpu/src/node.ts` intentionally keeps its
runner alive to avoid a native use-after-free. Device disposal alone cannot
establish one-shot completion. Qualification must measure process exit separately
from obtaining pixels.

## Resumed lifetime investigation

Node 24.22.1, installed `webgpu@0.4.0`, Linux lavapipe selected by
`VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json`.

The installed `webgpu/README.md` Lifetime section says references to `create()`'s
result keep Node alive and recommends releasing them. The GPU package instead
retains instances to avoid a previously diagnosed native use-after-free.
`HeadlessFrameCompositor.dispose()` releases textures, buffers and effect state,
not the cached device or retained Dawn instance. The server's
`video-nodes/src/nodes/timeline/compositeRender.ts` uses the same cached device
and compositor disposal. CLI workflow runners explicitly exit. That does not
satisfy an agent library's completion contract.

Reproduction fixtures live in `packages/agents/tests/fixtures/`:

- `shared-preview-completion.mjs`: renders and disposes twenty successive
  compositors, then two concurrent compositors. With built workspace exports,
  cold render took 1.05 s, concurrent rendering 21 ms, peak RSS 297 MiB and
  growth 2.6 MiB. Pixels arrived, but `timeout 12s node ...` returned 124.
- `shared-preview-release.mjs`: bypasses the cache, renders, disposes the
  compositor, waits for submitted work, destroys the device, clears references
  and forces GC. Run with `node --expose-gc`. Pixels arrived, but the 10-second
  timeout returned 124. The otherwise equivalent unused-device experiment
  exited 0. This does not establish that every Dawn use fails to release.
- `shared-preview-worker-completion.mjs`: renders in a worker, then calls
  `worker.terminate()`. The native binding raised
  `FATAL ERROR: Error::ThrowAsJavaScriptException napi_throw` during
  `processImmediate`. Worker isolation is not safe on this installed binding.
  Run this diagnostic with core dumps disabled and an external timeout.
- `shared-preview-child-completion.mjs`: renders in a child, delivers results
  over IPC, then the parent sends SIGTERM and waits for child exit. Parent exits
  normally, without `process.exit`. Completion took 2.99 s, cold render 0.76 s,
  concurrent rendering 19 ms, peak child RSS 296 MiB and cycle growth 2.5 MiB.
  These numbers pass the small-fixture limits only. They exclude parent RSS,
  source rasterization, full agent imports and IPC frame-payload transfer.

Re-run probes from the repository root after sourcing
`/home/mg/Projects/nodetool-film/bin/ntenv` and exporting the ICD path above.
The completion fixtures use built dependency exports. Source-condition runs
have additional import cost and did not qualify cold process startup.
Local command logs are in `/home/mg/Projects/nodetool-film/tmp/color-s5/`.

## Correctness and installation checks

The three selected preview files passed 63 tests, including the inherited
CPU/shared variants. The new lifetime file passed three tests for child
completion/resource limits, missing-addon guidance and missing-adapter guidance.
Real rendering is mandatory in these tests. Only the Linux-specific invalid-ICD
probe is platform conditional.

`shared-preview-minimal.mjs` passed under `node --import tsx`: ordinary tool
registration performed zero native loads. Rendering attempted one load and
reported `nodetool packs add webgpu --yes`. This simulates an omitted addon with
an import hook, not a fresh package installation. The isolated invalid-ICD probe
reported `No WebGPU adapter` and `mesa-vulkan-drivers`, without fallback.
Agents-only `run-tsc.mjs --noEmit` passed. No dependency, schema or working-format
change was made. CPU code remains.

The CI audit found missing explicit Mesa setup in both quality-guard jobs,
quality-assurance and mutation-testing. This change adds that prerequisite.
The quality-checks matrix already supplies it. CI itself was not executed here.

## Exact remaining boundary

No production caller moved. `renderTimelineFrames(options, true)` is retained
only as a qualification seam. Its default stays on the original renderer.
There are no production output differences. The selected assertions passed
without changed pixel tolerances, but this is not exhaustive numerical parity.
The prototype still uses CPU unsupported-effect diagnostics and returns empty
compositor skipped/degraded lists, so diagnostics require further work.

Call sites enumerated with `rg renderTimelineFrames packages/agents/src` are
preview and comparison in `capabilities/timelines.ts`, reference and final renders
in `agentic-storyboard-finish.ts`, `storyboard-layout-check.ts`, and
`timeline-clip-frames.ts`. None supplies the qualification flag.

A91 remains incomplete. Next, implement a lazy child renderer with packaged
entry-point support, bounded concurrency, frame-payload transport, error
propagation, cancellation and awaited teardown. Re-run budgets on that complete
path, then qualify and switch one caller. A worker is excluded by the observed
native fatal error. No forced exit belongs in library code. Full numerical
coverage and output-difference accounting remain prerequisites to switching.

Per task instructions, test:affected, root typecheck, lint, harness gate,
/verify and full suites were not run.

## Changed files

- `.github/workflows/mutation-testing.yaml`
- `.github/workflows/quality-assurance.yaml`
- `.github/workflows/quality-guard.yml`
- `AGENTS.md`
- `docs/plans/color-precision/results/s5-agent-rendering.md`
- `packages/agents/src/timeline-preview/frames.ts`
- `packages/agents/src/timeline-preview/shared-compositor.ts`
- `packages/agents/tests/capabilities-timeline-preview.test.ts`
- `packages/agents/tests/timeline-preview-parity-regressions.test.ts`
- `packages/agents/tests/timeline-shared-preview.test.ts`
- `packages/agents/tests/timeline-preview-lifetime.test.ts`
- `packages/agents/tests/fixtures/shared-preview-completion.mjs`
- `packages/agents/tests/fixtures/shared-preview-child-completion.mjs`
- `packages/agents/tests/fixtures/shared-preview-worker-completion.mjs`
- `packages/agents/tests/fixtures/shared-preview-release.mjs`
- `packages/agents/tests/fixtures/shared-preview-runtime.mjs`
- `packages/agents/tests/fixtures/shared-preview-minimal.mjs`

## Child renderer implementation checkpoint

A91 remains incomplete. Production callers still use Canvas2D. The
`renderTimelineFrames(options, true)` qualification route now runs composition
in a child process. CPU code, working format and document schemas are unchanged.
This section supersedes the earlier next-step description.

### Process and transport

One child serves one render pass, including its frames and shutter samples.
It is terminated and awaited at pass completion. Reuse across calls would save
startup but retain a native process between calls and delay one-shot completion.
This implementation chooses predictable release and reports the latency cost.

Each parent permits two children and rejects further passes with a retryable
busy message. There is no retained request queue. Each child accepts one frame
at a time. V8 binary serialization and advanced IPC carry typed pixel buffers,
without base64. Source rasterization stays in the parent. Source and mask byte
budgets are checked before pixel extraction. Serialized requests and output
frames are limited to 64 MiB. This bounds transfer, not total renderer memory.

A frame has a 30-second deadline. Cancellation and timeout send SIGTERM, then
SIGKILL after 250 ms if necessary. Promise rejection waits for child close.
Errors include child exit status or the renderer's original error. An idle
child has a 60-second watchdog. Disconnect terminates the child, including a
startup connection check for a parent that disappeared before imports finished.
No worker termination or process.exit is used. AbortSignal reaches the
qualification renderer, with checks between frames and shutter samples.
Asset loaders and font/rasterization work do not yet receive that signal.

### Measurement

Budgets were stated before the run: cold and two concurrent passes below
10 seconds, peak RSS below 512 MiB, and twenty-cycle growth below 64 MiB.
`preview-child-full-path.mjs` renders two 160×90 shape frames per pass through
source rasterization, composition, IPC, PNG encoding and awaited child teardown.
It samples parent plus direct-child RSS every 25 ms on Linux. The measurement
includes the loaded agent modules but excludes initial module-import time from
call timings. It does not measure capability persistence or the complete tool
invocation. Other work was active on the host.

| Measurement | Result | Gate |
|---|---|---|
| CPU render call | 0.147 s | Baseline |
| First child render call | 4.534 s | Pass, but 4.387 s slower |
| Subsequent serial calls | 2.949–6.258 s | Small-fixture timing only |
| Two concurrent calls | 4.191 s | Pass |
| Combined sampled peak RSS | 968.8 MiB | Fail |
| Parent RSS growth over twenty cycles | 23.1 MiB | Pass for parent growth |
| Probe process completion | Exit 0 after all calls | Pass, no forced parent exit |

The twenty children are replaced, so parent growth is not a measurement of
one retained GPU process. The memory gate fails even for this small fixture.
Full tool startup, representative media, comparison workload and hardware
qualification remain unmeasured. No caller may switch on these results.

### Correctness and diagnostics

The selected preview suites passed without changing pixel tolerances. The
opaque-shape fixture still compares exact decoded pixels, geometry, timecodes
and reports. No production output differences were introduced because no
production caller moved.

Diagnostic parity is unfinished. The qualification route still uses the CPU
unsupported-effect classifier and returns empty compositor skipped/degraded
lists. The headless compositor does not expose those reports. Source-resolution
and dropped-layer reporting remain in the parent. Completing diagnostics needs
coverage for unknown effects and compositor omissions before caller migration.
The child transport does not establish exhaustive numerical parity.

### Packaging and verification

Source execution passed on Node 24 with lavapipe. Agents compilation passed,
and a real render through the compiled child entry passed. Entry lookup tests
cover the source file and a flattened `server.mjs` layout. The bundler now emits
`preview-render-child.mjs` beside `server.mjs`, using the existing external
package policy. The complete Electron artifact was not built or run. Addon
staging and packaged execution are therefore unqualified. No Electron source
files changed.

The missing-addon fixture now injects its import failure in the child. Ordinary
tool registration performs zero parent native loads, and rendering reports
`nodetool packs add webgpu --yes`. The invalid-ICD child test preserves Mesa
installation guidance without fallback. This simulates a missing addon and is
not a fresh-install test.

Selected preview tests passed 73 assertions. A later focused run passed 12
assertions, including source/compiled execution, entry lookup, timeout, crash,
cancellation, concurrency and transfer limits. Agents-only typecheck passed.
The final lifecycle run passed 11 tests, including a parent disconnecting
before child imports finish. Logs and measurements are under
`/home/mg/Projects/nodetool-film/tmp/color-s5/`.

Per the requested test scope, test:affected, root typecheck, lint, harness gate,
/verify and full suites were not run. The full backend packaging smoke was not
run. The bundler passed a syntax check only.

### Files changed in this checkpoint

- `packages/agents/src/timeline-preview/frames.ts`
- `packages/agents/src/timeline-preview/shared-compositor.ts`
- `packages/agents/src/timeline-preview/render-child-client.ts`
- `packages/agents/src/timeline-preview/render-child.ts`
- `packages/agents/tests/timeline-render-child.test.ts`
- `packages/agents/tests/fixtures/preview-child-failure.mjs`
- `packages/agents/tests/fixtures/preview-child-full-path.mjs`
- `packages/agents/tests/fixtures/preview-child-missing-addon.mjs`
- `packages/agents/tests/fixtures/preview-child-parent-exit.mjs`
- `packages/agents/tests/fixtures/shared-preview-minimal.mjs`
- `scripts/bundle-backend.mjs`
- `docs/plans/color-precision/results/s5-agent-rendering.md`

Implementation commit: `4048c0f3e1`. No changes were pushed.

## A91 memory and diagnostic follow-up

A91 remains blocked. The 512 MiB combined RSS budget is unchanged. Neither
adapter meets it, even with one child. Preview and comparison callers remain
on Canvas2D. No CPU code, working format or document schema changed.
This section supersedes the diagnostic and transport status above.

### Memory evidence

The retained `preview-child-full-path.mjs` fixture now records the parent and
each direct child separately, serial and concurrent peaks, and every child's
peak by PID. It accepts `S5_CYCLES` and `S5_COMPILED`. Final runs used twenty
serial passes and two concurrent passes, with the same two-frame 160×90 input.
RSS is sampled every 25 ms. Concurrent totals are simultaneous samples, not
sums of independently observed maxima. Shorter spikes can be missed.

All commands ran from this worktree after sourcing
`/home/mg/Projects/nodetool-film/bin/ntenv`. Lavapipe runs set both
`VK_ICD_FILENAMES` and `VK_DRIVER_FILES` to
`/usr/share/vulkan/icd.d/lvp_icd.json`. Hardware runs used the environment from
`ntenv`. The staged fixture verified `mesa / software / llvmpipe`, Mesa
26.2.5, and `nvidia / ampere / nvidia-geforce-rtx-3060`, driver 610.57.04.

| Execution | Adapter | Serial peak MiB | Parent + child at serial peak MiB | Concurrent peak MiB | Parent + each child at concurrent peak MiB |
|---|---|---:|---|---:|---|
| Source, before | lavapipe | Not separated | Not separated | 1013.5 | 494.3 + 283.9 + 235.4 |
| Source, before | RTX 3060 | Not separated | Not separated | 1030.6 | 452.4 + 304.3 + 273.7 |
| Source, after | lavapipe | 745.3 | 466.0 + 279.3 | 929.6 | 470.0 + 275.6 + 184.0 |
| Source, after | RTX 3060 | 743.0 | 445.5 + 297.6 | 979.2 | 393.6 + 294.9 + 290.7 |
| Compiled, after | lavapipe | 701.0 | 437.7 + 263.3 | 853.5 | 439.6 + 262.6 + 151.3 |
| Compiled, after | RTX 3060 | 747.8 | 464.7 + 283.1 | 1002.2 | 465.4 + 284.2 + 252.6 |

Each compiled lavapipe child's individual peak was 262.1–266.9 MiB. Each
compiled RTX child's peak was 279.9–285.7 MiB. The raw logs preserve each PID
and its peak, including children no longer alive at the combined peak.
The source baseline used two serial passes rather than twenty. The previously
reported 968.8 MiB was another run, not the baseline measured here. Other host
work and the selected checks were active, so timing and RSS differences are
observations, not isolated causal estimates.

The separate `preview-child-memory.mjs` fixture isolates compiled-child stages:

| Stage, RSS MiB | lavapipe | RTX 3060 |
|---|---:|---:|
| Node before renderer imports | 49.9 | 50.0 |
| Renderer modules loaded | 174.4 | 175.0 |
| Dawn device acquired | 224.5 | 256.5 |
| Compositor targets allocated | 234.8 | 277.3 |
| First frame rendered | 264.8 | 284.8 |
| Twenty more frames rendered | 267.8 | 286.3 |
| One second idle | 317.8 | 376.9 |

Device acquisition adds about 50.1 MiB on lavapipe and 81.5 MiB on RTX.
Targets and first rendering add another 40.3 and 28.3 MiB respectively.
These RSS deltas include Dawn, driver, shader compilation and allocator work.
They do not separately attribute each native library, and GPU VRAM is not RSS.
The software adapter stores GPU allocations in host memory, but these results
do not establish software rendering as the cause of the budget failure.
The hardware route fails too. Renderer imports alone add about 125 MiB per
compiled child. The compiled parent already holds 350.9–355.2 MiB after imports,
before rendering. Further reduction needs module/heap work, not a raised budget.

Changes remove one Skia copy when the source is already a canvas and one RGBA
array copy. IPC now sends the typed object through advanced serialization once,
instead of serializing a buffer inside another serialized message. The parent
still serializes once for the exact 64 MiB preflight limit. IPC is not zero-copy.
A 160×90 RGBA buffer is only 0.055 MiB, so these copies cannot explain hundreds
of MiB in this fixture. Larger media still need separate qualification.

The child now imports the dedicated `timeline/frame-compositor` export rather
than the broad render export. Its executable imports GPU and timeline code,
not the agents entry point. The client request import is type-only. There is
no whole-agents import to remove from that child. The parent still loads broad
runtime and capability dependencies. Pools retain resources within a pass and
release with the awaited process exit. There is no pool retained across calls.
Two children remain allowed. The measured one-child result already exceeds
512 MiB, so reducing the limit alone cannot clear the gate.

Compiled parent growth across twenty cycles was 14.1 MiB on lavapipe and
29.9 MiB on RTX. Source growth was 13.0 MiB and -48.9 MiB respectively.
These pass the 64 MiB parent-growth gate. A negative delta reflects collection,
not negative allocations. This does not qualify a long-lived GPU process.

### Latency and keeping a child warm

Compiled CPU/cold-child calls were 0.193/1.596 seconds on lavapipe and
0.171/2.359 seconds on RTX. Compiled serial calls ranged 1.327–2.500 and
1.736–3.336 seconds. Concurrent pairs took 1.956 and 2.674 seconds.
Final source CPU/cold-child calls were 0.437/1.946 and 1.489/4.344 seconds.
Both cold and concurrent gates remain below ten seconds on this fixture.

The earlier 4.387-second first-call penalty is a behavior change an agent
would encounter if callers moved. Startup remains slower than Canvas2D, though
its measured penalty varies with execution mode and host load. No measured
call timed out. The child deadline remains thirty seconds per frame. Complete
tool invocations, larger media and external tool deadlines are not qualified.
No production latency changed because callers did not move.

A child can serve repeated frames with the current client. Warm composition
averaged 16.10 ms per frame on lavapipe and 0.68 ms on RTX in the staged probe,
excluding parent rasterization, IPC and PNG encoding. Keeping it between agent
calls would retain at least the observed 317.8/376.9 MiB idle process, plus any
parent state. A shared pool needs ownership, cancellation, dimension changes
and eviction rules. It was not implemented. The current sixty-second orphan
watchdog does not constitute a cross-call pool. One-second idle measurements
are not a bound on longer retention.

### Diagnostic parity and output differences

Unknown enabled effects now come from the GPU chain's own supported-type
classifier, rather than the CPU classifier. Layer, matte, group, adjustment
and transition-effect scopes are included. Disabled effects are not reported.
The compositor exposes missing-source and missing-matte layer IDs. IPC carries
those IDs and unsupported types, and the parent maps IDs back to the original
layer objects so existing skipped-layer reports, completion flags and sample
failure aggregation work. Reports reset for each frame.

A mask that fails upload now raises an error naming the layer or adjustment.
A missing precompose-group reference raises an error naming the group. These
conditions can no longer return an apparently complete unmasked or omitted
picture. Normal empty placements still count as drawn. Source-resolution,
dropped-layer and 3D-unavailable reports remain in the parent.

Agent-visible differences in the qualification route are:

- Unknown effects retain the existing `effects_not_applied` form. Matte and
  transition effects can now be reported as well.
- A source or matte omitted by composition now produces the existing
  `source could not be drawn` skipped-layer report and incomplete frame.
- Invalid mask uploads and missing group references fail explicitly instead
  of silently changing the picture.
- CPU-only approximation warnings do not apply when the GPU performs the
  requested treatment. The GPU supports masks, wipes, mattes, crops, groups,
  adjustments, projective placement and effect passes directly. The selected
  GPU tests cover these paths. This is not an exhaustive visual-difference
  catalog for arbitrary media or future effect types.

Opaque-fixture pixels, geometry and timecodes still match exactly. The new
unknown-effect test compares the agent-facing frame report with Canvas2D.
The child tests cover unknown effects in four scopes, disabled effects,
missing source/matte pixels, report reset, bad mask upload and missing groups.
There are no production output differences because no callers moved.

### Gates and verification

Diagnostic cases above pass. Selected correctness, completion, timeout,
cancellation, concurrency, transfer-limit and compiled-entry tests pass.
Memory fails on both adapters. Complete packaged execution and addon staging
remain unqualified. A91 and production migration remain blocked.

Only the requested checks ran, with `NODETOOL_TEST_WORKERS=1`:

- Seven agent Vitest files passed, 87 tests: `timeline-render-child`,
  `timeline-shared-preview`, `capabilities-timeline-preview`,
  `timeline-preview-lifetime`, `timeline-denoise-preview`,
  `timeline-preview-parity-regressions`, `timeline-preview-asset-reads`.
- Twenty existing timeline Vitest files importing the changed compositor or
  effects source passed, 359 tests and 6 expected failures. The exact file list
  is in `timeline-test-files.txt` with the logs below. No full suite ran.
- Agents and timeline builds passed. Explicit `run-tsc.mjs --noEmit` checks
  passed for only `packages/agents` and `packages/timeline`.
- `git diff --check` and a control-byte scan passed.

`test:affected`, root typecheck, lint, harness gate, `/verify`, full suites,
and full backend/Electron packaging checks were not run, as requested.
The initial Vitest command rejected a duplicate worker flag before running
any tests. The first agents build found a report-union narrowing error. Both
were corrected and the successful commands above were rerun.

Logs and JSON are under `/home/mg/Projects/nodetool-film/tmp/color-s5/`:
`memory-before-{lvp,rtx}.json`, `final-{source,compiled}-{lvp,rtx}.json`,
`final-stages-{lvp,rtx}.json`, `agents-final.log`, `timeline-final.log`,
`typecheck-{agents,timeline}.log`, and `build-{agents,timeline}.log`.
Intermediate `memory-after-*` files are exploratory, not final measurements.
Run the full-path fixture with `node --import tsx` for source or
`S5_COMPILED=1 node` for compiled execution. Run the staged fixture with
`S5_COMPILED=1 node`. Neither fixture forces the parent to exit.

Changed files in this follow-up:

- `packages/agents/src/timeline-preview/frames.ts`
- `packages/agents/src/timeline-preview/render-child-client.ts`
- `packages/agents/src/timeline-preview/render-child.ts`
- `packages/agents/src/timeline-preview/shared-compositor.ts`
- `packages/agents/tests/timeline-render-child.test.ts`
- `packages/agents/tests/timeline-shared-preview.test.ts`
- `packages/agents/tests/fixtures/preview-child-full-path.mjs`
- `packages/agents/tests/fixtures/preview-child-memory.mjs`
- `packages/timeline/package.json`
- `packages/timeline/src/render/effects.ts`
- `packages/timeline/src/render/frameCompositor.ts`
- `docs/plans/color-precision/results/s5-agent-rendering.md`

Implementation commit: `a2be0379e4`. No push was made. The owner must decide
whether to authorize further parent/renderer module-memory reduction and
representative-media/package qualification. The evidence does not support a
lavapipe-only exception to the existing memory gate.
