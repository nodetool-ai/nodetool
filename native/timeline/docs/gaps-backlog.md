# Gap plan backlog

Only P0 and P1 review findings block a merge in the gap run. Every P2 finding
still open in a package's last Codex review is listed here when the package
merges. A package or a later fix round closes an entry and moves it to
[Closed](#closed) with the commit that fixed it.

Review reports are in `/home/mg/Projects/nodetool-gaps/reviews/` on the Linux
run machine. "Package P1" and "package P2" are plan packages, not severities.

## Open

| ID | Severity | Source | Location | Finding | Owner |
|---|---|---|---|---|---|
| B1 | P2 | S1-r6 F1 | `qml/Tracks/TracksRegion.qml:187` | The add-track "+" button has no click handler or insertion hook. Package C owns `AddTrackButton.qml`, but nothing instantiates it, and `TracksRegion.qml` has no owner. | C (owns `TracksRegion.qml`; wires "+" and adds a header-actions slot for later packages) |
| B2 | P2 | S1-r6 F2 | `src/audio/Mixer.cpp:168` | Audio processing has no effect hook. `VoicePlan` and `mixBlock` write samples after gain, fade and pan, so package P1's effects in `src/audio/effects/` cannot run without editing shared mixer code. | P1 (owns `Mixer.cpp` and `Mixer.h`; adds the effect hook that package P2 builds on) |
| B6 | P2 | pkg-V-r1 F1 | `src/ui/MediaPreviews.cpp:156` | `mediaVersionKey(path)` runs synchronous `QFileInfo` metadata queries before the bounded helper starts. A stalled filesystem lookup cannot be cancelled or timed out, so two stalls exhaust the preview pool. | unassigned |
| B7 | P2 | pkg-V-r1 F2 | `tools/sanitizers/clang-tidy-baseline.mjs:34` | The baseline drops diagnostic locations and compares file/check/message strings. A new occurrence of an already-baselined warning passes as zero additions. | V |
| B8 | P2 | pkg-V-r1 F3 | `src/platform/ThreadSafety.h:6` | The thread-safety annotations and lock wrappers are used by no production class, so removing a required lock from a mutex-protected class produces no warning. | V |
| B9 | P2 | pkg-C-r1 F1 | `qml/Tracks/TracksRegion.qml:237` | Drag reordering is not implemented: dragging a track's grip above another does nothing. The differential test calls the native reorder command directly, so it cannot detect the missing gesture. | C |
| B10 | P2 | pkg-C-r1 F2 | `qml/Tracks/TracksRegion.qml:242` | The visibility, lock, mute, solo and delete buttons in the track header have no action handlers and are not connected to the new track commands. | C |
| B11 | P2 | pkg-C-r1 F3 | `qml/Tracks/TracksRegion.qml:240` | A track's authored height cannot be changed in the UI. No resize handle exists, and the height slider changes global vertical zoom, not the track's `heightPx`. | C |
| B12 | P2 | pkg-D1-r1 F1 | `qml/Inspector/KeyframeClipDiamonds.qml:2` | No production QML instantiates the clip keyframe diamonds or connects their seek and retime signals, so keyframes cannot be retimed on the timeline clip. Only the tests instantiate the component. | D1 |
| B13 | P2 | pkg-D1-r1 F2 | `src/edit/keyframes/ClipInspectorController.cpp:99` | Past the clip's end, `playheadMs()` returns `-1` and `rowState()` samples at zero, so the inspector shows the first value, disables Previous, and enables a Next that does nothing. The web shows the endpoint value and enables Previous. | D1 |

## Closed

| ID | Closed by | Commit |
|---|---|---|
| B3 | Package V merge (fix-decode-r3 F1, confirmed fixed by pkg-V-r1) | b3246ba7cb |
| B4 | Package V merge (fix-ui-r3 F1, confirmed fixed by pkg-V-r1) | b3246ba7cb |
| B5 | Package V merge (dropped-readback leak, confirmed fixed by pkg-V-r1) | b3246ba7cb |
