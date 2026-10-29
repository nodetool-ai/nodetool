# Native Timeline Prototype: Design

A C++20 and Qt 6 desktop client for the NodeTool timeline editor. It edits
video and audio clips and shows a GPU-composited preview. The NodeTool server
(TypeScript, port 7777) stays the backend for documents and assets. The order
of work is in [PLAN.md](PLAN.md).

## Findings that shape the design

- **F1.** The web editor's own audit
  ([timeline-editor-performance-audit.md](../../../docs/timeline-editor-performance-audit.md#verdict))
  finds that steady playback already causes zero React renders. It attributes
  the measured costs to gesture store writes, a per-frame scene recompute, and
  missing virtualization. These are app-level causes. So the prototype must
  measure itself against a web baseline on the same fixtures, or it cannot
  show that the platform is the problem (see PLAN.md M0).
- **F2.** The scene semantics live in one 2400-line TypeScript module,
  `packages/timeline/src/render/sceneModel.ts`. A C++ port is a second
  implementation. [Harness-First rule 4](../../../docs/HARNESS_FIRST.md#the-rules)
  forbids two drifting copies of one behavior. A conformance check against the
  TypeScript scene model must gate every SceneEval change (D6).
- **F3.** The server strips unknown fields on every save, and it replaces each
  top-level document array in full (`timeline.update` in
  `packages/websocket/src/trpc/routers/timeline.ts`). The native model is a
  subset of the schema. A save that sends only the subset deletes data. The
  scaffold's `TimelineJson.h` says "Unknown fields are ignored, the way Zod
  strips them". That rule must change before the first save (D4).
- **F4.** In local mode the server can make an all-intra preview proxy, 960 px
  on the long side, with the source timestamps
  (`packages/websocket/src/lib/video-proxy.ts`). A proxy makes every seek a
  one-frame decode. It is conditional. A background proxy exists only for a
  video with a long side of 1920 px or more by default
  (`NODETOOL_VIDEO_PROXY_MIN_SIZE_PX`, a negative value turns proxies off). Its
  status can be pending or failed. The codec is H.264, or VP9 in WebM when the
  server's ffmpeg has no libx264. The proxy has no audio track (`-an`). So the
  preview must decode the original when there is no ready proxy, and audio
  always reads the original media.

## Goals and non-goals

Goals:

1. Show that a native GPU preview plays 4 or more 1080p video tracks at the
   display rate with frame-accurate seeks.
2. Show the same picture as the web preview and the export for the supported
   feature subset, proven by a check, not by eye.
3. Keep the QML component tree close to the React tree, so a feature ports
   file by file.
4. Run on macOS first (Metal), with Windows (D3D11) and Linux (Vulkan) paths
   designed in from the start.

Non-goals:

- AI workflows were outside the prototype scope. Their extension is tracked
  in [AI-WORKFLOWS.md](AI-WORKFLOWS.md).
- Text, shape, caption, 3D, group, adjustment, matte, and mask layers. Clip
  and track effects. Keyframe animation. Transitions other than the cross-fade.
- MIDI, instruments, automation, track audio effects, the DAW view.
- Export. The server's `nodetool timeline render` stays the export path.
- The dock layout. The prototype uses a fixed split (program over tracks).

## Component mapping

React sources are under `web/src/components/timeline/` unless noted. QML files
are under `native/timeline/qml/`. C++ files are under `native/timeline/src/`.

| React | Native | Milestone |
|---|---|---|
| `TimelineEditor.tsx` | `TimelineEditor.qml` | M1a |
| `stores/timeline/TimelineDockLayout.ts`, `DockCanvas` | `SplitView` in `TimelineEditor.qml`, Editing sizes (bottom 300 px) | M1a |
| `preview/PreviewArea.tsx` (transport, timecode, scrubber) | `preview/PreviewArea.qml` | M1a, transport in M2 |
| `preview/PreviewCompositor.tsx` | `preview/PreviewCompositor` (`QQuickRhiItem`) | M1a |
| `preview/compositeLayers.ts` | `preview/SceneEval` (`buildFramePlan`) | M1a |
| `@nodetool-ai/timeline/render` `sceneModel.ts`, `transform.ts`, `transition.ts` | `preview/SceneEval` | M1a, M1b |
| `preview/gpu/compositor.ts`, `GpuFrameCompositor` | `PreviewCompositor` renderer, `shaders/composite.{vert,frag}` | M1a |
| `preview/gpu/source.ts` (present rules) | `PreviewCompositor` present rules | M1b |
| `preview/DecodedFrameSource.ts` | `preview/FfmpegSource` (a `LayerSource`) | M1b |
| `preview/decodedFrameSourcePool.ts` | `preview/SourcePool` (new) | M1b |
| `preview/PlaybackClock.ts` | `playback/PlaybackClock` | M1a, audio master in M3 |
| `preview/playbackSync.ts` | not needed: no `<video>` elements to steer | - |
| `preview/AudioGraph.ts` | `audio/AudioEngine` (new) | M3 |
| `Tracks/TracksRegion.tsx` | `Tracks/TracksRegion.qml` | M1a, parity in M2 |
| `Tracks/TimeRuler.tsx` | `Tracks/TimeRuler.qml` | M1a |
| `Tracks/TrackHeader.tsx` | `Tracks/TrackHeader.qml` | M1a |
| `Tracks/TrackLane.tsx` | `Tracks/TrackLane.qml` | M1a |
| `Tracks/Clip.tsx` (gestures, menus, dialogs) | `Tracks/Clip.qml` | M1a |
| `Tracks/ClipBody.tsx` (the drawn body: label, status, fades) | `Tracks/ClipBody.qml` (a child of `Clip.qml`) | M2 |
| `Tracks/Playhead.tsx` | `Tracks/Playhead.qml` | M1a |
| `Tracks/TimelineZoomControls.tsx` | `Tracks/TimelineZoomControls.qml` | M1a |
| `Tracks/TimelineScrollbar.tsx` | `Tracks/TimelineScrollbar.qml` (new) | M2 |
| `Tracks/timelineWheel.ts` | `ui/TimelineWheel` (new, pure functions) | M2 |
| `Tracks/trackWindow.ts`, `trackHeight.ts` | `model/TrackListModel` row layout | M2 |
| `Tracks/useClipDrag.ts`, `useClipTrim.ts`, `clipSnap.ts` | `edit/ClipGestureController` (new) | M4 |
| `stores/timeline/TimelineStore.ts` | `model/TimelineModel` + `QUndoStack` | M1a, undo in M4 |
| `stores/timeline/TimelinePlaybackStore.ts` | `playback/PlaybackClock` | M1a |
| `stores/timeline/TimelineUIStore.ts` (zoom, scroll, selection, tool) | `ui/TimelineViewState` (new) | M2 |
| `hooks/useTimelineSequence.ts`, `useAssetUrl.ts` | `server/ServerClient`, `server/AssetCache` (new) | M5 |

Out of scope: `Inspector/`, `TranscriptPanel`, `storyboard/`, `shot/`,
`TimelineInstrumentsPanel`, `TimelineAgentPanel`, `TimelineVersionHistoryPanel`,
`CodePanel`, `SourceViewerPanel`, `daw/`, `pianoRoll/`, `Tracks/automation/`,
`ChordLane`, `ScriptLane`, `TrackFolderHeader`, `TrackEffectsPanel`, the clip
dialogs, `ExportVideoDialog`, and the gizmo and tracking overlays.

## Architecture

### Threads

| Thread | Owns | Never does |
|---|---|---|
| GUI | QML items, `TimelineModel`, `TrackListModel`, controllers, `QUndoStack`, `ServerClient` | decode, GPU calls |
| Qt Quick render | `PreviewCompositor` renderer, every `QRhi` resource, SceneEval for the frame | touch a `QObject` model |
| Decode worker (one per open source) | FFmpeg demuxer and decoder, the frame ring | block on the GUI or render thread |
| Audio decode worker | PCM rings for active audio clips | run in the device callback |
| Audio device (real time) | the mix, the master clock counter | lock, allocate, log, or decode |

- **D1.** The GUI thread publishes an immutable `TimelineSnapshot`
  (`std::shared_ptr<const Timeline>` plus a version) after each edit.
  `synchronize()` copies the pointer. `render()` evaluates SceneEval on that
  snapshot at the clock time. Reason: playback then needs no GUI-thread work per
  frame except the playhead, and the render thread never reads a model that the
  GUI thread mutates.
- **D2.** A QML `FrameAnimation` ticks once per frame on the GUI thread. It
  calls `clock.tick()`, moves the playhead, and calls `update()` on the
  compositor. Nothing in the track list binds to time. This copies the web
  transient time channel (`subscribeTime` in `TimelinePlaybackStore.ts`).

### Data flow

```
 server (tRPC JSON)          local fixture.json
        \                         /
         v                       v
   TimelineJson::parse  -->  TimelineModel (GUI)  -->  QUndoStack (M4)
        raw JSON kept            |   edits
                                 v
                         TimelineSnapshot (immutable, versioned)
                                 |  synchronize(): copy pointer
                                 v
  PlaybackClock.now() --> SceneEval(snapshot, t) --> FramePlan
                                 |                     |
              SourcePool <-------+  requests           |  layers: clipId, z,
     FfmpegSource x N (workers)    (active + 2 s ahead)|  opacity, matrix,
              |  frame for source time                 |  sourceTimeSec
              v                                        v
        LayerSource::frameAt(sec) ---------> PreviewCompositor::render()
                                             offscreen RGBA8 at sequence size
                                             -> letterbox blit into the item
```

`FramePlan` is a plain struct. Its JSON form is the conformance format (D6).

## Model

- **D3.** `TimelineTypes.h` holds C++ structs whose field names match
  `packages/protocol/src/api-schemas/timeline.ts`. The prototype subset is:
  - sequence: `id`, `name`, `fps`, `width`, `height`, `durationMs`, `updatedAt`
  - track: `id`, `name`, `type`, `index`, `visible`, `locked`, `muted`, `solo`, `volumeDb`, `pan`, `heightPx`
  - clip: `id`, `trackId`, `name`, `startMs`, `durationMs`, `inPointMs`,
    `outPointMs`, `mediaType`, `status`, `currentAssetId`, `linkId`, `hidden`,
    `muted`, `locked`, `opacity`, `blendMode` (normal only), `speedMultiplier`,
    `speedBaked`, `volumeDb`, `fadeInMs`, `fadeOutMs`, `fadeInShape`,
    `fadeOutShape`, `transform` (all eight fields), `transitionIn` (cross-fade only)
  - `master.volumeDb`
- **D4.** Each sequence, track, and clip keeps its raw `QJsonObject`. A save
  starts from the raw object and writes only the fields the native model owns.
  Reason: F3. A native save must not delete animations, effects, captions, or
  other fields that the server schema supports and the native model does not.
  The guarantee stops at the server schema: the server strips a field it does
  not know and reports it in `stripped` only after the write commits. So:
  1. A save response with a non-empty `stripped` list is logged and shown as a
     warning. The client keeps the raw document of the last load on disk next
     to the asset cache, so the stripped data is recoverable.
  2. The client sends `X-Nodetool-Client: native-timeline/<version>` so the
     server log names the source of a strip.
  3. Tests: a no-edit save of every shipped example timeline must give the
     same document content (all fields except `updatedAt` and `createdAt`) and
     an empty `stripped` list. A second test sends a document with an invented
     field and asserts that the client reports the strip.
  4. Edits keep data the native model does not own, and refuse an edit that
     would strand it: a split or a drop never splits or removes a clip that
     owns a media track (`mediaTracks[].clipId` would dangle), and a link
     unit splits whole or not at all. Web follow-ups, the same defects in the
     store (not changed by this branch): `resolveDrop` (`dropResolve.ts`) can
     split or remove a media-track owner on an insert or overwrite drop, and
     `splitClipsLinkAware` (`TimelineStore.ts`) catches a refused split per
     clip, so a time-remapped member leaves its partner split alone.
  5. What a round trip keeps: the JSON values, not the original bytes. The
     model holds parsed JSON (keys sorted, numbers as doubles), as the server
     does: `1.0` reads back as `1`, digits past a double are lost, and `-0`
     reads as `0` (JSON.stringify drops its sign too). Undo restores the
     model's own bytes exactly (`tst_editpreview`).
- **D5.** `TimelineModel` exposes tracks through `TrackListModel`
  (`QAbstractListModel`, one row per track, roles for header fields and row
  geometry). Clips are exposed per track through a `LaneClipModel` that holds
  only the clips in the visible time window (see Tracks UI). Edits go through
  `QUndoCommand`s from M4. One gesture is one command: a gesture applies each
  move to the model with no entry, and the release pushes one command from
  the clips at the press to the clips at the release; a held nudge key
  merges its repeats with `mergeWith()`. Reason: the web audit found one undo
  entry per pointer move, which empties the 100-entry history in two seconds.
  An edit replaces the raw `clips` array (D4) and re-derives only the clips
  whose JSON changed; undo restores the previous array, so the document comes
  back byte for byte.

## Scene evaluation

- **D6.** SceneEval copies the rules in the table exactly. A Node script runs
  `computeActiveLayers` and `resolveAnimatedLayerProps` from
  `@nodetool-ai/timeline/scene` (the GPU-free export of the scene model, not
  the package root) over each fixture at sampled times and writes `FramePlan`
  JSON. `nodetool-timeline --dump-plan` writes the same JSON from
  C++. The test diffs the two with a tolerance of 1e-6. Reason: F2.

| Rule | Web source | Native behavior |
|---|---|---|
| Active window | `isClipActive` | `startMs <= t < startMs + durationMs` |
| Visible media | `computeActiveLayersWithHorizonBase` | only `video` and `overlay` tracks with `visible`. Skip `hidden`, `audio`, `midi`, `group`, `adjustment` |
| Asset | `effectiveAssetId` in `clipAudio.ts` | `currentAssetId` only when `status` is generated, stale, locked, or generating |
| Track z | `trackZ = 1000 - track.index` | index 0 (top row) draws last |
| In-track order | `drawClips` sort | by `transform.depthPx`, then `startMs` |
| Video cap | `MAX_VIDEO_LAYERS = 8` | the same cap, the same drop order |
| Source time | `clipSourceMsAt` in `timeRemap.ts` | `max(0, (t - startMs) * rate + inPointMs)`, `rate = speedBaked ? 1 : max(1e-4, speedMultiplier ?? 1)`. `timeRemap` is out of scope |
| Frame pick | `selectFrameIndex` in `render/clipDecoder.ts` | the last frame with `pts <= target + 1e-6 s` |
| Opacity | `sceneModel.ts` | `clamp01(opacity * transition.opacity * fadeGain)` |
| Picture fade | `clipFadeOpacity`, `clipFadeGain` | `fadeInMs`/`fadeOutMs` also scale picture opacity, along the same curve as audio |
| Auto dissolve | `resolveTransition` in `transition.ts` | with no `transitionIn`, the later clip fades in across its overlap with the earlier clip on the same track. The outgoing clip stays opaque. `durationMs <= 0` is a hard cut |
| Placement | `containBaseScale`, `computeTransformMatrix` in `transform.ts` | contain fit, then scale, aspect-corrected rotation (radians), position in sequence pixels from the centre (y down), anchor in [0,1]. `rotationX`/`rotationY` in degrees with `perspective` |
| Blending | `GpuFrameCompositor` | premultiplied, in the non-linear RGBA8 space, on an opaque black ground |
| Groups | `resolveGroups` | a group draws nothing. A child inherits the group's window, opacity and matrix (`parentMatrix`), parents before children, a cycle resolved unparented |
| Precomposite | `groupNeedsPrecomposite`, `collectPrecomposites` | a group with an effect, a blend mode, a cut or an adjustment child composites its children on a surface; the plan lists the surfaces innermost first, with stack orders |
| Animations | `compileClipAnimations`, `sampleAnimations` | presets and custom curves, roles, windows, loops, holds, easing (named, `cubic-bezier`, `spring`, `hold`), the fold table, `steppedTime`. Not ported: beats, `followPath`, `line` staggers |
| Repeats | `expandTemporalClips` | repeater copies (`<id>:repeat:<n>`) and echoes (`<id>:echo:<n>`) |
| Camera | `resolveCamera2D` | the scene camera scales and moves a layer by its depth |
| Cut geometry | `resolveTransition`, `transitionTransform` | the eased progress, offset, scale, wipe, iris and dip solid of each cut; the draw matrix includes the offset and the scale |

- **D35.** Intermediate surfaces. Each precomposite of the frame (the
  `SceneFrame.precomposites` list, innermost first) renders into its own
  offscreen RGBA8 render target at the canvas size, as the web's
  `composePrecomposites` does (`packages/timeline/src/render/frameCompositor.ts`):
  1. Every layer and every surface belongs to one container: the frame, or the
     surface named by its `precomposeGroupId`. A container's items are its
     layers in scene order, then its surfaces in list order, sorted stably by
     `z`, then `stackOrder` (absent sorts last), as `sortStack`.
  2. A surface is cleared to transparent and its items draw into it with
     premultiplied "over". A child draws with its own `opacity`, not
     `drawOpacity`: the group's opacity applies once, to the composed surface.
     So two overlapping opaque children at group opacity 0.5 cover 0.5, not
     0.75.
  3. The finished surface draws as one layer of its container, at the group's
     stacking position, with the group's opacity and its cut geometry
     (`transitionTransform` of no transform: the cut's offset and scale). The
     surface is frame-sized, so it needs no other placement: the group's matrix
     already rode into each child through `parentMatrix`.
  4. A surface with no drawn item is skipped and allocates nothing.
  5. Render targets come from a pool. A frame takes one target per drawn
     surface and returns them all at its end, so a steady scene allocates no
     target after its first frame. A target unused for 300 frames is freed,
     and a canvas size change frees all of them.
     The pool has a byte budget, 512 MiB by default (`NT_SURFACE_BUDGET_MIB`).
     A 4K surface is about 31.6 MiB. A new target first evicts free targets,
     the least recently used first. A frame whose own surfaces exceed the
     budget still gets them, so the picture stays right, and the frame stats
     and a warning report it.
  6. A surface, a layer uniform buffer or a set of bindings that cannot be
     created is a resource failure. The frame is then incomplete: it is never
     exact, its stats count the failures, and a still or screenshot run stops
     with the reason instead of saving the picture.
  Not drawn yet, and listed in the loader report for the group clip with
  effect `pixels`: the group's blend mode and effect chain
  (`precomposite.blendMode`, `precomposite.effects`), its cut's mask, iris,
  dip solid and effect (`precomposite.cut=<type>`), adjustments inside a group
  (`precomposite.adjustment`), and the depth-of-field blur
  (`precomposite.cameraBlur`). Plain layers have the same limits: the
  compositor draws every layer with normal blending and no mask. The report
  also lists cuts whose mask, iris, dip solid or effect the compositor does not
  draw (`transitionIn.type=<t>`), and animations with wipe, blur or grade
  channels (`animations.effectChannels`).

## Preview pipeline

- **D7.** `PreviewCompositor` is a `QQuickRhiItem` (Qt 6.7 or later). Reason:
  it gives one `QRhi` across Metal, D3D11, and Vulkan, inside the Qt Quick
  scene, without a second window or a texture copy.
- **D8.** The snapshot rule: `synchronize()` copies the snapshot pointer, the
  item size, the preview quality, and the paused-seek target. It does nothing
  else. `render()` reads only those copies, the atomic clock, and the lock-free
  frame rings.
- **D9.** The frame composites into an offscreen RGBA8 texture at the sequence
  size, scaled by the preview quality (full, half, quarter, as
  `preview/previewQuality.ts`). A second pass blits it into the item with a
  contain fit and black bars. Reason: `transform.position` is in sequence
  pixels, so a canvas at the sequence size keeps the math of `transform.ts`
  unchanged. The window size then changes only the blit.
- **D10.** Video planes upload as separate textures (Y as R8, CbCr as RG8 for
  NV12, or Y, U, V as R8 for I420). The fragment shader converts to RGB with a
  uniform 3x3 matrix and offset. The matrix comes from the frame's
  `colorspace` and `color_range`: BT.709, BT.601, limited or full range. An
  unspecified matrix uses BT.709 at a height of 720 or more, else BT.601. 8-bit
  formats come first. P010 (R16 and RG16) comes after M1c. The shader outputs
  premultiplied RGBA multiplied by the layer opacity. Blend state is
  `One, OneMinusSrcAlpha`.
- **D10a.** Media facts. The decoder reads rotation (display matrix side data),
  sample aspect ratio, alpha, and transfer function when it opens a stream. The
  web decoded path rejects rotation, non-square pixels, alpha, and HDR and plays
  those clips through `<video>` (`decodeRejection` in
  `web/src/components/timeline/render/clipDecoder.ts`). The native path has no
  second player, so it handles them in two steps:
  1. Prototype: the same four checks. A rejected source draws a placeholder and
     the loader reports the reason per clip. The run does not fail.
  2. Later: rotation and sample aspect fold into the layer's contain fit, alpha
     uses a third plane, and HDR (PQ, HLG) gets a tone map. Each one lands with a
     fixture and a golden still.
- **D11.** Texture lifetime. There are two kinds of texture.
  1. An upload texture (software decode, synthetic source) is owned by the
     renderer. A layer keeps it across frames, keyed by `clipId:assetId` (as
     `compositeLayerId`), and recreates it only on a size or format change.
  2. An imported texture (VideoToolbox, D3D11VA, Vulkan) wraps one decoder
     surface. `QRhiTexture::createFrom()` does not take ownership, and
     consecutive frames can use different surfaces. So each imported frame is a
     `FrameRef` that retains its `CVPixelBufferRef` and its `CVMetalTextureRef`
     (or the platform equivalent) and its own `QRhiTexture` wrapper. The layer
     holds the displayed `FrameRef`. A replaced `FrameRef` goes to a retire
     queue with the frame number of its last use and is released after
     `QRhi::FramesInFlight` more frames have completed.

  Textures of clips that left the plan go to the same retire queue. The
  renderer's destructor (the `QQuickRhiItemRenderer` subclass) drains the queue
  and releases every texture, because the renderer has no separate release hook.
- **D12.** Present rules, copied from `preview/gpu/source.ts`:
  1. A layer with no new frame draws its last texture.
  2. A plan with layers where no layer drew skips the present. The item keeps
     its last picture. This is the hold-last-frame rule that stops the black
     flash at a cut.
  3. A plan with no layers presents black. That is a real gap.
  4. A cut onto a source whose decoder is still opening counts as "no layer
     drew" and holds (`shouldCompositeScene`).

## Decode

- **D13.** `LayerSource` is the abstract frame source:
  `frameAt(sourceSec) -> FrameRef` (never blocks), `advance(sourceSec, rate)`,
  `seekExact(sourceSec) -> future`. `SyntheticSource` draws test patterns.
  `FfmpegSource` decodes media.
- **D14.** Software decode first (M1b): `libavformat` demux, `libavcodec`
  decode, `thread_count` 2 per decoder, `thread_type` frame. Reason: it proves
  timing, seeking, and colour before any platform code exists.
- **D15.** Hardware decode through FFmpeg `hw_device_ctx`:
  - macOS (M1c): VideoToolbox. Request IOSurface-backed NV12 with
    `kCVPixelBufferMetalCompatibilityKey`. `frame->data[3]` is the
    `CVPixelBufferRef`. A `CVMetalTextureCache` built on the `MTLDevice` from
    `QRhiMetalNativeHandles` gives one `MTLTexture` per plane.
    `QRhiTexture::createFrom()` wraps each one. No CPU copy.
  - Windows (M6): D3D11VA on the `ID3D11Device` from `QRhiD3D11NativeHandles`,
    so decoder and renderer share one device. Each frame is a slice of an NV12
    texture array. `createFrom()` cannot address one slice, so each frame is
    copied to a single NV12 texture with `CopySubresourceRegion` (a GPU copy),
    which is wrapped twice, as R8 and as RG8. The window's device is created
    with `D3D11_CREATE_DEVICE_VIDEO_SUPPORT` and multithread protection.
  - Linux (M6): VAAPI, each frame exported as DMA-BUF with one layer per
    plane and imported into the `VkDevice` from `QRhiVulkanNativeHandles` as
    an R8 and an R8G8 `VkImage` (DRM format modifier, foreign queue family
    acquire). Reason: FFmpeg's Vulkan decoder outputs one multi-planar image,
    and QRhi samples one colour-aspect view per texture, which a multi-planar
    image does not allow. Needs a Vulkan QRhi and four device extensions
    (`VulkanInterop::requiredDeviceExtensions`).
  - All three sit behind one compile-time seam, `src/preview/hw/HwInterop.h`.
  - Any hardware failure before the first frame falls back to software for that
    source, as `DecodedFrameSource` retries with `preferSoftware`.
  - Watchdog (M1d): a hardware decoder with a pending target that decodes no
    frame for 1 s is stalled: the session blocks in
    `VTDecompressionSessionDecodeFrame`, or it accepts packets and returns no
    frame. `SourcePool` retires the stalled
    decoder on its retire thread without a join on the render thread, and a
    worker that does not end within 100 ms is abandoned (detached, its queued
    frames dropped). The media then decodes in software for the rest of the
    session, and the loader report says "hw decoder stalled, fell back to sw".
- **D16.** Decode ahead, copied from the web design
  ([D5](../../../docs/timeline-preview-frame-source-design.md#d5-decode-ahead-with-a-bounded-queue)):
  each source keeps at most 8 frames or 250 ms ahead of the clock, whichever is
  smaller, in a single-producer, single-consumer ring.
- **D17.** Seek: when the target moves backward or forward by more than 1 s
  (`MAX_SEQUENTIAL_GAP_SEC`), `av_seek_frame` with `AVSEEK_FLAG_BACKWARD`,
  flush, and decode forward. The frame to show is the last one with
  `pts <= target + 1e-6 s` (`selectFrameIndex`), so the decoder keeps the newest
  frame at or before the target. It drops a frame only when a later decoded
  frame also starts at or before the target (`pruneBehindTarget` in
  `DecodedFrameSource.ts`). Example: a seek to 50 ms in 30 fps footage shows the
  frame at 33.3 ms, not the one at 66.7 ms. At end of stream the last frame is
  kept. A variable frame rate needs no special case, because the rule reads
  only `pts`. A smaller forward jump decodes through. When paused, the latest
  seek request wins and a superseded seek still paints if it lands first
  (web D4).
  On an open GOP, a seek can land on a random access point whose leading
  frames (presented before it) cannot be decoded and are dropped. When the
  first frame of a seek starts after the target, the decoder seeks 1 s
  further back, then double that, in the same run.
  A container time base coarser than the frame grid rounds frame times
  (WebM stores 1/1000 s, so frame 2 at 30 fps is stored as 67 ms). A frame
  time within half a tick of the grid of the stream's rate is moved onto it
  before the pick. A time further off the grid is a real variable rate and is
  kept.
- **D18.** Concurrency: `SourcePool` keeps at most 12 open decoders, which is 8
  active layers plus 4 lookahead (`MAX_OPEN_DECODERS`). A clip within 2 s of its
  start opens a decoder and pre-rolls its first frame (web D6). At the cap, the
  source furthest from the playhead closes first.
- **D19.** Scrub cache: each source keeps an LRU of decoded frames keyed by
  `pts`, with a shared budget of 256 MB. A paused scrub checks the cache first,
  then the proxy (F4), then a keyframe seek. Reverse play on a long-GOP source
  is out of scope.
  - A cached frame is the D17 pick only when its successor in presentation
    order, from the same decode run, is cached and starts after the target. A
    header frame rate proves nothing: a stream can claim a constant rate and
    have irregular timestamps.
  - The budget counts real allocations: padded software buffers, and the
    IOSurface allocation of a hardware frame. Frames the cache evicted while
    another owner holds them are reported apart, as pinned elsewhere.
  - Catch-up after a seek skips the decode of a non-reference frame only when
    a packet read earlier in the run starts after it and by the target. That
    packet is the skip floor: a target below it starts a new run.
  - A paused seek on a long-GOP source uses the proxy when one exists. M5a owns
    the proxy route (PLAN M1d scope), so M1d records this rule and does not
    implement it. M5a now picks the proxy for every picture read of a video
    with a ready proxy (`ServerTimeline`), which covers paused seeks.

## Clock and A/V sync

- **D20.** M1: `PlaybackClock` reads `QElapsedTimer` (monotonic). Position is
  `startPos + elapsed * rate`, clamped to `[floor, durationMs]`, with loop, as
  `preview/PlaybackClock.ts`.
- **D21.** M3: the audio device is the master. Reason: audio glitches are
  worse than a held video frame, and the web also follows the audio clock
  (web D3). The web clock reads `AudioContext.currentTime` and subtracts no
  output latency (`preview/PlaybackClock.ts`). The native clock does subtract
  it, so the native picture can lead the web picture by the output latency.
  The clock is defined as follows:
  1. The callback publishes a pair `(framesRendered, hostTimeNs)` at the start
     of each buffer, with `hostTimeNs` from the monotonic clock.
  2. The audible position at monotonic time `now` is
     `(framesRendered + (now - hostTimeNs) * sampleRate) / sampleRate - outputLatency`,
     clamped so it never passes the end of the last published buffer. This
     interpolates between callbacks, which can be 10 ms or more apart.
  3. `outputLatency` comes from the backend at device start (on CoreAudio, the
     device latency plus the safety offset plus the buffer size). It is
     queried again on a device change.
  4. Timeline time is `anchorTimelineMs + (audible - anchorAudible) * 1000 * rate`.
     Play, seek, a rate change, and a device change each set a new anchor
     pair. A device change also flushes the PCM rings, so the new device
     starts at the anchored position. The device callback sets the anchor
     frame: the first frame it renders for the new command. A play or a seek
     holds the playhead at its target until that frame is audible. A rate
     change continues the previous anchor's timeline at that frame, so it
     needs no refill and the playhead does not move.
  5. The monotonic clock (D20) is used when no device runs. A switch between
     the two clocks re-anchors at the current timeline time, so the playhead
     does not jump.
- **D22.** Frame choice: `render()` reads the clock once and asks each source for
  that time. During playback the clock never waits for video: a late source
  shows its newest frame (web D4). Play start waits up to 300 ms for every
  active source's first frame, then starts audio. A paused seek waits for the
  exact frame.

## Audio

- **D23.** Use miniaudio. Reasons: one MIT-licensed header with CoreAudio,
  WASAPI, ALSA, and PulseAudio backends. A pull callback that reports frame
  counts, which is the master clock of D21. Device-change notifications.
  `QAudioSink` can pull from a `QIODevice`, but it reads ahead into its own
  buffer and reports position through `processedUSecs()`, so the frame that
  is audible now is not observable. RtAudio is comparable, but it has no
  device-change notification on every backend.
- **D24.** Format: float32 stereo at the device rate. `libswresample` converts
  each source once, on the audio decode worker.
- **D25.** The mix copies the web rules: clip `volumeDb`, track `volumeDb` and
  `pan`, `muted`, `solo` (`soundTrackSoloed`), `master.volumeDb`, and the video
  clips that sound their own audio (`videoClipsWithOwnAudio` in
  `packages/timeline/src/clipAudio.ts`). A video track's own audio keeps unity
  gain and centre pan, because `AudioGraph` never sets that chain. A clip
  speed reads the source at `sourceRate`, resampled linearly, so the pitch
  shifts as with WebAudio `playbackRate`. Time remaps, effects, automation
  and midi clips are out of scope.
- **D26.** Fades use `resolveClipFades` (cap each fade at the clip, and at half
  when the two cross) and the four curves of `fadeShapeGain` in
  `packages/timeline/src/audioFade.ts`, for `t` in [0, 1]:

  | Shape | Gain |
  |---|---|
  | `linear` | `t` |
  | `sCurve` | `(1 - cos(pi t)) / 2` |
  | `plus3dB` | `sin(pi t / 2)` |
  | `minus3dB` | `(2 / pi) asin(t)` |

  A fade-out reads the same curve with `t = (durationMs - msIntoClip) / fadeOutMs`.
  The gain is computed per sample. A unit test checks the C++ curves against
  values from the TypeScript functions.

## Tracks UI

- **D27.** Vertical virtualization: a `TrackWindowModel` lays the rows out with
  exact tops (`layoutTrackRows`) and exposes only the rows of
  `visibleTrackWindow` (`trackWindow.ts`, 3 rows of overscan). Headers and
  lanes are two `Repeater`s over it and share one vertical offset. Reason: a
  `ListView` estimates the height of rows it has not built, so the scroll
  range and a header's position would drift from the web layout with mixed
  row heights. Row heights come from `trackRowHeightPx` (default 64 px).
- **D28.** Horizontal culling: all lanes share one `contentX` (the web
  `scrollLeftPx`). Each `LaneClipModel` holds only the clips that intersect
  `[scrollLeft - 320 px, scrollLeft + width + 320 px]` in time
  (`CLIP_OVERSCAN_PX` in `TrackLane.tsx`). It recomputes at most once per frame.
  A clip under an active gesture (drag, trim, slip) stays in its model even
  when it leaves the window, as the web pins `pinnedClipId` in
  `visibleClipIdsByTrack`. Otherwise the delegate that holds the pointer grab
  is destroyed mid-drag. The pin lasts until the gesture ends or is cancelled.
- **D29.** Zoom and pan copy `Tracks/timelineWheel.ts` (`wheelZoomFactor`)
  and the anchored zoom in `TracksRegion.tsx` as committed on `main` in
  e173cc68f6 ("cap mouse wheel zoom steps and speed up pinch zoom"). This
  branch's own copy of `web/` predates that commit and still uses
  `exp(deltaY * 0.001)` without a cap; the native code follows `main`.
  - `msPerPx` stays in `[0.5, 500]`, default 10.
  - Ctrl or Cmd with the wheel zooms, over the ruler and the headers too.
    Shift with the wheel pans. A horizontal trackpad swipe (`|dx| > |dy|`)
    pans. A vertical wheel scrolls the tracks; over the headers it scrolls
    the lanes.
  - Factor per event: `exp(clamp(deltaPx, -15, 15) * 0.02)`, so a 2x pinch
    zooms 4x and a mouse notch is one step of about 1.35x. A line-mode delta
    is 16 px per line. A Qt trackpad pixel delta is the DOM delta negated; a
    mouse notch (angle delta 120) is Chromium's 100 px. A macOS pinch
    (`QNativeGestureEvent`, `ZoomNativeGesture`) maps to
    `deltaY = -100 * ln(1 + value)`, the delta Chromium reports for a pinch.
  - Events in one frame multiply into one factor and apply once.
  - The time under the cursor stays under the cursor:
    `scrollLeft' = anchorTimeMs / msPerPx' - cursorPx`, then clamped to the
    scroll range. A button or slider zoom keeps the playhead's viewport x.
  - Fit (Shift+Z): `msPerPx = contentEndMs / (viewportWidth - 64)`, content
    start at the left edge. A timeline opens fitted when its first clips
    overflow the lanes, and refits on a resize until the person zooms; a
    later edit never refits.
- **D30.** The playhead is its own item above the lanes. Its `x` is set from
  the clock in the `FrameAnimation` handler (D2). A move does not touch any
  model, the ruler, or a lane.

## Server integration

- **D31.** The client calls tRPC over HTTP with plain JSON. The server
  configures no transformer, so the envelope is `{"result":{"data":...}}`.
  The minimal API:

  | Need | Call |
  |---|---|
  | List timelines | `GET /trpc/timeline.list?input={"projectId":...}` |
  | Fetch a timeline | `GET /trpc/timeline.get?input={"id":...}` returns `timelineSequenceResponse` |
  | Save | `POST /trpc/timeline.update` with `{id, baseUpdatedAt, document}`. The server compares `baseUpdatedAt` and swaps atomically. A mismatch returns a tRPC error with `error.data.code = "CONFLICT"` and `error.data.apiCode = "ALREADY_EXISTS"`. The response has the new `updatedAt` and the `stripped` paths |
  | List assets | `GET /trpc/assets.list?input={...}` |
  | Asset metadata | `GET /trpc/assets.get?input={"id":...}` returns `get_url`, `proxy_url`, `proxy_status`, `content_type`, `size` |
  | Bytes | `GET /api/storage/<key>`, which supports `Range` |

- **D32.** Auth: a request from loopback with no `Origin` header and a `Host`
  of this machine runs as local user `1` when the server trusts loopback
  (`NODETOOL_TRUST_LOCALHOST`, on by default in local mode, `server.ts`).
  Otherwise the client sends `Authorization: Bearer <token>`.
- **D33.** Assets download to a disk cache before decode. Reason: an FFmpeg
  seek over HTTP costs a round trip per seek. The asset API has no general
  source mtime field, so the key uses only what the API returns:
  - Path: `<cacheRoot>/<serverOrigin>/<userId>/<assetId>/<variant>/<version>.<ext>`.
  - `variant` is `original` or `proxy`. The two never share a file.
  - `version` for `original` is a hash of `updated_at`, `size`, and
    `content_type` from `assets.get`. For `proxy` it is the `v` query value of
    `proxy_url`, which the server sets from the source version
    (`lib/asset-response.ts`).
  - A changed version is a new file. Old versions are evicted by LRU under a
    size budget.

  Resume: `/api/storage` serves `Range` but does not handle `If-Range`. So a
  resumed download first checks the asset version through `assets.get` again,
  then sends `Range`, and checks that `Content-Range` names the expected total
  size. Any mismatch deletes the partial file and starts again. A finished file
  must have the expected `size` before it is renamed into place.

  The preview reads the proxy only when `proxy_status` is `ready`. A proxy
  that is absent, pending, or failed falls back to the original, and the client
  checks again when the asset changes. A VP9 proxy decodes in software unless
  the platform has VP9 hardware decode.
- **D34.** Autosave is debounced 750 ms after the last command, as the sketch
  and storyboard editors do. On `ALREADY_EXISTS` the client refetches, shows a
  conflict banner, and does not overwrite.

## Harness

Every capability is driven from the command line first
([Harness-First](../../../docs/HARNESS_FIRST.md#the-rules)):

- `nodetool-timeline <fixture.json> --bench --frames N --size WxH` prints one
  JSON line. It reports four measurements separately and never adds them:
  1. `cpuMs`: CPU time of `render()`, from the monotonic clock.
  2. `gpuMs`: `QRhiCommandBuffer::lastCompletedGpuTime()` (seconds, converted
     to ms) with `QRhi::EnableTimestamps`. The value belongs to an earlier
     frame and can be 0. The bench reports the count of frames with a value,
     and it reports `gpuMs: null` when that count is under 90% of the frames.
  3. `presentIntervalMs`: the time between presented frames. On macOS it comes
     from the drawable's presented time, elsewhere from the frame-swapped
     signal. It measures pacing, not latency.
  4. `frameError`, `heldFrames`, `skippedPresents`: correctness counters.

  Each measurement has p50, p95, max, and a sample count. A budget given with
  `--budget` fails the run when its measurement fails or has no samples
  (fail closed). The exit code is the verdict.
- `--dump-plan --times a,b,c` prints `FramePlan` JSON (D6).
- `--stills --frames ...` reads the offscreen texture back to PNG. Golden
  checks compare a frame with a stored PNG per platform (max channel
  difference 2 of 255), and with `nodetool timeline render --stills` of the
  same fixture (PSNR 40 dB or more).
- Qt Test cases cover the model, JSON round trip, wheel math, fade curves, and
  clock.

## Risks

- **R1.** SceneEval drifts from `sceneModel.ts`. Retire with the plan
  conformance test (D6) in the gate, and a written list of the unsupported
  fields that the loader reports per document.
- **R2.** The `QQuickRhiItem` frame pacing on macOS adds a frame of latency or
  misses vsync under load. Retire in M1a by logging the present interval in the
  bench, and compare with a bare `QRhi` window.
- **R3.** VideoToolbox buffers are not Metal-compatible, or `createFrom()` does
  not accept a `CVMetalTexture`'s texture. Retire with a 200-line spike before
  M1c, on one H.264 and one HEVC file.
- **R4.** D3D11VA texture arrays do not map to `QRhiTexture::createFrom()`.
  The code takes the GPU slice copy from the start (D15). Still open: that an
  R8 and an RG8 view of one NV12 texture both sample on a real device, and
  that the Vulkan DMA-BUF import (a foreign-family acquire from the external
  layout `VK_IMAGE_LAYOUT_GENERAL`, a release back before the VA surface
  returns, every memory plane of a CCS modifier) shows the decoded picture
  on Intel and AMD drivers. Retire both on the reference Windows and Linux
  machines; neither path has been compiled for its platform yet.
- **R5.** Session limits: VideoToolbox and NVDEC limit concurrent sessions per
  process. Retire by opening 12 sessions in the M1c bench. The fallback is
  software decode for the lowest track.
- **R6.** Resolved. Colour mismatch with the web: Chromium chooses the matrix
  and range from the stream and its own defaults. The colour-bar fixtures in
  BT.601 and BT.709, limited and full range, match `timeline render --stills`
  at 48.8 dB on both decoders. For untagged media the native path keeps the
  D10 default (BT.601 below 720 lines, BT.709 at 720 or more). Reason: untagged
  HD is almost always BT.709, common players guess by height, and the export's
  BT.601 for untagged media comes from the swscale default, not from a
  decision. Follow-up for the export path in `packages/` (`timeline render`):
  apply the same height rule to untagged media. This branch does not change
  the export.
- **R7.** Save data loss through a field the native model touches without
  understanding all of it, such as a `transform` with fields added later.
  Retire by writing per field, never per object, and with the no-edit round
  trip test on every example timeline (D4).
- **R8.** The prototype answers the wrong question (F1). Retire with the web
  baseline (PLAN.md M0) on the same fixtures and the same machine.

## Open questions

- **Q1.** Resolved: `nodetool timeline render` resolves clip media only
  through the local asset store (`localAssetResolver` in
  `packages/cli/src/commands/timeline-render.ts`). So the golden script imports
  each fixture file as an asset first, writes a copy of the fixture with those
  asset ids as `currentAssetId`, and renders that copy. This script is an M1a
  deliverable, because M1b's colour check needs it.
- **Q2.** Is the frame time the clock time at `render()`, or the predicted
  display time? The web uses the rAF time. Decide in M1b from the frame-error
  measurement (web acceptance criterion 1: zero frame error on 95% of ticks).
- **Q3.** Should SceneEval run the TypeScript scene model in an embedded JS
  engine instead of a C++ port? That removes R1 but adds a per-frame cost in
  QuickJS. Measure `computeActiveLayers` in QuickJS on the largest example
  timeline before M4 extends SceneEval.
- **Q4.** In local mode an asset can be a file referenced in place. Can the
  native client read that path directly instead of caching a copy? This needs a
  server field that exposes the path to a local client only.
- **Q5.** Which Qt minimum: 6.7 for `QQuickRhiItem`, or 6.8 for the LTS? The
  plan assumes 6.8.
