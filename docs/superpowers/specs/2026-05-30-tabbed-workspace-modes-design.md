# Tabbed Workspace with Document Modes — Design

**Date:** 2026-05-30
**Status:** Design approved; implementation pending

## Goal

Replace NodeTool's destination-based navigation (AppHeader mode label + PanelLeft's
7 destinations + per-type full-page routes) with a single **tabbed document
workspace**. Every open thing is a tab of a known *type*; each tab hosts the editor
that already exists for that type. A tab carries a **mode** (View / Edit) that selects
which surface renders. Where the left nav used to be, the shell shows a blank panel; a
home/launcher screen fills that region in a later iteration.

The redesign **reuses every existing editor**. It builds a shell and a tab model around
them; it does not rewrite the editors.

## The model: a tab is `document + mode`

```
WorkspaceTab {
  id:    string
  type:  'workflow' | 'image' | 'timeline' | 'model3d' | 'audio' | 'text'
  ref:   string            // document id: workflowId, sequenceId, assetId, sketchDocumentId, …
  mode:  'view' | 'edit'
  title: string
}
```

`(type, mode)` selects the surface — generalizing the existing MiniApp(view) ⇄
NodeEditor(edit) split to all six types:

| type     | view                       | edit                          |
| -------- | -------------------------- | ----------------------------- |
| workflow | `MiniAppPage` (the app)    | `NodeEditor` (the graph)      |
| image    | `ImageViewer`              | `SketchEditor` / `ImageEditor`|
| model3d  | `Model3DViewer`            | `Model3DEditor`               |
| text     | `TextViewer` (rendered)    | Lexical editor (`textEditor/`)|
| timeline | playback preview           | `TimelineEditor`              |
| audio    | `AudioViewer` (waveform)   | — (view-only, no editor yet)  |

The model *allows* both modes everywhere; we wire up what already exists.

## Architecture

- **`WorkspaceShell`** (new) — top-level layout: global tab bar + content area + blank
  left placeholder. Replaces the per-route layouts in `web/src/index.tsx` for the
  unified experience.
- **`WorkspaceTabsStore`** (new, Zustand) — open tabs, active tab id, ordering; persists
  to localStorage; syncs the active tab to the URL for deep links. Generalizes today's
  `WorkflowManagerContext` (open workflows) + `useFileTabsStore`.
- **`TabContentRouter`** (new) — maps the active tab's `(type, mode)` to an editor
  surface; lazy-loads each.
- **Editor surfaces** — thin wrappers that mount existing editors with an explicit
  `ref`/`mode` prop instead of reading route params. Most editors already separate a
  "page reads param" wrapper from the inner editor (`SketchEditorPage`→`SketchEditor`;
  `MiniAppPage` takes `workflowId`), so this is composition, not rewrite.
- **`WorkflowEditorSurface`** — bundles `NodeEditor` with its working panels (node menu /
  inspector / logs-queue-versions-trace) that are app-global today (`PanelLeft` /
  `PanelRight` / `PanelBottom`). These stop being global and become local to the workflow
  Edit surface.

## What folds where

- **Node-editor working panels** (node menu, inspector, bottom run/debug tabs) → move
  into `WorkflowEditorSurface`; no longer top-level siblings. Stores (`PanelStore`,
  `RightPanelStore`, `BottomPanelStore`) keep working; only the mount location changes.
- **Destination panels** (workflow list, asset browser, history, favorites, settings,
  agent) → not part of the shell. They belong to the deferred home screen; the left
  region stays blank until then.
- **File tabs** (assets opened while editing) → absorbed: opening an asset opens a
  top-level document tab. The separate file-tab layer goes away.
- **Subgraph tabs** (drilling into a `SubgraphNode`) → stay nested *inside* the workflow
  Edit surface; they are part of editing one workflow, not top-level workspace tabs.

## Opening tabs during the blank-nav phase

`[+]` on the tab bar opens a minimal picker: New workflow / Open workflow / Open asset.
Stopgap only — the home/launcher replaces it later. Existing entry points (templates,
asset double-click) also open tabs.

## Scope

**In:** `WorkspaceShell`, `WorkspaceTabsStore`, `TabContentRouter`, editor surfaces for
all six types reusing existing editors, the View/Edit mode toggle, tab persistence +
deep links, the minimal `[+]` picker.

**Out:** audio editor, the home/launcher screen, any net-new editor, redesigning
AppHeader/PanelLeft destinations beyond leaving the region blank.

## Implementation strategy

Build incrementally behind a new `/workspace` route, leaving every current route working.

1. Shell + store + **workflow** tabs first (highest value; reuses `MiniAppPage` +
   `NodeEditor`). This includes relocating the three global panels into
   `WorkflowEditorSurface` — the most invasive single step.
2. Add one document type per increment (image → text → 3d → audio → timeline),
   verifying each renders in a tab.
3. Flip the default route to the workspace once all six are solid.

This keeps the live app intact throughout and lets each editor be validated in a tab
before commitment.

## Open decisions (chosen defaults)

- Editors read `ref` from **props**, not the router; keep old param-reading page wrappers
  for legacy routes during transition.
- **One** workspace with heterogeneous tabs (browser-style), not per-type windows.
- Active tab in the URL (`/workspace/:type/:ref?mode=`); full tab set in localStorage.
- Subgraph and any future intra-document tabs stay editor-local.

## Risks

- The node editor's three global panels are wired as route-level siblings; relocating
  them into `WorkflowEditorSurface` is the most invasive step — do it first, behind the
  route.
- Editors that read `useParams` directly need a prop path; audit each for hidden router
  coupling.
- Persistence migration: don't drop users' currently-open workflows — read existing
  `openWorkflows` localStorage on first load.
