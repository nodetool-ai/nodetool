# nodetool-timeline

A native desktop prototype of the NodeTool timeline editor: C++20, Qt 6
Quick (QML), QRhi for the GPU preview, and FFmpeg. The design and the
milestones are in [docs/DESIGN.md](docs/DESIGN.md) and [docs/PLAN.md](docs/PLAN.md).

Milestones M1a, M1b and M1c are in. The app loads a timeline JSON fixture and
composites its video layers on the GPU at the playhead time. A clip with a
`mediaPath` decodes with FFmpeg on a worker thread (software decode, YUV
planes converted in the shader). A clip without media shows a synthetic test
pattern. With `--decode hw` or `auto`, video decodes with VideoToolbox and
the frames go to the GPU with no copy (M1c).

## Native chat (opt-in)

Build the [native chat component](../chat/README.md) into the timeline with
`-DNT_ENABLE_CHAT=ON`. Launch with `--chat` to open its panel, or use the Chat
button beside the document controls. Configure the server and bearer token in
the panel. Provider credentials remain on the server.
Chat shares the existing right dock with Inspector and can be moved using the
dock controls.
`--chat --screenshot PATH` captures the complete editor with its chat panel.
Run this with the offscreen platform or under Xvfb.
With `--chat`, `NODETOOL_CHAT_SERVER` connects the panel at startup and
`NODETOOL_TOKEN` supplies its bearer token without a command-line credential.

The host advertises `ui_timeline_get_state`, `ui_timeline_seek`,
`ui_timeline_add_marker` (time and label), and `ui_timeline_delete_marker`.
These tools address the open document only. Marker changes use the editor's
existing commands, so Undo, Redo and local or server autosave apply. Other
editor capabilities return an unsupported error. Closing chat disconnects its
transport and leaves playback running.

From `native/timeline/`, `ctest --test-dir build -R tst_chathost --output-on-failure` checks that a host
tool edit is undoable, survives save/reload and preserves unknown document
fields. This host test also builds when the chat panel is disabled.
`node scripts/chat-integration.mjs --bin build/nodetool-timeline` starts an
isolated HTTP/WebSocket mock and drives a real native host edit under Xvfb.
It checks the tool result, replay protection, local persistence and a full
editor screenshot. It does not call a model provider.

## Build and test

Requires Qt 6.12 (the build rejects other minor versions, because QRhi is a
private API), Ninja, CMake 3.24 or newer, and FFmpeg with pkg-config files. On
macOS:

```bash
brew install qt ninja ffmpeg ffmpeg-full harfbuzz freetype lame
export PATH="$(brew --prefix ffmpeg-full)/bin:$PATH"
npm run build:packages
node native/timeline/scripts/check-ci-prerequisites.mjs
native/timeline/scripts/make-fixtures.sh
cmake -S native/timeline -B native/timeline/build -G Ninja -DCMAKE_PREFIX_PATH=$(brew --prefix qt)
nice -n 10 cmake --build native/timeline/build -j 2
ctest --test-dir native/timeline/build
```

The checks need FFmpeg's `drawtext` filter and the encoders verified by
[`check-ci-prerequisites.mjs`](scripts/check-ci-prerequisites.mjs). Homebrew's
`ffmpeg-full` supplies that command-line tool. The packaged LGPL libraries are
built separately by [`build-ffmpeg-lgpl.sh`](scripts/build-ffmpeg-lgpl.sh), which
needs LAME development files for MP3 export (`libmp3lame-dev` on Debian/Ubuntu).
The editor and its UI test hosts link one shared static QML module. CI caches
compiler output before running tests, so a test failure does not discard it.

### Linux

Tested on Arch Linux with GCC 16, CMake 4, Qt 6.12.0 from `aqtinstall`
(`linux_gcc_64` with `qtshadertools`), the distribution's FFmpeg 9.0
(`libavcodec` 63) with its headers, libva 2.24, the Vulkan loader and
headers, and an NVIDIA RTX 3060 with `nvidia-vaapi-driver` 0.0.18 (direct
backend) for VAAPI. The system FFmpeg builds as is; the LGPL build of
`scripts/build-ffmpeg-lgpl.sh` is the packaging and CI choice, not a
requirement. Run from `native/timeline/`:

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH=$HOME/qt/6.12.0/gcc_64
nice -n 10 cmake --build build -j 2
scripts/make-fixtures.sh
QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a -s "-screen 0 1920x1080x24" \
    ctest --test-dir build -j 2 --output-on-failure
node scripts/plan-conformance.mjs --bin build/nodetool-timeline
node scripts/op-conformance.mjs --bin build/timeline-ops
QT_QPA_PLATFORM=xcb QSG_RHI_BACKEND=vulkan xvfb-run -a -s "-screen 0 1920x1080x24" \
    node scripts/check-group-surfaces.mjs --bin build/nodetool-timeline
```

The build runs at low priority with two jobs, so concurrent builds do not
overload the machine. Every GUI run goes through Xvfb (`xvfb-run`) or the offscreen platform, so
no window reaches the desktop. The render tests need a Vulkan device:
`vulkaninfo --summary` must name the GPU, not `llvmpipe`. Hardware decode
needs a VAAPI driver that exports DMA-BUF: `vainfo --display drm --device
/dev/dri/renderD128` lists its profiles. Check a run with
`QSG_INFO=1 QT_LOGGING_RULES="qt.rhi.general=true"`: the log names the
physical device. The loader report says `ok (vaapi)` for a clip on the
hardware path, and the bench reports `cpuCopies` 0 and
`hardwareLayerFrames` equal to frames times layers.

Without `QSG_RHI_BACKEND`, Qt Quick on xcb uses OpenGL, which under Xvfb is
Mesa llvmpipe. `--decode hw` and `auto` select Vulkan
(`hw::selectGraphicsApi`). Stills and screenshots are correct on both
backends: an OpenGL readback, bottom row first, is flipped before it is
saved.

Linux results (October 2026, the machine above):

- All 36 ctest tests pass under Xvfb on the NVIDIA Vulkan device, with the
  hardware tests (`tst_ffmpegsource`, `tst_sourcepool`) on VAAPI. Skipped
  inside them: `tst_editpreview` `liveEditCostOnALargeDocument` until
  `node scripts/make-ui-fixture.mjs` has written its fixture (as on every
  platform; it passes once the fixture exists). `macho_deps` is registered
  on macOS only.
- `--decode hw` stills equal `--decode sw` stills on the same backend
  (PSNR infinite) for `video-4tracks`, `video-8tracks`, `video-4k-hevc`,
  `video-cuts`, `media-tracks`, `video-scrub-intra`, `video-scrub-gop`,
  `video-scrub-4k-hevc` and `av-sync`.
- NVDEC has no lossless or 4:4:4 H.264 profile: the colour-bar fixtures
  (High 4:4:4 Predictive, `-qp 0`) and the GBRP files show the placeholder
  with `--decode hw` and fall back to software with `auto`.
- With `VK_LOADER_LAYERS_ENABLE='*validation*'`, the only message is Qt's
  own: `vkCreateImage(): pCreateInfo->initialLayout is
  VK_IMAGE_LAYOUT_PREINITIALIZED but tiling is VK_IMAGE_TILING_OPTIMAL`
  (VUID-VkImageCreateInfo-initialLayout-12478), once per `QRhiTexture`,
  also with software decode.
- Audio: `--audio-devices` lists the PulseAudio devices (PipeWire) and
  opens none; the offline mix and the null-device A/V sync pass in ctest.
  The real-time checks of `scripts/window-checks.sh` play sound and were
  not run.

Two driver limits shape the Linux hardware path. nvidia-vaapi-driver
numbers every surface a decode context uses and allows 32: past that,
`vaBeginPicture` fails with `VA_STATUS_ERROR_MAX_NUM_EXCEEDED` and a later
`vaSyncSurface` on that surface never returns. The scrub cache therefore
keeps a system-memory NV12 copy of each VAAPI frame instead of its surface
(`hw::cacheCopy`): 2.5 ms per 1080p frame and 8.7 ms per 4K frame on the
decoder thread. And a surface whose first `vaSyncSurface` comes from the
render thread, while the decoder decodes into the same context, can wait
forever, so the decoder thread syncs every frame first (`hw::syncFrame`).

On the development machine, the loaded NVIDIA kernel module (610.57) did
not match the installed userspace (615.78); a matching 610.57 userspace
unpacked in `~/.local/nvidia-610`, sourced before each GPU run, worked
around that. Without it, Vulkan silently fell back to llvmpipe. This is a
note about that machine, not a requirement.

`scripts/make-fixtures.sh` keeps files that exist. After pulling a change
to how it writes a file, delete that file or pass `--force`.

## Run

Run from `native/timeline/`:

```bash
./build/nodetool-timeline fixtures/video-4tracks.json           # open the editor
./build/nodetool-timeline fixtures/video-4tracks.json --play    # start playing
./build/nodetool-timeline fixtures/video-4tracks.json --seek 5500 --screenshot /tmp/m1b.png
./build/nodetool-timeline fixtures/video-cuts.json --stills /tmp/stills --still-frames 0,59,60
./build/nodetool-timeline fixtures/video-cuts.json --play-stills /tmp/play --still-frames 59,60,61
./build/nodetool-timeline fixtures/video-rejections.json --probe-media
```

`--screenshot` and `--stills` render with no window: a `QQuickRenderControl`
on the QRhi (Metal on macOS) draws into an offscreen texture. A still waits
until every layer shows its exact frame for that time, then reads the
compositor canvas back at sequence size, so it compares with `nodetool
timeline render --stills`. `--play-stills` plays the clock in real time
(after the first frames are ready, D22) and keeps the first picture shown at
each frame, as a viewer sees a cut; it writes `play-report.json` with the
frames shown and the frames playback passed without showing. `--probe-media` opens every media clip without
decoding and prints the loader report as JSON: per clip, the facts and why a
clip is not used. The app logs the same report to stderr as clips open.

A run that is not interactive never takes the keyboard focus or comes to the
front: `--bench`, `--screenshot`, `--stills` and `--background` set
`QT_MAC_DISABLE_FOREGROUND_APPLICATION_TRANSFORM=1` and
`QT_MAC_SET_RAISE_PROCESS=0` before the application starts, and the bench
window has `Qt::WindowDoesNotAcceptFocus`.

Print the frame plan (the layers, opacities and matrices SceneEval resolves)
without a window:

```bash
./build/nodetool-timeline fixtures/three-tracks.json --dump-plan --times 0,8500,12000
```

Space toggles play. Click or drag the ruler to seek. Other options:
`--size WxH` sets the window size, `--background` keeps an interactive run
in the background.

Only a plain interactive launch plays sound on the default output device
(`--audio system`): no options, or only `--size`, `--seek`, `--play`,
`--decode`/`--decoder` and `--on-top`. Any other option, in either spelling
(`--play-stills DIR` or `--play-stills=DIR`), defaults to `--audio none`.
`--audio-dry-run` prints the mode a command line selects and exits without
opening a device. See [Audio](#audio-m3).

## Tracks UI (M2)

The tracks region copies `web/src/components/timeline/Tracks/` component by
component (`TracksRegion`, `TimeRuler`, `TrackHeader`, `TrackLane`, `Clip`,
`ClipBody`, `Playhead`, `TimelineZoomControls`, `TimelineScrollbar`), with the
web theme tokens in `qml/Theme.qml`, the web fonts (Inter, JetBrains Mono,
OFL, in `fonts/`) and the Material icon paths in `qml/Icons.qml`
(`node scripts/extract-icons.mjs` regenerates it).

- Zoom and pan (D29): `src/ui/TimelineWheel` holds the wheel, pinch, scroll
  bar and anchored-zoom math of `timelineWheel.ts`, `TimelineScrollbar.tsx`
  and `TracksRegion.tsx`. `TimelineViewState` holds msPerPx, the scroll and
  the viewport; `TimelineGestureArea` turns Qt wheel and `ZoomNativeGesture`
  events into DOM deltas (a trackpad pixel delta negated, a mouse notch as
  Chromium's 100 px, a pinch as `-100 * ln(1 + value)`), and the zoom of one
  frame applies once, in the item's polish step.
- Virtualization (D27, D28): `TrackWindowModel` exposes the rows of
  `visibleTrackWindow` (3 rows of overscan); each lane's `LaneClipModel`
  holds the clips inside the viewport plus 320 px on each side, and the clip
  under a drag (pinned until the drop).
- The playhead is the only item bound to the clock (D30).
- Clip drags, trims and the editing keys are M4 (below).

```bash
./build/tst_tracksui        # offscreen: QT_QPA_PLATFORM=offscreen, software scene graph
./build/tst_timelinewheel   # the pure math, with the web test cases
node scripts/make-ui-fixture.mjs   # fixtures/generated/ui-200tracks.json: 200 tracks, 2000 clips
node scripts/make-ui-fixture.mjs --audio-media   # the same with a waveform on each audio clip
./build/nodetool-timeline fixtures/generated/ui-200tracks.json --ui-bench --size 1920x1080 --ui-gui-p95 8
```

`tst_tracksui` loads `TracksRegion` into a `QQuickView` on the offscreen
platform (no window appears) and sends synthetic wheel, native-gesture and
mouse events. It checks the anchored zoom, the per-frame zoom batching,
pinch, pan, vertical scroll, the scroll bar, the ruler seek, the row and
clip windows on 50 x 200 and 200 x 10 clip timelines, a drag past the
overscan (the delegate and the grab survive, the drop lands at the pointer),
and that 60 frames of playback change no model, no delegate and no ruler
paint.

`--ui-bench` plays the preview and zooms and pans the tracks on a script
(pinch in, swipe, pinch out, scroll, Ctrl-wheel, swipe back; 2 events per
frame), then prints one `uiBench` JSON line. Offscreen (the default) it
renders through `QQuickRenderControl` with no window and reports each stage
of the GUI thread: `inputMs` (the clock tick and the synthetic events),
`polishMs`, `syncMs`, `renderMs`; `guiMs` is input + polish + sync, the GUI
thread's share of a frame in a threaded render loop. This mode (`mode:
offscreen-throughput`) has no vsync and does not measure the presentation
rate. Sampling starts once the newest frame draws every media layer (at
least 4) within one frame of its expected frame, the same rule the run
counts, and the run fails (exit 1) unless 95% of the measured frames drew
them and the shown time moved (`preview`). A hardware decoder that opens
mid-GOP shows the keyframe before its in-point while it catches up, so the
measured range waits for that. `NT_UIBENCH_MISSES=1` prints each measured
frame that missed, with its layer counts and frame error. `--ui-gui-p95 MS` fails the run at or over the limit.
`--ui-window` runs the same script in a window, adds `frameIntervalMs`, and
is run only by `scripts/window-checks.sh`.

### Toolbar, clip pictures, markers, save state (M2b)

- Toolbar (`ToolToggle.tsx`): the ten pointer tools in Premiere's order, the
  Ripple toggle, the drop modes (one exclusive choice), Snap, Linked and
  Follow, then Help and the zoom. The tooltips show the shortcut of the
  keyboard layout. The row drops its labels when it overflows and takes them
  back only when the bar is as wide as the labelled row was
  (`toolbarFit.ts`). The tools act as on the web: Cut splits at the pointer,
  Slip moves the source (`planSlip`), Slide trims the neighbours
  (`slideClip`), Track select selects from the pointer on (Shift: that
  track), Rate stretch turns an edge drag into a speed change
  (`rateStretchClip`), Hand drags the lanes, Zoom zooms x0.5 at the click
  (Alt: x2). `op-conformance.mjs` runs the package's `rateStretch` and
  `slideEdit` tests against the native ops, and the store differential
  covers `rateStretchClip`, `slideClip` and `planSlip`.
- Help (`?` or the button) opens the shortcut sheet of
  `TimelineShortcutsDialog.tsx`. `scripts/extract-keymap.mjs` reads its
  groups and the English strings into `KeymapData.h`, next to the keymap.
  A row the native editor does not run yet is dimmed and says so
  (`ClipGestureController::availableActions`).
- Clip pictures (`src/ui/MediaPreviews`): the waveform of an audio clip and
  the filmstrip of a video clip (the picture of an image clip). The peaks are
  the server's (`audio-peaks.ts`: channel 0, block maxima, 2000 peaks rounded
  to 1/10000). The thumbnails are `clipThumbnails.ts`'s (24 frames at
  i / 23 of the length, 160 px wide, in one atlas built on the worker). Both
  decode off the GUI thread, two files at a time, into a process cache keyed
  by file version (path, size, modification time), so a file replaced in
  place decodes again and a completion for an old version is dropped. Each
  request names its item. A job whose items are all gone is dropped, or
  interrupted when it runs. The cache keeps the thumbnails of the 32 most
  recent files, and a failure retries after 30 s. The waveform is one
  geometry node and the filmstrip texture nodes over one shared texture per
  atlas and window. Unused textures are freed beyond a 64 MiB budget. Both
  draw only the part of the clip within one viewport of the view, so a long
  clip at the finest zoom costs no more than a short one. Playback repaints
  nothing (D30).
  `node scripts/peaks-check.mjs SERVER TIMELINE_ID` compares the native
  peaks with the server's route for every audio asset of a timeline opened
  once with `--server` (`--peaks FILE` prints the native ones).
- Markers and the in/out range: `M` adds a marker at the playhead (an undo
  entry on the raw `markers` array), Shift+M and Ctrl+Shift+M go to the next
  and previous one, a flag's label seeks and its x deletes it. I and O set
  the range (view state, as the web's playback store), X marks the selection
  or the clip under the playhead, Shift+I and Shift+O go to it, Ctrl+Shift+X
  clears it. The ruler draws the band and the marker
  lines.
- Save state of a server timeline (`autosave`, M5b): the document bar shows
  the name, the save state (Saved, Unsaved changes, Saving..., Not saved)
  and Undo and Redo. A conflict shows a warning banner with `lastError`. A
  stripped save shows a dismissible banner that lists the fields. A banner
  names a recovery copy only through the controller's `keptCopy` and
  `recoveryError`, which it does not expose yet.

Not here yet: loop and play-in-to-out (the clock has no range), the Bars
ruler and the grid division (no tempo grid), Generate,
Add text and the Script toggle, the web's per-change conflict merge (Accept
and Discard), and Retry on a failed save (the controller has no invokable
save).

## Editing (M4)

The clip edits copy the web: the operations of `packages/timeline`
(`trimClip`, `splitClip`, `rippleEdit`, `dropResolve`, snapping) in
`src/edit/ClipOps`, the store actions that wrap them with the lock and link
rules (`TimelineStore.ts`) in `src/edit/EditActions`, the gestures of
`useClipDrag.ts` and `useClipTrim.ts` (`trimModeFor`) in
`src/edit/ClipGestureController`, and the keys of `timelineKeymap.ts` in
`src/edit/Keymap` (the table is generated: `node scripts/extract-keymap.mjs`,
`--check` for drift). Every edit works on the raw clip JSON and keeps the
fields it does not own (D4).

- Move (body drag): snaps both edges within 8 px, Alt moves freely, follows
  the pointer onto a lane whose type takes the clip, moves a multi-selection
  together, and settles the drop with the drop mode (Overwrite; Ctrl/Cmd on
  release inserts). A click selects; Shift adds, Ctrl/Cmd toggles.
- Trim (the 8 px grips): plain, ripple (the Ripple toggle in the toolbar, or
  the B tool) or roll (Ctrl/Cmd, or the Shift+B tool).
- Keys (NodeTool preset): S split at the playhead, Delete, Shift+Delete
  ripple delete, Ctrl+A / Ctrl+Shift+A, arrows nudge a frame (Shift: a
  second), Ctrl+Z / Ctrl+Shift+Z, N snap, V/B/Shift+B tools, the zoom keys.
- Undo: a `QUndoStack` on `TimelineModel`. A gesture is one entry, a held
  nudge key one entry.
- Escape cancels a gesture and puts back the state at the press; any other
  editing key cancels the gesture first. A new document ends a gesture with
  no write (gestures are bound to the document generation).
- Trims, ripples and rolls stop at the source's end: the probed length of
  the media file (probed off the GUI thread), or until that is known the
  furthest out-point seen on the asset; a head roll uses the neighbour's.
- An edited clip keeps the media its load resolved (a relative path or a
  server cache path), so a split or an undone delete plays the same file.

Not ported, refused rather than half done: slicing keyframe and
source-anchored animation curves on a split or trim (a link unit with such
a member does not split at all), group clips as edit targets (a ripple still
moves a group with its children), a split or drop that would split or
remove a clip owning a media track, sync lock and track
targeting (every unlocked track counts), the Rate stretch, Slip, Slide,
Cut and Track select tools, duplicate and copy/paste, gap selection, the
marquee.

```bash
node native/timeline/scripts/op-conformance.mjs   # needs build-m2/timeline-ops
./build/tst_tracksui                               # gestures, keys, undo (offscreen)
./build/tst_editpreview                            # the preview draws an edit on the next frame
```

`op-conformance.mjs` checks the native code against the TypeScript in four
ways, through `timeline-ops` (one call per process, JSON in and out):
the package's own tests for the operations run unchanged with their imports
answered by the native code; a randomized differential of the operations;
a randomized differential of the web store's actions (`TimelineStore.ts`,
run in jsdom) against the native actions; and every key with every
modifier in each keymap preset. It lists the known failures with their
The package tests the native code does not pass are skipped by name and
replaced in `conformance/known-differences.test.ts`: the `toBe` identity
case with deep equality, and each unported-curve case with the exact
refusal error. The run fails when vitest fails, a requested suite is
missing, does not load or compares nothing, or a skipped test no longer
exists. Ids are compared strictly: every input id must come back unchanged,
only fresh 32-hex ids are renamed, clip ids must be unique and every
`parentId` must name a clip.

## Bench

```bash
./build/nodetool-timeline fixtures/synthetic-8.json --bench --frames 600 --size 1920x1080 --budget budgets/m1a.json
```

The bench needs a display. It renders `--warmup` frames (default 30) at t=0,
and keeps holding (at most 4 s) until every layer shows its exact frame, as
play start waits for its sources (D22); `scheduling.warmupReady` says
whether they were ready. Then it moves the playhead one sequence frame per rendered frame for `--frames`
frames, so 600 frames cover 20 s of a 30 fps timeline. Warm-up frames are left
out of every measurement. The `warmup` object reports the largest render
interval and CPU time among them, and the frame where each happened: window
show, source creation and pipeline setup land there. Vsync is on unless
`--no-vsync` is given.

It prints one JSON line to stdout. Each measurement has `p50`, `p95`, `max`
and `count`, or is `null` with no samples. The measurements are separate and
never added. Only intervals with both ends in the measured range count:

| Field | Meaning |
|---|---|
| `cpuMs` | The `render()` body: source uploads and command recording |
| `gpuMs` | Information only, with no budget. `QRhiCommandBuffer::lastCompletedGpuTime()` polled once per frame: the whole window's GPU time (QML included, at the physical size in `window`) for a frame up to `QRhi::FramesInFlight` earlier. The first measured frames are left out for that reason. `null` when under 90% of the frames saw a value |
| `submitIntervalMs` | Time between `QQuickWindow::frameSwapped` signals on the render thread. Qt emits it when a frame is queued for presentation, not when it is shown |
| `renderIntervalMs` | Time between `render()` starts |
| `screenRefreshHz`, `measuredCadenceHz` | Information only: the rate `QScreen` reports, and the rate the window ran at (the p50 submission interval snapped to 120, 60 or 30 Hz) |
| `targetHz`, `skippedSubmits`, `skippedSubmitsFraction` | Missed slots of an explicit target rate (`targetHz` in the budget, default 60): each submission interval over 1.5 target periods counts `round(interval / period) - 1`. A steady 30 Hz run therefore fails a 60 Hz target. `null` without vsync. The fraction is over the measured frames |
| `window` | Logical size, device pixel ratio, and physical size of the window |

**Not met yet:** the DESIGN presentation criterion (`presentIntervalMs` from the
drawable's presented time). The app does not read Metal drawable present
times, so the bench reports submission timing only.

`--budget` takes a JSON file (`budgets/m1a.json`) or the inline form
`targetHz=60,cpuMs.p95=2`. `submitIntervalMs` is a diagnostic: the budgets
no longer gate on it, because a millisecond of submission jitter is not a
missed slot. Keys are
`<cpuMs|submitIntervalMs|renderIntervalMs>.<p50|p95|max|count>` (`count` is a
minimum, the rest are maxima) or `skippedSubmitsFraction`. `gpuMs` takes no
limit. The run exits 1 when an entry is over its limit or has no samples, and
the `budget` object lists each result. Without `--budget` it exits 0. A bench
whose window closes before the report exits 3. Per-frame statistics are
collected only in bench mode.

`SyntheticSource` uploads its full pattern once. Later frames upload only the
moving block and, once a second, the timecode, so the measured CPU time is
mostly the compositor's.

### Media bench

```bash
./build/nodetool-timeline fixtures/video-4tracks.json --bench --realtime 15 --size 1920x1080 --budget budgets/m1b.json
```

`--realtime SECONDS` plays the clock in real time instead of stepping it,
then closes the timeline and times how long the decoders take to close. It
adds these fields:

| Field | Meaning |
|---|---|
| `frameError` | Per frame, the largest difference in source frames between the frame a drawn media layer shows and the D17 pick for the clock time. For a constant-rate source it is the index difference. For a variable-rate source it is 0 when the decoder reports the exact pick, else 1 (a lower bound) |
| `frameErrorZeroFraction` | Frames where every media layer drew at frame error 0, over all frames with a media layer |
| `heldFrames` | Frames that kept the last picture because no layer had a frame (D12) |
| `cutMisses` | Media layers on their first frame with no picture: a cut that was not pre-rolled |
| `missingLayerFrames` | Layer-frames without a picture |
| `mediaFrames`, `missingMediaFrames` | Frames with a media layer, and those where a media layer had no picture. A missing picture counts against `frameErrorZeroFraction` |
| `openDecodersMax`, `decoderCloseMs` | Most decoders open at once, and the time from closing the timeline to 0 open decoders (`null` after 3 s) |

`budgets/m1b.json` holds the M1b exit limits: `submitIntervalMs.p95` 17.5,
`cpuMs.p95` 8, `frameError.max` 1, `frameErrorZeroFraction` 0.95,
`missingMediaFrames` 0, `cutMisses` 0, `decoderCloseMs` 1000, `skippedSubmitsFraction` 0.01. A key
with no samples fails, so the media budget fails on a fixture without media.

## Media checks

```bash
node native/timeline/scripts/check-frame-numbers.mjs      # fixtures/video-cuts.json
node native/timeline/scripts/compare-golden.mjs native/timeline/fixtures/video-colorbars-bt709-limited.json --frames 0,45 --min-psnr 40
```

- `check-frame-numbers.mjs` reads the burnt-in 16-bit barcode back at every
  cut frame and the frames around it, and compares it with the source frame
  the D17 rule picks. It runs twice: settled stills (a paused seek to each
  frame: the seek check) and play captures (the first picture during
  real-time playback: the cut check). Both must pass. A black picture fails,
  because it would read as frame 0, and so does a frame playback never
  showed.
- `compare-golden.mjs` renders the same frames through `golden-import.mjs`
  and the native `--stills`, and fails when any PSNR (RGB, ffmpeg `psnr`) is
  under `--min-psnr`. The threshold is 40 dB, the PLAN value for colour.
  Measured: 48.8 dB on each of the four colour-bar files, 48.1–48.9 dB on
  `video-4tracks.json` (scaled layers over a full-frame layer). The RGB
  fixtures (`video-rgb-gbrp.json`, `video-rgb-png.json`) check the
  conversion of RGB input: the worker converts it to BT.709 limited range
  with swscale configured explicitly, and labels the planes so.
- `media-tracks.json` measures 43.8–46.4 dB on both decoders. Its files are
  tagged BT.601 (what the conversion wrote), so no golden check depends on
  the untagged guess.
- Untagged media keeps the D10 guess by height (R6, resolved in DESIGN.md):
  BT.709 at 720 lines or more, else BT.601. `timeline render` reads untagged
  media as BT.601 (the swscale default); aligning it is a follow-up for the
  export path. `untagged-hd-720p.mp4` and `untagged-sd-480p.mp4` and a ctest
  hold the guess.
- `ctest` runs the decoder tests (`tst_ffmpegsource`) on the files from
  `make-fixtures.sh`: a target between two frames, every frame in sequence
  with one seek, a seek forward past 1 s and back, a variable frame rate, a
  superseded seek, the last frame at end of stream, the queue size and decode
  horizon, a raw Annex-B stream with no timestamps (open, frame 0 at 0, a
  seek that recovers by reopening), RGB conversion colour, the queue snapshot
  that keeps a stale frame from reading as exact, and the four D10a
  rejections. `tst_sourcepool` checks that closing a clip never blocks the
  render thread and that the FFmpeg interrupt callback ends a blocked read.

## Hardware decode

```bash
./build/nodetool-timeline fixtures/video-8tracks.json --bench --realtime 15 --size 1920x1080 --decode hw --budget budgets/m1c.json
native/timeline/scripts/check-metal-validation.sh
node native/timeline/scripts/check-frame-numbers.mjs --decode hw
node native/timeline/scripts/compare-golden.mjs native/timeline/fixtures/video-colorbars-bt709-limited.json --frames 0,15 --min-psnr 40 --decode hw
```

`--decode` picks the decoder for every media clip (`--decoder sw|vt|auto` is
the PLAN spelling):

- `sw`: FFmpeg software decode, CPU planes uploaded each frame (M1b, the default).
- `hw`: FFmpeg with VideoToolbox. A clip VideoToolbox cannot decode fails
  and shows a placeholder, so a test knows the hardware path ran.
- `auto`: VideoToolbox, and software when it fails before the first frame.
  The loader report names the decoder and the reason
  (`media X: ok (software), VideoToolbox fallback: ...`).

A VideoToolbox frame keeps its IOSurface-backed NV12 `CVPixelBuffer`. On the
render thread, `src/preview/hw/VideoToolboxInterop.mm` turns each plane into
an `MTLTexture` through a `CVMetalTextureCache` on the QRhi's `MTLDevice`, and
`QRhiTexture::createFrom()` wraps it. A `FrameRef` holds the pixel buffer, the
Metal textures and the wrappers. When a newer frame replaces it, it goes to
`RetireQueue` with the frame number of its last use, and is released once
`QRhi::FramesInFlight` later frames have begun (D11). Only 8-bit NV12 is
wrapped; 10-bit output falls back (P010 waits, D10).

The bench adds `decode`, `cpuCopies` (planes uploaded from CPU memory; 0 on
the hardware path), `hardwareLayerFrames`, `frameRefCloseMs` (timeline close
to 0 live `FrameRef`s), and `cpu`: the process, GUI thread and render thread
CPU in percent of one core over the measured window, and the rest
(`decodeAndOtherPercent`: decode workers, FFmpeg and VideoToolbox threads, Qt).
With the basic render loop the GUI thread renders too
(`guiAndRenderShareThread`), and its time is subtracted once. A failed CPU
query reports `null`, not 0.
`budgets/m1c.json` holds the M1c limits, with `cpuCopies` 0 and
`frameRefCloseMs` 1000.

`check-metal-validation.sh` renders stills and play captures of
`video-4tracks.json` with `MTL_DEBUG_LAYER=1` on both decoders. It fails on a
non-zero exit, a validation failure in the log, or a log that does not show
validation enabled.

A bench run and a play-capture run hold an `NSProcessInfo` activity
(user-initiated, latency-critical). It keeps the run out of App Nap; it is
not what caused the stalls below.

### Stalls and window exposure

Qt stops rendering a window that is not exposed, and macOS takes exposure
away when another window, a Space switch or a full-screen app covers the
bench window. The playback clock runs on, so a covered run shows a long
render interval (or no frames at all). The bench therefore:

- logs every expose and AppKit occlusion change to stderr with a steady-clock
  time (`diag: ... expose not exposed`, `diag: ... occlusion occluded`);
- reports `exposureLosses` and fails the budget when the window lost
  exposure during the measured window;
- ends with exit 4 and `{"invalid": ...}` when no frame rendered for 3 s;
- lists render stalls over 50 ms in `stalls` (offset, render interval and
  `render()` time), and records `scheduling`: the process nice value and the
  QoS of the GUI, render and decode threads.

`--on-top` keeps the window above other windows without taking focus, which
stops ordinary windows from covering it (a Space switch or a full-screen app
still can). `NT_DIAG_FRAME_ERROR=1` logs each layer with a frame error over
2, with its source time and the shown frame. `--test-hide-after MS` hides the
window mid-run, to check the watchdog.

A note on niceness: zsh starts background jobs (`cmd &`) at nice 5
(`BG_NICE`), which `ps` shows as `SN`. Run a bench in the foreground to
measure at nice 0.

### Teardown and GPU errors

`--teardown-test` plays in a real window, deletes the preview item while
frames are in flight, and renders on. The renderer's destructor retires every
source's last frame, waits for the GPU (`QRhi::finish()`), and only then
releases the retire queue: Qt's Metal command buffers do not retain the
textures they sample. A completed handler on each frame's Metal command
buffer records the GPU's progress, and a `FrameRef` released before the GPU
finished with it is counted (`releasedInFlight`, which must stay 0).
`scripts/window-checks.sh` runs this case with the debug layer. Offscreen
frames cannot show the hazard: an offscreen QRhi frame waits for the GPU
before it returns.

### Window checks

```bash
native/timeline/scripts/window-checks.sh   # writes build/window-checks/summary.json
```

Every check that needs a real window runs from this one script: the M1b and
M1c budgeted benches, the teardown case, six stall measurements (F7) with
the process nice values, the expose and occlusion log, and the stall lists,
and the M2 tracks UI bench in a window (`--ui-bench --ui-window`), and the
M3 checks that need the system output: the live A/V sync on a loopback
device (`--av-sync-live`) and a 600 s soak with 4 video tracks and 8 audio
clips that counts underruns in the device callback. The M3 checks play
sound. The bench window never takes focus, but it is visible, so run the
script when nobody is using the machine. Everything else (ctest, stills, play captures,
the plan, frame-number, golden and Metal-validation checks) runs offscreen.

A frame VideoToolbox decoded but the GPU cannot import is part of the
source's state: before a hardware frame is shown, `auto` reopens in software
with the reason; otherwise, and in `hw`, the clip fails with the reason. A
decode error (from sending a packet or receiving a frame) before the first
VideoToolbox frame takes the same fallback; later, it fails the clip with
the reason instead of freezing on the last frame. The first open and every
reopen apply the same hardware policy.

## Scrub and seek (M1d)

```bash
node native/timeline/scripts/check-scrub.mjs native/timeline/fixtures/video-scrub-gop.json --max-p95-ms 100 --decode hw
node native/timeline/scripts/check-scrub.mjs native/timeline/fixtures/video-scrub-intra.json --max-p95-ms 30 --decode hw
./build/nodetool-timeline fixtures/video-scrub-gop.json --scrub-script scrub/m1d.json --json
```

`--scrub-script FILE` runs a scripted scrub offscreen (no window) and prints
one JSON report. `scrub/m1d.json` has three parts:

- `exactSeeks`: paused seeks to random frames, one at a time, with the scrub
  cache emptied before each (`coldCache`). Each is timed from the request to
  the first frame where every layer shows its exact frame: `latencyMs` and
  `framesToExact` percentiles.
- `cacheSeeks`: show a frame, seek away, seek back. The report has the
  trials attempted, the trials whose setup seeks timed out, `returnHits`
  (seeks back answered by the cache) and `sameFrame` (seeks back exact on the
  first frame after the request).
- `scrubs`: random-walk seeks at `rateHz` for `seconds` (mostly drag steps,
  one in twenty a jump), then stop. Each run records the requests, renders and
  wall time it delivered, whether the last request settled on its exact
  frame, how long that took, and a still for the barcode check.

The report also has the cache memory: resident bytes and their peak (after
eviction, and before eviction), the bytes the cache evicted while another
owner still holds them (`pinnedElsewhereBytes`), and the budget. It lists the
loader report per clip (`media`, with any fallback) and the hardware frames
still wrapped for the GPU (`liveFrameRefs`).

`check-scrub.mjs` runs it with a time limit (`--timeout-s`, default 300; the
child is killed and the verdict fails) and fails on:

- a seek p95 over `--max-p95-ms`, or a seek that never became exact;
- a scrub whose still does not carry the barcode of its last request;
- a run that did not deliver the script: fewer runs or seeks than scripted,
  a request rate under 90 % of `rateHz`, or a run shorter than `seconds`;
- a cache trial that timed out, missed the cache, or was not exact on its
  first frame;
- a missing or non-finite measurement, a budget other than 256 MB, or a peak
  over it.

`node --test scripts/check-scrub.test.mjs` checks the verdict against broken
reports and a run that never finishes.

The scrub cache (`src/preview/FrameCache`, D19) keeps decoded frames after
they leave a decoder's queue, keyed by media and pts, least recently used out
first, within a shared 256 MB of real allocations. A paused seek checks it
before it seeks. A cached frame is shown only when the frame decoded right
after it in the same run is cached and starts after the target. A header
frame rate proves nothing. While a decoder catches up to a seek target it
skips a non-reference frame only when a packet read earlier starts after it
and by the target, so a frame before a long presentation gap still decodes.

**Open GOP:** x265 writes open GOPs by default. The frames just before a
random access point are decoded after it and reference the GOP before it. A
seek to such a frame can land on the random access point, where those frames
are dropped, so the first frame out starts after the target. The decoder then
seeks further back (1 s, then double) in the same run. Before this, the
render thread restarted the seek at the same place on every frame (about 50
seeks a second), which was the "VideoToolbox hang" that M1d first reported
on `video-scrub-4k-hevc.json`. Software decode had the same loop
(`openGopFramesBeforeRandomAccessPoint`).

**Watchdog (hardware decode):** a hardware decoder can stop returning
frames: it blocks inside `VTDecompressionSessionDecodeFrame`, or accepts
packets and returns nothing. A hardware decoder with a pending target that
decodes no frame for 1 s is stalled. The pool retires it off the render
thread (a worker that does not end within 100 ms is abandoned), reopens the
clip in software for the rest of the session, and the loader report says
"hw decoder stalled, fell back to sw". `tst_sourcepool` proves both stall
forms with test seams. After the open-GOP fix, the 24-scrub 4K stress run did
not trigger it.

Fixtures: `video-scrub-gop.json` (1080p H.264, 2 s GOP),
`video-scrub-intra.json` (the all-intra 960 px proxy that `make-fixtures.sh`
writes, like the server's F4 proxy), and `video-scrub-4k-hevc.json` (4K HEVC,
2 s GOP, no proxy: the PLAN risk).

## Audio (M3)

```bash
ctest --test-dir build -R 'fade|mixer|audioclock|mix_reference|av_sync'
node scripts/check-av-sync.mjs --json
node scripts/check-mix.mjs
./build/nodetool-timeline fixtures/audio-mix.json --render-audio /tmp/mix.f32
./build/nodetool-timeline fixtures/av-sync.json --av-sync
./build/nodetool-timeline fixtures/av-sync.json --play-stills /tmp/play --still-frames 15,45 --audio null --audio-report /tmp/audio.json
./build/nodetool-timeline --audio-devices
```

No automated check makes a sound. The offline render reads the sources
directly, and every real-time check runs on miniaudio's null backend, which
renders at the device rate to no device.

- `--audio none|null|system` picks the output. With an engine, the device is
  the master clock (DESIGN.md D21): the playhead is the audible position.
  `--audio-latency-ms` sets the latency the null device reports, and
  `--audio-report FILE` writes the engine counters at exit: underruns
  (counted in the device callback), late starts, play start, the played
  length, source open failures (with the clip and reason) and decode
  errors, decoders opened and closed, output latency (on CoreAudio also the
  device, safety offset, stream and buffer frames). A decoder closes once
  its clip has played out or leaves the 3 s lookahead.
- `--render-audio OUT.f32` writes the offline mix as raw float32 stereo at
  48 kHz (`--from`, `--to`, `--rate`).
- `--av-sync` runs M3 exit 1 on a fixture whose sources click every second:
  each click of the offline mix within 1 ms of the time the clip placement
  gives it, and on the null device the clock reading that time within 1 ms
  when the click is audible, across a device change with a new latency. It
  also fails on an underrun, a late start, or a play start of 300 ms or more.
- `scripts/check-av-sync.mjs` adds the picture: at each click frame the
  settled still and the first picture of a real-time play on the audio
  clock (`--play-stills --audio null`) are the white flash with the expected
  barcode.
- `scripts/check-mix.mjs` diffs the offline mix with a reference that
  decodes the sources with the ffmpeg CLI and takes every rule from the
  TypeScript (`videoClipsWithOwnAudio`, `soundTrackSoloed`,
  `effectiveAssetId`, `resolveClipFades`, `clipFadeGain`, `sourceRate`, and
  the solo group and gain chain of `renderAudio.ts` and `AudioGraph.ts`), on
  the fixture and on solo, mute and master variants. Tolerance 1e-6.
- `scripts/fade-vectors.mjs` samples the TypeScript fade functions for
  `tst_fadecurves` (tolerance 1e-6). ctest runs it before the test.
- `tst_audioclock` drives `PlaybackClock` with a fake device that runs the
  real callback half of the clock on simulated time: play, seek, rate
  change, device change, fallback to the monotonic clock and back, the
  300 ms start deadline, and an hour on a device 100 ppm fast.
- `--av-sync-live` (window checks only) plays on the system output and
  records a loopback capture device, and compares each click's arrival with
  the audio-master clock. It fails, before any sound, when no loopback
  device is present. It is not M3 exit 3, which needs the presentation time
  of the flash frame on the drawable; no harness records that yet, so the
  window checks report exit 3 as not met. `--audio-devices` lists the devices and opens
  none.

The mix copies the web rules: clip `volumeDb` and fades, then the track
fader and pan for audio and midi tracks (a video track's own audio keeps
unity gain and centre pan, as `AudioGraph` never sets that chain), then
`master.volumeDb`. Mute, solo, the clip status, and the extracted-audio link
decide which clips sound. A clip speed reads the source at `sourceRate`,
resampled linearly (the pitch shifts, as with WebAudio `playbackRate`). A
cross-fade is two overlapping clips with fades, as `applyAudioCrossfades`
writes them. Not mixed yet: midi clips, clip and track effects, automation,
time remaps, and reverse play (a rate of 0 or less runs the monotonic clock
in silence). An edit applies to the sound from the next play or seek.

Play and seek send a seek command to the device. The decode worker fills a
PCM ring per clip near the position, and the callback starts the new
position once every clip within 250 ms holds 250 ms of PCM, or at the 300 ms
deadline (counted as a late start). The playhead holds at the target until
that position is audible. A rate change continues the timeline in the
callback without a refill.

`make-fixtures.sh` writes the audio media: float WAV tones
(`tone-440-48k-mono.wav`, `tone-220-48k-mono.wav`, `tone-lr-48k-stereo.wav`,
`tone-660-44k-mono.wav`), a click track (`clicks-48k.wav`: a 10 ms 1 kHz
cosine burst at each second), and `flash-beep-720p30.mov` (H.264 with a
white flash on frame 30 n, the barcode on top, and the click track as PCM
audio). `scripts/make-audio-soak.mjs` writes the soak fixture (4 video
tracks and 8 audio clips at every moment) and, with `--kind av-sync`, a
long flash-and-beep fixture.

## Platforms and packaging (M6)

```bash
scripts/package-macos.sh          # build-package/NodeTool Timeline.app
scripts/check-package-macos.sh    # verifies a copy of it in a temp folder
scripts/check-portable.sh         # the non-Apple code, as far as macOS can build it
scripts/build-ffmpeg-lgpl.sh      # FFmpeg 8.0 as LGPL shared libraries
```

Hardware decode sits behind one compile-time seam,
`src/preview/hw/HwInterop.h`: VideoToolbox on macOS, D3D11VA on Windows
(`D3D11Interop`: a GPU copy of each slice of the decoder's texture array
into one NV12 texture, wrapped as R8 and RG8), VAAPI on Linux
(`VulkanInterop`: DMA-BUF planes imported into the QRhi's Vulkan device),
or none. `HwWindow` picks the graphics API and the shared device. Any
hardware failure before the first frame falls back to software (D15).

- **macOS package.** `package-macos.sh` builds with the LGPL FFmpeg only
  (pkg-config sees no other), runs `macdeployqt` with the QML imports,
  rewrites the absolute paths that Homebrew's split Qt kegs leave, drops
  every rpath that leaves the bundle and every plug-in or QML module whose
  libraries the bundle does not have (`scripts/macho-deps.py prune`: QtPdf,
  the virtual keyboard, Qt 3D), adds the full licence texts (`licenses/`,
  the FFmpeg source's, miniaudio's, the fonts') and
  `Contents/Resources/source/` (the FFmpeg source tarball and
  `SOURCES.txt`: FFmpeg's configuration, then each Homebrew keg the bundle
  holds a file of, with its source archive, patches and recipe checksum),
  and renews the ad-hoc signatures. `macho-deps.py notices` builds that
  list from the bundle's Mach-O files, not from a fixed list, so OpenSSL,
  GLib, PCRE2, ICU, FreeType and every other library that `macdeployqt`
  copies get their licence texts (`licenses/third-party/<formula>/`) and
  their source. Each keg's source comes from its install record
  (`sbom.spdx.json`, `.brew/<formula>.rb`), not from the current Homebrew
  metadata, which can name a newer Qt than the one installed. The bundle has no identity signature and no notarization:
  that is a release step for the owner of a Developer ID.
  `check-package-macos.sh` copies the bundle to a temp folder and fails on
  any library path or rpath outside the bundle and the system, any
  `@rpath`, `@loader_path` or `@executable_path` reference that does not
  resolve to a file inside the bundle (`macho-deps.py check`), a dangling
  link, a missing licence text or source, a bundled library with no
  component in `components.json` (`macho-deps.py notices-check`), a Qt
  framework whose version is not the version of its named source, an
  FFmpeg that is not LGPL or
  carries `--enable-gpl`, an identity signature or a stapled ticket, and checks
  that the copy runs headless (`--audio-dry-run`, `--dump-plan`,
  `--probe-media`, `--screenshot` of the QML editor, `--stills` with
  `DYLD_PRINT_LIBRARIES`) with stills equal
  to the development build's. Do not open the bundle with `open` or Finder
  in an automated run: the editor would play sound.
- **Portable code on macOS.** `-DNT_PORTABLE=ON` builds without VideoToolbox
  and with the portable platform code (`src/platform/PlatformStubs.cpp`, the
  non-mach CPU counters). Its ctest runs; the hardware tests skip, as they
  do anywhere with `NT_NO_HW_DECODE=1`. `-DNT_CHECK_VULKAN_HEADERS=DIR`
  compiles the Linux hardware path against Qt's Vulkan API (objects only).
- **Not compiled yet.** The Windows path needs the Windows SDK. The Linux
  path builds and runs on Linux (see [Linux](#linux)). `.github/workflows/native-timeline.yml`
  builds and runs the headless ctest on macOS, Linux and Windows. The
  offscreen platform has no QRhi, so only the window-event tests set it
  (ctest `ENVIRONMENT`). The render tests (ctest label `render`) run on
  Metal on the Cocoa platform, on Vulkan on Mesa lavapipe through xcb under
  Xvfb (a `QVulkanInstance` attached by `hw::prepareWindow`), and on D3D11 on
  the WARP adapter through the Windows platform, and the step checks the
  backend and the adapter in their log. It packages the macOS app. It also
  holds a Windows `windeployqt` package, whose smoke runs use a copy with
  PATH cut to the system folders (`--screenshot`, `--stills`), and a Linux
  AppImage step, both unverified.
  The workflow has not run.
- **Budgets.** `bench/budgets-<platform>-m1b.json` and `-m1c.json` carry the
  macOS measurements and a `_machine` record to fill in on the reference
  Windows and Linux machines. Keys that start with `_` are not budgets.

## Plan check

```bash
npm run build:packages   # once, for the @nodetool-ai/timeline dist
node native/timeline/scripts/plan-conformance.mjs [--json]
```

```bash
node native/timeline/scripts/plan-conformance.mjs --examples   # the 7 shipped example timelines
node native/timeline/scripts/make-scene-fixtures.mjs           # rewrites fixtures/scene-*.json
```

The script runs `--dump-plan` on every fixture at a 100 ms grid plus each clip
edge (±1 ms) and transition midpoint. It compares the result with the web
scene model from `@nodetool-ai/timeline/scene`, built the way the browser
compositors build a frame: `computeActiveLayersWithHorizon` with the sequence
canvas and camera, `resolveAnimatedLayerProps`, `transitionTransform` and
`buildTransformMatrix` with the group's matrix. It compares the active set, the
draw order, and per layer z, kind, opacity, blend mode, stack order,
precompose surface, the animated transform, the cut geometry and the matrix,
with a tolerance of 1e-6, and the precomposite surfaces and the dropped layers.
Each fixture must first pass the protocol's `timelineSequenceResponse` Zod
schema. It exits non-zero on a schema error or a mismatch, and when it compared
0 layers. It checks that every native layer has finite numbers and a 16-element
matrix before it compares, and counts a layer only when every value matches.
`--json` prints one object with the verdict and the result per fixture.
Without `--bin` it runs the most recently built `build*/nodetool-timeline`.
It refuses (exit 2) a binary older than any source of the plan (`src/scene`,
`src/preview`, `src/model`, `src/server`, `src/main.cpp`, `third_party/yoga`),
and names the newest such file.

The excluded clips and their reasons must equal `fixtures/plan/exclusions.json`
(rewrite it with `--update-exclusions` after a deliberate change). A flex
reason fails the run, since flex is ported. The script audits every excluded
clip: it compares the clip's own layers and surfaces and those of its
descendants (so a group is judged by what it places), and an excluded clip
whose evidence all matches fails the run as a stale exclusion. An excluded
clip with nothing drawn at the sampled times is listed as having no coverage.
A clip excluded only for a `line` stagger is compared as usual: the oracle
has no text measurer, so both sides count explicit line breaks, and the
result lists the measured wrapping as unverified. Each layer a flex group
resized also carries `flexShapeBox` or `flexTextMaxWidthFrac`, compared with
the web's resized shape or text style. The times
are a 100 ms grid plus ±1 ms around every clip edge, cut end, animation window
edge, keyframe and loop seam. `tests/tst_easing.cpp` compares every easing
with the web's values from `scripts/ease-vectors.mjs`, inside and outside
[0, 1].

Clips with a plan-level unsupported field (`planUnsupported` in the dump:
animation links, the `followPath` preset, `line` staggers, beats,
track automation, track bindings, own or inherited from a group) are left out
on both sides; the result says how many. The `scene-*` fixtures cover nested
groups, precomposites, a parent cycle, the scene camera, 2.5D transforms, a
matte, a caption, every easing and ported preset, repeaters, echoes, stepped
time, a source-time curve, staggers, every transition type, and flex groups
(`scene-flex.json`: wrap, justify and align values, percent and min/max sizes,
absolute children, nested and rotated containers, path leaves, animated text).

The flex layout (`src/scene/FlexLayout`) runs the web's algorithm on Yoga
3.2.1, the C++ source of the `yoga-layout` npm package, built without fused
multiply-add so its float rounding matches the WebAssembly build. Text leaves
measure with the scene model's fallback rule (`text.length * fontSizePx *
0.6`), the rule the oracle uses; the browser measures with its fonts, so a
flex tree with text can sit differently in the web editor than in this
prototype.

The layout is cached (`flexLayoutFor` in SceneEval) by document revision,
canvas size and the animated text styles, as `layout.ts` caches it by the clips
array. `TimelineModel` gives every new snapshot a new `Timeline::revision`; a
revision of 0 (a document no model owns) is never cached.

## Golden import

```bash
native/timeline/scripts/make-fixtures.sh            # once, for fixtures/media/
node native/timeline/scripts/golden-import.mjs      # fixtures/media-tracks.json
```

`nodetool timeline render` reads clip media only from the local asset store.
The script imports each clip's `mediaPath` file into a scratch store under
`build/golden/store/` (its own SQLite file and asset folder, never the user's
NodeTool data), writes a copy of the fixture with the asset ids as
`currentAssetId`, and renders frames 0, 255 and 390 as PNG stills into
`build/golden/media-tracks/stills/`. It deletes only folders it created
(each holds a `.golden-import-owned` marker). It refuses an `--out` that
overlaps the NodeTool data, asset or database folder, the fixture folder, the
sources outside `build/`, or the repository. It exits 1 when the fixture fails the
Zod check, a media file is missing, a clip was skipped, or a still is missing.
`--frames` and `--out` change the selection and the output folder.

Group surfaces (DESIGN.md D35) against the export:

```bash
node native/timeline/scripts/check-group-surfaces.mjs [--decode auto] [--json]
```

For each fixture it runs `compare-golden.mjs` (PSNR at least 40 dB) and checks
how many surfaces the frame drew (the scrub runner's `frames` report). Then it
injects a surface allocation failure (`NT_TEST_FAIL_SURFACES=1`): the frame
must not be exact, must report the failure, and a still run must exit 1.

- `video-group-opacity.json`: two overlapping opaque children in a group at
  opacity 0.5. The overlap covers 0.5, not the 0.75 that drawing each child
  at half opacity gives.
- `video-group-stacking.json`: the group's surface stacks at the group's
  track, below an unrelated clip that sits between its children's tracks.
- `video-group-cut-push.json`, `video-group-cut-zoom.json`: the group's cut
  moves and scales the composed group.
- `video-group-nested.json`: a group at 0.7 holds a group at 0.6 with two
  children at 0.5, over colour bars (2 surfaces).
- `video-group-tie.json`, `video-group-tie-below.json`: a group and a clip at
  the same track and start; the stack order sets which one is on top.
- `video-group-empty.json`: a group with no active child draws no surface.

Their children use RGB H.264 (`rgb-solid-720p.mp4`), which VideoToolbox does
not decode, so `--decode hw` shows placeholders by design. Use `auto`.
`check-metal-validation.sh <fixture> <frames>` runs the Metal layer on any
fixture, and the scrub report's `surfaces` field gives the surfaces drawn per
frame and the render targets the pool created and holds.

## Server open

```bash
./build-m5/nodetool-timeline --server http://127.0.0.1:7777 --timeline <id>
./build-m5/nodetool-timeline --server http://127.0.0.1:7777 --timeline <id> --dump-plan --times 0,500
./build-m5/nodetool-timeline --server http://127.0.0.1:7777 --list-timelines
node native/timeline/scripts/server-check.mjs       # M5a exit checks on scratch servers
```

`--server URL --timeline ID` takes the place of the fixture file in every
mode (`--stills`, `--dump-plan`, `--probe-media`, `--bench`). The client
(`src/server/`) only reads: `timeline.get`, `timeline.list` and `assets.get`
over tRPC GET, `HEAD` for `package://` files, and `GET` with `Range` for
bytes. It sends no `Origin` header, so a loopback server runs it as user `1`.
`--token` (or `NODETOOL_API_TOKEN`) sends a bearer token instead.

Asset bytes go to a disk cache before decode: `--cache-dir`, else
`NODETOOL_TIMELINE_CACHE_DIR`, else the user cache folder. The path is
`<server>/<user>/<assetId>/<variant>/<version>.<ext>` (DESIGN.md D33). The
picture reads the proxy only when `proxy_status` is `ready`. Audio always
reads the original. A partial download resumes with `Range` after a
re-check of the version, and restarts from 0 on any mismatch. The raw
document of the last load stays in `<server>/<user>/timelines/<id>.json`.

The loader report (`--loader-report FILE`, else `<id>.report.json` next to
the raw document) lists each field with a value the model does not apply, per
sequence, track and clip, with its effect (`plan`, `pixels`, `audio`, or
`unknown` for a field not in the schema). It also lists the missing assets and
the rejected media (D10a) per clip, and the time of each load step. A load
fails only when `timeline.get` or the parse fails.

A server timeline saves itself (M5b): 750 ms after the last edit, while the
undo stack is not clean, the app sends `timeline.update` with
`baseUpdatedAt` from the load and the raw document (D4). On a conflict
(`apiCode` ALREADY_EXISTS) it keeps the local document, writes it to
`<server>/<user>/timelines/<id>.local.json`, stops autosaving and reports the
conflict (`autosave.conflict` for QML). A non-empty `stripped` list is a
warning, and the sent document goes to `<id>.stripped.json` next to the raw
backup of the load. It never saves without a base. The harness:

```bash
./build-m5/nodetool-timeline --server URL --timeline ID --save [--move-clip CLIP:MS] \
    [--set-clip-field CLIP:KEY=JSON] [--wait-before-save FILE] [--autosave]
```

prints one JSON line (ok, conflict, updatedAt, stripped, dirty before and
after, the document it holds) and exits 0, 3 on a conflict, or 1.

`server-check.mjs` starts its own servers from this checkout on port 7799,
never 7777. Each server gets a fresh folder under `build-m5/scratch/` with its
own `HOME`, `XDG_*`, `DB_PATH`, `ASSET_FOLDER`, `STORAGE_PATH` and
`SECRETS_MASTER_KEY`. The script seeds the shipped example timelines, two media
fixtures, and one timeline with a ready, pending (held encode), failed and
absent proxy. A second server whose `ffmpeg` hides libx264 makes a VP9 proxy
(`scripts/fake-ffmpeg.sh`). The script writes only to these servers.

## Fixtures

- `fixtures/synthetic-8.json`: eight video tracks with one 1920×1080 clip
  each, all active for the whole 20 s. The bench budget runs on it.
- `fixtures/three-tracks.json`: three tracks, six overlapping clips with
  position, scale, rotation and opacity, 1920×1080 at 30 fps, 20 s.
- `fixtures/overlaps.json`: same-track overlaps (auto dissolve, a 400 ms
  crossfade, a dip to colour, a hard cut, a triple overlap), a corner anchor,
  a hidden clip, a hidden track, and an audio track.
- `fixtures/media-tracks.json`: the M1a layout with local video files
  (tagged BT.601).
- `fixtures/video-4tracks.json`: four 1080p30 H.264 tracks over 15 s, with
  hard cuts on the top track (one into a seek).
- `fixtures/video-8tracks.json`: eight 1080p30 H.264 tracks over 15 s (M1c exit 1).
- `fixtures/video-4k-hevc.json`: two 4K30 HEVC tracks, 8-bit 4:2:0 BT.709
  (M1c exit 2).
- `fixtures/video-cuts.json`: one full-frame track of hard cuts between
  numbered files, for the barcode check.
- `fixtures/video-colorbars-*.json`: SMPTE HD bars in BT.709 and BT.601,
  limited and full range.
- `fixtures/video-rgb-gbrp.json`, `fixtures/video-rgb-png.json`: SMPTE HD
  bars as GBRP H.264 and RGB24 PNG.
- `fixtures/video-rejections.json`: one file for each D10a rejection
  (rotation, pixel aspect, alpha, HDR) and one usable file.
- `fixtures/audio-mix.json`: the mix rules (M3): fades on all four curves, a
  plus3dB cross-fade, an in-point, a 1.5x clip, track gain and pan, a muted
  track, a failed clip, a video clip's own audio, and a master fader.
- `fixtures/av-sync.json`, `fixtures/av-sync-fractional.json`: the
  flash-and-beep video at an in-point on the sample grid, and 0.05 frame off
  it.

`scripts/make-fixtures.sh` writes the media to `fixtures/media/` (not checked
in), also `annexb-360p30.h264` (raw H.264, no timestamps) and three RGB
files (`rgb-solid-720p.mp4`, `rgb-bars-gbrp.mp4`, `rgb-bars-png.mov`). It keeps files that exist; `--force` rebuilds them. The numbered files
carry the frame number as text and as a 16-bit barcode in the top 40 rows (bit
k is the 80 px cell at x = 80k). It also writes the seek-test files
`seek-360p30.mp4` and `vfr-360p.mp4` (frame n at n/30 s for n < 30, then at
(2n − 30)/30 s).

All fixtures parse with `timelineSequenceResponse` from
`packages/protocol/src/api-schemas/timeline.ts`.

## Modelled fields

The model in `src/model/TimelineTypes.h` uses the schema's field names:

- Sequence: `id`, `name`, `fps`, `width`, `height`, `durationMs`, `tracks`,
  `clips`, `master.volumeDb`, and the scene camera `camera2d`.
- Track: `id`, `name`, `type`, `index`, `visible`, `locked`, `muted`, `solo`,
  `volumeDb`, `pan`.
- Clip: `id`, `trackId`, `name`, `startMs`, `durationMs`, `inPointMs`,
  `mediaType`, `width`, `height`, `hidden`, `muted`, `opacity`, `volumeDb`,
  `status`, `linkId`, `fadeInMs`, `fadeOutMs`, `fadeInShape`, `fadeOutShape`,
  `speedMultiplier`, `speedBaked`, `transform` (all eight fields) and
  `transitionIn` (every type, with easing, direction, color and softness).
- Scene fields, parsed once into `src/scene/ClipScene.h`: `parentId`,
  `animations` (presets and custom curves, `src/scene/Animation.h`),
  `repeater`, `temporalEcho`, `steppedTime`, `caption` words, `matte`,
  `generatedMatte`, `blendMode`, whether `effects` has an enabled entry, and
  whether a text, shape or 3D style is present.
- `mediaPath` on a clip is a prototype-only field, not in the schema. A real
  document references `currentAssetId`; a server open sets `mediaPath` and
  `audioPath` from the asset cache.

`src/preview/SceneEval` resolves a frame from these fields the way
`sceneModel.ts` does (see the table in DESIGN.md § Scene evaluation). Each
sequence, track, and clip also keeps its raw `QJsonObject`, so a later save
can write back the fields the model does not own.

## Layout

| Path | Contents |
|---|---|
| `src/model/` | Plain structs, JSON parsing, `TimelineModel`, `TrackListModel`, `TrackWindowModel` (visible rows) and `LaneClipModel` (visible clips) for QML |
| `src/ui/` | Tracks UI: `TimelineWheel` and `TimelineFormat` (pure math and labels), `TimelineViewState`, `TimelineGestureArea`, `RulerCanvas`, `UiBench` |
| `src/playback/PlaybackClock` | Play, pause, seek, rate. The time comes from the audio device when one runs, else from a monotonic clock |
| `src/playback/AudioClockFeed` | The seqlocked state between the clock and the device callback, and the callback half of the clock (`CallbackClockDriver`) |
| `src/audio/` | `AudioEngine` (miniaudio device, decode worker, PCM rings), `Mixer` (the mix rules and `mixBlock`), `FadeCurves`, `AudioSource` (FFmpeg and libswresample), `OutputLatency` (CoreAudio), `LoopbackCapture`, the audio CLI modes |
| `third_party/miniaudio.h` | miniaudio 0.11.22, one header (MIT No Attribution or public domain) |
| `third_party/yoga/` | Yoga 3.2.1, the flex layout engine (MIT, `LICENSE`), unchanged |
| `src/scene/FlexLayout`, `TextBlock`, `TextAnimation`, `SvgPath` | Flex layout, the text block box, animated text styles and SVG path bounds, ported from `@nodetool-ai/timeline` |
| `src/preview/SceneEval` | `activeLayersAt(timeline, t)` and the layer matrix. Pure functions |
| `src/preview/PreviewCompositor` | `QQuickRhiItem`: layers into a canvas texture, then the canvas letterboxed into the item |
| `src/preview/LayerSource.h` | The per-clip source interface. `SyntheticSource` and `FfmpegSource` implement it |
| `src/preview/FfmpegSource` | `FfmpegDecoder`: open, demux and decode on a worker thread, decode ahead, the D17 frame pick. `FfmpegSource`: the decoder's planes as textures |
| `src/preview/FrameRing` | The decode-ahead queue and the frame-pick rules. Pure rules, unit tested |
| `src/preview/YuvFormat` | YUV to RGB matrices for BT.709 and BT.601, limited and full range |
| `src/preview/hw/VideoToolboxInterop` | `CVMetalTextureCache` and `QRhiTexture::createFrom` wrappers for VideoToolbox frames; `FrameRef` |
| `src/preview/hw/HwInterop`, `HwWindow` | The hardware decode seam (D15, M6): decoder setup, frame checks and wrapping per platform; graphics API and shared device |
| `src/preview/hw/D3D11Interop`, `VulkanInterop` | Windows D3D11VA (not compiled on Windows yet) and Linux VAAPI-to-Vulkan frame import |
| `src/platform/PlatformStubs.cpp` | Linux and Windows: no-op App Nap and occlusion hooks |
| `src/preview/RetireQueue.h` | Releases a replaced frame's GPU resources after `FramesInFlight` frames (D11) |
| `src/platform/` | `ProcessActivity` (no App Nap during measured runs) and `CpuUsage` (process and thread CPU time) |
| `src/server/` | `ServerClient` (tRPC GET), `AssetCache` (D33 disk cache, Range resume), `FieldAudit` and `ServerTimeline` (the loader report), `ServerSource` (the `--server` arguments) |
| `src/preview/SourcePool` | Opens, pre-rolls and closes decoders (D18), draws placeholders for rejected media, keeps the loader report. Decoders are stopped and joined on a retire thread, never on the render thread |
| `shaders/` | Textured quad with a per-layer matrix and opacity, RGBA or YUV planes, premultiplied "over" |
| `qml/` | `TimelineEditor`, `preview/PreviewArea`, `Tracks/*`, named after the React components in `web/src/components/timeline/` |
| `src/bench/BenchReport` | Bench measurements, the budget parser, and the verdict. Pure |
| `budgets/m1a.json`, `budgets/m1b.json`, `budgets/m1c.json` | The M1a, M1b and M1c exit budgets |
| `tests/` | Qt Test suites for `SceneEval`, `TimelineJson`, `BenchReport`, `FrameRing`, `YuvFormat`, `FfmpegSource`, `SourcePool`, `RetireQueue`, `TimelineWheel` and the tracks UI (`tst_tracksui`) |
