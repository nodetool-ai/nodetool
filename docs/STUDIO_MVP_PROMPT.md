# Studio MVP — Build Prompt

> A self-contained prompt for an engineer or coding agent to build the first
> end-to-end slice of NodeTool Studio. Scope is deliberately thin: prove the
> thesis (script → voiced, captioned short-form video, edited as a document),
> nothing more. See `docs/STUDIO_PRD.md` for the full vision.

---

## Prompt

Build the **first MVP of NodeTool Studio**: a transcript-driven editor for
short-form video, docked inside the existing `TimelineEditor`
(`web/src/components/timeline/`). The MVP must prove one thing end-to-end —
**you write a script, Studio turns each line into a voiced + captioned beat on the
timeline, and editing the script edits the video** — then export an MP4.

Do **not** build the assembly agent, research, b-roll generation, brand kits,
auto-reframe, localization, or platform publishing yet. Those are out of scope for
this MVP.

### The one user story

> I open Studio, paste or type a short script (a handful of lines). Each line
> becomes a beat with generated voiceover and word-level captions, laid out on the
> timeline in order. I press play and see/hear it. I delete a line and its clips
> disappear and the timeline re-flows. I reword a line and its voiceover
> regenerates. I export an MP4 that matches the preview.

### Scope (build exactly this)

1. **Transcript data model.** Add a `transcriptLine` type to
   `packages/protocol/src/api-schemas/timeline.ts`:
   `{ id, text, beatStartMs, clipIds[] }`, persisted inside the existing
   `timelineDocument` so autosave and export inherit it for free.

2. **Transcript store.** `web/src/stores/timeline/TimelineTranscriptStore.ts`,
   beside `TimelineStore` / `TimelineGenerationStore`. Holds line↔clipId bindings
   and these ops, each expressed as existing `TimelineStore` mutations:
   - add line, edit line text, delete line, reorder lines;
   - **delete line** → remove bound clips, re-flow `startMs`;
   - **reorder** → recompute `startMs` across bound clips;
   - **reword** → mark bound generated clips stale (existing `dependencyHash`
     machinery) and trigger regenerate via the existing `TimelineGenerationStore`
     path.

3. **Beat generation.** For each line, generate:
   - one **voiceover** clip via the existing `text-to-audio` clip generation;
   - one **caption** layer with word-level timing
     (`{ word, startMs, endMs }[]`) sourced from the existing transcription
     nodes. A single fixed caption style is fine for the MVP.
   The voiceover's duration determines the beat length; captions and `startMs`
   follow from it.

4. **Caption rendering.** Wire a caption layer into
   `web/src/components/timeline/preview/sceneModel.ts` `computeActiveLayers` so
   captions render identically in live preview and the WebCodecs MP4 export. One
   code path, no export-specific rendering.

5. **Transcript panel UI.** `web/src/components/timeline/TranscriptPanel.tsx`,
   docked like `Inspector`:
   - list of lines, inline text edit, add/delete/reorder;
   - click a line → move playhead to its `beatStartMs` and select its clips;
   - per-line "regenerate" button (reuses `ClipVersion` history).
   Use `ui_primitives` only — no raw MUI imports (repo policy).

6. **Export.** Reuse the existing in-browser WebCodecs MP4 export unchanged. It
   must produce a file that matches the preview, captions included.

### Constraints

- Vertical 9:16 only for the MVP; the sequence already supports any
  `width/height`, so don't hardcode — just default to vertical.
- Output length is short-form by definition; no length cap logic needed.
- TypeScript strict, no `any`, functional components, Zustand selectors (never
  whole-store), `shallow` for multi-value selects.
- Reuse the engine — do **not** reimplement sequence, generation, staleness,
  versioning, the compositor, or export. The MVP is one data type, one store, one
  panel, and a caption layer wired into code that already exists.

### Definition of done

- The one user story works start to finish against a running backend.
- Reword → regenerate and delete → re-flow both work via the existing stores.
- Captions match between preview and exported MP4.
- `npm run check` is green (typecheck + lint + test), with tests for the store ops
  (add/edit/delete/reorder/reword→stale) and the caption layer in
  `computeActiveLayers`.

### Before writing code

The script→beat generation step is the one place that touches the assembly
question from the PRD. For the MVP, keep it **deterministic** — a fixed per-line
pipeline (line text → `text-to-audio` → caption timing), *not* an agent. Confirm
this deterministic approach and surface any place the existing generation/staleness
APIs don't fit the per-beat binding before building. List the specific
existing functions/types you'll call (in `TimelineStore`, `TimelineGenerationStore`,
the `text-to-audio` node, transcription nodes, and `computeActiveLayers`) so the
integration points are explicit.
