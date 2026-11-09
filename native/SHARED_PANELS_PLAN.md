# Shared native panels: execution plan

Do the tasks in order. Do one task at a time. Do not start a task until the
checks of the previous task pass. Do not run tasks in parallel.

## Goal

Make the media panels reusable across the native apps in `native/`:

- `NodeTool.Media`: the asset grid, the asset gallery, `SwipePager`, and the
  `AssetBrowser` C++ type.
- `NodeTool.Storyboard`: the storyboard board, the shot cards, and the shot
  media viewer.

The timeline preview and the timeline tracks stay in `native/timeline`.

## Rules

1. Do not commit. The user commits.
2. Do not change these files. They hold other uncommitted work by the user:
   - `native/timeline/src/render2d/*`
   - `native/timeline/scripts/package-macos-with-server.sh`
   - all files in `packages/agents`, `packages/websocket` and `scripts/`
3. Run test binaries only through `ctest`. A direct run of a test binary writes
   the real user preferences file
   `~/Library/Preferences/com.nodetool.Timeline.plist`.
4. Do not open visible app windows for checks. Tests run offscreen.
5. Follow the native design rules in `native/ui_primitives/AGENTS.md` and
   `native/ui_primitives/DESIGN.md`:
   - Use named tokens (`Ui.Metrics.*`, `Ui.Theme.*`) for sizes, colors,
     durations and z layers. Do not use number literals for these.
   - Animations use `Ui.Metrics.motionQuick` (150) or `Ui.Metrics.motionNormal`
     (200), and they respect `Ui.Theme.reducedMotion`.
   - A pointer handler that does an action needs an exception entry in
     `native/ui_primitives/tools/migration.toml`, or it must use a shared
     control.
   - A new QML file needs a classification for the design checker.
6. Never write "Claude Code" in code, comments or file names.
7. When you move a file, use `git mv`, so the history stays.

## Build and check commands

The build directory is:

```
B=/private/tmp/claude-501/-Users-mg-workspace-nodetool-media/e7ef4d44-fe89-4b89-85db-b3d6de82679b/scratchpad/build-model
```

If this directory does not exist, configure a new one with CMake and Ninja
from `native/timeline` and use that path for `B`.

- Build: `cmake --build "$B" --target nodetool-timeline`
- A new QML file triggers the CMake regenerate step. This step takes 5 to 10
  minutes. Wait for it. Do not stop it.
- In zsh, pass more than one target as an array:
  `T=(a b); cmake --build "$B" --target "${T[@]}"`
- Design check (run from the repository root):
  `python3 native/ui_primitives/tools/check_design.py --strict`
- Dependency check:
  `python3 native/ui_primitives/tools/check_dependencies.py`
- Tests: `ctest --test-dir "$B" -R "<regex>" --output-on-failure`
  - Dock: `dock`
  - Assets and library: `asset|librar`
  - Storyboard: `story|shot`
  - If ctest says a test binary is missing, build that target, then run ctest again.

"The standard checks" in this file means: the build passes, the design check
gives exit 0, the dependency check gives exit 0, and the three ctest groups
above pass.

## Task 1: Finish the swipe fix

Files: `native/timeline/qml/assets/SwipePager.qml`,
`native/timeline/qml/assets/AssetGallery.qml`,
`native/timeline/qml/storyworkspace/ShotMediaViewer.qml`.

Status: the user reported that a trackpad swipe in the gallery "hangs". The
current fix ends a swipe on `Qt.ScrollMomentum`, on `Qt.ScrollEnd`, or after
250 ms with no wheel events (the `idle` Timer). A temporary diagnostic line is
at the start of `trackpadWheel`:

```
console.log("swipe-diag", Date.now(), event.phase, ...)
```

Steps:

1. Ask the user to swipe in the gallery and report if the hang still occurs.
2. If the user has a log, read the `swipe-diag` lines in `$B/app.log`.
   Find the phase sequence of a swipe that hangs. Look for a missing
   `ScrollEnd`, a `settle` animation that does not finish, or long gaps
   between events (main thread blocked by an image decode).
3. Fix the cause. If the gaps come from a decode, make sure each `Image` that
   can show during a swipe has `asynchronous: true` and a `sourceSize`.
4. Remove the `swipe-diag` line.
5. Run the standard checks.

Done when: the user confirms the swipe does not hang, and the diagnostic line
is gone.

## Task 2: Storyboard card animations

Files: `native/timeline/qml/storyworkspace/ShotCard.qml`,
`native/timeline/qml/storyworkspace/StoryboardBoard.qml`.

Add these animations. All use the named durations and respect reduced motion.

1. A staggered fade-in when a card appears. Use the card index for the delay,
   and cap the delay so a long board does not wait.
2. A `Behavior` on the card border color.
3. A fade-in when the still image loads (`status === Image.Ready`).
4. A small zoom of the image on hover (scale about 1.03, clipped by the card).
5. A fade for the hover toolbar, in place of an instant show and hide.

Do not change the card size or layout. An animation must not resize other items.

Done when: the standard checks pass.

## Task 3: Remove the timeline dependencies (no file moves)

Goal: after this task, no file that moves in Task 4 or Task 5 imports
`NodeTool.Timeline` or uses a timeline-only type.

Files with a timeline dependency now:

- `qml/assets/AssetDropOverlay.qml`, `AssetExplorer.qml`, `AssetPreview.qml`,
  `AssetGallery.qml`
- `qml/storyworkspace/ShotEditViewer.qml`, `ShotClipPlayer.qml`,
  `ShotCard.qml`, `ShotMediaViewer.qml`

Steps:

1. List every `NodeTool.Timeline` symbol each of these files uses
   (`TimelineMetrics.*`, `PreviewCompositor`, the `timeline` object and others).
   Write the list into this file under "Task 3 notes" before you change code.
2. For each `TimelineMetrics` value that is generic (sizes, spacing), add a
   token to `Ui.Metrics` in `native/ui_primitives` and use it. Keep
   timeline-specific values, such as `dockMaximizedLayer`, in `TimelineMetrics`.
3. For `PreviewCompositor` in `AssetGallery.qml`: give the gallery a property
   (for example `property Component videoPreview`) that the host app sets. The
   timeline app passes a component that wraps `PreviewCompositor`. The gallery
   shows a still when the property is null.
4. For `ShotClipPlayer` and the `timeline` object in the storyboard files: use
   the same pattern. The storyboard gets a `property Component clipPlayer` from
   the host.
5. `AssetExplorer.qml` and `AssetDropOverlay.qml` are the timeline-side host of
   the library. If they depend on timeline editing (drop onto tracks), keep them
   in `native/timeline` and do not move them in Task 4.
6. Run the standard checks after each file.

Done when: `grep -n "NodeTool.Timeline\|TimelineMetrics" ` on the files that
will move gives no result, and the standard checks pass.

### Task 3 notes

- `qml/assets/AssetDropOverlay.qml` (stays in `native/timeline`):
  - `import NodeTool.Timeline`
  - `TimelineMetrics.toolbarHeight`, `TimelineMetrics.rulerHeight`
  - `SourceViewerState` (`place`, `lastError`, `canPlace`)
- `qml/assets/AssetExplorer.qml` (stays in `native/timeline`):
  - `import NodeTool.Timeline`
  - `TimelineMetrics.trackHeaderWidth` -> replaced by `Ui.Metrics.panelWidth`
  - `TimelineMetrics.trackHeight`
  - `AssetBrowser` (`browserModel`, `destinationBrowser`)
  - `property var timeline: null`
- `qml/assets/AssetPreview.qml` (stays in `native/timeline`):
  - `import NodeTool.Timeline`
  - `CandidatePreview` (`review`)
  - `PreviewCompositor` (`objectName: "assetPreviewPicture"`)
  - `root.browser.timeline` (`onTimelineChanged`, `onDocumentReplaced`)
- `qml/assets/AssetGallery.qml` (moves in Task 4 to `NodeTool.Media`):
  - `import NodeTool.Timeline` -> removed
  - `CandidatePreview` (`review`) and `PreviewCompositor` (`objectName: "assetGalleryVideo"`) -> replaced by `property Component videoPreview: null` passed from host
  - `TimelineMetrics.trackHeaderWidth` -> replaced by `Ui.Metrics.panelWidth`
  - `TimelineVisuals.clipAccent("audio")` and `TimelineVisuals.clipAccent(thumb.type)` -> replaced by `Ui.Text` tones (`Ui.Text.Success`, `Ui.Text.Info`)
- `qml/assets/AssetGrid.qml` (moves in Task 4 to `NodeTool.Media`):
  - `import NodeTool.Timeline` -> removed
  - `required property AssetBrowser browser` -> `required property var browser`
  - `LibraryScrub` (`clear()`, `leave(...)`) -> replaced by `property var scrub: null` and `property Component scrubOverlay: null` passed from host
  - `LibraryButton` -> replaced by `Ui.EditorButton` (`density: Ui.EditorButton.Compact`)
- `qml/assets/AssetItem.qml` (moves in Task 4 to `NodeTool.Media`):
  - `import NodeTool.Timeline` -> removed
  - `required property AssetBrowser browser` -> `required property var browser`
  - `LibraryScrub`, `LibraryScrubFrame`, and `TimelineVisuals.overlay` -> replaced by `property var scrub: null` and `property Component scrubOverlay: null` passed from `AssetGrid`
  - `TimelineVisuals.clipAccent(tile.mediaType)` -> replaced by `Ui.Text` tones (`Ui.Text.Success`, `Ui.Text.Info`)
- `qml/storyworkspace/ShotClipPlayer.qml` (stays in `native/timeline`):
  - `import NodeTool.Timeline`
  - `property var timeline: null`
  - `CandidatePreview` (`review`), `PreviewCompositor`
- `qml/storyworkspace/ShotEditViewer.qml` (moves in Task 5 to `NodeTool.Storyboard`):
  - `property var timeline: null` and `Loader { source: "ShotClipPlayer.qml" }` -> replaced by `property Component clipPlayer: null` and `sourceComponent: viewer.clipPlayer`
- `qml/storyworkspace/ShotCard.qml` (moves in Task 5 to `NodeTool.Storyboard`):
  - `property var timeline: null` and `Loader { source: "ShotClipPlayer.qml" }` -> replaced by `property Component clipPlayer: null` and `sourceComponent: card.clipPlayer`
- `qml/storyworkspace/ShotMediaViewer.qml` (moves in Task 5 to `NodeTool.Storyboard`):
  - `property var timeline: null` and `Loader { source: "ShotClipPlayer.qml" }` -> replaced by `property Component clipPlayer: null` and `sourceComponent: viewer.clipPlayer`
- `qml/storyworkspace/ShotTakesGallery.qml`, `ShotEditor.qml`, `StoryboardBoard.qml` (move in Task 5 to `NodeTool.Storyboard`):
  - `timeline` property/bindings forwarded to `ShotMediaViewer`, `ShotEditViewer`, and `ShotCard` -> replaced by `property Component clipPlayer: null` forwarded from `StoryWorkspaceEditor.qml`
- `qml/storyworkspace/ShotRenderDialog.qml` (moves in Task 5 to `NodeTool.Storyboard`):
  - Unused `import NodeTool.Timeline` -> removed

## Task 4: Make the `NodeTool.Media` package

Use `native/model-picker` as the template. Its `CMakeLists.txt` shows the
pattern: a static library, `qt_add_qml_module` with `URI NodeTool.ModelPicker`,
a link to `nodetool_ui_primitives`, and tests that run offscreen.

Steps:

1. Make `native/media/` with `CMakeLists.txt`, `qml/`, `src/` and `tests/`.
   Module URI: `NodeTool.Media`. Target: `nodetool_media`.
2. `git mv` these files into the package:
   - QML: `SwipePager.qml`, `AssetGallery.qml`, `AssetGrid.qml`,
     `AssetItem.qml`, and the helper `.js` files that only these use
     (check with grep before you move one).
   - C++: `native/timeline/src/assets/AssetBrowser.{h,cpp}` and their test
     `tst_assetbrowser.cpp`, if `AssetBrowser` does not depend on timeline types.
     If it does, stop and write the blocking dependency into this file.
3. In `native/timeline`, add the package with `add_subdirectory` (guarded by
   `if(NOT TARGET nodetool_media)`, as model-picker does), link
   `nodetool_media`, and remove the moved files from
   `src/assets/module.cmake` and the QML glob.
4. Add `import NodeTool.Media` to each timeline QML file that uses a moved type.
5. Update the `migration.toml` exception paths and the design classifications
   for the moved files.
6. Register the new package with `check_dependencies.py` so it rejects an
   import of `NodeTool.Timeline` from `native/media`.
7. Run the standard checks. Also run the moved asset tests through ctest.

Done when: the standard checks pass and `native/media` has no reference to
`NodeTool.Timeline`.

### Task 4 notes

- `AssetBrowser.{h,cpp}` and `tst_assetbrowser.cpp` stay in `native/timeline` because `AssetBrowser` directly depends on timeline types:
  - `model/TimelineModel.h` (`Q_PROPERTY(TimelineModel* timeline ...)`, `TimelineModel::documentReplaced`, `TimelineModel::clipsChanged`, `undoStack()`, `commitEdit`, `applyEdit`, `documentGeneration()`, `snapshot()`, `queueMedia`, `queueLinkedAudio`, `reconcileLinkedAudio`, `protectDocumentMedia`)
  - `model/TrackWindowModel.h` (`trackAt(TrackWindowModel* rows, double contentY)`)
  - `model/Timeline.h` (`std::optional<nt::Clip> media`)
  - `edit/EditActions.h`, `assets/AssetClip.h`, `assets/AssetDrop.h`, `assets/AssetMedia.h`, `assets/AssetAudio.h`, `assets/AssetImport.h`, `assets/AssetDuration.h`
  - `server/AutosaveController.h` (`nt::server::SaveTarget`, `nt::server::ServerClient`, `nt::server::serverSaveTarget`)
- `AssetListModel.{h,cpp}` has no timeline dependency and moves to `native/media/src/AssetListModel.{h,cpp}`.
- `AssetContext.js` is used by 16 files in `native/timeline/qml/` (for `editorFor` and `itemNamed`), so `AssetContext.js` stays in `native/timeline/qml/assets/AssetContext.js` and `native/media/qml/AssetContext.js` provides `itemNamed` and `thumbSize`.

## Task 5: Make the `NodeTool.Storyboard` package

Same steps as Task 4, with:

- Directory `native/storyboard/`, URI `NodeTool.Storyboard`, target
  `nodetool_storyboard`.
- Files: `StoryboardBoard.qml`, `ShotCard.qml`, `ShotMediaViewer.qml`,
  `shotDraft.js`, and the other `storyworkspace` files that have no timeline
  dependency after Task 3. Check each file with grep before you move it.
- The package links `nodetool_media`, because `ShotMediaViewer` uses
  `SwipePager`.
- `ShotClipPlayer.qml` stays in `native/timeline`, because it plays through the
  timeline. The timeline app passes it as the `clipPlayer` component.
- Move the storyboard tests that test only moved code. Keep the tests that
  need the timeline (for example `tst_storyboardassembly`) in the timeline.

Done when: the standard checks pass, the `story|shot` ctest group passes, and
`native/storyboard` has no reference to `NodeTool.Timeline`.

## Task 6: Final report

Write a short report for the user:

1. The files that moved, and the new packages.
2. The output of the standard checks.
3. All items that you did not do, and the reason for each.

Do not commit.
