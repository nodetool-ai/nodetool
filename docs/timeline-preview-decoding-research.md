# Timeline Preview Decoding: What Other Web Editors Do

## Question

How do other web video editors and compositors get video frames for preview
playback? Specifically, do they drive preview from `<video>` elements or from a
WebCodecs/WASM decode pipeline, and what clock, prefetch, seek, and fallback
designs do they use?

The NodeTool timeline preview plays `<video>` elements, syncs them to an
`AudioContext` clock, and composites them in WebGPU
(`web/src/components/timeline/preview/PreviewCompositor.tsx`). Export decodes
with mediabunny and WebCodecs (`web/src/components/timeline/render/SequentialVideoSource.ts`)
and falls back to seeked `<video>` elements for unsupported codecs and retiming
(`render/OffscreenVideoPool.ts`). The decision is whether preview moves to a
pull-model WebCodecs frame source.

## Conclusion

Every engine with published source that targets editing and was updated in
2025–2026 decodes preview frames with WebCodecs through mediabunny or a
mediabunny-like iterator: Remotion `@remotion/media`, Diffusion Studio Core v4,
and WebAV. The engines that still play `<video>` elements in preview are
animation tools first (Motion Canvas, Revideo, Etro) or a project with the same
preview/export split NodeTool has today (Omniclip). The large commercial editors
that published anything (CapCut, Kapwing, Clipchamp) describe WebCodecs or WASM
decoding, but none of them documents its preview loop.

The evidence supports the move. No engine examined solves `<video>` drift better
than NodeTool's current rate-correction loop. The engines that have frame-exact
preview get it by not using `<video>` for preview at all.

Two design choices differ between the WebCodecs engines, and NodeTool must pick
one for each:

1. **Clock owner.** Diffusion Studio uses `AudioContext.currentTime` as the
   master clock. Remotion and WebAV use a wall-clock frame counter and schedule
   audio against it.
2. **Late frame policy.** Remotion stops the clock and enters a buffering state
   until the frame is ready. Diffusion Studio and the mediabunny player example
   draw the best frame they have and keep going. WebAV skips the render tick.

## Comparison

| Engine | Preview frame source | Master clock | Late frame | Seek / backward | Export decoder | Fallback |
|---|---|---|---|---|---|---|
| Remotion `@remotion/media` `<Video>` | mediabunny `CanvasSink` iterator, drawn to `<canvas>` | `performance.now()` frame counter. Audio scheduled against an `AudioContext` anchor | Pauses the Player ("buffering") until the frame decodes | Sequential advance waits. Any jump or backward step restarts the iterator | Same mediabunny path | `<OffthreadVideo>` (FFmpeg) for unsupported codecs |
| Diffusion Studio Core v4 | mediabunny `CanvasSink` plus a frame cache. `getBestFrameFor(t)` | `AudioContext.currentTime` minus an offset | Draws the best cached frame, never blocks | `seekTo` restarts the iterator and records the next key packet | Same engine, WebCodecs encode | Not documented |
| WebAV (`MP4Clip.tick`) | mp4box demux, `VideoDecoder`, queue of up to 10 decoded frames | 30 fps worker timer, corrected to `performance.now()` | Skips the tick while a preview frame is pending | Backward or more than 3 s forward resets the decoder | Same `tick` path | Retries in software decode after a hardware decode error |
| mediabunny media player example | `CanvasSink.canvases(t)` iterator, one frame of lookahead | `AudioContext.currentTime` | Draws a late frame at once, then pulls the next | New iterator per seek | n/a | n/a |
| Omniclip | `<video>` elements | `requestAnimationFrame` timecode | n/a | Sets `currentTime`, awaits `seeked` | WebCodecs `VideoDecoder` in a worker | n/a |
| Motion Canvas | Playing `<video>` element | Scene frame clock | n/a | Re-seeks when drift exceeds 0.2 s | Seek per frame on `<video>` | n/a |
| Revideo | Playing `<video>` element | Scene frame clock | n/a | Re-seeks when drift exceeds 1 s | `web` (WebCodecs, MP4 only), `ffmpeg`, or `slow` (seeked `<video>`) | `ffmpeg` for WebM |
| Etro | `<video>`/`<audio>` elements | `performance.now()` | n/a | Sets `currentTime` | Same elements, recorded | n/a |
| CapCut web | WebCodecs decode drawn to the editing canvas (C++ engine via Emscripten) | Not published | Not published | Not published | Not published | Earlier WASM SIMD decoders |
| Kapwing | Moved frame decoding from `<video>` to WebCodecs in workers, mp4box demux | Not published | Not published | Decodes forward from the preceding keyframe | Not published | Not published |
| Clipchamp | Not published. The 2021 talk covers export only | Not published | Not published | Not published | FFmpeg WASM with WebCodecs codec stubs | Software or server encode |
| ByteDance NLE (W3C 2021) | WASM decode to WebGL textures, 480p limit | Web Audio mentioned, not detailed | Not published | Not published | Not published | n/a |

Canva, Descript, Veed, and Adobe have no primary source about their preview
pipeline. A Canva job listing mentions a "native video engine" for web, but no
decoder detail.

## Evidence

### Remotion

- The docs comparison table says `@remotion/media` `<Video>` uses
  "Mediabunny and WebCodecs" and is frame-accurate in preview and render. The
  older `<Html5Video>` is "not guaranteed" frame-accurate.
  `<OffthreadVideo>` plays a browser `<video>` in preview and extracts exact
  frames with FFmpeg only at render time
  ([video tags](https://www.remotion.dev/docs/video-tags)).
- `<Video>` "extracts the exact frame from the video using Mediabunny" and
  draws it to a `<canvas>`. `premountFor` mounts a clip early so it can
  "buffer before it becomes visible". Reverse playback is not supported. If
  the codec is unsupported, it falls back to `<OffthreadVideo>`
  ([Video docs](https://www.remotion.dev/docs/media/video)).
- Source, `packages/media/src/video-iterator-manager.ts` (commit `102a548`):
  a sequential forward step uses `pendingFrameBehavior: 'wait'`, and any other
  time change uses `'restart-iterator'`. When the frame is pending, it calls
  `delayPlaybackHandleIfNotPremounting()`, which puts the Player into a
  buffering state. Within 1 s of a loop end, it prewarms a second iterator.
- Source, `packages/player/src/use-playback.ts`: the frame comes from
  `performance.now() - startedTime`. The frame does not advance while
  `isBuffering()` is true. `set-global-time-anchor.ts` maps timeline time to
  `audioContext.currentTime` and re-anchors only past a tolerance, "to avoid
  audio glitches from frame-quantized re-anchoring".

### Diffusion Studio Core v4

- The README describes "interactive playback for editing and a high fidelity
  rendering mode", built on Canvas 2D and WebCodecs
  ([repository](https://github.com/diffusionstudio/core)). The repository no
  longer contains source. The findings below come from the published
  `@diffusionstudio/core@4.0.3` bundle.
- `package.json` depends on `mediabunny ^1.25.0`. `dist/clips/video/decoder.d.ts`
  declares a `VideoDecoder` class with `canvasSink`, `packetSink`, `frameCache`,
  `nextKeyPacket`, `seekTo()`, and `getBestFrameFor()`.
- In `core.es.js`, `playbackTime` is `audioCtx.currentTime - hardwareOffset +
  playbackOffset`. The clip `render()` calls `getBestFrameFor(playbackTime -
  delay)` and returns without drawing if no frame exists. A clip primes its
  decoder with `seekTo(range[0])` before it becomes active.

### WebAV

- Source, `packages/av-cliper/src/clips/mp4-clip.ts` (commit `42dd6fd`): the
  frame finder resets the decoder when `time <= lastTime` or when the jump is
  more than 3 s. Otherwise it pops queued frames until it reaches the one that
  covers `time`, and it starts more decoding when fewer than 10 frames are
  queued. On a decode error with no output yet, it logs "Downgrade to software
  decode" and resets.
- Source, `packages/av-canvas/src/av-canvas.ts`: a 30 fps worker timer drives
  render, corrected against `performance.now()`. It skips the tick while
  `#waitingPreviewFrame` is set, "to avoid flicker from seeking back and forth
  between clips" (translated from the comment). Each tick collects PCM from the
  clips and schedules it on the `AudioContext`.

### mediabunny

- `VideoSampleSink.getSample(t)` "returns the last sample with a timestamp less
  than or equal to the search timestamp". `CanvasSink` with `poolSize` reuses
  canvases round-robin, which "keeps the amount of allocated VRAM constant"
  ([media sinks](https://mediabunny.dev/guide/media-sinks)).
- Source, `examples/media-player/media-player.ts` (commit `9d36fc5`): the clock is
  `audioContext.currentTime - audioContextStartTime + playbackTimeAtStart`.
  Each `requestAnimationFrame` draws `nextFrame` once its timestamp is at or
  before the clock, then pulls frames until one is in the future. Audio
  buffers are scheduled ahead with `node.start()` and throttled to 1 s of lead.

### `<video>`-based engines

- Motion Canvas `packages/2d/src/lib/components/Video.ts` (commit `7b91435`):
  during playback it plays the element and sets `currentTime` only when
  `Math.abs(video.currentTime - time) > 0.2`. When paused or rendering, it
  seeks and awaits `seeked`.
- Revideo `packages/2d/src/lib/components/Video.ts` (commit `b5de67a`): playback
  uses the playing element and re-seeks when the drift is more than 1 s.
  Rendering selects `webcodecSeekedVideo`, `ffmpegSeekedVideo`, or the seeked
  element.
- Omniclip `s/context/controllers/compositor/` (commit `cbe581a`): preview
  creates `<video>` elements and sets `currentTime` on seek. Export uses a
  `VideoDecoder` worker (`video-export/parts/decode_worker.ts`).

### Commercial editors

- CapCut: "decoding a 4K image to the editing canvas on a high-performance
  computer takes tens of milliseconds" without hardware decode. WebCodecs gave
  hardware decode, and "CapCut now supports multiple simultaneous 4K streams"
  ([web.dev case study](https://web.dev/case-studies/capcut)).
- Kapwing: "The bottleneck to achieving smooth frame drawing is decoding
  frames, which until recently we did using an HTML5 video player." The
  performance "wasn't reliable". "Recently we have moved over to WebCodecs,
  which can be used in web workers"
  ([web.dev case study](https://web.dev/case-studies/kapwing)).
- Clipchamp: the 2021 talk covers the export pipeline (decoder, compositor,
  encoder) with FFmpeg WASM and WebCodecs encoder stubs. It does not describe
  preview ([W3C talk](https://www.w3.org/2021/03/media-production-workshop/talks/soeren-balko-clipchamp-webcodecs.html)).
- ByteDance: "For each video track, we first use WebAssembly to decode the
  video frame", composited in WebGL, limited to 480p because of CPU cost
  ([W3C talk](https://w3.org/2021/03/media-production-workshop/talks/junyue-cao-non-linear-video-editor.html)).

### Platform limits of `<video>`

- "The video element does not guarantee frame-accurate seeking." The
  `requestVideoFrameCallback` API is best-effort and can be one vsync late
  ([web.dev rVFC](https://web.dev/articles/requestvideoframecallback-rvfc)).
- The W3C issue on frame-accurate seeking has stayed open since 2018. In that
  thread, a Remotion maintainer says `requestVideoFrameCallback` "doesn't lead
  to perfect results always"
  ([w3c/media-and-entertainment#4](https://github.com/w3c/media-and-entertainment/issues/4)).

## Implications for NodeTool (inference)

These points are inferences from the evidence above, not observations.

1. **Use mediabunny for preview, as for export.** Remotion and Diffusion Studio
   build preview on the same `CanvasSink`/`VideoSampleSink` iterators that
   `SequentialVideoSource` already uses. Use one frame source for both paths.
2. **Keep the `AudioContext` as master.** Diffusion Studio and the mediabunny
   example do this, and NodeTool already does. Remotion's frame-counter clock
   suits a frame-stepped composition, not continuous audio playback.
3. **Pick a late frame policy per mode.** During playback, draw the best
   available frame (Diffusion Studio). When paused or scrubbing, wait for the
   exact frame. Remotion's stop-the-clock buffering is right for a final
   preview but makes editing feel stalled.
4. **Prewarm the next clip.** Remotion (`premountFor`, loop prewarm) and
   Diffusion Studio (decoder priming) both open the decoder before the cut.
5. **Restart the iterator on any non-sequential move.** Every WebCodecs engine
   does this. Reverse playback has no published solution: Remotion does not
   support it, and the others restart per step.
6. **Keep `<video>` as a fallback only.** Remotion falls back to FFmpeg for
   unsupported codecs, WebAV falls back to software decode, and NodeTool export
   falls back to seeked elements. The current drift loop can stay as that
   fallback path.

## Uncertainty and gaps

- CapCut, Kapwing, Clipchamp, Canva, Descript, Veed, and Adobe do not publish
  their preview clock or prefetch design. The table marks those cells as not
  published.
- The Clipchamp and ByteDance talks are from 2021. Their current architecture
  can differ.
- The Diffusion Studio findings come from a minified bundle, not readable
  source.
- No source measures the cut latency or memory use of a WebCodecs preview with
  many concurrent clips. NodeTool must measure that itself.
