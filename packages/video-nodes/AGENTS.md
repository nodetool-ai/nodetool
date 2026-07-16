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
`uniqueTargetPath`, and `coerceProviderBytes`. Helpers take no node-specific
state so `timeline.ts` can import them too. `defaultVideoRef()` is called per
`@prop` default so each prop gets its own object — never share one mutable
default across props.

## Reading input media

- **Read input audio/video bytes with the async, context-aware resolver**
  (`await audioBytesAsync(this.audio, context)` / `videoBytesAsync`), never the
  sync `audioBytes`. `AddAudio` used the sync inline-only reader, so audio supplied
  as an asset/`file://`/`http` URI yielded empty bytes and the node silently
  returned the video with no audio.

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
