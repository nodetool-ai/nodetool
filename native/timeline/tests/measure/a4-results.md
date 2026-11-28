# A4 part one

JSON edit functions, registered names and payloads are unchanged. `TimelineModel`
emits one `changed(ChangeSet)` signal for an edit, undo or redo.
The value contains clip, track and marker IDs with changed document field names,
note-clip IDs, collection structure flags and a full-replacement flag. Undo,
redo, transient settlement and adopted documents use the same notification path.

Clip-only registered edits reuse their validated typed clips during application.
LaneClipModel compares presentation role values on changed rows. TrackListModel
emits exact scalar roles. TrackWindowModel forwards those rows and roles and
notifies its document role separately. Height changes update only affected
geometry roles. TimelineModel scalar properties have separate notifications.

The inspector, piano roll, track effects, automation controller/readout and
assistant now consume ChangeSet. Automation retains the independent
`sourceChanged` gesture-cancellation contract. The connection checker locks
`timelineChanged` and `clipsChanged` counts separately for each source file.
Its tests reject added connections and an empty source scan.

## Before and after

These are local offscreen software-backend measurements from the checkout
before this part and the final isolated performance run. They are diagnostic
wall times, not GPU frame qualification. Actions are means over the matching
operations in the deterministic workload. The final performance run passed all
10 ctest entries against the lowered budgets.

| Measurement | Before (ms) | After (ms) |
|---|---:|---:|
| Video move action | 8.99 | 8.75 |
| Dense MIDI move action | 20.63 | 22.09 |
| Dense MIDI move fan-out | 19.66 | 21.12 |
| Agent dense MIDI move action | 26.51 | 24.65 |
| Note drag release | 45.85 | 46.16 |
| Mixed edit frame mean | 55.38 | 56.04 |

The dense MIDI edit and note-release target remains unmet. The measured wall
time does not establish a latency improvement for this part. Remaining QML
fan-out dominates the next step.

| Work counter | Before | After / new ceiling |
|---|---:|---:|
| Rows notified in 40 UI edits | 64 | 24 |
| Rows notified in 40 agent edits | 64 | 24 |
| Parser calls in 40 agent edits | 56 | 40 |
| Parser calls on note release | 2 | 1 |
| C++ timelineChanged connections | 27 | 22 |
| C++ clipsChanged connections | 21 | 17 |

## Remaining work

- R1. Retire the remaining coarse connections enumerated in
  [coarse-connections.json](coarse-connections.json). Compatibility signals still
  run on ordinary edits until those listeners migrate.
- R2. Consolidate validation, replacement and notification comparisons into one
  edit result. Multi-field document changes still parse during validation and
  application. Clip-only edits reuse their parse. Ordinary clip notifications
  reuse the changed IDs already recorded by application. Adopted external
  documents still reset rows and set the full-replacement flag.
- R3. Narrow the dense QML fan-out in PianoRollPanel and StepEditorPanel. Marker
  edits still rebuild the marker arrays and ruler delegates. MarkerSession is
  a stateless converter called by QML, with no model connection to migrate.
- R4. Extend differential fixtures to every registered edit, including generated
  IDs and structural edits. This part covers six deterministic registered edits:
  MIDI notes, controllers, events, clip parameters, move and trim. Each compares
  JSON, typed clip timing and track roles with a full reload, including undo and
  redo, and checks the exact changed clip fields.
- R5. Add listener-invocation counters and GPU/sanitizer qualification. The
  current counters measure notification rows, parser calls and coarse signal
  emissions. They do not count every listener invocation.

## Verification

All native test builds used the requested `ntlock.sh` wrapper with named
`tst_*` targets and `-j4`. All test runs used offscreen QPA and `ctest -LE window`.

| Check | Result |
|---|---|
| Performance suite before | All 10 ctest entries passed |
| Menus and remaining menu group | Passed |
| Timeline model differential cases | Passed, including move/trim and undo/redo |
| Exact lane and track role cases | Passed after final lint fixes |
| Keyframes and keyframes UI | Passed |
| Tracks region | Passed |
| Piano roll UI | Passed |
| Track effects (`tst_wiringw`) | Passed |
| Assistant controller | Passed |
| Automation UI | All 210 cases passed after restoring source invalidation cancellation |
| Final functional ctest run | 11 of 12 entries passed. Tracks UI: 210 passed, one failed, three optional skips |
| Performance checker unit tests | All 13 passed |
| Native lint | Unique compilation commands used to avoid analyzing every copy of TimelineModel. Two changed-line findings were fixed and their translation units rechecked |
| Flex layout | Build blocked by the existing missing `VstShmProtocol.h` include path |
| Native affected selection | Failed reading Ninja dependencies: Node string length limit |
| General affected selection | Dry run selected all workspaces from the existing branch diff. The scoped native tests replace that aggregate build |
| Repository typecheck | Failed in untouched `web/src/hooks/timeline/useTimelineAgentBridge.ts:1637` |
| Repository lint | Failed on untouched conditional object spreads in `packages/agents/src/capabilities/vst-host-adapter.ts` |
| Harness gate | Failed in existing branch-wide checks, including localhost-dependent script tests, package pins and generated artifacts |

The Tracks UI failure is `saveBannersFollowTheRealController`. It needs a
localhost HTTP test server and logs `Permission denied (NETWORK)`. The
performance suite needs no localhost server or profiler TCP port. Gate script
checks for development ports and package tarball serving also need localhost.

Clazy and sanitizer runs were not performed. No visible window was opened.

## Files changed

- [budgets/ui-120hz.json](../../budgets/ui-120hz.json)
- [src/aiassist/AssistController.cpp](../../src/aiassist/AssistController.cpp)
- [src/audio/automation/AutomationController.cpp](../../src/audio/automation/AutomationController.cpp)
- [src/edit/keyframes/ClipInspectorController.cpp](../../src/edit/keyframes/ClipInspectorController.cpp)
- [src/midi/PianoRollController.cpp](../../src/midi/PianoRollController.cpp)
- [src/model/ChangeSet.h](../../src/model/ChangeSet.h)
- [src/model/LaneClipModel.cpp](../../src/model/LaneClipModel.cpp)
- [src/model/TimelineModel.cpp](../../src/model/TimelineModel.cpp)
- [src/model/TimelineModel.h](../../src/model/TimelineModel.h)
- [src/model/TrackListModel.cpp](../../src/model/TrackListModel.cpp)
- [src/model/TrackListModel.h](../../src/model/TrackListModel.h)
- [src/model/TrackWindowModel.cpp](../../src/model/TrackWindowModel.cpp)
- [src/wiring/w/TrackEffectsModel.cpp](../../src/wiring/w/TrackEffectsModel.cpp)
- [tests/measure/a4-results.md](a4-results.md)
- [tests/measure/check_perf.py](check_perf.py)
- [tests/measure/coarse-connections.json](coarse-connections.json)
- [tests/measure/test_check_perf.py](test_check_perf.py)
- [tests/tst_timelinemodel.cpp](../tst_timelinemodel.cpp)
- [tests/tst_tracksui.cpp](../tst_tracksui.cpp)
