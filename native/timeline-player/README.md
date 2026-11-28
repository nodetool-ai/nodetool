# Timeline player

The timeline preview, shared by the [timeline app](../timeline/README.md) and
the native node editor. The
[plan](../../docs/plans/timeline-player/plan.md) moves it here in steps.

## Libraries

| Target | Dependencies | Contents |
|---|---|---|
| `nodetool_timeline_scene` | Qt Core, Yoga, [`nodetool_audio_io`](../audio-io/README.md) | The document types (`model/TimelineTypes.h`), `TimelineJson`, `TimelineSource`, `StaticTimelineSource`, `TimelineDocumentLoader`, `scene/`, the motion headers, `SceneEval`, `SceneHooks`, crop and reframe evaluation, picture automation, `TransitionResolver`, `CaptionCues` and `CpuUsage`. `AudioClockFeed` comes from `nodetool_audio_io` |
| `nodetool_timeline_decode` | `nodetool_timeline_scene`, Qt Gui and GuiPrivate (QRhi), FFmpeg, HarfBuzz, FreeType, the platform's hardware decode libraries | The media sources and their pools (`FfmpegSource`, `SourcePool`, `FrameCache`, `SurfacePool`, `RetireQueue`), the hardware interop (`preview/hw/`), the layer and compose hook registries, the effects, render2d and the effect shaders (`shaders/effects/`) |
| `nodetool_timeline_effects_registrar`, `nodetool_timeline_render2d_registrar`, `nodetool_timeline_playback_registrar` | `nodetool_timeline_decode` or `nodetool_timeline_audio` | Object libraries that register the [standard hooks](#standard-hooks) for the process lifetime |
| `nodetool_timeline_audio` | `nodetool_timeline_scene` (with `nodetool_audio_io`), FFmpeg, `nodetool_kernels`, platform audio libraries | The playback engine, mixer, audio sources, shuttle stretch, effects, mix and output-device hooks, time-remapped audio, mixer automation, and loudness processing |
| `nodetool_timeline_hooks` | `nodetool_timeline_decode`, `nodetool_timeline_audio` | Explicit [standard hook](#standard-hooks) registration for hosts with or without QML |
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
the host's object to `PreviewCompositor.timeline`. Read `BINARY_DIR` from the `nodetool_timeline_player` target and pass it
as the host module's `IMPORT_PATH` so `qmlcachegen` and `qmllint` find it.

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
| `playbackVisible` | Defaults to true for C++ hosts. `TimelinePlayer` binds it to effective item and window visibility. |
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
- The controller accepts a completion only for the outstanding timeline ID
  and request token. Give each controller its own loader, because a new
  `load()` supersedes the previous one.
- Hiding the item, an ancestor or its window pauses playback and closes
  audio. Playback stays paused when the item becomes visible again.
- `StaticTimelineSource::setTimeline(timeline, mediaLeases)` gives the
  document a new revision and clip index and raises the generation.
  `clear()` leaves a null snapshot, which `PreviewCompositor` draws as
  nothing.
- The compositor reads `TimelineSource::renderState()` on the UI thread and
  copies its snapshot, generation and leases during render synchronization.
  Video and still-image decoders keep the leases through their last file
  read. The controller stops its audio callback and decode worker before
  clearing or destroying the source.

A minimal host with the default server loader:

```cmake
set(NT_PLAYER_FONTS_DIR "${fonts}")             # render2d's fallback fonts
add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
add_subdirectory(../timeline-player ${CMAKE_CURRENT_BINARY_DIR}/timeline-player)
target_link_libraries(host PRIVATE nodetool_timeline_player nodetool_timeline_playerplugin
    nodetool_timeline_player_server)
nodetool_use_ui_primitives(host)
# A host QML module that names these types:
get_target_property(player_import_path nodetool_timeline_player BINARY_DIR)
#   qt_add_qml_module(host_qml ... DEPENDENCIES NodeTool.TimelinePlayer
#       IMPORT_PATH ${player_import_path})
```

```cpp
QGuiApplication app(argc, argv);
nt::hw::selectGraphicsApi(false);
const nt::HookRegistrations hooks = nt::registerStandardHooks();
nt::server::ServerLoaderWorkers workers;
const nt::server::AssetCacheRoot cache(cacheDir);
nt::server::ServerTimelineLoader loader(workers, origin, token, cache);
QQuickView view;
nt::hw::prepareWindow(&view);
view.setInitialProperties({{"loader", QVariant::fromValue<QObject*>(&loader)},
                           {"timelineId", timelineId}});
view.loadFromModule("NodeTool.TimelinePlayer", "TimelinePlayer");
view.show();
return app.exec();
```

Keep the single `hooks` handle for the application lifetime. A loader destroyed first leaves its
players in `Error`.

## Hardware decode

The hardware path is chosen at compile time in `src/preview/hw/HwInterop.h`:
VideoToolbox on macOS, D3D11VA on Windows, and VAAPI with DMA-BUF import into
Vulkan on Linux when libva and Vulkan are found. Without them the player
decodes in software. `NT_HAVE_VAAPI_VULKAN` and, with `NT_PORTABLE`,
`NT_HW_NONE` are PUBLIC compile definitions of `nodetool_timeline_decode`.
The same target propagates the platform link dependencies.

## Fonts

render2d loads its fonts from the first folder that exists:
`NODETOOL_TIMELINE_FONTS_DIR`, `fonts/` next to the executable,
`../Resources/fonts` in a macOS bundle, then `NT_PLAYER_FONTS_DIR`. The host
sets `NT_PLAYER_FONTS_DIR` before it adds this directory. It is empty by
default, and this module ships no fonts. The timeline sets it to the
repository's `packages/timeline/fonts`.

## Standard hooks

The scene, compositor and mixer use process-wide hook registries.
Timeline documents use these registrations:

- `effects::registerEffectHooks()` installs effects, masks, mattes, adjustment
  stages and blend modes.
- `render2d::registerRender2dHooks()` installs the text measurer and the text,
  shape and caption raster sources and styles.
- `registerPlaybackHooks()` installs crop and dynamic reframe, picture and
  mixer automation, and the voice expander for time-remapped audio.

Link the three registrar object libraries for process-lifetime registration,
as the timeline app does. Effects and render2d install at QGuiApplication
startup. Playback hooks also work for headless mix and scene evaluation.

A host can instead call `nt::registerStandardHooks()` once on the UI thread
after constructing `QGuiApplication`. Link `nodetool_timeline_hooks` in a
host without QML. Keep the move-only `HookRegistrations` until all rendering
and mixing have stopped, and destroy it before the application. A redundant
call skips complete groups and leaves their ownership with the original
registrar or handle. Move construction transfers the registrations.

`nt::missingStandardHooks()` names absent hooks.
`tst_standardhooks` and `tst_standardhooks_explicit` cover both entry points
with a remapped mix, track automation and a dynamic crop.
`tst_playbackhooks_render` verifies crop and opacity in captured frames.

## Audio

`AudioEngine` owns the device, the decode worker, and the playback buffers.
The device is a `PlaybackDevice` from [native/audio-io](../audio-io/README.md),
which also holds `AudioClockFeed`, `OutputLatency` and `PcmRing`. Miniaudio
manages the device callback thread and lends the engine an output buffer for
each callback. The worker writes the PCM rings and the
callback reads them. The engine uninitializes the device and joins its worker
before freeing the rings and callback state.

The timeline app's `AppAudio` feeds the engine from a `TimelineSource` and
connects it to the app's `PlaybackClock`. The app also owns automation
editing and the meter taps that supply its mixer UI.
Miniaudio's license is at the end of
[`third_party/miniaudio.h`](../audio-io/third_party/miniaudio.h) in native/audio-io.

## Server loader

Create a host-owned `nt::server::ServerLoaderWorkers` on the UI thread after
the application. Pass it to each `ServerTimelineLoader`. The owner drains
workers at `QCoreApplication::aboutToQuit` and on destruction. Keep it alive
until all loaders are gone and destroy it before the application.
Shutdown is permanent. A host that runs `exec()` again needs a new owner.

Destroying a loader requests interruption and returns immediately. The
worker owner still holds its thread. Shutdown rejects new loads, interrupts
pending network I/O and joins all outstanding workers before Qt tears down.
The join has one five-second deadline. If an interrupted worker misses it,
the process stops before Qt teardown.

Call `load(id, request)` with a fresh `QUuid`. Both `loaded` and `failed`
echo the ID and token on the UI thread. `loaded` delivers an immutable
document and its media leases. The host owns one `AssetCacheRoot` per cache
directory. Pass copies to code that loads, leases, or evicts files in the
directory. Every lease shares the in-memory registry and can outlive its
loader and root handle. Acquisition and release never write files beside the
media. Lease keys are lexical. Cache paths must use the root's configured
or canonical spelling. Other symlink aliases, including symlinks below the
root, have separate lease keys, and so do spellings that differ only in
case on a case-insensitive volume. Eviction honors leases from the same registry.
Keep the leases while playback uses the cached files. A lease returned by a
custom loader must support release from the UI, render or decode thread.
`cancel()` discards the pending result and requests worker interruption. A
new load supersedes the previous one.

## Build

The timeline build adds this directory with `add_subdirectory`. It links
`nodetool_timeline_scene` into `timeline_core`, `nodetool_timeline_decode`
into `timeline_decode`, `nodetool_timeline_audio` into `timeline_audio`, and
`nodetool_timeline_player` into its QML module `timeline_qml`.
The module requires CMake 3.28 and adds `native/kernels` if
`nodetool_kernels` is missing, including in standalone builds. Build and test from the timeline build:

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
