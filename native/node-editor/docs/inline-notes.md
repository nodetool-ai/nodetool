# Inline node notes and group headlines

The web's [EditableTitle](../../../web/src/components/node/EditableTitle.tsx)
is a multiline note below an ordinary node card. It is separate from the
metadata header. `graphNodeToReactFlowNode` and `reactFlowNodeToGraphNode`
map this note to `ui_properties.title`. The native canvas now keeps that
separation. More → Edit note creates the first note, and a double-click on its below-card
surface opens the shared native text editor.

[InlineTitlePresenter](../src/graph/InlineTitlePresenter.cpp) owns passive note
items and one transient Quick editor. Enter commits the raw note string,
Shift+Enter inserts a newline, Escape cancels, and deliberate blur commits.
Leaving the note unchanged creates no command. The hover remove control stores
an empty title string, matching the web remove action. Editing and removing use
one undoable document command and preserve unrelated UI fields. The note editor
grows with text while it fits in the viewport. Taller drafts use a bounded
scrollable viewport that keeps the caret visible. The host supplies the canvas
area outside floating selection and Run controls, so the editor does not cover
or sit behind those controls.

More → Rename group or a double-click on a group's label edits
`data.headline`, following
[GroupNode](../../../web/src/components/node/GroupNode.tsx). Native commits the
final edit once on Enter or blur. Escape cancels the draft. This differs from
the web group's debounced writes during typing, while preserving the same
stored field. The group editor uses the same zoom compensation and medium
15-pixel base font as the painted headline. Ordinary notes retain card zoom
sizing. Group headlines remain single-line and strip pasted line breaks like
the web text input. Comment nodes retain their separate body editor and have no additional
note surface.

The presenter cancels on node/document projection, selection switches and host
credential/document epochs. Queued commits carry an activation token and
revalidate the selected node and starting text. Quick editor shortcuts stay
within its window. Note geometry follows card resizing, runtime output-height
changes, graph positions, viewport pan and zoom without editing the document.

[InlineTitleTest](../tests/ui/InlineTitleTest.cpp) drives actual canvas
double-clicks and editor keys. It covers multiline whitespace, no-op commit,
Escape, blur, remove/undo, group storage, comment isolation, stale scope guards,
shortcut ownership, resized/runtime geometry, matching group edit/paint font
sizes and commits at 25%, 100% and 200% zoom, first-note creation, long-note
autogrowth and caret scrolling, single-line group paste, and both theme captures.

Remaining differences are explicit. Editable Code headers use the web's
`NodeHeader`/`codeNodeUi` rules and are not part of this native editor. Code
nodes have no below-card note, as in BaseNode. The web's emoji desaturation,
numbered-keycap badges and tail styling are not fully reproduced. Native note
removal has a pointer hover target; a separate keyboard-focused removal control
is not yet provided. Rich-text comment editing remains separate work.
