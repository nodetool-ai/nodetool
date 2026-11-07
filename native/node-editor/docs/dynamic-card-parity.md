# Dynamic card authoring

This contract covers F04 rows 1, 2, 7 and the card part of row 8 in
[the parity table](parity.md#f04-dynamic-inputs-and-outputs), plus the linked
F03 Add input wire target. The [inventory](parity-inventory.md) remains the
acceptance record for complete feature parity.

## Card behavior

1. D1: Generic cards show metadata-enabled Add input and Add output actions.
   Content cards add inputs immediately from their footer. Its labels follow
   `getDynamicInputLabel` in
   [contentCardRegistry.ts](../../../web/src/components/node_types/contentCardRegistry.ts):
   Add another variable, image input, video input, audio input, text input or
   input. Footer actions align left and the painter supplies the plus icon.
   Subgraph output and Prompt variable controls retain their existing routes.
2. D2: Generic Add input opens a Name field. Add output opens Name and Type,
   initially str, with bool, int, float and str choices. Enter submits, Escape
   cancels, and invalid names keep the draft and error visible. The type select
   commits its controlled value before the add command reads it. The inspector
   retains its full I/O editor, and content/subgraph output actions retain their
   existing popup.
3. D3: Double-clicking a dynamic input label or pressing its edit control opens
   a rename field anchored to that label. Enter or blur commits, Escape cancels,
   and validation failure keeps the draft. A connected input can rename. The
   existing inspector type picker keeps its connected and schema-driven gates.
4. D4: Content Add input finds the first `input_N` absent from dynamic values,
   declarations and static input names. It submits `addDynamicInput` without a
   type, preserving the empty-string default and one undo entry.
5. D5: Releasing a wire on Add input forces a fresh typed input even when an
   existing input fits. The new input and edge use the existing atomic command
   path. Reroute, Preview and control-wire priorities remain ahead of this path,
   and schema-only restrictions remain in force.

`WorkflowDocument::applyCommand` validates metadata support, reserved names,
static/dynamic collisions and declaration shapes. Rename moves the value and
declaration and rewrites edge handles in one undo entry. Card controls reuse
these commands through `DynamicPortsController`. Canonical port enumeration,
hidden custom-body ports and stored edges are not rewritten for presentation.

## Ownership and lifetime

| File | Responsibility |
| --- | --- |
| [NodeLayout.h](../src/graph/NodeLayout.h) | Dynamic label and edit-control hit rectangles |
| [WorkflowGraphModel.cpp](../src/graph/WorkflowGraphModel.cpp) | Action rows, labels and rename geometry, with one static-name set per layout |
| [EditorScene.cpp](../src/graph/EditorScene.cpp) | Pointer handling and add/rename requests |
| [CompatibleNodePicker.cpp](../src/graph/CompatibleNodePicker.cpp) | Card-local forced-input drop detection and existing atomic connection path |
| [EditorWindow.cpp](../src/ui/EditorWindow.cpp) | Pinned popup host, bounds and teardown |
| [DynamicPortDialog.qml](../qml/DynamicPortDialog.qml) | Fields, keyboard submission, controlled type selection and validation |
| [DynamicCardTest.cpp](../tests/ui/DynamicCardTest.cpp) | Native pointer/key, document, undo, lifetime and capture checks |

Each popup owns a controller pinned to its original node. Selection, document
or account changes cancel the popup, and removing its node makes the controller
read-only. Cancel/place callbacks guard both widget and dialog with `QPointer`.
Cancellation connections use the Quick child as their receiver context. The
controller is a Quick child so it outlives the QML root's teardown.

Both editor-owner and tab destruction cancel and delete every dynamic popup,
including closed generations awaiting deferred deletion, before destroying
panels or the scene. Marking the root finished prevents a blur commit during
teardown. A deleted Quick child cannot leave a callback reading its root.

Validation changes resize and reclamp the popup within the editor and available
screen area. Native primitives supply the fields, theme roles and named metrics.
No shared primitive, web, controller or document command implementation is added.

## Verification boundaries

1. A1: `genericCardAddsNamedInputsAndOutputs`, `outputTypeSelectionPersists` and
   `addValidationCancelAndStaleSelection` drive named adds, the actual type
   select, invalid/static/duplicate names, cancellation and stale selection.
2. A2: `contentFooterSkipsStaticNamesAndUndoes` checks immediate addition,
   collision skipping and undo/redo. `contentFooterLabels` checks output-derived
   and template labels, named primary outputs and left alignment.
3. A3: `cardRenamePreservesConnectedValuesAndEdges` and
   `editControlRenamesOnBlurAndEscapeCancels` cover label/edit entry points,
   Enter, blur, Escape, retained values and edge metadata, and atomic undo.
4. A4: `addInputWireTargetForcesNewSlotAndRejectsSelfConnection` checks fresh
   input creation despite fitting ports, atomic undo and refused self-connection.
5. A5: `readOnlyCollapsedAndRoundTripPreserveCanonicalData` checks read-only
   pointer gating, collapsed controls and round trip. `popupTeardown` covers
   owner/tab destruction, deferred popups and child-widget deletion followed by
   shared controller signals without document mutation. Tests fail on QML
   TypeError, binding-loop and rearrange warnings. `manyDynamicLabelsKeepCanonicalPorts`
   exercises a large dynamic input set without changing its canonical data.
6. A6: `captures` checks popup/error bounds in dark/light at 1280×720 and
   960×1000. Set `NODETOOL_DYNAMIC_CARD_CAPTURE` to retain separate editor,
   popup and validation-error images. A popup-specific image is required because
   an editor widget grab does not include a separate popup window.

Run the `node_editor_dynamic_card` CTest target from the configured native build.
Related checks are `node_editor_dynamic_ui`, `node_editor_dynamic_ports`,
`node_editor_card_bodies`, `node_editor_subgraph_card`, `node_editor_body_connection`
and `node_editor_body_drop_host`. These verify the shared projection and hit paths.
Native tests and widget captures do not establish platform compositor, pointer
or IME acceptance, a complete card type-picker match, or complete F04 parity.
