# Timeline Editor Performance Audit

_Audited 2026-07-02 at commit `6c3004e`. Scope: `web/src/components/timeline/`,
`web/src/stores/timeline/`, `web/src/hooks/timeline/`, and the render/GPU layers
they drive (~28k lines). Line numbers refer to that commit._

## Verdict

The core architecture is right, and the most expensive problem a timeline
editor can have — React re-rendering at 60 fps during playback — is already
solved. `TimelinePlaybackStore` pushes time through a transient non-React
channel (`setTimeMs`/`subscribeTime`, `TimelinePlaybackStore.ts:55-118`), the
playhead/timecode/karaoke highlight all consume it imperatively, and the
compositor gates React updates behind a scene signature. Steady playback causes
zero React renders.

The real costs are elsewhere, in three clusters:

1. **Gestures write to the reactive document store on every pointermove.**
   Clip drag/trim, the transform gizmo, ~40 inspector/FX sliders, EQ and
   compressor curves, scrubbing, and zoom all publish store updates at
   pointer-event rate (60–240 Hz). Identity-preserving reducers keep most
   *re-renders* in check, but every publish still runs every subscriber's
   selector, and several wide subscriptions re-render the whole editor shell
   per tick. Sliders and the gizmo also push one **undo entry per tick**,
   so a two-second drag wipes the entire 100-entry undo history.
2. **Per-frame playback work that scales with project size.** The rAF tick
   re-derives the full scene model (sort + Map build + per-word caption
   resolution) every frame just to detect "nothing changed", and the GPU
   effects chain re-processes static layers 60×/s while any video plays.
3. **Unbounded scaling.** No virtualization (every clip on every track is
   always mounted, with thumbnail/waveform fetches), play-gesture audio
   decoding of the entire timeline, and several unbounded or full-frame-sized
   caches.

Fixes are listed per finding; a priority table is at the end. The single
highest-leverage theme: the repo already contains the right tools —
`useTimelineHistoryBatch`, the transient time channel, stable
`generatingClipIds` membership arrays — several hot paths just don't use them.

---

## Tier 1 — interactive gestures (highest user-visible impact)

### 1.1 Inspector/FX sliders and curves: per-tick store writes, no history batching

`NodeSlider` is a MUI Slider whose `onChange` fires per pointermove. Every
call site pipes it straight into the zundo-wrapped `TimelineStore`:

- `Inspector/InspectorPrimitives.tsx:641-643` (`InspectorSliderRow` — used by
  all ~30 `ClipAdjustments` rows: opacity 167-169, color 441-444, blur 533,
  anchor 338/348, radius 357-359)
- `Tracks/TrackEffectsPanel.tsx:250` (`ParamRow` → `updateTrackEffect`,
  `TimelineStore.ts:896-907`)
- `Tracks/TrackEffectsPanel.tsx:520-540` and `985-1020` (EQ / compressor SVG
  curve drags patch per pointermove; wheel handlers at 560-575, 1039-1054
  patch per wheel tick)
- `TimelineStore.ts:1498-1507` (`setClipPrompt` via
  `DirectGenClipPanel.tsx:146-151` — one undo entry **per keystroke**)
- Arrow-key nudge (`TracksRegion.tsx:504-518`) — one entry per key repeat

Each tick: full `tracks.map`/`clips.map` allocation, zundo `partializedEqual`
scan over all clips/tracks (`TimelineStore.ts:489-497`), one undo entry
(limit is 100 — a single knob drag evicts all prior history), and a publish to
every doc-store subscriber (compositor, tracks region, transcript panel,
autosave, `attachUiPruning`).

Clip drag/trim and track resize already solve this with
`useTimelineHistoryBatch` (`Clip.tsx:496`, `TrackHeader.tsx:323`); nothing in
the inspector or FX panel uses it.

**Fix:** in the two shared choke points (`InspectorSliderRow`, `ParamRow`),
render the drag from local state and commit on `onChangeCommitted`, or keep
live writes for preview but wrap the gesture in
`useTimelineHistoryBatch.begin()/mark()/end()` and rAF-throttle the writes.
Same treatment for the EQ/compressor pointerdown/up handlers. Pause the
temporal store during focused prompt typing; treat held key-repeat as one
gesture.

### 1.2 Transform gizmo: per-pointermove `patchClip`, no batching, forced layout

`PreviewCompositor.tsx:928`:

```tsx
onChange={(id, next) => patchClip(id, { transform: next })}
```

Every gizmo move (60–240 Hz) allocates a new `clips` array
(`TimelineStore.ts:1278-1282`), pushes an undo entry, and re-renders every
`clips` subscriber — compositor scene memo, video-pool layout effect, tracks
region, inspector. The pointer handler also calls `getBoundingClientRect()`
per move (`TransformGizmoOverlay.tsx:330-333`).

**Fix:** wire `useTimelineHistoryBatch` into the gizmo gesture, or drive the
live transform from a ref straight into the compositor and commit one
`patchClip` on pointerup. Cache the SVG rect at pointerdown (a ResizeObserver
already invalidates on resize).

### 1.3 Editor-root subscriptions re-render the whole shell per drag tick

Three subscriptions sit at `TimelineEditorBody` — the root above TopBar,
preview, inspector, tracks, and transcript:

- **`useTimelineExport`** (`useTimelineExport.ts:57-66`, hosted at
  `TimelineEditor.tsx:352-359`) reactively selects `tracks` + `clips` that are
  only read inside the click-time `exportVideo` callback. `clips` gets a new
  identity per drag/trim/gizmo/slider tick → whole-shell re-render per tick.
  During export, `onProgress: setProgress` (line 119) re-renders the shell per
  encoded frame. **Fix:** read `store.getState()` inside `exportVideo`;
  throttle progress to ~4 Hz or move it to a leaf component.
- **`useTimelineGenerationSubscriptions`** (`useGenerateClip.ts:318-354`,
  hosted at `TimelineEditor.tsx:335`) selects the whole `clipJobs` record.
  `updateJobProgress` (`TimelineGenerationStore.ts:347-365`) replaces the map
  per WebSocket progress message, so the shell re-renders and the
  subscription-reconcile effect re-runs per message for the entire life of
  every generation. The store maintains progress-stable `generatingClipIds`
  membership arrays for exactly this purpose (`TimelineGenerationStore.ts:51-63`)
  — this hook bypasses them. **Fix:** key the effect on `generatingClipIds`
  (or a `useShallow` projection of id/status/workflow) and read job details
  via `getState()` inside the effect.
- **`msPerPx`** (`TimelineEditor.tsx:338`) — every zoom tick re-renders the
  shell; only `BottomStatusBar` needs it. The tracks-height resize drag
  (`TimelineEditor.tsx:397-405`) sets React state per mousemove with the same
  fanout. **Fix:** push the zoom wiring into a wrapper around
  `BottomStatusBar`; apply resize height via ref during the drag, commit on
  mouseup. Also stabilize `TopBar` props — `onOpenSettings={() => ...}` and
  `activitySlot={<ActivityIndicator />}` (`TimelineEditor.tsx:495-498`) defeat
  its memo every render.

### 1.4 O(N²) selector churn during drags

Every doc-store publish runs every subscriber's selector. During a drag that
is per-pointermove:

- Every mounted `Clip` selects `s.clips.find((c) => c.id === clipId)`
  (`Clip.tsx:396-398`) — N clips × O(N) = O(N²) per tick. Same pattern in
  `TimelineInspector.tsx:110`, `GeneratedClipPanel.tsx:88`,
  `ClipVersionHistory.tsx:199`, `ClipActions.tsx:41`, `useGenerateClip.ts:375`.
  At 300–500 clips this is tens of millions of comparisons/second mid-drag.
- Every `TrackLane` re-filters all clips per lane (`TrackLane.tsx:113-122`);
  the custom equality then discards the arrays.
- `attachUiPruning` (`TimelineInstance.tsx:80-116`) builds
  `new Set(state.clips.map(...))` per tick whenever a selection exists — and
  dragging a selected clip is the common case.
- `TracksRegion.contentEndMs` rescans all clips per tick
  (`TracksRegion.tsx:204-223`; the cache key is `clips` identity).

**Fix:** maintain a `Map<string, TimelineClip>` keyed on `clips` array
identity (module-level `WeakMap<TimelineClip[], Map>` used inside selectors,
or a `clipsById` field rebuilt in the same `set`). Turns every id lookup O(1).
Defer `attachUiPruning` to a microtask/idle callback — pruning only matters
after removals.

### 1.5 Transcript projections rebuilt per drag tick, ×3 consumers

`clips` identity changes per drag tick; three consumers rebuild the full
transcript projection from it, each O(words · log):

- `ScriptLane.tsx:126-136` — `buildTranscriptDoc(clips)` per tick, then
  reconciles a `<span>` per word
- `TranscriptPanel.tsx:41-42` — same rebuild plus a filler-count reduce
- `TranscriptEditor.tsx` `SyncPlugin` (206, 233-240) — `transcriptSignature`
  (80-87) runs `buildTranscriptDoc` **and** builds one giant joined string
  over every word, per `clips` change, just to detect external edits

With the script feature on, a drag pays this 3–5× per pointermove.
Dragging a B-roll clip with no captions pays it too.

**Fix:** share one projection via a module-level
`WeakMap<TimelineClip[], TranscriptDoc>`, and gate on transcript-relevant
change — select the caption-bearing clip subset with an equality that compares
member identities, or bump a `transcriptRev` counter from caption-touching
mutations and key the SyncPlugin check on it.

### 1.6 Scrub fanout

Ruler scrub and playhead drag write reactive `currentTimeMs` per pointermove
(`TimeRuler.tsx:457-465`, `Playhead.tsx:200-214`). Repainting the preview per
event is intended; the incidental subscribers are not:

- `TimeRuler.tsx:266` subscribes to `currentTimeMs` solely for
  `aria-valuenow` (482) — re-renders the ruler per tick. Set it imperatively
  via `subscribeTime`, as `Playhead` already does.
- `ScriptLane` re-renders every phrase chip and word span per tick
  (`ScriptLane.tsx:130, 186-199`). Subscribe transiently and toggle classes.
- While playing, each scrub tick bumps `seekNonce`, whose effect runs
  `graph.stopAll()` + a full async `handlePlay()` — asset resolution, audio
  re-scheduling, clock restart — per pixel (`PreviewArea.tsx:337-345`).
  Debounce the restart (~100 ms trailing).
- The paused one-shot composite runs twice per scrub tick — eagerly with a
  stale frame and again on `seeked` (`PreviewCompositor.tsx:811-828`). Skip
  the eager pass when all video layers are seeking.

### 1.7 Zoom: per-wheel-event store publish, full re-layout, listener churn

`TracksRegion.tsx:375-419`: every wheel/pinch event calls `setZoom` — one
store publish per event (trackpads deliver 60–120+ Hz), re-rendering every
clip (new `leftPx`/`widthPx`), lane, ruler, and scrollbar; the scroll
correction (`444-465`) then triggers a second full region render via
`setScrollLeftPx`. The effect re-attaches the wheel listener on every
`msPerPx` change (dep at 419), so events landing before the next render
compute from a stale scale (zoom skips). `getBoundingClientRect()` runs per
event (389).

**Fix:** rAF-coalesce `setZoom` with the latest wheel state in a ref; read
`msPerPx` from a ref inside a stable listener; cache the container rect.
For pinch smoothness, apply a temporary `transform: scaleX()` during the
gesture and commit one re-layout at the end.

---

## Tier 2 — per-frame playback costs

### 2.1 Scene model fully recomputed every rAF tick

The playback loop (`PreviewCompositor.tsx:855-887`) calls
`sceneSignature(liveMs)` per frame, which runs `computeActiveLayers`
(`sceneModel.ts:226-312`): `[...tracks].sort`, a `Map` rebuild over all clips,
per-track `filter().sort()`, a `ResolvedCaption` object per word of every
captioned active clip, plus signature string concatenation — usually to
conclude nothing changed. On a 6-track/200-clip timeline that is thousands of
allocations per second of GC churn inside the playback loop. The scene is also
computed twice per actual bump (signature + the `useMemo` at 434-509).

**Fix:** compute a `nextChangeMs` horizon with each scene (min of active clip
ends, upcoming starts, caption word boundaries) and skip signature work while
`liveMs < nextChangeMs` — steady-state playback becomes one float compare per
frame. Or cache `sortedTracks`/`clipsByTrackId` in a `WeakMap` keyed on the
arrays.

### 2.2 GPU effects re-process static layers every frame

`gpu/compositor.ts:230-244` runs the full compute chain (chroma key → grade →
2× blur → sharpen → vignette) unconditionally per `render()`. The rAF loop
marks frames dirty whenever any video plays, so a static image with a heavy
blur under a playing video is re-blurred 60×/s.

**Fix:** cache the processed output per layer keyed on (source upload key,
effects array identities — they are reference-stable until edited); return
the cached texture on match. Videos self-invalidate via `currentTime`.

### 2.3 WebGPU micro-churn per frame

- `setLayers` re-sorts a copied array and rebuilds a prune `Set` every tick
  while video plays (`gpu/compositor.ts:129-143`) — skip when layer ids and
  order are unchanged.
- `renderBlendPass` creates a fresh `GPUBindGroup` + three `createView()`
  calls per layer per frame (`packages/gpu/src/compositor/compositor.ts:340-353`,
  plus `blit` 367-370). Views are immutable per texture; cache them and key
  bind groups on (source texture, ping-pong read texture).

### 2.4 Playhead writes `style.left` and churns attributes per frame

`Playhead.tsx:152-166`: `left` invalidates layout each frame where
`transform: translateX()` would stay on the compositor; `aria-valuenow` and
the pill `textContent` mutate 60×/s. Throttle both to ~10 Hz; switch to
transform.

### 2.5 Karaoke plugins re-query the word DOM per time tick

`TranscriptEditor.tsx` — `ActiveWordPlugin` (330-355) and `ScriptCaretPlugin`
(382-430) each run `querySelectorAll(".transcript-word")` + dataset string
parsing + a linear scan per transient time tick (×2, 60 Hz), and the caret
plugin interleaves style writes with `offsetLeft/offsetWidth` reads — forced
reflow per frame. Both re-run their full setup on every `clips` identity
change (deps at 354/430).

**Fix:** build one shared sorted `{el, startMs, endMs, offsets}` cache per
reseed (offsets refreshed on resize), binary-search the active word per tick,
and reuse the cache in `SelectionHighlightPlugin` (445-455) and arrow-key
stepping (621-637).

---

## Tier 3 — scaling limits (large projects)

### 3.1 No virtualization

`TrackLane.tsx:476-478` mounts every clip on every track regardless of the
visible window. Each clip carries ~8–12 DOM nodes, three asset-URL effects
(`Clip.tsx:963-1015`), a 24-frame thumbnail request per video URL
(`useClipThumbnails.ts:12`), and a fetch+decode for audio waveforms — for
clips hours off-screen. Every per-tick cost in Tier 1 scales with this total.

**Fix:** window horizontally from `scrollLeftPx`/`msPerPx` (both already in
the UI store — the visibility predicate is trivial from `startMs`/`durationMs`)
with one viewport of overscan; window tracks vertically; gate thumbnail/peaks
requests on visibility.

### 3.2 Play gesture decodes every future audio clip before the clock starts

`PreviewArea.tsx:261-304` filters all remaining audio clips and
`scheduleClips` `Promise.all`s a fetch + `decodeAudioData` for each
(`AudioGraph.ts:406-414`) before `clock.start`. Play latency grows with
timeline length; peak memory is the whole timeline's decoded PCM; and with
more than `BUFFER_CACHE_MAX = 16` distinct assets (`AudioGraph.ts:43`) the LRU
evicts and re-decodes on every play/seek gesture. Seek-while-playing repeats
everything.

**Fix:** schedule only clips starting within a lookahead window (~30 s,
matching `PRELOAD_LOOKAHEAD_MS`), top up as the playhead advances, and start
the clock once the currently audible clips are ready.

### 3.3 Caption raster cache: full-frame bitmaps, up to ~530 MB

`captionRender.ts:19, 138-166`: each caption state rasterizes at full sequence
resolution (a lower-third strip inside a 1920×1080 bitmap);
`MAX_CACHE_ENTRIES = 64` × 8 MB ≈ 530 MB worst case (4K: ~2 GB). A new
`OffscreenCanvas` is allocated per miss, and on the GPU side each new bitmap
destroys and re-creates a full-frame texture per word change
(`gpu/compositor.ts:155-160`) instead of re-uploading into the same-sized one.

**Fix:** rasterize at the caption bounding box and position via the layer
transform; reuse one `OffscreenCanvas`; re-upload into the existing texture
when dimensions match; cap the cache by bytes.

### 3.4 Unbounded caches and export memory

- `clipThumbnails.ts:31, 197-215`: module-level Map of 24 base64 JPEGs per
  video URL, never evicted; failed entries permanently poisoned. Use blob
  URLs + LRU; allow retry.
- `OffscreenVideoPool.ts:29, 92-113`: export accumulates one `<video>` per
  video clip, never released until dispose — 50-clip exports risk hitting
  browser media-element and hardware-decoder caps. Release entries behind the
  export playhead.
- `TimelineRenderer.ts:179-182, 303`: `BufferTarget` holds the whole MP4 in
  memory. Fine today; a streaming target bounds it.
- `ResultsStore.ts:704-722` (`setProgress`): growing string concat + whole
  record spread per WebSocket chunk message. Accumulate chunks in an array;
  coalesce progress writes to ~10 Hz.

### 3.5 Export frame loop: serialized seeks, main-thread

`TimelineRenderer.ts:248-266` awaits `videoPool.seek()` sequentially per
layer; overlapping videos pay seek round-trips back-to-back. Issue seeks with
`Promise.all`. Longer term, move the loop to a Worker with `OffscreenCanvas`.

---

## Tier 4 — smaller wins

- **Filmstrip cells hash multi-KB data URLs through emotion per render**
  (`Clip.tsx:337-345, 1090`): `css({ backgroundImage: url(<base64>) })` per
  cell per render — emotion hashing is O(string length) and every distinct
  URL inserts a permanent CSSOM rule. Runs per pointermove during trims.
  Use `style={{ backgroundImage }}` exactly as the image path at 1060 does.
- **`TracksRegion` subscribes to `scrollLeftPx` and `selectedClipIds`**
  (`TracksRegion.tsx:227, 231`): whole-region re-render per pan frame and per
  rubber-band selection change; selection is only used in event handlers —
  read `getState()` there; let the memoized `TimelineScrollbar` subscribe to
  scroll itself.
- **Every `Clip` subscribes to the entire `ErrorStore.errors` record**
  (`Clip.tsx:457-475`): any error anywhere re-renders every clip and re-scans
  all error keys per clip. Narrow to a per-run derived lookup.
- **Inspector sections stay mounted when folded**
  (`CollapsibleSection.tsx:118-120`, MUI `Collapse` without `unmountOnExit`):
  ~30 control rows render per inspector re-render regardless of fold state.
  Add `unmountOnExit`/lazy children.
- **`ClipAdjustments` passes fresh lambdas to every memoized row**
  (`ClipAdjustments.tsx:167-169, 441-444` and the IIFE blocks at 252, 396,
  501, 572): dragging one slider re-renders all rows. Give rows
  `(clipId, field)` props or `useCallback` per field.
- **`DirectGenClipPanel` subscribes to the whole `clips` array**
  (`DirectGenClipPanel.tsx:78, 104-117`) to build a dropdown list; recomputed
  per doc change even outside image-to-image mode. Select `{id,name}` pairs
  with `useShallow`, gated on mode.
- **`ClipListPopover` subscribes to `clips` while closed**
  (`ActivityIndicator.tsx:83, 205-239`): during generation, every clip patch
  re-renders two closed popovers. Render only when open.
- **Right-edge drags churn `totalWidthPx`** (`TracksRegion.tsx:204-223,
  320-323, 735`): dragging the last clip re-layouts the scroll area per move.
  Quantize the width (e.g. 256-px steps) or freeze during gestures.
- **`contentEndMs`/boundary work in `PreviewArea`** (`PreviewArea.tsx:201-207,
  374-385`): re-render + O(n log n) boundary sort per drag tick; `clips` is
  otherwise only used in click handlers. Select primitives; read
  `getState()` in handlers.
- **Cold-pool video preload never fires mid-clip** (`PreviewCompositor.tsx:
  553-683`): the effect's time dep advances only on scene bumps, so the next
  clip isn't preloaded until its boundary; `upcomingVideoClips` picks clips in
  array order, not soonest-first; and activation reloads the element from
  scratch, discarding the warm decoder. Re-evaluate on a coarse timer, sort by
  `startMs`, and swap the cold element into the hot slot.
- **Autosave can flush mid-gesture** (`useTimelineAutosave.ts:211-216`):
  holding a drag still for >750 ms fires a wasted full-document PATCH (which
  serializes every caption word). Gate the flush on "no history batch open".
  Related: `useTimelineSave.ts:33-38` omits `transcript` from the manual-save
  PATCH while autosave includes it — a correctness risk if the server replaces
  the whole document.
- **Rubber-band and gizmo read `getBoundingClientRect` per pointermove**
  (`TrackLane.tsx:394`, `TransformGizmoOverlay.tsx:330-333`): cache at
  pointerdown.
- **`TimelineListPanel`**: inline `onCancelRename` defeats item memo
  (`:572`); sort comparator allocates two `Date` objects per comparison
  (`:374-376`). `useCallback` + precompute `getTime()`.
- **`instanceStoreHook.ts:18-20` footgun**: the wrapper silently drops a
  second (equality) argument — `useTimelineStore(sel, shallow)` compiles and
  ignores `shallow`. Forward it.
- **`el.src = ""` teardown** (`PreviewCompositor.tsx:307-308`) resolves to the
  document URL and can fire a spurious request; use
  `removeAttribute("src"); load()` as `OffscreenVideoPool.dispose` does.
- **`AudioContext` instantiated on first play even with zero audio clips**
  (`PreviewArea.tsx:257-258`). Gate on `activeAudioClips.length > 0`.

---

## What is already done well (do not "fix")

- Transient playhead channel + `PlaybackClock`: zero React work per frame;
  `Playhead`, control-bar timecode, and karaoke highlighting are imperative.
- Store split (document / UI / playback, per-instance via `TimelineInstance`)
  with a memoized provider bundle — disjoint subscriber sets, no context churn.
- Identity-preserving reducers everywhere (`patchClip`/`patchById`/`moveClip`
  return same state on no-ops; untouched clips keep identity) — memoized
  siblings don't re-render during another clip's drag.
- Undo: zundo `partialize` stores references (structural sharing, no deep
  clones); `useTimelineHistoryBatch` collapses drag/trim/resize gestures.
- Autosave: transient `store.subscribe`, O(1) reference dirty-check, 750 ms
  debounce, single-flight — zero React renders.
- `Clip.tsx` gesture internals: snap candidates snapshotted per gesture,
  `elementsFromPoint` rAF-coalesced, waveform redraw rAF-coalesced with
  whole-pixel gating; `TimeRuler` draws a viewport-sized canvas from a
  latest-inputs ref.
- Compositor: scene-signature gating, dirty-flag composite skip for static
  scenes, stable clip→slot binding, LRU image cache, asset-URL cache with
  failed states, caption bitmap `WeakMap` signature memo.
- GPU: pipelines/samplers cached (no per-frame shader compilation anywhere),
  uniform-buffer ring, effects intermediate-texture pooling, seek-guard
  upload keying.
- AudioGraph: in-place param updates when the chain shape matches, ref-equality
  short-circuits, click-free ramps, in-flight decode dedupe.
- `TimelineGenerationStore` deliberately keeps `generatingClipIds` stable
  across progress ticks; `TrackEffectsPanel` mounts lazily; `AddClipMenu`
  mounts on demand with `enabled`-gated queries.
- No `JSON.parse(JSON.stringify)`, no polling loops, TanStack Query keys
  stable with `enabled` guards throughout.

---

## Priority order

| # | Fix | Files | Effort | Payoff |
|---|-----|-------|--------|--------|
| 1 | Commit-on-release / history-batch for `InspectorSliderRow` + `ParamRow` + EQ/compressor + gizmo | InspectorPrimitives, TrackEffectsPanel, TransformGizmoOverlay | S–M | Ends undo-history destruction; removes the densest store-write path |
| 2 | `useTimelineExport` → `getState()` reads; throttle export progress | useTimelineExport | S | Stops whole-shell re-render per drag tick and per encoded frame |
| 3 | `useTimelineGenerationSubscriptions` → key on `generatingClipIds` | useGenerateClip | S | Stops whole-shell re-render per progress message during generations |
| 4 | `clipsById` map (WeakMap-keyed) for all id selectors | TimelineStore + call sites | S | O(N²)→O(N) selector work per drag tick |
| 5 | Shared `WeakMap` transcript projection + transcript-relevant gating | ScriptLane, TranscriptPanel, TranscriptEditor | M | Removes O(words) rebuild ×3 per drag tick |
| 6 | Scene `nextChangeMs` horizon in the rAF tick | PreviewCompositor, sceneModel | M | Removes per-frame scene recompute + GC churn during playback |
| 7 | rAF-coalesced zoom with ref-read scale | TracksRegion | S | One React commit per displayed frame while zooming |
| 8 | Scrub hygiene: ruler aria via `subscribeTime`, debounced `seekNonce` audio restart, ScriptLane transient highlight | TimeRuler, PreviewArea, ScriptLane | S–M | Cheap scrubbing, no audio-graph rebuild per pixel |
| 9 | Windowed audio scheduling | PreviewArea, AudioGraph | M | Play latency stops scaling with timeline length |
| 10 | Effects output cache for static layers | gpu/compositor, effectsProcessor | M | Removes 60 fps GPU work on static effected layers |
| 11 | Caption strip-sized rasterization + texture reuse | captionRender, gpu/compositor | M | ~10–20× caption memory/upload reduction |
| 12 | Clip virtualization + visibility-gated media fetches | TrackLane, TracksRegion, clipThumbnails | L | Caps all per-tick costs at viewport size; biggest ceiling |
| 13 | Tier-4 batch (filmstrip inline style, selector narrowing, memo fixes, cache bounds) | various | S each | Broad small wins |

Items 1–4 are small, independent, and remove the worst interactive behavior;
they are the right first PR. Item 12 is the largest single ceiling-raiser for
big projects but should land after 4 so the windowing predicate can reuse the
id map.
