# video-nodes — Video Editing & Assembly

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **video-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (media-ref rules apply). This overlay covers video-specific correctness.

## Media runs in process — failures throw, never pass through

- **No node spawns `ffmpeg` or `ffprobe`.** Every edit, probe, decode and
  encode runs on `@nodetool-ai/runtime/media` (node-av and Mediabunny). The
  video.ts nodes describe an edit as stream plans for `transformMedia` — the
  CLI's `-vf`, `-af` and `-filter_complex` strings with `copy`, input seeks and
  `shortest` — through the local `mediaTransform` helper. Make test media with
  `@nodetool-ai/runtime/media/testing`, never the CLI.
- **A terminal failure throws**, it never returns the unchanged input.
  `mediaTransform` rejects with `Video processing failed: <reason>`; a no-op
  effect that quietly returns its input is indistinguishable from a real one
  and hides the bug. The only legitimate fallbacks are explicit multi-attempt
  chains — SetSpeed (audio+video → video), Overlay/Transition (with-audio →
  video-only), Reverse (audio+video → video), AddAudio (mix → replace). Pass
  `{ allowFallback: true }` to the non-terminal attempt so it returns `null`;
  the LAST attempt omits it and throws.
- **Info-style nodes (Fps, GetVideoInfo) degrade a probe failure** on corrupt
  input to a 0/empty result.
- **Empty input bytes short-circuit** to an empty/passthrough ref before any
  decode — that is not a failure and stays.

## Shared helpers: `src/nodes/ffmpeg-helpers.ts`

Internal module (not re-exported from the package index) holding
`videoRef`/`defaultVideoRef`, `parseFrameRate`, the in-process probes
(`probeDurationSeconds`, `probeHasAudioStream`, `probeVideoInfo`,
`countVideoFrames`, `libavCodecName`), `withTempFile`, `filePath`/`folderPath`,
`dateName`, `uniqueTargetPath`, `coerceProviderBytes`, and `atempoChain`.
Helpers take no node-specific state so `timeline.ts` can import them too.
`defaultVideoRef()` is called per `@prop` default so each prop gets its own
object — never share one mutable default across props.

## Reading input media

- **Read input audio/video bytes with the async, context-aware resolver**
  (`await audioBytesAsync(this.audio, context)` / `videoBytesAsync`), never the
  sync `audioBytes`. `AddAudio` used the sync inline-only reader, so audio supplied
  as an asset/`file://`/`http` URI yielded empty bytes and the node silently
  returned the video with no audio.

## Muxing audio against picture

- **A node that muxes an audio stream onto a video must decide the output
  length itself.** Left to the muxer, the file is as long as the *longer*
  stream: a music model that ignores the requested duration returns a whole
  song, and a 25-second clip came out four minutes long, with three and a half
  minutes of nothing after the picture ended. `AddAudio` pads the audio with
  `apad` and ends the file with `shortest`, which bounds a long track to the
  picture and stops a short one from cutting the picture off; its
  `output_length` property opts back into the unbounded behavior. The other
  mux sites are already bounded — `Overlay` mixes with `amix=duration=first`
  over the main video's own audio, `Transition` uses `xfade`/`acrossfade`,
  Concat's re-encode path (`concatSegments`) pads or cuts each segment's sound
  to its picture, and `mixAudioInto` muxes through `muxAudioWithVideoCopy`,
  which ends the audio where the picture ends.

## Frame sequences

- **Skip an empty or mismatched frame without losing the rest.** FrameToVideo
  writes each usable frame to the encoder as it visits it and counts what it
  wrote; a skipped frame never ends the sequence.
- **Handle the zero-frames case explicitly** — emit an empty
  `videoRef(new Uint8Array())` rather than opening an encoder on nothing.

Construct outputs with the `videoRef` helper (raw base64 `data`, `type: "video"`)
— see [packages/AGENTS.md § Media refs](../AGENTS.md#media-refs-imageref--videoref--audioref--model3dref).

## RenderTimeline renders in headless Chromium

`RenderTimeline` runs the editor's own exporter (`renderTimeline` in
`web/src/components/timeline/render/TimelineRenderer.ts`) in a Playwright
Chromium, so a server render is the export the user previewed. The page is
`web/src/components/timeline/render/headless/renderPage.ts`, bundled into
this package by `scripts/bundle-timeline-render-page.mjs`. The driver is
`src/nodes/timeline/browserRender.ts`, and it never duplicates compositor
logic: a rule belongs in `@nodetool-ai/timeline` or the web exporter.

- **Browser order.** `CHROME_PATH`, then installed Google Chrome
  (`channel: "chrome"`), then Playwright's bundled Chromium. Playwright loads
  through `importOptionalModule`, so a host without it falls back.
- **Codecs.** Chrome encodes and decodes H.264. Chromium without proprietary
  codecs does neither: the driver converts each clip the page has no decoder
  for to VP9 first (`browserSources.ts`, frame timestamps kept), and an mp4
  is encoded as VP9 and transcoded to H.264 with `transcodeVideo`. VP9 alpha,
  ProRes and PNG sequences go through PNG frames.
- **Untagged H.264 decodes differently.** Chrome reads an untagged clip as
  BT.709 and libav (the Node compositor, the VP9 conversion) as BT.601, a
  mean difference of about 0.035 on a test pattern. Tagged clips agree, so
  render fixtures tag their sources (`-colorspace bt709` and friends).
- **Chroma is interpolated on both sides.** swscale's default yuv420p to RGBA
  path repeats each chroma sample over a 2×2 block, and Chrome interpolates.
  `rawFrames.ts` decodes with `accurate_rnd+full_chroma_int` so the Node
  compositor matches the browser at colour edges.
- **Compositor.** WebGPU when the page has an adapter whose canvas reads back,
  else Canvas 2D. A software Vulkan adapter on headless Linux reads back
  blank, which the page tests for before it renders. The node logs which
  compositor ran and why.
- **The Node compositor is the fallback, not a second path.** It runs only
  when no browser launches (`BrowserRenderUnavailableError`), with a job
  warning, or when `NODETOOL_TIMELINE_RENDERER=node`, which this package's
  Vitest config sets so the existing render tests keep exercising it.
- **Cancel closes the browser.** The node passes `ctx.signal`, and an abort
  closes the page, the browser and the loopback server.

### The Node compositor runs libav in process

`rawFrames.ts` decodes clips and stills and encodes the composited frames
through `@nodetool-ai/runtime/media` (node-av), with the filter strings, swscale
flags and BT.709 arguments the ffmpeg CLI took. The audio mix runs the same
`filter_complex` graph through `openFilterComplex` and `muxAudioWithVideoCopy`,
and the rough cut normalizes and joins its clips with `concatSegments`. The
browser path's source conversions and transcode run on `transcodeVideo`.
Tests that fake the media module use `tests/_fixtures/fake-media.ts` (pass
`{ edits: true }` to record video.ts edits); tests that need media make it
with `@nodetool-ai/runtime/media/testing`.

### Variable-frame-rate sources in the Node compositor

`rawFrames.ts` streams a forward clip resampled to the timeline rate
(`openForwardSourceFrameStream`, `fps=N:round=up`, which keeps in each slot
the latest frame at or before it, as a player shows). The per-frame seek
(`openSourceFrameStream`) is only for a time remap, reverse playback, a
baked 3D clip, or a render with motion blur, whose shutter samples fall
between output frames. Generated clips often report `r_frame_rate=60/1` at about 24
fps, and seeking those cost about 320 ms a frame.
