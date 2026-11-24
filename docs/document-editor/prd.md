# Document Editor — PRD

> Status: phases 1 to 4 and R26 to R29 implemented, phase 5 planned · Owner: matti

## Problem

A person who writes text in NodeTool has two places to do it, and neither one
is a complete editor.

- **The project browser.** A text file opens in a code editor
  (`web/src/components/workspace/TextSurface.tsx` mounts the Monaco-backed
  `TextDocumentEditor`). It has no formatting and no docked agent. An agent can
  change the file only with `write_file` or `edit_file`
  (`packages/agents/src/capabilities/files.specs.ts`), which write to disk
  beside the open draft. A new Markdown file can be created from "+ New → New
  text file", but the Files tree
  (`web/src/components/workspaces/WorkspaceTree.tsx`) offers only "New folder".
- **The String node on the canvas.** Its editor
  (`web/src/components/properties/TextEditorModal.tsx`) has a formatted mode
  and a docked chat with five `ui_editor_*` tools
  (`web/src/lib/tools/builtin/editorTools.ts`). The node stores
  `getTextContent()`, a plain string, so formatting is lost on close. The text
  lives inside the workflow graph, not in a file.

Moving text between the two creates copies. `SaveTextFile` writes a new file on
every run, because its default name is a timestamp
(`packages/text-nodes/src/nodes/text-extra.ts`). The saved file has no link
back to the node, since `packages/runtime/src/run-file-asset.ts` records no
node id. Uploading the edited file to the canvas makes a third copy. The
reported result is three unsynchronized versions of one text: the node value,
the saved file, and the re-uploaded file.

The reporter asked for one workspace in the browser that creates, opens,
formats, autosaves and co-edits a document with an agent, and does not care
which file format backs it.

## Decisions

D1 to D3 were agreed before this PRD was written. D4 was agreed after a
comparison of seven replication options. D5 was agreed during review. D2 was
revised and D6 was added for phase 5.

- **D1 — Markdown is the document.** The saved file is plain Markdown. The
  editor state is derived from it on open. This is the reverse of the
  storyboard Text view, where Markdown is a projection of saved JSON. The
  document title header displays and renames the file name without adding a
  non-Markdown block to the file.
- **D2 — Staged agent approval by default, with a direct-apply toggle.** When
  a document is open, edits proposed by the docked agent appear separately so
  the person can accept, reject, or edit the proposed version before writing.
  A toggle switches to direct-apply mode, where agent edits write immediately
  with per-block marks and revert (R9). Headless agent runs with no editor
  open still write directly and record a pre-turn version (R11).
- **D3 — Workflows reference documents.** A workflow reads and writes the
  document file itself. This is in scope for the first release.
- **D4 — Blocks replicate as whole values.** When documents become
  replicated, each block is an entity in the cloud sync plan's core and its
  Markdown is one value. The first release saves whole files. No second
  stored CRDT is added for documents. See Relation to the CRDT plan.
- **D5 — One save node per type.** Each pair of save nodes merges into the
  name without "File". Old workflows keep working because their nodes are
  mapped to the new types on load. The DSL functions named after the old types
  are removed. See Save node consolidation.
- **D6 — Draft-first voice dictation.** Dictated voice input lands in the chat
  composer as an editable draft rather than auto-sending, while still allowing
  a send before transcription finishes or a cancel without transcribing. This
  behavior applies globally across chat composers.

## Goals

1. One document is one file. Every surface that shows or changes it (editor
   tab, agent, workflow run, CLI) works on that file.
2. The project browser creates, organizes, and opens documents in a formatted
   editor that saves on its own, with comfortable zoom and paper themes.
3. An agent docked beside the editor reads the document and persistent
   selection, accepts voice-dictated instructions, and proposes edits for
   review (or applies them directly when direct-apply mode is toggled on).
4. Every revision is reversible, through staged approval, per-block revert in
   direct-apply mode, and named snapshots with side-by-side comparison.
5. A workflow can take a document as input and write its result back to a
   document without creating a copy.
6. A document can be imported from and saved out to common formats using the
   existing conversion stack, with destination folder selection on Save As.

## Non-goals

- **No page layout.** Fonts, text colour, text alignment (left, center,
  right), margins and page breaks are outside what Markdown stores. D1
  excludes them. View-only zoom and paper background themes (R30) do not alter
  the saved file.
- **No realtime co-editing in this PRD.** The cloud sync plan owns
  replication (see Relation to the CRDT plan). This PRD ships whole-document
  saves with the existing compare-and-swap, and meets R20 to R22 so the
  document can become a replicated document later.
- **No comment threads.** Staged proposal review is in scope (D2), while
  threaded inline comments are not.
- **No legacy binary `.doc`, `.rtf`, or DOCX export.** Import and Save As stay
  within the existing format libraries: import `.md`, `.txt`, `.html`,
  `.docx`, `.pdf`, and Google Docs, and export `.md`, `.txt`, `.pdf`, `.html`,
  and Google Docs.
- **No merge of script or storyboard into this editor.** Both keep their
  schemas and their editors. The editor shell is built so the storyboard Text
  view can move onto it later.
- **No change to code and data files.** JSON, YAML, CSV, TSV and source files
  stay in the Monaco editor. Plain `.txt` stays there too (see Open
  questions).

## Relation to the CRDT plan

The [cloud sync PRD](../plans/native-cloud-sync/prd.md) plans replicated
documents: timelines in its phase 3, scripts and storyboards in its phase 5.
Its two designs
([timeline](../plans/native-cloud-sync/timeline-crdt-design.md),
[storyboard and script](../plans/native-cloud-sync/storyboard-script-crdt-design.md))
share one core, and each document kind supplies a profile of entities and
registers. The core library, Automerge or a custom core, is chosen after that
plan's phase 0. A separate draft,
[multiplayer-design.md](../multiplayer-design.md), proposes Yjs for the
workflow canvas.

Neither design covers this document kind. The cloud sync PRD treats a
Markdown file as a media asset or a workspace file: when both sides changed
it, both files are kept. `text` is also absent from
`SHARED_DOCUMENT_TYPES` in `packages/models/src/document-sharing.ts`, so a
document has no viewer or editor role today.

This PRD does not build replication. It fixes four points so that a profile
for documents can be added without changing the editor or the file format.

| This PRD | Rule in the CRDT designs | Match |
| --- | --- | --- |
| A block is the merge unit (R5). | Entities with registers, ordered by run-preserving order keys (E2). | A block becomes an entity. Its content and its position become registers. |
| Staged agent edits wait for approval, and in direct-apply mode or headless runs a block the person changed keeps the person's text (R8). | A generated write defers to a person's concurrent value and is offered as an alternative (E6, rule J5). | Same outcome. In direct-apply mode D2 writes whenever no person edited the block concurrently. |
| A restore creates a new version (R11). | A restore is a new transaction and never rewinds (amendment A3). | Same rule. |
| A write from outside the editor is compared with the last saved content (R22). | A whole-document save is converted relative to the base the client was sent (rules V1 to V3). | The same conversion, with the Markdown file as the whole document. |

### Replication target

D4 came out of comparing seven options, including Yjs with the Lexical
binding and a text sequence in Automerge or Loro.

- **Replicated state.** Each block is an entity in the cloud sync plan's
  core. Its content register holds the block's raw Markdown as a whole value.
- **First release.** Whole-file saves with compare-and-swap and a block-level
  three-way merge, on the same block model. Replication later sends the same
  block operations through that plan's transaction log.
- **No second stored CRDT.** A rich-text tree as the stored state makes the
  Markdown file an export, which breaks R4 and splits open and closed agent
  edits into two code paths. A character sequence holding Markdown can merge
  two edits into broken syntax, and after a long offline period it interleaves
  two rewrites of a paragraph with no conflict shown. Both would also add a
  second sync protocol, store and authorization path beside the plan's core.

The cost is stated in Q5: two people who type in one block at the same time
get a conflict, where a character-level merge would combine them.

Q8 under Open questions needs a decision from the owners of the cloud sync
plan.

## Terms

- **Document.** A Markdown file in a project folder, listed today as the
  `text` kind in `ProjectDocumentKind` (`packages/models/src/document-index.ts`).
  It is a text asset: the file is the content, and the asset row holds owner
  and timestamps ([Project folders](../workspaces.md)).
- **Block.** One top-level Markdown element: a heading, paragraph, list,
  table, code block, quote or image. Blocks are the unit for merging, change
  highlights and reverts.
- **Agent turn.** One user message to the docked agent and all edits made in
  response.

## User stories

1. **Write.** I right-click a folder in the project browser and choose "New
   document". An empty page opens immediately with a clickable title field at
   the top. I rename it, add headings and lists from the toolbar, zoom to a
   comfortable reading size on a gray paper background, and close the tab
   without pressing save. The file in that folder holds my text.
2. **Co-edit.** I select two paragraphs and click into the docked agent to
   dictate an instruction. The selection stays highlighted on the page while I
   review my transcribed draft and send it. The agent proposes a revision in a
   separate preview where I edit one sentence and accept it. When I want
   faster iteration, I toggle direct-apply mode and revert individual marked
   blocks instead.
3. **Ask in place.** I select a sentence and a prompt opens beside it. I type
   "make this more formal", tweak the proposed text in the popover, and click
   Replace. The sentence is replaced as one undo step.
4. **Snapshots.** Before a major rewrite I click "Snapshot" in the top bar.
   Later I click "Open Snapshots" to enter three-panel Snapshots Mode, keep
   editing on the left, copy a scene fragment (`Ctrl+C`/`Ctrl+V`) from the
   read-only snapshot in the center, and keep the Snapshot List above the AI
   Assistant on the right with a draggable divider. From the snapshot context
   menu I rename, restore (after confirming), or delete a snapshot.
5. **Use in a workflow.** I add my document to a workflow as an input and
   connect it to an Agent node. I edit the document, run again, and the run
   reads the new text. The workflow's result is written to a second document.
   Running three times leaves one result file with three versions.
6. **Leave the String node.** I open a String node that holds two pages of
   text and choose "Convert to document". The node now shows the document's
   name. Opening it shows the same editor tab as the project browser.
7. **Headless.** In chat with no editor open: "Tighten the intro of
   launch-notes." The agent edits the file. When I open it, the change is
   there, and version history shows the state before the agent's turn.
8. **Share.** I click "Save As", pick a destination folder, and save the
   document as Markdown, plain text, PDF, HTML, or a Google Doc. In the file
   browser I right-click a PDF or DOCX file and convert it into an editable
   document that opens immediately.

## Requirements

### Functional

- **R1 — Editor and title header.** A `.md` file opens in a formatted editor
  in both tab types that can show it today (`text` and `workspace-file`). The
  editor is built on Lexical, which the web app already ships. View mode and
  edit mode merge into one editable surface. Above the formatting toolbar sits
  a wide, clickable document title field styled larger than H1 that renames
  the document file directly without storing a title block in the Markdown
  body (D1).
- **R2 — Formatting set.** Three heading levels (H1, H2, H3), bold, italic,
  strikethrough, inline code, links, bulleted, numbered and task lists,
  increase and decrease list indentation, quotes, code blocks, tables, images,
  horizontal dividers, undo and redo. Each has a toolbar control, a keyboard
  shortcut where one is conventional, and Markdown typing shortcuts. Text
  alignment stays out of scope under D1.
- **R3 — Source view.** A toggle shows the Markdown source in Monaco. Edits in
  either view are edits to the same draft. Switching from Monaco back to
  Lexical reconciles the text against the pre-toggle state using R22, so
  untouched block ids and R9 change marks survive. Undo history is scoped to
  each view and does not carry across the toggle.
- **R4 — Byte-stable saves.** Opening and saving an unedited document writes
  identical bytes. An edit rewrites only the blocks it touched. Without this
  rule, `edit_file` matches and file diffs break after the first save. Each
  block keeps the source bytes it was parsed from, and a block the user did
  not change is written from those bytes. The stock `@lexical/markdown`
  export regenerates every block from the editor state and is not expected to
  reproduce source bytes, so R4 likely needs its own block codec. A1 tests
  this.
- **R5 — Autosave.** The editor saves through the shared controller in
  `web/src/stores/documentSync.ts`, with the block as its merge unit, and is
  added to the inventory that `npm run check:document-sync` checks. There is
  no save button requirement, and closing a tab flushes the draft.
- **R6 — Create, open, and file browser management.** "New document" appears
  in the "+ New" menu, the Files tree, the command menu and the home screen.
  In the Files tree it creates a Markdown file inside the selected folder and
  opens it immediately in the editor with the cursor in the page. The Files
  tree right-click context menu provides New document, New folder, Rename,
  Copy, Paste, Delete, and Import as document (R17) for supported source
  files.
- **R7 — Docked agent and persistent selection.** The editor has an agent
  panel built on `AssistantChatPanel`, as the script, storyboard, sketch and
  timeline editors have. The agent receives the focused document and the
  current selection. When focus moves from the page into the chat composer,
  the selected fragment stays active and visually highlighted in the editor so
  the target passage remains visible while writing or dictating an
  instruction.
- **R8 — One edit path.** An agent tool that edits a document reads the latest
  flushed draft and applies through the same block operations whether the
  document is open or closed. Before an agent turn runs against an open
  document, the editor flushes any dirty draft so the agent never patches
  stale disk bytes. In staged approval mode (default under D2), edits from the
  docked assistant are held as a pending proposal until accepted, and
  accepting writes through the same sync path. In direct-apply mode or
  headless runs with no editor open, edits apply immediately and show in an
  open editor without a reload, and a later autosave does not overwrite them.
  This holds for `edit_file` and `write_file` on a document path, not only for
  document-specific tools. Where the user edits a block while an agent write
  lands and both change the same block, [ADR
  0001](../adr/0001-document-sync-draft-wins.md) applies: the user's draft
  wins and the agent's value is listed as a conflict. This is the outcome
  extension E6 of the CRDT designs specifies for generated writes.
- **R9 — Staged approval and direct-apply trail.** By default when a document
  is open (D2), edits proposed by the docked assistant appear in a separate
  proposal view rather than modifying the document immediately. From that view
  the person can accept the proposed changes, reject them, or edit the
  proposed version before applying. Accepting writes the approved text to the
  document and records a pre-turn version (R11). A visible toggle switches to
  direct-apply mode, where agent edits write at once and each changed block is
  marked until the user edits it or dismisses the mark. Marks cover all block
  changes: a modified block offers a revert from the pre-turn version as one
  set-content operation, an inserted block offers a remove action, and a
  deleted block shows a restore action. Splits or merges that fall back to
  delete and create under R20 revert through those marks or through the
  per-turn restore in R11. A revert is the user's own edit and goes on the
  undo stack. Agent edits do not, as ADR 0001 requires. A block an agent
  changed records the turn id and the replaced block's id and content hash, so
  a revert can fetch the exact prior bytes from the pre-turn version.
- **R10 — Selection prompt.** Selecting text opens a prompt beside the
  selection, as `SelectionAssistPlugin` does in the storyboard Text view. The
  proposed replacement is editable directly inside the prompt before clicking
  Replace, in addition to Discard and follow-up refinement. Accepting a
  replacement is treated as a user-initiated edit: it lands as one undo step,
  does not add an R9 change mark, and does not create an R11 pre-turn version.
  An answer that is not a replacement is shown as a note and leaves the text
  unchanged.
- **R11 — Version history and Snapshots.** Documents store complete Markdown
  snapshots in `text_document_versions`, associated with the document but kept
  separate from the project folder so the file browser and the agent never see
  duplicate files. A snapshot is recorded on manual "Snapshot" (from the top
  bar or Snapshots panel), before the first applied edit of each agent turn
  (with a turn id threaded through tool execution, including headless CLI
  runs, so multiple edits in one turn produce one pre-turn version), before a
  workflow run writes the document, and at an interval while the user edits.
  When the document is open, the pre-turn version captures the live draft.
  Right-clicking a snapshot in the Snapshot List opens a context menu with
  **Rename**, **Restore**, and **Delete**. Both Restore and Delete require
  confirmation. Restoring a snapshot makes it the current editable document
  and records it as a new latest version in history while preserving every
  prior snapshot (and preserving the overwritten draft in history so nothing
  is lost). Logically, a snapshot is a complete copy of the Markdown and does
  not depend on replicated state, so history survives a change of sync design
  (storage may deduplicate or compress blobs underneath).
- **R12 — Document as workflow input.** In a workflow a Markdown document is a
  `document` value, the type the existing document nodes carry. No new value
  type and no new reference node is added. `nodetool.constant.Document` and
  `nodetool.input.DocumentInput` reference a document by its asset id.
  Renaming or moving the file does not break the reference. The node shows the
  document name and opens the editor tab on click. The picker lists the
  project's documents, so no upload step exists. Both nodes gain a `text`
  output that carries the document's Markdown as a string, because no node
  turns a document other than a PDF into text today. A run reads the saved
  file, and a run started from the app flushes an open draft first, as R8 does
  for an agent turn.
- **R13 — Write back to a document.** `nodetool.document.SaveDocument` (today
  `SaveDocumentFile`, renamed by R26) gains a target: a document picked as in
  R12. With a target it replaces or appends to that document's content, and it
  accepts Markdown text or a `document` value as the content. Repeated runs
  update one file and record one version per run (multiple writes to the same
  target within a single run still record one pre-run version). If the
  document is open with unsaved user edits when a run writes to it, ADR 0001
  applies: the user's dirty blocks win and the workflow's conflicting blocks
  are listed as conflicts. Without a target the node writes folder plus
  filename as today, and in the project folder a name that exists gets a
  numbered copy. `SaveText` keeps writing timestamped output files.
- **R14 — Convert a String node.** The String editor offers "Convert to
  document". It creates a document from the node's text and replaces the
  String node with a `nodetool.constant.Document` node that references it. The
  new node's `text` output takes over the String node's outgoing edges. After
  that, the node's editor is the document tab.
- **R15 — Provenance and validation.** A document written by a run records
  workflow, node and job ids. A document lists the workflows that reference
  it, backed by a reverse index in `packages/models/src/document-index.ts`.
  `validate_workflow` reports a reference to a deleted document.
- **R16 — Headless surface.** Create, read, edit, list versions, create
  version, rename version, delete version, restore, import and export are
  available as agent tools and CLI commands with no editor open, as
  [Harness-First Engineering](../HARNESS_FIRST.md) requires.
- **R17 — Import.** `.md`, `.txt`, `.html`, `.docx` and `.pdf` (plain text)
  files import as editable Markdown documents and open immediately in the
  editor. DOCX import keeps headings, lists, tables, links and emphasis.
  Import is available from "+ New", the Asset Library context menu, and the
  Files tree right-click context menu (R6). Legacy `.doc` and `.rtf` are out
  of scope.
- **R18 — Export and Save As.** A **Save As** action in the top bar (and the
  `export_document` agent tool) lets the person choose both the destination
  folder and the output format. Supported export formats are **Markdown
  (`.md`)**, **plain text (`.txt`)**, **PDF (`.pdf`)**, **HTML (`.html`)**,
  and **Google Doc** (R19). No new format libraries are added: DOCX, `.doc`,
  and `.rtf` export are out of scope.
- **R19 — Google Docs.** Import a Google Doc as a document and export a
  document to a new Google Doc, both from the editor. The agent tools
  `google_docs_read`, `google_docs_create` and `google_docs_append` exist and
  exchange plain text. R19 needs transfers that keep formatting and a file
  picker in the web app.
- **R20 — Stable block ids.** Every block has an id that survives saving,
  reopening, and edits to other blocks. The ids are stored outside the
  Markdown file, which stays plain Markdown (D1). The stored ids are a cache
  and the file is the truth. After an outside write, a block is matched to
  its id by content hash first, then by position and text similarity. A block
  that matches nothing is a delete and a create.
- **R21 — One operation set.** The editor, the agent tools and the file
  reconcile all change a document through the same block operations: create,
  delete, move and set content. Each operation records who made it: a
  person, an agent, a workflow run or an outside write. The editor does not
  depend on a library-specific collaboration binding such as `@lexical/yjs`.
- **R22 — Outside writes convert against a base.** A write that did not come
  through the editor (another Markdown editor, `edit_file` on a closed
  document, a workflow run) is turned into block operations by comparing it
  with the content NodeTool last saved. An unchanged block produces no
  operation and keeps its id.
- **R30 — Document display (zoom and paper theme).** The editor supports
  smooth visual zoom in and out to a comfortable reading size without changing
  the stored Markdown, exported formatting, or underlying typography. A
  display option switches the document page between a white background with
  black text and a gray background with black text.
- **R31 — Two workspace modes (Default Mode and Snapshots Mode).** The top bar
  provides three actions: **Snapshot** (saves a complete version), **Open
  Snapshots** (toggles Snapshots Mode), and **Save As** (R18). The editor runs
  in one of two workspace modes and never shows three panels by default:
  - **Mode 1 — Default Mode (two panels).** Left panel: Document Editor
    (clickable title field at top, formatting toolbar below it, main editing
    area below that). Right panel: AI Assistant at full height. No snapshot
    viewer or snapshot list is shown.
  - **Mode 2 — Snapshots Mode (three panels).** Opened only by clicking Open
    Snapshots, and closed cleanly back to Default Mode. Left panel: current
    document, fully editable. Center panel: selected snapshot rendered
    full-height as read-only and immutable, with a right-side scrollbar and
    selectable text that copies (`Ctrl+C` / `Cmd+C`) and pastes (`Ctrl+V` /
    `Cmd+V`) into the current document. Right panel: split vertically into an
    upper scrollable Snapshot List and a lower AI Assistant chat (with its own
    right-side scrollbar), separated by a mouse-draggable horizontal divider.
- **R32 — Draft-first voice dictation.** Across chat composers (D6), clicking
  the microphone icon or pressing a keyboard shortcut starts voice dictation,
  and clicking the same microphone icon or pressing the same shortcut stops
  it. Recognized text lands in the chat input field as an editable draft
  rather than auto-sending. Pressing `Enter` or clicking Send submits the
  instruction either after transcription completes or while transcription is
  still running (sending as soon as the transcript resolves). An `X` button on
  the opposite side of the chat input deletes the voice message without
  sending and without waiting for or requiring transcription.

### Document nodes

R23 to R25 cover the remaining nodes that carry a `document` value. The table
lists every such node. Two nodes with "Document" in their name are unrelated:
`vector.GetDocuments` returns vector store entries and `lib.svg.Document`
builds an SVG.

| Node | Today | With this PRD |
| --- | --- | --- |
| `nodetool.constant.Document`, `nodetool.input.DocumentInput` | Hold a document reference. The property already opens a text asset in the `text` tab. No output carries text. | R12 |
| `nodetool.document.SaveDocumentFile` | Writes folder plus filename. In the project folder, a name that exists gets a numbered copy. | R13, renamed to `SaveDocument` by R26 |
| `nodetool.input.DocumentFileInput` | Turns a local path into a `file://` reference. | R23 |
| `nodetool.document.LoadDocumentFile` | Reads a path from the host disk and returns the bytes. | R23 |
| `nodetool.document.ListDocuments` | Scans a host folder, `~` by default, for editable document files. Emits `file://` references. | R24 |
| `lib.pdf.*` | Retired. Previously took a PDF as a `document` value. | R25 |

- **R23 — Paths resolve to documents.** `DocumentFileInput` and
  `LoadDocumentFile` given a path to a document in the project output that
  document's asset id, so the value is the same document the editor and R12
  use. A project-relative path is read through `context.workspace`, which
  makes both nodes work in cloud projects. A path outside the project behaves
  as today.
- **R24 — Listing returns documents.** `ListDocuments` given a
  project-relative folder lists it through `context.workspace` and emits each
  project document with its asset id. A host folder behaves as today.
- **R25 — `lib.pdf.*` retired; `document` is editable documents only.** The
  `lib.pdf.*` nodes are retired (`lib.pdf.ExtractText` migrates to a Code node
  via `@nodetool-ai/sandbox-pdf`), and the `document` type represents editable
  Markdown documents rather than PDFs or binary office files. PDF import (R17)
  converts PDFs into editable Markdown documents.

### Save node consolidation

Five media types have two save nodes each: `SaveImage` and `SaveImageFile`,
and the same pair for audio, video, 3D models and text. Documents have only
`SaveDocumentFile`. The `File` variant has "Save to workspace", a folder path,
a filename and, for images and 3D models, an overwrite switch. It writes
through `writeSavedFile` (`packages/nodes-utils/src/save-target.ts`), which
puts the file in the project folder and records an asset. The plain variant
has a folder reference and a name. Only `SaveImage` uses that reference, as
the parent of a new asset. The other four read the reference's `uri`, and the
folder picker stores only an asset id, so a folder chosen in the picker has no
effect.

- **R26 — One save node per type.** Each pair merges into the name without
  "File": `nodetool.image.SaveImage`, `nodetool.audio.SaveAudio`,
  `nodetool.video.SaveVideo`, `nodetool.model3d.SaveModel3D` and
  `nodetool.text.SaveText`. `nodetool.document.SaveDocumentFile` becomes
  `nodetool.document.SaveDocument`. The merged node has the properties and
  the behavior of today's `File` variant, with an overwrite switch on every
  type. It outputs the saved value on `output` and the written path on
  `path`.
- **R27 — Old workflows map on load.** The mapping is a set of entries in
  `NODE_TYPE_MIGRATIONS` (`packages/protocol/src/graph.ts`).
  `migrateGraphNodeTypes` already applies that list on every graph load, on
  the server and in the editor store, and before validation. No stored
  workflow is rewritten. The table below gives the mapping.
- **R28 — The cloud profile keeps a save node.** The managed cloud removes
  the `File` variants today because they can write to a host folder
  (`CLOUD_HOST_FILE_NODES` in `packages/protocol/src/cloud-profile.ts`), and
  keeps the plain ones. After the merge the one node stays in the cloud
  palette, the host folder field is hidden there, and a run with "Save to
  workspace" off is refused. `writeSavedFile` already refuses it for a
  workspace in cloud storage.
- **R29 — Every list of node types follows.** The cloud profile lists, the
  lean server's feature catalog, the app export template
  (`packages/app-export/template/server/input-boundary.mjs`), the three
  generated DSL copies, the node documentation pages, the node catalog data,
  the shipped examples and the native graph runner's parity baselines name
  the new types. The old names resolve only through R27.

| Saved node | Becomes | Property mapping |
| --- | --- | --- |
| `SaveImageFile`, `SaveAudioFile`, `SaveVideoFile`, `SaveModel3DFile` | The same name without "File" | None |
| `SaveTextFile` | `SaveText` | `name` becomes `filename` |
| `SaveDocumentFile` | `SaveDocument` | None |
| `SaveImage`, `SaveAudio`, `SaveVideo`, `SaveModel3D`, `SaveText` saved in the old plain form | The same type | `name` becomes `filename`. `folder` keeps its saved folder reference. |

Four design points are decided.

- **Selecting the old plain form.** The plain form and the merged node share a
  type name, and a migration entry is selected by type today. The migration
  mechanism is extended so that an entry can also select on shape. The old
  form has `name` and no `filename`.
- **Folder references.** The merged node accepts a saved folder reference
  beside a path string. A reference to an asset folder resolves to that
  folder's path in the project, so an old `SaveImage` keeps writing to the
  same place.
- **Outputs.** `SaveAudioFile` returns the path as a string on an output
  declared as audio. `SaveDocumentFile` returns the path on `output` and
  declares no output type. Under R26 `output` carries the saved value and
  `path` the string, which changes what those two old nodes emit on `output`.
- **DSL names.** The DSL functions named after the old types, such as
  `saveImageFile`, are removed with them, and no alias is kept. A DSL script
  that calls one has to be changed to the new name. The mapping of R27 covers
  stored workflow graphs, not DSL source files.

### Non-functional

- The Markdown block model (parse, serialize, block identity, block diff) is
  a set of pure functions in a shared package, used by the editor, the server
  tools and the tests. `packages/protocol/src/storyboard-markdown.ts` is the
  precedent.
- Run-time reads and writes of a document go through `context.workspace`, so
  local and cloud projects behave the same.
- An agent edit to an open document is visible in the editor within one
  second of the tool result on a local server.
- The editor stays responsive on a 50,000-word document. R4's block codec
  tracks dirty top-level blocks incrementally, so autosave does not
  re-serialize or re-hash untouched blocks on every tick. Block diff and merge
  are tested on inputs of that size.
- New UI uses `ui_primitives` and design tokens, as the
  [Design System](../DESIGN.md) requires.

## Success measures

- The reported scenario leaves one file: create a document, edit it with the
  agent, run a workflow that reads it and writes a result, edit again, run
  again. The project folder holds one source document and one result
  document.
- A round-trip test opens and saves every Markdown file in a fixture corpus,
  including this repository's `docs/`, and finds no byte changes.
- A JTBD case ("shorten the selected section of the open document") passes
  through `nodetool jtbd run`, and a second case passes with the document
  closed.
- A workflow fixture with a document input and a document output runs through
  `nodetool debug` and leaves one new version on the output document.
- A person can go from the home screen to typing in a new document in two
  actions, or create and open one inside a chosen Files tree folder in one
  context-menu action.
- With an open document in default staged approval mode, an agent revision
  appears in the proposal view without modifying disk bytes until accepted,
  can be edited before accepting or rejected cleanly, and applies directly
  when the direct-apply toggle is on.
- Opening Snapshots Mode displays the editable document, the read-only center
  snapshot (supporting copy/paste into the current document), and the
  draggable split Snapshot List and AI Assistant panel, and closing returns to
  the two-panel Default Mode.
- Voice dictation puts transcribed text into the composer as an editable
  draft, supports sending before or after transcription finishes, and cancels
  without transcribing via the `X` button.
- Save As writes a copy to a chosen destination folder in `.md`, `.txt`,
  `.pdf`, or `.html`.

## Experiments

Three short tests check D4. Each is one to three days.

- **A1 — Byte-stable round trip.** Build the block codec of R4 for 20 to 30
  real Markdown files with tables, nested lists, code fences and reference
  links. Edit one paragraph in Lexical and save. D4 fails if keeping
  untouched blocks byte-identical requires working against Lexical's own
  normalization on every update.
- **A2 — Outside edits against a dirty draft.** Replay 50 recorded agent
  edits (string replacements, paragraph splits, multi-block rewrites) through
  the block merge and the id matching of R20. If more than 15% land on the
  wrong block or produce a conflict on a whole section, add a block-addressed
  edit tool or smaller entities (Q5).
- **A3 — Size and merge in the plan's core.** Model a 200-block document
  with 100 agent turns and a seven-day offline branch where both sides edit
  20 blocks, five of them the same. Measure state size, load time and how
  readable the conflicts are. If retained block values grow too large, the
  register holds a content hash and the text moves to stored blobs.

## Rollout

Five phases. Phases 1 to 4 and R26 to R29 are implemented. Phase 5 is planned.

1. **Editor (implemented).** R1 to R6. The browser becomes a usable text
   editor with no agent.
2. **Agent and versions (implemented).** R7 to R11, and the document tools of
   R16. Versions ship with the agent because R9's per-block revert and Goal
   4's per-turn restore both read from the pre-turn version.
3. **Workflow references (implemented).** R12 to R15 and R23 to R25.
4. **Import and export (implemented).** R17 to R19 for `.md`, `.txt`, `.html`,
   `.docx`, `.pdf`, and Google Docs.
5. **Writing workflow, staged approval, and Snapshots Mode (planned).**
   - **5a — Editor ergonomics, file actions, and Save As.** Clickable desktop
     title header (R1), list indent toolbar buttons (R2), Files tree New
     document / Copy / Paste / Import as document (R6, R17), Save As with
     folder picker and `.md`/`.txt`/`.pdf`/`.html`/Google Doc outputs (R18),
     and display zoom plus white/gray paper themes (R30).
   - **5b — Staged agent approval and voice dictation.** Persistent selection
     highlight on blur (R7), staged proposal review with accept, reject, edit,
     and direct-apply toggle (D2, R8, R9), editable inline selection proposal
     (R10), and draft-first global voice dictation (D6, R32).
   - **5c — Snapshots Mode and snapshot management.** Top bar `Snapshot`,
     `Open Snapshots`, and `Save As` actions, three-panel Snapshots Mode with
     read-only formatted center viewer and draggable right split (R31), and
     snapshot context-menu Rename, confirmed Restore (latest-entry history),
     and confirmed Delete across UI, tRPC, model, and headless tools (R11,
     R16).

R26 to R29 shipped independently of the editor. R13 depends on them for the
node name only.

R20 to R22 shipped with phase 1, since the block model of phase 1 defines ids
and operations. Replication of documents is a later phase of the cloud sync
plan, after a document profile is designed. Until then a document is a
whole-document format with today's merge behavior, as that plan describes for
workflows and sketches.

## Media embeds

A document holds images, video, audio clips, 3D models, storyboard shots,
timelines and voice scripts.
Every embed is Markdown image syntax, `![caption](src)`, so the file stays
readable in other Markdown editors. The `src` decides what the page shows
([`document-embeds.ts`](../../packages/protocol/src/document-embeds.ts)):

| `src` | Shows |
|---|---|
| A path relative to the document, such as `assets/teaser.mp4` | The project file, typed by its extension |
| `asset://<id>` | The asset, typed by its content type |
| A URL | The media at that URL, typed by its extension |
| `storyboard://<storyboard id>#shot=<shot id>` | The shot's selected clip, or its keyframe until it has a clip, with a link that opens the storyboard |
| `timeline://<timeline id>` | A player for the timeline, with a link that opens it in the timeline editor |
| `script://<script id>` | The voice script's lines with speaker, direction and the current take's audio, with a link that opens the script |

The toolbar's Insert media button opens a dialog with the project's media,
an upload button, a path or URL field, and Storyboard shot, Timeline and
Voice script tabs. Files dropped or pasted from the computer are saved to
`assets/` beside the document. Assets from the asset panel, files from the
Files panel (a timeline or script file embeds that document), shots dragged
from a timeline's storyboard panel and timelines from the timeline list are
embedded where they are dropped. Each embed is inserted as its own paragraph after the block the
caret is in. A project file is written as a relative path (Q2), any other
asset as its `asset://` locator. The document output renderer on node cards
shows the same embeds, and the chat agent's document guidance names the
syntax.

## Open questions

- **Q1 — Name.** "Document" is taken twice: the `document` tab previews PDF
  files (`DocumentSurface.tsx`), and `DocumentRef` in
  `packages/protocol/src/api-types.ts` is a binary document. The proposal is
  the user-facing label "Document" for this kind, with `text` kept as the code
  name. R12 reuses the `document` value type in workflows, so the label and
  the type agree there. The PDF tab needs another label.
- **Q2 — Images.** Phase 1 blocker for the write path. An image in a document
  can be stored as a path relative to the project folder or as an asset id. A
  relative path keeps the file readable in other Markdown editors. An asset id
  survives a move of the image. The proposal is a relative path, resolved
  through the [media resolution
  boundary](../../web/src/components/ui_primitives/STRATEGY.md#media-resolution-is-the-rendering-boundary),
  with pasted or dropped images saved to an `assets/` folder beside the
  document (or the project's asset folder) before inserting the relative link.
- **Q3 — Plain text.** A `.txt` file opened in a formatted editor would gain
  Markdown syntax on save. The proposal keeps `.txt` in Monaco and offers
  "Convert to document".
- **Q4 — Tab identity.** Phase 1 blocker. A `.md` file can open as a `text`
  tab (by asset id) or a `workspace-file` tab (by path). R1, R5, R8 and R12
  need one identity per file. The proposal is to make the asset id the
  canonical tab identity for project `.md` files (resolving path to asset id
  when opened from the Files tree) and deduplicate open tabs on that id.
- **Q5 — Whole-value blocks.** D4 treats a block's Markdown as one value, as the storyboard and script design does for a line (its D2).
  Three points stay open. First, two people who type in one paragraph at the
  same time get a conflict on that block. If that becomes a main use, the
  options are a sequence type in the plan's core or a live session layered
  over the stored blocks. Second, a long list or a table is one block today,
  so edits to two different rows would conflict. List items and table rows
  may need to be entities. Third, an agent's `edit_file` that splits or joins
  paragraphs falls back to delete and create under R20, which loses the
  per-block revert. A tool that addresses a block by id would avoid that.
- **Q6 — Version retention.** Interval checkpoints need a cap or a thinning
  rule. The existing version tables are the reference.
- **Q7 — Google sign-in on local installs.** Google access requires the
  Supabase Google login ([Google Workspace](../google-workspace.md)), which a
  local install without a login does not have. R19 may be cloud-only at
  first.
- **Q8 — Sharing and cloud status.** For a document to be a cloud document
  with viewer and editor roles, `text` must join `SHARED_DOCUMENT_TYPES`, and
  the cloud sync PRD's capability matrix needs a row for it. Until then a
  linked project transfers a document as a file and keeps both copies when
  both sides changed.
- **Q9 — Voice dictation shortcut.** Pick a default keyboard shortcut for
  starting and stopping dictation (R32) that does not collide with OS input
  switching or Lexical editing shortcuts on macOS, Windows, and Linux.
- **Q10 — Paper background default.** Decide whether the white/gray paper
  background option (R30) overrides the workspace dark theme by default or
  defaults to the workspace theme until toggled, and whether the choice
  persists per user across documents.
