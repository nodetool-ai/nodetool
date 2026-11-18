# Timeline player

The timeline preview, shared by the [timeline app](../timeline/README.md) and
the native node editor. The
[plan](../../docs/plans/timeline-player/plan.md) moves it here in steps.

## Libraries

| Target | Dependencies | Contents |
|---|---|---|
| `nodetool_timeline_scene` | Qt Core, Yoga | The document types (`model/TimelineTypes.h`), `TimelineJson`, `TimelineSource`, `StaticTimelineSource`, `TimelineDocumentLoader`, `scene/`, the motion headers, `SceneEval`, `SceneHooks`, `TransitionResolver`, `CaptionCues`, `CpuUsage` and `AudioClockFeed` |
| `nodetool_timeline_decode` | `nodetool_timeline_scene`, Qt Gui and GuiPrivate (QRhi), FFmpeg, HarfBuzz, FreeType, the platform's hardware decode libraries | The media sources and their pools (`FfmpegSource`, `SourcePool`, `FrameCache`, `SurfacePool`, `RetireQueue`), the hardware interop (`preview/hw/`), the layer and compose hook registries, the effects, render2d and the effect shaders (`shaders/effects/`) |
| `nodetool_timeline_effects_registrar`, `nodetool_timeline_render2d_registrar` | `nodetool_timeline_decode` | Object libraries that register the [standard hooks](#standard-hooks) at application startup |
| `nodetool_timeline_audio` | `nodetool_timeline_scene`, FFmpeg, `nodetool_kernels`, miniaudio, platform audio libraries | The playback engine, mixer, audio sources, shuttle stretch, effects, mix and output-device hooks, and loudness processing |
| `nodetool_timeline_player`, `nodetool_timeline_playerplugin` | `nodetool_timeline_decode`, `nodetool_timeline_audio`, `nodetool_ui_primitives`, Qt Qml and Quick | The [QML module](#qml-module) `NodeTool.TimelinePlayer`: `PlaybackClock`, `PreviewCompositor`, `HwWindow`, the composite shaders (`shaders/`), `TimelinePlayerController` and `TimelinePlayer.qml` |
| `nodetool_timeline_player_server` | Qt Network, `nodetool_timeline_scene` | `ServerTimelineLoader`, tRPC, media resolution and cache leases |
| `yogacore` | none | [Yoga 3.2.1](third_party/yoga/README.md), the flex layout engine, unchanged |

`src/` keeps the folder layout of `native/timeline/src`. Both projects put
their `src/` on the include path, so `#include "scene/ClipScene.h"` works from
either one.

The scene sources compile without fused multiply-add (`-ffp-contract=off`), so
they round as the web's JavaScript does.

`nodetool_timeline_decode` carries the effect shaders as Qt resources, so every
executable that links it can load `:/effects/*.qsb`.

## QML module

`nodetool_timeline_player` is the static QML module `NodeTool.TimelinePlayer`.
A host links it and `nodetool_timeline_playerplugin`, and its QML files
`import NodeTool.TimelinePlayer`. The module registers:

- `PlaybackClock`, which QML cannot create. The host or a
  `TimelinePlayerController` owns it.
- `PreviewCompositor`, a `QQuickRhiItem` that draws the timeline at the clock's
  time. Its `timeline` property takes a `TimelineSource`. It holds the source
  and the clock by `QPointer`, so either may go first.
- `TimelinePlayerController` and the `TimelinePlayer` item. See
  [Player](#player).
- `TimelineSource` and `nt::TimelineDocumentLoader`, without QML names
  (`src/model/TimelineSourceQml.h`).

`TimelinePlayer.qml` imports `NodeTool.UiPrimitives`. The module links
`nodetool_ui_primitives` and adds `native/ui_primitives` when no target of
that name exists, so a host that also adds it adds it first.

`TimelineSource` is registered only here. A host QML module whose C++ types
derive from it, such as the timeline's `TimelineModel`, lists
`DEPENDENCIES NodeTool.TimelinePlayer` and does not register it again. Its
`.qmltypes` then names `TimelineSource` as the prototype, and QML can assign
the host's object to `PreviewCompositor.timeline`. Give the host module this
directory's build folder as an `IMPORT_PATH`, so `qmlcachegen` and `qmllint`
find the module.

The compositor loads its shaders from `:/shaders/`, which the library carries
as resources. `nt::hw::selectGraphicsApi()` and `nt::hw::prepareWindow()`
(`src/preview/hw/HwWindow.h`) prepare the host's `QQuickWindow` for hardware
decode.

## Player

`TimelinePlayer` plays one timeline by its ID in any Qt Quick host. It draws
the picture with `PreviewCompositor` and shows transport controls from
`NodeTool.UiPrimitives`.

```qml
import NodeTool.TimelinePlayer

TimelinePlayer {
    timelineId: "…"
    loader: hostLoader                        // a TimelineDocumentLoader
    audioMode: TimelinePlayerController.Device // Off (default), Null or Device
    controls: true                            // the transport row
    compact: false                            // true: Play and the position slider only, for a node card
}
```

Its `controller` property is the `TimelinePlayerController`
(`src/player/TimelinePlayerController.h`), which a C++ host can also own
directly:

| Member | Meaning |
|---|---|
| `timelineId`, `loader` | Inputs. A change cancels the outstanding load and asks the loader for the new ID. |
| `window` | The `QQuickWindow` the picture draws in. `TimelinePlayer` binds it. |
| `audioMode` | `Off` runs the clock on the monotonic source. `Null` and `Device` open an `AudioEngine` on the first play, on miniaudio's null backend or the default output device, and make it the clock's master. |
| `status`, `error` | `Idle` (no ID), `Loading`, `Ready`, `Error` with `error`, or `Unavailable` when `window` renders with the software scene graph. Nothing loads or draws while unavailable. |
| `playing`, `positionMs`, `durationMs`, `fps`, `frame` | The transport. `durationMs` is the end of the last clip or the document's duration, whichever is later. `frame` is the frame shown at `positionMs`. |
| `audioEnabled` | True while the audio engine runs. |
| `source`, `clock` | The `StaticTimelineSource` and the `PlaybackClock` it owns, for a host's own `PreviewCompositor`. |
| `play()`, `pause()`, `toggle()`, `seek(ms)`, `stepFrames(n)` | `play()`, `seek()` and `stepFrames()` act only while `Ready`. `seek()` clamps to the timeline. `stepFrames()` pauses first. |

Behaviour a host can rely on:

- One controller plays at a time in a QML engine. `play()` pauses the one that
  played before and closes its audio. A controller with no QML engine
  (`qmlEngine()` null) takes no part.
- A load result for another ID than the current one is dropped, and so is a
  result that arrives after the controller is destroyed. Give each controller
  its own loader, because a new `load()` supersedes the previous one.
- The controller keeps the media leases of the last load until the next load
  or its destruction. Its destructor stops the audio device callback and the
  decode worker before it releases the leases, the source and the clock.
- `StaticTimelineSource::setTimeline(nt::Timeline)` gives the document a new
  revision and clip index and raises the generation. `clear()` leaves a null
  snapshot, which `PreviewCompositor` draws as nothing.

A minimal host with the default server loader:

```cmake
set(NT_PLAYER_FONTS_DIR "${fonts}")             # render2d's fallback fonts
add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
add_subdirectory(../timeline-player ${CMAKE_CURRENT_BINARY_DIR}/timeline-player)
target_link_libraries(host PRIVATE nodetool_timeline_player nodetool_timeline_playerplugin
    nodetool_timeline_player_server)
nodetool_use_ui_primitives(host)
# A host QML module that names these types:
#   qt_add_qml_module(host_qml ... DEPENDENCIES NodeTool.TimelinePlayer
#       IMPORT_PATH ${CMAKE_CURRENT_BINARY_DIR}/timeline-player)
```

```cpp
QGuiApplication app(argc, argv);
nt::hw::selectGraphicsApi(false);
const nt::HookRegistrations hooks = nt::registerStandardHooks();
nt::server::ServerTimelineLoader loader(origin, token, cacheDir);
QQuickView view;
nt::hw::prepareWindow(&view);
view.setInitialProperties({{"loader", QVariant::fromValue<QObject*>(&loader)},
                           {"timelineId", timelineId}});
view.loadFromModule("NodeTool.TimelinePlayer", "TimelinePlayer");
view.show();
```

Keep `hooks` alive while players render. A loader destroyed first leaves its
players in `Error`.

## Hardware decode

The hardware path is chosen at compile time in `src/preview/hw/HwInterop.h`:
VideoToolbox on macOS, D3D11VA on Windows, and VAAPI with DMA-BUF import into
Vulkan on Linux when libva and Vulkan are found. Without them the player
decodes in software. `NT_HAVE_VAAPI_VULKAN` and, with `NT_PORTABLE`,
`NT_HW_NONE` are PUBLIC compile definitions of `nodetool_timeline_decode`.
A host that adds this directory gets `NT_PLAYER_DECODE_PLATFORM_LIBS` and
`NT_PLAYER_HAVE_VAAPI_VULKAN` back in its own scope.

## Fonts

render2d loads its fonts from the first folder that exists:
`NODETOOL_TIMELINE_FONTS_DIR`, `fonts/` next to the executable,
`../Resources/fonts` in a macOS bundle, then `NT_PLAYER_FONTS_DIR`. The host
sets `NT_PLAYER_FONTS_DIR` before it adds this directory. It is empty by
default, and this module ships no fonts. The timeline sets it to the
repository's `packages/timeline/fonts`.

## Standard hooks

The layer, compose and scene hooks are process-wide registries. The timeline's
documents need these registrations:

- `effects::registerEffectHooks()`: the clip, track, group and adjustment
  decorators, the adjustment backdrop stage, the matte and denoise second
  sources, the effect and mask stages, the image matte stage and a handler
  for every blend mode.
- `render2d::registerRender2dHooks()`: the text measurer, the text, shape and
  caption layer style and their raster sources.

Without them, effects, blends, text, shapes and captions render wrongly and
nothing reports an error. A host gets them in one of two ways:

- Link `nodetool_timeline_effects_registrar` and
  `nodetool_timeline_render2d_registrar`. Their objects link into the
  executable and register at `QCoreApplication` startup for the process
  lifetime. The timeline app and its tests do this through
  `NT_EFFECTS_REGISTRAR` and `NT_RENDER2D_REGISTRAR`.
- Call `nt::registerStandardHooks()` (`preview/StandardHooks.h`) on the UI
  thread after creating the `QGuiApplication`. It returns a
  `HookRegistrations` that unregisters the hooks when destroyed, and it skips
  a group that is already complete.

`nt::missingStandardHooks()` names the registrations that are absent.
`tst_standardhooks` and `tst_standardhooks_explicit` fail when either way
leaves a hook out.

## Audio

`AudioEngine` owns the device handle, the decode worker, and the playback
buffers. Miniaudio manages the device callback thread and lends the engine an
output buffer for each callback. The worker writes the PCM rings and the
callback reads them. The engine uninitializes the device and joins its worker
before freeing the rings and callback state.

The timeline app's `AppAudio` feeds the engine from a `TimelineSource` and
connects it to the app's `PlaybackClock`. Automation and its startup
registration also live in the app. The shared mixer supplies the hooks.
Miniaudio's license is at the end of
[`third_party/miniaudio.h`](third_party/miniaudio.h).

## Server loader

Construct `nt::server::ServerTimelineLoader(origin, token, cacheDir)` on the
UI thread and give it the host's lifetime. Call `load(id)` to receive an
immutable document and its media leases on that thread. Keep the leases while
playback uses the cached files. `cancel()` discards the pending result and
requests worker interruption. A new load supersedes the previous one.

## Build

The timeline build adds this directory with `add_subdirectory`. It links
`nodetool_timeline_scene` into `timeline_core`, `nodetool_timeline_decode`
into `timeline_decode`, `nodetool_timeline_audio` into `timeline_audio`, and
`nodetool_timeline_player` into its QML module `timeline_qml`.
The module adds `native/kernels` if `nodetool_kernels` is missing, including
in standalone builds. Build and test from the timeline build:

```bash
cmake --build native/timeline/build --target nodetool_timeline_decode tst_cpuusage tst_standardhooks tst_standardhooks_explicit tst_shuttlestretch
ctest --test-dir native/timeline/build -R '^(tst_cpuusage|tst_standardhooks|tst_standardhooks_explicit|tst_shuttlestretch)$'
```

`tst_timelineplayer` covers the controller and `TimelinePlayer.qml` offscreen
on the software scene graph with a fake loader. `tst_timelineplayer_render`
(label `render`) shows a frame through `TimelinePlayer.qml` on the platform
QRhi and needs a display, such as xcb under Xvfb with Vulkan on lavapipe:

```bash
cmake --build native/timeline/build --target tst_timelineplayer tst_timelineplayer_render
ctest --test-dir native/timeline/build -R '^tst_timelineplayer$'
QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a ctest --test-dir native/timeline/build -R '^tst_timelineplayer_render$'
```

A timeline build with `NT_SANITIZE` applies its sanitizer failure patterns to
these tests too. `native/timeline/tools/sanitizers/clang-tidy-baseline.mjs`
checks this module's `src/` and `tests/`.

Tests that read the timeline's fixtures, such as `tst_sceneeval`,
`tst_timelinejson`, `tst_ffmpegsource`, `tst_effectsblend` and `tst_audioengine`, stay in
`native/timeline` and link these libraries. `tst_sceneprecision` and
`tst_precisioncost` compile the QML module's sources themselves instead,
because `NT_SCENE_PRECISION_TEST` adds a working-storage observer to
`PreviewCompositor` and changes its layout.

## Dependency check

`python3 native/ui_primitives/tools/check_dependencies.py` audits this
directory with the `timeline-player` policy. Nothing here may refer to the
timeline app, the node editor, the web or npm. The policy lists the values
that the platform link variable may hold.
