# Timeline Preview Frame Source — Design

Status: phases 2–5 implemented behind `timelinePreviewDecoder`, with the
deviations in [Implementation status](#implementation-status). Phase 6 is open.
Code: `web/src/components/timeline/preview/`, `web/src/components/timeline/render/`.
Research: [Timeline Preview Decoding: What Other Web Editors Do](timeline-preview-decoding-research.md).

## Problem

The timeline preview gets its video pictures from `<video>` elements. The
compositor uploads whatever frame an element shows when a tick runs. It cannot
ask for the frame that belongs to the clock time. Four defects follow from
this, and the drift fix in `playbackSync.ts` cannot remove them:

1. **The picture is not frame-exact.** Even with zero drift, the uploaded
   frame can be one frame off the clock. The export decodes a different frame
   for the same time.
2. **Cuts start late.** A seek in Chrome costs 90–140 ms (measured with CDP on
   "Sommernacht am See – Space Song (Rough Cut)"). An incoming clip starts
   about 60 ms late even when a cold slot prepared it.
3. **Remap, reverse, and shuttle are scrubs.** `videoRateMode` returns
   `scrub` for these cases, and the element is paused and seeked on every tick.
   That is the slowest path the browser has.
4. **Preview and export disagree.** Export already decodes with mediabunny
   (`render/SequentialVideoSource.ts`). Preview does not.

Every editing engine with published source that has frame-exact preview gets it
from WebCodecs, not from `<video>` (Remotion `@remotion/media`, Diffusion
Studio Core v4, WebAV). See the [comparison](timeline-preview-decoding-research.md#comparison).

## Goal

The preview draws, on each tick, the decoded frame whose timestamp is the last
one at or before the clip's source time. It uses the same frame selection rule
as the export. A prepared cut draws the incoming clip on its first frame.

Out of scope: audio. `AudioGraph.ts` already schedules all clip audio on the
`AudioContext`, and video elements are muted.

## Current state

| Part | File | What it does |
|---|---|---|
| Master clock | `preview/PlaybackClock.ts` | Position from `AudioContext.currentTime` while the context runs, wall clock otherwise |
| Element pool | `preview/PreviewCompositor.tsx`, `preview/videoSlotPool.ts` | 8 hot slots (`MAX_VIDEO_LAYERS`) and 4 cold slots. Cold slots load clips that start within 30 s. `promotePreparedVideoSlot` swaps a cold element into a hot slot at the cut |
| Sync | `preview/playbackSync.ts` | Rate nudge up to ±25% below 0.25 s of drift. Hard seek above it, with a measured seek lead |
| Frame readiness | `preview/gpu/videoFrameVersion.ts` | Tracks a per-element frame generation so the GPU skips uploads while a seek decodes |
| Upload | `preview/gpu/compositor.ts` | `copyExternalImageToTexture` from the element. Holds the last texture while the element seeks |
| Source time | `packages/timeline/src/render/sceneModel.ts` | `clipSourceTimeSec(clip, timeMs)` resolves trim, speed, and remap |
| Export decode | `render/SequentialVideoSource.ts`, `render/OffscreenVideoPool.ts` | mediabunny `VideoSampleSink` for monotonic times. Seeked elements for rotation, non-square pixels, alpha, HDR, unsupported codecs, and retiming |
| Proxies | `packages/websocket/src/lib/video-proxy.ts` | All-intra H.264 MP4 (GOP of 1), long side scaled down, same timestamps as the source. Local mode only |

The all-intra proxy matters for this design. In a proxy, every frame is a
keyframe, so any frame decodes alone. Random access, reverse, and remap cost
one decode per frame on a proxy.

## Design

### D1. One frame source per clip asset, with two implementations

```ts
interface ClipFrameSource {
  /** Last decoded frame with timestamp <= sourceSec, or null. Never waits. */
  frameAt(sourceSec: number): VideoFrame | HTMLVideoElement | null;
  /** Move the decode position. `exact` waits for the frame at sourceSec. */
  seek(sourceSec: number, mode: "play" | "exact"): Promise<void>;
  /** Keep frames decoded ahead of sourceSec at `rate`. */
  advance(sourceSec: number, rate: number): void;
  dispose(): void;
}
```

- `DecodedFrameSource` (new) decodes with mediabunny and WebCodecs.
- `ElementFrameSource` holds one pooled `<video>` element and the current
  drift loop. It is the fallback. Its behavior does not change.

The compositor asks the source for a frame and stops managing elements
directly. The pool, `decideVideoDrift`, and `SeekLatencyTracker` move behind
`ElementFrameSource`.

### D2. The fallback rules match the export

`DecodedFrameSource.open(url)` returns null, and the clip uses
`ElementFrameSource`, when any of these is true:

- `VideoDecoder` is missing, or `isConfigSupported` rejects the track config.
- The track has rotation, a non-square pixel aspect, alpha, or HDR.
  `SequentialVideoSource.open` rejects the same four today.
- A decode error occurs before the first output frame, and a retry with
  `hardwareAcceleration: "prefer-software"` also fails. WebAV uses this retry.

A clip never switches implementation during playback. A failure after the
first frame holds the last frame and reports through `onFailure`, the same as
an element error today.

### D3. The `AudioContext` stays the master clock

`PlaybackClock` does not change. The research shows two clock models: audio
master (Diffusion Studio, the mediabunny player) and wall-clock frame counter
(Remotion, WebAV). NodeTool plays continuous audio through `AudioGraph`, so the
audio clock stays master and video follows it.

### D4. Late frames: draw the best frame while playing, wait when paused

- **Playing.** On each tick the compositor calls `frameAt(target)`. If the
  queue has no frame at or before `target`, it draws the newest frame it has.
  The existing hold-last-frame rule in `gpu/source.ts` covers a layer with no
  frame. The clock never stops for video. Remotion stops the clock and
  buffers, which is correct for a viewer but makes an editor feel stalled.
- **Paused, scrub, frame step.** The compositor calls
  `seek(target, "exact")` and redraws when it resolves. The latest request
  wins: a newer seek supersedes an older one, and a superseded seek still paints
  its frame if it lands first. Remotion handles paused scrubs the same way.
- **Play start.** Playback waits until every active source has its first frame,
  up to 300 ms. Then the audio starts. This replaces the `isClockAdvancing`
  gate for decoded sources.

### D5. Decode ahead with a bounded queue

`DecodedFrameSource` owns one `VideoSampleSink` iterator. `advance` keeps
frames decoded up to 250 ms or 8 frames ahead of the target, whichever is
smaller. Each frame is converted with `sample.toVideoFrame()` and the sample is
closed at once.

`frameAt` drops and closes every queued frame older than the one it returns.
A source holds at most 10 open `VideoFrame`s at any time.

The iterator restarts with `sink.samples(t)` when the target moves backward or
jumps forward by more than 1 s (`MAX_SEQUENTIAL_GAP_SEC` in the export).
mediabunny starts the decode at the preceding keyframe. A smaller forward jump
decodes through and drops frames.

### D6. Prepare clips before the cut

The cold-slot lookahead becomes a decoder lookahead. Within 2 s of a clip's
start (scaled by the shuttle rate), the compositor opens its
`DecodedFrameSource` and calls `seek(inPointSec, "exact")`. At the cut, the
first frame is already in the queue.

Open decoders are capped at 12, which matches today's 8 hot plus 4 cold
elements. When a new clip needs a decoder and the cap is reached, the clip
furthest from the playhead loses its decoder. A matted clip uses two sources,
one for the picture and one for the matte, as `videoSlotKey` does today.

### D7. Remap, reverse, and shuttle use random access

A remapped, reversed, or out-of-range-rate clip calls `seek(t, "play")` on every
tick with its own curve time, instead of `advance`.

- **Proxy or all-intra source.** Each request decodes one frame. Requests are
  coalesced, so at most one decode per source is in flight. The newest target
  wins.
- **Long-GOP source, reverse or backward remap.** The source decodes the GOP
  that contains `t` into a cache of `ImageBitmap`s and serves frames from it
  backward. The cache holds one GOP, capped at 2 s and at 64 MB of decoded
  pixels. A GOP that exceeds the cap falls back to `ElementFrameSource` for
  that clip.

Shuttle rates above 2× decode every frame and draw some of them. The decode
rate limits shuttle smoothness on long-GOP sources. The proxy removes that
limit.

### D8. The GPU uploads `VideoFrame` directly

`CompositeSource` in `gpu/types.ts` gains `VideoFrame`. Both backends accept it:
`copyExternalImageToTexture` in `gpu/compositor.ts` and `drawImage` in
`canvas2dCompositor.ts`. The upload key is the frame's `timestamp` plus the
source id, so a frame uploads once. No `ImageBitmap` copy is made on the
playback path.

Frame dimensions come from `displayWidth`/`displayHeight`. Rotated and
non-square tracks stay on the element path (D2), so the frame is already in
display orientation.

### D9. Preview and export share the decode core

The frame selection rule, the timestamp epsilon, the restart rule, and the
fallback rule move into one module, `render/clipDecoder.ts`. Both
`DecodedFrameSource` and the export use it. The export path keeps
`await`-ing the exact frame. The preview path does not wait. A test feeds the
same sample list to both and asserts the same timestamp for each target time.

### D10. Main thread first

mediabunny and the decoders run on the main thread in the first release, as in
Remotion and Diffusion Studio. Decode itself runs in the GPU process. Demux and
the iterator cost main-thread time, and React competes for it.

The `ClipFrameSource` interface hides where decoding runs. If the measurement in
the acceptance criteria shows main-thread tasks over 8 ms from decoding, the
sources move into one dedicated worker that transfers `VideoFrame`s to the main
thread. Kapwing moved its decoding into workers for this reason.

### D11. A setting selects the path until it is proven

`timeline.previewDecoder` is `"element"` (default) or `"webcodecs"`. The
WebCodecs path ships behind it. The default flips after the acceptance criteria
pass. The element path stays as the fallback in D2 and is not deleted.

A clip whose asset resolves to a ready proxy uses `DecodedFrameSource` under
both settings. A proxy is all-intra H.264 in MP4 at a reduced size, so it is
the input with the least decode risk, and it gets frame-exact preview first.
The D2 fallback still applies to a proxy that fails to open.

### D12. Alpha bakes stay on the element path

A transparent `model3d` bake (VP9 `yuva420p` in WebM) uses
`ElementFrameSource`, with the probe in `bakeDecoding.ts` unchanged. mediabunny
can decode the alpha plane, but the compositor would then need a second upload
path for the alpha texture. That move is a follow-up after phase 6.

## Implementation status

| Part | Where | State |
|---|---|---|
| Setting (D11) | `stores/SettingsStore.ts` `timelinePreviewDecoder`, switch in Settings → Execution | Done. Proxy clips decode under both values |
| Decoded source (D4, D5) | `preview/DecodedFrameSource.ts` | Done |
| Decoder lookahead and cap (D6) | `preview/decodedFrameSourcePool.ts` | Done |
| Random access (D7) | `DecodedFrameSource.seek(t, "play")` | Coalesced single-frame decodes. A short forward step decodes through |
| `VideoFrame` upload (D8) | `gpu/types.ts`, `gpu/source.ts`, `gpu/compositor.ts` | Done |
| Shared core (D9) | `render/clipDecoder.ts`, used by `SequentialVideoSource` | Done |

Deviations from the design:

- **D1.** The compositor branches per slot between the element pool and the
  decoder pool. `ClipFrameSource` and `ElementFrameSource` were not added,
  because one implementation behind an interface added nothing. The element
  pool code did not change.
- **D4.** Play start does not wait 300 ms for first frames. The decoder
  lookahead opens each clip before its cut, so no wait was needed in the
  measurement.
- **D7.** The long-GOP reverse cache is not built. Reverse on a long-GOP
  source decodes from the keyframe for each frame, with only the newest
  request in flight.

Measured on 2026-10-11 in Chrome 154 over CDP on "Sommernacht am See – Space
Song (Rough Cut)" (20 fps sources, 15 s of playback):

- Criterion 1: 699 of 702 ticks drew 0 frames of error, and no tick was late.
  The other 3 came from one render per source with a stale React time. That
  render draws the frame already on screen.
- Criterion 2: each clip opened its decoder 2.4–3.0 s before its cut and drew
  its in-point frame on its first tick.
- Criterion 4: `frames-open` reported 0 after the timeline closed.
- Paused frame steps drew the frame that mediabunny `getSample` returns for the
  same time (8 of 8).
- Criteria 3, 5, and 6 are not measured. They need a reverse run on a proxy and
  a long-GOP 4K clip.

## Data flow

```
PlaybackClock (AudioContext) ──▶ liveMs
                                  │
compositor tick ─▶ for each active video layer:
                     t = clipSourceTimeSec(clip, liveMs)
                     source = frameSources.get(clipId, assetUrl)
                     playing ? source.advance(t, rate) : source.seek(t, "exact")
                     frame = source.frameAt(t)            // VideoFrame | <video> | null
                  ─▶ CompositeLayer { source: frame }
                  ─▶ GPU upload (once per frame timestamp) ─▶ composite ─▶ present
```

## Diagnostics

The `window.__nodetoolTimelinePerf` sink gains these events:

| Event | Fields | Use |
|---|---|---|
| `frame-presented` | `sourceId`, `targetSec`, `frameSec` | Frame error per tick |
| `frame-late` | `sourceId`, `targetSec`, `newestSec` | A tick that drew an older frame |
| `decoder-open` | `sourceId`, `implementation`, `reason` | Which path a clip took, and why it fell back |
| `decoder-restart` | `sourceId`, `fromSec`, `toSec` | Seeks and jumps |
| `frames-open` | `count` | Leak detection |

The CDP probe from the drift fix reads these events. It reports frame error,
cut latency, and the peak open frame count.

## Acceptance criteria

Measure in Chrome over CDP on "Sommernacht am See – Space Song (Rough Cut)" and
on one long-GOP 4K phone clip without a proxy:

1. Frame error is 0 frames for 95% of ticks and at most 1 frame for all
   ticks, over 15 s of playback.
2. A cut to a clip that was prepared (D6) draws the incoming clip on the cut
   tick.
3. Reverse playback at 1× on a proxy runs without `frame-late` events for 95% of
   ticks.
4. `frames-open` returns to 0 within 1 s after playback stops and after the
   timeline closes.
5. No main-thread task over 50 ms comes from decoding during playback.
6. A scrub across 10 s of the long-GOP clip shows the exact frame at each point
   where the pointer stops.

## Phases

1. **Interface and element extraction.** Add `ClipFrameSource`. Move the pool,
   the drift loop, and the seek tracker behind `ElementFrameSource`. Behavior
   does not change. The existing playbackSync and compositor tests pass
   unchanged.
2. **Forward playback.** Add `DecodedFrameSource` with D3–D5 and D8 behind
   the setting, and enable it for proxy clips under both settings (D11).
   Scope: forward play at shuttle rates up to 2×, paused scrub, and frame step.
3. **Cuts.** Add the decoder lookahead and the decoder cap (D6).
4. **Shared core.** Extract `render/clipDecoder.ts` and move
   `SequentialVideoSource` onto it (D9).
5. **Random access.** Add remap, reverse, and fast shuttle (D7).
6. **Default flip.** Run the acceptance criteria and flip the setting. Decide on
   the worker move (D10) with the task-length measurement.

Each phase is one PR and passes the [mandatory checks](../AGENTS.md#mandatory-post-change-verification).

## Tests

- `DecodedFrameSource` against a fake sink that yields timestamped samples:
  frame selection, the restart rule, queue bounds, and that every frame and
  sample is closed after `dispose`.
- The shared selection rule, fed the same samples through the preview and export
  paths (D9).
- Decoder cap and eviction order with more than 12 upcoming clips.
- Fallback selection for each D2 condition, with the export rejection list as
  the source of the cases.
- Late-frame policy: a playing tick with an empty queue draws the newest frame,
  and a paused seek waits.

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | A hardware decoder stalls when the app holds too many of its output frames | The 10-frame cap per source (D5). Measure the cap on Apple Silicon and on one Windows GPU before the default flip |
| R2 | The GPU limits the count of concurrent hardware decoders. Eight 4K layers can exceed it | The decoder cap (D6). The software retry (D2). Proxies reduce the frame size |
| R3 | A `VideoFrame` leak exhausts GPU memory within seconds | The `frames-open` event, the dispose tests, and acceptance criterion 4 |
| R4 | Main-thread demux causes jank on large projects | Acceptance criterion 5 and the worker move (D10) |
| R5 | A long-GOP reverse cache uses too much memory | The 2 s and 64 MB caps, with the element fallback (D7) |
| R6 | Cloud deployments have no proxies, so long-GOP random access is slow there | The element fallback for reverse on long-GOP sources (D7). A proxy worker for cloud is a separate project |
