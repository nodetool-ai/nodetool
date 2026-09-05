# PRD: Storyboard Flow — New Project to Board

**Author:** Matti Georgi
**Status:** Draft — for review
**Reference UX:** storyboarder.ai (five screens: Idea, Genre, Aspect ratio and style, Board, Edit shot)
**Shipped plan this builds on:** [plans/project-view/PLAN.md](plans/project-view/PLAN.md) (Phases 0 and 4)
**Related:** [creative-agent.md](creative-agent.md), [agentic-video-product.md](agentic-video-product.md), [script-storyboard-link/prd.md](script-storyboard-link/prd.md)

---

## 1. Summary

Turn the storyboard path of the New Project surface into a three-step guided
flow, Idea → Story → Storyboard, and bring the board and the shot editor to the
reference's shape: scene-grouped shot cards with a hover toolbar and an insert
point between cards, a genre chip and a Change Style button on the board, and a
full-screen Edit Shot dialog with the still, its versions, and one shot-table
row (scene, shot, description, dialogue, run time, size, perspective, movement,
equipment, focal length, aspect ratio, notes).

Everything below the new chrome already exists: `NewProjectSurface`,
`StoryboardBoard`, `ShotCard`, `ShotInspector`, the Director call, per-shot
rendering, the entity library, the script link, ZIP export and Assemble. This
PRD adds a stepper, five schema fields, a shipped set of style presets, three
import paths, and rearranges the shot editor. No new editor, no new document
type.

## 2. Reference UX, screen by screen

What the reference does, stated once so the rest of the document can point at
it.

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
| S1 prompt card | Prompt textarea with `/` skill and `@` mention completion, ref-image chip, entity chip, model chip, starter pills. One `Start`. Blank-document grid at the foot, with a storyboards submenu (blank, shipped examples). | `web/src/components/projects/NewProjectSurface.tsx`, `projectStarters.ts` |
| S1 in Studio | One card "What is the video about?", `Make it`, two blank buttons. Direct then extract-script, then open the board. | `web/src/studio/StudioHome.tsx`, `useStudioPromptStart.ts` |
| S2 genre | None. Director takes brief and style only. | `hooks/storyboard/useDirectScreenplay.ts` |
| S2 screenplay review | None. Direct writes shots straight onto the board; stills render on a separate button, so the pause exists but has no text view. | `StoryboardBoard.tsx` Board settings panel |
| S3 aspect ratio | Select with five values in Board settings. | `StoryboardBoard.tsx` `ASPECT_OPTIONS` |
| S3 style tiles | Free-text `Style` field plus library entities of kind `style`. No shipped presets, no thumbnails. | `StoryboardEntitiesField.tsx`, `packages/protocol/src/creative.ts` `EntityKind` |
| S4 grid | Four-column card grid, flat shot order, no scenes. Card shows still or clip, `SH NN · Ns`, status pill, progress bar, clamped action, Retry on failure. Cards are draggable. | `ShotCard.tsx`, `ShotStatusPill.tsx` |
| S4 hover toolbar, insert, duplicate, upload | Add shot (appends), Delete shot in the inspector, no duplicate, no per-shot download, no upload of an own still. | `ShotInspector.tsx` |
| S4 entity chips in text | Entity refs exist in the protocol and `applyEntities`, but the card renders plain text. | `creative.ts` `entity_ref` |
| S5 dialog | Inspector docked under the grid: title, description, framing, lens, angle, movement, length, cost, entity chips, takes gallery, script panel, Revise take, Generate still, Render clip. | `ShotInspector.tsx`, `ShotTakesGallery.tsx`, `cameraOptions.ts` |
| S5 image toolbar | Separate image editor at `/assets/edit/:assetId`; not reachable from the shot. | `docs/image-editor.md` |
| S5 fields not exposed | `dialogue`, `narration`, `notes`, `render_mode` are schema fields written only by agent tools. | `creative.ts` `Shot` |
| Export | Download ZIP (`storyboard.md`, `stills/`, `clips/`), Preview, Assemble timeline. | `utils/storyboardZip.ts`, `packages/websocket/src/routes/storyboards.ts` |
| Agent tools | 14 `ui_storyboard_*` tools drive the board headlessly. | `web/src/lib/tools/builtin/storyboard.ts` |

## 4. Scope

### 4.1 In scope

1. Three-step setup flow on the New Project surface and Studio home (S1–S3).
2. Genre on the screenplay, fed to the Director and shown on the board.
3. Screenplay review step between Direct and the first render.
4. Scenes: sluglines and lighting on the screenplay, a scene on each shot, scene
   headers in the grid.
5. Twelve shipped style presets with thumbnails, plus "Add your own style" from
   reference images. `Change Style` on the board.
6. Board card changes: hover toolbar (drag, download, duplicate, delete), insert
   between cards, `Scene N | Shot N`, entity names as chips, dialogue indicator,
   footer `Edit · Iterate · Regenerate · Upload`, remaining-time estimate when
   measured.
7. Edit Shot dialog replacing the docked inspector: still viewer with pan, zoom,
   flip and version pager, "Open in image editor", takes on the right, slugline
   and lighting header, the shot-table row, `Save`, `Regenerate`.
8. Imports: script file (PDF, DOCX, FDX), shotlist CSV with a downloadable
   template, blank board.
9. Headless parity: every step reachable through `ui_storyboard_*` tools, every
   parser a pure function with tests.

### 4.2 Out of scope

- 3D camera blocking view (S5 right panel). The camera fields drive prompt text
  only. Candidate for a later slice on `packages/model3d`.
- In-dialog painting. The brush, palette and eraser tools open the existing
  image editor on the still; the result comes back as a new version.
- PDF or share-link export. ZIP stays.
- Changes to rendering, the Director prompt beyond genre and scenes, the script
  link, Assemble, the timeline.
- Mobile and Electron chrome.

### 4.3 Non-goals

- No plan gating or upsell chrome in the flow. Studio's account page owns plan
  state; the flow never shows a remaining-projects banner.
- No second board component. `StoryboardBoard` gains scene headers and card
  affordances; the Studio page and the workspace tab keep hosting it.
- No change to what a skill starter does. A prompt carrying `/<skill>` keeps
  today's one-button `Start`; the stepper is the path when no skill is invoked.

## 5. Users and entry orders

| Entry | Who | Path |
| --- | --- | --- |
| One sentence | Studio beginner, workspace creator | S1 → S2 → S3 → board |
| Full script pasted or uploaded | Writer with copy | S1 (parsed) → S2 genre → review → S3 → board |
| Shotlist CSV | Director with a shot plan | S1 → S3 → board, Story step skipped |
| Blank | Anyone | S1 → empty board, setup flow available from the board |
| Skill starter | Returning creator | S1 `Start`, unchanged |

## 6. The flow

### 6.1 Step 1 — Idea

Layout: stepper across the top, `1. Idea` active. Left column, heading "What's
your story?", subline "We'll turn it into a screenplay and storyboard." Three
inspiration chips seeded from the shipped example boards' loglines, one click
fills the textarea. The existing prompt card keeps `/`, `@`, ref images and
entities. Placeholder: "One sentence is enough, or paste a full script."

Right column, three option cards and one tutorial card:

- **Upload your file** — PDF, DOCX, FDX. Text extraction reuses the agents host
  modules for PDF and DOCX (`packages/agents/src/host-modules/pdf.ts`,
  `docx.ts`). FDX is Final Draft XML; a new pure parser maps `Scene Heading`,
  `Action`, `Character`, `Dialogue`, `Parenthetical` paragraphs to scenes and
  lines. The result lands in the textarea as the script; the Director breaks
  it down instead of inventing one.
- **Import your shotlist** — CSV with the template's columns (§ 7.3). "Download
  template" serves a static file. Import creates the shots directly and jumps
  to step 3.
- **Start with blank storyboard** — today's `createBlankStoryboard`.
- **Tutorial** — the existing tutorials entry, one card.

Foot of the view: the blank-document strip, unchanged.

`Continue` (replaces `Start` when the prompt invokes no skill) creates the
project row and an empty board with `brief` set, then advances. The board is
the stepper's state: a board with no shots opens in the setup flow at the step
its fields imply (no genre → step 2, genre but no screenplay → review, screenplay
but no style → step 3). Closing the tab loses nothing.

Studio home renders the same component with curated models and no model chip.

### 6.2 Step 2 — Story

**Genre.** Heading "Choose your genre", subline "Tone, pacing and framing follow
your choice. You can change it later." Fourteen cards, two lines each:

Action, Animation, Comedy, Commercial, Documentary, Drama, Educational, Fantasy,
Horror, Music Video, Mystery, Romance, Science Fiction, Thriller.

Card art is one shipped `package://` still per genre, rendered once and checked
in like the example boards' assets. `Back`, `Review your screenplay`.

**Review.** `Review your screenplay` runs Direct with the genre in the prompt
and shows the result as text before anything renders: title, logline, then
each scene as a slugline header with its lighting note and the shots beneath as
action lines with dialogue. Every field is editable inline and writes through
the store's `updateShot` and the new `updateScene`. `Re-direct` reruns the
Director with the edits as context. `Back` returns to genre. `Continue to
storyboard` advances.

A pasted or uploaded script skips invention: the Director receives it with the
instruction to break it into scenes and shots and keep the words.

### 6.3 Step 3 — Storyboard

Heading "Choose your aspect ratio and art style", subline "Set the look with a
preset or your own references. You can change it later."

Aspect ratio: the existing five options as a select, `16:9` default.

Style: a tile grid of the twelve shipped presets plus `Add your own style`.
Each preset is a library entity of kind `style` shipped with NodeTool, with a
canonical descriptor and one thumbnail asset. Presets:

Comic, Cinematic, Soft Pencil, Animation 3D, Watercolor Paint, Photo /
Commercial, Charcoal Sketch, Dark Anime, Flat / Vector, Noir, Stick Figure,
Graphic Novel.

Picking a tile puts that entity's id into the board's `entityIds` and copies its
descriptor into `style`. `Add your own style` takes one to three reference
images, asks the language model for a descriptor, and saves a user style entity
with the first image as its thumbnail; it then behaves like a preset.

`Generate your storyboard` renders stills for every shot with the existing
batch path and cost estimate, then opens the board.

### 6.4 Board

Header: editable title, genre chip beside it (opens the genre picker as a
popover), `Change Style` at the right of the toolbar. Existing actions stay:
Undo/Redo, script link, Add shot, Preview, Download ZIP, Board settings, Render
stills, Render clips, Assemble timeline.

Grid: the shipped four-column grid (Phase 0), grouped under scene headers.
Header shows `Scene N` and the slugline; drag-to-reorder works within and
across scenes and rewrites `scene_id`. A `+` appears between two cards on hover
and inserts a planned shot at that index in that scene.

Card:

- Still or clip, fullscreen icon, status pill and progress bar as shipped.
- While rendering, "~M:SS remaining" when a previous render of the same model on
  this machine measured a duration. Otherwise the progress bar alone. No
  invented number.
- Hover toolbar on the still: drag handle, download (still or clip), duplicate,
  delete.
- Caption `Scene N | Shot N`. Action text with entity names rendered as chips,
  using the existing entity-ref parsing. A dialogue icon, filled when
  `dialogue` is non-empty, opens the Edit dialog on the dialogue cell.
- Footer: `Edit` (dialog), `Iterate` (today's Revise take), regenerate icon
  (new still), upload icon (own image as a new keyframe version).

`Change Style` opens the step-3 tile grid as a dialog. Choosing a style updates
the board and marks every rendered still stale with a "Re-render N stills"
prompt. Nothing re-renders without the click.

### 6.5 Edit Shot dialog

Full-screen dialog, `Edit your shot`, close at the top right. Replaces the
docked inspector; its fields move here so a value is edited in one place.

- **Left.** Still or clip viewer with a toolbar: pan, flip horizontal, zoom in,
  zoom out, `Open in image editor`. Flip is applied in place as a new version.
  The image editor opens the current version and returns the edit as a new
  version. Version pager `k / n` steps through keyframe versions for a still,
  clip versions for a clip.
- **Right.** The existing takes gallery: every version, select or delete.
- **Header row.** `SCENE N:` slugline as a dropdown, which moves the shot to
  another scene; the scene's lighting note with an edit affordance.
- **Table row.** One shot, columns in order: Scene, Shot, Description,
  Dialogue, ERT, Size, Perspective, Movement, Equipment, Focal length, Aspect
  ratio, Notes. Mapping to fields in § 7.2. Aspect ratio is the board's value,
  read-only, with a link to Board settings. Notes is `Add +` until set.
- **Script panel** for a linked board stays, below the table.
- **Footer.** `Save`, `Regenerate` (new still with the current fields), and
  the overflow items that exist today (remove still, remove clip, delete shot).

Keyboard: `Esc` closes, `←`/`→` step versions, `Cmd/Ctrl+S` saves.

## 7. Data model

Additive only. Every storyboard schema is `passthrough`, so old documents
load unchanged.

### 7.1 Screenplay and scene

```ts
// packages/protocol/src/creative.ts
export interface Scene {
  type: "scene";
  id: string;
  index: number;
  /** "INT. SOPHIA'S FLAT — HALLWAY — EARLY MORNING" */
  slugline: string;
  lighting?: string;
}
// Screenplay gains:
genre?: string;
scenes?: Scene[];
```

`packages/protocol/src/api-schemas/storyboards.ts` mirrors both. Aliases:
`sceneId → scene_id`. The Director schema (`buildScreenplaySchema`) gains
`genre` as input and `scenes` as output.

### 7.2 Shot

```ts
// Shot gains:
scene_id?: string;
// camera gains:
equipment?: string;
```

Equipment vocabulary in `cameraOptions.ts`: handheld, tripod, steadicam,
gimbal, dolly, slider, crane, drone.

Table column → field: Description → `action`; Dialogue → `dialogue`; ERT →
`duration_seconds`; Size → `camera.framing`; Perspective → `camera.angle`;
Movement → `camera.movement`; Equipment → `camera.equipment`; Focal length →
`camera.lens`; Notes → `notes`.

### 7.3 Shotlist CSV

Columns, header row required, order free:

```
scene, shot, description, dialogue, duration_seconds, size, perspective, movement, equipment, focal_length, notes
```

`scene` groups rows into scenes in first-seen order; a value that reads like a
slugline becomes the slugline, otherwise `Scene N`. Vocabulary columns accept
the option lists case-insensitively and leave the field unset on no match,
never fail the import.

### 7.4 Style presets

Shipped as system entities of kind `style`, one row each, thumbnails under a
`package://` path, seeded the way example boards are (`installExample`). No new
table.

## 8. Decisions

- **D1 — One setup component, two hosts.** `StoryboardSetupFlow` renders inside
  `NewProjectSurface` and `StudioHome`. The stepper's state is the board's own
  fields, so there is no wizard store to persist.
- **D2 — Stepper only without a skill.** A prompt that invokes `/<skill>` keeps
  the shipped `Start`. The stepper is the default path for a plain ask.
- **D3 — Review before pixels.** The Director runs at the end of step 2 and its
  output is shown as text; no still renders before step 3's button. This is
  the reference's order and it keeps the cheap stage first.
- **D4 — Scenes on the screenplay, not a new document.** A scene is a header
  over shots. Assemble, the script link and the timeline read shots as today.
- **D5 — Style preset = style entity.** No `stylePreset` field. The board's
  `entityIds` holds the pick and `style` holds the descriptor, which is what
  every shot prompt already reads.
- **D6 — Edit dialog replaces the docked inspector.** One editing surface. The
  Phase 0 selection footer shrinks to the quick actions (Edit, Iterate,
  Regenerate, Delete); fields live in the dialog.
- **D7 — Remaining time only when measured.** Same rule as the spend estimate:
  a number nothing measured is not shown.
- **D8 — Paint tools open the image editor.** No second raster editor in the
  dialog; the result returns as a version.

## 9. Headless parity

Every step the UI takes is a tool call the agent can make:

| UI step | Tool |
| --- | --- |
| Set brief, genre, scenes, screenplay | `ui_storyboard_set_screenplay` (accepts `genre`, `scenes`) |
| Edit a shot's table row, move it to a scene | `ui_storyboard_update_shot` (accepts `sceneId`, `camera.equipment`) |
| Pick or change style | new `ui_storyboard_set_style` (entity id or descriptor) |
| Duplicate a shot | new `ui_storyboard_duplicate_shot` |
| Insert at index | `ui_storyboard_add_shot` (gains `index`, `sceneId`) |
| Upload own still | new `ui_storyboard_set_keyframe` (asset id) |
| Import script or CSV | parse with the pure functions, then `ui_storyboard_set_screenplay` |

Parsers (`parseFdx`, `parseShotlistCsv`, `sceneGrouping`) are pure functions in
`web/src/lib/storyboard/` with Jest tests, and the `script-storyboard-link`
harness entry gains them so `harness gate` runs them on a diff touching the
flow. `nodetool validate` is unaffected.

## 10. Acceptance criteria

1. From the New Project surface, a one-line prompt reaches a board with rendered
   stills through exactly three steps and one `Generate your storyboard` click.
2. Closing the tab after step 1 or 2 and reopening the board resumes the flow at
   the same step with the same values.
3. A `/skill` prompt still starts with one click and never sees the stepper.
4. Genre appears in the Director prompt (asserted in the hook's test) and as a
   chip on the board.
5. The review step renders the directed screenplay as text with no render job
   started; a shot edited there is the shot that renders in step 3.
6. Each of the twelve presets sets `style` and one `style` entity id; `Change
   Style` marks stills stale and renders nothing on its own.
7. Cards group under scene headers; drag across a header rewrites `scene_id`;
   the `+` between cards inserts at that index.
8. Hover toolbar: download saves the still or clip, duplicate creates a planned
   copy after the source, delete asks once.
9. Entity names in a card's action render as chips; a shot with dialogue shows
   the filled icon.
10. "~M:SS remaining" appears only when a duration was measured for that model.
11. The Edit dialog edits every field in § 7.2 and saves through the store with
    undo; the version pager and takes gallery show the same set.
12. Flip and image-editor edits each produce a new version, never overwrite.
13. Uploading an image creates a keyframe version and selects it.
14. FDX, PDF and DOCX uploads land as text in the prompt; a CSV with the
    template's columns creates the shots and skips to step 3; a CSV with an
    unknown vocabulary value imports with that field unset.
15. Every acceptance item above is also reachable through the tools in § 9, and
    the pure parsers have a red-then-green test each.
16. `npm run test:affected`, `npm run typecheck`, `npm run lint` and
    `harness gate --base origin/main` pass. No raw MUI, tokens only, media
    through `ResponsiveImage` / `VideoPlayer` with `locator`.

## 11. Phases

- **P1 — Schema and Director.** § 7.1, § 7.2 fields, aliases, Director schema
  with genre and scenes, `updateScene` in the store, tool argument extensions.
  No UI change. Ships alone.
- **P2 — Setup flow.** Steps 1–3 without imports or custom styles: stepper,
  inspiration chips, genre grid, review view, aspect select, preset tiles from
  seeded entities, resume-from-board. Both hosts.
- **P3 — Board.** Scene headers, insert point, hover toolbar, duplicate, entity
  chips, dialogue icon, footer actions, genre chip, `Change Style`, measured
  remaining time.
- **P4 — Edit dialog.** Viewer with pan, zoom, flip, image-editor hand-off,
  version pager, takes, header row, table row, upload. Remove the docked
  inspector's fields.
- **P5 — Imports and custom style.** FDX parser, PDF and DOCX text, CSV import
  and template, `Add your own style`.

P2 and P3 are independent after P1. P4 depends on P3's card footer.

## 12. Risks

- **R1 — Director quality with scenes.** Asking for scenes and shots in one
  structured call may lower shot quality. Mitigation: evaluate on the shipped
  example briefs before P2; fall back to a two-call plan (scenes, then shots
  per scene) if it does.
- **R2 — Inspector removal.** Creators work in the docked inspector today. The
  dialog must reach parity (script panel, cost line, entity chips) before D6
  removes fields, or the board loses functions for a release.
- **R3 — Style preset drift.** A preset descriptor edited by one user must not
  change for others. System entities are read-only; `Add your own style` copies.
- **R4 — Thumbnail and genre art size.** Twenty-six shipped stills add to the
  image. Keep each under the example-board asset budget and check
  `npm run backend:smoke`.

## 13. Open questions

- **Q1** — Should the review step also offer "Extract script" (voice the words
  first), or stay picture-first and leave that to the board as today?
- **Q2** — Does `Change Style` also re-render existing clips, or stills only
  with clips marked stale?
- **Q3** — Does a shot duplicated across scenes carry its script line ids, or
  drop them? Proposed: drop, since a line has one shot.

## Appendix A — Copy

Copy follows [BRAND.md § Lexicon](BRAND.md#5-lexicon): no billing terms, no
"users", name the mechanism.

| Where | Text |
| --- | --- |
| Step 1 heading | What's your story? |
| Step 1 subline | We'll turn it into a screenplay and storyboard. |
| Step 1 placeholder | One sentence is enough, or paste a full script. |
| Step 1 cards | Upload your file · PDF, DOCX, FDX / Import your shotlist · Download the template to get started / Start with a blank storyboard · Skip the story and go straight to the board |
| Step 2 heading | Choose your genre |
| Step 2 buttons | Back · Review your screenplay |
| Review buttons | Back · Re-direct · Continue to storyboard |
| Step 3 heading | Choose your aspect ratio and art style |
| Step 3 subline | Set the look with a preset or your own references. You can change it later. |
| Step 3 button | Generate your storyboard |
| Card footer | Edit · Iterate |
| Dialog title | Edit your shot |
| Dialog footer | Save · Regenerate |
| Stale banner | Style changed. Re-render N stills? |

## Appendix B — Reference to NodeTool map

| Reference element | Reuse | Build |
| --- | --- | --- |
| Prompt card, `/`, `@`, ref images | `NewProjectSurface` | Inspiration chips, `Continue` |
| Upload file | `host-modules/pdf.ts`, `docx.ts` | `parseFdx`, upload card |
| Import shotlist | — | `parseShotlistCsv`, template file |
| Blank storyboard | `createBlankStoryboard` | — |
| Genre grid | — | Grid, 14 art assets, `genre` field |
| Screenplay review | `useDirectScreenplay`, store `updateShot` | Text view, `updateScene`, scenes in Director schema |
| Aspect ratio | `ASPECT_OPTIONS` | — |
| Style tiles | Entity library, `style` kind | 12 seeded entities, thumbnails, tile grid, `Add your own style` |
| Board grid | Phase 0 grid, `ShotCard`, drag reorder | Scene headers, insert point, hover toolbar, chips, footer |
| Change Style | `setStyle`, `setEntityIds` | Dialog, stale marking |
| Remaining time | `StoryboardGenerationStore` progress | Measured-duration record |
| Edit dialog | `ShotInspector` fields, `ShotTakesGallery`, `ShotScriptPanel`, image editor | Dialog shell, viewer toolbar, table row, `equipment`, upload |
| Iterate | Revise take | — |
| Download, ZIP | `storyboardZip.ts`, export route | Per-shot download |
| 3D camera view | — | Out of scope |
