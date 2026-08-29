# Project View — Implementation Plan

Make the *project* the unit of the workspace instead of the *document*. Every
document row already carries a `project_id` column (`packages/models/src/db.ts`
— `timeline_sequences`, `image_documents`, `applications`, and siblings) and
every creation site hardcodes `projectId: "default"`. This plan spends that
column: a project is a tab group plus one overview tab inside the existing
`WorkspaceShell`. No new window, no mode. The fifteen document editors keep the
center area untouched.

## Mockups

Four 1440×900 screens in `mockups/` (self-contained HTML, inline styles; open
in any browser). Also published as an editable canvas:
https://claude.ai/code/artifact/9fde1641-9965-4f71-bb23-2543ef4bc4db

| File | Screen | Referenced by |
|---|---|---|
| `mockups/storyboard-board.html` | Storyboard editor restyled as a shot grid, inside a project tab group | Phase 0, A1–A4; Phase 2, B1–B2; Phase 5, E1 |
| `mockups/projects-list.html` | Projects list tab | Phase 2, B3; Phase 3, C4 |
| `mockups/project-overview.html` | Project overview tab, populated (Aurora Launch Spot) | Phase 3, C1–C3; Phase 4 (spend) |
| `mockups/new-project.html` | Full-view "Start a project" surface | Phase 4, D1–D3 |

The mockups draw the shipped chrome from real values: 40px tab bar
(`c_app_header` #0A0B0D), 50px full-height rail, 32px bottom strip, `divider`
rgba(255,255,255,0.08), fonts Inter 22/18/15/13/11 + JetBrains Mono, radii from
`theme.rounded`. Anything in a mockup that differs from a token in
`web/src/components/themes/ThemeNodetool.tsx` or `docs/DESIGN.md` — the tokens
win. Type glyph colors come from `colorForType` in `web/src/config/data_types.ts`
(the mockups hardcode the same hex values).

Project identity color everywhere: `info.light` cyan `#67E8F9` — rail icon,
scope chip, group underline, `◆` glyph.

## Ordering

Phase 0 ships alone, first (explicit request: the restyled storyboard is wanted
regardless of the project layer). Phases 1→5 build on each other; 1 and 0 are
independent.

Rules that apply to every phase: ui_primitives only (no raw MUI), design tokens
only (SPACING / BORDER_RADIUS / MOTION / Z_INDEX / `var(--fontSize*)`), media
through `ResponsiveImage`/`VideoPlayer` with `locator`, and after each phase
`npm run test:affected && npm run typecheck && npm run lint` must pass.

---

## Phase 0 — Restyle the storyboard board as a shot grid

Reference: `mockups/storyboard-board.html`, center area. Today
(`web/src/components/storyboard/StoryboardBoard.tsx`) the board is a large
settings `Panel` (Screenplay + Direction `FormGrid`, then a wide button row)
followed by a vertical list of `ShotCard`s, each a two-column card
(`shotCardGridSx`: `minmax(220px, 300px) minmax(0, 1fr)`). The mockup replaces
that with a dense grid the user approved. Keep all existing behavior (store
wiring, Direct/re-direct dialog, generate hooks, undo/redo, preview, zip, script
link); this phase is presentation.

- **A1 — Compact board toolbar.** Collapse the settings `Panel` into one
  toolbar row at the top of the surface: board title (18px, weight 600), a
  13px `text.secondary` meta line ("8 shots · night-minimal style · entity:
  Aurora lamp" — shot count, style field, entity names), then right-aligned
  actions: `Render stills`, `Render clips` (outlined) and `Assemble timeline`
  (contained primary). Move the full Screenplay/Direction form (title, brief,
  style, entities, the three model pickers, aspect ratio, shot count, Direct)
  into a collapsible section or popover opened from the toolbar — it must stay
  reachable, but not permanently occupy the top of the board. Undo/redo,
  Preview, Download ZIP, and ScriptLinkControl move into the same toolbar row
  or its overflow. Files: `StoryboardBoard.tsx`.
- **A2 — Shot grid.** Replace the vertical `ShotCard` list with a responsive
  CSS grid: `repeat(4, minmax(0, 1fr))` at desktop width, collapsing to 3/2/1
  columns. Each card (restyled `ShotCard.tsx`): thumbnail on top (fixed-height
  media area, `background.paper` card, 1px `divider` border, `BORDER_RADIUS.lg`),
  action text below (13px, 1.45 line-height, 2-line clamp), overlays on the
  thumbnail: top-left `SH NN · Ns` mono label on a scrim, bottom-right status
  pill. The per-shot detail editing that no longer fits the card (prompt,
  render mode, takes gallery, per-shot model) moves to a selected-shot
  inspector or expand-in-place — decide against `ShotCard.tsx`'s current
  feature list and keep every existing control reachable. Files:
  `ShotCard.tsx`, `StoryboardBoard.tsx`, tests in
  `web/src/components/storyboard/__tests__/`.
- **A3 — Status vocabulary.** Pills are `JetBrains Mono` 11px, pill radius:
  done = `success.main` #50FA7B on rgba(80,250,123,0.12) with 0.5-alpha border
  ("clip · 38s"); rendering = video-violet #9460FF border on
  rgba(148,96,255,0.16) plus a 3px progress bar along the thumbnail's bottom
  edge, and the whole card takes a 1px #9460FF border (mid-render border, per
  the app's visual language); still-only/queued = neutral
  rgba(255,255,255,0.06)/0.15. Selected card: 1px `primary.main` border +
  1px spread ring, as in the mockup's SH 05.
- **A4 — Selection footer.** A 44px bar docked under the grid when a shot is
  selected: `SH NN selected`, then "Appears in" chips (see E1 for where the
  links come from; in this phase render the chips only for what the board
  already knows — the linked script line via `ScriptLinkControl` data),
  right-aligned `Revise take` and `Re-render clip` actions bound to the
  existing generate hooks. Until E1 lands the timeline chip is omitted, not
  faked.

Acceptance: board renders 8+ shots as a grid matching the mockup's geometry;
all pre-existing storyboard tests pass (updated where they assert the old
layout); no raw MUI imports; `npm run test:affected` green.

## Phase 1 — Projects data layer

No mockup; this is the substrate. Backend only.

- **P1 — `projects` table + model.** `packages/models`: id, user_id, name,
  kind (free text: "spot", "trailer", "report", …), created_at, updated_at.
  Follow an existing small model (e.g. `packages/models/src/script.ts`) for
  shape, migrations in both sqlite and pg schema paths in
  `packages/models/src/db.ts` / `schema-pg`.
- **P2 — tRPC router.** `projects.list / get / create / update / delete` plus
  `projects.documents(id)` — one query per document table filtered on
  `project_id`, returned as a typed union `{type, ref, name, updated_at}`
  matching `WorkspaceTabType`. Wire where the other routers live
  (`packages/websocket`).
- **P3 — Status + spend rollup.** `projects.get` returns a derived status line
  and spend. Status from document state: storyboard (shot count, stills n/m,
  clips n/m), script (lines voiced/stale via `needsVoicing` from
  `@nodetool-ai/timeline`), timeline (clip count, rendered or not). Spend from
  the prediction/cost ledger (`nodetool costs` reads it; see
  `attachRunCostLedger` in `@nodetool-ai/execution`) — requires cost rows to
  carry a project attribution: add `project_id` to the prediction record where
  it is written, nullable, backfilled as null. Per-document and per-category
  (stills/clips/voice/pipeline) sums, as shown in
  `mockups/project-overview.html`'s spend bar.
- **P4 — Creation sites take a project.** Replace the hardcoded
  `projectId: "default"` at every web creation site (grep `projectId:
  "default"` under `web/src`) with the active project id from the store added
  in B1, falling back to `"default"` when no project is active. `"default"`
  remains the loose-documents bucket; no migration of existing rows.

## Phase 2 — Shell: project group, rail entry, projects list

References: `mockups/storyboard-board.html` and `mockups/project-overview.html`
(tab bar anatomy), `mockups/projects-list.html` (list surface).

- **B1 — Active-project state.** `web/src/stores/WorkspaceTabsStore.ts`: tabs
  gain an optional `projectId`; store gains `activeProjectId` plus
  open/close-project actions. Opening a project opens its overview tab and
  restores its document tabs as one contiguous group.
- **B2 — Tab bar group rendering.** `WorkspaceTabBar.tsx`: tabs sharing the
  active `projectId` render contiguously behind a scope chip — `◆ <project
  name> ▾` on rgba(103,232,249,0.06) with `inset 0 -2px 0 #67E8F9`; grouped
  tabs carry `inset 0 -2px 0 rgba(103,232,249,0.35)`. The chip's menu:
  switch project, close group, open overview. Loose tabs render exactly as
  today. Active tab keeps its existing background treatment.
- **B3 — Projects rail entry + list tab.** `PanelLeft.tsx`: a Projects section
  at the top (diamond icon, cyan when a project surface is active). It opens a
  `project-list` tab rendering `mockups/projects-list.html`'s center: header
  row (title, search, `+ New project`), 3-column card grid — thumbnail montage
  from real shot stills (via `ResponsiveImage` + locators), name row with `◆`
  and relative time, status line and spend from P3, status pill styles as in
  A3 — then a "Not in a project" strip of loose documents (chips, drag onto a
  card sets `project_id`). Ghost card opens the D1 surface.
- **B4 — Tab type registry.** `WorkspaceTabsStore`/`TabContent`/`OpenMenu`
  glyph+color tables gain the new types (`project-list`, `project`,
  `project-new`): glyph `◆`, color #67E8F9. Update
  `SUPPORTS_BOTH_MODES`, `TYPE_GLYPH`, `TYPE_COLOR` in `WorkspaceTabBar.tsx`.

## Phase 3 — Project overview tab

Reference: `mockups/project-overview.html`.

- **C1 — Layout.** New `project` tab type, first tab of its group. Header
  strip: name + status pill, derived status line, spend block ("$4.12 / so far
  · provider rates, no markup"), primary next-step action (label derived from
  status: "Render master", "Render clips", …). Below: 460px left column +
  fluid right column, split by `divider`.
- **C2 — Left: the project agent.** The chat thread that built the project
  (`chat` document bound to the project), rendered compactly: user turns as
  bubbles, agent turns as text + tool-call chips (mono 11px on `Paper.overlay`),
  status pills for renders it kicked off. Input box at the bottom feeds the
  same thread. Reuse the existing chat components where they fit; this is a
  narrow rendering of an existing thread, not a new chat system.
- **C3 — Right: document cards.** One card per project document: type-specific
  thumbnail (storyboard = 4-still strip, script = first lines with
  voiced/stale dots, timeline = track miniature, workflow = node sketch),
  name, status pill, meta line with per-document spend. Click opens the
  document tab in the group. Card geometry per the mockup: 2-column grid,
  120px media area, 8px radius.
- **C4 — Spend bar.** Bottom of the right column: stacked bar split by
  category with a mono legend, totals from P3. Categories and colors:
  stills #E838FF, clips #9460FF, voice #08B8FF, pipeline #6690d4. Unpriced
  spend shows as an `unpriced` segment, not dropped (ledger convention).

## Phase 4 — New-project surface

Reference: `mockups/new-project.html`. Full center-view surface, itself a tab
(`project-new`), opened from `+ New`, the projects list ghost card, and the
rail.

- **D1 — Layout.** Centered 860px column: "What do you want to make?" (22px),
  one-line promise (13px secondary), prompt card (`background.paper`, 1px
  `primary.main` border, 12px radius) with context chips (ref images, voice,
  entities), cost estimate line ("est. $3–6 · provider rates, no markup" —
  from the shape preset's historical range, or omitted when unknown; never a
  made-up number), `Start` primary button. Shape shortcut chips below; the
  selected shape renders its document chain (Board → Script → Cut → Render
  pipeline) as a glyph row. Foot of the view: "Blank document" strip — the
  full existing `OpenMenu` catalog as a 6-column grid, opening loose tabs
  exactly as today.
- **D2 — Start wiring.** `Start` creates the project row (P1), opens its group
  with the overview tab (C1), and posts the prompt as the first turn of the
  project's agent thread. The agent builds documents through the existing
  headless tools (`create_storyboard`, `voice_script_lines`,
  `assemble_storyboard_timeline`, …) with the project id applied via P4.
- **D3 — OpenMenu demotion.** The `+ New` button keeps its popover for
  keyboard/muscle-memory flow, but its first item becomes "Start a project…"
  opening the D1 tab; the document list stays beneath. `OpenMenu.tsx`.

## Phase 5 — Cross-document context

Reference: `mockups/storyboard-board.html`, selection footer.

- **E1 — "Appears in" links.** Given a selected shot, resolve where it lands
  in sibling documents: timeline placement via `buildStoryboardTimeline`'s
  shot→clip mapping (`@nodetool-ai/timeline`) against the project's assembled
  sequence, script line via the existing script↔storyboard link
  (`get_storyboard` link state). Render as chips (violet ▤ timeline at
  timecode, sky 🎙 script line); clicking opens the sibling tab and selects
  the clip/line there. Requires a "select this clip/line on open" param on the
  timeline and script tab-open paths.
- **E2 — Reverse direction.** Timeline clip selection shows a "from Board ·
  SH NN" chip that jumps back. Same mechanism, other direction.

## Out of scope

Mobile (documents open one-per-screen there; project grouping needs its own
design), Electron-specific chrome, migrating existing `"default"` rows into
projects, and any change to the fifteen editors beyond Phase 0's storyboard
restyle and E1/E2's selection deep-links.

## Verification per phase

`npm run test:affected`, `npm run typecheck`, `npm run lint`. Phase 0 also:
existing storyboard suites updated, `nodetool harness gate --base main` if the
diff touches surfaces the registry maps. Phases 1–2: model tests beside the
new table, router tests, `WorkspaceTabsStore` unit tests for grouping. UI
phases: RTL tests for the new surfaces (behavior, not layout snapshots).
