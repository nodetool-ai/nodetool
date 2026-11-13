# Provisional M1: headless core

M1 proceeds provisionally with explicit authorization to work before M0's
hardware gate is satisfied. This is an implementation-order exception, not
an acceptance of unmeasured behavior. The
[implementation plan](../../docs/plans/graph-runner-realtime-issues.md)
still defines the work packages and their exit evidence.

The user authorizes independent work to proceed with explicit deferrals.
Use the [scoped M1 progress gate](../../docs/plans/graph-runner-realtime.md#152-provisional-m1-progress-gate)
and keep every missing requirement in the [acceptance ledger](#deferred-acceptance-work).
No unfinished issue or milestone is closed by a deferral.

This branch is based on [M0 PR #7445](https://github.com/nodetool-ai/nodetool/pull/7445).
Its PR targets the M0 branch to keep the milestone diff separate. Review and
merge ordering must preserve the M0 changes before retargeting M1 to main.

## Unverified M0 dependencies

| Dependency | Evidence still needed |
|---|---|
| [WP01 #7392](https://github.com/nodetool-ai/nodetool/issues/7392) | Qt/wgpu Metal surface, catalog chains, measured refresh and presentation timing, same-device submit gate versus no gate and second device, pipeline creation cost |
| [WP02 #7393](https://github.com/nodetool-ai/nodetool/issues/7393) | macOS realtime policy and device workgroup, ten-minute hardware/load profiles, hardware rate conversion, complete allocation audit and audible swap assessment |
| [WP03 #7394](https://github.com/nodetool-ai/nodetool/issues/7394) | Required aggregate verification remains incomplete. Offline byte parity does not establish live-device deadlines |
| [WP04 #7395](https://github.com/nodetool-ai/nodetool/issues/7395) | Combined sound/picture producer, calibrated physical recording, measured budgets and R1/R2 decisions |

R1, R2 and Q3 remain open. The shared-device strategy, buffering and rate
choices remain provisional. No hardware-dependent issue receives a closing
reference from this branch. Timing thresholds in the design remain targets,
not measurements. Q8 selects C++/Wasm from the WP10 native/browser comparison.

## M1 work packages

| Work package | State |
|---|---|
| [WP05 #7396](https://github.com/nodetool-ai/nodetool/issues/7396): schema and loader | Schema, loader and fixtures implemented. Linux Release, ASan/UBSan and TSan CI pass. Local instruction-alias verification remains blocked as described below |
| [WP06 #7397](https://github.com/nodetool-ai/nodetool/issues/7397): control executor | Register machine, project math and fixed-quantum state implemented. Windows Release/ASan and Linux Release/ASan+UBSan/TSan pass. Aggregate verification remains incomplete as described below. See [operation contracts](control.md) |
| [WP07 #7398](https://github.com/nodetool-ai/nodetool/issues/7398): audio executor | C ABI, planar execution, linear/one-pole smoothing, events, built-in kernels and sink sanitation implemented. Windows Release/ASan and audio-scoped affected tests pass. See [audio contracts](audio.md) and verification below |
| [WP08 #7399](https://github.com/nodetool-ai/nodetool/issues/7399): render executor | Scheduling and provisional private-device offline GPU backend implemented. Windows Release/ASan and Linux software-adapter references pass. Full-host Linux Release, ASan/UBSan and TSan pass with lavapipe. Driver allocation audit and live-device exit evidence remain pending. See [render contracts](render.md) |
| [WP09 #7400](https://github.com/nodetool-ai/nodetool/issues/7400): offline driver and CLI | PNG/WAV export, local PCM/texture slots, shared CLI parsing and registered offline harness implemented. Windows Release/ASan and Linux offline checks pass. Full graph-runner Release dispatch passes in CI. Remaining qualification is listed below |
| [WP10 #7401](https://github.com/nodetool-ai/nodetool/issues/7401): browser comparison and Q8 | Header inventory, C++/TypeScript Chrome frame comparisons, 64-pass timings and render-only candidate download sizes are recorded. A mid-range color regression verifies presentation conversion. Q8 selects C++/Wasm. Pinned toolchain CI passes at `d1656fead3`, including both Wasm builds, fixture comparisons and benchmark guards. See [comparison results](spike/browser/README.md) |

M0's local build, typecheck, lint, native tests and harness checks pass. The
latest aggregate affected test run stops at Windows browser-isolation tests.
Browser isolation and credential ACL work are deferred. Real file-symlink
tests await CI with symlink privileges. These are not passing results.

M1's package build, typecheck, lint, Windows Release and ASan native tests and
affected native tests pass. The core-only affected selection against
`codex/realtime-m0-spikes` passed before the Windows fixture changes expanded
that selection. The Linux loader CI results are recorded in
[the initial core run](https://github.com/nodetool-ai/nodetool/actions/runs/43292903682).
The core-only result does not replace aggregate verification.

The first two full M1 harness runs pass 20 of 21 selfchecks. One fails on a
five-second preset-preview timeout. The other fails on a five-second resource
copy timeout followed by cleanup racing the copy. Both integration suites now
have a 30-second Windows budget, and resource cleanup stays with its asynchronous
operation. Their assertions are unchanged. All eight focused tests pass. The
latest full harness rerun passes those fixtures but fails the separate
`preset-previews` CLI dry-run test's five-second budget. All ten tests in that
suite pass in isolation. The full harness result remains failed.

The expanded affected run after those fixes passes both repaired fixtures but
fails the real-Turbo planning test's two-minute budget. Its isolated rerun passes
all seven tests. The affected run still exits with failure. The inherited
Windows security and symlink limitations remain unresolved.

The [control CI run](https://github.com/nodetool-ai/nodetool/actions/runs/43299450162)
passes Release, ASan/UBSan and TSan. Ordinary Windows control tests count zero
C++ allocations during ticks, with a positive control. A deliberately changed
one-step-per-frame implementation fails the cadence regression. Native/Wasm
byte parity has not been measured. Review also found unnecessary intermediate
evaluation of independent analytic operations. A regression fails before the
fix and verifies execution counts for pure-analytic and mixed programs afterward.

This Windows checkout materializes the tracked `.claude` symlink as a text
placeholder. Local `check:agents-docs` consequently fails that existing alias
check. The new instruction files have matching companions and are linked from
`native/AGENTS.md`; CI must verify the complete instruction graph.

## Audio verification

The WP07 implementation passes Windows Release and ASan CTest, including the C
ABI consumer. [Linux audio CI](https://github.com/nodetool-ai/nodetool/actions/runs/43309938791)
passes Release, ASan/UBSan and TSan. Reference tests cover every built-in kernel, including a fixed
noise sequence and node-identity seeding. Tests also cover planar routing,
buffer reuse, snapshots, linear and one-pole smoothing, event ordering, late
events, sink sanitation and byte-identical repeated runs. The ordinary build
counts zero C++ allocations over 4,096 quanta, with a positive control. This
does not audit C allocation functions or device callbacks.

Review found that biquads ignored sampled parameter curves with equal
endpoints. The direct ABI regression fails before the fix and passes afterward.
Silence-after-signal tests verify cleared filter/delay tails and report timings.
Their broad regression guard does not establish hardware deadlines.

Package build, typecheck, lint, `test:affected:native` and the audio-only
`test:affected -- --base f20f3f6376` selection pass. This scoped result does not
clear the broader Windows aggregate failures above. No hardware-dependent issue
is closed. WP12 device integration, WP13 synchronized parameter handoffs and
WP24 Wasm qualification remain separate work.

The audio-turn full harness run fails `repo-scripts`: its invocation omitted the
local `jq` directory from `PATH`, breaking CI-planning and deploy fixtures, and
the pack-contamination test exceeded its five-second budget. All five failed
cases pass in a focused rerun with local `jq` and Git's Unix tools on `PATH`.
That rerun does not turn the aggregate result into a pass.

## Render and offline integration

WP08 prepares graph scheduling, version/uniform invalidation, volatile texture
liveness, retained-cache storage and LRU eviction with live-input pinning.
The private-device backend prepares fragment/compute pipelines, binding variants,
textures and one aligned uniform buffer. Presentation performs explicit transfer
and alpha conversion. Three staging buffers provide ordered readback and
backpressure. Callback records outlive device teardown, which may wait and is
not a realtime operation.

The approved [offline M1 exception](../../docs/plans/graph-runner-realtime.md#provisional-offline-m1-exception-rt-f44)
allows synchronous pipeline preparation before activation on a private device.
Live/shared-device support remains blocked because the pinned wgpu-native release
lacks the compilation-info and asynchronous pipeline APIs required by design
section 9.2, rule 4. See the [source evidence](render.md#native-pipeline-api-limitation).
No external device or live-session attachment is accepted.

WP09 coordinates rational video timestamps, control ticks and 128-sample audio
quanta. It trims the final quantum, exports float WAV tracks and straight-alpha
PNGs, and publishes the completion manifest only after output streams close.
Scalar `audioControl` bindings provide synchronous endpoint snapshots and existing
smoothing. Audio `time.frame` counts quanta. Render `time.dt` uses video intervals.
This does not implement WP13 live handoffs.

Local `--slot ID=FILE` inputs supply immutable planar float32 PCM or raw textures.
Consumed inputs are required and bounded. Unknown, duplicate, malformed and
unused bindings are rejected. There is no media decoding, network resolution or
resampling. Control/event/latched slot inputs remain unsupported. See the
[offline contract](offline.md).

The standalone CLI and optional `NODETOOL_GRAPH_RUNNER_REALTIME=ON` host command
share their parser. Windows standalone arguments preserve Unicode paths.
The full graph-runner Release build and dispatch checks pass in Linux CI.
They have not been built or executed locally. The `realtime-offline` registry entry invokes the native build,
checks required CTest inventory, runs adapter-backed tests and exercises the CLI.
Its expensive classification keeps it outside the default cheap gate, so it was
run explicitly. A dedicated Linux lavapipe job runs the same script without skips.

## Verification of the offline integration

`node native/realtime/scripts/check.mjs` passes on Windows with MSVC Release and
the requested D3D12 software adapter. All nine required CTest entries pass,
including shader-chain pixels, compute upload/readback, ring backpressure,
PNG/WAV/manifest repeatability, audio-control cadence, slot ingestion and error
paths. The CLI checks pass for Unicode paths, PCM samples and EOF silence,
final trimming, existing-output preservation and invalid arguments/bindings.
The inventory audit is tested against empty and missing-test inputs.

The shader-chain regression initially produced incorrect per-pass uniform values
with static buffer ranges. Declaring block sizes fixed different-sized layouts
but failed a new same-sized, different-value case. Explicit dynamic offsets pass
both cases with the shared buffer and queued readbacks. The underlying backend
cause is not established. The regressions retain the original pixel references.

Package build, typecheck and lint pass. All 228 harness-registry tests pass.
The full default harness gate passes all 21 selected selfchecks. The earlier
`test:affected` invocation failed in repository-script integration tests:
mutation planning, packed CLI workflow checks/installation and local MCP startup
exceeded their process or test budgets. The later gate passes its script suite,
but does not change the earlier affected command's failed exit status.
The affected-native command against the M0 base passes all nine realtime tests
but exits with failure because the full graph-runner build is not configured on
this host. The corresponding Release integration subsequently passed in CI.

The same offline harness passes with Windows MSVC AddressSanitizer, including
all nine CTest entries and CLI checks. This instruments the C++ host code, not
the prebuilt wgpu-native library or graphics driver. The [Linux realtime run for `b911a367dc`](https://github.com/nodetool-ai/nodetool/actions/runs/43344491452)
passes core Release, ASan/UBSan and TSan, plus the separate lavapipe offline
export job. The core sanitizer jobs exclude the optional GPU backend.
The [full graph-runner Release job](https://github.com/nodetool-ai/nodetool/actions/runs/43344491439/job/131620414613)
passes build, CTest and realtime command-dispatch checks. Its ASan/UBSan job
fails LeakSanitizer in the two offline GPU tests, reporting 1,200 and 1,568 leaked
bytes. Stacks reach Vulkan adapter enumeration with unidentified library frames.
The cause is not established. With lavapipe explicitly selected, the
[standalone offline sanitizer job at `ff8dffdd6d`](https://github.com/nodetool-ai/nodetool/actions/runs/43352730471/job/131647522012)
passes ASan/UBSan with leak detection enabled. The same run passes offline
Release and all three core configurations. No leak suppression was added.
This qualifies that configuration, not the cause of the earlier leak. The
[full-host ASan/UBSan rerun at `d1656fead3`](https://github.com/nodetool-ai/nodetool/actions/runs/43357864437/job/131664189109)
also passes all 65 CTest entries and realtime CLI checks with lavapipe and
leak detection enabled. The same run's
[Release](https://github.com/nodetool-ai/nodetool/actions/runs/43357864437/job/131664188926)
and [TSan](https://github.com/nodetool-ai/nodetool/actions/runs/43357864437/job/131664188698)
jobs each pass all 65 tests and CLI checks. No new suppression was added.
Driver-internal allocation audits remain incomplete.
Earlier audio/control sanitizer evidence applies only to its recorded revision.
WP08 and WP09 remain open. Broader native/Wasm parity and
all M0 hardware measurements remain unfinished. No hardware-dependent issue
receives a closing reference.

## Q8 comparison verification

The C++ and TypeScript browser hosts pass both WP09 fixture comparisons and a
mid-range color regression. The prior TypeScript adapter fails that regression
without the presentation conversion. Three benchmark trials per candidate pass
pixel and catalog-inventory checks. The header and host-adaptation guards pass,
as do the workflow contract tests. Typecheck and lint pass for this batch.
The aggregate affected-test run fails a five-second pack-import ratchet test
timeout. Its isolated rerun passes all 12 tests, without changing the failed
aggregate result. The affected-native check against the pre-batch HEAD passes all seven selected
core tests. It does not exercise the optional GPU backend. The full harness run
passes all 21 selfchecks but exits nonzero because the browser scripts lack a
surface mapping. A regression reproduces that gap. The new manual browser
harness fixes the mapping, all 230 registry tests pass, and the gate dry run
reports no unmapped code or mapping violations. The affected package builds and
typechecks. The full gate is not rerun for this registry-only correction.

The [Linux realtime run at `d1656fead3`](https://github.com/nodetool-ai/nodetool/actions/runs/43357864455)
passes core Release, ASan/UBSan and TSan, and standalone offline Release and
ASan/UBSan with lavapipe and leak detection enabled. Its
[browser comparison step](https://github.com/nodetool-ai/nodetool/actions/runs/43357864455/job/131664095588)
verifies the pinned Emscripten SDK revision and Emdawn checksum, builds both
wasm32 hosts and passes all three fixture comparisons in Chromium
148.0.7778.96. The benchmark completes three trials per candidate with pixel
and catalog guards. These CI timings are diagnostic. They do not replace the
recorded Windows comparison or qualify hardware deadlines, callback lifecycle,
production asynchronous preparation or live/shared-device use.

The [packed verification run at `d1656fead3`](https://github.com/nodetool-ai/nodetool/actions/runs/43357864518)
passes fixed checks, packed installation, release pins and every verification
bucket except the game bucket. The game tests pass, but their post-test
diagnostic step exits 127:
the container's default `sh` cannot execute Bash's `shopt`. The dependent
`core-smoke` status also fails. Both Chromium diagnostic steps now explicitly
select Bash. A regression fails before that correction and passes afterward,
including execution of the diagnostic success path. All three focused
Chromium workflow tests pass. The
[game verification bucket at `a75ccb5de9`](https://github.com/nodetool-ai/nodetool/actions/runs/43365856600/job/131690884743)
also passes, including the corrected diagnostic step. The same revision's
[realtime CI](https://github.com/nodetool-ai/nodetool/actions/runs/43365856623)
passes core Release, ASan/UBSan and TSan, standalone offline Release/ASan+UBSan
and the wasm32 fixture/benchmark checks.

## GPU retention and replacement resize

The software-adapter fixture now reads back a retained red source combined with
alternating volatile output for 101 frames. A separate schedule instance verifies
one retained execution and four volatile executions per frame, with two reused
volatile textures. The GPU pixels preserve the retained channel while the
volatile channel changes. Corrupting a retained pixel fails the comparator.
Preparing the unchanged pass graph with an 8×8 session produces the resized
golden instead of reusing the old 4×4 resources. This is offline replacement
preparation, not live resizing or cross-plan cache migration.

Windows MSVC Release passes `realtime-render-schedule` and
`realtime-offline-gpu`. The affected-native command against `a75ccb5de9`, using
the GPU build and restricting CTest to those two tests, also passes. Windows
MSVC ASan passes `realtime-offline-gpu`. The GPU fixture requests a software
adapter. Sanitizers cover C++ host code, not the prebuilt GPU library or driver.
The [standalone Linux realtime run at `0c09a8c5dc`](https://github.com/nodetool-ai/nodetool/actions/runs/43368736566)
passes offline Release and ASan/UBSan with lavapipe, including this expanded
fixture, and core Release/ASan+UBSan/TSan and wasm32 checks. Full-host sanitizer
qualification of the expanded fixture remains pending.
Broad checks were not rerun for this fixture-only batch.

## Damper export cadence

The [damper fixture](tests/fixtures/offline-damper.json) adds actual WAV/PNG
export checks to the executor's cadence tests. Both 44.1 and 48 kHz runs cover
60, 120 and 2 video frames per second. The audio-only driver checks every PCM
sample against a closed-form quantum-endpoint reference within `2e-6`.
The GPU export checks every frame against the completed-quantum reference
within one byte per channel. Frames at common timestamps and complete WAV
tracks must be byte-identical across cadences. Repeated 60 Hz mixed exports
compare every file, including the manifest. Negative controls reject one
corrupted PCM sample and a frame reference stuck at time zero.

The fixtures and their executors, output files and private devices belong to
one offline test thread. They introduce no threads or shared-device attachment.
These checks do not implement WP13 synchronized parameter changes or establish
native/Wasm audio parity, physical timing or M0 hardware qualification.

Windows MSVC Release and ASan pass `realtime-offline-driver` and
`realtime-offline-render-export`. The affected-native command against
`0c09a8c5dc`, with CTest restricted to those two cases, passes. A separate
GPU-disabled Release build also passes the driver test. The
[standalone Linux realtime run at `a8b1958691`](https://github.com/nodetool-ai/nodetool/actions/runs/43370759316)
passes offline Release and ASan/UBSan with lavapipe, including the damper
fixture, and core Release/ASan+UBSan/TSan and wasm32 checks. Broad checks were
not rerun locally for this fixture-only batch.

## Cache pressure and readback recovery

Software-adapter GPU fixtures now check retained-cache eviction at the minimum
two-texture execution budget, with pixel references and a below-minimum rejection.
The readback fixture recycles every staging slot while older frames remain queued,
checks distinct colors and frame numbers after backpressure, and rejects a short
destination span without consuming its capture. Teardown coverage includes one
and three outstanding map requests. A separate schedule instance supplies the
eviction counts. These are not direct GPU execution or driver-allocation counts.

Windows MSVC Release passes `realtime-offline-gpu` and
`realtime-render-schedule` through the affected-native command against
`a8b1958691`, restricted to those two tests. Windows MSVC ASan passes
`realtime-offline-gpu`. The test thread owns the schedules, private devices,
staging storage and callback records until backend destruction. The
[standalone Linux realtime run at `270251bb0f`](https://github.com/nodetool-ai/nodetool/actions/runs/43371697041)
passes offline Release and ASan/UBSan with lavapipe, including these cases,
and core Release/ASan+UBSan/TSan and wasm32 checks. Broad checks were not
rerun locally for this fixture-only batch. Live/shared-device support remains blocked.

## Stateful browser comparison

The browser harness now includes the damper fixture. All three changing PNG
frames and the manifest match native bytes. Decoded browser pixels also match
the independent completed-quantum exponential reference within one byte per
channel. Corrupted decoded pixels fail that check. The TypeScript fixture
adapter rejects the unsupported control operations, while its original three
static comparisons still pass. WAV checks remain limited to header and length.

A fresh C++/Wasm candidate build with the pinned Emscripten SDK and the
four-fixture comparison pass on Windows Chrome 156.0.8078.80 with SwiftShader.
The [standalone Linux realtime run at `fa52867580`](https://github.com/nodetool-ai/nodetool/actions/runs/43373047730)
also passes the four-fixture browser comparison and benchmark guards, offline
Release/ASan+UBSan and core Release/ASan+UBSan/TSan. This does not qualify native/Wasm audio sample parity,
production asynchronous preparation, live/shared-device use or M0 hardware
measurements. Broad checks were not rerun for this browser-fixture-only batch.

## CLI fixture matrix

The CLI checker now exports control-only, audio-only, render-only, composed
mixed and damper plans twice through the executable's `live` command. It checks
exact output inventories, manifest counts, WAV format and samples, PNG pixels
and complete repeat bytes. Mixed audio must equal the audio-only track.
Negative controls reject empty artifacts, an incorrect damper frame and a
corrupted PCM sample. Unicode paths and existing argument/slot checks remain.

The expanded checker passes with Windows MSVC Release and ASan standalone
executables. Both existing CI entry points invoke it: the standalone offline
harness and the full graph-runner command-dispatch job. Linux and full-host
qualification of these new CLI cases remains pending CI. Broad checks were
not rerun for this CLI-check-only batch.

## Provisional progress gate

The user accepts [WP09's scoped M1 evidence](https://github.com/nodetool-ai/nodetool/issues/7400)
for implementation progress, plus WP10's Wasm build and Q8 decision. The
[design](../../docs/plans/graph-runner-realtime.md#152-provisional-m1-progress-gate)
and [plan](../../docs/plans/graph-runner-realtime-issues.md#provisional-progress-and-deferred-work)
now use that scope. Broader acceptance requirements remain tracked below.
Current-revision CI must supply its actual results before qualification is claimed.

## Deferred acceptance work

Every row remains open until its completion evidence passes. Independent work
can use the prepared offline contracts. These deferrals do not enable live or
shared-device operation, close issues or change PR merge ordering.

| Deferred requirement | Owning work | Evidence needed to finish |
|---|---|---|
| Graph-to-IR snapshots | [WP16 #7407](https://github.com/nodetool-ai/nodetool/issues/7407) | Fixture graphs compile to stored IR that loads through the canonical loader, with stable slots and state keys |
| Synchronized parameter changes | [WP13 #7404](https://github.com/nodetool-ai/nodetool/issues/7404) | A change reaches audio and picture at the required quantum/frame, including rapid revisions and clock-generation changes |
| Stall and live-device timing | [WP12 #7403](https://github.com/nodetool-ai/nodetool/issues/7403), [WP15 #7406](https://github.com/nodetool-ai/nodetool/issues/7406) | Stall/load fixtures and measured device budgets pass on the required hardware |
| Swap-state continuity | [WP18 #7409](https://github.com/nodetool-ai/nodetool/issues/7409) | Unchanged audio paths preserve bytes, and changed paths satisfy the sink-ramp checks |
| Browser audio sample parity | [WP24 #7415](https://github.com/nodetool-ai/nodetool/issues/7415) | Each qualified kernel meets its required native/Wasm agreement level |
| Driver allocation audit and supported live preparation | [WP08 #7399](https://github.com/nodetool-ai/nodetool/issues/7399) | Allocation evidence covers the required driver paths, and the live backend supports the compilation/error APIs required by the design |
| M0 hardware evidence and R1/R2 | [M0 dependencies](#unverified-m0-dependencies) | Mac/device measurements, calibrated physical recording and decisions specified by WP01–WP04 |
| WP09 completion/merge before compiler integration qualification | [WP09 #7400](https://github.com/nodetool-ai/nodetool/issues/7400), [PR #7471](https://github.com/nodetool-ai/nodetool/pull/7471) | Required verification and merge ordering complete, then compiler fixtures are reconciled with the merged contracts |

## WP16 initial compiler slice

The [pure compiler package](../../packages/realtime-compiler/README.md) now
lowers one render sink, host-supplied shader/control descriptors, render-domain
state and explicitly typed batch texture boundaries. It bundles the canonical
schema asset. A stored snapshot covers a damper feeding a shader chain.
Compilation preserves graph identities and produces deterministic plans across
node/edge permutations. Boundary slots preserve full graph IDs.

Targeted compiler checks cover schema validation, diagnostics, stable identities,
input ownership and a large iterative traversal. The compiled fixture loads and
renders through Windows Release and ASan executables against independent pixel values.
Invalid register IR rejects before output. Registry coverage selects these checks
for compiler and canonical-schema changes. CI runs the compiler tests and native
fixture in the offline Release and sanitizer jobs. The
[standalone Linux run at `3543ef9dd4`](https://github.com/nodetool-ai/nodetool/actions/runs/43381172495)
passes the compiler tests and both native fixtures in Release and ASan/UBSan, alongside
the existing core Release, ASan/UBSan, TSan and Wasm/browser checks.
The [full graph-runner run at that revision](https://github.com/nodetool-ai/nodetool/actions/runs/43381172430)
also passes Release, ASan/UBSan and TSan. Packed-install, release-pin and selected
aggregate CI checks pass. The Windows Node 24 package-matrix runner lost contact
with GitHub during workspace setup. The
[subsequent package matrix at `54a6b15657`](https://github.com/nodetool-ai/nodetool/actions/runs/43501833748)
passes, including Windows Node 24. That resolves this runner-loss check without
a speculative source change.

The compiler tests and selected harness-registry tests pass. Package builds,
compiler typechecking, scoped lint, packed imports, browser bundling and the gate
dry run pass. Broad local checks were deferred under the targeted-check policy.

WP16 remains open. Mixed audio/render lowering, connected audio controls, render
parameter slots, PCM/sample-player boundaries, multiple sinks, the full descriptor
expression vocabulary, reverse/floating-point alpha conversion, delayed feedback, batch graph rewriting
and cross-domain stateful handoffs remain unimplemented. Product descriptors,
runner/editor integration and live-device behavior also remain outside this slice.
The dependency-order deferral above still applies while WP09 remains open. M1
and unfinished issues remain open.

## WP16 uniform expressions

Shader descriptors now accept data-only literal/property/operation trees for
uniform fields. Connected properties read control registers. Constant arithmetic,
comparisons, remap and vector packing fold. Project transcendental math and
tick-context sources stay in runtime IR. Nonfinite arithmetic results also stay
at runtime rather than becoming invalid JSON literals. Expression traversal is
iterative, detects cycles and enforces a size limit.

A second stored snapshot combines folded constants with a changing damper input.
Its native PNG checks use an independent scaled exponential reference. The
compiler tests cover executor arithmetic semantics, live property overrides,
vector widths, invalid trees, input-order invariance and deep shared trees.
Both compiler/native fixtures pass on Windows Release and ASan. Compiler tests,
package build/typechecking and scoped lint pass. Broad local checks remain
deferred under the targeted-check policy. Linux Release and ASan/UBSan CI also
pass the expression fixture at `3543ef9dd4`, as linked above.
The full descriptor expression vocabulary and the remaining WP16 requirements
above stay open. This adds no product descriptors or live-device integration.

## WP16 straight-alpha ingress

The compiler now inserts the catalog's straight-to-premultiplied RGBA8 pass
before consumers that require it. Conversions are shared by source, preserve
color-space tags and dimensions, and retain stable identities across revisions.
The batch slot keeps its original straight-alpha contract. Reverse conversion
and floating-point conversion remain unsupported and reject explicitly. The
current IR requires premultiplied pass outputs, so reverse conversion needs
contract work before it can be lowered.

A stored snapshot and native fixture cover fractional and zero-alpha pixels.
The native checker compares decoded PNG pixels with an independent quantized
premultiply/invert reference. Removing the conversion must make the loader reject
the plan before creating output. The
[standalone Linux run at `54a6b15657`](https://github.com/nodetool-ai/nodetool/actions/runs/43501833824)
passes the alpha fixture, core sanitizers and Wasm/browser checks. The compiler
tests, native Release/ASan fixture checks, package
build/typechecking, scoped lint and browser bundling pass locally. Broad local
checks remain deferred under the targeted-check policy. WP16 and the deferred
acceptance ledger remain open.

## WP16 audio DAGs and stable identities

The compiler now lowers audio-only DAGs for supported ABI 1 built-in kernels.
It orders nodes, assigns physical buffers by last use, and never aliases a
node's input/output without an in-place kernel contract. A fan-out fixture and
a large-chain check cover retention of shared inputs and bounded buffer reuse.
Delay size is structural data. Feedback cycles still reject.

Audio property parameters get audio sync, declared smoothing and stable slots.
The caller returns the detached allocation ledger on subsequent compiles.
Removed identities remain reserved until the session ends. State keys follow
the design's audio/control identity fields. Audio sink hashes cover logical
upstream content, independent of physical buffer and slot allocation. Initial
parameter values and smoothing are included because this slice embeds those
values at compile time. These metadata do not implement WP13 parameter transport
or WP18 state transfer and sink ramps.

The native checker exports gain-chain, fan-out and delay graphs at both session
rates and layouts against an independent quadrature reference. It also checks
the supported kernel ABI shapes, deterministic noise repeats and rejection of
overlapping live buffers. Corrupted PCM fails the reference check. Remaining
compiler scope is listed above. Linux qualification of this audio batch remains
pending CI, and unfinished issues stay open.

Targeted compiler and SHA-256 tests, package build/typechecking and scoped lint
pass. The expanded native checker passes on Windows Release and ASan. A normal
packed install outside the workspace imports the compiler and portable hash
subpath and compiles an audio graph. Render/audio results also match through an
isolated browser bundle with no Node globals or external imports. Broad local
checks remain deferred under the targeted-check policy.
