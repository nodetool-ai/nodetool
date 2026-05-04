# PRD: NodeTool AI Timeline Editor

Status: Draft, scoped for Slice 1 + Slice 2.
Owner: Timeline Editor feature team.
Last updated: 2026-05-04.

## 1. Summary

The AI Timeline Editor is a **generation-aware** media sequencing surface for NodeTool. Users assemble videos, image sequences, audio pieces, ads, trailers, and social clips by arranging AI-generated and imported media on a multi-track timeline. Every generated clip is backed by a NodeTool graph (single node or pipeline), so clips remember how they were made and can be inspected, tweaked, regenerated, versioned, and exported without leaving the editor.

This PRD adapts the closed PR #309 (`copilot/add-multi-track-timeline-editor`, 12k+ lines, asset-only timeline) to NodeTool's actual architecture. The PR is rewritten from scratch, reusing existing components, stores, primitives, and the Inspector pattern instead of duplicating them.

Positioning: **NodeTool Timeline is a generation-aware editor for AI media workflows.** Not "another video editor."

## 2. Scope

### 2.1 In scope (this PRD)

**Slice 1 — Timeline shell and imported clips**
- Standalone route `/timeline/:sequenceId`.
- New `timeline_sequence` table.
- Tracks (V1–V3, A1–A3, overlay), playhead, ruler, zoom, multi-track rendering.
- Imported clip CRUD: add (drag from `AssetExplorer`), select, multi-select, move, trim, split, duplicate, delete, snap.
- Preview player wired to existing `OutputRenderer` / `AudioPlayer` / `VideoViewer`.
- Inspector reuse for selected-clip metadata.
- Project persistence and autosave.

**Slice 2 — Generation binding**
- `GenerationBinding` on clips: graphId, graphVersionId, selectedOutputNodeId, nodeStates, dependencyHash.
- Node-stack inspector (vertical list of bound nodes) reusing `PropertyField`.
- Dirty/stale tracking via dependency hash; downstream invalidation.
- "Generate clip" / "Generate node + downstream" wired to `WorkflowRunner` and `GlobalWebSocketManager`.
- Per-clip status badges (draft, queued, generating, generated, stale, failed, locked).
- "Open in Node Editor" round-trip with remap on graph-structure change.
- Three predefined clip templates: Text-to-Image, Image-to-Video, Text-to-Speech.
- Per-clip version history (basic): keep last N successful generations, restore previous.

### 2.2 Out of scope

- Slice 3+: timeline templates, full Library modal, export pipeline (`Render All` MP4 mux), proxy/final tier, batch variations, A/B compare, captions, AI extend, music-aware timing, multi-shot consistency, collaboration, cloud-execution dashboard, advanced color grading.
- Realtime generation, frame-accurate finishing, professional NLE parity, 3D/VFX compositing.
- Multi-user editing, comments, review links.

### 2.3 Explicit non-goals

- No left sidebar in the timeline editor's main layout.
- No embedded node-graph canvas inside the inspector — only a vertical node stack.
- No permanent generation queue panel — only a compact top-bar activity indicator.
- No automatic regeneration on edit.

## 3. Adaptation principles

The original PR built parallel infrastructure for things NodeTool already has. The adaptation rule:

> Reuse first. Build only what genuinely doesn't exist.

| Concern | Reuse | Build |
| --- | --- | --- |
| Audio waveform | `web/src/components/audio/AudioPlayer.tsx` (WaveSurfer) | Track-lane waveform overlay that calls into AudioPlayer's renderer |
| Video preview | `web/src/components/asset_viewer/VideoViewer.tsx` | `<video>` sync to playhead |
| Image preview | `web/src/components/asset_viewer/ImageViewer.tsx` | Pan/zoom container if needed |
| Output dispatch | `web/src/components/node/OutputRenderer.tsx` | — |
| Asset library | `AssetExplorer`, `AssetGrid`, `Dropzone`, `WorkflowAssetStore` | Drag-to-clip adapter |
| **Per-clip graph** | **`Workflow` model — each generated clip is a workflow row** with `run_mode = "clip"` | — |
| **Exposed parameters** | **Existing `*InputNode` classes** (`FloatInputNode`, `StringInputNode`, `IntegerInputNode`, `BooleanInputNode`, `SelectInputNode`, `ImageSizeInputNode`, `ColorInputNode`, `LanguageModelInputNode`, etc.) — the workflow's `Input*` nodes ARE the exposed parameters | — |
| Inspector frame | `web/src/components/Inspector.tsx`, `InspectedNodeStore` | Slim wrapper that swaps target between clip / clip-bound node |
| Property editing | `web/src/components/node/PropertyField.tsx`, `web/src/components/properties/*` | — (Input-node properties already render through these) |
| Workflow templates | Existing template/preset infrastructure + `tags` | Three timeline-targeted seeded workflows tagged `"timeline-template"` |
| Open in Node Editor | Existing workflow editor at `/editor/:workflowId` | Just navigate; no remap |
| Execution | `WorkflowRunner.run(workflow, paramOverrides)`, `GlobalWebSocketManager`, `Job` | Clip-scoped subscription, hash-based stale detection |
| Status / errors | `StatusStore`, `ErrorStore`, `StatusIndicator`, `WarningBanner` | Clip-status mapping |
| Past outputs | `ResultsStore`, `NodeResultHistoryStore`, `MediaGenerationStore`, `Job.outputs` | Clip-version index (jobId + assetId per version) |
| Top bar | `AppHeader`, `AppToolbar` | Timeline-scoped action set |
| Undo/redo | `NodeStore` zundo pattern | Apply same pattern in `TimelineStore` |
| UI primitives | `web/src/components/ui_primitives/*` (mandatory; no raw MUI) | — |
| Data models | `Workflow`, `Job`, `Asset`, `Prediction` in `packages/models` | New `TimelineSequence` only |

PR #309 is **not** kept in-tree. All timeline code is written from scratch using primitives and existing stores.

## 4. Architecture

### 4.1 Packages

- **New: `packages/timeline/`** — pure types and pure functions.
  - `types.ts` — `TimelineSequence`, `TimelineTrack`, `TimelineClip`, `ClipInvocation`, `ClipVersion`, `ClipStatus`. (Graph state lives in the bound `Workflow`, not duplicated here.)
  - `dependencyHash.ts` — deterministic hash over `{ workflowId, workflow.updated_at, paramOverrides, currentInputAssetHashes }`. The bound workflow's `updated_at` is the only fingerprint of the graph itself; if the user edits the workflow in the Node Editor, every clip pointing to it goes stale.
  - `splitClip.ts`, `trimClip.ts`, `snap.ts` — pure timeline math.
  - No React, no Zustand, no MUI. Vitest unit tests.
- **`packages/models/`** —
  - **Reuse `Workflow`**. Each generated clip references an existing `Workflow` row via `workflowId`. Workflows are filtered/discriminated by the existing `run_mode` field:
    - `"workflow"` — standalone workflow (existing default; unchanged). Any standalone workflow whose graph terminates in an `ImageOutputNode` / `VideoOutputNode` / `AudioOutputNode` can be used as a clip source.
    - `"clip"` — clip-private clone owned by a single clip; hidden from the standalone workflow list.
    - `"sequence"` — reserved for Slice 3 (whole-timeline export workflow).
    The standalone workflow listing filters to `run_mode IN ("workflow", null)`. No schema migration needed for `run_mode`; it already exists.
    Curated clip templates are tagged (existing `tags` field), e.g. `"timeline-template"`. The Add-Generated-Clip menu shows tagged workflows by default with an "All workflows" option to browse the rest.
  - **Add `timeline_sequence` table**:
  ```
  timeline_sequence (
    id text primary key,
    workflow_id text references workflow(id),  -- optional, for "save as workflow"
    project_id text,
    user_id text not null,
    name text not null,
    fps integer not null default 30,
    width integer not null default 1920,
    height integer not null default 1080,
    duration_ms integer not null default 0,
    document jsonb not null,                   -- tracks, clips, markers, bindings, versions
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
  );
  ```
  Clips and tracks live inside `document` (JSONB) to keep migrations cheap. Generated assets stay in `asset` table; versions reference asset ids.

### 4.2 Web

- **Route**: `/timeline/:sequenceId` (standalone). New top-level entry in the web router.
- **Components** under `web/src/components/timeline/`:
  - `TimelineEditor.tsx` — page shell. Composes `TopBar`, `PreviewArea`, `TimelineInspector`, `Tracks`, `BottomStatusBar`. No raw MUI.
  - `TopBar.tsx` — uses `AppHeader`-style primitives; project name, save status, Project / Library / Exports buttons, Render All. New action set, not a reuse of `AppHeader` itself (different routes).
  - `PreviewArea.tsx` — wraps `OutputRenderer` for the clip under the playhead. Sequence selector, transport, fit/fill, fullscreen, FPS readout, timecode. Transport buttons use `PlaybackButton` and `ToolbarIconButton`.
  - `Tracks/`
    - `TimeRuler.tsx` — canvas-rendered ruler; ticks scaled by zoom; reads playhead.
    - `Playhead.tsx` — single absolute-positioned line; drag-to-scrub.
    - `TrackLane.tsx` — track row; drop target; hosts clips.
    - `TrackHeader.tsx` — name, visibility, lock, mute/solo, height handle.
    - `Clip.tsx` — generic clip with selection, drag, trim handles, status badge.
    - `clipMedia/AudioClipBody.tsx` — embeds `AudioPlayer` in waveform-only mode (no controls).
    - `clipMedia/VideoClipBody.tsx` — thumbnail strip from `Asset.metadata.thumbnails`.
    - `clipMedia/ImageClipBody.tsx` — single thumbnail.
    - `clipMedia/PlaceholderClipBody.tsx` — for draft/stale/failed/missing/generating states.
  - `Inspector/`
    - `TimelineInspector.tsx` — root; swaps between `ImportedClipPanel` and `GeneratedClipPanel` based on selection.
    - `GeneratedClipPanel.tsx` — header, `NodeStack`, `NodePropertyEditor`, action bar.
    - `NodeStack.tsx` — vertical list of bound nodes (index, icon, name, provider/model, status, dirty/error indicators, menu). Selection drives a local `SelectedClipNodeStore` that feeds `NodePropertyEditor`.
    - `NodePropertyEditor.tsx` — reuses `PropertyField` from existing node UI; filters on the binding's `exposedParameters`.
    - `ClipActions.tsx` — Generate / Generate Stale / Regenerate / Duplicate as Variation / Open in Node Editor / Reset Seed / Randomize Seed / Lock / Revert.
    - `VersionList.tsx` — collapsed by default; restore / favorite / delete.
  - `BottomStatusBar.tsx` — local/cloud, generating count, failed count, cost estimate, zoom slider.

- **Stores** under `web/src/stores/timeline/`:
  - `TimelineStore.ts` — Zustand + zundo. Holds the in-memory `TimelineSequence`. Selectors only; never subscribe to the full store. Mutations: `moveClip`, `trimClip`, `splitClip`, `duplicateClip`, `deleteClip`, `addTrack`, `setBindingParam`, `commitVersion`, etc.
  - `TimelineUIStore.ts` — selection, hover, multi-select, zoom, scroll, playhead, open panels, fullscreen.
  - `TimelinePlaybackStore.ts` — play state, currentTime (ms), rate. Drives `PreviewArea`.
  - `TimelineGenerationStore.ts` — per-clip job ids, mapping back to `WorkflowRunner` / `GlobalWebSocketManager` subscriptions; emits status transitions used by `Clip` and `NodeStack`.
  - All stores follow project rules: typed selectors, `shallow` for multi-value selections, no full-store subscribes.

- **Server state**: TanStack Query for `timelineSequence`, `clipVersions`, `assetThumbnails`. Keys hierarchical: `["timeline", sequenceId, ...]`.

- **Persistence**: REST endpoints (added to existing `packages/websocket` Fastify routes):
  - `GET /api/timeline/:id`
  - `POST /api/timeline` (create)
  - `PATCH /api/timeline/:id` (debounced autosave)
  - `POST /api/timeline/:id/clips/:clipId/versions` (record successful generation)
  - `GET /api/timeline/:id/clips/:clipId/versions`

### 4.3 Clip → Workflow binding

Every generated clip is backed by exactly one `Workflow` row.

- **Imported clips** have `workflowId === null`. They reference an `Asset` directly and have no inspector node-stack.
- **Generated clips** have `workflowId` set. The workflow's graph contains its own `Input*` nodes (`StringInputNode`, `FloatInputNode`, `IntegerInputNode`, `BooleanInputNode`, `SelectInputNode`, `ImageSizeInputNode`, `ColorInputNode`, `LanguageModelInputNode`, etc.). **The Input nodes ARE the exposed parameters** — no parallel `ExposedParameter` declaration on the clip.
- The clip stores **`paramOverrides: Record<inputNodeName, value>`** — the inputs to feed the workflow on each invocation. The inspector renders one `PropertyField` per `Input*` node in the bound workflow, sourced from the existing node metadata. This is the same path the standalone workflow editor already uses for "run with inputs" dialogs.
- The clip stores **`selectedOutputNodeId`** — which terminal node's output becomes the clip's media. Workflows with one obvious media-output node default to it; multi-output workflows force a choice on creation.

**Lifecycle**:
- Creating a generated clip from any standalone workflow (via the Add-Generated-Clip menu, or "Use as clip" from a workflow's context menu): the timeline **clones** that workflow into a new `run_mode = "clip"` row owned by the clip. The clone is independent — editing the source workflow later does not affect existing clips. (Linked-duplicate behavior is opt-in per clip-pair, see below.)
- **Duplicate as Variation** clones the clip's workflow into another `run_mode = "clip"` row.
- **Duplicate Linked** keeps the same `workflowId` for both clips; both regenerate together.
- **Save as Reusable Template** flips `run_mode` from `"clip"` to `"workflow"` and adds the `"timeline-template"` tag, promoting the clone into a normal standalone workflow that appears in the curated clip menu. The clip retains its reference. Once promoted, ordinary workflow-listing rules apply.
- **Deleting a clip** with a `run_mode = "clip"` workflow: if no other clip references that `workflowId`, the workflow row is deleted. Otherwise (linked duplicates), the row is kept and only the clip reference is removed. Standalone (`run_mode = "workflow"`) sources are never deleted by clip operations.
- **Open in Node Editor** navigates to `/editor/:workflowId`. Returning to the timeline picks up the new `workflow.updated_at`, which automatically marks all referencing clips stale (see §4.4).

### 4.4 Generation flow

1. User edits an `Input*` node's value in the inspector.
2. `TimelineStore.setParamOverride(clipId, inputNodeName, value)`:
   - Updates `paramOverrides`.
   - Recomputes the clip's `dependencyHash` (workflowId + workflow.updated_at + paramOverrides + input-asset hashes).
   - If `dependencyHash !== lastGeneratedHash`, sets clip `status = "stale"`.
3. UI updates: clip badge shows `Stale`; preview keeps showing last successful version with stale overlay.
4. User clicks **Generate Clip**:
   - `WorkflowRunner.run(workflow, { params: paramOverrides })` — exactly the same call the standalone editor uses.
   - Subscribe via `GlobalWebSocketManager` keyed by `jobId`.
   - On `NodeUpdate`/`Prediction`/`JobUpdate` events, `TimelineGenerationStore` updates per-clip status; the inspector's node-stack reads existing `StatusStore`/`ResultsStore` keyed on the bound workflow's nodes — no duplication.
   - On success: append a `ClipVersion { jobId, assetId, hash, … }`, set `currentAssetId = assetId`, `lastGeneratedHash = dependencyHash`, clip `status = "generated"`.
5. Failure: clip `status = "failed"`, error pulled from existing `ErrorStore` keyed by jobId+nodeId; primary action becomes **Retry**.

There is no "Generate node + downstream" command at the clip level — partial-graph execution is a workflow-runner concern. If a user needs that level of control, they open the workflow in the Node Editor.

### 4.4 Reuse rules and migration

- **No raw MUI imports** in any new file (`Typography`, `Button`, `IconButton`, `Tooltip`, `Dialog`, `Paper`, etc. are forbidden outside `ui_primitives/` and `editor_ui/`). Use primitives.
- `FlexRow` / `FlexColumn` over `Box sx={{ display: 'flex' }}` when shorthand props suffice.
- Theme tokens only; no hardcoded colors or spacing.
- All inter-package imports use `@nodetool-ai/<package>`. Never import from `dist/`.
- All new files are TypeScript strict mode; no `any`.
- Functional React components; typed props.

## 5. UX

### 5.1 Layout

Top bar (full width). Below: preview (left ~55%) + inspector (right ~45%). Below: full-width tracks. Optional bottom status bar.

No left sidebar. No graph canvas. No queue panel.

### 5.2 Preview

- `OutputRenderer` for the clip under the playhead; falls back to a placeholder body for `draft`, `failed`, `missing`, `generating` states.
- `stale` state shows last successful version with a "Stale" badge overlay.
- Transport: play/pause, step prev/next clip boundary, frame step, timecode, FPS, fullscreen, fit/fill.

### 5.3 Tracks

- Default tracks on new sequence: V1, V2 (Overlay), A1 (Music), A2 (SFX), A3 (Voiceover). Add/remove/reorder/resize allowed.
- Track header: name, visibility, lock, mute/solo (audio), height handle.
- Snap to playhead and clip boundaries.
- Drag from `AssetExplorer` creates an imported clip; drag a graph preset from Library creates a generated clip.

### 5.4 Inspector

Two states:

- **Imported clip selected** — `ImportedClipPanel`: name, asset, in/out, duration, transform/opacity/speed/volume. Actions: Replace Media, Reveal in Library, Convert to Generated Clip.
- **Generated clip selected** — `GeneratedClipPanel`: header (thumbnail, name, type, status, duration, model summary, timestamps); `NodeStack`; `NodePropertyEditor` for the selected node; `ClipActions`.

Selecting a node in the stack drives `SelectedClipNodeStore`, which `NodePropertyEditor` reads. This mirrors the existing `InspectedNodeStore` → `Inspector` → `PropertyField` pattern.

### 5.5 Status badges

| Status | Source | Display |
| --- | --- | --- |
| `draft` | binding exists, no version | dim border, "Draft" |
| `queued` | job queued | spinner outline |
| `generating` | `JobUpdate.status = running` | progress bar in clip body |
| `generated` | latest hash matches | normal |
| `stale` | hash mismatch | yellow badge "Stale" |
| `failed` | `JobUpdate.status = failed` | red badge, error tooltip |
| `locked` | user-set | lock icon |
| `missing` | currentAssetId asset not found | gray placeholder |

Badges use `StatusIndicator` and tokenized colors.

## 6. Decisions on open questions

1. **Auto-replace on success.** Successful generation replaces `currentAssetId` immediately; previous version stays in `versions[]`. Locked clips do not replace.
2. **Cloned workflow per clip, not embedded snapshot.** Each generated clip points to its own `Workflow` row with `run_mode = "clip"`. Cloning happens at clip creation, regardless of whether the source was a curated template or a user's standalone workflow. Editing one clip's workflow does not affect others. This replaces the original "embedded graph snapshot" plan.
3. **Inspector exposes the bound workflow's `Input*` nodes.** No parallel exposed-parameter declaration. The author of a clip-template workflow chooses what's exposed by which `Input*` nodes they place in the graph — exactly like the standalone workflow runner.
4. **Timeline format.** New `timeline_sequence` table (decided). Sequences themselves are not workflows in Slice 1+2.
5. **Sequence-as-graph.** Reserved as `run_mode = "sequence"` for Slice 3 (the export compiler emits one of these). Not implemented in Slice 1+2.
6. **Variants.** Stored in `versions[]` on the clip (each version = `{ jobId, assetId, hash }`). Separate-clip variants are produced by Duplicate as Variation, which clones the clip's workflow into a new `run_mode = "clip"` row.
7. **Render All** opens a preflight dialog listing stale/missing/failed clips with Generate Stale / Export Anyway / Cancel.
8. **Local vs cloud per node.** Backend decides via existing provider routing; UI shows `Local` / `Cloud` / `Requires API key` indicators.
9. **Custom exposed parameters.** Out of scope. The clip-template workflow author chooses exposure by which `Input*` nodes are placed.
10. **Multi-output clips.** Out of scope. One `selectedOutputNodeId` per clip; alpha/audio side outputs are future work. Workflows with multiple terminal output nodes force a choice at clip creation.
11. **Workflow listing filter.** Standalone workflow listings filter to `run_mode IN ("workflow", null)`. `"clip"` workflows are visible only inside their owning timeline. The Add-Generated-Clip menu queries `run_mode IN ("workflow", null)` and prefers entries tagged `"timeline-template"`, with an "All workflows" expander to browse the rest.
12. **Clip-workflow lifecycle.** Deleting the last clip referencing a `run_mode = "clip"` workflow deletes that workflow. Promoting via "Save as Reusable Template" flips `run_mode` from `"clip"` to `"workflow"` and adds the `"timeline-template"` tag — the row becomes an ordinary standalone workflow.

## 7. Data model

```ts
type ClipStatus =
  | "draft" | "queued" | "generating" | "generated"
  | "stale" | "failed" | "locked" | "missing";

interface TimelineSequence {
  id: string;
  projectId: string;
  workflowId?: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  createdAt: string;
  updatedAt: string;
}

interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "overlay" | "subtitle";
  index: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  solo?: boolean;
  heightPx?: number;
}

interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  inPointMs?: number;
  outPointMs?: number;
  mediaType: "image" | "video" | "audio" | "overlay";
  sourceType: "imported" | "generated";

  // Imported clips: assetId is set, workflowId is null.
  // Generated clips: workflowId references a Workflow row, normally run_mode = "clip"
  // (clip-private clone). May reference a shared standalone workflow when the user
  // explicitly chose Duplicate Linked.
  workflowId?: string;
  selectedOutputNodeId?: string;
  paramOverrides?: Record<string, unknown>; // keyed by Input-node name
  dependencyHash?: string;
  lastGeneratedHash?: string;

  currentAssetId?: string;
  thumbnailAssetId?: string;
  waveformAssetId?: string;
  status: ClipStatus;
  locked: boolean;
  muted?: boolean;
  hidden?: boolean;
  versions: ClipVersion[];

  // rendering transforms — consumed by preview compositor (§11.1) and export compiler (§11.2)
  opacity?: number;            // 0..1, default 1
  blendMode?: BlendMode;       // overlay tracks; default "normal"
  speedMultiplier?: number;    // default 1; affects timeline duration; source-time refs unchanged
  speedBaked?: boolean;        // true if generated asset already encodes speed; export skips speed step
  volumeDb?: number;           // audio clips; default 0
  fadeInMs?: number;
  fadeOutMs?: number;
}

type BlendMode = "normal" | "screen" | "multiply" | "add" | "overlay";

interface ClipVersion {
  id: string;
  createdAt: string;
  jobId: string;             // FK to existing Job model
  assetId: string;           // FK to existing Asset model
  workflowUpdatedAt: string; // snapshot of workflow.updated_at at generation time
  dependencyHash: string;
  paramOverridesSnapshot: Record<string, unknown>;
  costCredits?: number;
  durationMs?: number;
  status: "success" | "failed" | "cancelled";
  favorite?: boolean;
}

interface TimelineMarker {
  id: string;
  timeMs: number;
  label: string;
  color?: string;
  note?: string;
}
```

## 8. Curated clip templates (Slice 2)

Three ordinary `Workflow` rows (`run_mode = "workflow"`) are seeded with the tag `"timeline-template"` so they surface in the Add-Generated-Clip menu by default. Authors publish their own clip templates by adding the `"timeline-template"` tag to any workflow they own. Untagged standalone workflows that produce media output are still selectable via the menu's "All workflows" expander.

| Seeded workflow | Graph (Input nodes → processing → output) |
| --- | --- |
| **Text-to-Image** | `StringInputNode("prompt") → TextToImageNode → ImageOutputNode`<br>plus optional `StringInputNode("negative_prompt")`, `IntegerInputNode("steps")`, `FloatInputNode("cfg")`, `IntegerInputNode("seed")`, `LanguageModelInputNode("model")` |
| **Image-to-Video** | `StringInputNode("prompt") + ImageInputNode("source_image") + IntegerInputNode("duration_ms") → ImageToVideoNode → VideoOutputNode` |
| **Text-to-Speech** | `StringInputNode("text") + SelectInputNode("voice") → TextToSpeechNode → AudioOutputNode` |

When a user picks a template, the timeline clones it into a new `run_mode = "clip"` workflow owned by the clip. No template registry; the menu is just a tag-filtered query against the workflow table.

## 9. Performance targets

- Smooth interaction (60 fps where possible) with ≥100 clips.
- Select clip: <100 ms UI response.
- Open project: timeline visible <2 s; thumbnails hydrate progressively.
- Generation job creation: <500 ms.
- Inspector property edit: immediate local response; hash recompute <16 ms for typical clip.

## 10. Acceptance criteria

The combined Slice 1 + 2 ships when:

1. User can create a sequence and the editor opens at `/timeline/:id` with default tracks.
2. User can drag assets from `AssetExplorer` to create imported clips.
3. User can move, trim, split, duplicate, delete clips with snapping and undo/redo.
4. User can add Text-to-Image, Image-to-Video, and Text-to-Speech generated clips from a clip-template menu.
5. Selecting a generated clip opens the node-stack inspector; selecting a node shows its exposed params.
6. Editing a property marks the clip stale; downstream nodes are marked stale; preview keeps the previous version.
7. User can generate the selected clip, observe progress, and see the new output in preview and timeline thumbnail.
8. The previous version is preserved in `versions[]` and restorable.
9. "Open in Node Editor" navigates to `/editor/:workflowId`. On return, the clip is automatically marked stale if `workflow.updated_at` advanced; the inspector reflects any added/removed `Input*` nodes.
10. Failed generations show error UI and a Retry action; errors are attached to the failing node.
11. No raw MUI imports anywhere in `web/src/components/timeline/`.
12. `npm run check` passes (typecheck + lint + tests) for `packages/timeline/`, `packages/models/` migrations, and `web/`.

## 11. Rendering

The timeline has two rendering pipelines. They share nothing.

### 11.1 Preview rendering (in-browser, real-time)

Goal: play the timeline at the playhead with all visible tracks composited and all unmuted audio mixed, at 24–30 fps for typical projects (≤6 video tracks, ≤8 audio tracks). Not frame-accurate, not for delivery.

**Approach**: DOM-based compositing, not canvas. Each video track owns a pool of `<video>` elements; each image clip is an `<img>`; each audio clip is an `<audio>` (or a `WebAudio` `AudioBufferSourceNode` for sample-accurate mixing). `TimelinePlaybackStore` advances `currentTimeMs` on `requestAnimationFrame`. For each track/clip whose time range covers the current time, the corresponding media element is mounted with its `currentTime` set to `(now − clip.startMs + clip.inPointMs) / 1000` and its `playbackRate` set; out-of-range elements unmount. Overlay tracks stack via z-index with `mix-blend-mode` from clip metadata.

**Audio mixing**: a single shared `AudioContext`. Each audio clip routes through a per-clip `GainNode` (volume, fades) → per-track `GainNode` (track volume, mute/solo) → master. Solo on any audio track mutes all non-solo audio tracks. WaveSurfer is **not** used for playback — only for waveform visualization in clip bodies (its render path is decoupled from playback).

**Components**:
- `web/src/components/timeline/preview/PreviewCompositor.tsx` — owns the element pool and z-index stack; reads `TimelineStore` (clips at time t) via a memoized selector + `shallow`.
- `web/src/components/timeline/preview/AudioGraph.ts` — pure TS module; constructs and updates the WebAudio graph from clip lists.
- `web/src/components/timeline/preview/PlaybackClock.ts` — RAF-driven clock; emits `currentTimeMs` to `TimelinePlaybackStore`. Drift-corrected against `AudioContext.currentTime` so audio stays the master clock.

**Reuse**:
- Existing `OutputRenderer` is used only for "single clip preview" (e.g. preview of an unplaced asset), not the playhead compositor.
- Existing `AudioPlayer` (WaveSurfer) is the visualization source for clip-body waveforms; its peaks are extracted once per asset and cached on the clip.

**Limits accepted**:
- Generated overlays declared as compositing-only (e.g. fog, light leaks) play directly via DOM blending.
- Color grade / LUT effects are previewed approximately via CSS `filter` if the node type maps to a CSS-expressible transform; otherwise they are baked into the generated asset and displayed as-is. No WebGL pipeline in Slice 1+2.
- Speed > 4× or < 0.25× falls back to "scrub still frame" instead of resampled playback.
- Video element pool target size: 8 hot, 4 cold (preloaded for upcoming clips). Beyond that, brief gaps are allowed at clip boundaries.
- Frame-stepping uses `currentTime` snapping; not frame-accurate for variable-FPS sources.

**Stale and missing clips during preview**:
- `stale` clips play their last successful asset with a "stale" overlay.
- `failed` / `missing` / `draft` clips render the placeholder body; audio is silent for that range.
- `generating` clips show progress overlay; if a previous asset exists, it plays, otherwise placeholder.

### 11.2 Export rendering (server-side, deterministic)

Goal: produce a final video file (MP4 H.264 in Slice 3) that matches what preview shows, frame-accurate.

**Strategy**: the timeline does not ship its own ffmpeg code. NodeTool already exposes a complete ffmpeg-backed node set in `packages/base-nodes/src/nodes/video.ts` and `audio.ts` (`ConcatVideoNode`, `TrimVideoNode`, `ResizeVideoNode`, `OverlayVideoNode`, `RotateVideoNode`, `SetSpeedVideoNode`, `ColorBalanceVideoNode`, `FrameToVideoNode`, `ConcatAudioNode`, `OverlayAudioNode`, `AudioMixerNode`, `FadeInAudioNode`, `FadeOutAudioNode`, `NormalizeAudioNode`, `CreateSilenceNode`, `TrimAudioNode`, etc.). Export compiles the timeline into a graph of these nodes and runs it through the existing `WorkflowRunner`. Reuses cost tracking, status streaming, error handling, OTel spans, and provider routing for free.

**Compiler**: `packages/timeline/src/compileExport.ts` — pure function `compile(sequence: TimelineSequence, opts: ExportOptions): Graph`. Produces a graph with this shape:

```
                  per-track-V                              per-track-V
clips on V1 ──► Trim ──► Resize ──► [pad to track length with CreateSilence/black] ──► Concat ┐
clips on V2 ──► Trim ──► Resize ──► ...                                                  Concat ──► Overlay (V1 base, V2..Vn opacity/blend) ┐
clips on Vn ──► ...                                                                       ─┘                                                Resize ──► (mux)
                                                                                                                                              ┘
clips on A1 ──► Trim ──► Fade ──► Concat ┐                                                                                                   ┘
clips on A2 ──► Trim ──► Fade ──► Concat ┼──► AudioMixer ──► Normalize ────────────────────────────────────────────────────────────────────► (mux)
clips on A3 ──► Trim ──► Fade ──► Concat ┘
```

Final mux step: a new `MuxVideoAudioNode` in `packages/base-nodes` (single ffmpeg `-c copy` for video + audio streams; ~40 lines) — the only new ffmpeg code. If a target codec/container differs from the source, the existing transcode-on-Concat path is sufficient.

**Inputs**: `currentAssetId` for each clip's selected version. Locked clips use their locked version; unlocked stale clips force a preflight check (§5.5 / §10 acceptance #11 — extended to "Stale clips listed before export with Generate Stale / Export Anyway / Cancel").

**Outputs**: a `Job` (existing `packages/models` `Job`) producing a `VideoRef` asset. The export job appears in the existing job list; cancel/retry/log access works without timeline-specific code.

**Determinism and caching**:
- Each compiled subgraph is content-hashed by clip's `dependencyHash` + transform params; if an export was previously run with the same hashes, the existing `ResultsStore`/`Asset` cache returns the prior intermediate (per-track concatenated video/audio).
- Re-export after editing only one clip rebuilds that clip's track lane and the final mux; the other track lanes hit cache.

**Out of scope for Slice 1+2**: the export *graph compiler*, the preflight dialog, and `MuxVideoAudioNode` are Slice 3. Slice 1+2 ship preview only. The compiler is specified here so Slice 1+2 designs the data model with export in mind (e.g. clip transforms must be representable as ffmpeg-expressible parameters; opacity/blend modes must round-trip; speed changes carry a flag for whether the generated asset is already speed-baked).

**Constraints flowing back into Slice 1+2 data model**:
- `TimelineClip` must carry `transformMs` fields (`opacity`, `blendMode`, `speedMultiplier`, `volumeDb`) even though export consumes them in Slice 3. Adding them later would force a migration of every saved sequence.
- `TimelineTrack.type === "overlay"` clips must declare `blendMode: "normal" | "screen" | "multiply" | "add" | "overlay"` — a fixed enum that maps to both CSS `mix-blend-mode` (preview) and ffmpeg `blend=` (export).
- `TimelineClip.speedMultiplier` is multiplicative on `durationMs` and `inPointMs`/`outPointMs` reference source-time, not timeline-time. The compiler and the preview use the same convention.

These fields are added to §7 above.

## 12. Risks and mitigations

- **Scope creep from PRD.** Mitigation: this PRD freezes Slice 1 + 2; further phases need their own PRDs.
- **WebSocket message volume during generation.** Mitigation: subscribe per clip's active job id; drop all other traffic at the timeline-store boundary.
- **JSON document growing unbounded.** Mitigation: cap `versions[]` to last 10 successful per clip in Slice 2; offload older versions in a future phase.
- **Graph-structure drift on Open in Node Editor round-trip.** Mitigation: on return, diff node ids; if `selectedOutputNodeId` is gone, force user confirmation dialog before any subsequent generation.
- **Reuse boundary slipping.** Mitigation: PR review checklist enforces "no raw MUI", "no parallel waveform/preview/inspector code", "stores via selectors with `shallow`".

## 13. Implementation phases inside this PRD

1. **P1.A** — `packages/timeline/` types, dependency hashing, timeline math, tests. No UI.
2. **P1.B** — `timeline_sequence` schema, repo, REST endpoints, autosave. Seed three tagged `"timeline-template"` workflows in a migration.
3. **P1.C** — `TimelineEditor` shell, tracks, ruler, playhead, preview compositor (DOM + WebAudio), imported-clip CRUD with `TimelineStore` + zundo.
4. **P1.D** — Imported-clip inspector wired to existing `Inspector` patterns.
5. **P2.A** — Clip-workflow binding: clone-on-create from any standalone workflow into `run_mode = "clip"`; lifecycle (delete cascading, promote-to-template via tag + `run_mode` flip); workflow-list filter for `run_mode`.
6. **P2.B** — Inspector node-stack reads the bound workflow's `Input*` nodes and renders existing `PropertyField`s into `paramOverrides`. Dirty/stale via dependency hash incl. `workflow.updated_at`.
7. **P2.C** — Generate / regenerate via `WorkflowRunner.run(workflow, paramOverrides)`; status propagation through existing `StatusStore`/`ResultsStore`/`ErrorStore` keyed by jobId.
8. **P2.D** — Versions (jobId+assetId per version), restore, Duplicate-as-Variation (clone clip workflow), Duplicate-Linked, Lock; "Open in Node Editor" round-trip and stale-on-return behavior.

Each phase ends with passing `npm run check` and a self-contained PR.
