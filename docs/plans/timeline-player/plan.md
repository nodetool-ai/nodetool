# Shared timeline player module

This plan moves the native timeline preview into a shared module,
`native/timeline-player`. The timeline app and the native node editor then use
the same player. The node editor can show and play a timeline by its ID, in a
node card or in a document tab.

The plan comes from a read-only study of the code. Nothing in it was built or
run. The items that the study could not confirm are in
[Unverified](#unverified).

## Decisions before work starts

- **D1. The node editor's software scene graph.**
  [`native/node-editor/src/main.cpp`](../../native/node-editor/src/main.cpp)
  calls `QQuickWindow::setGraphicsApi(QSGRendererInterface::Software)` at line
  24. Check first whether the node editor can use the RHI backend. If it can,
  S5 shrinks to the controller and the QML item, and the offscreen compositor
  becomes optional. No reason for the software backend was found in the code.
- **D2. Two FFmpeg copies in the node editor.** Qt Multimedia's FFmpeg backend
  ships its own FFmpeg, and the player links the timeline's FFmpeg. The
  recommendation is to move `native/media-player` onto the player's FFmpeg
  decoder, so that the app keeps one FFmpeg. Decide this before S7.

Recommended start: the D1 check, then S0 and S1.

## Findings

1. **The node editor renders in software for the whole process.** All its QML
   is in `QQuickWidget`s. `PreviewCompositor` is a `QQuickRhiItem`, so it
   cannot draw there. `export/OffscreenFrames` uses `QQuickRenderControl` and
   cannot draw there either, because the scene graph backend is global.
   - Without D1, the node editor needs a compositor with its own `QRhi` on a
     render thread. Frames come back as `QImage`s and are painted, as
     `native/media-player/src/VideoFrameItem` does.
   - `PreviewCompositorRenderer` uses `QQuickRhiItemRenderer` only through
     `rhi()` and `renderTarget()`, and it already has a read-back path
     (`requestCapture(immediate)`).
2. **`check_dependencies.py` forbids more than timeline references.** Its
   `FORBIDDEN` pattern also rejects `FFmpeg`, `FFMPEG`, `GuiPrivate`, `QRhi`,
   any `../../packages` path, and Qt targets other than Core, Gui, Qml, Quick,
   QuickControls2, Svg and Test. The new module needs its own policy entry.
3. **The dependency closure is small.** Without tests, `preview/gizmo/` and
   `preview/crop/`, the player sources reach only 37 files outside `preview/`
   and `playback/`.
4. **About 150 timeline files include `preview/…` or `playback/…`.** The module
   exposes `native/timeline-player/src` as a PUBLIC include directory with the
   same subfolders. Each move is then `git mv` and CMake, with no include
   changes.
5. **`native/media-player` and `native/gpu-preview` have no role.** The media
   player stays the single-file Qt Multimedia player, and only its painted-item
   pattern is reused. `gpu-preview` shares wgpu textures with an RHI scene
   graph, which the node editor does not have.

## Includes outside the player, classified

All paths are under `native/timeline/src/`.

### Move into the shared module

| From | To | Symbols | Note |
|---|---|---|---|
| `preview/SceneEval.h`, `SourcePool.h`, `crop/Reframe.h` | `model/TimelineTypes.h` | `nt::Timeline`, `nt::Clip` | Header only |
| through `TimelineJson` | `model/TimelineJson.{h,cpp}` | `ParseResult`, parse | Pulls `edit/speed/TimeRemap`, which moves to `scene/TimeRemap` |
| `SceneEval.cpp`, `effects/EffectPlan.cpp`, `transitions/TransitionResolver.cpp`, `crop/Reframe.cpp` | `scene/ClipScene.h` | Clip scene evaluation | Brings `Animation` and `ParamCurves` |
| `SceneEval.{h,cpp}`, `gizmo/GizmoMath.cpp` | `scene/Animation.h`, `FlexLayout.h`, `TextAnimation.h` | | `FlexLayout.cpp` includes `preview/SceneEval.h`, so scene and `SceneEval` move together. Needs `third_party/yoga` |
| `layers/SceneHooks.h` | `scene/TextBlock.h` | `scene::MeasureText` | |
| `effects/Masks.cpp` | `scene/SvgPath.h` | | |
| `SceneEval.h`, `PreviewCompositor.cpp` | `motion/blur/Shutter.h` | `nt::motion::Shutter`, `resolveFrameShutter` | Header |
| `PreviewCompositor.cpp` | `motion/wipe/Wipe.h` | | Header |
| `SceneEval.cpp` | `motion/beat/Beat.h`, `motion/tracking/TrackBinding.h` | | Headers. `TrackBinding.h` includes `SceneEval.h` |
| `effects/ClipEffects.cpp`, `DrawCache.cpp` | `motion/capacity/ScratchPool.h` | | Header. Includes `preview/SurfacePool.h` |
| `effects/EffectPlan.cpp` | `render2d/Paint.h` | | Also move `Rasterizer`, `LayerStyle`, `RasterSource` and `Render2dRegistrations`, which text and shapes need |
| `FfmpegSource.cpp`, `PreviewCompositor.cpp` | `platform/CpuUsage.h` | `nt::cpu::*` | |
| `playback/PlaybackClock.cpp` | `audio/ShuttleStretch.h` | | Moves with the audio engine |

### Put behind an interface that the shared module owns

| From | To | Used symbols | Interface |
|---|---|---|---|
| `PreviewCompositor.cpp`, `layers/TestStill.h` | `model/TimelineModel.h` | `snapshot()`, `documentGeneration()`, `timelineChanged`, `previewChanged` | `TimelineSource`. `TimelineModel` stays in the timeline app and implements it |
| `audio/AppAudio.{h,cpp}` | `TimelineModel`, `PlaybackClock` | The same reads | Takes `TimelineSource&` |
| `render2d/LayerStyle.cpp` | `transcript/TranscriptDocument.h` | `captionCues` | That file pulls `edit/clipboard/RawDocument.h`. Split `captionCues` into a leaf file that moves, or inject it as a hook |
| `render2d/module.cmake` | `../../packages/timeline/fonts` | `NT_TIMELINE_FONTS_DIR` | The host supplies the fonts directory, as a CMake variable or through `nt::render2d::setFontsDirectory` |

### Stay in the timeline app

- All of `preview/gizmo/` and `preview/crop/`. They use `app/EditRegistry.h`,
  `app/PanelRegistry.h`, `edit/ClipGestureController.h`,
  `edit/inspectorsections/InspectorSectionRegistry.h`, `ui/MediaVersion.h` and
  `model/TimelineModel.h`. They compile in place against the shared libraries.
- Test-only includes: `export/OffscreenFrames.h`, `bench/BenchReport.h`,
  `edit/keyframes/*`, and `audio/AudioEngine.h` in `tst_liveaudioedit`. Tests
  that need timeline fixtures, `packages/` paths, export or editing stay in
  `native/timeline` and link the shared libraries.
- Editing code: `model/TimelineModel.cpp`, `TrackListModel`,
  `TrackWindowModel`, `LaneClipModel`, `motion/gesture/ClipDelta` and
  `app/EditRegistry.h`.

## Module boundary

### Targets in `native/timeline-player`

- `nodetool_timeline_scene` (Qt Core, yoga): model types and JSON, scene,
  motion headers, `SceneEval`, `SceneHooks`, transitions, `CpuUsage`,
  `AudioClockFeed`.
- `nodetool_timeline_decode` (Gui, GuiPrivate, FFmpeg, HarfBuzz, FreeType):
  sources, pools, `hw/`, effects, layer and compose registries, render2d,
  shaders.
- `nodetool_timeline_audio` (FFmpeg, `nodetool_kernels`, miniaudio): the
  engine and the mixer.
- `nodetool_timeline_player`: the QML module `NodeTool.TimelinePlayer`.
- `nodetool_timeline_player_server` (Qt Network), optional: the default loader.

### Public C++ API

```cpp
// UI thread only. The host owns it. Consumers hold a QPointer.
class TimelineSource : public QObject {
  virtual std::shared_ptr<const nt::Timeline> snapshot() const = 0;
  virtual quint64 documentGeneration() const = 0;
signals:
  void sourceChanged();  // TimelineModel forwards timelineChanged and previewChanged
};
class StaticTimelineSource final : public TimelineSource {
  void setTimeline(nt::Timeline);
};

// UI thread only. Asynchronous. It never blocks the caller.
class TimelineDocumentLoader : public QObject {
  virtual void load(const QString& timelineId) = 0;
  virtual void cancel() = 0;
signals:
  void loaded(QString id, std::shared_ptr<const nt::Timeline> doc,
              std::shared_ptr<void> mediaLeases);
  void failed(QString id, QString message);
};
```

- `PlaybackClock` and `PreviewCompositor` keep their API. Only the type of the
  compositor's `timeline` property changes, to `TimelineSource*`.
- `TimelinePlayerController` (UI thread, owned by the QML item) owns a
  `StaticTimelineSource`, a `PlaybackClock`, optional audio and the media
  leases.
  - Properties: `timelineId`, `loader`, `status`, `error`, `playing`,
    `positionMs`, `durationMs`, `fps`, `frame`, `audioEnabled`.
  - Methods: `play()`, `pause()`, `toggle()`, `seek(ms)`, `stepFrames(n)`.

### QML item `TimelinePlayer`

- It wraps the controller and UiPrimitives transport controls, with
  `controls: bool` and a compact form for a node card.
- When the window's graphics API is not Software, as in the timeline app, it
  uses `PreviewCompositor` directly.
- Otherwise it uses `TimelineFrameItem`, a `QQuickPaintedItem` that
  `OffscreenCompositor` feeds.

### What the host supplies

- A loader. The default `ServerTimelineLoader(origin, token, cacheDir)` wraps
  the existing `openServerTimeline`. That function already resolves proxies
  and originals into `AssetCache` and returns leases. It must run on a worker
  thread, because `ServerClient` blocks in nested `QEventLoop`s.
- The fonts directory.
- An audio mode: device, null or off. With audio off, the clock runs on the
  monotonic source, which already works.
- For the direct path only: `nt::hw::selectGraphicsApi` and `prepareWindow` on
  its window.

### Threads and ownership

- The controller and all QObjects live on the UI thread.
- `nt::Timeline` snapshots stay `shared_ptr<const>`. The existing comment D8
  in the code explains why the render thread can share them.
- `OffscreenCompositor` owns one render thread and its `QRhi`.
  - The UI thread sends `{snapshot, timeMs, playing, seekSerial, size}`
    through a single-slot mailbox. The latest value wins.
  - Frames come back as moved `QImage`s through a queued signal, with one
    frame in flight.
  - The destructor requests a stop, joins the thread, and destroys the
    compositor core before the `QRhi`, on that thread.
- Decoder threads stay inside `SourcePool`.
- The audio callback is coupled only through the `AudioClockFeed` seqlocks.
- Only one player plays at a time in a process. This limits decoders and audio
  devices.

## Data model

- No new read-only model is needed. `nt::Timeline` is already an immutable
  snapshot value type, and `TimelineJson` parses it.
- The shared module gets `TimelineTypes.h`, `TimelineJson`, `scene/`, the five
  motion headers and `StaticTimelineSource`.
- `TimelineModel` keeps the undo stack, the edits, `EditRegistry` and the
  track list models in the timeline app. It gets `TimelineSource` as a base
  class.
- `FlexLayout.cpp`, `TrackBinding.h` and `ScratchPool.h` include files in
  `preview/`. Because of these back-references, the model types, scene, motion
  headers and `SceneEval` must move together.

## Steps

Each step can merge alone, and the timeline app works after each step. Every
step also runs these gates:

- `cmake --build "$B" --target nodetool-timeline`
- `python3 native/ui_primitives/tools/check_dependencies.py`
- `python3 native/ui_primitives/tools/check_design.py --strict`
- `npm run test:affected:native`

### S0. Seams in place, no moves

Small, about 300 lines.

- Add `TimelineSource`. `TimelineModel` implements it. `PreviewCompositor` and
  `AppAudio` use it.
- Move `edit/speed/TimeRemap` to `scene/`.
- Split `captionCues` out of `TranscriptDocument`.
- Fix the `native-rules #9` and `#10` markers on `PlaybackClock` in the same
  change.
- Gate: the full timeline `ctest`, including `-L render`.

### S1. Create the module with `nodetool_timeline_scene`

Medium: about 45 files and 6k lines moved, and 150 lines of CMake.

- `git mv` the model types and JSON, scene, motion headers, `SceneEval`,
  `SceneHooks`, transitions, `CpuUsage`, `AudioClockFeed` and yoga.
- The timeline adds a guarded `add_subdirectory`. `timeline_core` links the new
  library PUBLIC.
- Add a `timeline-player` policy and root to `check_dependencies.py`: a
  forbidden pattern without FFmpeg, GuiPrivate and QRhi, the extra Qt targets,
  and the allowed link targets.
- Add the module to the path filters in
  `.github/workflows/native-timeline.yml` and in
  `scripts/test-affected-native.mjs`.
- Gate: `tst_sceneeval`, `tst_timelinejson`, `tst_easing`,
  `tst_transitionresolver`, `tst_flexlayout`, `tst_motion`, `motion_oracle`,
  `tst_cpuusage`, `tst_timelinemodel`.

### S2. `nodetool_timeline_decode`

Large: about 70 files and 12k lines moved, on three platforms.

- Move the sources, pools, `hw/` interop, effects with
  `EffectsRegistrations`, the layer and compose registries, render2d and the
  effect shaders.
- `timeline_decode` becomes a thin library over it.
- Gates:
  - Unit: `tst_framering`, `tst_yuvformat`, `tst_ffmpegsource`,
    `tst_sourcepool`, `tst_retirequeue`, `tst_framecache`, `tst_surfacepool`,
    `tst_masks`, `tst_effectmasks`, `tst_effectplan`, `tst_effectresources`,
    `tst_render2d`.
  - Render label: `tst_workingprecision`, `tst_sceneprecision`,
    `tst_layerhooks_render`, `tst_composehooks_render`,
    `tst_monitorcompositor`, `tst_editpreview`.
  - `scripts/check-portable.sh`, and `tst_d3d11window` and
    `tst_vulkaninterop` in CI.

### S3. `nodetool_timeline_audio`

Medium: about 35 files and 4.5k lines.

- Move the engine, mixer, sources, `ShuttleStretch`, effects, hooks, loudness
  and miniaudio.
- `AudioCli` and `automation/` stay in the timeline app.
- Gate: `tst_fadecurves`, `tst_mixer`, `tst_audioclock`, `tst_audioengine`,
  `tst_shuttlestretch`, `tst_shuttleaudio`, `tst_appaudio`,
  `tst_liveaudioedit`, and the ThreadSanitizer preset.

### S4. QML module `NodeTool.TimelinePlayer` with the existing classes

Medium: 4 classes moved, about 10 test targets and 19 QML files changed.

- Move `PlaybackClock`, `PreviewCompositor`, `HwWindow` and the composite
  shaders.
- The 19 timeline QML files that use these types add the import.
- Test executables that compile `PreviewCompositor.cpp` or `PlaybackClock.cpp`
  directly link the library instead: `tst_editpreview`, `tst_layerhooks`,
  `tst_composehooks`, `tst_transport`, `tst_audioclock`, `tst_appaudio`,
  `tst_flexlayout`.
- Add the QML root to `ROOTS` in `check_design.py` and to `migration.toml`.
- Gate: `tst_transport`, `tst_monitorcompositor`, `tst_editpreview`,
  `tst_gizmo`, `tst_reframe`, `crop_golden`, `tst_tracksui`, and a manual
  playback test of the app.
- After this step, the timeline app runs on the shared player.

### S5. Host-independent player

Large: about 1.3k new lines, and a refactor of the 1.8k-line compositor file.
D1 can make this step much smaller.

- Extract `CompositorCore` from `PreviewCompositorRenderer`. It takes a
  `QRhi*`, a command buffer and a render target. The `QQuickRhiItem` renderer
  becomes a thin adapter.
- Add `OffscreenCompositor`, `TimelineFrameItem`, `StaticTimelineSource`,
  `TimelinePlayerController` and `TimelinePlayer.qml`.
- Gates:
  - A new `tst_timelineplayer` (offscreen and software, a fake loader,
    synthetic sources): play, pause, seek, frame number, and teardown during
    playback.
  - A new `tst_offscreencompositor` (render label): PSNR against the direct
    path.
  - All render-label tests unchanged. ASan and TSan.

### S6. Loader library

Medium: about 2k lines moved and 200 new lines. This step can merge before S5.

- Move `ServerClient`, `ServerIdentity`, `AssetCache`, `FieldAudit` and
  `ServerTimeline`. Add the asynchronous `ServerTimelineLoader`.
- `timeline_server` keeps `ServerSource` and `AutosaveController` and links the
  new library.
- `openServerTimeline` can run on a `QThread` with an event dispatcher. Its
  network objects live on the calling thread. Cache locks serialize writes,
  and a mutex protects leases shared across threads. The timeline app passes
  its FFmpeg probe to preserve media diagnostics.
- Gate: `tst_serverclient`, `tst_assetcache`, `tst_serveridentity`,
  `tst_autosave`, `tst_colorspaceversion`, and a new
  `tst_servertimelineloader`.

### S7. Node editor integration

Medium: about 500 new lines, and packaging. Decide D2 first.

- Link the module.
- Add `EditorWindow::openTimelineDocument(id)`, modelled on
  `openStoryDocument` in `native/node-editor/src/ui/EditorTabs.cpp`.
- Show a compact `TimelinePlayer` in the card of the timeline document constant
  (`DocumentPropertyEditor.qml`, kind `timeline`).
- Bundle FFmpeg, HarfBuzz and the fonts.
- Gates:
  - A new `node_editor_timeline_player` test with a fake loader.
  - `node_editor_document_property`, `node_editor_workflow_tabs`,
    `node_editor_ui`.
  - The timeline suite is unchanged.

## Risks

- **GPU context in the node editor (highest risk).**
  - A standalone `QRhi` is easy on macOS (Metal). Windows needs a D3D11 device
    with video support. Linux needs a `QVulkanInstance` or an offscreen GL
    surface made on the GUI thread.
  - Under `QT_QPA_PLATFORM=offscreen` and in CI, a device may not exist. The
    player must report `status: unavailable` and not crash. The node editor
    tests use a fake frame producer.
  - A read-back costs about 8 MB for each 1080p frame. Limit the offscreen
    canvas to the item size and use `playbackResolution`.
- **Hardware decoding.**
  - `PlatformInterop::create(QRhi*)` should work with a private Metal device.
  - D3D11VA and VAAPI need the device setup that `HwWindow` now does on a
    `QQuickWindow`.
  - Start S5 with software decoding in the offscreen path, and enable hardware
    decoding for each platform later.
- **FFmpeg linkage (D2).**
  - With the player, the node editor loads two copies: the timeline's shared
    `libavcodec.62` and Qt Multimedia's.
  - On macOS, two-level namespaces make this acceptable. On Linux, symbol
    interposition is a real hazard.
  - Options: a native Qt Multimedia backend in the node editor, a static FFmpeg
    with hidden visibility for the player, or node editor video through
    `FfmpegSource`.
- **Audio clock.**
  - miniaudio runs next to Qt Multimedia audio in the node editor.
  - The device callback must stop before the controller is destroyed (native
    rule 13).
  - Each player has its own engine, so only one player plays at a time.
- **Global registries.** The layer, compose and scene hooks are process-wide
  statics. Registrar sources compiled into each executable fill them. The node
  editor must link the same registrars, with whole-archive linking or an
  explicit `registerStandardHooks()`. If it does not, text, effects and blends
  render incorrectly with no error.
- **Qt private API.** The timeline pins Qt to exactly 6.12 for QRhi. The node
  editor needs 6.12 or later, so it gets the same upper limit.
- **Checker friction.**
  - Platform link flags in `${…}` variables and `-framework` strings fail the
    link-target check unless the policy allows them.
  - A comment in `audio/Mixer.h` contains `web/`, which the forbidden pattern
    rejects.
  - Test CMake that refers to `../../packages` must stay in `native/timeline`.

## Unverified

- Whether `captionCues` needs `RawDocument`, or only other code in
  `TranscriptDocument.cpp` does.
- Why the node editor uses the software backend (see D1).
- How `scripts/test-affected-native.mjs` finds projects. Only the CI wrapper
  was read.

## Files to read first

- `native/timeline/src/preview/PreviewCompositor.cpp`
- `native/timeline/CMakeLists.txt`
- `native/ui_primitives/tools/check_dependencies.py`
- `native/timeline-player/src/server/ServerTimeline.h`
- `native/node-editor/src/ui/EditorTabs.cpp`
