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
| [WP06 #7397](https://github.com/nodetool-ai/nodetool/issues/7397): control executor | Not implemented |
| [WP07 #7398](https://github.com/nodetool-ai/nodetool/issues/7398): audio executor | Not implemented |
| [WP08 #7399](https://github.com/nodetool-ai/nodetool/issues/7399): render executor | Not implemented |
| [WP09 #7400](https://github.com/nodetool-ai/nodetool/issues/7400): offline driver and CLI | Not implemented |
| [WP10 #7401](https://github.com/nodetool-ai/nodetool/issues/7401): browser comparison and Q8 | Not implemented |

M0's local build, typecheck, lint, native tests and harness checks pass. The
latest aggregate affected test run stops at Windows browser-isolation tests.
Browser isolation and credential ACL work are deferred. Real file-symlink
tests await CI with symlink privileges. These are not passing results.

M1's package build, typecheck, lint, Windows Release and ASan loader tests,
affected native tests and affected tests against `codex/realtime-m0-spikes`
pass. The Linux core CI results are recorded in
[the initial core run](https://github.com/nodetool-ai/nodetool/actions/runs/43292903682).
The M1-scoped affected run does not replace the incomplete aggregate run
against main described above.

This Windows checkout materializes the tracked `.claude` symlink as a text
placeholder. Local `check:agents-docs` consequently fails that existing alias
check. The new instruction files have matching companions and are linked from
`native/AGENTS.md`; CI must verify the complete instruction graph.
