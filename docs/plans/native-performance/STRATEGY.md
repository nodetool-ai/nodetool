# Native timeline performance strategy

Scope: `native/timeline` (C++ and QML). Target: a large music and video project stays below 8.3 ms per frame at 120 Hz during scroll, zoom, drag and edit.

Stress document for all numbers: 64 tracks, 2,000 clips, 20,000 MIDI notes, 500 markers (2.2 MB JSON).

## 1. Summary

1. Three root causes explain most of the measured cost. The `property var` count is not one of them.
2. The largest cost is the edit pipeline. One edit costs 126 ms to 137 ms. JSON and QVariant crossings explain only 6 ms of that.
3. The second cost is the spike when delegates appear. Scroll has a median of 8.1 ms and a mean of 19 ms.
4. The third cost is dense data that JavaScript holds and draws. The piano roll and the markers are the main cases.
5. The plan first locks the measurement, then removes the cheap waste, then changes the edit pipeline, then moves dense layers to C++.
6. Named edits stay the one entry point for the UI and for agents. That rule keeps headless tools at parity.

## 2. What the measurements say

### 2.1 Measured facts

| Fact | Number | Source |
|---|---|---|
| Playback frame | 2.9 ms mean (F5), 0.94 ms mean (F6) | F5 report, `f6/prof_playback.json` |
| Scroll frame | 19.0 ms mean, 8.1 ms p50, 63.9 ms p95 | `f5/interpose_results.json` |
| Zoom frame | 14.6 ms mean, 13.1 ms p50, 28.8 ms p95 | `f5/interpose_results.json` |
| Clip drag frame | 2.0 ms mean, 43.5 ms on release | F5 report |
| Note drag frame | 5.7 ms mean, 176 ms on release | F5 report |
| One edit | 137 ms mean, 168 ms p50, 335 ms max | F5 report |
| Crossing cost in one edit | 5.98 ms, 1.16 GB copied in 40 edits | F5 report |
| Crossing cost in one scroll frame | 0.075 ms C++, one 60 ms JS spike on the 2,000-note clip | F5 report |
| Crossing cost in one zoom frame | 0.04 ms | F5 report |
| `setNotes` commit with no frame rendered | 240 ms to 292 ms | F5 microbench, rerun in this session |
| Typed against `var`, one clip binding on zoom | 1,425 ns against 2,236 ns (1.57x) | `f6_microbench`, run in this session |
| Typed against `var`, one clip data update | 220 ns against 2,289 ns (10.4x) | `f6_microbench` |
| Typed against `var`, one marker binding | 307 ns against 362 ns on scroll (1.18x) | `f6_microbench` |
| 420 clips on one zoom frame | 0.60 ms typed, 0.94 ms `var` | `f6_microbench` |
| `MenuItem` objects created in 40 edits | 720, plus 106 separators | rerun log, `ContextMenu.qml:133` |
| `MenuItem` objects created in 120 scroll frames | 228 | rerun log |
| Items that exist at all times | 300 clip delegates, 501 marker flags, 500 marker blocks | `f6/prof_playback.json` |
| Functions that do not compile ahead of time | `PianoRollPanel` 117 of 301, `Clip` 40 of 157, `ClipBody` 37 of 192, `TimelineEditor` 44 of 127 | `f6/aot_with_ui/*.aotstats` |

A rerun of the F5 harness without the interposer gave the same picture: scroll 15.5 ms to 16.3 ms, zoom 12.1 ms to 12.3 ms, one edit 125.6 ms to 126.6 ms. The interposer adds about 10 percent.

### 2.2 Limits of the measurements

1. The F5 and F6 harnesses use `QT_QUICK_BACKEND=software`. Each frame time includes CPU rasterization of a 1920x1080 window. A GPU frame costs less for the raster part. The size of that part is unknown.
2. The F6 profile exists only for playback. No binding or creation profile exists for scroll, zoom or drag.
3. No measurement splits the 126 ms edit into its phases. A sampler run failed in this session. Slice A1 supplies the split.
4. For these reasons, each expected number below is an estimate unless the text says "measured".

### 2.3 What is not the problem

1. Playback passes. Do not optimize it.
2. Untyped QML bindings cost 0.3 ms per zoom frame for 420 clips. A full `property var` cleanup (924 cases in the timeline) cannot close a gap of 6 ms to 130 ms.
3. JSON and QVariant crossings are below 0.1 ms per frame on scroll and zoom. They matter on edit (6 ms) and as single spikes (60 ms, 18 ms, 150 ms).

## 3. Root causes

### RC1. The JSON document is the model of record, and an edit is a function on the whole document

Confirmed in code:

- `nt::app::Edit` is `std::function<QJsonObject(QJsonObject, const QJsonObject&)>` (`src/app/EditRegistry.h`). Each edit receives the full document and returns a full document.
- `TimelineModel::applyEdit` (`src/model/TimelineModel.cpp:604`) then finds the change by comparison. It compares each of the 2,000 clips with its old JSON.
- `applyEdit` parses the changed clips to validate them. `replaceClips` (`TimelineModel.cpp:361`) parses the same clips a second time.
- `PianoRollController::setNotes` (`src/midi/PianoRollController.cpp:157`) sends all 2,000 notes for a change to one note.
- The undo command keeps the document before and the document after.

Measured effect: a commit on the 2,000-note clip costs 240 ms to 292 ms with no frame rendered. One edit in the full editor costs 126 ms to 137 ms.

### RC2. One coarse change signal makes each listener derive its state again from JSON

Confirmed in code:

- `timelineChanged` has 34 C++ connections and `clipsChanged` has 27. QML has 17 handlers for them.
- 12 properties of `TimelineModel` share `NOTIFY timelineChanged` (`src/model/TimelineModel.h:31-42`).
- Listeners rebuild from the raw document. Examples: `ClipInspectorController::clip` (1.43 MB per read), four `document` properties (17.76 MB and 18.5 ms per read), `AssistController::linkedResources` (scan of 2,000 clips), `MarkerSession::rows` (14,066 conversions in 14 calls).
- Closed context menus build their items again on each edit: 18 `MenuItem` objects per edit.
- `TrackWindowModel` sends `dataChanged` for all rows and all roles when one track changes (`src/model/TrackWindowModel.cpp:59-61`).

Measured effect: 5.98 ms per edit in crossings and 1.16 GB copied. The cost of the other listeners is not measured. It is inside the 126 ms.

### RC3. Dense and repeated content lives in QML items, JavaScript arrays and Canvas

Confirmed in code:

- The piano roll holds notes as a JavaScript array. A drag frame runs `notes.map(...)` over all notes (`qml/pianoroll/PianoRollPanel.qml:203-318`). Six `Canvas` items draw the notes, the grid, the keyboard and the lanes.
- The timeline has 26 `Canvas` items and 6 `QQuickPaintedItem` classes. `RulerCanvas` paints on each zoom frame (120 paints in 120 frames).
- `TimeRuler.qml:112` and `MarkerLane.qml:107` use a `Repeater` over all markers. 1,001 items exist for 500 markers.
- `TrackLane.qml:91` uses a `Repeater` for clips. The window model limits the count, but a `Repeater` cannot reuse a delegate. The clip delegate is `Clip.qml` plus `ClipBody.qml`: 800 lines and 10 `Loader` items.
- Each `TrackLane` owns two context menus. Each new row builds them (228 `MenuItem` objects in the scroll scenario).
- `Clip.qml:68` calls `gestures.clipData(clipId)` when a delegate appears. The call converts the full clip, with all notes.

Measured effect: scroll p50 is 8.1 ms but p95 is 63.9 ms. The cost is in the frames where rows and clips appear. Zoom p50 is 13.1 ms. The cost is in each frame.

## 4. Target architecture

**D1. The typed snapshot is the model of record.** `nt::Timeline` already exists as an immutable snapshot with typed clips. Make it complete: typed tracks, markers, notes and automation points. JSON becomes a codec at four boundaries only: file, server sync, agent tool and clipboard.

**D2. A snapshot shares structure.** A new snapshot shares each unchanged clip, track and note array with the old snapshot through `std::shared_ptr<const T>`. An edit to one clip copies one clip. This is the one permitted use of shared ownership. Document the reason at the type, as native rule 1 requires.

**D3. An edit returns a change set.** A named edit produces a new snapshot and a `ChangeSet`: the ids of clips, tracks and markers that the edit added, removed or changed, the changed note ranges for each clip, and the changed document fields. The edit name and the JSON payload stay as they are.

**D4. One typed change notification replaces the coarse signals.** `TimelineModel` emits `changed(const ChangeSet&)`. Each row model converts it to `dataChanged` with exact rows and roles. Each controller ignores a change set that does not contain its entity. `timelineChanged` and `clipsChanged` stay only for a full document replacement.

**D5. QML receives rows, scalars and value types only.** An entity reaches QML as model roles, as a typed `Q_PROPERTY`, or as a `Q_GADGET` value type. No API returns an entity as `QVariantMap`, `QVariantList`, `QJsonObject` or `QJsonArray`. This is rule 30 and rule 32 of `PERFORMANCE.md`.

**D6. A dense layer is one C++ item.** Notes, the note grid, ruler ticks, marker flags, marker blocks, automation curves and loop repeats are each one `QQuickItem` with `updatePaintNode`. The item reads the typed snapshot. A scroll moves the item. A zoom builds geometry for the visible range only.

**D7. A gesture is transient typed state in C++.** A drag changes an overlay that the layer item draws. The model does not change during the drag. The release commits one small patch edit.

**D8. A delegate is small, stable and shares its popups.** One menu exists for each view, and it builds its items when it opens. A delegate reads only its own roles.

**D9. Undo keeps snapshots, not documents.** With D2, an undo step is two shared pointers. The JSON form is made only for save and for sync.

**D10. A number in a test is the definition of done.** Each slice ends with a counter or a budget in ctest. The static ratchet (`check_performance.py`) stays as a guard on direction. It does not replace a measured budget.

**D11. Agents and the UI use the same named edits.** No UI gesture may change the model through a path that an agent cannot call. See section 6.

## 5. Plan of slices

The order is return for effort. A1 to A3 need no architecture change. A4 and A5 are the core. A6 to A9 depend on A4.

### A1. Lock the measurement

- **Goal:** Make the six F5 scenarios a repeatable ctest with deterministic counters, and split the edit cost into phases.
- **Work:**
  1. Move the harness from `tests/measure/` into one target `tst_timeline_perf` that uses the generated stress document.
  2. Add counters that do not depend on the machine: items created per scenario, `MenuItem` objects created, crossing calls and bytes for each edit, JSON parses for each edit, signals for each edit, `dataChanged` rows for each edit.
  3. Add phase timers in the harness around the edit function, the validation, the parse, the undo push and the signal fan-out.
  4. Add a second run mode with a real RHI backend, for a machine that has a GPU. Report GUI-thread time apart from render time.
  5. Run the QML profiler pass that F6 did not finish for scroll, zoom, clip drag and note drag.
- **Files:** `tests/measure/f5_measure.cpp`, `tests/measure/f6_profile_harness.cpp`, `tests/measure/generate_stress_doc.py`, `CMakeLists.txt`, new `budgets/ui-120hz.json`.
- **Metric:** None moves. The slice produces the phase split of the 126 ms and the creation profile of the scroll spikes.
- **Risk:** Low. Timing in CI is noisy. Assert counters in CI and assert times only with a wide margin.
- **Lock:** `budgets/ui-120hz.json` holds the current counters as ceilings. A change may lower a ceiling. A change that raises one fails.

If the phase split contradicts RC1 or RC2, change the order of A4 to A9 before you continue.

### A2. Remove full entities from the hot crossings

- **Goal:** No hot path converts a full clip, a full track or the full document.
- **Work:**
  1. Add the roles that `Clip.qml` and `ClipBody.qml` read to `LaneClipModel`: `labelColor`, `loopLengthMs`, `speedMultiplier`, `speedBaked`, `hasEffects`, `hasAnimations`, `hasTimeRemap`. Remove the `clipData` property from the delegates.
  2. Change `TakeInfo::badge` to take a clip id.
  3. Give `ClipInspectorController` typed scalar properties. Remove bulk arrays (`notes`, `controllers`, `versions`) from the `clip` map as a first step.
  4. Remove the `document` property from `InspectorEdits`, `SpeedController`, `TransitionController` and `ReframeController`. Add a narrow getter for each caller.
  5. Give `trimSourceRange` and `rubberBand` their own `NOTIFY` signals. Add a `trimSourceClipId` string property.
  6. Make `AssistController::linkedResources` lazy. Compute it only when its panel is visible.
  7. Call `std::vector<RulerTick>` directly in `RulerCanvas::paint`.
- **Files:** `src/model/LaneClipModel.{h,cpp}`, `src/edit/ClipGestureController.{h,cpp}`, `src/takes/TakeSwitcher.h`, `src/edit/keyframes/ClipInspectorController.{h,cpp}`, `src/edit/inspectorsections/InspectorEdits.h`, `src/edit/speed/SpeedController.h`, `src/edit/transitions/TransitionController.h`, `src/preview/crop/ReframeController.h`, `src/aiassist/AssistController.{h,cpp}`, `src/ui/RulerCanvas.cpp`, `qml/Tracks/Clip.qml`, `qml/Tracks/ClipBody.qml`, `qml/SpeedDurationDialog.qml`.
- **Metric:**
  - Crossing cost for one edit: 5.98 ms to below 0.5 ms (estimate).
  - Bytes copied in 40 edits: 1.16 GB to below 20 MB (estimate).
  - Scroll p95: 63.9 ms to about 25 ms (estimate). The 60 ms spike on the 2,000-note clip goes away.
  - Clip drag: property reads go from 7,007 to below 200 in 90 frames (estimate).
  - `ClipBody` data update: 2,289 ns to 220 ns for each clip (measured in the microbench).
- **Risk:** Low. A QML file that still reads a removed map field fails at run time, not at build time. Run `qmllint` on each changed file.
- **Lock:** Counter "bytes crossed per edit" in `budgets/ui-120hz.json`. Lower the R3 counts in `performance_baseline.json` with `npm run check:native-performance -- --update`.

### A3. Share the menus and build them on open

- **Goal:** A row or a clip does not own a menu. A closed menu does no work on a model change.
- **Work:** Move `TrackLaneContextMenu` and the `editPoint` `RegistryContextMenu` from `TrackLane.qml` to one instance in `TracksRegion.qml`. Do the same for `TimeRuler.qml` and `MarkersPanel.qml`. Make `RegistryMenuItems` query the registry when the menu opens, not when the model changes.
- **Files:** `qml/Tracks/TrackLane.qml`, `qml/Tracks/TracksRegion.qml`, `qml/Tracks/TimeRuler.qml`, `qml/wiring/RegistryContextMenu.qml`, `qml/wiring/RegistryMenuItems.qml`, `qml/menus/TrackLaneContextMenu.qml`, `native/ui_primitives/qml/ContextMenu.qml`.
- **Metric:** `MenuItem` objects created in 40 edits: 720 to 0. In 120 scroll frames: 228 to 0. Both counts are measured today. The time gain is not measured. Expect 5 ms to 20 ms for each edit and a lower scroll spike (estimate).
- **Risk:** Low. A menu that opens with the wrong row context is the failure to test for.
- **Lock:** Counter "MenuItem created per scenario = 0" in `tst_timeline_perf`. Existing menu interaction tests stay green.

### A4. Change sets and exact notifications

- **Goal:** One edit does work in proportion to what it changes. This is D3 and D4 with the JSON edits kept.
- **Work:**
  1. Compute the changed ids one time in `applyEdit`. Pass the validated parse result to `replaceClips`, so a changed clip parses one time, not two times.
  2. Build a `ChangeSet` from that comparison and emit `changed(const ChangeSet&)`.
  3. Move the row models first: `LaneClipModel` (roles in `dataChanged`), `TrackListModel`, `TrackWindowModel` (one row, exact roles).
  4. Move the controllers that F5 ranked: `ClipInspectorController`, `PianoRollController`, `TrackEffectsModel`, `AutomationController`, `AssistController`, `MarkerSession`.
  5. Split the 12 properties of `TimelineModel` that share `timelineChanged`. Give each its own signal.
  6. Move the other listeners in groups. Each group lowers the connection count.
- **Files:** `src/model/TimelineModel.{h,cpp}`, new `src/model/ChangeSet.h`, `src/model/LaneClipModel.cpp`, `src/model/TrackListModel.cpp`, `src/model/TrackWindowModel.cpp`, plus the 34 files that connect to `timelineChanged`.
- **Metric:** One edit: 126 ms to below 20 ms for a clip move (estimate, to confirm with the A1 phase split). Signals for each edit: from 61 listeners called to only the listeners of the changed entity.
- **Risk:** Medium. A listener that needs a change but does not get one shows stale data. Keep a debug mode that emits the coarse signals as well and compares the visible state.
- **Lock:** Counters "JSON parses per edit", "dataChanged rows per edit" and "listeners called per edit". A ratchet on the number of connections to `timelineChanged` and `clipsChanged`: add a rule to `check_performance.py` that counts them for each file.

### A5. Typed edits and the note layer

- **Goal:** Note edits and clip gestures commit a patch on a typed snapshot. The piano roll draws notes in C++.
- **Work:**
  1. Add structural sharing to `nt::Timeline` (D2). Add typed notes to `nt::Clip`.
  2. Add a typed edit form to the registry next to the JSON form: `TypedEdit = (const Timeline&, payload) -> {snapshot, ChangeSet}`. The JSON form stays as the fallback for each edit that has no typed form.
  3. Register patch edits: `midi.moveNotes`, `midi.resizeNotes`, `midi.setNoteVelocities`, `midi.addNotes`, `midi.removeNotes`. Add typed forms of `move_clip` and `trim_clip`.
  4. Add `NoteLayerItem` (C++ `QQuickItem`, one geometry node for notes, one for the grid). It holds the drag overlay (D7) and does the hit test.
  5. Remove `liveNotes`, the `notes` list property and the note `Canvas` items from `PianoRollPanel.qml`.
- **Files:** `src/model/TimelineTypes.h`, `src/app/EditRegistry.h`, `src/midi/PianoRollController.{h,cpp}`, new `src/midi/NoteLayerItem.{h,cpp}`, new `src/midi/NoteEdits.cpp`, `qml/pianoroll/PianoRollPanel.qml`, `qml/pianoroll/Notes.js`.
- **Metric:**
  - Note drag release: 176 ms to below 8 ms (estimate).
  - Note drag frame: 2.71 ms of crossings to below 0.3 ms (estimate).
  - `setNotes` commit: 240 ms to below 5 ms for a patch of 1 to 50 notes (estimate).
  - `PianoRollPanel` functions that do not compile: 117 to below 40 (estimate), because most of them serve the Canvas.
- **Risk:** High. This is the largest slice. Split it: typed notes and patch edits first with the Canvas kept, then the layer item. The differential test in section 6 guards each edit.
- **Lock:** Budget "note drag release" and "note drag frame" in `budgets/ui-120hz.json`. Lower R5-canvas for `PianoRollPanel.qml` from 6. A geometry test for `NoteLayerItem` in the style of `tst_midinotelines.cpp`.

### A6. Markers, ruler and automation as layers

- **Goal:** Content that repeats more than 100 times is one node (rule 41). A zoom frame does no repaint in QML or `QPainter`.
- **Work:**
  1. Store typed markers on the snapshot. Draw ruler flags and lane blocks in one item each, with a binary search for the visible range. Remove both `Repeater` uses and the `markers` list property.
  2. Replace `MarkerSession::rows` with a `QAbstractListModel` for the markers panel.
  3. Convert `RulerCanvas` and `MonitorRulerCanvas` from `QQuickPaintedItem` to scene graph items.
  4. Convert `AutomationLaneView` and the loop-repeat `Canvas` in `ClipBody.qml`.
- **Files:** `src/ui/RulerCanvas.{h,cpp}`, `src/ui/MonitorMiniTimeline.{h,cpp}`, `src/ui/MonitorRulerCanvas.h`, `src/markers/MarkerSession.{h,cpp}`, new `src/markers/MarkerLayerItem.{h,cpp}`, `qml/Tracks/TimeRuler.qml`, `qml/markers/MarkerLane.qml`, `qml/markers/MarkersPanel.qml`, `qml/Tracks/automation/AutomationLaneView.qml`, `qml/Tracks/ClipBody.qml`.
- **Metric:** Items for 500 markers: 1,001 to 2 (measured count today). Zoom p50: 13.1 ms to below 7 ms (estimate). Marker edit: 1.62 ms to below 0.1 ms (estimate).
- **Risk:** Medium. Marker flags take pointer input today. The layer item needs a hit test and one shared hover and drag handler.
- **Lock:** Item count assert (rule 45). Lower R5-painted and R5-canvas. Zoom budget.

### A7. Clip delegate cost and reuse

- **Goal:** A clip that enters the window costs below 0.2 ms.
- **Work:**
  1. Use the A1 creation profile to find the cost of each part of the delegate.
  2. Reuse delegates. Replace the `Repeater` in `TrackLane.qml` with a pool, or a view that reuses items.
  3. Create hover-only and selection-only parts (fade grips, trim marks, take badge) for the hovered or selected clip only.
  4. Fix the functions that do not compile in `Clip.qml` and `ClipBody.qml`. Add type annotations and remove untyped JavaScript calls.
- **Files:** `qml/Tracks/TrackLane.qml`, `qml/Tracks/Clip.qml`, `qml/Tracks/ClipBody.qml`, `qml/Tracks/ClipFadeGrips.qml`, `qml/Tracks/TracksRegion.qml`, `src/model/LaneClipModel.cpp`.
- **Metric:** Scroll p95: to below 12 ms after A2 and A3 (estimate). Scroll max: 94.9 ms to below 20 ms (estimate). Zoom binding cost for 420 clips: 0.94 ms to 0.60 ms (measured in the microbench).
- **Risk:** Medium. A reused delegate can keep state from its last clip. Keep all state in the model (rule 8).
- **Lock:** Counter "delegates created per scroll frame". Scroll budget. A ratchet on functions that do not compile in the hot files, from `aotstats`.

Decision point after A7: if the scroll p95 is still above 8.3 ms on the GPU run, draw the clip chrome of a lane in one C++ item and keep QML only for the hovered and selected clips. Do not start this before the number requires it.

### A8. Undo and persistence at the boundary

- **Goal:** Undo, autosave and sync do no work in proportion to the document on the GUI thread.
- **Work:** Keep snapshots in the undo commands (D9). Make the JSON form of a snapshot on demand and cache it for each shared part. Check where `documentJson()` runs. Move a serialization on the GUI thread to a worker that receives the immutable snapshot.
- **Files:** `src/model/TimelineModel.cpp` (`DocumentCommand`, `rebaseHistory`, `documentJson`), the autosave module, `src/server/sync/`.
- **Metric:** Undo step: part of the 126 ms today, to below 2 ms (estimate). Memory for each undo step: to the size of the changed entity.
- **Risk:** High. `rebaseHistory` applies an external delta to each checkpoint. It needs a typed form. Do this slice last and keep the JSON path until the differential test passes for a full session log.
- **Lock:** `tst_autosave`, undo and redo cases in the differential test, counter "bytes kept per undo step".

### A9. Track, mixer and inspector rows

- **Goal:** The track header, the mixer strip and the effect controls read typed roles.
- **Work:** Add typed roles to `TrackWindowModel` (`color`, `volume`, `pan`, `automationMode`, `hasAutomation`). Make `TrackEffectsModel` a list model of effects. Replace `rowLive`, `rowDocument` and `rowState` with one row object that has typed properties. Cache `PanelRegistry::forSlot` for each slot.
- **Files:** `src/model/TrackWindowModel.{h,cpp}`, `src/wiring/w/TrackEffectsModel.{h,cpp}`, `src/audio/automation/AutomationController.{h,cpp}`, `src/edit/keyframes/ClipInspectorController.{h,cpp}`, `src/app/PanelRegistry.{h,cpp}`, `qml/Tracks/TrackHeader.qml`, `qml/effectcontrols/EffectControlsRow.qml`.
- **Metric:** Scroll copy: 6.34 MB to below 0.1 MB (estimate). Playback crossings with effect controls open: 1,494 calls per second to 0 (estimate).
- **Risk:** Low to medium. The frame gain is small (below 0.2 ms). The value is that the R3 count for hot paths reaches zero.
- **Lock:** Lower R3. Counter "crossing calls per playback frame = 0".

### Expected result after each stage (all estimates)

| Stage | Scroll p95 | Zoom p50 | Note drag release | One edit |
|---|---:|---:|---:|---:|
| Today (measured, software backend) | 63.9 ms | 13.1 ms | 176 ms | 126 ms to 137 ms |
| After A2 and A3 | about 25 ms | about 12 ms | about 165 ms | about 100 ms |
| After A4 | about 25 ms | about 12 ms | about 60 ms | below 20 ms |
| After A5 | about 25 ms | about 12 ms | below 8 ms | below 10 ms |
| After A6 and A7 | below 12 ms | below 7 ms | below 8 ms | below 8 ms |

The table uses the software backend. The 8.3 ms target applies to the GPU run of A1. The rule for the GUI thread is 4 ms (`PERFORMANCE.md` rule 1).

## 6. Agent parity

1. **One entry point.** The UI, `AgentBridge` and the server `edit_timeline` path all call a named edit in `EditRegistry`. A gesture commits through a named edit and never writes to the snapshot directly.
2. **The same payload.** Each typed edit takes the JSON payload that its name takes today. An agent tool does not change when an edit gets a typed form.
3. **A new patch edit is an agent tool on the same day.** `midi.moveNotes` and its group need a headless tool, a bridge entry and harness coverage in the same change as the UI gesture.
4. **A differential test proves parity.** For each registered edit name, a test applies a recorded payload through the JSON form and through the typed form. The test compares `documentJson()` and the `ChangeSet`. The test fails when a registered name has no payload fixture. That check makes the enumeration complete.
5. **External changes use the same notification.** A document that arrives from the server goes through the comparison of A4 and produces a `ChangeSet`. The UI does not reset when an agent edits one clip.
6. **Agents read through the codec.** A headless read gets JSON from the snapshot at the boundary. No QML view model is the source for an agent.
7. **The perf harness runs agent edits too.** `tst_timeline_perf` applies the same 40 edits through the agent path. The budget for one edit is the same for both paths.

## 7. What to stop

1. Stop work on the `property var` count as a performance project. Type only the hot delegates (A7). The measured gain is 0.3 ms per frame.
2. Stop adding an API that returns `QVariantMap`, `QVariantList`, `QJsonObject` or `QJsonArray` for an entity. The R3 ratchet already fails an increase.
3. Stop adding a connection to `timelineChanged` or `clipsChanged`. Use the change set.
4. Stop sending a full array for a small change (`setNotes`, `setControllers`, `MarkerSession::rows`).
5. Stop adding a `Canvas` or a `QQuickPaintedItem` for content that changes on scroll, zoom or a playback tick.
6. Stop adding a `Repeater` over a list that can grow (markers, notes, clips).
7. Stop putting a `Menu`, a `Popup` or a `ToolTip` in a row or a clip.
8. Stop keeping edit state in a JavaScript array during a gesture.
9. Stop reporting a frame time from the software backend as the 120 Hz result. Report counters, GUI-thread time and the GPU run.
10. Stop optimizing playback. It passes with a margin of 5 ms.

## 8. Open questions

- **Q1.** What is the phase split of the 126 ms edit? A1 answers it. The answer can move A3 before A2, or A8 before A5.
- **Q2.** How much of the scroll and zoom frame is software rasterization? The GPU run of A1 answers it.
- **Q3.** Does `documentJson()` run on the GUI thread for autosave and sync? This strategy did not check it.
- **Q4.** Can `rebaseHistory` work on typed snapshots? A8 depends on the answer.
