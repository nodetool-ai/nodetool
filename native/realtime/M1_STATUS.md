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
| [WP08 #7399](https://github.com/nodetool-ai/nodetool/issues/7399): render executor | Scheduling and texture-lifetime core prepared. GPU backend and exit evidence incomplete. Test execution deferred by request. See [render scheduling](render.md) |
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

Actual wgpu-native encoding, asynchronous pipeline preparation, uniform
packing/bind-group caching, texture presentation, nonblocking staging readback
and software-adapter pixel goldens remain unfinished. WP08 stays open, and this
increment does not qualify M1 or resolve any M0 hardware gate.

GPU backend preparation is blocked on a dependency/design decision. The pinned
wgpu-native release contains unimplemented stubs for all three compilation and
async pipeline APIs required by design section 9.2, rule 4. The inspected upstream
revision has the same limitation. [Source evidence and alternatives](render.md#native-pipeline-api-blocker)
are recorded alongside the render contracts. No synchronous fallback or design
exception has been approved or implemented.
