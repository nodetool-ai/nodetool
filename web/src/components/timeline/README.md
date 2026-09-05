# Timeline Component

The timeline editor (`/timeline/:sequenceId`) is a generation-aware media
sequencing surface. Tracks hold imported or AI-generated clips; each clip
remembers how it was made and can be re-generated, versioned, and exported.

## Editing model

The tracks region follows the editing habits of Premiere and Final Cut, on
a keyboard layout the user picks in the shortcut sheet (`?`):
`timelineKeymap.ts` holds the three layouts and the window handler in
`TracksRegion` resolves every key through it.

- **Ripple** (toolbar toggle): trims and Delete close the gap they would
  leave, on every unlocked track. Shift+Delete ripple-deletes regardless.
  Ctrl-drag on a clip edge rolls the cut with its neighbour. Close gap sits
  in the empty-lane menu.
- **Drop modes** (toolbar): Overwrite, Insert or Overlap decide what a
  dropped clip does to the clips under it; Ctrl on release forces Insert.
- **Edit points**: clicking a trim handle selects that edge. E extends it to
  the playhead, Ctrl+Shift+arrows nudge it a frame.
- **Transitions on the cut**: drag the wedge's right edge for length,
  Ctrl+T cross-fades into the selected clips (the predecessor is extended
  under them), the clip menu adds or removes one.
- **Keyframes**: the inspector's Keyframes section keys a property at the
  playhead; the clip draws them as diamonds. Alt+K keys the armed property.
- **Source viewer** (Source tab): mark in and out on the explorer's selected
  asset, then Append, Insert or Overwrite it at the playhead.
- **Playback**: J/K/L shuttle, I/O mark a loop range shown on the ruler, M
  adds a marker, Up/Down step between cuts.
- **Zoom and pan**: Ctrl/Cmd+wheel zooms at the cursor, and so does a macOS
  trackpad pinch — Chromium reports one as a synthetic ctrlKey wheel, Safari as
  WebKit gesture events, and both land on the same anchored zoom. A two-finger
  horizontal swipe or Shift+wheel pans the lanes.

## Phone layout

Below the `sm` breakpoint (`useTimelineIsMobile`, matching `MobileClassProvider`
and the sketch editor) the shell drops to one column:

- **TopBar** wraps into two rows — prompt + Generate above, the model and
  output chips in a scrolling rail below — and Settings / Save / Save as Asset
  / Export collapse into one overflow menu.
- **Preview** takes the full width. Inspector, Assistant, History, and the
  script transcript move into a bottom sheet opened from the status bar, so
  preview and tracks — the two you need at once — stay stacked and both usable.
- **Track headers** narrow to 132px and drop the reorder grip (HTML5 drag
  doesn't fire from touch) and the type glyph (the V1 / A1 chip already carries
  the type). The control row scrolls: an audio track has six toggles and the
  header fits four.
- **Toolbar** buttons go icon-only on a 44px row.

Touch gestures, since a phone has no right-click, no hover, and no Ctrl+wheel:

| Gesture | Effect |
| --- | --- |
| Long press a clip | Clip menu (split, duplicate, lock, replace, delete) |
| Long press empty lane | Lane menu (add text, add generated clip) |
| Drag a clip | Move it, across tracks included |
| Drag a clip edge | Trim (22px hit area, 8px visible grip) |
| Drag empty lane | Scroll the timeline — marquee select is mouse-only |
| Two-finger pinch | Zoom, anchored between the fingers |
| Drag the divider | Resize the tracks panel |

Long press is `useLongPress`, which composes with the existing pointer handlers
rather than replacing them, so a hold and a drag can share one element.

## Asset Drag-and-Drop

### From AssetExplorer → TrackLane (supported)

Drag any image, video, or audio asset from the `AssetExplorer` panel and drop
it onto a compatible track lane:

| Asset type | Valid track types |
|-----------|-------------------|
| `image/*` | `video`, `overlay` |
| `video/*` | `video`, `overlay` |
| `audio/*` | `audio` |

A clip is created at the drop position with:
- `sourceType = "imported"` and `status = "generated"` (the asset *is* its output).
- `durationMs` derived from `asset.duration` (× 1 000 to convert seconds → ms),
  falling back to 4 000 ms for assets without duration metadata.
- `currentAssetId` pointing to the dragged asset.

Dropping onto an incompatible track (e.g. audio onto a video lane) shows a
brief warning banner and does **not** create a clip.

### From OS file system → Timeline (out of scope)

Dragging a file directly from the operating system's file explorer into the
timeline is **not** supported. The recommended workflow is:

1. Drop the file onto the `Dropzone` in the `AssetExplorer` panel.
   The file is uploaded and appears as a new asset in your library.
2. Once the upload completes, drag the resulting asset from `AssetExplorer`
   onto the desired track lane in the timeline.

This keeps the upload and clip-creation paths separate, ensures assets are
persisted in the database before being referenced by a clip, and avoids
partial-upload states in the timeline document.

## MIDI tracks

A `midi` track carries clips whose content is notes rather than a file, played
by the track's own synth. It mixes exactly like an audio track — gain, fades,
mute/solo, the DSP chain, the offline export — because the notes become an
`AudioBuffer` before they reach any of that.

- **Milliseconds stay the master clock.** A note's `startTick` / `durationTick`
  are ticks (960 per quarter note) counted from its clip's *content* start, so
  trimming the clip hides notes instead of deleting them, and a split copies
  them and moves `inPointMs`. Reading a tick as a time needs the tempo, so
  `setTempo` rescales every midi clip around `tempo.offsetMs` through
  `rescaleClipsForTempo` and leaves every other clip where the editor put it —
  a picture cut does not move because the music got slower.
- **The track owns the instrument**, not the clip: moving a clip to another
  midi track changes its sound. A new midi track gets
  `DEFAULT_MIDI_INSTRUMENT`.
- **Render path**: `preview/midiRender.ts` turns a clip into a mono buffer with
  the pure renderer in `@nodetool-ai/timeline/midi`, caches it under
  `midiRenderKey` (notes + window + tempo + instrument + sample rate) and runs
  it in a module worker when the host has one. `AudioGraph` takes
  `{ clip, buffer }` where an audio clip gives `{ clip, assetUrl }`; everything
  downstream is unchanged. An edit while playing moves the render key, and the
  audio top-up pass stops that clip's sources and re-adds it at the playhead.
  `render/renderAudio.ts` renders midi clips inline on the offline context, so
  an export sounds like the preview. `preview/audition.ts` plays one note
  through the same voice on its own short-lived context.
- **Not supported on a midi clip**: `speedMultiplier` and `timeRemap`. The
  validator rejects them; the editor ignores them.

Four agent tools drive it — `ui_timeline_add_midi_clip`,
`ui_timeline_set_notes` (the whole list, not a merge), `ui_timeline_set_tempo`,
and `ui_timeline_set_track_instrument`. `ui_timeline_get_state` reports the
resolved tempo, each track's instrument, and each midi clip's note count.

## Persistence

Every `TimelineStore` mutation (clip add, move, trim, split, delete) is
observed by the autosave hook, which PATCHes the sequence document via the
timeline REST API (NOD-299). Changes survive a page refresh. Concurrent
edits from another tab are out of scope (last-write-wins via `updated_at`).

## Video Export (frame-by-frame, 1:1 with live)

The **Export** action in the `TopBar` renders the sequence to an MP4 entirely
in the browser. It reuses the *same* compositor and scene description as the
live preview, so an exported frame is identical to what playback showed:

- `@nodetool-ai/timeline/render` — the shared render module: the scene model
  ("what is on screen at time *t*", `computeActiveLayers`), the placement math,
  the caption/text/shape drawing rules, and the effects pre-pass. The live
  `PreviewCompositor`, this renderer, and the server-side
  `nodetool.timeline.RenderTimeline` node all drive their layer lists from it,
  so a render is the same picture wherever it runs.
- `render/TimelineRenderer.ts` — steps the playhead in exact `1 / fps`
  increments, seeks each video element to the precise source frame (waiting for
  `seeked` so decoding is deterministic, not best-effort), composites at full
  sequence resolution with the shared `WebGPUCompositor`, then encodes each
  frame with WebCodecs and muxes to MP4 via [mediabunny](https://mediabunny.dev).
- `render/renderAudio.ts` — mixes the audio tracks down through the same
  `AudioGraph` (clip gain, fades, speed, mute/solo, DSP chain) driven by an
  `OfflineAudioContext`.
- `useTimelineExport` (`hooks/timeline/`) — wires the store + asset URLs to the
  renderer, reports progress, and downloads the resulting file.

The same sequence renders server-side through `RenderTimeline`
(`packages/video-nodes`), which drives the shared scene model and the headless
`HeadlessFrameCompositor` with ffmpeg on both ends (decode to RGBA, encode the
composited frames) — see that node for what it needs (a WebGPU device) and what
it falls back to without one.

The renderer composites at the sequence's true `width × height` (clamped to even
dimensions for H.264). mediabunny and the WebGPU compositor are dynamically
imported only when an export runs, keeping the editor importable under jsdom.

### Compositor backend & Canvas2D fallback

Both the live preview and the offline renderer obtain their compositor through
`createCompositor` (`preview/gpu/createCompositor.ts`), which prefers WebGPU and
falls back to a `Canvas2DCompositor` (`preview/gpu/canvas2dCompositor.ts`) when
WebGPU is unavailable — older browsers, locked-down environments, and headless
CI where SwiftShader's WebGPU fails to initialise. The fallback reuses the exact
placement math: `buildTransformMatrix` produces the clip-space matrix and
`clipMatrixToCanvasAffine` converts it to the 2D affine handed to
`ctx.setTransform`, so layer position / scale / rotation / contain-fit, opacity,
blend modes, and border radius all match the GPU path. Color and blur effects
are approximated with `ctx.filter`; the GPU-only effects (chroma key, vignette,
sharpen) are skipped in the fallback. This keeps the timeline preview rendering
and documentation screenshots capturing real frames without a GPU. The heavier
WebGPU/typegpu bundle is dynamically imported only when `navigator.gpu` exists.

## AI Assistant (agent editing)

The Inspector panel has two tabs: **Inspector** (clip properties) and
**Assistant**. The Assistant is a chat agent that edits the open sequence on
your behalf — cutting, arranging, generating, and tweaking clips like a real
editor. It mirrors the 3D editor's agent: the open editor registers a handler
on the timeline agent bridge, and the agent drives it through `ui_timeline_*`
frontend tools.

- `timelineAgentBridge.ts` — the bridge: serializable node types
  (`TimelineSnapshot`, `TimelineClipNode`, `TimelineTrackNode`), the
  `TimelineAgentHandler` interface, and `set/get/hasTimelineAgentHandler`.
- `hooks/timeline/useTimelineAgentBridge.ts` — builds the handler from the
  surrounding instance's stores (document, UI, playback) plus the direct-gen
  job runner and registers it while the editor is the active surface, so with
  several timeline tabs open the tools target the focused one.
- `lib/tools/builtin/timeline.ts` — the `ui_timeline_*` tool definitions.
- `TimelineAgentPanel.tsx` — the chat surface, reusing `ChatView` wired to the
  shared `GlobalChatStore` (the same chat the rest of the app uses).

### Tools

| Tool | What it does |
|------|--------------|
| `ui_timeline_get_state` | Read tracks, clips, selection, playhead, resolution, fps, duration. Call first. |
| `ui_timeline_add_track` | Add a video / audio / overlay / subtitle / midi track. |
| `ui_timeline_generate_clip` | Generate a clip from a prompt (text-to-video / -image / -audio) and start generation. |
| `ui_timeline_split_clip` | Cut a clip in two (razor) at a time or the playhead. |
| `ui_timeline_trim_clip` | Set on-timeline duration and/or source in/out points. |
| `ui_timeline_move_clip` | Move a clip to a start time and/or another track. |
| `ui_timeline_delete_clip` | Remove a clip. |
| `ui_timeline_duplicate_clip` | Duplicate a clip (keeps its generation binding for variations). |
| `ui_timeline_set_clip_params` | Change render/audio params (opacity, speed, volume, fades, blend, …). |
| `ui_timeline_set_clip_binding` | Edit a generated clip's prompt / provider / model / voice and optionally regenerate. |
| `ui_timeline_select_clip` | Select a clip (drives the inspector). |
| `ui_timeline_seek` | Move the playhead. |
| `ui_timeline_add_midi_clip` | Place a midi phrase on a midi track, notes in ticks. |
| `ui_timeline_set_notes` | Replace a midi clip's whole note list. |
| `ui_timeline_set_tempo` | Set the document tempo; rescales the midi clips. |
| `ui_timeline_set_track_instrument` | Set the synth a midi track plays. |

Clips and tracks are addressed by id, by case-insensitive name, or — for the
selected clip — the literal `"selected"`. Times are milliseconds on the
sequence timeline. Generation reuses the last-used model for the media kind
when `provider`/`model` are omitted; the agent can discover valid models with
the model-search tool.
