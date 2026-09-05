# PRD: Storyboard Flow — New Project to Board

**Author:** Matti Georgi
**Status:** Draft — revised after review (F1–F9 resolved)
**Reference UX:** storyboarder.ai (five screens: Idea, Genre, Aspect ratio and style, Board, Edit shot)
**Shipped plan this builds on:** [plans/project-view/PLAN.md](plans/project-view/PLAN.md) (Phases 0 and 4)
**Related:** [creative-agent.md](creative-agent.md), [agentic-video-product.md](agentic-video-product.md), [script-storyboard-link/prd.md](script-storyboard-link/prd.md)

---

## 1. Summary

Add an explicit Storyboard entry to the New Project surface that opens a
three-step guided flow, Idea → Story → Storyboard, and bring the board and the
shot editor to the reference's shape: scene-grouped shot cards with a hover
toolbar and an insert point between cards, a genre chip and a Change Style
button on the board, and a full-screen Edit Shot dialog with the still, its
versions, and one shot-table row (scene, shot, description, dialogue, run time,
size, perspective, movement, equipment, focal length, aspect ratio, notes).

Everything below the new chrome already exists: `NewProjectSurface`,
`StoryboardBoard`, `ShotCard`, `ShotInspector`, the Director call, per-shot
rendering, the entity library, the script link, ZIP export and Assemble. This
PRD adds a stepper, a persisted setup stage, scenes, a per-version render
record, prompt composition for the camera fields, a shipped set of style
presets, three import paths, and rearranges the shot editor. No new editor, no
new document type.

## 2. Reference UX, screen by screen

| # | Screen | What it does |
| --- | --- | --- |
| S1 | Idea | Stepper `1. Idea · 2. Story · 3. Storyboard`. Heading "What's your story?". Textarea "One sentence is enough, or paste a full script." Three inspiration chips. Right column: Upload your file (PDF, DOCX, FDX), Import your shotlist (CSV, with a template download), Start with blank storyboard, a tutorial card. `Continue`. |
| S2 | Story | "Choose Your Genre": 14 genre cards, one line each, background image. `Back`, `Review Your Screenplay`. A screenplay review follows before any image is rendered. |
| S3 | Storyboard | "Choose Your Aspect Ratio and Art Style": aspect dropdown (16:9), 12 style tiles with a sample image plus "Add Your Own Style". `Generate Your Storyboard`. |
| S4 | Board | Editable title, genre chip, `Change Style`. Three-column card grid. Card: still, video badge, "~1:17 remaining" while rendering, hover toolbar (drag, download, duplicate, delete), fullscreen. Caption `Scene: 1 \| Shot: 1`, action text with character names rendered as chips, dialogue indicator. Footer `Edit · Iterate · regenerate · upload`. A `+` between cards inserts a shot. |
| S5 | Edit shot | Full-screen dialog. Left: still with an image toolbar (pan, flip, zoom, palette, brush, eraser) and a version pager `1 / 1`. Right: 3D camera blocking view. Below: `SCENE 1: INT. …` slugline dropdown and a lighting note, then one table row with the shot's fields. `Save`, `Retry`. |

Header items in the reference that are billing (free-project banner, Unlock
buttons, Video Count toggle) are not part of this flow. See § 4.3.

## 3. Current state

| Reference | NodeTool today | Where |
| --- | --- | --- |
| S1 prompt card | Prompt textarea with `/` skill and `@` mention completion, ref-image chip, entity chip, model chip, starter pills. One `Start` that posts the prompt to the project agent. Blank-document grid at the foot, with a storyboards submenu (blank, shipped examples). | `web/src/components/projects/NewProjectSurface.tsx` (`handleStart`), `projectStarters.ts` |
| S1 in Studio | One card "What is the video about?", `Make it`, two blank buttons. Direct, then extract a linked script, then open the board. | `web/src/studio/StudioHome.tsx`, `useStudioPromptStart.ts` |
| S2 genre | None. Director takes brief and style only. | `hooks/storyboard/useDirectScreenplay.ts` |
| S2 screenplay review | None. Direct writes shots straight onto the board; stills render on a separate button. `setScreenplay` also copies the Director's `style_bible` into `board.style`. | `stores/storyboard/StoryboardStore.ts` `setScreenplay` |
| S3 aspect ratio | Select with five values in Board settings. | `StoryboardBoard.tsx` `ASPECT_OPTIONS` |
| S3 style tiles | Free-text `Style` field plus library entities of kind `style`. No shipped presets, no thumbnails. | `StoryboardEntitiesField.tsx`, `packages/protocol/src/creative.ts` `EntityKind` |
| S4 grid | Four-column card grid, flat order by `shot.index`, no scenes. Card shows still or clip, `SH NN · Ns`, status pill, progress bar, clamped action, Retry on failure. Cards are draggable. | `ShotCard.tsx`, `ShotStatusPill.tsx`, store `reorderShots` |
| S4 hover toolbar, insert, duplicate, upload | Add shot (appends), Delete shot in the inspector, no duplicate, no per-shot download, no upload of an own still. | `ShotInspector.tsx` |
| S4 entity chips in text | Entity refs exist in the protocol and `applyEntities`, but the card renders plain text. | `creative.ts` `entity_ref` |
| S5 dialog | Inspector docked under the grid: title, description, framing, lens, angle, movement, length with the `from takes` / `pinned` toggle, cost, entity chips, takes gallery, script panel, Revise take, Generate still, Render clip. | `ShotInspector.tsx`, `ShotTakesGallery.tsx`, `cameraOptions.ts` |
| S5 image toolbar | Separate image editor at `/assets/edit/:assetId`; not reachable from the shot. | `docs/image-editor.md` |
| Prompt composition | Still prompt = action, framing, board style. Clip prompt = motion, action. Direct clip = action, framing, motion, style. Lens, angle and movement are stored but never reach a prompt. | `hooks/storyboard/useGenerateShot.ts` `keyframePrompt`, `clipPrompt`, `directClipPrompt` |
| Versions | `keyframe_versions` and `clip_versions` are bare media refs. Nothing records what a version was rendered from. | `creative.ts` `Shot` |
| Export | Download ZIP (`storyboard.md`, `stills/`, `clips/`), Preview, Assemble timeline (sorts by `shot.index`). | `utils/storyboardZip.ts`, `packages/timeline/src/storyboard.ts` |
| Agent tools | 14 `ui_storyboard_*` tools. Each takes a `storyboard_id` and delegates to the handler the open `StoryboardSurface` registers on `storyboardAgentBridge`; with no open surface the getter throws. | `web/src/lib/tools/builtin/storyboard.ts` |
| Document text | PDF text extraction (`pdfium`) lives in `packages/document-nodes`; DOCX extraction is `extractRawText` in the agents mammoth host module. Both are server side. Nothing in `web/` reads either format. | `packages/document-nodes`, `packages/agents/src/host-modules/mammoth.ts` |

## 4. Scope

### 4.1 In scope

1. An explicit Storyboard entry on the New Project surface and Studio home that
   opens the three-step setup flow (S1–S3).
2. A persisted setup stage on the board that the flow resumes from.
3. Genre on the board, fed to the Director and shown on the board.
4. Screenplay review between Direct and the first render.
5. Scenes: sluglines and lighting, a scene on each shot, one ordering contract,
   scene headers in the grid.
6. Prompt composition for every camera field and scene lighting, for stills
   and for clips.
7. Per-version render record and derived staleness.
8. Twelve shipped style presets with thumbnails, "Add your own style" from
   reference images, `Change Style` as one undoable operation.
9. Board card changes: hover toolbar (drag, download, duplicate, delete),
   insert between cards, `Scene N | Shot N`, entity names as chips, dialogue
   indicator, footer `Edit · Iterate · Regenerate · Upload`, remaining-time
   estimate when measured.
10. Edit Shot dialog replacing the docked inspector, with draft-then-save
    semantics.
11. Imports: script file (PDF, DOCX, FDX) through a server extraction route,
    shotlist CSV with a template and an import report, blank board.
12. Headless parity: every document operation the flow performs is a
    `ui_storyboard_*` tool, and the setup hosts register the agent bridge.

### 4.2 Out of scope

- 3D camera blocking view (S5 right panel). Candidate for a later slice on
  `packages/model3d`.
- In-dialog painting. Brush, palette and eraser open the existing image editor
  on the still; the result comes back as a new version.
- PDF or share-link export. ZIP stays.
- Changes to the Director prompt beyond genre, scenes and lighting; changes to
  Assemble, the timeline, or the script editor.
- Inferring the flow from a plain prompt. A plain prompt on the New Project
  surface keeps going to the project agent. Shape selection across
  storyboard, video, script, image and workflow is a separate proposal.
- Mobile and Electron chrome.

### 4.3 Non-goals

- No plan gating or upsell chrome in the flow. Studio's account page owns plan
  state; the flow never shows a remaining-projects banner.
- No second board component. `StoryboardBoard` gains scene headers and card
  affordances; the Studio page and the workspace tab keep hosting it.
- No change to what `Start` does on the New Project surface. The flow is
  reached only through the explicit Storyboard entry (§ 6.0).

## 5. Users and entry orders

| Entry | Who | Path |
| --- | --- | --- |
| One sentence | Studio beginner, workspace creator | S1 → S2 → S3 → board |
| Full script pasted or uploaded | Writer with copy | S1 (parsed) → S2 genre → review → S3 → board |
| Shotlist CSV | Director with a shot plan | S1 → S3 → board, Story step skipped |
| Blank | Anyone | S1 → empty board, stage `done` |
| Skill or plain prompt | Returning creator | `Start`, unchanged, never enters the flow |

## 6. The flow

### 6.0 Entry

New Project surface: a `Storyboard` card sits beside the prompt card, with the
one-line promise "From a sentence to a rendered board in three steps." Clicking
it creates the project row and an empty board with `setupStage: "idea"`, and
renders the stepper in the same tab. The blank-document strip's `Storyboard ▸`
submenu keeps `Blank storyboard` (stage `done`) and the examples.

Studio home: the "Make a video" card becomes this entry. The Studio card's
prompt textarea is step 1's textarea.

Any board whose `setupStage` is not `done` opens in the flow at that stage,
whether opened from the tab bar, the projects list, the sidebar or a URL.
Boards saved before this PRD carry no stage and read as `done`.

### 6.1 Step 1 — Idea

Stepper across the top, `1. Idea` active. Heading "What's your story?",
subline "We'll turn it into a screenplay and storyboard." Three inspiration
chips seeded from the shipped example boards' loglines; one click fills the
textarea. The prompt card keeps `@` mentions, ref images and entities. `/`
skill completion is off inside the flow. Placeholder: "One sentence is enough,
or paste a full script."

Right column, three option cards and one tutorial card:

- **Upload your file** (PDF, DOCX, FDX). See § 8 for the extraction path and
  the error contract. The text lands in the textarea; FDX also yields typed
  scenes and dialogue that step 2 uses verbatim.
- **Import your shotlist** (CSV). "Download template" serves a static file.
  Import creates scenes and shots, sets `setupStage: "look"`, and advances to
  step 3. See § 8.3.
- **Start with blank storyboard** — sets `setupStage: "done"` and opens the
  board.
- **Tutorial** — the existing tutorials entry.

`Continue` writes `brief` and `setupStage: "genre"`.

### 6.2 Step 2 — Story

**Genre.** Heading "Choose your genre", subline "Tone, pacing and framing follow
your choice. You can change it later." Fourteen cards, two lines each: Action,
Animation, Comedy, Commercial, Documentary, Drama, Educational, Fantasy, Horror,
Music Video, Mystery, Romance, Science Fiction, Thriller. Card art is one
shipped `package://` still per genre. Picking a card writes `genre` on the
board. `Back`, `Review your screenplay`.

**Direct.** `Review your screenplay` runs the Director with brief, genre and
(when present) the parsed script. On success the store applies the screenplay
and sets `setupStage: "review"`. On failure the stage stays `genre` and the
error shows on the button. Closing the tab mid-call loses the in-flight result
only; rerunning is the recovery.

**Review.** The screenplay as text: title, logline, then each scene as a
slugline header with its lighting note, and the shots beneath as action lines
with dialogue. Every field is editable inline and writes through the store
(`updateShot`, `updateScene`); the document is the draft, since nothing else
writes it during review. `Re-direct` sends the current screenplay back to the
Director as context and applies the revision through `setScreenplay`, which
already merges by shot id and keeps media. Shots the revision drops are
removed; new ones are appended. `Back` returns to genre and keeps the
screenplay. `Continue to storyboard` sets `setupStage: "look"`.

**Imported scripts.** An FDX yields typed paragraphs, so scenes and dialogue
are built deterministically by the parser: one scene per `Scene Heading`, one
shot per `Action` paragraph or dialogue block, `dialogue` set from the
`Character` and `Dialogue` paragraphs verbatim. The Director is asked only for
camera, motion and duration per shot and may not alter `dialogue` or scene
order; a post-check (`verifyImportedText`) compares the returned dialogue and
scene sequence against the parse and restores the parsed values where they
differ, with a review-step notice naming the shots it corrected. PDF and DOCX
yield plain text, so the Director structures it and the same post-check flags,
rather than restores, any line of the source that no shot's dialogue or action
contains.

**Script link in Studio.** Studio's automatic linked-script extraction stays.
It moves from "after Direct" to `Continue to storyboard`, so the script is
extracted from the reviewed screenplay, not the raw one. The workspace flow
does not extract automatically; `Extract script` on the board is unchanged.

### 6.3 Step 3 — Storyboard

Heading "Choose your aspect ratio and art style", subline "Set the look with a
preset or your own references. You can change it later."

Aspect ratio: the existing five options, `16:9` default.

Style: a tile grid of the twelve shipped presets plus `Add your own style`.
Presets: Comic, Cinematic, Soft Pencil, Animation 3D, Watercolor Paint, Photo /
Commercial, Charcoal Sketch, Dark Anime, Flat / Vector, Noir, Stick Figure,
Graphic Novel. Each is a shipped library entity of kind `style` with a
descriptor and one thumbnail asset. Picking a tile runs `setStylePreset`
(§ 7.5). `Add your own style` takes one to three reference images, asks the
language model for a descriptor, saves a user style entity with the first image
as its thumbnail, then applies it like a preset.

`Generate your storyboard` sets `setupStage: "done"`, enqueues a still for
every shot through the existing batch path with its cost estimate, and opens
the board immediately with the cards rendering. The step is not complete
because `board.style` is non-empty: `setScreenplay` copies the Director's
`style_bible` into `style` during step 2. The stage is the only completion
signal.

### 6.4 Board

Header: editable title, genre chip beside it (opens the genre grid as a
popover), `Change Style` at the right of the toolbar. Existing actions stay.

Grid: the shipped four-column grid, grouped under scene headers per the
ordering contract in § 7.3. A `+` appears between two cards on hover and runs
`insertShot(afterShotId)`, placing a planned shot in that scene at that
position. Drag-to-reorder within and across scenes runs `moveShot` with the
target scene and position.

Card:

- Still or clip, fullscreen icon, status pill and progress bar as shipped.
- While rendering, "~M:SS remaining" when the generation store has a measured
  duration for the same model and kind from an earlier job in this browser
  session or the persisted duration table. Otherwise the progress bar alone.
- Hover toolbar on the still: drag handle, download (still or clip), duplicate
  (§ 7.6), delete (confirm once).
- Caption `Scene N | Shot N` per § 7.3. Action text with entity names rendered
  as chips through the existing entity-ref parsing. A dialogue icon, filled
  when `dialogue` is non-empty, opens the Edit dialog on the dialogue cell.
- A `stale` marker on the pill when the selected version's render record
  differs from the current inputs (§ 7.4).
- Footer: `Edit` (dialog), `Iterate` (today's Revise take), regenerate icon
  (new still from the saved fields), upload icon (own image as a new keyframe
  version, selected on upload).

Toolbar during and after a batch: `Retry N failed` appears while any shot's
last job failed and retries each with its saved fields. A banner "Style
changed. N stills and M clips are stale. Re-render stills" appears when § 7.4
finds stale versions; clicking renders stills only, clips stay stale until
`Render clips`.

Batch jobs are server jobs. A board closed mid-batch reattaches on open: the
generation store reconciles each shot's pending job by id and lands completed
assets as versions, the same path the queue overlay uses today.

### 6.5 Edit Shot dialog

Full-screen dialog, `Edit your shot`. Replaces the docked inspector. The
selection footer from Phase 0 keeps only `Edit`, `Iterate`, `Regenerate`,
`Delete`.

- **Left.** Still or clip viewer with pan, flip horizontal, zoom in, zoom out,
  `Open in image editor`. Flip and image-editor edits each add a version, never
  overwrite. Version pager `k / n`.
- **Right.** The existing takes gallery: every version, select or delete.
- **Header row.** `SCENE N:` slugline as a dropdown that runs `moveShot` to the
  end of the chosen scene; the scene's lighting note, editable.
- **Table row.** Scene, Shot, Description, Dialogue, ERT, Size, Perspective,
  Movement, Equipment, Focal length, Aspect ratio, Notes. Field mapping in
  § 7.2. Aspect ratio is the board's value, read-only, linking to Board
  settings. Notes is `Add +` until set.
- **Dialogue on a linked board.** Read-only, showing the linked lines with
  speaker; `Edit in script` opens the script at the first line. The script
  owns words. On an unlinked board the cell is a textarea.
- **ERT on a linked board.** Shows the value with the existing `from takes` /
  `pinned` chip. Typing a value pins it (`duration_source: "manual"`); the
  chip toggles back to `audio`, which restores the takes' duration. On an
  unlinked board it is a plain number.
- **Script panel** for a linked board stays below the table.
- **Footer.** `Save`, `Regenerate`, and the overflow items that exist today.

Save semantics: the table row and the header row are a draft. `Save` commits
the draft as one store update and one undo step. `Regenerate` saves first, then
renders from the saved fields. Closing with unsaved changes asks "Discard
changes?" with `Save` and `Discard`. Version selection, deletion, flip and
upload are not draft state; they commit immediately, as they do today.

Keyboard: `Esc` closes (with the confirm above when dirty), `←`/`→` step
versions, `Cmd/Ctrl+S` saves.

## 7. Data model and contracts

Additive only. Every storyboard schema is `passthrough`, so old documents load
unchanged; § 7.7 states each default.

### 7.1 Board, screenplay, scene

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
scenes?: Scene[];     // authoritative list; order derived, see 7.3
```

Genre lives on the board because it is chosen before a screenplay exists. The
Director schema (`buildScreenplaySchema`) gains `genre` as input and `scenes`
plus per-shot `scene_id` as output. Aliases: `sceneId → scene_id`,
`setupStage`, `genre` pass through unchanged.

### 7.2 Shot

```ts
// Shot gains:
scene_id?: string;
// camera gains:
equipment?: string;
// each entry of keyframe_versions / clip_versions gains (on the ref, passthrough):
render_inputs?: RenderInputs;   // see 7.4
```

Equipment vocabulary in `cameraOptions.ts`: handheld, tripod, steadicam,
gimbal, dolly, slider, crane, drone.

Table column → field: Description → `action`; Dialogue → `dialogue`; ERT →
`duration_seconds` with `duration_source`; Size → `camera.framing`;
Perspective → `camera.angle`; Movement → `camera.movement`; Equipment →
`camera.equipment`; Focal length → `camera.lens`; Notes → `notes`.

### 7.3 Ordering contract

- `shot.index` is the one global order: contiguous `0..n-1`, rewritten by every
  structural operation, read by Assemble and by export. Nothing else orders
  shots.
- A scene is the set of shots sharing its `scene_id`. Invariant: those shots
  are contiguous in `shot.index`. Scene order is derived from the index of each
  scene's first shot; `Scene` carries no index of its own. A scene with no
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
- CSV: `scene` groups rows; `shot` is the sort key within a scene (numeric
  ascending, non-numeric or missing values keep row order after the numeric
  ones). Rows are then assigned `shot.index` in scene order. The displayed
  shot number is recomputed, never taken from the column.

### 7.4 Render record and staleness

```ts
export interface RenderInputs {
  kind: "keyframe" | "clip";
  prompt_hash: string;   // sha-256 of the composed prompt (7.5)
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
from the inputs the same shot would use now; the comparison is pure
(`isVersionStale(shot, board)`) and derived at render time, never persisted as
a flag. Versions without a record (legacy, upload, flip, image-editor edit)
are never stale. A keyframe-mode clip is also stale when its
`source_version_id` is not the selected keyframe.

### 7.5 Prompt composition

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
characters, locations and props are untouched; a per-shot exclusion of a style
entity is removed, since styles apply board-wide. Nothing renders. Staleness
follows from § 7.4.

### 7.6 Duplicate

`duplicateShot(shotId)` inserts the copy directly after the source in the same
scene, copies `action`, `camera`, `motion`, `dialogue`, `notes`,
`duration_seconds`, entity lists, versions and selections. It drops
`script_line_ids`, `script_text_snapshot` and `covered_by`, sets
`duration_source: "manual"`, and gives the copy a new id and `status` equal to
the source's.

### 7.7 Defaults for existing documents

| Field | Missing value reads as |
| --- | --- |
| `setupStage` | `"done"` |
| `genre` | `""` |
| `screenplay.scenes` | none; shots render under the implicit header (7.3) |
| `shot.scene_id` | unscened |
| `camera.equipment` | unset, omitted from prompts |
| `render_inputs` | never stale |

### 7.8 Shotlist CSV

Columns, header row required, order free:

```
scene, shot, description, dialogue, duration_seconds, size, perspective, movement, equipment, focal_length, notes
```

`scene` and `description` are required; a file missing either header is
refused with the missing names. Parsing is RFC 4180 through a real CSV parser:
quoted fields, embedded commas, multiline dialogue. A `scene` value that starts
with `INT.`, `EXT.` or `INT./EXT.` becomes the slugline; otherwise the scene is
named `Scene N`. Vocabulary columns match the option lists
case-insensitively; a non-match leaves the field unset. `duration_seconds`
must be a positive number; otherwise unset. Every discarded value is listed in
the import report (row, column, value) shown after import, so the creator can
fix it in the dialog. A row with an empty `description` is skipped and
reported.

### 7.9 Style presets

Shipped as system entities of kind `style`, one row each, read-only,
thumbnails under a `package://` path, seeded the way example boards are.
`Add your own style` always creates a user-owned copy; a preset's descriptor
never changes under a user.

## 8. Imports

### 8.1 Extraction route

`POST /api/documents/extract-text` (multipart, one file, size-capped) in
`packages/websocket`. Dispatches by content type: PDF through the `pdfium`
extraction `packages/document-nodes` already uses, DOCX through
`extractRawText` in `packages/agents/src/host-modules/mammoth.ts`. Returns
`{ text, pages? }`. FDX is XML and is parsed in the browser by `parseFdx`
(pure), no round trip.

### 8.2 Error contract

| Case | Behavior |
| --- | --- |
| PDF with no extractable text (scanned) | Nothing written. Notice: "No text found in this PDF. Paste the script, or upload a DOCX or FDX." |
| Malformed or unsupported file | Nothing written. Notice names the accepted types. |
| Extraction over the size cap | Refused before upload with the cap. |
| FDX without a `Scene Heading` | Imported as one scene named `Scene 1`. |

### 8.3 CSV

Contract in § 7.8. A refused file writes nothing. A partially discarded file
imports the rest and shows the report.

## 9. Decisions

- **D1 — One setup component, two hosts.** `StoryboardSetupFlow` renders
  inside the New Project tab and Studio home. The board's `setupStage` and
  fields are the flow's state; there is no wizard store.
- **D2 — Explicit entry only.** The flow starts from the Storyboard card or the
  Studio "Make a video" card. A plain or `/skill` prompt on the New Project
  surface keeps going to the project agent. (Resolves F1.)
- **D3 — Persisted stage, not inferred state.** `setupStage` decides where a
  board opens. No field value (shots, style, genre) is read as progress.
  (Resolves F2.)
- **D4 — Review before pixels.** The Director runs at the end of step 2 and its
  output is shown as text; no still renders before step 3's button.
- **D5 — Scenes on the screenplay, one global order.** § 7.3. Assemble, the
  script link and the timeline keep reading `shot.index`. (Resolves F4.)
- **D6 — Style preset = style entity, applied by one operation.** § 7.5. No
  `stylePreset` field. (Resolves F6.)
- **D7 — Staleness is derived from a per-version render record.** § 7.4. No
  stale flag is stored. (Resolves F6.)
- **D8 — Camera fields reach the prompt or they do not ship.** § 7.5 is in
  scope for P1; the dialog's fields are not rearranged before their prompt
  effect exists. (Resolves F5.)
- **D9 — The script owns words.** On a linked board dialogue is read-only in
  the board and edited in the script; duration follows takes unless pinned,
  through the existing toggle. Studio still extracts a linked script, now at
  `Continue to storyboard`. (Resolves F3, Q1.)
- **D10 — Imported dialogue is deterministic.** FDX dialogue and scene order
  come from the parser, the Director fills camera and motion, and a post-check
  restores any drift. (Resolves F3.)
- **D11 — Edit dialog replaces the docked inspector, draft-then-save.** § 6.5.
  (Resolves F8.)
- **D12 — Style change never renders.** Stills and clips are marked stale;
  stills re-render from the banner, clips from `Render clips`. (Resolves Q2.)
- **D13 — Duplicate drops script links.** § 7.6, in every case. (Resolves Q3.)
- **D14 — Remaining time only when measured.** Same rule as the spend estimate.
- **D15 — Paint tools open the image editor.** No second raster editor.
- **D16 — Extraction is a server route.** § 8.1. The browser never bundles
  `pdfium` or `mammoth`. (Resolves F7.)

## 10. Headless parity

Parity means: every document operation the UI performs has a tool that performs
the same store operation with the same outcome, and the acceptance criteria in
§ 11 hold when driven through tools. The setup hosts (`StoryboardSetupFlow` in
both hosts) register the board on `storyboardAgentBridge` exactly as
`StoryboardSurface` does, so the tools work during setup.

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
tests on the store and hooks, not on the parsers. The
`script-storyboard-link` harness entry gains the new pure suites so
`harness gate` runs them on a diff touching the flow.

## 11. Acceptance criteria

1. The Storyboard card and the Studio card open the flow. A plain prompt and a
   `/skill` prompt on the New Project surface never do.
2. A board at each `setupStage` value, closed and reopened from the tab bar,
   the projects list and a URL, resumes at that step with its values. A board
   without the field opens as today.
3. Genre appears in the Director prompt (asserted in the hook's test) and as a
   chip on the board.
4. The review step renders the directed screenplay as text with no render job
   started; a shot edited there is the shot that renders in step 3. Re-direct
   keeps the ids and media of shots the revision retains.
5. An FDX import's dialogue lines and scene order appear in the review verbatim
   and in order, asserted against the fixture; a Director response that
   changes one is restored and the shot is named in the notice.
6. Studio extracts the linked script at `Continue to storyboard`, from the
   reviewed screenplay.
7. Each preset sets `style` and exactly one `style` entity id in one undo step.
   `Change Style` marks affected stills and clips stale and renders nothing.
8. A version rendered before a style change and landing after it reads stale
   on landing.
9. After every ordering operation `shot.index` is contiguous and each scene's
   shots are contiguous; `Scene N | Shot N` matches the derived numbering;
   Assemble's clip order equals `shot.index`.
10. Each field marked yes in § 7.5 appears in the composed prompt for that mode
    and is absent otherwise, in the UI path and the headless path.
11. Hover toolbar: download saves the still or clip; duplicate inserts after
    the source with script links dropped and `duration_source: "manual"`;
    delete asks once.
12. Entity names in a card's action render as chips; a shot with dialogue shows
    the filled icon.
13. "~M:SS remaining" appears only when a duration was measured for that model
    and kind.
14. The Edit dialog edits every field in § 7.2; `Save` is one undo step;
    closing dirty asks; `Regenerate` renders from saved values. Dialogue is
    read-only on a linked board and the ERT chip toggles `duration_source`.
15. Flip, image-editor edits and uploads each add a version, never overwrite;
    upload selects the new version.
16. PDF, DOCX and FDX uploads land as text through the extraction route; a
    scanned PDF and a malformed file write nothing and show the § 8.2 notice.
17. A CSV missing `scene` or `description` is refused naming the header; a
    multiline quoted dialogue cell imports intact; an invalid duration and an
    unknown vocabulary value import with the field unset and appear in the
    report.
18. A board closed during a batch shows the landed versions on reopen; failed
    shots show Retry and `Retry N failed` retries only those.
19. Every criterion above that is a document operation also passes when driven
    through the § 10 tools during setup and on the board.
20. `npm run test:affected`, `npm run typecheck`, `npm run lint` and
    `harness gate --base origin/main` pass. No raw MUI, tokens only, media
    through `ResponsiveImage` / `VideoPlayer` with `locator`.

## 12. Phases

- **P1 — Contracts.** § 7.1–7.7 fields and defaults, Director schema with
  genre, scenes and lighting, ordering operations in the store, `shot-prompt`
  module wired into `useGenerateShot` and the headless render tools, render
  record on enqueue and land, `isVersionStale`, `setStylePreset`,
  `duplicateShot`, tool additions in § 10. No UI change. Ships alone; the
  board already benefits from prompt composition.
- **P2 — Setup flow.** Entry cards, stepper, inspiration chips, genre grid,
  Direct with stage transitions, review view, aspect select, preset tiles from
  seeded entities, resume by stage, Studio extraction moved to `Continue`.
- **P3 — Board.** Scene headers, insert point, hover toolbar, entity chips,
  dialogue icon, footer actions, genre chip, `Change Style`, stale marker and
  banner, `Retry N failed`, batch reattachment, measured remaining time.
- **P4 — Edit dialog.** Viewer, image-editor hand-off, version pager, takes,
  header row, table row with the linked-board rules, draft-then-save, upload.
  Remove the docked inspector's fields.
- **P5 — Imports and custom style.** Extraction route, `parseFdx`,
  `verifyImportedText`, CSV import with report and template, `Add your own
  style`.

P2 and P3 are independent after P1. P4 depends on P3's card footer.

## 13. Risks

- **R1 — Director quality with scenes.** Asking for scenes and shots in one
  structured call may lower shot quality. Evaluate on the shipped example
  briefs before P2; fall back to two calls (scenes, then shots per scene).
- **R2 — Inspector removal.** Creators work in the docked inspector today. The
  dialog must reach parity (script panel, cost line, entity chips, duration
  toggle) before P4 removes fields.
- **R3 — Prompt change alters existing renders.** § 7.5 adds lens, angle and
  lighting to every still prompt, so a regenerate after P1 differs from before.
  Acceptable; the render record makes the difference visible as stale.
- **R4 — Batch reattachment.** Criterion 18 depends on the generation store
  reconciling by job id on open. If today's overlay only tracks in-memory
  jobs, P3 adds the persisted pending-job list.
- **R5 — Asset size.** Twenty-six shipped stills add to the image. Keep each
  under the example-board asset budget and check `npm run backend:smoke`.

## Appendix A — Copy

Copy follows [BRAND.md § Lexicon](BRAND.md#5-lexicon): no billing terms, no
"users", name the mechanism.

| Where | Text |
| --- | --- |
| Entry card | Storyboard · From a sentence to a rendered board in three steps. |
| Step 1 heading | What's your story? |
| Step 1 subline | We'll turn it into a screenplay and storyboard. |
| Step 1 placeholder | One sentence is enough, or paste a full script. |
| Step 1 cards | Upload your file · PDF, DOCX, FDX / Import your shotlist · Download the template to get started / Start with a blank storyboard · Skip the story and go straight to the board |
| Step 2 heading | Choose your genre |
| Step 2 buttons | Back · Review your screenplay |
| Review buttons | Back · Re-direct · Continue to storyboard |
| Review notice (FDX) | Restored the dialogue of shots 3 and 7 to your script. |
| Step 3 heading | Choose your aspect ratio and art style |
| Step 3 subline | Set the look with a preset or your own references. You can change it later. |
| Step 3 button | Generate your storyboard |
| Card footer | Edit · Iterate |
| Dialog title | Edit your shot |
| Dialog footer | Save · Regenerate |
| Dirty close | Discard changes? · Save · Discard |
| Stale banner | Style changed. N stills and M clips are stale. · Re-render stills |
| Batch toolbar | Retry N failed |
| Scanned PDF | No text found in this PDF. Paste the script, or upload a DOCX or FDX. |

## Appendix B — Reference to NodeTool map

| Reference element | Reuse | Build |
| --- | --- | --- |
| Prompt card, `@`, ref images | `NewProjectSurface` | Storyboard entry card, inspiration chips, `Continue`, stage writes |
| Upload file | `pdfium` in `document-nodes`, `mammoth.extractRawText` | Extraction route, `parseFdx`, `verifyImportedText`, upload card |
| Import shotlist | — | `parseShotlistCsv`, report, template file |
| Blank storyboard | `createBlankStoryboard` | Stage `done` |
| Genre grid | — | Grid, 14 art assets, `genre` field |
| Screenplay review | `useDirectScreenplay`, `setScreenplay` merge | Text view, `updateScene`, scenes in Director schema, stage transitions |
| Aspect ratio | `ASPECT_OPTIONS` | — |
| Style tiles | Entity library, `style` kind | 12 seeded entities, thumbnails, tile grid, `setStylePreset`, `Add your own style` |
| Board grid | Phase 0 grid, `ShotCard`, drag reorder | Ordering contract, scene headers, insert point, hover toolbar, chips, footer |
| Change Style | `setStyle`, `setEntityIds` | One operation, render record, `isVersionStale`, banner |
| Camera fields | `cameraOptions.ts`, `useGenerateShot` | `shot-prompt` module, `equipment`, lighting |
| Remaining time | `StoryboardGenerationStore` progress | Measured-duration record |
| Edit dialog | `ShotInspector` fields and duration toggle, `ShotTakesGallery`, `ShotScriptPanel`, image editor | Dialog shell, draft-then-save, viewer toolbar, table row, upload |
| Iterate | Revise take | — |
| Download, ZIP | `storyboardZip.ts`, export route | Per-shot download |
| 3D camera view | — | Out of scope |
