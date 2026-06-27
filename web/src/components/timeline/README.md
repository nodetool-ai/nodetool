# Timeline Component

The timeline editor (`/timeline/:sequenceId`) is a generation-aware media
sequencing surface. Tracks hold imported or AI-generated clips; each clip
remembers how it was made and can be re-generated, versioned, and exported.

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

## Persistence

Every `TimelineStore` mutation (clip add, move, trim, split, delete) is
observed by the autosave hook, which PATCHes the sequence document via the
timeline REST API (NOD-299). Changes survive a page refresh. Concurrent
edits from another tab are out of scope (last-write-wins via `updated_at`).

## Video Export (frame-by-frame, 1:1 with live)

The **Export** action in the `TopBar` renders the sequence to an MP4 entirely
in the browser. It reuses the *same* compositor and scene description as the
live preview, so an exported frame is identical to what playback showed:

- `preview/sceneModel.ts` — the single source of truth for "what is on screen
  at time *t*" (`computeActiveLayers`). Both `PreviewCompositor` (live) and the
  renderer drive their GPU layer lists from it.
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
| `ui_timeline_add_track` | Add a video / audio / overlay / subtitle track. |
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

Clips and tracks are addressed by id, by case-insensitive name, or — for the
selected clip — the literal `"selected"`. Times are milliseconds on the
sequence timeline. Generation reuses the last-used model for the media kind
when `provider`/`model` are omitted; the agent can discover valid models with
the model-search tool.
