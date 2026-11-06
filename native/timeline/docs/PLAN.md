# Native Timeline Prototype: Plan

AI workflow parity is tracked separately in
[AI-WORKFLOWS.md](AI-WORKFLOWS.md). The original editing milestones and review
backlog do not establish AI completion.

The milestone order for the design in [DESIGN.md](DESIGN.md). Each milestone
names its files, its exit criteria as numbers, the headless check that proves
them, and its main risk. Decision, risk, and question codes (D, R, Q) refer to
DESIGN.md.

Reference machine on macOS: an Apple M1 Pro or later, a 60 Hz display
(ProMotion limited to 60 Hz for benches), a release build. Budgets name one of
the separate bench measurements of DESIGN.md § Harness: `cpuMs`, `gpuMs`,
`presentIntervalMs`, or a correctness counter. They are never summed. A budget
on a measurement with no samples fails. "Frame error" is the pts of the drawn
frame minus the pts that D6 selects, in frames.

## Changes to the suggested order

1. **M0 is new.** A web baseline on the same fixtures and the same machine.
   Without it, no result can show that the platform causes the slowness
   (F1, R8). It runs in parallel with everything.
2. **M5 is split.** M5a (read a timeline and cache its assets) moves up. Real
   documents then feed the plan conformance test and the benches early. M5b
   (save) stays after M4, because a save needs the raw-JSON preservation of
   D4 and the edit commands.
3. **M3 starts after M1b, not after M2.** Audio needs the FFmpeg demux layer
   from M1b and nothing from the tracks UI.

## Dependencies and parallel work

A milestone has two kinds of prerequisite. "Start" is what its code builds on.
"Exit" is what its exit criteria need to run. An agent can start a milestone
when its start prerequisites are done, and it closes the milestone when its
exit prerequisites are done too.

| Milestone | Start after | Exit also needs |
|---|---|---|
| M0 | none | none |
| M1a | none | none |
| M1b | M1a | the golden import script (M1a) |
| M1c | M1b | none |
| M1d | M1b | none. It uses a local all-intra fixture from `make-fixtures.sh`, not a server proxy |
| M2 | M1a | M1b (its exit plays 4 decoded tracks) |
| M3 | M1b | none |
| M4 | M2 | none |
| M5a | M1a (the client and cache need only the model) | M1b (its exit plays decoded media) |
| M5b | M4, M5a | none |
| M6 | M1c, M3 | M5b for the packaged app test |

After M1a, three agents can work at once: one on M1b, one on M2, one on M5a.
After M1b, a fourth can take M3. Contracts that the agents share and must fix
in their prompts: `TimelineTypes.h` fields, the `LayerSource` interface (D13),
the `FramePlan` JSON form (D6), and the bench JSON line.

## M0: Web baseline

- **Scope.** Measure the web preview on the M1 fixtures with the existing perf
  contract (`web/src/components/timeline/perf/report.ts`) in Chrome over CDP.
- **Files.** `native/timeline/scripts/web-baseline.mjs`, `native/timeline/bench/web-baseline.json`.
- **Exit.** One JSON result per fixture, recorded on the reference machine. It
  maps each web counter to the native measurement it is compared with
  (present interval, frame error, held frames). A web counter that the
  contract leaves null has no comparison and is listed as such.
- **Check.** The script exits non-zero when a fixture produced no frames, or
  when a mapped counter is null (fail closed).
- **Risk.** The web and native metrics measure different things, for example
  Chrome compositor time. Compare only mapped pairs, and state the method
  next to each number.

## M1a: Synthetic layers on the GPU (scaffold)

- **Scope.** The model in C++, `SyntheticSource` per clip, the offscreen
  composite at sequence size with the letterbox blit (D9), the playhead bound
  only to the clock (D2, D30), the bench CLI.
- **Files.** `src/model/*`, `src/playback/PlaybackClock.*`,
  `src/preview/{SceneEval,PreviewCompositor,LayerSource,SyntheticSource}.*`,
  `shaders/composite.{vert,frag}`, `qml/TimelineEditor.qml`,
  `qml/preview/PreviewArea.qml`, `qml/Tracks/*.qml`, `fixtures/synthetic-*.json`,
  `tests/`.
- **Exit.**
  1. 8 synthetic 1080p layers at 1920x1080 for 600 frames: `presentIntervalMs`
     p95 under 17.5 ms, `cpuMs` p95 under 2 ms, `gpuMs` p95 under 2 ms,
     0 skipped presents.
  2. `--dump-plan` agrees with the TypeScript scene model on every synthetic
     fixture for the active set, z order, in-track order, opacity, and matrix
     (tolerance 1e-6). The oracle script must run in this milestone, and it
     fails when it compared 0 layers.
  3. The golden import script (DESIGN.md Q1) imports one media fixture and
     renders it through `nodetool timeline render --stills`.
- **Check.** `ctest` (model, JSON parse, SceneEval, clock).
  `nodetool-timeline fixtures/synthetic-8.json --bench --frames 600 --size 1920x1080 --budget cpuMs.p95=2,gpuMs.p95=2`.
  `scripts/plan-conformance.mjs` (Node, imports `@nodetool-ai/timeline/scene`).
  `scripts/golden-import.mjs`.
- **Harness.** Add a surface for `native/timeline/` in
  `packages/cli/src/harness/registry.ts` with a gap note until CI has Qt and
  FFmpeg. The gate then lists the native checks as manual work instead of
  selecting nothing.
- **Risk.** R2, frame pacing of `QQuickRhiItem`.

## M1b: FFmpeg software decode, multiple video tracks

- **Scope.** `FfmpegSource`, `SourcePool` (D18), the decode-ahead ring (D16),
  seek (D17), YUV textures and the colour matrix (D10), the present rules
  (D12). Model fields for source time, fades, and the auto dissolve (D3, D6).
  Fixture media from `scripts/make-fixtures.sh`: H.264 1080p30 with a 2 s GOP,
  a burnt-in frame number, colour bars in BT.601 and BT.709, limited and full
  range, a variable-frame-rate file, and one file each with rotation,
  non-square pixels, alpha, and HDR (for the D10a rejection report).
- **Files.** `src/preview/{FfmpegSource,SourcePool,FrameRing,YuvFormat}.*`,
  `shaders/composite.frag`, `src/model/TimelineTypes.h`, `fixtures/video-*.json`.
- **Exit.**
  1. 4 x 1080p30 H.264 tracks over 15 s: `presentIntervalMs` p95 under
     17.5 ms, `cpuMs` p95 under 8 ms, frame error 0 on 95% of frames and at
     most 1 on all.
  2. A cut to a pre-rolled clip draws the incoming clip on the cut frame. No
     black frame at any cut in the fixture.
  3. Seeks land on the D17 frame in three cases: a target between two pts, a
     variable-frame-rate file, and a seek superseded by a newer one.
  4. Colour bars: PSNR 40 dB or more against `nodetool timeline render --stills`.
  5. Each rejected media file (D10a) draws a placeholder, and the loader
     report names the reason.
  6. Open decoders return to 0 within 1 s after the timeline closes.
- **Check.** Bench JSON with `frameError` and `heldFrames`. The burnt-in frame
  number is read back from `--stills` output and compared with the expected
  frame. The golden script for colour.
- **Risk.** R6, colour mismatch.

## M1c: VideoToolbox zero copy

- **Scope.** Hardware decode on macOS (D15): IOSurface NV12, `CVMetalTextureCache`,
  `QRhiTexture::createFrom()`, per-frame `FrameRef` ownership and the retire
  queue (D11), software fallback before the first frame.
- **Files.** `src/preview/hw/VideoToolboxInterop.{h,mm}`, `src/preview/FfmpegSource.*`.
- **Exit.**
  1. 8 x 1080p30 H.264 tracks: `presentIntervalMs` p95 under 17.5 ms,
     `cpuMs` p95 under 8 ms.
  2. 2 x 4K30 HEVC tracks, 8-bit 4:2:0 SDR BT.709 only, with the same budgets.
     10-bit and HDR HEVC wait for P010 and the tone map (D10, D10a).
  3. 0 CPU plane copies (a counter in the bench line).
  4. 12 decode sessions open at once without a failure (R5).
  5. Live `FrameRef`s return to 0 within 1 s after the timeline closes, and
     no frame is released while a command buffer that samples it is in flight
     (Metal validation layer on, 0 errors).
- **Check.** Bench with `--decoder vt`, `cpuCopies` field equal to 0. The M1b
  frame-number check passes on the hardware path too.
- **Risk.** R3. Run the 200-line spike first.

## M1d: Scrubbing, seek latency, frame cache

- **Scope.** The exact paused seek with "latest request wins" (D17), the scrub
  cache (D19). The all-intra case uses a local proxy-like fixture from
  `make-fixtures.sh`. The server proxy path itself is tested in M5a.
- **Files.** `src/preview/{FrameCache,SourcePool}.*`, `qml/Tracks/TimeRuler.qml`.
- **Exit.**
  1. Paused seek to an exact frame: p95 under 100 ms on 1080p H.264 with a 2 s
     GOP, under 30 ms on an all-intra proxy.
  2. A scripted scrub of 60 seeks per second over 10 s shows the exact frame
     when it stops, every time.
  3. A cache hit draws in the same frame. The cache stays under 256 MB.
- **Check.** `nodetool-timeline <fixture> --scrub-script scrub.json --json`
  prints seek latency percentiles and the final-frame verdict.
- **Risk.** Seek cost on long-GOP 4K sources without a proxy. Report it, do not
  hide it behind the proxy.

## M2: Tracks UI parity

- **Scope.** Ruler, headers, lanes, clips, zoom and pan (D29), the scrollbar,
  vertical and horizontal virtualization (D27, D28), the playhead on its own
  path (D30), `TimelineViewState`, the transport in `PreviewArea.qml`.
- **Files.** `qml/Tracks/*.qml`, `qml/Tracks/TimelineScrollbar.qml`,
  `src/ui/{TimelineWheel,TimelineViewState}.*`, `src/model/{TrackListModel,LaneClipModel}.*`.
- **Exit.**
  1. 200 tracks and 2000 clips: pinch zoom and pan at 60 fps, p95 GUI frame
     under 8 ms, while the preview plays 4 tracks.
  2. Instantiated `Clip` items never exceed the clips in the window plus the
     320 px overscan.
  3. The wheel math returns the values of the cases in
     `web/src/components/timeline/Tracks/__tests__/timelineWheel.test.ts`.
  4. A drag that carries a clip past the window and the overscan keeps the
     delegate and the pointer grab, and the drop lands at the pointer (D28).
  5. `Clip.qml` and `ClipBody.qml` keep the React split: gestures in `Clip`,
     drawing in `ClipBody`.
- **Check.** Qt Quick Test with synthetic wheel, gesture, and drag events, and
  a bench mode `--ui-bench` that zooms and pans on a script and prints GUI
  frame time.
- **Risk.** Trackpad event mapping differs from Chromium. Compare the factor per
  pinch with the web on the same gesture.

## M3: Audio playback, audio-master clock, A/V sync

- **Scope.** `AudioEngine` on miniaudio (D23), PCM rings, the mix rules (D25),
  fades (D26), the audio-master clock (D21), play start (D22).
- **Files.** `src/audio/{AudioEngine,AudioSource,Mixer,FadeCurves}.*`,
  `src/playback/PlaybackClock.*`, `third_party/miniaudio.h`.
- **Exit.**
  1. Mixer: the null-device render of a flash-and-beep fixture puts each beep
     at its sample position within 1 ms. This proves the mix and the clock
     arithmetic, not physical sync.
  2. Clock: the D21 transitions (play, seek, rate change, device change,
     fallback to the monotonic clock) re-anchor without a playhead jump of
     more than 1 frame. Qt tests drive a fake device.
  3. Live sync on the reference machine: audio-to-video offset within 1 frame
     (33 ms) over 60 s on the built-in speakers. Audio is captured through a
     loopback device. Video time is the drawable's presented time of the flash
     frame. Final verification is a 240 fps phone recording of screen and
     speaker, done by hand once per milestone.
  4. 0 underruns, counted in the real device callback, in 10 minutes with 8
     audio clips and 4 video tracks.
  5. Fade curves within 1e-6 of the TypeScript `fadeShapeGain`.
  6. Play start under 300 ms.
- **Check.** `--av-sync` mode for the mixer case. `--av-sync-live` for the
  loopback case, which fails when no loopback device is present instead of
  passing. A Qt test compares the curves with values from
  `scripts/fade-vectors.mjs`.
- **Risk.** Output latency reported by the device is wrong, which offsets the
  clock. Measure with the fixture on built-in speakers and on Bluetooth.

## M4: Editing

- **Scope.** Select, move, trim, split, ripple, delete, snap, and undo through
  `QUndoStack` (D5).
- **Files.** `src/edit/{ClipGestureController,Commands}.*`, `qml/Tracks/Clip.qml`,
  `qml/Tracks/TrackLane.qml`.
- **Exit.**
  1. Each command gives the same document JSON as the TypeScript operation on
     the same input (`splitClip.ts`, `trimClip.ts`, `rippleEdit.ts`).
  2. A drag of any length is 1 undo entry.
  3. The preview shows an edit on the next frame.
- **Check.** `scripts/op-conformance.mjs` runs the package's operation tests
  against the native code (`timeline-ops`, one call per process), and
  randomized differentials of the operations, the web store's actions and the
  keymap. Qt tests for the gestures, undo and redo (`tst_tracksui`) and the
  next-frame preview (`tst_editpreview`).
- **Risk.** Ripple and linked-clip rules have many cases. Port the web test
  cases, not only the code.

## M5a: Server read and asset cache

- **Scope.** `ServerClient` for `timeline.list`, `timeline.get`, `assets.get`,
  `assets.list` (D31), loopback and token auth (D32), the disk cache with
  `Range` resume (D33), raw JSON kept per entity (D4).
- **Files.** `src/server/{ServerClient,AssetCache}.*`, `src/model/TimelineJson.*`.
- **Exit.**
  1. Every shipped example timeline opens from the server. Its supported
     subset plays, and the loader report lists each unsupported field and each
     rejected media file per clip. The run fails only on a load error.
  2. A second open with a warm cache starts in under 500 ms.
  3. Plan conformance passes on every example timeline for the supported
     fields.
  4. Proxy states: a ready H.264 proxy, a ready VP9 proxy, a pending proxy, a
     failed proxy, and no proxy each play (the last three from the original).
     Audio of a proxied video reads the original.
  5. Cache: a changed asset version gives a new file. A resumed download with a
     changed version or a wrong `Content-Range` total restarts from 0.
- **Check.** `nodetool-timeline --server http://127.0.0.1:7777 --timeline <id> --dump-plan`
  against a server started by the test script. The proxy states come from
  assets that the script prepares with `NODETOOL_VIDEO_PROXY_MIN_SIZE_PX` set
  to 0, and from a server run with an ffmpeg that lacks libx264 for VP9.
- **Risk.** A cache keyed on the wrong fields serves stale media after a relink.
  Key on the D33 version, which uses only API fields.

## M5b: Server save

- **Scope.** `timeline.update` with `baseUpdatedAt`, debounced autosave (D34),
  the conflict path.
- **Files.** `src/server/{ServerClient,AutosaveController}.*`, `src/model/TimelineJson.*`.
- **Exit.**
  1. Load and save with no edit gives the same document content for every
     example timeline (all fields except `updatedAt` and `createdAt`), and the
     server reports no `stripped` paths.
  2. A save of a document with an invented field shows the strip warning and
     keeps the raw document on disk (D4).
  3. A concurrent web edit gives a conflict banner and no overwrite. The client
     matches the error on `error.data.apiCode = "ALREADY_EXISTS"`.
- **Check.** A round-trip test against a test server. A strip test. A conflict
  test that edits the same timeline through tRPC between load and save.
- **Risk.** R7.

## M6: Windows, Linux, packaging

- **Scope.** D3D11VA and Vulkan decode paths (D15), packaging with
  `macdeployqt`, `windeployqt`, and an AppImage. FFmpeg as an LGPL build,
  linked dynamically.
- **Files.** `src/preview/hw/{D3D11Interop,VulkanInterop}.*`, `CMakeLists.txt`,
  `scripts/package-*.sh`.
- **Exit.** The M1b and M1c benches pass on one reference Windows and one
  Linux machine. Each platform has its own budget file
  (`bench/budgets-<platform>.json`) that names the machine, the GPU, and the
  display rate, with the same measurements as macOS. Hardware differs,
  so the platforms are not compared with each other. The correctness budgets
  (frame error, held frames, golden stills) are the same on every platform.
- **Check.** The same bench and still commands, run in CI on each platform.
- **Risk.** R4.
