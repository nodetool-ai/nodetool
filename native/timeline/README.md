# nodetool-timeline

A native desktop prototype of the NodeTool timeline editor: C++20, Qt 6
Quick (QML), QRhi for the GPU preview, and FFmpeg. The design and the
milestones are in [docs/DESIGN.md](docs/DESIGN.md) and [docs/PLAN.md](docs/PLAN.md).

Milestones M1a and M1b are in. The app loads a timeline JSON fixture and
composites its video layers on the GPU at the playhead time. A clip with a
`mediaPath` decodes with FFmpeg on a worker thread (software decode, YUV
planes converted in the shader). A clip without media shows a synthetic test
pattern.

## Build and test

Requires Qt 6.12 (the build rejects other minor versions, because QRhi is a
private API), Ninja, CMake, and FFmpeg with pkg-config files. On
macOS:

```bash
brew install qt ninja ffmpeg
cmake -S native/timeline -B native/timeline/build -G Ninja -DCMAKE_PREFIX_PATH=$(brew --prefix qt)
cmake --build native/timeline/build
ctest --test-dir native/timeline/build
```

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

## Bench

```bash
./build/nodetool-timeline fixtures/synthetic-8.json --bench --frames 600 --size 1920x1080 --budget budgets/m1a.json
```

The bench needs a display. It renders `--warmup` frames (default 30) at t=0,
then moves the playhead one sequence frame per rendered frame for `--frames`
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
| `screenRefreshHz`, `measuredCadenceHz` | The rate `QScreen` reports, and the rate the window ran at: the p50 submission interval snapped to 120, 60 or 30 Hz. They differ when ProMotion or a background window runs slower than the panel |
| `skippedSubmits`, `skippedSubmitsFraction` | Missed vsyncs in the submission intervals: each interval over 1.5 periods of `measuredCadenceHz` counts `round(interval / period) - 1`. `null` without vsync. The fraction is over the measured frames |
| `window` | Logical size, device pixel ratio, and physical size of the window |

**Not met yet:** the DESIGN presentation criterion (`presentIntervalMs` from the
drawable's presented time). The app does not read Metal drawable present
times, so the bench reports submission timing only.

`--budget` takes a JSON file (`budgets/m1a.json`) or the inline form
`cpuMs.p95=2,submitIntervalMs.p95=17.5`. Keys are
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
- `media-tracks.json` measures 24–26 dB. Its four files are BT.601 but carry
  no colour tags. DESIGN D10 reads an untagged stream of 720 lines or more as
  BT.709, and `timeline render` reads it as BT.601. With the same files
  tagged BT.601, the fixture measures 43.8–46.4 dB, so the gap is the
  untagged default and not the compositor.
- `ctest` runs the decoder tests (`tst_ffmpegsource`) on the files from
  `make-fixtures.sh`: a target between two frames, every frame in sequence
  with one seek, a seek forward past 1 s and back, a variable frame rate, a
  superseded seek, the last frame at end of stream, the queue size and decode
  horizon, a raw Annex-B stream with no timestamps (open, frame 0 at 0, a
  seek that recovers by reopening), RGB conversion colour, the queue snapshot
  that keeps a stale frame from reading as exact, and the four D10a
  rejections. `tst_sourcepool` checks that closing a clip never blocks the
  render thread and that the FFmpeg interrupt callback ends a blocked read.

## Plan check

```bash
npm run build:packages   # once, for the @nodetool-ai/timeline dist
node native/timeline/scripts/plan-conformance.mjs [--json]
```

The script runs `--dump-plan` on every fixture at a 100 ms grid plus each clip
edge (±1 ms) and transition midpoint. It compares the result with
`computeActiveLayers`, `resolveAnimatedLayerProps` and `buildTransformMatrix`
from `@nodetool-ai/timeline/scene`: the active set, the draw order, z, opacity,
and the matrix, with a tolerance of 1e-6. Each fixture must first pass the
protocol's `timelineSequenceResponse` Zod schema. It exits non-zero on a
schema error or a mismatch, and when it compared 0 layers. It checks that
every native layer has finite numbers and a 16-element matrix before it
compares, and counts a layer only when every value matches. `--json` prints
one object with the verdict and the result per fixture.

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

## Fixtures

- `fixtures/synthetic-8.json`: eight video tracks with one 1920×1080 clip
  each, all active for the whole 20 s. The bench budget runs on it.
- `fixtures/three-tracks.json`: three tracks, six overlapping clips with
  position, scale, rotation and opacity, 1920×1080 at 30 fps, 20 s.
- `fixtures/overlaps.json`: same-track overlaps (auto dissolve, a 400 ms
  crossfade, a dip to colour, a hard cut, a triple overlap), a corner anchor,
  a hidden clip, a hidden track, and an audio track.
- `fixtures/media-tracks.json`: the M1a layout with local video files
  (untagged BT.601, see Media checks).
- `fixtures/video-4tracks.json`: four 1080p30 H.264 tracks over 15 s, with
  hard cuts on the top track (one into a seek).
- `fixtures/video-cuts.json`: one full-frame track of hard cuts between
  numbered files, for the barcode check.
- `fixtures/video-colorbars-*.json`: SMPTE HD bars in BT.709 and BT.601,
  limited and full range.
- `fixtures/video-rgb-gbrp.json`, `fixtures/video-rgb-png.json`: SMPTE HD
  bars as GBRP H.264 and RGB24 PNG.
- `fixtures/video-rejections.json`: one file for each D10a rejection
  (rotation, pixel aspect, alpha, HDR) and one usable file.

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

- Sequence: `id`, `name`, `fps`, `width`, `height`, `durationMs`, `tracks`, `clips`.
- Track: `id`, `name`, `type`, `index`, `visible`, `locked`, `muted`.
- Clip: `id`, `trackId`, `name`, `startMs`, `durationMs`, `inPointMs`,
  `mediaType`, `width`, `height`, `hidden`, `muted`, `opacity`, and
  `transform` (`position`, `scale`, `rotation` in radians, `anchor`), and
  `transitionIn` (`type`, `durationMs`, `easing`). Transitions set opacity
  only: the incoming and outgoing opacity of each type, the auto dissolve
  across a same-track overlap, and `durationMs <= 0` as a hard cut. Easing
  and transition geometry and effects are not applied yet. `fadeInMs`,
  `fadeOutMs`, `fadeInShape` and `fadeOutShape` scale the picture opacity
  (`clipFadeGain`). `speedMultiplier` and `speedBaked` set the source time
  (`clipSourceMsAt` without time remap).
- `mediaPath` on a clip is a prototype-only field, not in the schema. A real
  document references `currentAssetId`.

Each sequence, track, and clip also keeps its raw `QJsonObject`, so a later
save can write back the fields the model does not own.

## Layout

| Path | Contents |
|---|---|
| `src/model/` | Plain structs, JSON parsing, `TimelineModel` and `TrackListModel` for QML |
| `src/playback/PlaybackClock` | Play, pause, seek. The time comes from a monotonic clock |
| `src/preview/SceneEval` | `activeLayersAt(timeline, t)` and the layer matrix. Pure functions |
| `src/preview/PreviewCompositor` | `QQuickRhiItem`: layers into a canvas texture, then the canvas letterboxed into the item |
| `src/preview/LayerSource.h` | The per-clip source interface. `SyntheticSource` and `FfmpegSource` implement it |
| `src/preview/FfmpegSource` | `FfmpegDecoder`: open, demux and decode on a worker thread, decode ahead, the D17 frame pick. `FfmpegSource`: the decoder's planes as textures |
| `src/preview/FrameRing` | The decode-ahead queue and the frame-pick rules. Pure rules, unit tested |
| `src/preview/YuvFormat` | YUV to RGB matrices for BT.709 and BT.601, limited and full range |
| `src/preview/SourcePool` | Opens, pre-rolls and closes decoders (D18), draws placeholders for rejected media, keeps the loader report. Decoders are stopped and joined on a retire thread, never on the render thread |
| `shaders/` | Textured quad with a per-layer matrix and opacity, RGBA or YUV planes, premultiplied "over" |
| `qml/` | `TimelineEditor`, `preview/PreviewArea`, `Tracks/*`, named after the React components in `web/src/components/timeline/` |
| `src/bench/BenchReport` | Bench measurements, the budget parser, and the verdict. Pure |
| `budgets/m1a.json`, `budgets/m1b.json` | The M1a and M1b exit budgets |
| `tests/` | Qt Test suites for `SceneEval`, `TimelineJson`, `BenchReport`, `FrameRing`, `YuvFormat`, `FfmpegSource` and `SourcePool` |
