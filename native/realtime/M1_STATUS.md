# Provisional M1: headless core

M1 proceeds provisionally with explicit authorization to work before M0's
hardware gate is satisfied. This is an implementation-order exception, not
an acceptance of unmeasured behavior. The
[implementation plan](../../docs/plans/graph-runner-realtime-issues.md)
still defines the work packages and their exit evidence.

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
not measurements. Q8 requires the WP10 native/browser comparison.

## M1 work packages

| Work package | State |
|---|---|
| [WP05 #7396](https://github.com/nodetool-ai/nodetool/issues/7396): schema and loader | Schema, loader and fixtures implemented. Linux Release, ASan/UBSan and TSan CI pass. Local instruction-alias verification remains blocked as described below |
| [WP06 #7397](https://github.com/nodetool-ai/nodetool/issues/7397): control executor | Register machine, project math and fixed-quantum state implemented. Windows Release/ASan and Linux Release/ASan+UBSan/TSan pass. Aggregate verification remains incomplete as described below. See [operation contracts](control.md) |
| [WP07 #7398](https://github.com/nodetool-ai/nodetool/issues/7398): audio executor | C ABI, planar execution, linear/one-pole smoothing, events, built-in kernels and sink sanitation implemented. Windows Release/ASan and audio-scoped affected tests pass. See [audio contracts](audio.md) and verification below |
| [WP08 #7399](https://github.com/nodetool-ai/nodetool/issues/7399): render executor | Scheduling and provisional private-device offline GPU backend implemented. MSVC compilation/linking pass. GPU execution and exit evidence pending, with local tests deferred by request. See [render contracts](render.md) |
| [WP09 #7400](https://github.com/nodetool-ai/nodetool/issues/7400): offline driver and CLI | Not implemented |
| [WP10 #7401](https://github.com/nodetool-ai/nodetool/issues/7401): browser comparison and Q8 | Not implemented |

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

## Render work in progress

WP08 now has prepare-time graph lowering, version/uniform invalidation,
volatile liveness allocation, bounded retained-cache storage and LRU eviction
that pins live inputs. Prepared metadata preserves color-space and alpha
contracts for the future GPU backend. Frame failure invalidates cached outputs.

The scheduling library and its fixture executable compile with MSVC Release.
The new fixtures have not been executed, and no sanitizer or aggregate pass is
claimed for these changes. Test execution is deferred at the user's request.
The earlier audio/control results apply to their recorded revisions.

The approved [offline M1 exception](../../docs/plans/graph-runner-realtime.md#provisional-offline-m1-exception-rt-f44)
uses synchronous pipeline preparation on a private device. The backend owns its
device, textures, cached bindings, uniform buffer, session target and three
readback buffers. No external device or live-session attachment is accepted.
Prepared callback records outlive device teardown. Device release can wait for
queued work and is not a realtime operation.

Fragment/compute encoding, expanded catalog uniform packing, optional-input
defaults, explicit alpha checks, texture presentation and nonblocking readback
are implemented. The library and GPU fixture executable compile and link with
MSVC Release against the pinned wgpu-native static library. Source review found
and corrected unused-slot readiness, compute metadata overflow and graph-node
diagnostic handling. No runtime reproduction or test pass is claimed for those
cases because local test execution remains deferred.

The prepared GPU fixtures cover three catalog shader-chain pixel references,
compute upload, ring backpressure, invalid preparation and pending-map teardown.
They still need a real software-adapter run, allocation verification, sanitizer
runs and aggregate checks. The default core CI configuration does not build or
run the optional GPU backend. Earlier core passes cannot qualify it.

Live/shared-device support remains blocked: the pinned wgpu-native release and
inspected upstream revision leave the compilation-info and async pipeline APIs
required by design section 9.2, rule 4 unimplemented. [Source evidence](render.md#native-pipeline-api-limitation)
remains documented. WP08 stays open, and the offline exception neither qualifies
M1 nor resolves any M0 hardware gate.

## Offline driver preparation

WP09 now has an [exact offline clock](offline.md) with rational frame scheduling,
integer quantum boundaries and final audio-quantum trimming. Its library and
fixture executable compile and link with MSVC Release. The fixtures cover
fractional frame rates, long schedules, rejected inputs and partial exports,
but have not been run. Sanitizers and aggregate checks remain deferred.

The control/audio driver now coordinates both control domains with audio
quanta, trims final samples and writes float WAV files plus a completion
manifest. The standalone `nodetool-realtime live` command accepts control/audio
plans without external slots. It opens no audio device and rejects existing
output directories. Windows wide arguments preserve non-ASCII paths.

The driver, CLI and fixture executable compile and link with MSVC Release.
Prepared cases cover output chunks and samples, silence, multiple sinks,
repeatability, low-frame-rate control progression and rejection paths. They
remain unrun. Source review corrected partial-manifest publication and narrow
Windows argument decoding. No runtime reproduction or pass is claimed.

Optional `audioControl` parameter bindings now connect scalar audio-domain
registers to prepared dense snapshots at quantum endpoints. Sparse slot IDs
are resolved before execution, and existing smoothing applies. Source fixtures
cover stateful binding, cadence independence and invalid bindings. The earlier
unrun constant-signal fixture referenced a nonexistent audio kernel. Source
inspection corrected it to an oscillator with a sine reference. These cases
still require runtime and sanitizer verification. WP13 live handoffs are not
implemented by this synchronous offline path.
Source review also corrected audio-domain `time.frame` to count quantum
endpoints instead of video frames, with an unrun regression for frame-rate
independence and the final drain. Bound ramp fixtures preserve the initial
parameter value and interpolate to each quantum's target.

GPU-enabled driver builds now derive module contracts from the shader catalog,
prepare the private software-adapter device, read back frames and write
straight-alpha PNGs. Optional catalog inputs retain their default behavior.
The host waits outside executor calls and requires an sRGB present target.
Render-only and mixed export fixtures prepare pixel references and repeated
PNG/WAV/manifest comparisons. Source review corrected render `time.dt` to use
video-frame intervals instead of the last intermediate quantum interval.

The GPU-enabled CLI and export fixture compile and link with MSVC Release.
Runtime GPU export, pixel references, repeatability, sanitizers and broader
checks remain unverified. Broad test runs are deferred until the larger task
is ready. External slots, graph-runner CLI integration and the registry gate
remain pending. WP09 stays open. The M0 hardware gaps and live/shared-device
block remain unchanged.
