# PRD: Guided Creation Flows — New Project to Editor

**Author:** Matti Georgi
**Status:** Draft — revised after review (F1–F9 resolved), extended to five flows
**Reference UX:** storyboarder.ai (five screens: Idea, Genre, Aspect ratio and style, Board, Edit shot)
**Shipped plan this builds on:** [plans/project-view/PLAN.md](plans/project-view/PLAN.md) (Phases 0 and 4)
**Related:** [creative-agent.md](creative-agent.md), [agentic-video-product.md](agentic-video-product.md), [script-storyboard-link/prd.md](script-storyboard-link/prd.md), [timeline-editor-prd.md](timeline-editor-prd.md), [image-editor-prd.md](image-editor-prd.md), [triggers-prd.md](triggers-prd.md)

---

## 1. Summary

The New Project surface gains five explicit entries, one per thing a creator
makes: **Storyboard**, **Video**, **Script**, **Image**, **Workflow**. Each opens
the same three-step guided flow with its own content: an Idea step with
imports and a blank escape hatch, a Shape step that sets structure and then
shows the agent's plan as editable text before anything costs money, and a
Look step with visual presets and one `Generate` button. The flow lands in the
editor that already exists for that document, with the generated work in place.

The storyboard flow (E1) is specified in full, modeled on the reference. It
also reshapes the board and the shot editor: scene-grouped shot cards with a
hover toolbar and an insert point, a genre chip and Change Style, and a
full-screen Edit Shot dialog with the still, its versions and one shot-table
row. The other four flows (E2–E5) are specified to the level their phases
need: steps, plan shape, presets, generate action, landing, data fields and
reuse.

Everything below the new chrome exists: `NewProjectSurface`, the five editors,
the Director, `generate_media`, the entity library, the script link, the
`ui_*` tool surfaces. This PRD adds one setup shell, four shared pieces, a
persisted setup stage per document, and the per-flow plan generators. No new
editor, no new document type.

## 2. Reference UX, screen by screen

| # | Screen | What it does |
| --- | --- | --- |
| S1 | Idea | Stepper `1. Idea · 2. Story · 3. Storyboard`. Heading "What's your story?". Textarea "One sentence is enough, or paste a full script." Three inspiration chips. Right column: Upload your file (PDF, DOCX, FDX), Import your shotlist (CSV, with a template download), Start with blank storyboard, a tutorial card. `Continue`. |
| S2 | Story | "Choose Your Genre": 14 genre cards, one line each, background image. `Back`, `Review Your Screenplay`. A screenplay review follows before any image is rendered. |
| S3 | Storyboard | "Choose Your Aspect Ratio and Art Style": aspect dropdown (16:9), 12 style tiles with a sample image plus "Add Your Own Style". `Generate Your Storyboard`. |
| S4 | Board | Editable title, genre chip, `Change Style`. Three-column card grid. Card: still, video badge, "~1:17 remaining" while rendering, hover toolbar (drag, download, duplicate, delete), fullscreen. Caption `Scene: 1 \| Shot: 1`, action text with character names rendered as chips, dialogue indicator. Footer `Edit · Iterate · regenerate · upload`. A `+` between cards inserts a shot. |
| S5 | Edit shot | Full-screen dialog. Left: still with an image toolbar (pan, flip, zoom, palette, brush, eraser) and a version pager `1 / 1`. Right: 3D camera blocking view. Below: `SCENE 1: INT. …` slugline dropdown and a lighting note, then one table row with the shot's fields. `Save`, `Retry`. |

Header items in the reference that are billing (free-project banner, Unlock
buttons, Video Count toggle) are not part of any flow. See § 4.3.

## 3. Current state

### 3.1 Entry points

| Surface | Today | Where |
| --- | --- | --- |
| New Project prompt | Textarea with `/` skill and `@` mention completion, ref images, entities, model, starter pills. One `Start` posts the prompt to the project agent. | `web/src/components/projects/NewProjectSurface.tsx` (`handleStart`), `projectStarters.ts` |
| New Project blank strip | Six-column catalog: Workflow, Chat, Text, Image (blank PNG asset), SVG, Video (`Untitled video` sequence), Storyboard ▸ (blank, examples), App, Script, Script (JS), Skill, 3D. Each opens a loose tab. | `web/src/components/workspace/newDocumentCatalog.tsx` |
| Studio home | One card "What is the video about?", `Make it`, two blank buttons (storyboard, script). Direct, extract a linked script, open the board. Curated models, no pickers. | `web/src/studio/StudioHome.tsx`, `useStudioPromptStart.ts`, `curatedModels.ts` |
| Workflow examples | Example and template browser in the manager chrome. | `web/src/components/portal/ExamplesPage.tsx` |

### 3.2 Storyboard surface

| Reference | NodeTool today | Where |
| --- | --- | --- |
| S2 genre | None. Director takes brief and style only. | `hooks/storyboard/useDirectScreenplay.ts` |
| S2 screenplay review | None. Direct writes shots straight onto the board. `setScreenplay` also copies the Director's `style_bible` into `board.style`. | `stores/storyboard/StoryboardStore.ts` `setScreenplay` |
| S3 aspect ratio | Select with five values in Board settings. | `StoryboardBoard.tsx` `ASPECT_OPTIONS` |
| S3 style tiles | Free-text `Style` plus library entities of kind `style`. No shipped presets, no thumbnails. | `StoryboardEntitiesField.tsx`, `creative.ts` `EntityKind` |
| S4 grid | Four-column card grid, flat order by `shot.index`, no scenes. Card shows still or clip, `SH NN · Ns`, status pill, progress bar, clamped action, Retry on failure. Cards are draggable. | `ShotCard.tsx`, `ShotStatusPill.tsx`, store `reorderShots` |
| S4 hover toolbar, insert, duplicate, upload | Add shot (appends), Delete shot in the inspector, no duplicate, no per-shot download, no upload of an own still. | `ShotInspector.tsx` |
| S4 entity chips in text | Entity refs exist in the protocol and `applyEntities`, but the card renders plain text. | `creative.ts` `entity_ref` |
| S5 dialog | Inspector docked under the grid: title, description, framing, lens, angle, movement, length with the `from takes` / `pinned` toggle, cost, entity chips, takes gallery, script panel, Revise take, Generate still, Render clip. | `ShotInspector.tsx`, `ShotTakesGallery.tsx`, `cameraOptions.ts` |
| S5 image toolbar | Separate image editor at `/assets/edit/:assetId`; not reachable from the shot. | `docs/image-editor.md` |
| Prompt composition | Still prompt = action, framing, board style. Clip prompt = motion, action. Direct clip = action, framing, motion, style. Lens, angle and movement are stored but never reach a prompt. | `hooks/storyboard/useGenerateShot.ts` |
| Versions | `keyframe_versions` and `clip_versions` are bare media refs. Nothing records what a version was rendered from. | `creative.ts` `Shot` |
| Export | Download ZIP, Preview, Assemble timeline (sorts by `shot.index`). | `utils/storyboardZip.ts`, `packages/timeline/src/storyboard.ts` |
| Agent tools | 14 `ui_storyboard_*` tools. Each takes a `storyboard_id` and delegates to the handler the open `StoryboardSurface` registers on `storyboardAgentBridge`; with no open surface the getter throws. | `web/src/lib/tools/builtin/storyboard.ts` |
| Document text | PDF extraction (`pdfium`) in `packages/document-nodes`; DOCX `extractRawText` in the agents mammoth host module. Both server side. | `packages/document-nodes`, `packages/agents/src/host-modules/mammoth.ts` |

### 3.3 The other four surfaces

| Flow | Editor and creation today | Agent tools | Where |
| --- | --- | --- | --- |
| E2 Video | Timeline editor. Blank sequence `Untitled video` from the catalog. Direct-generation clips (`text-to-video`, `text-to-image`, `text-to-audio`) render through `generate_media` per clip. Assemble from a storyboard builds the shot track. | 30 `ui_timeline_*` tools (add clips and tracks, generate, edit, transitions, markers from beats) | `hooks/timeline/useTimelineDirectGenJob.ts`, `packages/timeline/src/storyboard.ts`, `lib/tools/builtin/timeline.ts` |
| E3 Script | Script editor. Blank script from the catalog or Studio. Cast with voice bindings, sections of lines, takes with word timings. Voice all with a cost estimate. Derive storyboard, send to timeline. | 11 `ui_script_*` tools | `packages/protocol/src/api-schemas/scripts.ts`, `hooks/script/*`, `lib/tools/builtin/script.ts` |
| E4 Image | Two editors: the per-asset image tab (catalog "Image" makes a blank PNG asset) and the layered sketch editor with generated layers (`layerWorkflowBinding`, `layerVersion`). | 20 `ui_sketch_*` tools including `ui_sketch_generate` | `newDocumentCatalog.tsx`, `packages/protocol/src/api-schemas/sketch.ts`, `lib/tools/builtin/sketch.ts` |
| E5 Workflow | Node editor. Blank workflow from the catalog. Examples browser. Workflow row has `settings`, `run_mode`, `required_providers`, `required_models`. The chat agent builds graphs with the node tools. `validate_workflow` and `nodetool app build` exist headlessly. | `ui_add_node`, `ui_connect_nodes`, `ui_update_node_data`, `ui_get_graph`, `ui_search_nodes` | `packages/protocol/src/api-schemas/workflows.ts`, `lib/tools/builtin/*.ts`, `docs/harnesses.md` |

## 4. Scope

### 4.1 In scope

**Shared (§ 6)**

1. Five entry cards on the New Project surface. Studio home shows E1, E2, E3.
2. One `SetupFlow` shell and four shared pieces: `OptionCardGrid`,
   `PresetTileGrid`, `PlanReview`, `AlternativesColumn`.
3. A persisted setup stage on the document each flow produces, and resume by
   stage in every host.
4. Headless parity: every document operation a flow performs is a `ui_*` tool,
   and the setup hosts register the agent bridge for the document under setup.

**E1 Storyboard (§ 7), in full**

5. Genre, screenplay review, scenes with one ordering contract, prompt
   composition for every camera field, per-version render record and derived
   staleness, twelve shipped style presets and `Change Style`, board card
   changes, the Edit Shot dialog with draft-then-save, PDF/DOCX/FDX and CSV
   imports through a server extraction route.

**E2–E5 (§ 8–§ 11), to phase level**

6. Format, use-case and category cards. Plan generators and review views. Look
   presets with samples. Generate actions and landing surfaces. Data fields.

### 4.2 Out of scope

- 3D camera blocking view (S5 right panel).
- In-dialog painting. Brush, palette and eraser open the existing image editor
  on the still. The result comes back as a new version.
- PDF or share-link export. ZIP stays.
- Inferring the shape from a plain prompt. A plain prompt on the New Project
  surface keeps going to the project agent. Classification is Q4.
- Changes to the timeline, script, sketch and node editors beyond the landing
  strips named here. Changes to Assemble.
- Mobile and Electron chrome.

### 4.3 Non-goals

- No plan gating or upsell chrome in any flow. Studio's account page owns plan
  state.
- No second board, timeline, script, image or node editor. Each flow lands in
  the existing one.
- No change to what `Start` does on the New Project surface. Flows are reached
  only through the explicit entry cards.
- No five wizards. One shell, per-flow content.

## 5. Users and entry orders

| Entry | Who | Path |
| --- | --- | --- |
| E1 one sentence | Studio beginner, workspace creator | Idea → Genre → Review → Look → board |
| E1 full script pasted or uploaded | Writer with copy | Idea (parsed) → Genre → Review → Look → board |
| E1 shotlist CSV | Director with a shot plan | Idea → Look → board |
| E2 one sentence | Creator who wants the cut, not the board | Idea → Format → Beat list → Look → timeline |
| E2 dropped media | Editor with footage | Idea → Format → timeline with clips placed |
| E3 topic | Explainer or ad writer | Idea → Format → Script review → Voices → script editor |
| E3 pasted text or SRT | Writer with copy, editor with subtitles | Idea (parsed) → Format → Review → Voices → script editor |
| E4 description | Anyone wanting one image | Idea → Use case → Brief review → Look → contact sheet → image editor |
| E4 uploaded image | Anyone editing an image | Idea → image editor with the upload as a layer |
| E5 task in words | Builder, operator | Idea → Category → Step plan → Models and run mode → canvas |
| E5 example or JSON | Builder | Idea → canvas, stage `done` |
| Blank, any flow | Anyone | Idea → editor, stage `done` |
| Skill or plain prompt | Returning creator | `Start`, unchanged, never enters a flow |

## 6. Shared spine

### 6.1 Entry

Five cards under the prompt card on the New Project surface, each with a name
and a one-line promise:

| Card | Promise |
| --- | --- |
| Storyboard | From a sentence to a rendered board in three steps. |
| Video | From a sentence to a cut on the timeline, no board. |
| Script | From a topic to voiced lines, ready to place. |
| Image | From a description to a picked variation in the editor. |
| Workflow | From a task to a running graph, with the plan reviewed first. |

Clicking a card creates the project row (`kind` set to the flow name) and the
flow's document with its stage at `idea`, then renders the stepper in the same
tab. The prompt already typed, if any, is carried into step 1. The blank
document strip stays at the foot, unchanged.

Studio home shows three cards (Storyboard, Video, Script) in place of the
single "Make a video" card, with curated models and no model pickers.

### 6.2 Shell

`SetupFlow` renders the stepper, `Back`, the primary button, and the current
step's content. Steps are the same three for every flow, with the flow's own
labels:

| | Step 1 | Step 2 | Step 3 |
| --- | --- | --- | --- |
| E1 | Idea | Story (genre, then screenplay review) | Storyboard (aspect, style) |
| E2 | Idea | Format (format cards, then beat list review) | Look (aspect, video model, voice and music) |
| E3 | Idea | Format (format and length, then script review) | Voices (cast, language, pace) |
| E4 | Idea | Use case (cards, then brief review) | Look (size, style, image model) |
| E5 | Idea | Plan (category, then step list review) | Setup (models, run mode) |

Rules that hold for every flow:

- **Cheap text before spend.** Step 2 ends in a plan the creator edits as text.
  Nothing renders, voices, or places a node before step 3's button.
- **Presets are pictures.** Step 3 tiles show a sample: a rendered still, a
  short clip, a voice with a play button, a node-chain glyph row.
- **Blank escape hatch.** Step 1 always offers the blank document.
- **Resume by stage.** The stage is a field on the produced document
  (§ 6.4). Any host that opens a document whose stage is not `done` renders
  the flow at that stage. No wizard store.
- **Cost line when measured.** The estimate beside `Generate` uses the existing
  cost hooks and shows nothing when nothing was measured.
- **Same copy grammar.** Step headings are questions or imperatives, the
  primary button names the outcome (`Generate your storyboard`, `Voice your
  script`), and the landing editor shows a "next steps" strip pointing at the
  adjacent flows.

### 6.3 Shared pieces

| Piece | Renders | Used by |
| --- | --- | --- |
| `OptionCardGrid` | Cards with title, one line, background art, single select | E1 genre, E2 format, E3 format, E4 use case, E5 category |
| `PresetTileGrid` | Tiles with a media sample, single select, an `Add your own` tile | E1 and E4 style, E2 and E4 model, E3 voice |
| `PlanReview` | The generated plan as editable text with section headers, inline fields, `Re-plan` | E1 screenplay, E2 beat list, E3 script, E4 brief, E5 step list |
| `AlternativesColumn` | Right-column option cards (import, example, blank) and one tutorial card | Step 1 of every flow |

Each flow is a config plus one plan generator (`direct`, `planBeats`,
`writeScript`, `expandBrief`, `planWorkflow`) and one generate action.

### 6.4 Setup stage per document

| Flow | Document | Field | Stages |
| --- | --- | --- | --- |
| E1 | `storyboardDocument` | `setupStage` | `idea, genre, review, look, done` |
| E2 | timeline sequence | `setup: { stage, format, beats }` | `idea, format, review, look, done` |
| E3 | `scriptDocument` | `setup: { stage, format, lengthSeconds }` | `idea, format, review, voices, done` |
| E4 | sketch document | `setup: { stage, useCase, brief, variations }` | `idea, useCase, review, look, done` |
| E5 | workflow `settings.setup` | `{ stage, category, plan }` | `idea, category, review, setup, done` |

Every field is optional and additive. A missing field reads as `done`, so
every existing document opens as today. Blank creation writes `done`. The
stage is the only completion signal for any step. No content value (shots,
style, clips, lines, nodes) is read as progress.

### 6.5 Headless parity

Parity means: every document operation a flow performs has a `ui_*` tool that
performs the same store operation with the same outcome, and the acceptance
criteria hold when driven through tools. Each setup host registers the
document under setup on its agent bridge exactly as the editor surface does,
so tools work during setup. The per-flow tables (§ 7.10, § 8.6, § 9.6,
§ 10.6, § 11.6) list the operations and name new tools.

## 7. E1 — Storyboard

### 7.1 Step 1 — Idea

Heading "What's your story?", subline "We'll turn it into a screenplay and
storyboard." Three inspiration chips seeded from the shipped example boards'
loglines. The prompt card keeps `@` mentions, ref images and entities. `/`
skill completion is off inside the flow. Placeholder: "One sentence is enough,
or paste a full script."

Alternatives:

- **Upload your file** (PDF, DOCX, FDX). See § 7.8 for the extraction path and
  the error contract. The text lands in the textarea. FDX also yields typed
  scenes and dialogue that step 2 uses verbatim.
- **Import your shotlist** (CSV). "Download template" serves a static file.
  Import creates scenes and shots, sets `setupStage: "look"`, and advances to
  step 3. See § 7.7.8.
- **Start with blank storyboard** — sets `setupStage: "done"` and opens the
  board.
- **Tutorial** — the existing tutorials entry.

`Continue` writes `brief` and `setupStage: "genre"`.

### 7.2 Step 2 — Story

**Genre.** Heading "Choose your genre", subline "Tone, pacing and framing follow
your choice. You can change it later." Fourteen cards: Action, Animation,
Comedy, Commercial, Documentary, Drama, Educational, Fantasy, Horror, Music
Video, Mystery, Romance, Science Fiction, Thriller. Card art is one shipped
`package://` still per genre. Picking a card writes `genre` on the board.
`Back`, `Review your screenplay`.

**Direct.** `Review your screenplay` runs the Director with brief, genre and
(when present) the parsed script. On success the store applies the screenplay
and sets `setupStage: "review"`. On failure the stage stays `genre` and the
error shows on the button. Closing the tab mid-call loses the in-flight result
only. Rerunning is the recovery.

**Review.** The screenplay as text: title, logline, then each scene as a
slugline header with its lighting note, and the shots beneath as action lines
with dialogue. Every field is editable inline and writes through the store
(`updateShot`, `updateScene`). The document is the draft, since nothing else
writes it during review. `Re-direct` sends the current screenplay back to the
Director as context and applies the revision through `setScreenplay`, which
already merges by shot id and keeps media. Shots the revision drops are
removed. New ones are appended. `Back` returns to genre and keeps the
screenplay. `Continue to storyboard` sets `setupStage: "look"`.

**Imported scripts.** An FDX yields typed paragraphs, so scenes and dialogue
are built deterministically by the parser: one scene per `Scene Heading`, one
shot per `Action` paragraph or dialogue block, `dialogue` set from the
`Character` and `Dialogue` paragraphs verbatim. The Director is asked only for
camera, motion and duration per shot and may not alter `dialogue` or scene
order. A post-check (`verifyImportedText`) compares the returned dialogue and
scene sequence against the parse and restores the parsed values where they
differ, with a review-step notice naming the shots it corrected. PDF and DOCX
yield plain text, so the Director structures it and the same post-check flags,
rather than restores, any line of the source that no shot's dialogue or action
contains.

**Script link in Studio.** Studio's automatic linked-script extraction stays.
It moves from "after Direct" to `Continue to storyboard`, so the script is
extracted from the reviewed screenplay. The workspace flow does not extract
automatically. `Extract script` on the board is unchanged.

### 7.3 Step 3 — Storyboard

Heading "Choose your aspect ratio and art style", subline "Set the look with a
preset or your own references. You can change it later."

Aspect ratio: the existing five options, `16:9` default.

Style: `PresetTileGrid` with the twelve shipped presets plus `Add your own
style`. Presets: Comic, Cinematic, Soft Pencil, Animation 3D, Watercolor Paint,
Photo / Commercial, Charcoal Sketch, Dark Anime, Flat / Vector, Noir, Stick
Figure, Graphic Novel. Each is a shipped library entity of kind `style` with a
descriptor and one thumbnail asset. Picking a tile runs `setStylePreset`
(§ 7.7.5). `Add your own style` takes one to three reference images, asks the
language model for a descriptor, saves a user style entity with the first image
as its thumbnail, then applies it like a preset.

`Generate your storyboard` sets `setupStage: "done"`, enqueues a still for
every shot through the existing batch path with its cost estimate, and opens
the board immediately with the cards rendering. The step is not complete
because `board.style` is non-empty: `setScreenplay` copies the Director's
`style_bible` into `style` during step 2. The stage is the only completion
signal.

### 7.4 Board

Header: editable title, genre chip beside it (opens the genre grid as a
popover), `Change Style` at the right of the toolbar. Existing actions stay.
Next-steps strip: `Extract script`, `Assemble timeline`.

Grid: the shipped four-column grid, grouped under scene headers per the
ordering contract in § 7.7.3. A `+` appears between two cards on hover and runs
`insertShot(afterShotId)`. Drag-to-reorder within and across scenes runs
`moveShot` with the target scene and position.

Card:

- Still or clip, fullscreen icon, status pill and progress bar as shipped.
- While rendering, "~M:SS remaining" when the generation store has a measured
  duration for the same model and kind from an earlier job in this browser
  session or the persisted duration table. Otherwise the progress bar alone.
- Hover toolbar on the still: drag handle, download (still or clip), duplicate
  (§ 7.7.6), delete (confirm once).
- Caption `Scene N | Shot N` per § 7.7.3. Action text with entity names
  rendered as chips through the existing entity-ref parsing. A dialogue icon,
  filled when `dialogue` is non-empty, opens the Edit dialog on the dialogue
  cell.
- A `stale` marker on the pill when the selected version's render record
  differs from the current inputs (§ 7.7.4).
- Footer: `Edit` (dialog), `Iterate` (today's Revise take), regenerate icon
  (new still from the saved fields), upload icon (own image as a new keyframe
  version, selected on upload).

Toolbar during and after a batch: `Retry N failed` appears while any shot's
last job failed and retries each with its saved fields. A banner "Style
changed. N stills and M clips are stale. Re-render stills" appears when
§ 7.7.4 finds stale versions. Clicking renders stills only. Clips stay stale
until `Render clips`.

Batch jobs are server jobs. A board closed mid-batch reattaches on open: the
generation store reconciles each shot's pending job by id and lands completed
assets as versions, the same path the queue overlay uses today.

### 7.5 Edit Shot dialog

Full-screen dialog, `Edit your shot`. Replaces the docked inspector. The
selection footer from Phase 0 keeps only `Edit`, `Iterate`, `Regenerate`,
`Delete`.

- **Left.** Still or clip viewer with pan, flip horizontal, zoom in, zoom out,
  `Open in image editor`. Flip and image-editor edits each add a version, never
  overwrite. Version pager `k / n`.
- **Right.** The existing takes gallery: every version, select or delete.
- **Header row.** `SCENE N:` slugline as a dropdown that runs `moveShot` to the
  end of the chosen scene. The scene's lighting note, editable.
- **Table row.** Scene, Shot, Description, Dialogue, ERT, Size, Perspective,
  Movement, Equipment, Focal length, Aspect ratio, Notes. Field mapping in
  § 7.7.2. Aspect ratio is the board's value, read-only, linking to Board
  settings. Notes is `Add +` until set.
- **Dialogue on a linked board.** Read-only, showing the linked lines with
  speaker. `Edit in script` opens the script at the first line. The script
  owns words. On an unlinked board the cell is a textarea.
- **ERT on a linked board.** Shows the value with the existing `from takes` /
  `pinned` chip. Typing a value pins it (`duration_source: "manual"`). The
  chip toggles back to `audio`, which restores the takes' duration. On an
  unlinked board it is a plain number.
- **Script panel** for a linked board stays below the table.
- **Footer.** `Save`, `Regenerate`, and the overflow items that exist today.

Save semantics: the table row and the header row are a draft. `Save` commits
the draft as one store update and one undo step. `Regenerate` saves first, then
renders from the saved fields. Closing with unsaved changes asks "Discard
changes?" with `Save` and `Discard`. Version selection, deletion, flip and
upload are not draft state. They commit immediately, as they do today.

Keyboard: `Esc` closes (with the confirm above when dirty), `←`/`→` step
versions, `Cmd/Ctrl+S` saves.

### 7.6 Imports

**Extraction route.** `POST /api/documents/extract-text` (multipart, one
file, size-capped) in `packages/websocket`. Dispatches by content type: PDF
through the `pdfium` extraction `packages/document-nodes` already uses, DOCX
through `extractRawText` in `packages/agents/src/host-modules/mammoth.ts`.
Returns `{ text, pages? }`. FDX is XML and is parsed in the browser by
`parseFdx` (pure), no round trip. E3 uses the same route.

**Error contract.**

| Case | Behavior |
| --- | --- |
| PDF with no extractable text (scanned) | Nothing written. Notice: "No text found in this PDF. Paste the script, or upload a DOCX or FDX." |
| Malformed or unsupported file | Nothing written. Notice names the accepted types. |
| Extraction over the size cap | Refused before upload with the cap. |
| FDX without a `Scene Heading` | Imported as one scene named `Scene 1`. |

CSV contract in § 7.7.8. A refused file writes nothing. A partially discarded
file imports the rest and shows the report.

### 7.7 Data model and contracts

Additive only. Every storyboard schema is `passthrough`, so old documents load
unchanged. § 7.7.7 states each default.

#### 7.7.1 Board, screenplay, scene

```ts
// packages/protocol/src/api-schemas/storyboards.ts — storyboardDocument gains:
setupStage: z.enum(["idea", "genre", "review", "look", "done"]).default("done"),
genre: z.string().default(""),

// packages/protocol/src/creative.ts
export interface Scene {
  type: "scene";
  id: string;
  slugline: string;   // "INT. SOPHIA'S FLAT — HALLWAY — EARLY MORNING"
  lighting?: string;
}
// Screenplay gains:
genre?: string;       // copy of the board's genre at Direct time
scenes?: Scene[];     // authoritative list; order derived, see 7.7.3
```

Genre lives on the board because it is chosen before a screenplay exists. The
Director schema (`buildScreenplaySchema`) gains `genre` as input and `scenes`
plus per-shot `scene_id` as output. Aliases: `sceneId → scene_id`.

#### 7.7.2 Shot

```ts
// Shot gains:
scene_id?: string;
// camera gains:
equipment?: string;
// each entry of keyframe_versions / clip_versions gains (on the ref, passthrough):
render_inputs?: RenderInputs;   // see 7.7.4
```

Equipment vocabulary in `cameraOptions.ts`: handheld, tripod, steadicam,
gimbal, dolly, slider, crane, drone.

Table column → field: Description → `action`; Dialogue → `dialogue`; ERT →
`duration_seconds` with `duration_source`; Size → `camera.framing`;
Perspective → `camera.angle`; Movement → `camera.movement`; Equipment →
`camera.equipment`; Focal length → `camera.lens`; Notes → `notes`.

#### 7.7.3 Ordering contract

- `shot.index` is the one global order: contiguous `0..n-1`, rewritten by every
  structural operation, read by Assemble and by export. Nothing else orders
  shots.
- A scene is the set of shots sharing its `scene_id`. Invariant: those shots
  are contiguous in `shot.index`. Scene order is derived from the index of each
  scene's first shot. `Scene` carries no index of its own. A scene with no
  shots is dropped on the next structural operation.
- Display: `Scene N` is the derived scene position plus one. `Shot N` is the
  shot's position within its scene plus one. Neither is stored.
- Legacy: shots without `scene_id` render under one implicit header, `Scene 1`
  with no slugline, without materializing a `Scene`. The first scene-creating
  operation (Direct, import, "New scene", or a move) assigns every unscened
  shot to one new scene in index order.
- Operations, each atomic and one undo step, each ending with a full reindex:
  `moveShot(shotId, sceneId, position)`, `insertShot(afterShotId)`,
  `duplicateShot(shotId)`, `removeShot(shotId)`, `reorderShots(orderedIds)`
  (existing, now rejects an order that breaks contiguity),
  `updateScene(sceneId, patch)`, `createScene(afterSceneId)`,
  `mergeSceneIntoPrevious(sceneId)`.
- The Edit dialog's scene dropdown is `moveShot(shotId, sceneId, end)`. Drag
  across a header is `moveShot` with the drop position. Grouping never changes
  without index changing with it.
- CSV: `scene` groups rows. `shot` is the sort key within a scene (numeric
  ascending, non-numeric or missing values keep row order after the numeric
  ones). Rows are then assigned `shot.index` in scene order. The displayed
  shot number is recomputed, never taken from the column.

#### 7.7.4 Render record and staleness

```ts
export interface RenderInputs {
  kind: "keyframe" | "clip";
  prompt_hash: string;   // sha-256 of the composed prompt (7.7.5)
  model: string;         // provider/model id
  aspect_ratio: string;
  style_entity_id: string | null;
  source_version_id?: string;  // the still a keyframe-mode clip animated
  recorded_at: string;
}
```

Written when the job is enqueued and stored on the version when the asset
lands, so a render that finishes after a style change carries its
enqueue-time inputs. A version is **stale** when its `render_inputs` differs
from the inputs the same shot would use now. The comparison is pure
(`isVersionStale(shot, board)`) and derived at render time, never persisted as
a flag. Versions without a record (legacy, upload, flip, image-editor edit)
are never stale. A keyframe-mode clip is also stale when its
`source_version_id` is not the selected keyframe.

#### 7.7.5 Prompt composition and style

`useGenerateShot` and the headless render tools compose from one shared pure
module (`packages/protocol/src/shot-prompt.ts`) so the UI and the agent render
the same prompt. Field → prompt:

| Field | Still | Clip (keyframe mode) | Clip (direct) |
| --- | --- | --- | --- |
| `action` | yes | yes | yes |
| `camera.framing` | `<framing> shot` | — | `<framing> shot` |
| `camera.angle` | yes | — | yes |
| `camera.lens` | `<lens> lens` | — | `<lens> lens` |
| scene `lighting` | yes | — | yes |
| `motion` | — | yes | yes |
| `camera.movement` | — | yes | yes |
| `camera.equipment` | — | yes (`handheld`, `steadicam` …) | yes |
| board `style` | yes | — | yes |
| entities | `entity://` tokens, as today | as today | as today |

A test asserts each field in the table appears in the prompt for the modes
marked yes and is absent otherwise. `dialogue`, `notes` and `duration_seconds`
never enter a prompt.

`setStylePreset(entityId)`: one store operation, one undo step. Removes every
entity of kind `style` from `board.entityIds`, adds the chosen id, sets
`board.style` to its descriptor. Per-shot include and exclude lists for
characters, locations and props are untouched. A per-shot exclusion of a style
entity is removed, since styles apply board-wide. Nothing renders. Staleness
follows from § 7.7.4.

#### 7.7.6 Duplicate

`duplicateShot(shotId)` inserts the copy directly after the source in the same
scene, copies `action`, `camera`, `motion`, `dialogue`, `notes`,
`duration_seconds`, entity lists, versions and selections. It drops
`script_line_ids`, `script_text_snapshot` and `covered_by`, sets
`duration_source: "manual"`, and gives the copy a new id and `status` equal to
the source's.

#### 7.7.7 Defaults for existing documents

| Field | Missing value reads as |
| --- | --- |
| `setupStage` | `"done"` |
| `genre` | `""` |
| `screenplay.scenes` | none. Shots render under the implicit header |
| `shot.scene_id` | unscened |
| `camera.equipment` | unset, omitted from prompts |
| `render_inputs` | never stale |

#### 7.7.8 Shotlist CSV

Columns, header row required, order free:

```
scene, shot, description, dialogue, duration_seconds, size, perspective, movement, equipment, focal_length, notes
```

`scene` and `description` are required. A file missing either header is
refused with the missing names. Parsing is RFC 4180 through a real CSV parser:
quoted fields, embedded commas, multiline dialogue. A `scene` value that starts
with `INT.`, `EXT.` or `INT./EXT.` becomes the slugline. Otherwise the scene is
named `Scene N`. Vocabulary columns match the option lists
case-insensitively. A non-match leaves the field unset. `duration_seconds`
must be a positive number, otherwise unset. Every discarded value is listed in
the import report (row, column, value) shown after import. A row with an empty
`description` is skipped and reported.

#### 7.7.9 Style presets

Shipped as system entities of kind `style`, one row each, read-only,
thumbnails under a `package://` path, seeded the way example boards are.
`Add your own style` always creates a user-owned copy. A preset's descriptor
never changes under a user.

### 7.8 Decisions

- **D1 — One setup component, all hosts.** `SetupFlow` renders inside the New
  Project tab and Studio home. The document's stage and fields are the flow's
  state. No wizard store.
- **D2 — Explicit entry only.** Flows start from the entry cards. A plain or
  `/skill` prompt on the New Project surface keeps going to the project agent.
  (Resolves F1.)
- **D3 — Persisted stage, not inferred state.** § 6.4. No content value is
  read as progress. (Resolves F2.)
- **D4 — Review before spend.** Every flow's step 2 ends in an editable text
  plan. Nothing renders, voices or places nodes before step 3's button.
- **D5 — Scenes on the screenplay, one global order.** § 7.7.3. Assemble, the
  script link and the timeline keep reading `shot.index`. (Resolves F4.)
- **D6 — Style preset = style entity, applied by one operation.** § 7.7.5.
  (Resolves F6.)
- **D7 — Staleness is derived from a per-version render record.** § 7.7.4.
  (Resolves F6.)
- **D8 — Camera fields reach the prompt or they do not ship.** § 7.7.5 is in
  P1. The dialog's fields are not rearranged before their prompt effect exists.
  (Resolves F5.)
- **D9 — The script owns words.** On a linked board dialogue is read-only and
  edited in the script. Duration follows takes unless pinned. Studio still
  extracts a linked script, now at `Continue to storyboard`. (Resolves F3, Q1.)
- **D10 — Imported dialogue is deterministic.** FDX dialogue and scene order
  come from the parser. The Director fills camera and motion. A post-check
  restores drift. (Resolves F3.)
- **D11 — Edit dialog replaces the docked inspector, draft-then-save.** § 7.5.
  (Resolves F8.)
- **D12 — Style change never renders.** Stills and clips are marked stale.
  Stills re-render from the banner, clips from `Render clips`. (Resolves Q2.)
- **D13 — Duplicate drops script links.** § 7.7.6, in every case. (Resolves Q3.)
- **D14 — Remaining time only when measured.** Same rule as the spend estimate.
- **D15 — Paint tools open the image editor.** No second raster editor.
- **D16 — Extraction is a server route.** § 7.6. The browser never bundles
  `pdfium` or `mammoth`. (Resolves F7.)

### 7.9 Acceptance criteria

1. The Storyboard card and the Studio card open the flow. A plain prompt and a
   `/skill` prompt on the New Project surface never do.
2. A board at each `setupStage` value, closed and reopened from the tab bar,
   the projects list and a URL, resumes at that step with its values. A board
   without the field opens as today.
3. Genre appears in the Director prompt (asserted in the hook's test) and as a
   chip on the board.
4. The review step renders the directed screenplay as text with no render job
   started. A shot edited there is the shot that renders in step 3. Re-direct
   keeps the ids and media of shots the revision retains.
5. An FDX import's dialogue lines and scene order appear in the review verbatim
   and in order, asserted against the fixture. A Director response that
   changes one is restored and the shot is named in the notice.
6. Studio extracts the linked script at `Continue to storyboard`, from the
   reviewed screenplay.
7. Each preset sets `style` and exactly one `style` entity id in one undo step.
   `Change Style` marks affected stills and clips stale and renders nothing.
8. A version rendered before a style change and landing after it reads stale
   on landing.
9. After every ordering operation `shot.index` is contiguous and each scene's
   shots are contiguous. `Scene N | Shot N` matches the derived numbering.
   Assemble's clip order equals `shot.index`.
10. Each field marked yes in § 7.7.5 appears in the composed prompt for that
    mode and is absent otherwise, in the UI path and the headless path.
11. Hover toolbar: download saves the still or clip. Duplicate inserts after
    the source with script links dropped and `duration_source: "manual"`.
    Delete asks once.
12. Entity names in a card's action render as chips. A shot with dialogue shows
    the filled icon.
13. "~M:SS remaining" appears only when a duration was measured for that model
    and kind.
14. The Edit dialog edits every field in § 7.7.2. `Save` is one undo step.
    Closing dirty asks. `Regenerate` renders from saved values. Dialogue is
    read-only on a linked board and the ERT chip toggles `duration_source`.
15. Flip, image-editor edits and uploads each add a version, never overwrite.
    Upload selects the new version.
16. PDF, DOCX and FDX uploads land as text through the extraction route. A
    scanned PDF and a malformed file write nothing and show the § 7.6 notice.
17. A CSV missing `scene` or `description` is refused naming the header. A
    multiline quoted dialogue cell imports intact. An invalid duration and an
    unknown vocabulary value import with the field unset and appear in the
    report.
18. A board closed during a batch shows the landed versions on reopen. Failed
    shots show Retry and `Retry N failed` retries only those.
19. Every criterion above that is a document operation also passes when driven
    through the § 7.10 tools during setup and on the board.

### 7.10 Headless parity

| Operation | Tool |
| --- | --- |
| Set brief, genre, stage | new `ui_storyboard_set_setup` (`brief?`, `genre?`, `stage?`) |
| Run or rerun the Director | new `ui_storyboard_direct` (`redirect: boolean`) |
| Replace the screenplay wholesale | `ui_storyboard_set_screenplay` (accepts `genre`, `scenes`, per-shot `sceneId`) |
| Edit a shot's fields | `ui_storyboard_update_shot` (accepts `camera.equipment`, `dialogue`, `notes`, `durationSource`; scene changes go through move) |
| Move a shot to a scene and position | new `ui_storyboard_move_shot` |
| Insert at a position | `ui_storyboard_add_shot` (gains `afterShotId`) |
| Duplicate, delete | new `ui_storyboard_duplicate_shot`, new `ui_storyboard_remove_shot` |
| Scenes | new `ui_storyboard_update_scene`, `ui_storyboard_create_scene`, `ui_storyboard_merge_scene` |
| Style | new `ui_storyboard_set_style` (entity id or descriptor; runs `setStylePreset`) |
| Versions | new `ui_storyboard_select_version`, `ui_storyboard_delete_version` |
| Flip, upload | new `ui_storyboard_add_keyframe_version` (asset id, `flipOf?`) |
| Render | `ui_storyboard_generate_keyframe`, `ui_storyboard_generate_clip` (gain `staleOnly`) |
| Import | `parseFdx`, `parseShotlistCsv` in `web/src/lib/storyboard/`, then `ui_storyboard_set_screenplay` |

Tests: the pure modules (`parseFdx`, `parseShotlistCsv`, `verifyImportedText`,
`isVersionStale`, `shot-prompt`, the ordering operations) each get a
red-then-green test. Resume, save semantics and batch reattachment are Jest
tests on the store and hooks. The `script-storyboard-link` harness entry
gains the new pure suites so `harness gate` runs them on a diff touching the
flow.

## 8. E2 — Video

The storyboard flow without the still stage. The plan is a beat list, the
Director runs in direct mode, and the landing surface is the timeline with
clips rendering in place.

### 8.1 Step 1 — Idea

Heading "What's the video?", subline "We'll plan the beats and cut it on the
timeline." Inspiration chips from the shipped example timelines. Alternatives:

- **Drop your media** (video, audio, images). Creates the sequence, places each
  file as a clip on the matching track in drop order through the existing
  media import, sets stage `format`, and continues. The beat list in step 2
  then describes the dropped clips rather than inventing them.
- **Start from a script** — hands off to E3 with the prompt carried over. The
  script's `Send to timeline` is the way back.
- **Start with a blank timeline** — stage `done`.

`Continue` writes the brief onto the sequence's `setup` and stage `format`.

### 8.2 Step 2 — Format

**Format cards.** Heading "Choose your format". Cards: 15s ad, 30s spot, 60s
explainer, 9:16 social clip, trailer, music video, slideshow. Each sets
`durationMs`, aspect (width and height), fps, and the track layout (video,
voiceover, music). `Back`, `Plan the beats`.

**Plan.** `Plan the beats` runs the Director with the brief, the format's
duration and a flag for direct rendering. The result is applied as a beat list
on `setup.beats`: for each beat a prompt (action, framing, motion, style in
one line, composed by the same `shot-prompt` module as E1), a duration, a
transition to the next beat, and per-beat toggles for voiceover text and
music. Stage `review`.

**Review.** `PlanReview` shows the beats as numbered rows: duration, prompt,
transition, voiceover line. Each is editable. `Re-plan` reruns the Director
with the edited list as context. The sum of durations is shown against the
format's length and turns a warning color when it exceeds it. `Continue to
look` sets stage `look`.

### 8.3 Step 3 — Look

Heading "Choose your look". Aspect ratio from the format, changeable. Video
model as `PresetTileGrid`, each tile a short sample clip of that model on the
same prompt, from the curated clip models in Studio and the configured
providers in the workspace. Voice: on or off, with a voice tile when on (the
E3 voice tiles). Music: on or off. Cost estimate from the existing timeline
cost hook, required beside `Generate` because clips cost dollars. When no
estimate exists the button is still enabled and the line reads "cost unknown
until the first clip returns".

`Generate your video` sets stage `done`, creates one `text-to-video` clip per
beat on the video track with the beat's prompt and duration, one text-to-audio
clip per voiced beat on the voiceover track, one music clip when music is on,
applies the transitions, and enqueues every direct-generation job through
`useTimelineDirectGenJob`. The timeline opens immediately with the clips as
placeholders showing progress.

### 8.4 Landing

The timeline editor as it exists. Placeholders fill in as jobs land. A failed
clip shows Retry on the clip and a `Retry N failed` toolbar action. Next-steps
strip: `Export`, `Add captions`. Closing during generation reattaches on open
through the same job reconciliation as E1.

### 8.5 Data model

```ts
// timeline sequence (api-schemas/timeline.ts) gains an optional field:
setup?: {
  stage: "idea" | "format" | "review" | "look" | "done";
  brief: string;
  format?: string;                 // the format card's id
  beats?: Array<{
    id: string;
    prompt: string;
    duration_ms: number;
    transition?: string;
    voiceover?: string;
    music?: boolean;
    clip_id?: string;              // set at generate time
  }>;
};
```

Clips created by the flow carry the beat id in their existing metadata so the
review can be reopened from the timeline as a read-only record of the plan.
Nothing else in the timeline schema changes. Reuse: `useTimelineDirectGenJob`,
`ui_timeline_add_media_clip`, `ui_timeline_set_transition`, the cost hooks,
`STUDIO_CLIP_MODELS` and `STUDIO_VOICES` in Studio.

### 8.6 Headless parity

| Operation | Tool |
| --- | --- |
| Set brief, format, stage | new `ui_timeline_set_setup` |
| Plan or re-plan beats | new `ui_timeline_plan_beats` |
| Edit a beat | new `ui_timeline_update_beat` |
| Generate from beats | new `ui_timeline_generate_from_beats` (creates clips, enqueues jobs) |
| Everything after landing | existing `ui_timeline_*` |

### 8.7 Acceptance criteria

1. The Video card opens the flow. Dropped media lands as clips in drop order
   before any beat exists.
2. A sequence at each stage resumes at that step. A sequence without `setup`
   opens as today.
3. `Plan the beats` writes `setup.beats` and creates no clip and no job.
4. The review shows the duration sum against the format and edits round-trip
   to `setup.beats`.
5. `Generate your video` creates exactly one video clip per beat, one
   voiceover clip per voiced beat, at most one music clip, and the transitions
   from the beats. The cost line reads from the timeline cost hook or the
   "unknown" text.
6. Clips that land after the tab was closed appear on reopen. Failed clips
   retry individually and through `Retry N failed`.
7. Every criterion also passes through the § 8.6 tools.

## 9. E3 — Script

### 9.1 Step 1 — Idea

Heading "What's the script about?", subline "We'll write it in lines you can
voice." Inspiration chips: a 60-second explainer, a podcast intro, an ad read.
Alternatives:

- **Paste or upload text** (TXT, PDF, DOCX, FDX) through the § 7.6 route. FDX
  yields speakers and lines typed. Plain text is split into lines by the
  writer step and kept verbatim.
- **Import subtitles** (SRT, VTT). Each cue becomes a line, cue timing becomes
  the line's target duration, a single `Narrator` speaker.
- **Start with a blank script** — stage `done`.

`Continue` writes the brief and stage `format`.

### 9.2 Step 2 — Format

**Format cards.** Heading "Choose your format". Cards: voiceover narration,
dialogue between characters, interview, ad read, tutorial. A length row below:
30s, 60s, 2 min, custom. Each card sets the cast shape (one narrator, two or
more named speakers, host and guest) and the section layout. `Back`, `Write
the script`.

**Write.** `Write the script` runs the writer (`generate_text` with a structured
script schema) with brief, format and length. Imported text is kept verbatim
and only split and attributed. The result is applied to `cast` and `sections`
through the existing store. Stage `review`.

**Review.** `PlanReview` shows the script as the editor shows it: speaker,
line, direction note. Inline edits write through `ui_script_set_line_text` and
`ui_script_set_speaker`. `Rewrite` reruns the writer with the edited script as
context and preserves line ids where the rewrite keeps a line. A word count and
an estimated spoken length (at the flow's pace) sit under the title. `Continue
to voices` sets stage `voices`.

### 9.3 Step 3 — Voices

Heading "Choose the voices". One row per speaker in the cast, each with a
`PresetTileGrid` of voices: a tile plays a short sample of that voice reading
the speaker's first line. Studio shows `STUDIO_VOICES`. The workspace shows the
configured providers' voices. Language and pace selects apply to every
speaker. Cost from `useVoiceCostEstimate` beside the button.

`Voice your script` sets stage `done`, binds each speaker's voice, runs
`ui_script_voice_all`, and opens the script editor with lines voicing in
place.

### 9.4 Landing

The script editor as it exists, with takes arriving per line. Next-steps
strip: `Create storyboard` (existing derive), `Send to timeline` (existing).

### 9.5 Data model

```ts
// scriptDocument gains an optional field:
setup?: {
  stage: "idea" | "format" | "review" | "voices" | "done";
  brief: string;
  format?: string;
  length_seconds?: number;
  pace?: "slow" | "normal" | "fast";
  language?: string;
};
```

Nothing else changes. Reuse: cast and voice bindings, `useVoiceCostEstimate`,
`ui_script_*`, the § 7.6 extraction route, a new pure `parseSrt` beside
`parseFdx`.

### 9.6 Headless parity

| Operation | Tool |
| --- | --- |
| Set brief, format, length, stage | new `ui_script_set_setup` |
| Write or rewrite | new `ui_script_write` (`rewrite: boolean`) |
| Edit lines and speakers | existing `ui_script_set_line_text`, `ui_script_set_speaker`, `ui_script_add_line`, `ui_script_add_speaker` |
| Bind voices, voice all | existing `ui_script_set_speaker_voice`, `ui_script_voice_all` |
| Import | `parseFdx`, `parseSrt`, then the line and speaker tools |

### 9.7 Acceptance criteria

1. The Script card and the Studio card open the flow. Blank opens the editor.
2. A script at each stage resumes at that step. A script without `setup` opens
   as today.
3. `Write the script` creates lines and cast and no take. Imported text appears
   verbatim, split into lines, asserted against the fixture. An SRT's cues
   become lines with their timings.
4. `Rewrite` keeps the ids of lines it retains.
5. Each voice tile plays the speaker's first line in that voice. `Voice your
   script` binds one voice per speaker and voices every line once.
6. Every criterion also passes through the § 9.6 tools.

## 10. E4 — Image

### 10.1 Step 1 — Idea

Heading "What image do you want?", subline "Describe it once. We'll refine the
brief and render variations to pick from." Inspiration chips from the shipped
example images. Alternatives:

- **Upload an image to edit** — creates the sketch document with the upload as
  its first layer, stage `done`, opens the editor.
- **Start with a blank canvas** — stage `done`.

`Continue` writes the brief and stage `useCase`.

### 10.2 Step 2 — Use case

**Use-case cards.** Heading "What is it for?". Cards: product shot, portrait,
key art, social post, logo, concept art, texture. Each sets a default size,
composition guidance and the variation count default. `Back`, `Refine the
brief`.

**Expand.** `Refine the brief` asks the language model to expand the prompt
into a structured brief: subject, composition, lighting, style words, negative
notes. Stage `review`.

**Review.** `PlanReview` shows the brief's fields inline-editable, plus a
variation count chip: 1, 2 or 4. `Re-refine` reruns with the edits. `Continue
to look` sets stage `look`.

### 10.3 Step 3 — Look

Heading "Choose the look". Size as preset tiles per aspect (square, portrait,
landscape, story, banner) with the pixel size shown. Style as the same twelve
`style` entities as E1, one library. Image model as `PresetTileGrid`, each
tile a sample of that model on a fixed prompt. Cost from the sketch generate
estimate times the variation count.

`Generate your image` sets stage `done` and enqueues N generated layers
through the sketch editor's `text-to-image` binding, one per variation, each
with the composed prompt (brief plus the style descriptor), the size and the
model.

### 10.4 Landing

A contact sheet: the N variations in a grid as they land, each with `Pick`,
`Regenerate`, `Download`. `Pick` opens the sketch editor with the picked
variation visible and the others kept as hidden layers with their
`layerVersion` records, so nothing generated is lost. The strip: `Make more
variations`, `Use in a storyboard` (creates an image entity of kind `prop` or
`style` from the picked layer).

### 10.5 Data model

```ts
// sketch document gains an optional field:
setup?: {
  stage: "idea" | "useCase" | "review" | "look" | "done";
  brief: string;
  use_case?: string;
  refined?: { subject: string; composition: string; lighting: string; style_words: string; negative: string };
  variations?: number;
};
```

Reuse: `layerWorkflowBinding` with `kind: "text-to-image"`, `layerVersion`,
`ui_sketch_generate`, the style entities from § 7.7.9, the sketch cost
estimate.

### 10.6 Headless parity

| Operation | Tool |
| --- | --- |
| Set brief, use case, variations, stage | new `ui_sketch_set_setup` |
| Refine or re-refine | new `ui_sketch_refine_brief` |
| Generate variations | `ui_sketch_generate` called once per variation with the composed prompt |
| Pick | `ui_sketch_select_layer` plus visibility through `ui_sketch_adjust_layer` |

### 10.7 Acceptance criteria

1. The Image card opens the flow. Upload lands as a layer and opens the editor.
2. A document at each stage resumes at that step. A document without `setup`
   opens as today.
3. `Refine the brief` creates no layer and no job.
4. `Generate your image` creates exactly N generated layers with the same
   prompt, size and model, differing only by seed.
5. `Pick` opens the editor with the picked layer visible and the others hidden,
   each with its version record.
6. Every criterion also passes through the § 10.6 tools.

## 11. E5 — Workflow

The flow that needs guidance most and has the least today. The plan review is
what makes it work: a step list checked against installed providers before a
node is placed.

### 11.1 Step 1 — Idea

Heading "What should this workflow do?", subline "Describe the task. We'll plan
the steps and check what it needs before building." Inspiration chips:
"Summarize a PDF and email it", "Batch-generate product shots from a CSV",
"Turn a YouTube URL into a blog post". Alternatives:

- **Start from an example** — the examples browser inline. Picking one copies
  it, stage `done`, opens the canvas.
- **Import a workflow** (JSON, DSL `.ts`) — the existing import, stage `done`.
- **Start with a blank canvas** — stage `done`.

`Continue` writes the brief into `settings.setup` and stage `category`.

### 11.2 Step 2 — Plan

**Category cards.** Heading "What kind of workflow?". Cards: content pipeline,
media batch, data extraction, research agent, automation on a trigger, chat
app. Each biases the planner's node selection and sets the default run mode
for step 3. `Back`, `Plan the steps`.

**Plan.** `Plan the steps` runs the planner (`generate_text` with a structured
plan schema over the live node registry through `search_nodes`). The plan is
a list: inputs (name, type), steps (title, one sentence, the node type it
maps to, the model role it needs), outputs. For each provider or model role
the plan needs, the planner records whether it is configured. Stage `review`.

**Review.** `PlanReview` shows inputs, steps and outputs as a numbered list.
Steps can be edited, reordered, added and removed. A step whose node type is
unknown shows a red marker and a search field. A missing provider shows an
amber marker and a `Connect` button that opens provider onboarding inline.
`Re-plan` reruns the planner with the edited list. `Continue to setup` is
enabled when every step maps to a known node type and every needed provider
is configured. Stage `setup`.

### 11.3 Step 3 — Setup

Heading "Models and how it runs". One model tile row per model role the plan
needs (language, image, video, audio), from the configured providers. Run
mode as cards: `Run by hand`, `App with a form` (mini app), `On a trigger`
(schedule or webhook, from the triggers PRD). Sample inputs: one field per
plan input, prefilled by the planner, editable.

`Build your workflow` sets stage `done`, builds the graph through the node
tools in plan order (`ui_add_node`, `ui_connect_nodes`, `ui_update_node_data`),
runs `validate_workflow`, and if it passes runs the workflow once with the
sample inputs. The canvas opens as soon as the graph is placed. The test run
streams into the results panel.

### 11.4 Landing

The node editor with the agent panel open and a checklist at the top of the
panel: `Graph built`, `Validated`, `Test run` (with the outcome), and the run
mode's next step (`Save as app`, `Add a trigger`). A validation error or a
failed test run opens the agent panel with the error as the first message and
the checklist item marked, and the agent proposes the fix. Nothing is
auto-fixed without the creator's click.

### 11.5 Data model

```ts
// workflow.settings gains:
setup?: {
  stage: "idea" | "category" | "review" | "setup" | "done";
  brief: string;
  category?: string;
  plan?: {
    inputs: Array<{ name: string; type: string; sample?: unknown }>;
    steps: Array<{ id: string; title: string; summary: string; node_type: string | null; model_role?: string }>;
    outputs: Array<{ name: string; type: string }>;
  };
  run_mode?: "manual" | "app" | "trigger";
};
```

Nodes placed from a step carry the step id in their existing node metadata so
the plan can be shown beside the graph later. Reuse: `search_nodes`,
`validate_workflow`, the node tools, provider onboarding, the examples
browser, the mini app and triggers surfaces for the run mode's next step.

### 11.6 Headless parity

| Operation | Tool |
| --- | --- |
| Set brief, category, run mode, stage | new `ui_workflow_set_setup` |
| Plan or re-plan | new `ui_workflow_plan` |
| Edit a step | new `ui_workflow_update_plan_step` |
| Build from plan | new `ui_workflow_build_from_plan` (node tools in order, then `validate_workflow`) |
| Test run | existing run tools |

The planner and the builder are also reachable through `nodetool app build`'s
harness so a plan-to-graph case can be graded headlessly.

### 11.7 Acceptance criteria

1. The Workflow card opens the flow. Example and import open the canvas with
   stage `done`.
2. A workflow at each stage resumes at that step. A workflow without
   `settings.setup` opens as today.
3. `Plan the steps` places no node. Every step names a node type that exists
   in the registry or is marked unknown. Every needed provider is marked
   configured or missing.
4. `Continue to setup` is disabled while any step is unknown or any provider
   is missing.
5. `Build your workflow` produces a graph that passes `validate_workflow` for
   each shipped inspiration chip, asserted in a harness case. A failing
   validation lands in the agent panel with the error.
6. Every criterion also passes through the § 11.6 tools.

## 12. Cross-flow decisions

- **D17 — Five explicit cards, no inference.** Shape is chosen, never guessed,
  in this PRD. (Q4 tracks classification.)
- **D18 — One shell, four shared pieces, per-flow config.** § 6.3. A flow adds a
  plan generator and a generate action, not a wizard.
- **D19 — Stage on the produced document.** § 6.4. Every document type gets one
  optional field. No project-level wizard state.
- **D20 — E2 shares the Director and the prompt module with E1.** A beat is a
  direct-mode shot without a still. No second planner for video.
- **D21 — One style library.** E1 and E4 share the twelve `style` entities.
- **D22 — Video and Image are separate cards from Storyboard.** Beginners read
  "storyboard" and "video" as different outcomes.
- **D23 — E5 never places a node the plan cannot name.** Unknown types and
  missing providers block step 3, not the build.
- **D24 — Studio shows E1, E2 and E3.** Image and Workflow are workspace flows.

## 13. Phases

- **P1 — E1 contracts.** § 7.7 fields and defaults, Director schema with
  genre, scenes and lighting, ordering operations, `shot-prompt` wired into
  `useGenerateShot` and the headless render tools, render record,
  `isVersionStale`, `setStylePreset`, `duplicateShot`, § 7.10 tools. No UI.
- **P2 — Shell and E1 setup.** `SetupFlow`, the four shared pieces, entry
  cards (Storyboard live, the other four rendered disabled with their
  promise), stepper, genre grid, Direct with stage transitions, review, aspect
  and preset tiles, resume by stage, Studio extraction moved to `Continue`.
- **P3 — E1 board.** Scene headers, insert point, hover toolbar, entity chips,
  dialogue icon, footer actions, genre chip, `Change Style`, stale marker and
  banner, `Retry N failed`, batch reattachment, measured remaining time.
- **P4 — E1 Edit dialog.** Viewer, image-editor hand-off, version pager,
  takes, header row, table row with the linked-board rules, draft-then-save,
  upload. Remove the docked inspector's fields.
- **P5 — E1 imports and custom style.** Extraction route, `parseFdx`,
  `verifyImportedText`, CSV import with report and template, `Add your own
  style`.
- **P6 — E2 Video.** Format cards, beat planner and review, look step,
  generate-from-beats, timeline landing, `setup` on the sequence, § 8.6 tools.
- **P7 — E3 Script.** Format cards, writer and review, voice tiles,
  `parseSrt`, `setup` on the script, § 9.6 tools.
- **P8 — E4 Image.** Use-case cards, brief refinement, look step, contact
  sheet, `setup` on the sketch document, § 10.6 tools.
- **P9 — E5 Workflow.** Category cards, planner with registry and provider
  checks, review with markers, setup step, build and validate, landing
  checklist, `settings.setup`, § 11.6 tools, harness case.

P2 and P3 are independent after P1. P4 depends on P3. P6 depends on P1 (shared
Director and prompt module) and P2 (shell). P7, P8 and P9 depend on P2 only
and are independent of each other.

## 14. Risks

- **R1 — Director quality with scenes.** Asking for scenes and shots in one
  structured call may lower shot quality. Evaluate on the shipped example
  briefs before P2. Fall back to two calls.
- **R2 — Inspector removal.** Creators work in the docked inspector today. The
  dialog must reach parity before P4 removes fields.
- **R3 — Prompt change alters existing renders.** § 7.7.5 adds lens, angle and
  lighting to every still prompt, so a regenerate after P1 differs from
  before. Accepted. The render record makes the difference visible as stale.
- **R4 — Batch reattachment.** E1 criterion 18 and E2 criterion 6 depend on the
  generation stores reconciling by job id on open. If today's overlays only
  track in-memory jobs, P3 and P6 add the persisted pending-job list.
- **R5 — Asset size.** Genre art, style thumbnails, model sample clips and
  voice samples add to the image. Keep each under the example-board asset
  budget and check `npm run backend:smoke`. Model samples may be fetched on
  first use instead of shipped.
- **R6 — E5 planner accuracy.** A plan that names node types that exist but
  are wrong for the step builds a graph that validates and does nothing
  useful. The harness case in criterion 5 grades the test run's output, not
  only validation.
- **R7 — Five entry cards crowd the surface.** The New Project column is 860px.
  Cards render as one row of five at that width and wrap to two rows below it.
  The blank strip stays.

## 15. Open questions

- **Q4** — Classify a plain prompt into a shape and pre-select its card, or
  keep plain prompts on the project agent for good? Deferred to after P6.
- **Q5** — E5 plan review as editable text or reorderable step cards? The PRD
  says a numbered list with inline fields. Cards are closer to the canvas.
- **Q6** — E4: land on the contact sheet or straight in the editor with the
  variations as layers? The PRD says the contact sheet.
- **Q7** — E2 with dropped media and voiceover on: does the planner write
  voiceover for the dropped clips, or only for generated beats?

## Appendix A — Copy

Copy follows [BRAND.md § Lexicon](BRAND.md#5-lexicon): no billing terms, no
"users", name the mechanism.

| Where | Text |
| --- | --- |
| Entry cards | Storyboard · From a sentence to a rendered board in three steps. / Video · From a sentence to a cut on the timeline, no board. / Script · From a topic to voiced lines, ready to place. / Image · From a description to a picked variation in the editor. / Workflow · From a task to a running graph, with the plan reviewed first. |
| E1 step 1 | What's your story? · We'll turn it into a screenplay and storyboard. · One sentence is enough, or paste a full script. |
| E1 step 1 cards | Upload your file · PDF, DOCX, FDX / Import your shotlist · Download the template to get started / Start with a blank storyboard · Skip the story and go straight to the board |
| E1 step 2 | Choose your genre · Back · Review your screenplay · Re-direct · Continue to storyboard |
| E1 review notice (FDX) | Restored the dialogue of shots 3 and 7 to your script. |
| E1 step 3 | Choose your aspect ratio and art style · Set the look with a preset or your own references. You can change it later. · Generate your storyboard |
| E1 board | Edit · Iterate · Retry N failed · Style changed. N stills and M clips are stale. · Re-render stills |
| E1 dialog | Edit your shot · Save · Regenerate · Discard changes? · Save · Discard |
| E1 scanned PDF | No text found in this PDF. Paste the script, or upload a DOCX or FDX. |
| E2 | What's the video? · Choose your format · Plan the beats · Re-plan · Continue to look · Choose your look · Generate your video · cost unknown until the first clip returns |
| E3 | What's the script about? · Choose your format · Write the script · Rewrite · Continue to voices · Choose the voices · Voice your script |
| E4 | What image do you want? · What is it for? · Refine the brief · Re-refine · Continue to look · Choose the look · Generate your image · Pick · Make more variations |
| E5 | What should this workflow do? · What kind of workflow? · Plan the steps · Re-plan · Continue to setup · Models and how it runs · Build your workflow · Graph built · Validated · Test run |

## Appendix B — Reference to NodeTool map (E1)

| Reference element | Reuse | Build |
| --- | --- | --- |
| Prompt card, `@`, ref images | `NewProjectSurface` | Entry cards, inspiration chips, `Continue`, stage writes |
| Upload file | `pdfium` in `document-nodes`, `mammoth.extractRawText` | Extraction route, `parseFdx`, `verifyImportedText`, upload card |
| Import shotlist | — | `parseShotlistCsv`, report, template file |
| Blank storyboard | `createBlankStoryboard` | Stage `done` |
| Genre grid | — | `OptionCardGrid`, 14 art assets, `genre` field |
| Screenplay review | `useDirectScreenplay`, `setScreenplay` merge | `PlanReview`, `updateScene`, scenes in Director schema, stage transitions |
| Aspect ratio | `ASPECT_OPTIONS` | — |
| Style tiles | Entity library, `style` kind | 12 seeded entities, thumbnails, `PresetTileGrid`, `setStylePreset`, `Add your own style` |
| Board grid | Phase 0 grid, `ShotCard`, drag reorder | Ordering contract, scene headers, insert point, hover toolbar, chips, footer |
| Change Style | `setStyle`, `setEntityIds` | One operation, render record, `isVersionStale`, banner |
| Camera fields | `cameraOptions.ts`, `useGenerateShot` | `shot-prompt` module, `equipment`, lighting |
| Remaining time | `StoryboardGenerationStore` progress | Measured-duration record |
| Edit dialog | `ShotInspector` fields and duration toggle, `ShotTakesGallery`, `ShotScriptPanel`, image editor | Dialog shell, draft-then-save, viewer toolbar, table row, upload |
| Iterate | Revise take | — |
| Download, ZIP | `storyboardZip.ts`, export route | Per-shot download |
| 3D camera view | — | Out of scope |

## Appendix C — Flow map (E2–E5)

| Flow | Reuse | Build |
| --- | --- | --- |
| E2 Video | Director (direct mode), `shot-prompt`, `useTimelineDirectGenJob`, `ui_timeline_*`, timeline cost hooks, `STUDIO_CLIP_MODELS`, `STUDIO_VOICES`, media import | Format cards, beat planner and review, `setup` on the sequence, generate-from-beats, model sample tiles, four tools |
| E3 Script | Script schema, `ui_script_*`, `useVoiceCostEstimate`, derive storyboard, send to timeline, extraction route | Format cards, writer and review, voice tiles with samples, `parseSrt`, `setup` on the script, two tools |
| E4 Image | `layerWorkflowBinding` text-to-image, `layerVersion`, `ui_sketch_*`, style entities, sketch cost estimate | Use-case cards, brief refinement and review, size and model tiles, contact sheet, `setup` on the sketch document, two tools |
| E5 Workflow | `search_nodes`, `validate_workflow`, node tools, provider onboarding, examples browser, mini app, triggers | Category cards, planner with registry and provider checks, review with markers, setup step, build-from-plan, landing checklist, `settings.setup`, four tools, harness case |
