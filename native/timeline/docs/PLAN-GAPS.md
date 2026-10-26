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
- Load the modern-cpp skill
  ([.agents/skills/modern-cpp/SKILL.md](../../../.agents/skills/modern-cpp/SKILL.md))
  before writing C++. Its NodeTool Project Rules section says where this
  plan overrides it.
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
  `module.cmake` under `src/` at any depth (`file(GLOB_RECURSE ...
  CONFIGURE_DEPENDS src/module.cmake)`), in sorted path order. A nested
  module such as `src/preview/transitions/` has its own `module.cmake`, and
  its parent's `module.cmake` does not list it. Wave 1 packages put their
  modules in nested folders (`src/edit/tracks/`, `src/preview/crop/`,
  `src/preview/transitions/` and others), which a one-level
  `src/*/module.cmake` glob misses. Move the existing modules to this form
  with no behaviour change.
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
- Server writes: `ServerClient` gets the write interface that packages A, B
  and T share. `mutate(procedure, input)` stays the tRPC JSON write.
  `upload(json, filePath, contentType)` sends the multipart
  `POST /api/assets` that `AssetStore.ts` and the `upload` helper in
  `scripts/scratch-server.mjs` send: a `json` part with the asset fields and
  a `file` part with the file. It returns the asset JSON from the answer and
  follows no redirect. Both calls go through one private write path that
  keeps the current instance check (`GET /ready`, the write, then the check
  on the answer). Package T later changes only that private path, so B
  writes its import against `upload` in wave 1 and does not touch
  `ServerClient.*`.

Exit: the build, ctest, the plan check and the op check give the same results
as before the change. A test package that adds a module in a nested folder
(`src/<module>/<name>/module.cmake`), a CLI mode, an edit, a panel and a
menu item touches no shared file (prove it with `git diff --stat`), and its
test runs in ctest. `upload` of a media fixture to the scratch server
returns the asset, and `assets.get` returns the same asset. With an expected
instance and a test listener whose `/ready` answer lacks it, `upload` sends
no multipart body (`tst_serverclient`).

## Wave 1: independent packages

Wave 1 has 22 packages. They depend only on S1. Package V starts first and
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
  files from the OS, through `ServerClient::upload` from S1. B adds no
  request code of its own and does not edit `ServerClient.*`. Drag of an
  asset onto a lane uses the drop modes of M4.
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

### T: Server identity before a write (m5b F4)

Goal: the client proves which server it talks to before a mutation leaves
it. A check on the answer is not enough.

The gap: `ServerClient::mutate` sends `GET /ready`, compares the
`x-nodetool-instance` header with the expected token, and then sends the
`timeline.update` POST as a second request. Another listener can take the
port between the two requests and receive the write. The check on the
POST's answer finds the mistake only after the write went out. The token is
also static, and every answer from the scratch server carries it, so a
local process that read one answer can replay it. The JavaScript helpers
`mutate` and `upload` in `scripts/scratch-server.mjs` have the same gap.
`docs/reviews/round3-save.md` (row m5b F4) describes it.

- Server: `timeline.update` and `GET /ready`. Nothing under `packages/`
  changes. The scratch server gets its side of the proof from the preload
  in `scripts/scratch-safety.mjs`.
- Native: the proof covers the connection that carries the write. One way:
  the client opens one HTTP/1.1 connection, sends `GET /ready` with a fresh
  random nonce, the server answers with an HMAC-SHA256 of the nonce keyed
  by the instance secret, and the client sends the POST on the same
  connection. It sends nothing when that connection closed in between. The
  secret never goes over the wire, so a copied answer does not match a new
  nonce. `QNetworkAccessManager` does not promise to reuse a connection, so
  this likely needs a small `QTcpSocket` writer in
  `src/server/ServerIdentity.*`. Pinned TLS and a private Unix socket are
  the alternatives. Record the choice and the reason in the header comment
  of `ServerClient.h`.
- Every write takes this path: `timeline.update` from
  `AutosaveController`, the create and delete calls that package A adds
  through `ServerClient::mutate`, and the asset upload that package B adds
  through `ServerClient::upload`. S1 adds both calls on one private write
  path. T changes that path and keeps both signatures, so a merged A or B
  needs no change. The writer sends the multipart upload body on the proven
  connection, as it sends the JSON body of `mutate`.
- A client with no expected instance, such as one on the user's own
  server, keeps its current behaviour and sends no identity request.
- `SaveCli` gets `--wait-before-write FILE`: after the identity check it
  waits until FILE exists, so a check script can swap the listener in that
  window.
- The JavaScript helpers `mutate` and `upload` use the same proof.
- Tests: new cases go in `tests/tst_serveridentity.cpp`. T changes only the
  instance cases in `tst_serverclient.cpp` and `tst_autosave.cpp`, and the
  instance support in `tests/TestHttpServer.h`.

Exit: `scripts/check-server-identity.mjs` starts a scratch server with
`scratch-server.mjs`, runs `nodetool-timeline --server URL --timeline ID
--save --wait-before-write FILE` with `nativeEnv(server)`, stops the scratch
server while the client waits, binds a listener that records every byte on
the same port, and then creates FILE. The recording listener receives no
byte of the POST, and the client exits 1 with `WRONG_SERVER` or a
connection error and does not retry. With only the flag added and the old
`mutate`, the same check fails because the POST reaches the new listener. A
listener that answers `/ready` with headers copied from a real scratch
server answer gets no write, in `tst_serveridentity` and in the check
script. In `tst_serveridentity`, `ServerClient::upload` sends no byte of
its multipart body to a listener that replaces the server after the
identity check, and an upload to the scratch server still stores the
asset. `scratch-safety.test.mjs` shows that `mutate` and `upload` send no
body to a replacement listener. A save against the scratch server still
writes, and `timeline.get` returns the edit. `tst_autosave` and
`tst_serverclient` pass. A client with no expected instance sends one
request (`mutateWithoutAnExpectationSendsDirectly` stays green). No check
sends a request to port 7777.

### U: Linear transition resolver

Goal: resolve the cuts of a frame in time linear in the number of active
clips per track and group parent, after the sort, with the same results as
the web.

The gap: `resolveDocumentTransitions` in `src/preview/SceneEval.cpp`
buckets the active clips by track and group parent. For each clip in a
bucket, `resolveTransition` scans every sibling to find the head-overlap
partner, so a bucket with n active clips costs O(n²). The web code in
`packages/timeline/src/render/sceneModel.ts` has the same shape. It is the
reference for the results, not for the cost.

- Web: `packages/timeline/src/render/transition.ts` (`headOverlap`,
  `resolveTransition`), `packages/timeline/src/render/sceneModel.ts`
  (`resolveTrackTransitions`, `resolveDocumentTransitions`).
- Native: move the cut records (`incomingRecord`, `outgoingRecord` and their
  helpers), `resolveTransition` and `resolveDocumentTransitions` from
  `SceneEval.cpp` into `src/preview/transitions/`, with its own
  `src/preview/transitions/module.cmake` in the S1 form. S1's recursive
  include finds it, so U edits neither `src/preview/module.cmake` nor
  `CMakeLists.txt`. In `SceneEval.cpp`, change only the removal
  and the two call sites (`transitionOpacitiesAt` and `evaluateScene`).
- The linear pass walks the siblings in start order once. It keeps the
  largest end among clips with a strictly earlier start, and the clip that
  set it. That clip is the partner when its end is past the current clip's
  start. Keep the tie rules of `headOverlap`: a clip with the same start is
  never a partner, so clips that share a start all read the maximum from
  before their run. Among equal ends the first clip in sorted order wins,
  so the maximum changes only on a strictly larger end. The merge of the
  outgoing and incoming records keeps the order and the opacity products of
  `resolveTrackTransitions`.
- Tests: `tests/tst_transitionresolver.cpp`. It keeps a copy of the old
  quadratic resolver as the reference.

Exit: `node scripts/plan-conformance.mjs --bin <build>/nodetool-timeline`
passes with no problems, with and without `--examples`. The differential
test compares the new resolver with the old one on every timeline fixture
in `fixtures/` and every example that `--examples` reads, at every frame at
30 fps, and on 1,000
generated buckets with shared starts, equal ends, zero and negative
durations, hidden and adjustment clips and nested groups. The map keys and
every field must be equal, doubles bit for bit. The test fails once with a
planted tie change (`>=` for `>` in the running maximum), and the plant is
removed again. A timing test builds one bucket of n overlapping active
clips with authored transitions, at n = 2,000 and n = 32,000, and takes the
median of 5 runs. It passes when the larger run takes less than 40 times
as long. With n log n the ratio is about 19, and with the old resolver
about 256. Run against the old resolver, the timing test fails. Do not run
it while the load average is above 10.

## Round 2

Wave 1 merged S1, V, C, D1, D4, F, H, K, M, T, P1 and U. Packages A, B, D2,
D3, D5, I, J, N and R stopped on files they do not own, L waits for an
approved commit, and E failed only on the `/tmp` quota. The wave 3 reviews
found three P1 differences and named the files no package owns
(`reviews/wave3-completeness.md` F7 to F10).

Round 2 follows the S1 model. S2, S3 and PX run first, in parallel, and own
disjoint files. Each shared file they take gets an extension point, so the
blocked packages and wave 2 add their own files instead of editing it. Then
the blocked packages run again with the needs listed under
[Owns changes](#owns-changes).

A folder that S2 or S3 creates for registries (`src/preview/layers/`,
`src/wiring/` and the others in their owns lists) holds the registry and
its tests. A package that plugs into a registry adds its own file in its own
folder. `scripts/conformance/plan/` works like `scripts/conformance/suites/`:
S2 owns the loader, each package owns its comparator file.

### S2: Core seams, round 2

Goal: give the compositor, the scene model, the mixer, the audio engine,
`TimelineModel` and `main.cpp` the hooks that B, D3, D5, I, J and R need,
with no change in behaviour.

- Owns: `src/main.cpp`, `src/model/TimelineModel.*`,
  `src/preview/PreviewCompositor.*`, `src/preview/LayerSource.h`,
  `src/preview/SceneEval.h`, `src/preview/SceneEval.cpp`,
  `shaders/composite.vert`, `shaders/composite.frag`,
  `src/scene/ClipScene.*`, `src/audio/Mixer.cpp`, `src/audio/Mixer.h`,
  `src/audio/AudioEngine.*`, `scripts/plan-conformance.mjs`,
  `scripts/conformance/plan/`, and the new folders `src/preview/layers/`,
  `src/audio/hooks/`, `src/model/hooks/` and `src/app/startup/`.
- Layer sources (I): a registry of factories by layer kind. `entryFor` in
  `PreviewCompositorRenderer` asks it before it falls back to
  `SyntheticSource`.
- Layer decorators (D3, D5, I, J): a registered function gets each
  `ActiveLayer` with its `Clip` and the frame time. It may set two new
  fields: `ext`, a JSON object the package fills with its own parameters,
  and `sourceRect`, the source UV rectangle. `framePlanJson` writes `ext`
  only when it is not empty. Precomposites get the same hook for group
  effects.
- Source rectangle (D5): `composite.vert` and `composite.frag` sample
  through `sourceRect`, which defaults to the full source.
- Effect stages (J): a registered stage runs on a layer texture or a group
  surface before compositing and reads the layer's `ext` parameters.
- Text measurer (I): `evaluateScene` passes a registered `MeasureText` to
  the flex layout. Without one it keeps the fallback width rule.
- Source time (D3): `clipSourceMsAt` asks a registered mapper first. The
  time-remap parse itself stays with D3, which now owns
  `TimelineTypes.h` and `TimelineJson.*`.
- Mixer (D3, P2): a voice expander splits one voice into segments (time
  remap, silent reverse segments), and a gain envelope scales a voice
  (automation).
- Audio device (R): `AudioEngine` asks a registered provider for a device
  name before `ma_device_init` and uses the default device when none
  matches.
- Decode mode (R): `main.cpp` takes the default of `--decode` from a
  provider in `src/app/startup/` when neither `--decode` nor `--decoder` is
  set. The help text says so instead of "Default sw".
- `TimelineModel` (B, review pkg-B-r3 F1 and F2): `registerMedia` adds the
  runtime paths of new media without a history reset and without a new
  document generation. `applyEdit` and `commitEdit` return a command token,
  and `settleCommand(token, document)` replaces the result of that command
  when asynchronous work (audio extraction, silence detection) finishes.
- Plan comparators (D5, I, J): `scripts/plan-conformance.mjs` loads extra
  comparators from `scripts/conformance/plan/*.mjs`.

Exit, and how each is checked:

1. Build, ctest, the plan check with and without `--examples`, the op check
   and `check-mix.mjs` give the same results as before. `--dump-plan` is
   byte-identical on every fixture while no hook is registered (a script
   diffs the dumps of the base and the branch).
2. The `sanitize` and `tsan` ctest runs report nothing outside
   `tools/sanitizers/baseline.md`. `Mixer` and `AudioEngine` are threaded
   units, and the merge gate runs only `sanitize`, so S2 runs `tsan` itself.
3. `tst_layerhooks` (offscreen stills through `QQuickRenderControl`):
   - Red: with the old `entryFor`, a layer whose kind has a registered
     solid-colour factory draws the synthetic pattern. Green: it draws the
     colour.
   - A decorator's `ext` appears in the plan JSON.
   - A `sourceRect` of the left half gives a still equal to the cropped
     reference.
   - An invert stage inverts the pixels of its layer and no other.
   - A fixed-width measurer changes the flex box. Without it the box is the
     fallback one.
   - A registered source-time mapper changes `clipSourceMsAt`.
4. `tst_mixerhooks`: an expander splits a voice into two segments, and the
   silent one writes zeros. An envelope scales the gain. The device pick on
   miniaudio's null backend takes a matching name and falls back to the
   default. Without hooks, `tst_mixer` is unchanged.
5. `tst_startuphooks`: the flag wins over the provider, the provider wins
   over `sw`, and the help text names the provider.
6. `tst_modelhooks`:
   - Red: a dropped clip with new media has no runtime path, and the only
     way to add one is `setTimeline`, which clears the undo stack. Green:
     after `registerMedia` the preview resolves the path and the undo count
     is unchanged.
   - Red: undo then redo after an asynchronous settlement gives the
     placeholder. Green: it gives the settled document. A settlement after
     the user undid the command changes the command and not the current
     document.
7. A planted comparator in `scripts/conformance/plan/` that rejects every
   layer fails the plan check once, and the plant is removed.

### S3: UI wiring, round 2

Goal: make the merged features of C, D1, D4, F, K and M reachable by keys,
gestures and buttons as in the web, and give the blocked and wave 2
packages slots and registries for their UI.

- Owns: `src/edit/ClipGestureController.*`, `src/edit/Keymap.*`,
  `src/ui/RulerCanvas.*`, `src/ui/TimelineViewState.*`,
  `qml/Tracks/Clip.qml`, `qml/Tracks/ClipBody.qml`,
  `qml/Tracks/TrackHeader.qml`, `qml/Tracks/TrackLane.qml`,
  `qml/Tracks/TimeRuler.qml`, `qml/Tracks/ToolToggle.qml`,
  `qml/Tracks/TracksRegion.qml`, `qml/DocumentBar.qml`,
  `qml/preview/PreviewArea.qml`,
  `qml/Inspector/primitives/InspectorSliderRow.qml`,
  `src/app/PanelRegistry.*`, `src/app/QmlDiscovery.cmake`,
  `src/edit/transitions/`, `src/preview/gizmo/`, and the new folders
  `src/wiring/` and `qml/wiring/`.
- Web: `Tracks/TracksRegion.tsx` (key handling), `Tracks/TrackHeader.tsx`,
  `Tracks/TrackLane.tsx`, `Tracks/Clip.tsx`, `Tracks/ClipBody.tsx`,
  `Tracks/TimeRuler.tsx`, `ToolToggle.tsx`, `timelineKeymap.ts`,
  `TimelineDocumentBar.tsx`, `preview/PreviewCompositor.tsx`,
  `TimelineStore.ts`, `TimelinePlaybackStore.ts`.

Wiring of merged features:

| Package | Keys, gestures and buttons | Closes |
|---|---|---|
| C | Visible, lock, mute and solo header buttons toggle their field. Delete asks to confirm, as the header menu does. A grip drag reorders tracks of the same type with the 2 px drop line. A 6 px separator resizes a track (48 to 300 px, divided by vertical zoom, ArrowUp and ArrowDown step 8 px or 32 px with Shift). Each is one undo entry. | B9, B10, B11 |
| M | The target chip toggles targeting and dims when off. The sync button toggles sync lock and shows `SyncDisabled` in the warning tone. `liftRange`, `extractRange`, `rippleTrimPrevToPlayhead`, `rippleTrimNextToPlayhead` and `cutAllTracks`. `splitAtPlayhead` with no selection cuts only the targeted tracks. | B22, B27, B28 |
| F | `copy`, `cut`, `paste`, `pasteInsert`, `pasteAttributes` (opens `PasteAttributesDialog`), `duplicate`, `duplicateWithGap`, `groupClips`, `ungroupClips`. Alt-drag copies. A drag on empty lane space draws `RubberBandOverlay` and selects. A click between clips selects the gap, and Delete closes it. `GroupBracket` draws on group clips. Paste sends the targeted tracks and the drop mode. | B19, B26 |
| K | `shuttleBack`, `shuttleStop`, `shuttleForward`, `toggleLoop`, `playInToOut`, `stepFrameBack`, `stepFrameForward`. The in and out marks set the `PlaybackClock` range. | B14, B34 |
| D1 | The clip keyframe diamonds mount in `ClipBody`. A drag retimes, a click seeks. | B12 |
| D4 | The transition wedge gets the "Transition length" grip, one undo entry per drag. `TransitionHandle` caps the growth at the probed source length. | B29, B33 |

The shortcut sheet marks each wired action as available.
`InspectorSliderRow` gets a non-zero slider height (B21, and D2's slider).

Slots and registries for other packages:

| Slot or registry | Where | For |
|---|---|---|
| Panel slot names | `registerPanel` and the `nt-panel` marker accept any `[a-z][A-Za-z0-9]*`. A refused registration logs a warning. | all slots below |
| `clipBody` | An item created on each clip body with `clip`, `timeline`, `gestures` and `viewState`. | D2 fade grips |
| `toolbar` | Items after Snap in `ToolToggle`. | N Bars toggle, grid select |
| `documentBar` | Actions after Undo and Redo. | A project settings, E export |
| `preview` | Items inside the preview frame, clipped to it. The transform gizmo moves here (B18). | H, D5 focus overlay |
| `trackLane` | Rows under each track lane. | P2 automation lanes |
| Context menus | A right-click on a clip, a track header, an empty lane or the ruler opens the `MenuRegistry` items of that kind. An item calls `ClipGestureController::runAction`, the handler its shortcut uses. | G |
| Key actions | A handler registered in `src/wiring/` runs when `handleKey` does not take the key, and `availableActions` lists it. | O source keys, D2 `audioGain`, D3 `speedDuration`, Q workspaces |
| Snap candidates | Providers add candidates in `collectSnapCandidates` while snapping applies. | N beat lines |
| Ruler | `TimelineViewState` gets `rulerMode` (`time` or `bars`) and `gridDivision` (`beat` by default). `TimeRuler` and `RulerCanvas` draw ticks from a provider registered for the mode. | N |

Exit, and how each is checked:

1. Each row of the wiring table has a test that loads `TimelineEditor.qml`
   offscreen with a fixture document and drives it by pointer or keyboard,
   then compares the document and the undo count with the web store action.
   A test that calls a command directly does not count. Red: each test fails
   on the unwired files.
2. Each slot and registry has a test that registers a test item or handler
   and finds it in the running editor. Red: it fails on the unwired files.
3. The gizmo test clicks outside the preview frame over a scaled clip, and
   the click reaches the tracks.
4. A pointer drag on `InspectorSliderRow` changes its value. The
   `QEXPECT_FAIL` in `tst_transitions.cpp` is removed and the test passes.
5. Build, ctest, the plan check and the op check pass. `tst_tracksregion`,
   `tst_tracksui` and the D1 QML tests pass unchanged.

### PX: Parity P1 fixes

Goal: fix the three wave 3 P1 findings: behaviour F1, layout F1 and data
safety F1.

- Owns: `src/app/EditRegistry.h`,
  `src/edit/groups/GroupRegistrations.cpp`,
  `src/edit/targeting/TargetingEditRegistrations.cpp`,
  `src/edit/clipboard/ClipboardRegistrations.cpp`, `src/edit/registry/`,
  `qml/Inspector/TimelineInspector.qml`,
  `qml/Inspector/TransitionSection.qml`, `src/edit/inspectorsections/`,
  `src/server/AutosaveController.*`, `qml/SaveBanners.qml`,
  `tests/tst_autosave.cpp`, `src/server/recovery/`.
- Web: `TimelineStore.ts` (ripple trims, ripple delete, `closeGapAt`,
  `rippleFrozenTrackIds`), `Inspector/TimelineInspector.tsx`,
  `Inspector/ClipAdjustments.tsx`, `Inspector/ClipTransitionSection.tsx`,
  `web/src/hooks/useWorkspaceDocumentClose.ts`,
  `web/src/hooks/timeline/useTimelineAutosave.ts`.

Behaviour F1: F and M register the same names
(`rippleTrimClipStart`, `rippleTrimClipEnd`, `rippleDeleteSelected` and
`closeGapAt`), and `EditRegistry` refuses the second one without a word.

- One registration per name, in `src/edit/registry/`: a wrapper that sends a
  target containing a group to F's `applyGroupEdit` and every other target
  to M's sync-lock functions. When the payload has no targeting lists, the
  wrapper reads them from `TrackTargeting`. F's and M's registrars drop the
  four names. The new module adds the wrapper to the `app`,
  `structure-ops`, `tst_fclipboard` and `tst_targeting` targets with
  `nt_sources`, so F's and M's `module.cmake` files stay as they are.
- `registerEdit` and `overrideEdit` keep their signatures. A refusal is
  recorded with the name and logged as a warning.
  `nodetool-timeline --check-edit-registry` lists each name with its
  registrar and exits 1 when any refusal was recorded.

Layout F1: the Transition section is a second panel in the `right` slot.
`PanelSlot` stacks it under the Inspector, which is as tall as the slot, so
it lands below the window and outside the Inspector's `Flickable`. It also
reads `timeline` and `tracksRegion` from a context that does not have them.

- `src/edit/inspectorsections/` adds `registerInspectorSection` (id, QML
  source, order, title) and a QML singleton that lists them. This is the
  extension point for D2, D3, D5, I and D6, which register their sections
  here from their own `.cpp` file instead of an `nt-panel` marker. It does
  not use `PanelRegistry`, which S3 owns.
- `TimelineInspector` creates the registered sections inside its
  `Flickable`, between Transform and Animate, sorted by order in the web
  sequence (Media, Timing, Render, Transform, Color, Effects, Mask,
  Transition, then Animate). It sets `timelineModel`, `gestures` and
  `controller` on each section. `TransitionSection` keeps those property
  names and its object names, drops its `nt-panel` marker and registers
  through the new call.

Data safety F1: `save()` deletes `<id>.recovery.json` after any clean save,
also when an earlier session wrote it, and nothing reads a recovery or
conflict copy back. The web keeps unsaved work in the open tab and asks
before a dirty document closes (`useWorkspaceDocumentClose.ts`), so it
never drops unsaved work without telling the user. The native copy of that
rule:

- On start, the controller moves a recovery or conflict copy left by an
  earlier session to `<id>.recovery.<timestamp>.json` and exposes it as
  `earlierCopy`. A save in this session never deletes it, and a conflict in
  this session cannot overwrite it.
- `SaveBanners` shows a warning banner for it with Restore and Discard. The
  web has no such banner, so the wording is new. Restore applies the copy as
  one undo entry through a `restoreDocument` edit registered in
  `src/server/recovery/`, and autosave then saves it. Discard deletes the
  file.

Exit, and how each is checked:

1. `--check-edit-registry` runs in ctest on the app binary. Red: on the old
   registrars it reports the four duplicates and exits 1. Green: no
   refusal.
2. `tst_editregistry` links every registrar the app links. With sync lock
   off on A2, ripple delete, both ripple trims and close gap on V1 leave A2
   unchanged, as in `TimelineStore.ts`. A group target ripples as F's code
   did. Red: the same cases against the old registrars shift A2.
   `tst_fclipboard`, `tst_targeting`, `tst_seamexample` and the op check
   pass unchanged.
3. `tst_inspectorsections` loads `TimelineEditor.qml` offscreen at 1280×800
   with a clip that follows another selected. After a scroll the Transition
   section lies inside the Inspector viewport, its `timelineModel` is set,
   and choosing Crossfade adds one undo entry. Red: on the old files the
   section lies outside the window. `tst_transitions` and the D1 Inspector
   tests pass unchanged.
4. `tst_autosave`:
   - Red: a recovery copy written by one controller is gone after a clean
     save of a second controller for the same timeline. Green: it is kept
     as `earlierCopy`.
   - A second conflict leaves the first session's copy as it was.
   - Restore adds one undo entry and the next save sends the restored
     document. Discard deletes the file.
   - Every existing case passes.

### Owns changes

Files move only from packages that have merged or from no owner. Each blocked
package gets the files that only it needs.

| File | From | To | Reason |
|---|---|---|---|
| `src/main.cpp`, `src/model/TimelineModel.*` | S1 | S2 | R's decode default and B's model APIs |
| `src/preview/SceneEval.cpp` | U | S2 | D3, D5, I and J all need it |
| `src/audio/Mixer.cpp`, `src/audio/Mixer.h` | P1 | S2 | D3 and P2 need it |
| `src/audio/AudioEngine.*` | K | S2 | R's device hook |
| `src/preview/PreviewCompositor.*`, `LayerSource.h`, `SceneEval.h`, `shaders/composite.*`, `src/scene/ClipScene.*`, `scripts/plan-conformance.mjs` | none | S2 | D5, I and J need them |
| `qml/Tracks/TracksRegion.qml` | C | S3 | marquee, dialog mount, header wiring |
| `qml/Inspector/primitives/InspectorSliderRow.qml` | S1 | S3 | D2 and D4 slider |
| `src/app/PanelRegistry.*`, `src/app/QmlDiscovery.cmake` | S1 | S3 | new slot names |
| `ClipGestureController.*`, `Keymap.*`, `RulerCanvas.*`, `TimelineViewState.*`, `Clip.qml`, `ClipBody.qml`, `TrackHeader.qml`, `TrackLane.qml`, `TimeRuler.qml`, `ToolToggle.qml`, `DocumentBar.qml`, `PreviewArea.qml`, `src/edit/transitions/`, `src/preview/gizmo/` | none | S3 | wiring (critic F6, F7) and B18 |
| `src/app/EditRegistry.h` | S1 | PX | behaviour F1 |
| `GroupRegistrations.cpp`, `ClipboardRegistrations.cpp` | F | PX | behaviour F1 |
| `TargetingEditRegistrations.cpp` | M | PX | behaviour F1 |
| `qml/Inspector/TimelineInspector.qml` | D1 | PX | layout F1 |
| `qml/Inspector/TransitionSection.qml` | D4 | PX | layout F1 |
| `tests/tst_autosave.cpp` | T | PX | data safety F1 |
| `src/server/AutosaveController.*`, `qml/SaveBanners.qml` | none | PX | data safety F1 |
| `src/server/AutosaveController.*`, `src/server/recovery/`, `tests/tst_autosave.cpp` | PX | SY | external sync (B35, B36) |
| `src/server/ServerSource.*` | none | A | the startup label (only A) |
| `src/model/TimelineTypes.h`, `TimelineJson.*`, `LaneClipModel.*` | none | D3 | the time-remap parse (only D3) |
| `scripts/window-checks.sh` | none | I | the `serein` check (only I) |
| `scripts/op-conformance.mjs` | S1 | L | approved commit `500f6a7` |
| `scripts/conformance/known-differences.test.ts`, `tests/tst_editactions.cpp` | none | L | approved commit `500f6a7` |
| `qml/TimelineEditor.qml`, `src/app/PanelSlot.qml` | S1 | Q | the dock replaces the fixed layout (only Q) |

New files the blocked packages already made or must make, added to their
own lists: B `suites/assets.mjs`; D2 `src/edit/clipaudio/`,
`qml/Tracks/ClipFadeGrips.qml`, `suites/clip-audio.*`; D3 `suites/speed.*`;
D5 `suites/reframe.*`, `plan/crop.mjs`; I `plan/text.mjs`; J
`plan/effects.mjs`; N `suites/tempo.*`. D4 keeps
`TransitionEasingField.qml`. F and M keep their other files, now listed one
by one.

Needs added:

| Package | Needs | Why |
|---|---|---|
| A | S3 | `documentBar` slot for project settings |
| B | S2 | `registerMedia`, `settleCommand` |
| D2 | S3, PX | `clipBody` slot, slider fix, Inspector sections |
| D3 | S2, PX | source-time mapper, mixer expander, Inspector sections |
| D5 | S2, S3, PX | decorators, `sourceRect`, plan comparators, `preview` slot, Inspector sections |
| I | S2, PX | layer sources, decorators, text measurer, Inspector sections |
| J | S2, E | effect stages and decorators. Exit 1 compares against E's export. |
| N | S3 | `toolbar` slot, ruler provider, snap candidates, view state |
| R | S2 | decode default, audio device |
| G | S3 | context menus, `runAction` |
| O | S3 | key actions for the source keys |
| D6 | PX | Inspector sections |
| P2 | S2, S3 | gain envelope, `trackLane` slot |

D2, D3 and D5 register their sections with `slot=right` on their branches,
which has the same off-screen fault as layout F1. Each moves its section to
`registerInspectorSection` when it reruns.

Merge order: the merged packages, then S2, S3, PX, SY, L, E, A, B, D2, D3, D5,
I, J, N, R, and wave 2 (G, O, D6, P2, Q).

### SY: External sync

Goal: the native editor follows writes to the open timeline that come from
elsewhere: an agent through the server's MCP tools, the CLI, or a web tab.
This raises backlog B35 and B36 to P1.

- Owns: `src/server/AutosaveController.*`, `src/server/recovery/` and
  `tests/tst_autosave.cpp` (from
  PX, which has merged), the new `src/server/sync/` (WebSocket client,
  subscription, adopt, merge) with its tests,
  `scripts/conformance/suites/merge.*`, and three lines elsewhere:
  the registration of the new files in `src/server/module.cmake`, the Qt
  WebSockets `find_package` and link line in `CMakeLists.txt`, and the
  `qtwebsockets` module in the aqt install step of
  `.github/workflows/native-timeline.yml`. Everything else is read-only. A
  needed change to `TimelineModel` (S2), `ServerClient` (T) or another file
  is reported as a blocker.
- Web: `web/src/hooks/timeline/useTimelineExternalSync.ts`,
  `web/src/hooks/timeline/timelineExternalMerge.ts`,
  `web/src/stores/timeline/merge.ts`, `web/src/stores/documentMerge.ts`,
  `web/src/stores/documentSync.ts`,
  `web/src/hooks/timeline/useTimelineAutosave.ts` (conflict recovery), and
  the WebSocket managers in `web/src/lib/websocket/` (backoff, auth).
- Server: `packages/websocket/src/lib/resource-change-fanout.ts` and
  `websocket-client-session.ts` (who receives `resource_change`), and
  `packages/websocket/src/server.ts` (WebSocket auth).

Problem (wave 3 data safety F2 and F3): the editor reads the timeline once
at load, and `AutosaveController` listens only to the undo stack. A write
from elsewhere moves `updatedAt`, so the next native save conflicts, autosave
stops for the session, later edits live only in memory, and the external
edit never appears.

Exit, and how each is checked (red and green evidence for each):

1. `resource_change` reaches the editor. A script proves on a scratch server
   that an MCP timeline edit, made with the server's MCP tools as an agent
   calls them, emits `resource_change` for that sequence. If it does not,
   that is a server-side blocker, and a CLI or tRPC write is the trigger
   for the other checks.
2. A clean editor adopts. With no unsaved edits, an external write appears
   in the open editor (model and rendered state), only when the server copy
   is newer than the held `updatedAt`. Undo does not revert the external
   edit, which becomes the new base, as on the web.
3. A dirty editor merges. With unsaved local edits, an external write is
   merged as `timelineExternalMerge` does. The merge conformance suite runs
   the web merge and the native merge on the same fixtures (disjoint edits,
   same-clip edits, deletes, adds, track changes, conflicts) and the results
   are identical.
4. Autosave survives a conflict (B35). A save conflict merges the server
   copy and saving continues. No edit is left only in memory, and the
   conflict copy rule matches the web.
5. Reconnect. After the WebSocket drops and reconnects with the web's
   backoff, the editor fetches once to catch missed changes. Auth matches
   `ServerClient` (Bearer for remote servers).
6. End to end, headless. The native editor (offscreen or Xvfb) opens a
   timeline from a scratch server. An MCP edit appears in it within 2 s, the
   next native save succeeds without a conflict, and with a pending local
   edit both changes survive.
7. Nothing else changes. The full 6e checks pass, and the sanitize ctest has
   no report outside `tools/sanitizers/baseline.md`.

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
