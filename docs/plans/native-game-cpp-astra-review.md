# Native game Astra review

This records the initial read-only Astra review of the uncommitted port against
HEAD `4834b49ef14480620cfbd88d0d4a971a18c99b34`. The fixed working-tree
manifest contains 398 changed or untracked source and evidence files. Its
SHA-256 is `31822f7763a4bedc1806e8f652ba047961697331287b8cd73f1c7e321df3ced5`.
The manifest and tracked diff are retained in
`/home/mg/.cache/native-final-tmp/astra-final-review/`.

Four independent Astra reviews covered native simulation and portable core,
Qt/assets, browser hosting and presentation, and authoring/persistence/delivery.
Each considered correctness, repository standards and the
[port specification](native-game-cpp-port.md). Reviewers verified hashes for
their inspected scopes. These were scoped reviews, not exhaustive verification
of every shader equation or platform runtime. Existing checks were reused.
The native-core reviewer also ran bounded final-worker reproductions.

Earlier A1/A2 findings F1 and F2 concerned expanded prefab admission and durable
base versus draft revision CAS. Both were fixed and cleared in earlier Astra
follow-ups. The later review found the following independent issues.

| Finding | Trigger and consequence | Correction required |
| --- | --- | --- |
| F3 | Browser player startup omits the document argument to the 3D renderer. An environment-bearing standalone game fails its first presentation. Decal and font preparation are also skipped. | Pass the document and test the exported startup path with an authored environment. |
| F4 | A scene transition discards outgoing behaviors without `onDestroy`. A worker reproduction stayed at score zero where destruction should add seven. | Run outgoing destruction atomically and exactly once before discarding its state. |
| F5 | Qt editor inspection copies JSON-save diagnostics on the GUI thread while playback appends on its worker thread. | Synchronize diagnostic publication without holding a lock across simulation or file IO. |
| F6 | Qt and browser 3D rendering paths draw inactive mesh nodes instead of the selected glTF scene root closure. A two-scene model displays inactive-scene geometry. | Draw selected roots and descendants, while retaining pose nodes needed by skins and animations. |
| F7 | Killing a JSON-save writer leaves its exclusive lock file. Future writes fail indefinitely after reopening. | Use a process-released mutex or sound stale-owner recovery while preserving atomic slot-limit enforcement. |
| F8 | Native tRPC create/save checks only the worker environment override, bypassing the canonical installed executable resolver. | Resolve the staged installed worker through the shared resolver and test with the override absent. |
| F9 | Despawn destruction retains behavior state, timers and started entries after the entity is gone. Repeated temporary entities grow checkpoints indefinitely. | Remove destroyed behavior entries after successful destruction. |
| F10 | Cancellation remains active during 2D rollback reconstruction. Recovery fails before restoring script state, and the retained session can authenticate a partially advanced snapshot. | Make trusted checkpoint recovery noncancelable and evict an irrecoverably faulted session. |

F4, F9 and F10 were reproduced with the final Release worker. Inputs and
responses are `transition-destroy.json`, `despawn-state.json` and
`cancel-2d.json` beneath the review cache. The Qt diagnostic race was initially source-confirmed, before the focused
TSan reproduction recorded below. The selected-scene and browser
startup findings are supported by their call paths. The save-lock and installed
resolver findings were initially static findings and require focused regression
verification with their fixes.

The native-core review also investigated a destruction command-budget concern.
Its probe hit the script time limit first, so that candidate is unconfirmed and
is not included among the blockers above.

Fresh Astra follow-up reviews must assess the fixes and unresolved objections
against a new fixed manifest. Initial review findings do not establish that a
later implementation is correct. Mandatory and packaging verification remains
recorded separately in [the verification evidence](native-game-cpp-verification.md).


## Focused fix verification

The fixed production source is frozen for fresh Astra follow-up. These focused
results establish the corresponding regressions, not a final release pass.

| Finding | Fix and evidence |
| --- | --- |
| F3 | The browser player passes its parsed document to the 3D renderer. The old closed installed profile committed tick zero but failed before any completed canvas frame with the exact environment-preparation error. The fixed installed startup passed with its declared TTF loaded before the first completed frame, visible HUD/model pixels, no errors and only closed local requests. |
| F4, F9 | Scene transitions execute outgoing destruction once. Dead behavior state, timers and started entries are removed. Function-form updates are not invoked as destruction hooks. Session regressions, forty temporary lifecycles and restore/replay pass. The retained worker reproductions now report score seven and empty dead state. |
| F5 | Diagnostic append and report use a narrow mutex, outside simulation and file IO. The actual-header TSan workload failed against the old header with a diagnostic-copy race and passed against the fixed header with 29,829 coherent snapshots and no TSan report. Focused editor concurrency, playback inspection and existing JSON-save tests pass. This is host-boundary TSan evidence, not a fully sanitized kernel run. |
| F6 | Qt filters both render paths through selected-root reachability. Browser instance construction filters drawable meshes, including root-attached skinned meshes, while retaining transform/joint nodes. The old Qt player fails the inactive-scene pixel regression. All twelve OpenGL/Vulkan, compatibility/PBR captures pass after the fix. Four browser CPU regressions fail before and pass after, including an animated joint outside the selected closure. |
| F7 | A SQLite transaction provides a process-released scope mutex using the packaged official Node runtime's built-in SQLite. Atomic JSON replacement and directory sync remain. Old actual-adapter SIGKILL/reopen fails with the stranded lock. Five fixed tests cover fresh/existing lock databases, live-owner rejection and the cross-process final-slot race. No dependency was added. |
| F8 | Create/save use the shared installed-worker resolver. The missing-override regression fails before and passes after. Three route tests pass, including unavailable-worker error mapping. |
| F10 | Trusted checkpoint recovery suppresses cancellation with an RAII scope. Recovery failure invalidates and evicts the session. Session2D and bridge regressions pass, including staged state/RNG rollback, nested scope restoration, a genuine rollback allocation failure, rejected later operations and successful reopen. The original cancellation reproduction now returns cancelled with the unchanged tick-zero state. |

The browser's aggregate decoded-model vertex admission remains conservative over
all model nodes. It is not a count of submitted selected-scene geometry. Actual
draw statistics remain separate.

Core logs are retained beneath `astra-final-review/core-after-fix/`. Qt and TSan
logs are under `astra-f5-f6/`. Save and route logs are `astra-f7-*` and
`astra-f8-*`. Browser logs include `player-model-f3-f6-green.log`,
`player-startup-installed-old-red.log` and
`player-startup-installed-new-green.log`. All are beneath the verification cache.
The installed startup comparison deliberately held the pre-core-fix WASM pair
constant to isolate F3. It does not claim a final rebuilt release profile.
The new installed-startup regression is registered in the explicit browser
profile wrapper as well as the package test suite.


## Fresh Astra follow-up

Four new independent Astra reviews assessed the fixed snapshot, rather than
continuing the initial reviewers' turns. The immutable snapshot is retained at
`/home/mg/.cache/native-final-tmp/astra-followup-final/source/`. Its manifest
SHA-256 is `4fc5df0385c2e30d2b9c92c74fddc42ce1dda06efb639bd38aeddc4c55990712`
and covers 405 changed or untracked files against the same HEAD.

All supported initial findings are cleared in that snapshot:

- F3 and browser F6: cleared after review of startup document preparation,
  selected-root drawable construction, off-closure joint preservation and the
  CPU and installed startup regression evidence.
- F4, F9 and F10: cleared after review of lifecycle ordering, dead-state cleanup,
  function-form destruction exclusion, cancellation recovery and fault eviction,
  including the retained worker and focused native test results.
- F5 and Qt F6: cleared after review of narrow locking, editor halt-before-host
  replacement, full pose sampling with selected drawable submission, TSan
  evidence and the twelve Qt capture comparisons.
- F7 and F8: cleared after review of SQLite process-released ownership, slot
  atomicity and cleanup, packaged Node availability, canonical worker resolution
  and focused regression evidence.

No new supported findings emerged in these follow-up scopes. Reviewers reran no
builds or captures and reused the recorded execution evidence. Qt off-closure
skin preservation was inspected structurally, without a new Qt skin capture.
Mac/Windows filesystem behavior and installed Electron startup were not run.
Portable and final native artifact rebuilds and mandatory checks remain separate
release verification. Review clearance does not substitute for those checks.
