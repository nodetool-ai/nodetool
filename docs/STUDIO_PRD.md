# NodeTool Studio — Product Requirements (v1)

> Status: Draft · Branch `claude/nodetool-video-creation-scope-Q7LQf` · Owner: matti

## 1. Thesis

**Transcript-driven video editing, automated.** You write or generate a script;
the script *is* the timeline. Editing the words edits the video. Think Descript's
text-first editing model, but with AI clip generation wired in so beats can be
filled (voiceover, b-roll, captions) instead of only cut.

v1 proves the **editing model** — text ⇄ clips + word-level captions. The
**auto-assembly agent** (script/topic → fully populated sequence) is explicitly
v2; v1 builds the exact data model the agent will later emit, so v2 is "agent
emits beats," not "agent invents a format."

## 2. Where it lives

A **transcript panel docked inside the existing `TimelineEditor`**
(`web/src/components/timeline/`), alongside `Inspector` / `Tracks`. No new route,
no new surface, no new export path. It rides the `TimelineSequence` engine that
already ships in `main`:

- the sequence document (persisted, autosaved),
- AI clip generation (`text-to-audio`, `text-to-video`),
- clip version + staleness tracking (`dependencyHash`, `ClipVersion`),
- the WebGPU compositor (`sceneModel.computeActiveLayers`),
- browser WebCodecs MP4 export.

v1 adds **one data type, one store, one panel, and a caption layer** — inside a
component that already exists.

## 3. Concepts

- **Beat** (`transcriptLine`): one line of script. Has text, a start time, and
  the clip(s) bound to it. The beat is the unit the user edits.
- **Binding**: a beat owns clips by id. A beat's clips are existing kinds —
  `text-to-audio` (voiceover), `text-to-video` (b-roll), plus the new caption clip.
- **Captions**: word-level timing on the existing `subtitle` track, rendered
  identically in live preview and export.

## 4. v1 Scope

### 4.1 Transcript ⇄ clip binding (core IP)

- **Type** — add to `packages/protocol/src/api-schemas/timeline.ts`:
  ```ts
  transcriptLine {
    id: string;
    text: string;
    beatStartMs: number;
    clipIds: string[];          // clips bound to this beat
  }
  ```
  Persisted inside the existing `timelineDocument`, so autosave and MP4 export
  inherit it for free.

- **Store** — `web/src/stores/timeline/TimelineTranscriptStore.ts`, beside
  `TimelineStore` / `TimelineGenerationStore`. Holds line↔clipId bindings and the
  edit ops. Every op is expressed as existing `TimelineStore` mutations:
  - **Delete line** → remove bound clips, re-flow `startMs`.
  - **Reorder lines** → recompute `startMs` across bound clips.
  - **Reword line** → mark bound generated clips `stale` (existing
    `dependencyHash` machinery) → offer regenerate (existing
    `TimelineGenerationStore` path).

### 4.2 Word-level captions (visible payoff)

- **Content model** on the existing `subtitle` track: line →
  `{ word, startMs, endMs }[]`, sourced from the transcription nodes already in
  the repo.
- **Render** — wire a caption layer into
  `web/src/components/timeline/preview/sceneModel.ts`. `computeActiveLayers` is
  the single source of truth for "what's on screen at *t*," so live preview and
  the WebCodecs export render captions identically — no extra export work.
- **Style knobs**: font, size, position, active-word highlight.

### 4.3 Transcript panel UI

- `web/src/components/timeline/TranscriptPanel.tsx`, docked like `Inspector`.
- Click a line → selects its clips and moves the playhead.
- Edit text inline.
- Per-line **regenerate / reroll** (reuses `ClipVersion` history).
- UI uses `ui_primitives` only (no raw MUI) per repo policy.

## 5. Out of scope (v2+)

- **Auto-assembly agent** — script/topic → fully populated sequence. v1's binding
  model is its output target.
- **STT → transcript ingestion** — the long-video "clip machine."
- **Auto-reframe 16:9 → 9:16** — sequence `width/height` already support any
  ratio; only subject-tracking is new.

## 6. Milestone checklist

- [ ] `transcriptLine` type added to `timeline.ts` schema + persisted in document
- [ ] `TimelineTranscriptStore` with binding state + delete/reorder/reword ops
- [ ] Reword → stale → regenerate wired through `TimelineGenerationStore`
- [ ] Caption content model on `subtitle` track (word-level timing)
- [ ] Caption layer in `computeActiveLayers` (preview + export parity)
- [ ] Caption style knobs (font/size/position/highlight)
- [ ] `TranscriptPanel` docked in `TimelineEditor`, line→clip selection
- [ ] Inline text edit + per-line regenerate/reroll
- [ ] `npm run check` green (typecheck + lint + test)

## 7. Why this is low-risk

Every hard part is already in `main`. The product bet — transcript-driven
editing — gets validated before any agent or generation-quality risk is taken on.
The agent (the headline feature) lands in v2 on top of a proven, persisted data
model.
