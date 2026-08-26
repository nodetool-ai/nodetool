# NodeTool

Visual AI workflow platform. Documents (workflows, timelines, sketches, storyboards, scripts, apps) are edited in the browser and by agents at the same time.

## Language

### Document sync

**Document**:
A saved row a person edits in an editor and an agent edits headlessly: workflow, timeline sequence, sketch, storyboard, script, JS script, app.
_Avoid_: resource (that is the wider set, including assets and jobs, which have no editor draft)

**Base**:
The server version of a document the editor last loaded or saved. Identified by its `updated_at` token.
_Avoid_: snapshot, original

**Draft**:
The editor's copy of a document, including edits the server has not accepted yet.
_Avoid_: local state, working copy

**Dirty**:
A draft that differs from its base.

**External change**:
A write to a document made by something other than this editor: an agent, the CLI, another tab.
_Avoid_: remote change, agent change

**Merge**:
Applying an external change onto a dirty draft. Changes to different merge units combine. Changes to the same merge unit are a conflict.

**Merge unit**:
The smallest part of a document that a merge treats as one value: a shot, a clip, a layer, a script line, a node, an edge.

**Conflict**:
An external change and a draft edit to the same merge unit. The draft wins; the external value is kept and listed in the conflict banner.
_Avoid_: collision, clash

**Conflict banner**:
The one document-level notice that lists every conflict and lets the user accept or discard each external value.

**Accept**:
The user takes an external value from the conflict banner into the draft. An accept is the user's own edit and is undoable.

**Ops**:
The per-merge-unit operations an edit was made with (the `ui_*` op list). The headless bridge attaches them to a document write, and the server broadcasts them as the patch.

**Dangling edge**:
An edge from an external change whose node no longer exists in the draft. Dropped and listed as a conflict.
