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

Drag any image, video, audio or 3D-model asset from the `AssetExplorer` panel
and drop it onto a compatible track lane:

| Asset type | Valid track types |
|-----------|-------------------|
| `image/*` | `video`, `overlay` |
| `video/*` | `video`, `overlay` |
| `audio/*` | `audio` |
| `model/*` | `video`, `overlay` |

A clip is created at the drop position with:
- `sourceType = "imported"` and `status = "generated"` (the asset *is* its output).
- `durationMs` derived from `asset.duration` (× 1 000 to convert seconds → ms),
  falling back to 4 000 ms for assets without duration metadata.
- `currentAssetId` pointing to the dragged asset.

A model lands as a `model3d` clip carrying `DEFAULT_MODEL3D_STYLE` — 3D is
picture, so it goes where a title goes and never onto an audio lane. A glTF
has no duration of its own, so the clip is 4 000 ms long whatever the asset
says. A `.glb` or `.gltf` name also reads as a model wherever the whole asset
is known (`assetToClip`), which covers an upload typed
`application/octet-stream`; a lane drop matches on the content type alone.
The same clip is one click away without a drag: the lane's add-clip menu has
a "3D model" entry listing the library's models.

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

### Editing a part

- **Tempo** lives in Project settings (the TopBar's Settings): BPM, time
  signature and where beat one sits. It is document state the autosave already
  carries, so applying it calls the store's `setTempo` rather than the
  `width`/`height`/`fps` PATCH the same dialog does — and the dialog says what
  the change will do to the parts already in the document.
- **Bars ruler and grid**: the toolbar's Bars toggle switches `TimeRuler` from
  timecode to bar lines with beat ticks (`rulerMode` on `TimelineUIStore`; the
  tick list is `computeBarRulerTicks` in `Tracks/tempoGrid.ts`, so the labels
  are testable without a canvas). The division select next to it sets
  `gridDivision` — bar, beat, or a note value — which is what `collectSnapCandidates`
  offers as extra snap targets, over the visible range only, whenever the
  magnet is on and the document either has a midi track or is read in bars.
  The status bar's readout follows the ruler: bar.beat.tick in bars mode,
  timecode otherwise.
- **Instrument**: a midi track header carries a preset select
  (`MIDI_INSTRUMENT_PRESETS`, reading "Custom" when the voice matches none) and
  an Edit toggle that expands `TrackInstrumentPanel` under the row, the way the
  DSP chain editor does. Waveform, ADSR, cutoff (log 20 Hz–20 kHz), resonance
  and gain each write the track and audition a middle C, debounced so a slider
  drag plays one note rather than sixty.
- **Note edits**: selecting a midi clip shows `Inspector/ClipMidiSection` —
  note and audible-note counts, transpose (±1, ±12), quantize (division,
  strength, onsets or onsets+lengths) and velocity scaling. Each Apply is one
  store action (`transposeClip`, `quantizeClip`, `scaleClipVelocity`) and one
  undo entry.

### The piano roll

`pianoRoll/PianoRollPanel` is the clip editor: a resizable strip under the
tracks, opened by double-clicking a midi clip, by "Edit notes" in the clip
menu, or by the Inspector's Edit notes button. `pianoRollClipId`,
`pianoRollHeightPx`, `openPianoRoll` and `closePianoRoll` live on
`TimelineUIStore`; the panel closes itself when the clip it edits is gone. The
side dock is 360 px wide, so the panel stacks below the tracks instead — and on
a phone it replaces the tracks region with a Back control.

- **What it draws** (`PianoRoll` + `PianoRollGrid`, `PianoRollKeyboard`,
  `PianoRollRuler`, `PianoRollVelocityLane`): a clickable keyboard column that
  auditions through the track's own voice, a bars:beats ruler built from
  `computeBarRulerTicks` over the timeline milliseconds the clip's content
  plays at, the note grid, and one velocity bar per note. It shows the clip's
  **content**, not its window: everything outside `inPointMs …
  inPointMs + durationMs` is shaded, because a trim hides notes rather than
  deleting them. The playhead is written into the DOM from the playback store's
  transient time channel, so a playing timeline does not re-render the panel.
- **Gestures**: click empty space to add a note one grid unit long at velocity
  100 (auditioned); click to select, Shift+click to toggle, drag empty space to
  marquee-select (overlap, not containment); drag a note body to move it in
  ticks and semitones, snapped to `gridDivision` unless Alt is held, auditioning
  each new pitch; drag the last 8 px to resize; double-click to delete; drag a
  velocity bar to set that note's velocity.
- **Keys** (the panel is focusable and `TracksRegion`'s window handler skips
  `[data-timeline-piano-roll]`, so these never reach the clip keymap):
  Delete/Backspace removes the selection, Ctrl/Cmd+A selects all, Ctrl/Cmd+D
  duplicates one grid unit past the selection's end, ←/→ nudge by a grid unit,
  ↑/↓ by a semitone (Shift for an octave), Escape clears the selection and then
  closes the panel.
- **Zoom and scroll** follow `timelineWheel.ts`: Ctrl/Cmd+wheel zooms anchored
  at the cursor, Shift+wheel and a two-finger horizontal swipe pan, a plain
  vertical wheel scrolls the 128 pitches. The view opens framed on the clip's
  window and centred on its notes (C3..C5 when there are none).
- **Undo**: every pointer gesture is one entry — the drag writes through
  `setClipNotes` on each move (so the audio top-up pass re-renders the clip as
  you edit) with the temporal middleware paused by `useTimelineHistoryBatch`,
  the same way a clip drag works. Each keyboard action writes once, so it is
  one entry by construction.
- **Where the math lives**: the note-list edits are pure functions in
  `@nodetool-ai/timeline` (`midi/notesEdit.ts`: `addNote`, `removeNotes`,
  `moveNotes` — clamped as a group so a chord keeps its spacing — `resizeNotes`,
  `setVelocity`, `duplicateNotes`, `notesInRect`, `snapTick`), and the pixel
  mapping is `pianoRoll/pianoRollGeometry.ts` (`tickToX`, `xToTick`, `pitchToY`,
  `yToPitch`, `noteRect`, `hitTestNote` with its 8 px end grip, `isBlackKey`,
  `pitchName`, `initialTopPitch`). Both are unit-tested without a canvas.

Seven agent tools drive it — `ui_timeline_add_midi_clip`,
`ui_timeline_set_notes` (the whole list, not a merge), `ui_timeline_set_tempo`,
`ui_timeline_set_track_instrument`, `ui_timeline_transpose_clip`,
`ui_timeline_quantize_notes` and `ui_timeline_scale_velocity`.
`ui_timeline_get_state` reports the resolved tempo, each track's instrument and
the preset it matches, and each midi clip's note count.

## 3D clips

A glTF asset on a `video` or `overlay` track is a clip with
`mediaType: "model3d"`. The model sits in `currentAssetId`, where an image clip
keeps its image, so replace, versions, thumbnails and the dependency hash work
unchanged. Everything the timeline adds is `model3dStyle`: the camera (orbit
terms, or a glTF camera by name), which glTF animation plays and how fast,
lighting preset and intensity, background, and the bake once one exists.
`DEFAULT_MODEL3D_STYLE` in `@nodetool-ai/timeline` is what a dropped model
starts with.

The animation runs on the clip's own source time, so trimming, speed and a time
remap retime it exactly as they retime video, and `animation.speed` multiplies
on top. Four animated channels (`cameraAzimuth`, `cameraElevation`,
`cameraZoom`, `cameraFov`) fold onto the authored pose and keyframe like any
other channel; on a clip that is not 3D they are ignored. The `orbit` preset
drives `cameraAzimuth`, which is what makes a turntable one `animate_clip`
call.

### Live rendering

`preview/Model3DLayerSource.ts` holds one three.js render session per active 3D
clip — a GLB loaded once onto an `OffscreenCanvas`, then asked for frame after
frame — and hands that canvas to the compositor as the layer's
`CompositeSource`, so the live preview and the export draw the same pixels from
the same code. A session owns a WebGL context, so the pool holds at most
`MAX_MODEL3D_LAYERS` (two) and evicts the least recently drawn; the scene model
caps live 3D layers at the same number and reports a third as a dropped layer
with reason `model3d_layer_cap`. A baked clip is a video layer and counts
against the video cap instead.

Lighting, intensity, background and the animation selection fix a session, so
changing one re-creates it; the camera is per frame, so orbiting, keying a
camera channel and scrubbing never reload the model. Without WebGL, or with a
GLB that will not load, the clip draws the outlined placeholder a missing asset
draws rather than leaving a silent gap.

Alt-drag on the preview turns the selected 3D clip's azimuth and elevation and
Alt-wheel dollies its zoom (`preview/model3dOrbitGesture.ts`, at three.js
`OrbitControls` rates so the model editor and the timeline turn by the same
amount); both write `model3dStyle.camera` through `patchClip`, one undo entry
per gesture. Lane filmstrips and the agent's `ui_timeline_get_clip_frames` draw
from the same source on a separate one-session pool
(`Tracks/model3dClipFrames.ts`), so building a strip cannot evict the clip being
scrubbed.

### Bake

The inspector's Bake row and the `bake_model3d_clip` op render the clip through
`nodetool.blender.RenderAnimation` and store `{ assetId, dependencyHash }` under
`model3dStyle.bake`. Blender is sent the evaluated sample list — one model time
and one camera per output frame — so a trimmed, sped-up, reversed or looped clip
bakes as what it plays. An opaque style muxes to MP4 H.264; a transparent one
encodes to WebM VP9 `yuva420p` so the bake still composites over the footage
under it.

The scene model plays a bake as a video layer only while its hash still matches
the clip, seeking it by clip-local time (frame *i* is the clip's *i*-th frame,
whatever its in point). A style, trim, speed, remap, duration or sequence-format
edit makes the bake stale and the live layer draws again; moving or fading the
clip does not, because those apply to the baked layer the way they apply to any
video. A browser that cannot decode an alpha bake — Safari decodes VP9 and
throws the alpha away — falls back to the live layer with a `bake_undecodable`
degradation instead of drawing an opaque box over the footage
(`preview/bakeDecoding.ts`).

### From the agent

Three ops reach a 3D clip: `add_model3d_clip`, `set_model3d_style` and
`bake_model3d_clip`. The browser's `ui_timeline_edit` and the server's
`edit_timeline` dispatch them from the same op union, and each is also a
standalone `ui_timeline_*` tool.
`validate_timeline` reports `model3d_style_missing` (a `model3d` clip with no
style or no asset) as an error and `bake_stale` as a warning.
`preview_timeline_frame` renders 3D layers server-side and reports each one's
camera and animation time — [docs/harnesses.md § 3D clips in
preview_timeline_frame](../../../../docs/harnesses.md#3d-clips-in-preview_timeline_frame).

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
| `ui_timeline_set_track_instrument` | Set the synth a midi track plays, spelled out or as `{"preset": "soft-pad"}`. |
| `ui_timeline_transpose_clip` | Move every note in a midi clip by whole semitones. |
| `ui_timeline_quantize_notes` | Snap a midi clip's onsets (and optionally lengths) to a note grid. |
| `ui_timeline_scale_velocity` | Scale how hard every note in a midi clip is struck. |

Clips and tracks are addressed by id, by case-insensitive name, or — for the
selected clip — the literal `"selected"`. Times are milliseconds on the
sequence timeline. Generation reuses the last-used model for the media kind
when `provider`/`model` are omitted; the agent can discover valid models with
the model-search tool.
