# A1 measurement fix round

The gate measures deterministic work counters. Wall times and QML/V4 profiling
remain diagnostic. Each scenario uses a fresh offscreen process. The measured
counter pass runs without the profiler.

## Review verdicts

| Finding | Verdict and evidence |
|---|---|
| F1 | Fixed. An active phase retains a registration, never the model. Its callbacks are `noexcept`. Disabled hooks check a relaxed atomic before observer work. The lifetime selfcheck destroys the model before scope exit. |
| F2 | Fixed. Payloads are lazy, markers JSON is reused, and the inline cached piano-roll getter is restored. The disabled-payload selfcheck rejects eager evaluation. |
| F3 | Fixed. Classify menus while alive, validate child membership, disconnect before thread migration, and use direct UI-thread destruction cleanup without dereferencing the dying object. A selfcheck exercises a stale child event and a transient menu. |
| F4 | Fixed. Both counter and ceiling types are exact nonnegative integers. Reject nonfinite JSON, check scenario equality for either baseline source, discover the git root, and fail closed on git errors. A missing baseline path requires explicit adoption. An explicit baseline supports exports without `origin/main`. |
| F5 | Fixed. `model_change` and `agent` have separate ceilings, including 40 and 56 parses respectively. |
| F6 | Fixed. Moved every requested F5/F6 artifact into the requested `scratchpad/old-measure/`, preserving the files and directory. None remains in A1. |
| F7 | Fixed. Marker notifications are inside signal fan-out and settled-document validation has a parse scope. |
| F8 | Fixed. Pin scale, DPI, style, software backend and basic rendering. Gate unprofiled counters. Render callbacks use atomic accumulators. |
| F9 | Fixed. Crossings consistently count conversions at the sampled boundaries. Cache hits do not count. The measurement contract explicitly lists excluded adapters and limits the gate's claims. |
| F10 | Fixed. Private registrations have UI-thread assertions. Active phase or crossing callbacks prevent registration changes. Phase exit retains the original observer. |
| F11 | Fixed. Each child timeout is 170 seconds within a 360-second ctest timeout. Both passes use the same result and scene validator. |
| F12 | Fixed. Check every RHI allocation and drain only after the workload. GPU execution remains unqualified on this host. |
| F13 | Fixed. Direct visual-child notifications replace repeated sibling scans. Seeded external reparenting and 5,000 insertions are covered by the selfcheck. The overlay omission was not a defect: the driver already observed the window. Unseeded external trees remain outside the creation contract. |
| F14 | Fixed. Cheap rejection guards precede measurement scopes. The fixture comment now matches video rows 0–7, MIDI rows 8–47 and audio rows 48–63. |

## Counter ceilings

These values come from the unprofiled counter pass. Existing ceilings were only
lowered. The assistant scenario has its own entry.

| Scenario | Objects | Delegates | Crossings | Payload bytes | Parses |
|---|---:|---:|---:|---:|---:|
| `playback` | 0 | 0 | 0 | 0 | 0 |
| `scroll` | 46651 | 414 | 416 | 457441 | 0 |
| `zoom` | 2264 | 28 | 42 | 43855 | 0 |
| `clip_drag` | 672 | 8 | 151 | 405596 | 11 |
| `note_drag` | 0 | 0 | 2 | 367276 | 2 |
| `model_change` | 51059 | 0 | 280 | 41936284 | 40 |
| `agent` | 51059 | 0 | 285 | 41937215 | 56 |

## Regression evidence

The checker test failed before the fix on boolean, fractional, infinite and NaN
ceilings. The retained CLI test exercises both a measured regression and a
ceiling increase, then restores the passing input. Git failures, missing
adoption approval, schema changes and malformed pass output have retained tests.

The real scroll workload reports 416 crossings. A temporary budget of 415
failed with exit 1 and `crossings: 416 exceeds 415`. Restoring 416 passed with
exit 0. The repository budget was not modified by this deliberate failure.

## Files belonging to A1

All paths below are relative to `native/timeline/`.

- `CMakeLists.txt`
- `budgets/ui-120hz.json`
- `src/model/TimelineModel.h`
- `src/model/TimelineModel.cpp`
- `src/edit/ClipGestureController.cpp`
- `src/edit/keyframes/ClipInspectorController.cpp`
- `src/midi/PianoRollController.cpp`
- `tests/tst_timeline_perf.cpp`
- `tests/measure/ObjectCreations.h`
- `tests/measure/OffscreenRhi.h`
- `tests/measure/StressDocument.h`
- `tests/measure/check_perf.py`
- `tests/measure/test_check_perf.py`
- `tests/measure/README.md`
- `tests/measure/a1-results.md`

`PianoRollController.h` has no remaining diff. The unrelated native chat change
is preserved. No commit or Git stash, checkout, reset, restore or clean was run.

## Verification

- `ctest -LE window -R '^tst_timeline_perf' --repeat until-fail:2`: all 10 entries passed, including the preference fixture. All seven scenario counter dictionaries were identical across their two runs and exactly matched their separate ceilings.
- Checker unit tests: all 10 passed. Observer selfchecks include model destruction, rejected observer changes, disabled lazy payloads, stale child events, transient menu/delegate lifetimes, seeded reparenting and 5,000 visual child insertions.
- Scoped native lint: five translation units passed with no changed-line findings or analysis errors. The filtered compilation database used the real build commands and did not build outside the lock. Clazy is unavailable.
- Functional ctest run with `-LE window`: `tst_timelinemodel`, `tst_keyframes`, `tst_keyframesui` and `tst_pianorollui` passed. The additional `tst_tracksui` suite reported 205 passing cases, one failure and three optional skips. Its failing `saveBannersFollowTheRealController` case logs `Permission denied (NETWORK)` before its save-success assertion at `tst_tracksui.cpp:3644`. The sandbox denies that request. Gesture and clip cases passed.
- `git diff --check`, affected documentation links and the control-character audit passed.

The additional `tst_flexlayout` build is blocked by the existing missing include
path for `VstShmProtocol.h` in `VstLiveChannel.h`. The primary timeline-model,
keyframe and piano-roll targets built successfully through the requested lock.

Repository-wide typecheck fails at untouched
`web/src/hooks/timeline/useTimelineAgentBridge.ts:1637` because `blendMode` is
wider than the clip schema. Repository lint fails on untouched conditional
object spreads in `packages/agents/src/capabilities/vst-host-adapter.ts` and
`packages/timeline/src/ops/plugin.ts`. The native affected selector exceeds
Node's string limit while reading Ninja dependencies. The general affected
plan selects all workspaces from the existing branch diff and would run builds
outside the user's target restriction, so the actual scoped native tests replace
that aggregate run. Harness gate fails before execution because the node catalog
core is `0.8.11` while the CLI core is `0.8.18`.

The registration is shared by the UI model and active UI scopes. An active scope
keeps it alive if the model is destroyed. Counter contexts disconnect before
captured data dies. Render callbacks use atomic accumulators. Object observers
remove their listeners when destroyed and detach objects before a thread
handoff. No sanitizer or real-GPU qualification was performed in this fix round.
