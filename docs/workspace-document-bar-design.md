# Workspace Header and Document Bar

Status: proposal. This plan replaces the single-row workspace header with an
app bar and a document bar. It covers every workspace tab type in
`WorkspaceTabType` (`web/src/stores/WorkspaceTabsStore.ts`).

## Problem

The workspace header (`web/src/components/workspace/WorkspaceTabBar.tsx`)
holds three scopes in one row:

- App scope: project selector, home button, New, activity, notifications,
  settings.
- Tab scope: the open document tabs.
- Document scope: the View/Edit toggle and the header actions of the active
  document.

Only the timeline registers header actions (`TimelineEditor.tsx` through
`WorkspaceHeaderActionsContext`). Its `TopBar` adds about ten controls, so the
tabs lose their width and the active tab title is cut off. Every other type
draws its own toolbar inside its surface, with different slots, save models,
and button order.

Findings from the current code:

- **F1.** The desktop project selector always shows the label "Project". The
  project name shows on a separate home button next to it.
- **F2.** The timeline shows `ActivityIndicator` twice. `TopBar` renders one,
  and the tab bar renders one.
- **F3.** The timeline has three controls that change the editor: View/Edit,
  Video/DAW, and the dock layout menu ("Editing"). "Edit" and "Editing" sit
  side by side with different meanings.
- **F4.** Save feedback has four forms: autosave with a label (timeline,
  script, game, JS script), autosave with no label (workflow, sketch,
  storyboard), explicit Save with a dirty dot (SVG, text, workspace file,
  skill, 3D), and explicit Save with no status (image, audio, application).
- **F5.** Some editors repeat the View/Edit toggle with their own button:
  Done (image, audio), Close (3D), Back (app builder).
- **F6.** The application tab has View/Edit in the header and a second mode
  control (Design, Run, Preview draft, Settings) in its surface. Its View mode
  and its Run mode show the same thing.
- **F7.** Undo and Redo sit in a different place in each editor. Workflow and
  sketch have no Undo or Redo button.
- **F8.** `WorkspaceHeaderActionsContext` keeps one registration, and the last
  caller wins. Every open tab stays mounted, so this model depends on each
  editor registering and unregistering on activation.

## Layout

```
App bar (36px, global)
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ Personal ▾ │ Untitled timeline × │ AURELI — Konzept A × │ AURELI — B × │ + │  ⟳ 🔔 ⚙ │
└──────────────────────────────────────────────────────────────────────────┘
Document bar (40px, owned by the active document)
┌──────────────────────────────────────────────────────────────────────────┐
│ AURELI — Konzept B  Saved │ ↶ ↷ │ View◉Edit │ Video editing ▾ │ ▤ ◫ │ [Export] ⋮ │
└──────────────────────────────────────────────────────────────────────────┘
Editor rows (inside the surface, unchanged): tool row, transport, status bar
```

### App bar

- **D1.** Merge the project selector and the home button into one control.
  The control shows the project name ("Personal" for no project). A click on
  the name opens the project home. The caret opens the project menu. A
  double-click renames the project, as the home button does today.
- **D2.** Put the new-tab button after the last tab as a "+" icon, like a
  browser. Keep the open menu (`OpenMenu`) that it opens today.
- **D3.** Give the tabs all the free width. The right edge holds only
  activity, notifications, and settings.
- **D4.** Never put document controls in the app bar. Remove the View/Edit
  toggle and `{headerActions}` from `WorkspaceTabBar`.

### Document bar

The document bar is one shared primitive, `DocumentBar`, with fixed slots.
Every document type fills the same slots in the same order. A slot that a type
does not use is empty and takes no width.

| Slot | Content | Rule |
|---|---|---|
| Identity | Title, then `SaveStatus` | The title renames inline, as the tab does |
| History | Undo, Redo | Always here when the editor has history |
| Mode | One `ModeSwitch` | At most one segmented control per bar |
| View | Layout menu, panel toggles | Icon buttons with tooltips |
| Actions | One primary button, then secondary buttons, then ⋮ | At most one filled button |

- **D5.** The surface renders `DocumentBar` as the first row of its own
  content. It does not register into the header. This removes the
  single-registration model of F8 and keeps the bar inside the `inert`
  boundary of an inactive tab.
- **D6.** Each type has exactly one primary action. The primary action is the
  main outcome of the document (Export, Run, Publish, Save). All other
  outcomes go in ⋮.
- **D7.** Editing tools stay inside the surface: the timeline tool row, the
  sketch tool rail, the audio edit tools, the 3D transform tools, the text
  formatting toolbar, and all transports. The document bar holds only
  document-level controls.
- **D8.** Remove every button that repeats the View/Edit toggle (F5): Done,
  Close, and Back.

### Save status

- **D9.** Add one `SaveStatus` primitive with one vocabulary: "Saved",
  "Saving…", "Unsaved changes", "Not saved" with a Retry action. Every type
  that persists a document uses it.
- **D10.** Autosaved types show only `SaveStatus`. Cmd+S forces a save. They
  have no Save button.
- **D11.** Asset editors that write back to an asset keep an explicit Save as
  their primary action, with "Unsaved changes" in `SaveStatus`. See Q1.

### Mode switch

- **D12.** The View/Edit toggle moves from the app bar into the Mode slot, as
  a compact two-icon switch (eye and pencil) with labels in the tooltip. The
  types that show it are the types in `SUPPORTS_BOTH_MODES`. Move that table
  next to `DocumentBar`.
- **D13.** A type with its own modes uses the same slot and still shows only
  one control. The application tab is the main case (F6).

## Per-type plan

"Remove" means the control leaves the type. "Move" means it changes place.

### Timeline

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (replaces the save caption) |
| History | Undo, Redo (move from the tool row) |
| Mode | View/Edit |
| View | Workspace menu, Transcript toggle, Side panel toggle |
| Actions | **Export**, ⋮ |

- Merge the Video/DAW toggle into the dock layout menu as one "Workspace"
  menu: Video editing, Audio (DAW), then the saved layouts (F3). See Q3.
- ⋮ holds Project settings, Adapt format, Save as asset, Export project ZIP,
  Export for Premiere, Export media ZIP, and Code.
- Remove the Save icon (D10) and the second `ActivityIndicator` (F2).
- Delete the `TopBar` registration and the DAW lab registration in
  `labViews.tsx`. Then delete `WorkspaceHeaderActionsContext`.

### Workflow

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (new, the workflow autosaves with no label today) |
| History | Undo, Redo (new buttons for the existing history) |
| Mode | Graph / Chain (move from the ⋮ menu of `FloatingToolBar`) |
| View | Conversation toggle, Minimap toggle |
| Actions | ⋮: Download JSON, Convert to JS script, Download node script, App |

- Run, Stop, and the trigger button stay in the floating dock, next to the
  composer. The workflow has no primary button in the document bar. See Q2.
- Remove Save from the dock (D10).

### Sketch

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` |
| History | Undo, Redo (new buttons) |
| View | Layout menu, Assistant toggle |
| Actions | **Export PNG**, Generate image, ⋮ |

- ⋮ holds Save as asset, Export PSD, Import PSD, Transform with workflow, and
  the view items (Fit, Hide panels, Rulers, Guides, Snap, Clear guides).
- The active tool name and the tool settings stay in the tool top bar inside
  the canvas (D7).

### Image

Image Edit mode uses the sketch editor, so it uses the sketch bar with these
changes:

- Mode: View/Edit.
- Primary: **Save to image** (D11).
- Remove Done (D8).

### Audio

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` |
| History | Undo, Redo (move from the edit toolbar) |
| Mode | View/Edit |
| Actions | **Save**, ⋮: Transform with workflow |

- The edit operations (Trim to Effects) and the transport stay in the surface.
- Remove Done (D8).

### 3D model

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (replaces the dirty dot) |
| History | Undo, Redo |
| Mode | View/Edit |
| View | Assistant, AI render, Blender render toggles |
| Actions | **Save**, ⋮: Export formats, Transform with workflow, Shortcuts |

- Move/Rotate/Scale, Local/World, Snap, Add, Duplicate, and Delete stay in a
  tool row inside the surface (D7).
- Remove Close (D8).

### SVG, text, skill, workspace file

These four share one shape.

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (replaces the dirty dot) |
| History | Undo, Redo (move from `EditorToolbar`) |
| Mode | View/Edit |
| Actions | **Save** (D11), ⋮ |

- Text and skill keep the formatting part of `EditorToolbar` inside the
  surface. The spreadsheet keeps its sheet select inside the surface.
- Workspace file: Copy goes in ⋮. Binary kinds show only Identity.
- Skill autosaves today. Use the autosave form (D10) and remove its Save
  button. System skills show Identity with a "Read only" status.

### Storyboard

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (new) |
| History | Undo, Redo |
| Mode | Board / Preview |
| View | Board settings toggle, Assistant toggle |
| Actions | **Render** (split: stills, clips), Open timeline, ⋮ |

- ⋮ holds Slideshow, One take, Script link, Create or rebuild timeline,
  Change style, Download ZIP, and Send to workflow.
- The genre and lineage chips move into the board settings panel. The
  summary caption and the download status move to the shot row.
- The shot row (search, Add shot, media toggle, card size) stays in the
  surface. See Q4.

### Script

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (replaces `ScriptSaveIndicator`) |
| History | Undo, Redo |
| View | Cast toggle, Assistant toggle |
| Actions | **Voice all** or **Send to timeline**, Play through, ⋮ |

- The primary action follows the document state. It is Voice all while lines
  have no voice. It is Send to timeline (or Update timeline) when every line
  has a voice.
- ⋮ holds Assemble video, Send to workflow, Export SRT, and the audio exports.
- The line, word, duration, and voice chips move to a status line under the
  editor.

### JS script

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (move from the run console) |
| View | Script settings toggle, Assistant toggle |
| Actions | **Run**, Tests (n), ⋮ |

- The run console keeps the output and the "Running…" state.

### Application

| Slot | Content |
|---|---|
| Identity | App name, `SaveStatus` |
| History | Undo, Redo (Design only, move from the builder toolbar) |
| Mode | Run / Design / Settings |
| View | Preview width, Layout menu, App Data toggle (Design only) |
| Actions | **Save** in Design, ⋮: Linked workflows, Preview draft |

- Run replaces View, and Design replaces Edit (F6). The application tab does
  not show the generic View/Edit switch.
- Remove Back from the builder toolbar (D8).
- Use autosave if the builder can support it, and drop the "App saved"
  notification. See Q1.

### Example app

- Identity: title with a "Read only" status.
- Primary: **Edit app**, which installs a copy.

### Game

| Slot | Content |
|---|---|
| Identity | Title, `SaveStatus` (map the draft states to the shared vocabulary) |
| History | Undo, Redo |
| Mode | View/Edit |
| View | Scene tree, Inspector, Assistant toggles, Layout menu |
| Actions | **Publish**, ⋮ |

- ⋮ holds Export, Save play state, Load play state, Play in new tab, and
  Commands.
- Play, Pause, Step, Stop, and Restart stay as a transport row inside the
  surface (D7).

### Types with no document bar

Chat, page, project list, project, guided flow, and new project show no
document bar. Chat keeps its composer controls. These surfaces get the full
height under the app bar.

## Small windows

Follow the small-window rules in [UX Guidelines](UX_GUIDELINES.md). The
document bar collapses in this order as the width falls:

1. Panel toggles move into ⋮.
2. Secondary action buttons move into ⋮.
3. The title truncates. `SaveStatus` stays visible as an icon with a tooltip.
4. The primary button shows only its icon.

On phones, `WorkspaceTabBar` already shows an app row and a document row. The
document bar replaces its third "actions" row.

## Cost

The timeline gets one more row. The app bar shrinks from 48px to 36px, and
the document bar is 40px, so the net vertical cost is about 28px. Every other
type moves its existing top toolbar into the document bar, so its height does
not grow.

A single row with fewer controls was the alternative. It still mixes the
scopes, and it fails as soon as a document needs four controls.

## Rollout

Each phase is one PR with its own tests.

1. **App bar.** Do D1 to D3. Test: the project control shows the project
   name and opens the project home.
2. **Primitives.** Add `DocumentBar`, `SaveStatus`, and `ModeSwitch` to
   `ui_primitives/` with tests. Move the View/Edit toggle out of the app bar
   (D4, D12). Test: the app bar renders no document controls for any tab type.
3. **Timeline.** Migrate the timeline. Delete the `TopBar` header
   registration, the DAW lab registration, and
   `WorkspaceHeaderActionsContext`.
4. **Asset editors.** Migrate image, audio, 3D, SVG, text, skill, and
   workspace file. Remove Done and Close.
5. **Production documents.** Migrate storyboard, script, JS script, game,
   application, example app, and workflow.

## Open questions

- **Q1.** Do the asset editors (image, audio, 3D, SVG, text, workspace file)
  and the application move to autosave? Autosave makes the save model
  uniform. Explicit save protects the source asset from partial edits. The
  plan keeps explicit save until this is decided.
- **Q2.** Does the workflow Run button stay in the floating dock, or move to
  the document bar as the primary action? The plan keeps it in the dock,
  because the dock holds the composer that starts a run.
- **Q3.** Do Video and DAW merge into the workspace layout menu? The plan
  merges them. This works only if DAW is a layout of the same editor, not a
  separate editor.
- **Q4.** Is Render the storyboard primary action, or is it Open timeline?
  The plan picks Render, because the board produces stills and clips first.
