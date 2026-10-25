# Native Timeline: Plan for the Remaining Gaps

This plan covers the features that the native editor still lacks compared
with the web editor, inside the agreed scope: video and audio clip editing,
no AI features. [PLAN.md](PLAN.md) covers milestones M0 to M6, which are done
apart from the reference-machine checks. The gap list comes from a code check
against `web/src/components/timeline/` on the `feat/native-timeline` branch.

The work packages are written for a multi-agent workflow. The
machine-readable copy is [gaps-manifest.json](gaps-manifest.json). A workflow
reads it through `args`. This document is the source of truth when the two
differ.

## Rules for every package

- The web editor is the reference. Each package names its web files. Copy
  the behaviour, the layout, the sizes and the wording. Where a pure
  TypeScript function exists, test against it as an oracle, the way
  `scripts/op-conformance.mjs` and `scripts/plan-conformance.mjs` do. Do not
  port a test expectation from the native code.
- Keep the QML component names and nesting the same as the React components.
- Edits change the raw clip JSON (DESIGN D4). Each user action is one undo
  command. A gesture is one command, pushed on release.
- The playhead rule holds: playback and seeks update no model, no lane and no
  delegate.
- Verify headless: ctest, offscreen stills through `QQuickRenderControl`, and
  the Node scripts. Never open a visible window and never play sound. Put a
  check that needs a window, a speaker or a display into
  `scripts/window-checks.sh`.
- Never send a write to the user's server on port 7777. Server tests use the
  scratch server from `scripts/scratch-server.mjs`, with a fresh
  `SECRETS_MASTER_KEY`.
- Build with `nice -n 10 cmake --build <dir> -j 2` and run ctest with `-j 2`.
  Do not measure performance while the load average is above 10.
- Write the failing test first for each bug fix. Prove each new check fails
  once on bad input.
- Follow the memory-safety rules in new and changed code. Each FFmpeg
  object, VA surface, Vulkan handle and file descriptor has one owner: a
  `std::unique_ptr` with a deleter or a move-only class. Every
  `connect()` with a lambda passes a context object, so the connection ends
  with its receiver. A lambda that can outlive an object holds a `QPointer`,
  never a raw pointer. A raw `new` needs a Qt parent; otherwise use
  `std::make_unique`. Pass buffers as `std::span`, not a pointer and a
  length, and use `std::bit_cast` instead of `reinterpret_cast` for type
  punning.
- Do not commit. The integration stage commits.

## How the work runs in parallel

1. **Wave 0 runs alone.** Package S1 adds the extension points that the other
   packages plug into. Without it, every package edits `CMakeLists.txt`,
   `src/main.cpp`, `TimelineModel` and `TimelineEditor.qml`, and the merges
   conflict.
2. **Each later package runs in its own git worktree,** branched from the
   integration branch after the previous wave. One package owns its folders.
   It touches shared files only through the S1 extension points.
3. **Each package has four stages:** implement, headless verify, Codex review
   (`codex exec -m gpt-6-astra -s read-only`), then fix the findings. A
   package is ready when its exit checks pass after the fixes.
4. **The integration stage merges one package at a time** into
   `feat/native-timeline`, in manifest order. After each merge it builds,
   runs the full ctest, the plan check and the op check, and commits. A merge
   that fails goes back to its package. After package V has merged, the
   integration stage also runs the sanitizer ctest (V's `sanitize` preset)
   on the merged tree. A report that is not in V's baseline file fails the
   merge.
5. **At most 4 packages build at the same time.** The workflow runs a wave in
   chunks of 4. Earlier runs with 4 parallel builds at `-j 3` reached a load
   average of 205.

## Wave 0: extension points

### S1: Seams for parallel work

Goal: let each later package add code without editing a shared file.

- CMake: each `src/<module>/` folder gets a `module.cmake` that lists its
  sources and tests. The top-level `CMakeLists.txt` includes every
  `src/*/module.cmake`. Move the existing modules to this form with no
  behaviour change.
- CLI modes: a registry (`src/app/CliModes.h`). A package adds a mode by
  registering it in its own module. `main.cpp` dispatches through the
  registry.
- Edit commands: `TimelineModel::applyEdit(name, payload)` with a registry of
  named edit functions. Each function maps the raw document to a new raw
  document. Undo, the revision and the lane update stay in one place.
  Register the existing M4 operations through it.
- Panels: a panel host in `TimelineEditor.qml` with named slots
  (`left`, `right`, `bottom`, `overlay`), filled from a QML registry. The
  Inspector, the asset browser and the timeline list plug into it. This is
  not the full dock (package Q).
- Menus: a context-menu registry. A package adds menu items for a target kind
  (clip, track, lane, ruler, asset) with an action name, a label, a shortcut
  and an enabled rule.
- Inspector primitives: copy `Inspector/InspectorPrimitives.tsx` and
  `InspectorPrimitives.helpers.ts` (section, row, number field with drag,
  colour, select, toggle) as QML components, so the Inspector packages share
  them.
- Oracle runner: let `scripts/op-conformance.mjs` load extra suites from
  `scripts/conformance/suites/*.mjs`, so each package adds its own suite.

Exit: the build, ctest, the plan check and the op check give the same results
as before the change. A test package that adds a module, a CLI mode, an edit,
a panel and a menu item touches no shared file (prove it with `git diff
--stat`).

## Wave 1: independent packages

Wave 1 has 20 packages. They depend only on S1. Package V starts first and
merges first, so the sanitizer gate applies to every later merge.

### A: Open and create timelines (F5)

- Web: `TimelineListPanel.tsx`, `TimelineDocumentBar.tsx`,
  `ProjectSettingsDialog.tsx`, `web/src/components/projects/`.
- Server: `timeline.list`, `timeline.create`, `timeline.delete`, the
  `projects` router.
- Native: `src/server/` (list and create calls), `qml/TimelineListPanel.qml`,
  `qml/ProjectSettingsDialog.qml`. An open without a command-line argument
  shows the list.
- Exit: list, open, create (with the web defaults for size, rate and tracks),
  rename and delete work against the scratch server. Project settings change
  the canvas and the rate with undo. A screenshot matches the web layout.

### B: Media import and the asset browser (F1)

- Web: `web/src/components/assets/AssetExplorer.tsx`, `AssetGrid*`,
  `AssetItem.tsx`, `web/src/serverState/useAssetUpload.ts`,
  `AddClipMenu.tsx`, `dnd/assetToClipAdapter.ts`, `packageClipMedia.ts`.
- Server: `assets.list`, `assets.get`, the upload route that
  `useAssetUpload.ts` calls, `assets.ensureProxy`.
- Native: `src/assets/`, `qml/assets/`. Upload by file dialog and by drag of
  files from the OS. Drag of an asset onto a lane uses the drop modes of M4.
- Exit: an imported file appears as an asset, gets a proxy when the server
  makes one, and drops as a clip with the same JSON that
  `assetToClipAdapter.ts` makes (oracle test). A dropped video with sound
  makes the linked video and audio pair as in the web.

### C: Track management (F2)

- Web: `Tracks/AddTrackButton.tsx`, `Tracks/TrackHeader.tsx` (menu, rename,
  colour, delete, reorder), `TimelineStore.ts` track actions.
- Native: edit commands for add, delete, rename, reorder, colour, mute, solo,
  lock, hide and height. Wire the "+" button.
- Exit: each action matches the web store action in the store differential.
  Reorder by drag matches the web. Undo restores the document.

### D1: Inspector, transform and keyframes (F3)

- Web: `Inspector/TimelineInspector.tsx`, `InspectorMotionFields.tsx`,
  `KeyframedPropertyRow.tsx`, `keyframeRows.ts`, `ClipAnimations.tsx`,
  `Tracks/ClipKeyframeDiamonds.tsx`.
- Native: `qml/Inspector/`, the right panel slot.
- Exit: position, scale, rotation, opacity, anchor and the 2.5D fields edit
  with undo. The stopwatch, add, delete, step, retime by drag and easing
  match `keyframeRows.ts` (oracle). The keyframe diamonds on the clip drag
  the same way. The preview shows the change in the next frame.

### D2: Inspector, audio (F3)

- Web: `Inspector/ClipAudioEffects.tsx`, `ClipAudioDrive.tsx`,
  `clipDialogs/AudioGainDialog.tsx`, `fadeShapes.ts`,
  `Tracks/ClipFadeShapeMenu.tsx`.
- Exit: gain, pan, fade lengths and the four curves edit with undo. The fade
  grips on the clip match. `check-mix.mjs` passes on the edited documents.

### D3: Inspector, speed and time remap (F3)

- Web: `Inspector/ClipTimeRemap.tsx`, `clipDialogs/SpeedDurationDialog.tsx`,
  `packages/timeline/src/clipSpeed.ts`, the time-remap code.
- Exit: speed, reverse, keep pitch, duration and the remap curve match the
  web operations (oracle). The preview and the mix follow the new timing.

### D4: Inspector, transitions (F3)

- Web: `Inspector/ClipTransitionSection.tsx`, the transition code in
  `packages/timeline/src/`.
- Exit: type, length, easing and parameters edit with undo. The plan check
  passes on documents edited this way.

### D5: Inspector, crop and reframe (F3)

- Web: `Inspector/ClipReframe.tsx`, `packages/timeline/src/crop.ts`,
  `preview/ReframeFocusOverlay.tsx`.
- Exit: crop edges, fit mode and the reframe focus match the web. The
  compositor draws the crop (golden check against `timeline render
  --stills`).

### E: Export (F4)

- Web: `ExportVideoDialog.tsx`, `render/TimelineRenderer.ts`,
  `render/renderAudio.ts`, `render/encodeAudio.ts`, `canEncodeMp4.ts`.
- Native: `src/export/`. Render frames through the compositor offscreen,
  mix the audio with the M3 mixer, and encode with FFmpeg (H.264 with
  VideoToolbox where present, AAC) into MP4. Progress, cancel, and the same
  presets as the web dialog.
- Exit: an export of each media fixture matches `nodetool timeline render`
  at 40 dB or better per checked frame. The audio matches the offline mix.
  The duration and the frame count are exact. A cancel leaves no partial
  file.

### F: Clipboard and structure (F6)

- Web: `stores/timeline/clipboardOps.ts`, `pasteAttributes.ts`,
  `clipDialogs/PasteAttributesDialog.tsx`, the group actions in
  `TimelineStore.ts`, `Tracks/RubberBandOverlay.tsx`, `GroupBracket.tsx`.
- Exit: copy, cut, paste, paste attributes, duplicate, Alt-drag copy, group,
  ungroup, marquee selection and gap selection match the web (store
  differential, oracle on `clipboardOps.ts`). Group targets for move, trim
  and delete stop being refused.

### H: Transform gizmo (F8)

- Web: `preview/TransformGizmoOverlay.tsx`,
  `preview/ClipTransformContextMenu.tsx`.
- Exit: drag, scale and rotate a clip in the program monitor with the web's
  handles and snapping. One gesture is one undo command. A drag on an
  animated property keys it, as in the web.

### I: Text, shapes and captions (F9, part 1)

- Web: `preview/textRender.ts`, `textMeasure.ts`, `fontLoading.ts`,
  `shapeRender.ts`, `captionRender.ts`, `Inspector/ClipTextStyleSection.tsx`,
  `ClipShapeSection.tsx`, `ClipCaptionStyle.tsx`, `FontPicker.tsx`.
- Native: `src/render2d/`. Rasterize text and shapes into textures (Qt font
  engine with the web's fonts) and draw them as layers. Replace the flex
  fallback text measure with real font metrics (the `MeasureText` hook).
- Exit: the 7 shipped examples match `timeline render --stills` at 35 dB or
  better on frames with text and shapes. The plan check keeps passing.
  Measure `serein` on the M0 counters against the web (a window check).
  This package decides whether native beats the web on complex scenes.

### J: Effects, adjustments, masks and blend modes (F9, part 2)

- Web: `preview/gpu/compositor.ts`, `preview/maskRender.ts`,
  `preview/matteOverlay.ts`, `Inspector/ClipAdjustments.tsx`,
  `ClipEffectsList.tsx`, `ToneCurveEditor.tsx`, `ClipMaskMatte.tsx`, the
  track video effects in `packages/protocol/src/api-schemas/timeline.ts`.
- Native: shaders in `shaders/effects/`, an effect chain in the compositor.
- Exit: each effect, blend mode, mask and matte has a golden fixture at 40 dB
  or better against the export. The group blend mode and group effects from
  D35 are drawn.

### K: Range playback and live audio edits (F11, F12)

- Web: `preview/PlaybackClock.ts`, `playbackSync.ts`, `TimelinePlaybackStore.ts`.
- Exit: loop, play in to out and J/K/L shuttle speeds match the web. An edit
  during playback changes the sound within one audio block (headless mix
  test).

### L: Keyframes on split and trim (F13)

- Web: the animation split code in `packages/timeline/src/` that the 7
  refused op-conformance cases test.
- Exit: the 7 expected failures in `op-conformance.mjs` pass, and no
  refusal remains for source-anchored curves.

### M: Sync lock and track targeting (F14)

- Web: the targeting and sync-lock code in `TimelineStore.ts` and the track
  header.
- Exit: ripple, insert and delete respect targets and sync lock as in the
  web (store differential).

### N: Tempo, bars and beat snapping (F15)

- Web: `Tracks/TimeRuler.tsx` (Bars mode), the grid-division select,
  `packages/timeline/src/beats.ts`.
- Exit: the Bars ruler, the grid select and beat snapping match the web
  (oracle on `beats.ts`).

### P1: Audio effects (F16, part 1)

- Web: `daw/fx/`, the track and clip audio effects in the protocol schema,
  `preview/audioEffectNodes.ts`.
- Exit: gain, EQ, filter, compressor, echo, reverb and distortion run in the
  native mixer and match an offline web render within a stated tolerance.
  The effect UI matches `FxControls.tsx`.

### R: App shell (F18)

- Web: the app menus and settings in `web/src/components/` (find the
  timeline route's menu and the global settings).
- Exit: macOS menu bar (File, Edit, View, Playback, Help) with the keymap's
  shortcuts, preferences (keyboard layout, cache folder and budget, decoder
  mode, audio device), and recent timelines.

### V: Memory-safety tooling

Goal: find memory and threading defects with tools, not reviews. The Linux
bring-up crashed on a lambda that kept a pointer to a destroyed compositor,
and the open decode findings are about Vulkan and VA handles freed without
their release. No sanitizer, static analysis or hardening flag covered
either.

- Sanitizers: a CMake option `NT_SANITIZE` (`address,undefined` or
  `thread`) in `cmake/Sanitizers.cmake`, and CMake presets `sanitize` and
  `tsan`. Suppression files for Qt, Mesa and the NVIDIA driver go in
  `tools/sanitizers/`. Qt is not built with TSan, so the `tsan` run covers
  the threaded units (source pool, FFmpeg source, CPU counter, audio engine,
  easing cache) and suppresses reports inside Qt itself.
- Baseline: `tools/sanitizers/baseline.md` lists each report that the first
  run finds in a file that another wave 1 package owns: file, stack, owner
  package. V fixes the reports in files that no wave 1 package owns. A
  package that owns a baseline entry fixes it and removes the entry.
- Hardening in every build: `-D_GLIBCXX_ASSERTIONS` (libstdc++) and
  `_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_FAST` (libc++),
  `-D_FORTIFY_SOURCE=3` in optimized builds, `-fstack-protector-strong`,
  `-ftrivial-auto-var-init=zero`. Set them in `cmake/Hardening.cmake`.
- Static analysis: `.clang-tidy` with `bugprone-*`, `clang-analyzer-*` and
  `cppcoreguidelines-owning-memory`, and GCC's `-Wdangling-reference`.
  Clang thread-safety annotations (`GUARDED_BY`) with `-Wthread-safety` on
  the mutex-protected classes go in a header in `src/platform/`. Existing
  warnings go in a baseline, and new code adds none.
- Fuzzing: libFuzzer targets for the timeline JSON parser and media probing
  in `tests/fuzz/`, built only with Clang.
- CI: Linux jobs in `.github/workflows/native-timeline.yml` for the
  `sanitize` and `tsan` presets on lavapipe. Do not start CI.

Exit: the `sanitize` and `tsan` ctest runs report nothing outside the
baseline. Each tool fails once on a planted defect (a use after free, an
out-of-bounds `operator[]` under hardening, a data race, a fuzz crash), and
the plant is removed again. The full checks pass with hardening on. Each
fuzz target runs 10 minutes without a new crash. clang-tidy reports nothing
outside its baseline.

## Wave 2: packages that need wave 1

| Package | Needs | Scope |
|---|---|---|
| G: Context menus (F7) | C, D2, F | Copy `Tracks/ClipContextMenu.tsx` and the lane, track and ruler menus through the S1 menu registry. Each item runs the same action as its shortcut. |
| O: Source viewer (F10) | B | Copy `SourceViewerPanel.tsx` and `sourceEdit.ts`: mark in and out on an asset, then append, insert or overwrite. |
| D6: Inspector, adjustments and effects UI (F3) | J | The Inspector sections for colour, tone curve and the effect list. |
| P2: Automation and mixer (F16, part 2) | P1, M | `Tracks/automation/`, `daw/mixer/`. MIDI and instruments stay out of scope. |
| Q: Dock and workspaces (F17) | A, B, D1 | Copy `web/src/components/dock/` and `TimelineDockLayout.ts`: movable panels and the built-in workspaces. |

## Wave 3: integration and parity review

1. Merge the last packages and run the full checks.
2. Run a parity review with three lenses in parallel (behaviour, layout,
   data safety). Each lens compares the native app with the web editor
   feature by feature and lists the differences that remain.
3. Run a completeness critic: what did no package cover?
4. Add the new window checks to `scripts/window-checks.sh`.

## Out of this plan

- F19, the signed and notarized macOS app: it needs the user's Apple
  developer identity. Windows and Linux reference-machine benches: they need
  those machines or a CI push, which is the user's decision.
- AI features: generation, AI edit, line delivery, image to video, extend,
  the assistant, the transcript and storyboard panels.
- MIDI clips and instruments.

## Risks

- R1: wave 1 is wide. Packages D1 to D5 share the Inspector panel. S1's
  primitives and slot rule keep each section in its own QML file.
- R2: packages I and J both change the compositor. I adds layer sources and
  J adds shader stages. Merge I first. J rebases on it.
- R3: oracle coverage differs per package. A package with no pure TypeScript
  function to test against (H, Q, R) relies on screenshots and the web
  source. Its review must check the behaviour by reading the web code.
- R4: export parity depends on the server render. If `timeline render` and
  the web exporter differ, the web exporter is the reference.
- R5: the first sanitizer run will report defects in code that is already
  merged, some in files that other wave 1 packages own. The baseline keeps
  those reports from blocking unrelated merges. The owning package fixes
  them. The integration stage fails only on new reports.
