# video-nodes — Video Editing & Assembly

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **video-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (media-ref rules apply). This overlay covers video-specific correctness.

## ffmpeg / ffprobe failures throw — no silent pass-through

- **A terminal ffmpeg/ffprobe failure throws**, it never returns the unchanged
  input. `ffmpegTransform` rejects with `ffmpeg failed: <stderr>` (the execFile
  error carries `.stderr`); a no-op effect that quietly returns its input is
  indistinguishable from a real one and hides the bug. The only legitimate
  fallbacks are explicit multi-attempt chains — SetSpeed (audio+video → video),
  Overlay/Transition (with-audio → video-only), Reverse (audio+video → video),
  AddAudio (mix → replace). Pass `{ allowFallback: true }` to the non-terminal
  attempt so it returns `null`; the LAST attempt omits it and throws.
- **A missing binary is `MissingBinaryError`**, carrying the binary name, raised
  by `execFfmpeg`/`execFfprobe` on spawn `ENOENT` — for ffprobe as well as
  ffmpeg. Every probe site surfaces it (Fps, GetVideoInfo, ForEachFrame, Concat,
  Transition, ExtractFrame). Info-style nodes (Fps, GetVideoInfo) may still
  degrade a *genuine* probe failure on corrupt input to a 0/empty result, but
  must re-throw `MissingBinaryError`.
- **Empty input bytes short-circuit** to an empty/passthrough ref before any
  spawn — that is not a failure and stays.

## Shared helpers: `src/nodes/ffmpeg-helpers.ts`

Internal module (not re-exported from the package index) holding the exec
helpers + `MissingBinaryError`, `videoRef`/`defaultVideoRef`, `parseFrameRate`,
`ffprobeDuration`, `withTempFile`, `filePath`/`folderPath`, `dateName`,
`uniqueTargetPath`, `coerceProviderBytes`, and `atempoChain`. Helpers take no node-specific
state so `timeline.ts` can import them too. `defaultVideoRef()` is called per
`@prop` default so each prop gets its own object — never share one mutable
default across props.

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
  `apad` and ends the file with `-shortest`, which bounds a long track to the
  picture and stops a short one from cutting the picture off; its
  `output_length` property opts back into the unbounded behavior. The other
  mux sites are already bounded — `Overlay` mixes with `amix=duration=first`
  over the main video's own audio, `Transition` uses `xfade`/`acrossfade`, and
  both `normalizeConcatSegment` and `mixAudioInto` pass `-shortest`.

## ffmpeg numbered sequences

- **Number frame files with a contiguous counter incremented only on a successful
  write — never the loop index.** When a frame is skipped, a filename based on
  `i + 1` leaves a gap, and ffmpeg's `image2` demuxer stops at the first missing
  number, dropping every frame after the gap. Keep a separate `written` counter
  (`frame_000001.png`, `frame_000002.png`, …).
- **Handle the zero-frames case explicitly** — emit an empty
  `videoRef(new Uint8Array())` rather than invoking ffmpeg on nothing.

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
  is encoded as VP9 and transcoded to H.264 by ffmpeg. VP9 alpha, ProRes and
  PNG sequences go through PNG frames.
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

### Variable-frame-rate sources in the Node compositor

`rawFrames.ts` streams a forward clip resampled to the timeline rate
(`openForwardSourceFrameStream`, `fps=N:round=up`, which keeps in each slot
the latest frame at or before it, as a player shows). The per-frame seek
(`openSourceFrameStream`) is only for a time remap, reverse playback, a
baked 3D clip, or a render with motion blur, whose shutter samples fall
between output frames. Generated clips often report `r_frame_rate=60/1` at about 24
fps, and seeking those cost about 320 ms a frame.
