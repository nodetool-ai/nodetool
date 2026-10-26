# FFmpeg CLI Removal: Audit and Plan

The server can drop the `ffmpeg` and `ffprobe` binaries. Every operation in the code maps to node-av, which is already shipped, and the bundled build has every filter and encoder the code uses. mediabunny can take about a third of the call sites, but it cannot do filter graphs, audio mixing or text.

Line numbers are approximate and refer to the code as audited. Counts come from a static read of the sources and tests, with spot checks.

## Verdict

Use node-av as the one FFmpeg. Use mediabunny on top of it for container-level work. Both run on the same native addon, because `@mediabunny/server` registers node-av codecs, so the split adds no binary.

| Job | Library | Reason |
| --- | --- | --- |
| Probe (duration, size, fps, streams, has-audio) | mediabunny | `Input` and track accessors, one call, no JSON parsing |
| Decode by timestamp (frames for preview, analysis, compositor) | mediabunny | `VideoSampleSink.samplesAtTimestamps`, `CanvasSink`, handles VFR |
| Trim, resize, crop, 90° rotate, transcode, VP9 alpha, WAV out | mediabunny | `Conversion` with `trim`, `width/height/fit`, `keyFrameInterval`, `fastStart`, `WavOutputFormat` |
| Audio mix, atempo, fades, `pan`, loudnorm | node-av | `FilterComplexAPI.create` takes the existing graph strings as they are |
| Video filters (xfade, overlay, drawtext, deshake, nlmeans, colorkey, eq, unsharp, boxblur, reverse) | node-av | Same filter strings. mediabunny has no filter graph |
| Encode composited RGBA to H.264, ProRes or VP9 | node-av | `Frame.fromVideoBuffer` with `Encoder` and `Muxer`, same encoder args |
| JPEG and PNG stills | `@napi-rs/canvas` or `sharp` (already dependencies), or the node-av `mjpeg`/`png` encoders | mediabunny has no image encoder |

Over about 65 spawn sites, node-av can do all of them. mediabunny is YES for about 29, PARTIAL for about 29 and NO for about 8. The NO set is the waveform image, the audio mix, the ease-curve retime, denoise, stabilize, subtitles and raw argv.

## Build check

The bundled node-av has every filter and encoder the code uses, except one unused AV1 encoder. The check ran on the darwin-arm64 prebuild with `Filter.getByName` and `Codec.findEncoderByName`.

| Check | Result |
| --- | --- |
| Filters (42 checked: scale, fps, setpts, atempo, afade, adelay, amix, apad, pan, aresample, overlay, xfade, acrossfade, colorbalance, nlmeans, deshake, cropdetect, unsharp, boxblur, eq, drawtext, subtitles, colorkey, reverse, areverse, rotate, select, showwavespic, concat, anullsrc, loudnorm, zscale and others) | All present |
| Video encoders: libx264, libx265, libvpx-vp9, libvpx, libsvtav1, prores_ks, png, mjpeg, h264_videotoolbox | Present |
| Audio encoders: aac, libfdk_aac, libopus, libmp3lame, flac, pcm_s16le, pcm_f32le | Present |
| libaom-av1 | Missing. No call site uses it. AV1 goes through `libsvtav1` |
| Frame I/O: `Frame.fromVideoBuffer`, `Frame.fromAudioBuffer`, `frame.toBuffer()` | Present (`node-av/dist/lib/frame.d.ts`) |
| `probe()` and `probeSync()` | Present (`node-av/dist/api/probe.d.ts`) |

The build is FFmpeg 8.1 (Jellyfin) with `--enable-gpl --enable-version3`, fontconfig, freetype, harfbuzz and libass. The license is accepted. Repeat this check on linux-x64 and win32-x64 in CI, because only one prebuild was tested.

## Call sites

node-av verdicts: DIRECT (the API maps one to one), WORK (needs decode and encode glue, the filter string ports as it is). mediabunny verdicts: YES, PARTIAL, NO. Effort: S is under a day, M is a few days, L is a week or more.

| Site | Operation | node-av | mediabunny | Effort |
| --- | --- | --- | --- | --- |
| `websocket/lib/media.ts:35` probeHasAudio | ffprobe audio stream | DIRECT | YES | S |
| `websocket/lib/media.ts:58` probeDurationMs | ffprobe duration | DIRECT | YES | S |
| `websocket/lib/media.ts:92` extractAudio | to pcm_s16le WAV | WORK | YES (`WavOutputFormat`) | S |
| `runtime/trim-video-window.ts:44` | trim, libx264 and aac, faststart | WORK | YES (`trim`, `fastStart`) | S |
| `websocket/lib/thumbnail.ts:99` video thumb | seek 1 s, scale 512, JPEG | WORK | PARTIAL (frame yes, JPEG through canvas) | S |
| `websocket/lib/thumbnail.ts:202` audio thumb | `showwavespic` waveform JPEG | WORK | NO (draw from peaks instead) | M |
| `websocket/lib/audio-peaks.ts:61` probeAudio | sample rate, duration | DIRECT | YES | S |
| `websocket/lib/audio-peaks.ts:202` computePeaks | `pan=mono` to f32le stream | WORK | YES (`AudioSampleSink`) | S |
| `websocket/lib/video-proxy.ts:265` probeVideo | width, height, time_base | DIRECT | YES | S |
| `websocket/lib/video-proxy.ts:304` proxyCodec | `ffmpeg -encoders` | DIRECT (`findEncoderByName`) | YES (`canEncodeVideo`) | S |
| `websocket/lib/video-proxy.ts:397` encodeVideoProxy | scale, all-intra x264 or VP9 | WORK | YES (`keyFrameInterval: 0`, verify `bf=0`) | M |
| `runtime/providers/video-frames.ts:244` | `fps` and scale to JPEG stills | WORK | PARTIAL (frames yes, JPEG through canvas) | M |
| `runtime/providers/meta-transcription.ts:75` | mono 24 kHz s16 WAV | WORK | YES | S |
| `transformers-js-nodes/transformers-base.ts:430` | mono WAV at model rate | WORK | YES (`AudioBufferSink`) | S |
| `topaz-nodes/topaz-base.ts:171` | ffprobe metadata | DIRECT | YES | S |
| `audio-nodes/lib/audio-wav.ts:544` | any audio to WAV | WORK | YES | S |
| `llm-nodes/nodes/shots.ts:402` ShotChain | last frame to PNG | DIRECT | PARTIAL (PNG through canvas) | S |
| `agents/capabilities/scripts.ts:217` | ffprobe duration (unguarded `execFile`) | DIRECT | YES | S |
| `game-renderer/export-media.ts:43` | validate that audio and images decode | WORK | YES for audio, images through canvas | S |
| `blender-nodes/bake.ts:277` | PNG sequence to MP4 or VP9 alpha | WORK | PARTIAL (feed decoded PNGs) | M |
| `video-nodes` video.ts: Fps, GetVideoInfo, ExtractAudio | probe, WAV out | DIRECT | YES | S |
| `video-nodes` video.ts: Trim, Resize | `-c copy` trim, scale | WORK | YES | S |
| `video-nodes` video.ts: ExtractFrame, ForEachFrame, FrameToVideo | frames to and from PNG or RGBA, x264 | DIRECT or WORK | PARTIAL | S–M |
| `video-nodes` video.ts: Rotate (any angle), ColorBalance, Sharpness, Blur, Saturation, ChromaKey | one `-vf` filter | WORK | PARTIAL (per-pixel `process` callback) | S each |
| `video-nodes` video.ts: Reverse, SetSpeed, AddAudio | reverse/areverse, setpts and atempo, amix | WORK | PARTIAL, NO for audio | M |
| `video-nodes` video.ts: Concat, Overlay, Transition | normalize and concat, overlay and amix, xfade and acrossfade | WORK | PARTIAL | L |
| `video-nodes` video.ts: Denoise, Stabilize, EaseCurve, AddSubtitles | nlmeans, deshake and cropdetect, piecewise retime, drawtext | WORK | NO | M–L |
| `agents/capabilities/media.ts:2344` ffmpeg tool | raw argv | No argv entry point. Replace with typed operations (see [Agent harness](#agent-harness)) | NO | M |
| `agents/capabilities/media.ts:2488` ffprobe tool | JSON probe | DIRECT | YES | S |

The timeline render sites are in the next section. The detection-only sites (`runtime-detection.ts:63`, `sdk-runtime-requirement-probe.ts:18`) are in [Install and detection](#install-and-detection).

## Timeline render path

A native timeline editor needs the Node compositor path, not the headless-Chromium path, and that path runs FFmpeg at every stage today. node-av replaces each stage without a change to the pipeline shape. The audio mix is the largest item.

The render has four paths today:

1. **Browser path (default when Chromium launches)** in `timeline/browserRender.ts`. Chromium decodes, composites and encodes. FFmpeg converts sources that Chromium cannot decode, transcodes the intermediate and mixes the audio afterwards.
2. **Node compositor path** in `compositeRender.ts` and `rawFrames.ts`. One FFmpeg child per clip decodes to raw RGBA on stdout. `HeadlessFrameCompositor` composites in-process. A long-running FFmpeg reads RGBA on stdin and encodes.
3. **Audio mix** in `timeline.ts:905-1042`. One `filter_complex` pass over the finished video: per-clip atrim, adelay, atempo and afade, track effects, amix, apad, `-shortest`, `-c:v copy`.
4. **Rough-cut fallback** in `timeline.ts` (about lines 250-300, 852 and 877). Per-clip normalize, then the concat demuxer with `-c copy`.

| Site | Operation | node-av | mediabunny | Effort |
| --- | --- | --- | --- | --- |
| `rawFrames.ts:59,77` probeVideoSize, probeVideoFrameRate | ffprobe | DIRECT | YES | S |
| `rawFrames.ts:119` decodeImageRgba | one still to RGBA | WORK | PARTIAL | S |
| `rawFrames.ts:345` hasRegularFrameGrid | packet pts scan | WORK | YES (`EncodedPacketSink`) | S |
| `rawFrames.ts:249` openVideoFrameStream | seek, setpts, `fps=round=up`, scale with `accurate_rnd+full_chroma_int`, rgba | WORK (`toBuffer`) | PARTIAL (`samplesAtTimestamps`, colour flags not exposed) | M |
| `rawFrames.ts:718` ffmpegHasEncoder | encoder list | DIRECT | YES | S |
| `rawFrames.ts:768-802` frame encoders | RGBA or PNG on stdin to x264, ProRes, VP9 alpha | WORK (`Frame.fromVideoBuffer`) | PARTIAL (`VideoSampleSource`) | M |
| `timeline.ts:137` ffprobeHasAudio | probe | DIRECT | YES | S |
| `timeline.ts:745,753` MIDI sample load | probe, f32le with pan | DIRECT | YES | S |
| `timeline.ts:1042` mixAudioInto | filter_complex mix, mux with video copy | WORK (`FilterComplexAPI`) | NO | L |
| `timeline.ts` about 250-325, 852, 877 rough cut | normalize, concat, black and anullsrc | WORK | PARTIAL | M |
| `timeline.ts:1485,1530,1922`, `script.ts:925` | duration probe, encoder preflight | DIRECT | YES | S |
| `browserRender.ts:255` transcodeIntermediate | VP9 or AV1 re-encode | WORK | YES | S |
| `browserSources.ts:40,82` | probe, VP9 conversion with alpha | DIRECT or WORK | YES | S |
| `easeCurve.ts:113` | builds a filter_complex string (no spawn) | DIRECT | NO | S |

Use node-av for the compositor decode, the encode and the audio mix on this path. These keep the swscale flags and BT.709 tags that make the Node output match the Chromium output. Use mediabunny only for probes and the VP9 source conversion. Port the decode to an in-process frame iterator and keep the read-ahead bound near `rawFrames.ts:603`, because 1080p RGBA is 8 MB per frame.

## Agent harness

Replace the raw-argv `ffmpeg` tool with a typed `media_edit` tool that has a fixed set of operations. Most of the set already exists in `agents/src/sandbox-av-media.ts` (`createAudioBridge`, `createVideoBridge`), which is mediabunny-based.

Today the agent reaches FFmpeg through four entry points: the `ffmpeg` and `ffprobe` capabilities (`capabilities/media.ts:2344-2567`), the codeact `nodetool.media.ffmpeg` and `nodetool.media.ffprobe` (`codeact/nodetool-api.ts:1043-1047`), and the builtin belt (`tools/builtin-tools.ts:267-268`). `host-binary-guard.ts` confines argv to the workspace and blocks protocols.

Shipped skills use only a few operations: probe (launch-commercial, api-media), concat (the api-media worked example), crop and scale to a frame (video-audio-continuity), and last-frame extraction (ShotChain). No eval checks real FFmpeg output. `evals/codeact-api-core.ts:1438-1457` uses fakes.

| Operation | node-av | mediabunny | Existing code | Keep |
| --- | --- | --- | --- | --- |
| probe | DIRECT | YES | `media-decode.ts` probeContainer | Yes |
| trim | WORK | YES | sandbox `video.trim` | Yes |
| concat | DIRECT (concat filter) | PARTIAL | sandbox `concat` | Yes |
| extract audio | DIRECT | YES | sandbox `extractAudio` | Yes |
| extract frames | DIRECT | YES | `forEachVideoFrame`, sandbox `extractFrame` | Yes |
| scale, crop, 90° rotate | DIRECT | YES | sandbox `resize`, `rotate` | Yes |
| convert container or codec | DIRECT | YES | none | Yes |
| mix audio, add audio | DIRECT | PARTIAL | sandbox `mix`, `addAudio` | Yes |
| fade, normalize | DIRECT | PARTIAL | sandbox fades, `normalize` | Yes |
| overlay | DIRECT | PARTIAL | none | Yes, on node-av |
| speed change | DIRECT | NO (audio) | none | Later |
| burn subtitles | DIRECT (libass present) | NO | none | Later |
| arbitrary filter graph or argv | not offered | NO | none | Drop |

Files to change: `capabilities/media.ts` and `media.specs.ts` (M), `codeact/nodetool-api.ts` and `codeact-executor.ts` (M), `builtin-tools.ts` (S), `host-binary-guard.ts` (move workspace confinement onto the typed input paths, M), the eval fakes (M), and the skills api-media (L, rewrite the concat example), launch-commercial, video-audio-continuity, video-workflow and api-web (S each). `yt_dlp` also calls FFmpeg itself for merges. Keep its FFmpeg use, or point it at the downloadable binary from `node-av/ffmpeg`.

## Install and detection

The FFmpeg runtime package can go after the last `requiredRuntimes: ["ffmpeg"]` declaration is gone. node-av is already staged in the Electron bundle (`scripts/bundle-backend.mjs`) and checked by `verifyBackendBundle.test.ts`.

| Surface | Change |
| --- | --- |
| `requiredRuntimes = ["ffmpeg"]`: `llm-nodes/shots.ts:256`, `video-nodes/script.ts:172`, `timeline.ts:1194,1792`, `video.ts:387`, `topaz-manifest.json:749,967` | Remove for each node as it is ported |
| `electron/src/runtime/packages/definitions.ts:82-106` (conda `ffmpeg>=6,<7` and ffprobe) | Remove, with `types.d.ts:1017` and the tests `definitions.test.ts`, `ipc.test.ts`, `installer.micromamba.test.ts` |
| `protocol/missing-runtime-package.ts` | Remove the `ffmpeg` member and mapping, unless yt-dlp or manim still need it |
| `websocket/lib/runtime-detection.ts:63`, `sdk/sdk-runtime-requirement-probe.ts:18` | Report FFmpeg as built in, or drop the check |
| `cli/harness/capability-table.ts:563-583` | Retarget the ffmpeg and ffprobe capability rows |
| `web/stores/RuntimePackagesStore.ts`, `NodeDependencyWarning.helpers.ts` | Remove the labels |
| `compositeRender.ts:589`, `http-api.ts:1779` (ENOENT to 503) | Remove the missing-binary fallbacks |
| `Dockerfile` apt `ffmpeg` | Remove, unless manim needs it (see R1) |

The Electron bundle ships one node-av prebuild per target. node-av declares 8: darwin arm64 and x64, linux arm64 and x64, and win32 arm64 and x64 in mingw and msvc variants.

## Blockers and risks

One possible blocker exists. The other items are risks to test, not reasons to stop.

- **R1 manimgx (possible blocker).** manimgx is a Python uv tool. Manim Community writes MP4 by piping frames to an FFmpeg subprocess. This is not verified for manimgx. If it needs FFmpeg, keep FFmpeg in the manimgx runtime package only, or point it at the node-av downloadable binary.
- **R2 Colour parity.** The Node compositor matches Chromium through `accurate_rnd+full_chroma_int` and BT.709 tags. Keep these in the node-av filter string and add a pixel test against the browser output.
- **R3 Frame timing.** Keep `fps=round=up` and keyframe seek semantics. mediabunny `samplesAtTimestamps` differs from the `fps` filter by one frame at edges.
- **R4 A/V sync in the mix.** `-shortest`, `apad` and per-clip `adelay` must carry over. A muxer that copies video packets and adds encoded audio replaces `-c:v copy`.
- **R5 Memory.** In-process decode puts RGBA frames on the Node heap. Keep the FrameReader read-ahead bound, and keep large decodes off the main thread.
- **R6 Crash isolation.** A crash in a libav call ends the server process. Today it ends only a child process. Run heavy encodes in a worker thread or a child Node process. A first attempt at the shared media module hit a native crash inside node-av under a 40,000-iteration stress loop. The cause is not known. Reproduce it in a time-boxed investigation before the port relies on node-av in the server process.
- **R7 Platform coverage.** Only the darwin-arm64 prebuild was tested. Run the filter and encoder probe on every target in CI.
- **R8 Workspace confinement.** libav opens any path it gets. The typed agent operations must apply the workspace check from `host-binary-guard.ts`.

## Test coverage

28 of 74 call sites have an end-to-end test that feeds real media and checks the output content. 41 have only mocks or no test. Port no site until it has an output test that passes on the current CLI code. Otherwise the port has nothing to prove it against.

Classes: VALIDATED (real media, real FFmpeg, output content checked), SMOKE (real run, loose check), MOCKED (FFmpeg mocked or argv asserted), NONE (no test reaches the site). CI installs FFmpeg in every package test job (`extra-apt` in `.github/workflows/quality-checks.yml`), so `skipIf(!hasFfmpeg)` tests run there.

| Area | Sites | VALIDATED | SMOKE | MOCKED | NONE |
| --- | --- | --- | --- | --- | --- |
| websocket lib, runtime, other nodes | 22 | 13 | 0 | 0 | 9 |
| video.ts nodes | 24 | 4 | 0 | 13 | 7 |
| Timeline render path | 24 | 11 | 4 | 8 | 1 |
| Agent ffmpeg and ffprobe tools, codeact, guard | 4 | 0 | 1 | 3 | 0 |
| Total | 74 | 28 | 5 | 24 | 17 |

**Well covered, keep as port oracles:** peaks, video proxy (keyframes, pts, duration per frame), the extract-audio route, the video thumbnail, JPEG frame sampling, audio-wav decode, export-media validation, EaseCurve (luma and loudness over time), Resize with ForEachFrame (pixels), the timeline audio mix (RMS windows, fades, gain, effects, pan law), VFR and reverse decode (frame identity by gray level), the ProRes and VP9 alpha round trip, alpha PNG render, and the compositor time remap.

**No output test, by area:**

- websocket and runtime: `trimVideoWindow` (every caller mocks it), the audio thumbnail (`showwavespic`), `probeVideoDurationSeconds`, transformers `ffmpegToWav`, topaz `probeVideoMetadata`, ShotChain `extractLastFrame`, scripts `measureDurationMs`, blender `muxPngSequenceToVideo`.
- video.ts: Fps, FrameToVideo, Concat, Trim, Rotate, SetSpeed, Overlay, ColorBalance, Denoise, Stabilize, Sharpness, Blur, Saturation, AddSubtitles, Reverse, Transition, AddAudio, ChromaKey, ExtractAudio, ExtractFrame. Their tests assert only argv.
- Timeline: raster still decode (`decodeImageRgba`), the whole rough-cut fallback (normalize, concat, black and anullsrc), the MIDI sampler decode, the encoder preflight, and the AddClipsToTimeline and script duration probes.
- Agent: the `ffmpeg` and `ffprobe` capabilities. Real FFmpeg runs only in staging tests that do not check the output.

**Gaps that matter for the native timeline editor:**

- **G1** No test renders decoded video and audio together through the compositor. No A/V sync test exists.
- **G2** The rough-cut fallback is fully mocked, but the server falls back to it when WebGPU is missing.
- **G3** Image clips (raster stills) have no decode test.
- **G4** The browser-vs-Node parity test needs Chromium. The package test jobs in `quality-checks.yml` do not install Playwright Chromium, so it probably skips in CI. Confirm this in a CI log.
- **G5** The strongest export oracle, `web/tests/benchmarks/timeline-server-export.mjs` (exact frame count, pixel colours per layer, alpha corners), runs only by hand. No workflow runs it.
- **G6** The RenderTimeline output duration is checked only as "over 500 ms".

**Tests that pass whatever FFmpeg does.** These validate nothing and will not catch a broken port:

- `base-nodes/tests/e2e/coverage-media-nodes.test.ts:1719-1762`: the Reverse, AddAudio, ExtractFrame and ExtractAudio "without ffmpeg" tests send 2-5 fake bytes. With FFmpeg present, decode fails and the node falls back to the input, so the test still passes.
- `transformers-js-nodes/tests/audio-decode.test.ts:83-92` accepts any error that contains "ffmpeg".
- `agents/tests/script-voice-tools.test.ts:191-217` expects 500 ms, which the word-timing fallback also gives.
- `audio-nodes/tests/audio-decode-ffmpeg.test.ts:60` returns early when its fixture cannot be built.
- `websocket/tests/thumbnail-extra-coverage.test.ts:111-141` swallows the failure on garbage bytes.

**Oracles that pin FFmpeg quirks.** `video-nodes/tests/timeline-vfr-decode.test.ts:121` expects `probeVideoFrameRate` to return 60 for an MKV that keeps 24 frames per second. The test passes, because ffprobe reports the nominal rate as `avg_frame_rate` for this file. A port that measures the real average gets 24 and fails. Decide which value the frame-grid cache needs before the port. The test comment is wrong in both cases.

**Input media depends on the CLI.** Almost every real-media test generates its input with `ffmpeg -f lavfi` (testsrc, sine, color) and checks the output with `ffprobe`. The repository has no video fixtures for these tests. Removing the binary breaks the tests before it breaks the code.

## Migration order

Step 0 comes before the port:

1. Add a shared test helper that generates media (a testsrc pattern, gray-level frames, sine, silence) and probes output (duration, size, frame pts, PCM RMS) with node-av or mediabunny, not the CLI.
2. Write an output test for each site in the NONE and MOCKED lists, starting with the timeline gaps G1-G3 and `trimVideoWindow`. Each test must pass on the current CLI code.
3. Delete or rewrite the tests that pass whatever FFmpeg does.
4. Run `timeline-server-export.mjs` in a CI job, and install Chromium for the parity test.
5. Reproduce the node-av stress crash (R6) and decide on worker or child-process isolation.

Then port one site at a time. The same test must pass before and after.

1. Add a shared `media` module in `runtime` with the probe, decode, encode and filter helpers on node-av and mediabunny. Add the filter and encoder probe as a startup check and a CI test on every platform.
2. Port every probe site (about 20, all S). This alone removes ffprobe.
3. Port the websocket lib: peaks, thumbnails, video proxy, extract audio, trim. The native editor needs these first.
4. Port the timeline Node compositor: frame decode, frame encode, then the audio mix (L).
5. Replace the agent `ffmpeg` tool with the typed operation set, and update the skills and evals.
6. Port the video.ts nodes: single-filter nodes first (S each), then Concat, Overlay, Transition, EaseCurve and AddSubtitles.
7. Port the remaining nodes: transcription, transformers, topaz, audio-wav, ShotChain, game-renderer and the blender bake.
8. Remove the conda package, the apt line, `requiredRuntimes` and the detection code. Resolve R1 before the apt line goes.

After step 4, the server in the timeline-editor configuration needs no external FFmpeg.
