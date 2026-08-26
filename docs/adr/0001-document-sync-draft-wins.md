---
status: accepted
---
# External document changes merge into the draft, and the draft wins

An agent, the CLI, or another tab writes a document while an editor holds a dirty draft. Before this decision the editor kept the draft and the next autosave failed the `updated_at` CAS with no way forward except a refresh. We now merge the external change into the draft per merge unit (shot, clip, layer, line, node, edge). Where both sides changed the same unit the draft wins and the external value is listed in a document-level conflict banner. An external change never enters the undo stack: Cmd-Z only reverts the user's own edits, so undo cannot silently delete an agent's work.

## Considered options

- Server-side merge: rejected, the server does not know which units the user is still typing in.
- Locks for the duration of an agent run: rejected, a run takes minutes and would block the editor.
- Agent wins on a conflict: rejected, it drops keystrokes the user can see.
- External changes on the undo stack: rejected, undo would remove work the user did not make and write that removal back to the server.

## Consequences

- The `resource_change` payload carries the ops the write was made with. The headless bridge attaches its `ui_*` op list to the document mutation, and the server broadcasts it as the patch. The document mutations keep their whole-section inputs.
- A write with no ops (another tab's autosave, a CLI restore) is one merge unit: a dirty draft keeps everything and the banner lists one conflict, "document replaced elsewhere".
- Draft wins also over an external delete: a unit the user is editing survives, and the next autosave recreates it.
- An agent write that fails the CAS re-reads and reapplies its ops once, then fails the tool call.
- Accepting an external value from the conflict banner is the user's own edit and goes on the undo stack.
- A dangling edge (its node deleted in the draft) is dropped and listed as a conflict.
