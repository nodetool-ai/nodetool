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

## Kindle native 2D fixture review

A fresh independent Astra review found no supported blockers in the frozen
eight-file scope: seven files under `native/game/tests/fixtures/kindle/` and
the CMake test integration. The immutable manifest is
`80345ba02830d3dfd281d2f5cd55448ebe0daf3882bd88d428f78ac31eca1638`,
stored with its source snapshot under
`/home/mg/.cache/native-final-tmp/astra-kindle-review/`.

The reviewer verified every snapshot hash, seven passing focused tests, all
39 source/prepared asset hashes, 153 active entities plus four templates,
and all three verbatim original script bodies. The review covered native
API translation, contact collection, patrols, command ownership, lifecycle,
input, audio, replay harness and CMake integration. The prepared document
SHA256 is `0805e78dfabdf266e4dd3f041a4fa47dae80c576bebe18bf53d039fdecd98514`.

This clears the fixture source review. The reviewer did not independently
execute the full completion route, Qt player, performance measurements or
broad engine checks. Execution evidence is recorded separately in the
[verification record](native-game-cpp-verification.md). Unsupported dynamic
UI, particles, visual animation, postprocessing and audio mixing remain
explicit fixture limits. No repository files were changed by the reviewer.

### Kindle live-input correction follow-up

Actual Qt keyboard QA subsequently exposed a fixture defect that the first
static review and actions-only route did not catch. Qt supplies a global
movement field, and native 2D applies movement intents after script velocity
commands. The old fixture therefore lost hero and crawler velocities.

The fixture now emits per-actor native movement intents for the hero and
crawlers, preserves static lift velocity commands, and issues zero intents
for spawned kinematic dust and splash entities. The updated worker route
and probes use Qt-shaped movement, action and jump fields. These reproduce
the field shape, not every physical-key alias or value emitted by Qt.

A fresh independent Astra review found no supported blockers in the new
eight-file snapshot. Its manifest is
`193e414e3853b9747e286edf954f1233c5f0d8f8c667fbe8d1123b75b9068d50`,
stored under `/home/mg/.cache/native-final-tmp/astra-kindle-qt-intents-review/`.
The prepared document SHA256 is
`c14e1da54ebd30e9448551dd87d8fe33194b1b6ea9d45b544b4b10540b34af18`.
The reviewer checked the Session/World2D ordering, original scripts,
spawn lifecycle, input translation and recorded RED/GREEN evidence.
The old real-worker jump probe and actor-intent regression failed before
the fix. The corrected seven unit tests and real-physics probes passed.

This follow-up clears the corrected fixture source. The reviewer did not
independently execute the updated full route, live Qt or performance checks.
Those execution results belong to the verification record. No engine code
or per-tick watchdog was changed.

## Checkpoint and presentation optimization review

Astra found no evidence-backed findings in the frozen six-file Session,
save-host and regression-test scope. The manifest SHA256 is
`498735b7d4559eca73e4a457a6cde7650b2b1737be51510223423907d1311739`.
All listed hashes were verified and compared with HEAD
`65b47e07159bc5449e2e7ab58384a90224cbb67f`. The snapshot is under
`/home/mg/.cache/native-final-tmp/astra-session-perf-review/`.

The review covered private checkpoint payloads, public authenticated
same-session snapshots, atomic current-scene order caching, recovery and
reload/adopt, local frame moves, cancellation, allocation failure, generation
access and storage replay. This was read-only source and test review. No
builds, tests or benchmarks were rerun. The new editor cases still require
execution. Temple p95 remains above the 4 ms target, so this clearance does
not establish performance completion.

## Vertex color and emissive strength review

Astra found no supported findings in the frozen 18-file material scope.
Manifest SHA256 is
`abb83a2e14d33a3c39e508f35e0489c9a775acdee6631c624caa7bba8015687f`.
All hashes were verified against the snapshot under
`/home/mg/.cache/native-final-tmp/astra-material-review/` and compared with
HEAD `65b47e07159bc5449e2e7ab58384a90224cbb67f`.

The review covered accessor formats, normalization, clamping, count and
budget checks, optional bridge fields, linear RGBA multiplication, single
emissive-strength application, finite HDR output, MASK shadow alpha and
cloned-material disposal. Compatibility rendering adds RGBA multiplication
only. Full PBR alpha, emission and shadows use the environment profile.

The reviewer ran no builds or tests. Old-asset byte and pixel preservation
were not measured. Subsequent synthetic Qt test-fixture corrections are
outside this immutable clearance and require follow-up. Importer tests have
passed, while the new Qt shadow positive control still requires diagnosis.

## Sunrush Kart functional review

Astra found no supported findings in the frozen Sunrush scope. Manifest
SHA256 is
`2d1a919a4a8588d49c097b6b709bb59e7da3f82d921626dae30ddb13d687e13d`.
The reviewer verified all 52 record hashes and sizes under
`/home/mg/.cache/native-final-tmp/astra-sunrush-review/`.

The review covered the nine fixture files, partition helper, original assets
and scripts, and recorded evidence. It checked original IDs and bodies, role
state, previous-tick properties, targeted events, pose markers, camera
hierarchy, complete-attribute welding and partition coverage, and sparse-hole
normalization. Recorded evidence supports ten unit tests, 3,717 route ticks,
1,859 same-session replay ticks, three ordered laps and a first-place finish
at tick 3,705 in 58.7667 seconds, plus control probes and results UI.

No tests or runtime were rerun. Prepared GLB outputs were not included for
independent output-byte verification. This clearance does not establish
model admission, live Qt input, GPU rendering or performance, fresh-session
or WASM replay, or shared material/core correctness. Admission remains pending.

## Material verification integration review

Astra found no findings in the six-file integration snapshot. Manifest
SHA256 is
`fe7dcae7cc61c140212614cdd5ab8a0bdf98ce28fc3aa09486fd2bf7151bb08d`,
with all hashes verified against HEAD
`65b47e07159bc5449e2e7ab58384a90224cbb67f`. The snapshot is under
`/home/mg/.cache/native-final-tmp/astra-material-integration-review/`.

Static review covered allocation and fixture CTest registration, Qt material
linking and Linux Vulkan/OpenGL registration, player selection in affected
tests and the CLI registry, and browser profile inclusion and serialization.
No new focus-stealing path was identified in render-control capture. No
builds or tests were run. Cross-platform compilation remains unverified,
and registration does not resolve the Vulkan shadow positive-control failure.

## Vulkan material follow-up review

Fresh Astra follow-up cleared the final two-file scope with no supported
findings. Manifest SHA256 is
`832fe4f3f65df4b50c4fa7eff5570ab372d7e110260b4b016acd2f006c4f32a6`.
The reviewer verified both final source hashes, prior material snapshot
hashes, and the material-test binary against the recorded green manifest.
Snapshot: `/home/mg/.cache/native-final-tmp/astra-material-followup-review/`.

The viewport ordering matches Qt Vulkan default-scissor initialization.
Empty-caster passes still clear depth and consume updates. Material bindings,
texture alpha and draw offsets remain unchanged. The final fixture reaches
production rendering, exercises color interpolation and requires an actual
receiver shadow. Layer/submission checks supplement pixel checks.

The reviewer inspected recorded Vulkan and OpenGL passes but ran no builds
or tests. This scope does not establish textured-alpha behavior, every
cascade pixel contribution, hardware performance or cross-platform builds.

## Schema-copy optimization review

Astra cleared the one-file optimization with no findings. Manifest SHA256 is
`e88fd7aa5be70fe072856cf2164666eda5c512ebde612ac143a268f51253f0e2`,
and source SHA256 is
`66fb7c1a17a3967f691fe3ea2c28266b582da83b5b3a996e220d3e7cacacb383`.
Production matches the immutable snapshot under
`/home/mg/.cache/native-final-tmp/astra-schema-copy-review/`.

The change preserves normalization, defaults, required-field checks, traversal
order, validation paths, reference lifetime and cancellation propagation.
It removes allocation work without shared mutation or new recovery behavior.
Actual old/new probes retain identical null/array schema type errors.
Recorded focused tests and 444 differential worker comparisons support the
change. An implementation-mirroring test was not warranted. The reviewer
ran no tests or OOM injection. Allocation-failure timing can differ after
removing allocations, and the 4 ms target remains unmet.

Cache naming is explicit: `baseline-source` now contains the candidate. The
original Schema.cpp is identified by its recorded hash in
`script-host-profile/source/src/document/Schema.cpp`.

## Held-key follow-up review

Astra cleared the final two-file input correction. Manifest SHA256 is
`72b2c96cbb85f7f5890b0d1db03ce2452c9bed4b6b2bd32fcb7582a593b3132c`.
The snapshot under `/home/mg/.cache/native-final-tmp/astra-held-key-review/`
matches production and the recorded RED/GREEN hashes.

The release guard matches existing repeat-press suppression. Physical
releases still reach the player, synthetic repeat pairs cannot clear held
actions or add press edges, and Escape/pointer paths are unchanged. The
actual viewport regression covers W, Shift, Space, late repeat pairs and
physical taps. Evidence records RED exit 3 and GREEN CTest exit 0 with all
ten Qt cases passing. The retained failing binary hash was verified.

The reviewer ran no builds or tests. This clearance covers the Qt event
boundary, not OS repeat classification, simulation timing or the installed
player. Shift repeat injection is synthetic. Live v3 acceptance remains
pending after its separate script-watchdog failure.

## Player input-test integration review

Astra cleared the four-file integration delta with no findings. Manifest
SHA256 is
`000d2efd314b4178494d0c3b8f661c55fa0e9362e25b37cd87bff6c4155818b4`.
All hashes were verified under
`/home/mg/.cache/native-final-tmp/astra-player-input-integration-review/`.

The pure C++ target links game_document and Threads. Its player/input
labels include it in the mandatory player wrapper. Affected-test and CLI
gate mappings select the new test. Actual Vitest evidence shows the missing
selection fails first, followed by 77 passing tests after correction. The
earlier incorrect runner invocation was not counted as RED.

The review was static and did not run builds or tests. Input implementation
and subsequent source changes are outside this integration clearance.

## Physical press-latch review

Astra cleared the final three-file Main/internal-input/test scope. Manifest
SHA256 is
`cab12691dfd29068c47999319808719e1006fccae9e2f282671be03ad0e3e614`.
All hashes match production and recorded green evidence under
`/home/mg/.cache/native-final-tmp/astra-player-input-latch-review/`.

The review covered synchronization, atomic alias batches, held versus pending
state, pause clearing, recording and its cap, packet shape, look, exceptions
and lifetimes. Pending physical presses are consumed once without changing
actual held state. Main records the consumed packet and retains its existing
post-step replacement. The unchanged test source fails three quick-tap cases
on the old extracted implementation and passes all ten after the fix.

No builds or tests were rerun by the reviewer. This clearance does not prove
the invalid LP1 Title scenario had the same cause or replace final live
acceptance. Integration has its separate four-file clearance above.

## Generated material response-schema review

Astra cleared the canonical generated-artifact correction. Manifest SHA256
is `9ed3e137be78766431380c36b18fae8fd44d43f2c78a6f4ac801e1120621bfb9`.
The generated JSON and protocol reference hashes match the snapshot under
`/home/mg/.cache/native-final-tmp/astra-generated-material-schema-review/`.

The artifact matches canonical output byte-for-byte. Its only changes are
optional four-component RGBA bounded to 0..1 and optional emissive strength
bounded to Float32 maximum. Required fields, defaults and prior caps remain
unchanged. CMake does not embed this response-schema artifact in native or
WASM binaries. The reviewer ran no generation, builds or tests.

## Project resume lifecycle review

Fresh Astra review `astra_resume_lifecycle` cleared the frozen hook and its
real-hook regression test with no supported findings. Manifest SHA256 is
`9ee9d9c512befaf1bafa37c3bcecc5292168433a015d9b05aeb81b0f210fff93`.
The immutable source and focused check receipts are under
`/home/mg/.cache/native-final-tmp/resume-project-frozen-source-v2/`.

The scope covers animation-frame cleanup, project-open completions after
unmount, separate StrictMode effect lifetimes, and preserved mounted scroll,
newest-document and restored-tab behavior. The original hook fails four
lifecycle regressions while three controls pass. The fix and existing
component tests pass all 13 focused tests, with web typecheck and targeted
lint passing. Earlier test-fixture setup failures remain recorded.

This clearance is limited to those two source files. It does not replace
the pending final aggregate, establish the original aggregate callback
history, or change the documented native-fidelity scope and Sunrush browser
vertex-cap rejection. The prior failed aggregate remains preserved.

## Sunrush results-button alignment review

Astra cleared the two-file fixture adapter and regression delta. Manifest
SHA256 is `f4753071f9e5dd88407d33e2a1a96207f6680d539bb2b25241c3416dd1d798d2`
under `/home/mg/.cache/native-final-tmp/astra-sunrush-button-review/`.
The regression fails before the label-height correction and all 11 focused
tests pass afterward. This clearance does not extend to native engine code.

Subsequent actual installed-v4 Qt OpenGL route and restore capture at tick
3717 passed. The updated document changes only three button-label heights
from 46.4 to 22. Pixel comparison finds 1,774 changed pixels, all within the
Race Again button, with the glyph moved down 13 pixels. Everything outside
that button is identical. Closed asset hashes are unchanged. The review
snapshot's pending-capture flag describes its earlier state; the completed
receipt is
`/home/mg/.cache/native-final-tmp/sunrush-kart-live/button-layout-final/qa-index.json`.

## Parent-branch merge review

The merge preserves the native game changes while incorporating parent
`bbbc6fb73950b0877f61e037ba7b596d67431a3a` and its CLI feature-package split.
The original 13-file resolution snapshot is retained under
`/home/mg/.cache/native-final-tmp/parent-merge-review/`, with manifest SHA256
`c0ec045ffb1d038565b33f3c93cd1a6361b05439b61c6c39257c88a468321b5b`.
Native game selection and worker preparation now follow `cli-game`; the
parent's native UI/chat and shared catalog selection remain covered.

Astra identified two integration omissions: the moved native CLI test was
missing from real-package test selection, and native CI paths still named
the old CLI location. The correction restores the real-package test entry
in `cli-game`, removes it from the unrelated workflow package and migrates
the native workflow paths. Fresh follow-up review cleared the three-file
snapshot with no remaining supported findings. Its manifest SHA256 is
`97b13350c2d0e7794f793532c6f77734b840eec77914608b7aa7b420a8842bb7`
under `/home/mg/.cache/native-final-tmp/astra-cli-native-profile-review/`.
The original 13 source hashes remain unchanged.

The explicit native browser CLI profile failed before correction and passed
all three tests afterward. A selection proof verifies the real-package
project and migrated CI paths. Script selection/partition regressions pass
99 tests, and the moved harness registry passes 239 tests. These focused
results and review do not replace the final merge aggregate or claim a
native runtime rebuild. Final aggregate evidence is recorded separately.
