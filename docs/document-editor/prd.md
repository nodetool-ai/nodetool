# Document Editor — PRD

> Status: draft · Owner: matti

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

Agreed before this PRD was written.

- **D1 — Markdown is the document.** The saved file is plain Markdown. The
  editor state is derived from it on open. This is the reverse of the
  storyboard Text view, where Markdown is a projection of saved JSON.
- **D2 — Agent edits apply directly.** There is no accept step. Suggestion
  mode is a non-goal for this version.
- **D3 — Workflows reference documents.** A workflow reads and writes the
  document file itself. This is in scope for the first release.

## Goals

1. One document is one file. Every surface that shows or changes it (editor
   tab, agent, workflow run, CLI) works on that file.
2. The project browser creates and opens a document in a formatted editor
   that saves on its own.
3. An agent docked beside the editor reads the document and the selection,
   and its edits appear in the open editor.
4. Every agent edit can be reverted, per change and per turn.
5. A workflow can take a document as input and write its result back to a
   document without creating a copy.
6. A document can be brought in from, and sent out to, formats that people
   outside NodeTool use.

## Non-goals

- **No page layout.** Fonts, text colour, alignment, margins and page breaks
  are outside what Markdown stores. D1 excludes them.
- **No multi-user realtime editing.** No CRDT is installed, and
  [multiplayer-design.md](../multiplayer-design.md) covers the workflow canvas
  only. Two tabs on one document keep the existing compare-and-swap behavior.
- **No suggestion mode and no comment threads.** See D2.
- **No merge of script or storyboard into this editor.** Both keep their
  schemas and their editors. The editor shell is built so the storyboard Text
  view can move onto it later.
- **No change to code and data files.** JSON, YAML, CSV, TSV and source files
  stay in the Monaco editor. Plain `.txt` stays there too (see Open
  questions).

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

1. **Write.** I choose "New document" in the project browser. An empty page
   opens. I type, add a heading and a table from the toolbar, and close the
   tab without pressing save. The file in my project folder holds my text.
2. **Co-edit.** I select two paragraphs and ask the docked agent to shorten
   them. The paragraphs change in place and are marked as changed. I revert
   one of them and keep the other.
3. **Ask in place.** I select a sentence and a prompt opens beside it. I type
   "make this more formal". The sentence is replaced as one undo step.
4. **Undo a turn.** The agent rewrote half the document and I dislike it. I
   open version history and restore the version from before that turn.
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
8. **Share.** I export the document as PDF or DOCX, or send it to Google
   Docs. I import a DOCX and get a document with its headings, lists and
   tables.

## Requirements

### Functional

- **R1 — Editor.** A `.md` file opens in a formatted editor in both tab types
  that can show it today (`text` and `workspace-file`). The editor is built on
  Lexical, which the web app already ships. View mode and edit mode merge into
  one editable surface.
- **R2 — Formatting set.** Headings, bold, italic, strikethrough, inline
  code, links, bulleted, numbered and task lists, quotes, code blocks, tables,
  images and horizontal rules. Each has a toolbar control, a keyboard
  shortcut where one is conventional, and Markdown typing shortcuts.
- **R3 — Source view.** A toggle shows the Markdown source in Monaco. Edits
  in either view are edits to the same draft.
- **R4 — Byte-stable saves.** Opening and saving an unedited document writes
  identical bytes. An edit rewrites only the blocks it touched. Without this
  rule, `edit_file` matches and file diffs break after the first save.
- **R5 — Autosave.** The editor saves through the shared controller in
  `web/src/stores/documentSync.ts`, with the block as its merge unit, and is
  added to the inventory that `npm run check:document-sync` checks. There is
  no save button requirement, and closing a tab flushes the draft.
- **R6 — Create and open.** "New document" appears in the "+ New" menu, the
  Files tree, the command menu and the home screen. It creates a Markdown
  file in the current project and opens it with the cursor in the page. The
  Files tree gains a "New file" action.
- **R7 — Docked agent.** The editor has an agent panel built on
  `AssistantChatPanel`, as the script, storyboard, sketch and timeline editors
  have. The agent receives the focused document and the current selection.
- **R8 — One edit path.** An agent tool that edits a document has the same
  result whether the document is open or closed. When it is open, the edit
  shows in the editor without a reload, and a later autosave does not
  overwrite it. This holds for `edit_file` and `write_file` on a document
  path, not only for document-specific tools. Where the user and the agent
  changed the same block, [ADR 0001](../adr/0001-document-sync-draft-wins.md)
  applies: the user's draft wins and the agent's value is listed as a
  conflict.
- **R9 — Direct edits with a trail.** Agent edits apply at once (D2). Each
  changed block is marked until the user edits it or dismisses the mark. Each
  mark offers a revert that restores the block's previous content. A revert
  is the user's own edit and goes on the undo stack. Agent edits do not, as
  ADR 0001 requires.
- **R10 — Selection prompt.** Selecting text opens a prompt beside the
  selection, as `SelectionAssistPlugin` does in the storyboard Text view. A
  replacement lands as one undo step. An answer that is not a replacement is
  shown as a note and leaves the text unchanged.
- **R11 — Version history.** Documents get stored versions. Text assets have
  none today, while workflows, sketches, JS scripts and timelines do. A
  version is recorded before the first edit of each agent turn, before a
  workflow run writes the document, on a manual "Save version", and at an
  interval while the user edits. The editor lists versions with their cause
  and restores one as a new version.
- **R12 — Document as workflow input.** A node references a document by its
  id and outputs its current text at run time. Renaming or moving the file
  does not break the reference. The node shows the document name and opens
  the editor tab on click. The picker lists the project's documents, so no
  upload step exists.
- **R13 — Write back to a document.** A save node takes a document as its
  target and replaces or appends to its content. Repeated runs update one
  file and record one version per run. `SaveTextFile` keeps its current
  behavior for timestamped output files.
- **R14 — Convert a String node.** The String editor offers "Convert to
  document". It creates a document from the node's text and replaces the
  stored string with a reference to it. After that, the node's editor is the
  document tab.
- **R15 — Provenance and validation.** A document written by a run records
  workflow, node and job ids. A document lists the workflows that reference
  it. `validate_workflow` reports a reference to a deleted document.
- **R16 — Headless surface.** Create, read, edit, list versions and restore
  are available as agent tools and CLI commands with no editor open, as
  [Harness-First Engineering](../HARNESS_FIRST.md) requires.
- **R17 — Import.** `.md`, `.txt` and `.docx` files and PDF text import as
  documents. DOCX import keeps headings, lists, tables, links and emphasis.
  The `convert_document` tool already reads DOCX and HTML into Markdown.
- **R18 — Export.** PDF, DOCX and HTML export from the editor and from an
  agent tool. Markdown to PDF exists (`convert_markdown_to_pdf`). No code
  writes DOCX today, so R18 adds a dependency.
- **R19 — Google Docs.** Import a Google Doc as a document and export a
  document to a new Google Doc, both from the editor. The agent tools
  `google_docs_read`, `google_docs_create` and `google_docs_append` exist and
  exchange plain text. R19 needs transfers that keep formatting and a file
  picker in the web app.

### Non-functional

- The Markdown block model (parse, serialize, block identity, block diff) is
  a set of pure functions in a shared package, used by the editor, the server
  tools and the tests. `packages/protocol/src/storyboard-markdown.ts` is the
  precedent.
- Run-time reads and writes of a document go through `context.workspace`, so
  local and cloud projects behave the same.
- An agent edit to an open document is visible in the editor within one
  second of the tool result on a local server.
- The editor stays responsive on a 50,000-word document. Block diff and merge
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
  actions.

## Rollout

Four phases. Each one ships alone.

1. **Editor.** R1 to R6. The browser becomes a usable text editor with no
   agent.
2. **Agent and versions.** R7 to R11, and the document tools of R16. Versions
   ship with the agent because R9 depends on them.
3. **Workflow references.** R12 to R15.
4. **Import and export.** R17 to R19.

Phases 1 and 2 answer the main request. Phase 3 removes the copies. The
reporter called phase 4 secondary.

## Open questions

- **Q1 — Name.** "Document" is taken twice: the `document` tab previews PDF
  files (`DocumentSurface.tsx`), and `DocumentRef` in
  `packages/protocol/src/api-types.ts` is a binary document. The proposal is
  the user-facing label "Document" for this kind, with `text` kept as the
  code name. The PDF tab needs another label.
- **Q2 — Images.** An image in a document can be stored as a path relative to
  the project folder or as an asset id. A relative path keeps the file
  readable in other Markdown editors. An asset id survives a move of the
  image. The proposal is a relative path, resolved through the
  [media resolution boundary](../../web/src/components/ui_primitives/STRATEGY.md#media-resolution-is-the-rendering-boundary).
- **Q3 — Plain text.** A `.txt` file opened in a formatted editor would gain
  Markdown syntax on save. The proposal keeps `.txt` in Monaco and offers
  "Convert to document".
- **Q4 — Tab identity.** A `.md` file can open as a `text` tab (by asset id)
  or a `workspace-file` tab (by path). R8 and R12 need one identity per file.
- **Q5 — Same-block conflicts.** Under ADR 0001 the user's draft wins a
  block that both sides changed. For prose, a paragraph may be too large a
  unit when the user is typing in the paragraph the agent was asked to fix.
- **Q6 — Version retention.** Interval checkpoints need a cap or a thinning
  rule. The existing version tables are the reference.
- **Q7 — Google sign-in on local installs.** Google access requires the
  Supabase Google login ([Google Workspace](../google-workspace.md)), which a
  local install without a login does not have. R19 may be cloud-only at
  first.
