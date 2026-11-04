# Native editor parity inventory

This inventory compares the checked-out web editor with the native QtNodes host.
It records source inspection, not a declaration that parity tests passed. Changes
being made concurrently remain unverified until native acceptance evidence is
attached to the relevant row. No web or npm tests are required by this inventory.

The web entry points are `web/src/components/workspace/WorkflowEditorSurface.tsx`,
`web/src/components/node_editor/NodeEditor.tsx`, and
`web/src/components/node/ReactFlowWrapper.tsx`. The first supplies document,
workspace, setup, conflict, queue, and subgraph integration. The second supplies
editor commands and overlays. The third registers node kinds and graph gestures.
A generic card displaying preserved JSON does not implement a specialized node.

Paths below are relative to the repository root. `W:` means `web/src/` and `N:`
means `native/node-editor/`. Source paths identify ownership. Native test paths
identify available evidence to rerun, not results from this audit. Existing
[parity notes](parity.md), [README](../README.md), and the
[visual comparison guide](../../../docs/native-node-editor-visual-comparison.md)
provide context. Source takes precedence over their deferred-feature lists.

## Status and acceptance

- **Implemented, acceptance pending** means a reachable native flow exists in
  inspected source. Native test results and captures must establish completion.
- **Partial** means a subset exists, including command-only implementations.
- **Missing** means no matching flow was found in the inspected native host,
  inspector, catalog, document, runtime, and media surfaces. It does not assert
  absence from every repository file.
- **Unverified** means semantics or coverage require a focused comparison.

Every completed row needs a native fixture, a reproducible native command or UI
interaction, its test result, and screenshots for visible states. Preserve
workflow JSON and undo history when projecting runtime state. Test failures,
unsupported values, cancellation, and reconnect wherever those states apply.
A row remains open when its acceptance column has unmet cases.

## Graph creation and editing

| ID | Web flow and source | Native implementation or gap | Required native acceptance |
| --- | --- | --- | --- |
| F01 | Search, browse, and add catalog nodes. W: `components/node_menu/NodeMenu.tsx` | Partial. N: `qml/Catalog.qml`, `src/ui/EditorWindow.cpp` add metadata defaults by click. | Search empty/no-match/loading/error, namespace filter, click adds correct defaults and one undo entry. Compare catalog row and search focus in both themes. |
| F02 | Drag catalog nodes and assets/files onto canvas. W: `hooks/handlers/useDropHandler.ts`, `components/node/ReactFlowWrapper.tsx` | Missing in inspected catalog and host. Click placement is not drag/drop. | Drop at transformed coordinates, upload loading/failure, unsupported file, cancellation, one undo entry, and no ghost nodes after failure. |
| F03 | Drag a typed wire, reconnect endpoints, open compatible-node picker on loose wire. W: `hooks/handlers/useConnectionHandlers.ts`, `hooks/handlers/useEdgeHandlers.ts`, `components/context_menus/ConnectableNodes.tsx` | Partial. N: `src/graph/WorkflowGraphModel.cpp`, `src/document/WorkflowDocument.cpp` project named ports and validate connections. Compatible picker missing. Reconnect semantics require verification. | Compatible/incompatible types, occupied input, cycle and supported loop, loose drop, cancellation, endpoint reassignment and undo. |
| F04 | Add/remove dynamic input/output, select type, edit value and rename. W: `components/node/PropertyInput.tsx`, `DynamicSlotTypePicker.tsx`, `AddDynamicOutputDialog.tsx` | Partial, concurrent work unverified. N: `src/document/WorkflowDocument.cpp` now has add/rename/remove commands for dynamic inputs and outputs, rewrites incident edges. No matching inspector controls observed. | Reachable controls, reserved/duplicate/static name rejection, typed defaults, rename preserves values and edges, remove cleans edges, undo/redo and round trip. Include legacy declarations. |
| F05 | Edit inline fields and expanded text on the card. W: `components/node/PropertyInput.tsx`, `NodeInputs.tsx` | Missing. N: `src/graph/EditorScene.cpp` paints previews. Scalar inspector does not establish inline editing. | Pointer/focus routing across Widgets/Quick, draft Escape, selection change, connected input, multiline expansion, one undo per commit. |
| F06 | Move, resize, rename, select and act on nodes. W: `components/node/NodeResizeHandle.tsx`, `EditableTitle.tsx`, `NodeSelectionToolbar.tsx` | Partial. N: `src/graph/EditorScene.cpp`, `src/ui/EditorWindow.cpp` implement move/selection. Resize, editable title and selection toolbar not observed. | Single/multiple move, resize limits, title commit/cancel, keyboard selection and visible toolbar actions. One gesture equals one undo entry. |
| F07 | Group children, move/resize group, run/bypass group. W: `components/node/GroupNode.tsx`, `RunGroupButton.tsx`, `BypassGroupButton.tsx` | Partial storage only. N: `src/document/WorkflowDocument.cpp` preserves parent IDs and handles descendant copy/delete. No specialized group canvas flow observed. | Nested relative geometry, reparenting, group deletion/copy, collapse if exposed, group run/bypass and undo. |
| F08 | Create/edit/resize comment. W: `components/node/CommentNode.tsx` | Missing specialized flow. Preservation does not establish comment editing. | Text commit/cancel, resize, color/state comparison, copy/paste, undo and save/reopen. |
| F09 | Edit subgraph and app/workflow nodes through derived ports and child tabs. W: `components/node/SubgraphNode/SubgraphNode.tsx`, `WorkflowNode/WorkflowLoader.tsx`, `AppNode/AppLoader.tsx`, `components/workspace/SubgraphTabStrip.tsx` | Missing specialized flow. Generic named-port projection is partial storage support. | Open child, edit, return, synchronize ports without losing edges, missing child/error, nested copy and round trip. |
| F10 | Insert and manipulate reroutes. W: `components/node/RerouteNode.tsx`, `hooks/handlers/useEdgeHandlers.ts` | Missing specialized canvas presentation and insertion flow. | Wire insertion, inferred type, reconnect, deletion and undo without losing connectivity. |
| F11 | Inspect graph links and execution/branch relationships. W: `components/node_editor/LinkLayer.tsx`, `components/node/ReactFlowWrapper.tsx` | Missing matching link layer and comprehension projections. Do not equate generic wires with lineage. | Separate data edges, control edges, links and branch states using source-backed fixtures. Verify selection and persistence for each. |
| F12 | Auto layout and selection alignment/actions. W: `stores/NodeStore.ts`, `components/node_editor/SelectionActionToolbar.tsx` | Missing in inspected host action dispatch. | Deterministic layout, nested geometry, disconnected nodes, one undo, preserve pinned/special state as supported by web. |
| F13 | Copy/paste/duplicate/delete and undo/redo. W: `hooks/useNodeEditorShortcuts.ts`, `stores/NodeStore.ts` | Implemented, acceptance pending. N: `src/document/WorkflowDocument.cpp`, `src/ui/EditorWindow.cpp`, `tests/document/WorkflowDocumentTest.cpp`. | ID remapping, internal/external edges, nested parents, selected-edge deletion, failed batch rollback, text-editor shortcuts isolated from canvas. |
| F14 | Find nodes, command menu, context menus and shortcuts help. W: `components/node_editor/FindInWorkflowDialog.tsx`, `components/menus/CommandMenu.tsx`, `components/context_menus/ContextMenus.tsx`, `config/shortcuts.ts` | Partial. N: `src/ui/EditorWindow.cpp` has More and canvas accelerators. Find, full contextual actions and help missing. | Enumerate web shortcut/actions from these owners, map each native action, verify scope, disabled states and text-field focus. |

## Property editors

The concrete web dispatch is `W:components/node/PropertyInput.resolver.tsx`.
Native dispatch is `N:src/properties/PropertyFields.h` and `qml/PropertyField.qml`.
The latter currently selects text, multiline, number, integer, boolean, choice,
or preserved read-only display. Each family below needs its own fixtures.

| ID | Web family and source under W:components/properties | Native implementation or gap | Required native acceptance |
| --- | --- | --- | --- |
| F15 | `StringProperty.tsx`, `TextProperty.tsx`, `IntegerProperty.tsx`, `FloatProperty.tsx`, `BoolProperty.tsx`, `EnumProperty.tsx` | Implemented subset, acceptance pending. N: `tests/properties/PropertyFieldsTest.cpp`, `tests/ui/EditorTest.cpp`. | Nullable/missing/default, numeric limits, choices preserving scalar type, multiline cancel, connected lock, stale draft after node switch. |
| F16 | Reset/remove, dynamic fields and conditional visibility. W: `components/node/PropertyInput.tsx`, `NodeInputs.tsx` | Partial. Native remove/reset paths and connected descriptors exist. Conditional metadata visibility needs verification. | Changed/default markers, reset distinction from null, hidden conditional fields, dynamic value removal, connected state and undo. |
| F17 | `JSONProperty.tsx`, `DictProperty.tsx`, `RecordTypeProperty.tsx`, `ListProperty.tsx`, `StringListProperty.tsx`, `DataframeProperty.tsx` | Missing validated structured editors. Native preserves values read-only. | Invalid draft never mutates document, add/remove/reorder entries, nested values, schema validation, cancel and round trip. |
| F18 | `CodeProperty.tsx`, W: `components/node/codeNodeUi.ts` | Missing code editor and inferred I/O flow. Plain multiline string editing is a subset. | Code editing, diagnostics if exposed, inferred ports and retained connected outputs, undo/cancel and save/reopen. |
| F19 | `ImageProperty.tsx`, `AudioProperty.tsx`, `VideoProperty.tsx`, `AssetProperty.tsx`, `PropertyDropzone.tsx`, corresponding media lists | Missing property picker/upload/editor. Runtime output playback is separate. | Asset/file selection, authenticated preview, list ordering/removal, uploading/failure/retry/cancel, valid media ref persisted without resolved URL. |
| F20 | `ModelProperty.tsx`, `InferenceProviderModelSelect.tsx`, model-specific selectors imported by their dispatch | Missing model selection flow. | Provider/model search, selected/missing model, key warning, download/install progress where exposed, typed metadata and persistence. |
| F21 | `WorkflowProperty.tsx`, `WorkflowListProperty.tsx`, `ToolsListProperty.tsx`, `CollectionProperty.tsx`, `FolderProperty.tsx`, `DocumentProperty.tsx`, `EntityProperty.tsx` | Missing resource selectors. | Authorized list/search, no results/error, stale/deleted reference, selected resource round trip and correct full IDs. |
| F22 | `SketchProperty.tsx`, `TimelineProperty.tsx`, `ScriptProperty.tsx`, `StoryboardProperty.tsx`, `Model3DProperty.tsx` | Missing document-specific pick/open flows and 3D editor. | Pick/create/open target, return to workflow, missing target, ref preservation and undo. |
| F23 | `ColorProperty.tsx`, `FontProperty.tsx`, `ImageSizeProperty.tsx`, `MediaPickerProperties.tsx`, `FileProperty.tsx`, `FilePathProperty.tsx`, `FolderPathProperty.tsx` | Missing dedicated editors. | Correct value shape, presets/custom value, local/server path distinction, invalid values and save/reopen. |

## Execution and output

| ID | Web flow and source | Native implementation or gap | Required native acceptance |
| --- | --- | --- | --- |
| F24 | Whole workflow Run/Stop and queue state. W: `components/panels/FloatingToolBar.tsx`, `QueueOverlay.tsx` | Partial. N: `src/server/WorkflowSession.cpp`, `src/ui/EditorWindow.cpp` Run/Stop. Queue overlay/actions not matched. | Start once, stop active job, failed submit, disconnected controls, queued/running/completed/failed/cancelled and repeated runs. |
| F25 | Run selected/group and bypass disabled nodes. W: `components/node/NodeToolButtons.tsx`, `RunGroupButton.tsx`, `BypassGroupButton.tsx` | Partial, concurrent work unverified. Document has `setNodesDisabled` storing `ui_properties.bypassed`. Host dispatch inspected only whole Run/Stop. | Reachable selected/group controls, sent subset semantics, disabled persistence/appearance, undo, partial outputs and correct server payload. |
| F26 | Live status/progress, streamed text/results/errors. W: `components/node/NodeContent.tsx`, `NodeErrors.tsx`, `OutputRenderer.tsx` | Implemented subset, acceptance pending. N: `src/run/NodeRuntimeModel.cpp`, `src/graph/EditorScene.cpp`, `tests/runtime/NodeRuntimeModelTests.cpp`, `tests/ui/RuntimeUiTest.cpp`. | Interleaved nodes/runs, chunk order, progress limits, error logs, stale updates, no workflow/undo mutation, bounded text. |
| F27 | Reconnect and live-running visual states. W: `stores/LiveRunStore.ts`, `stores/WorkflowRunsStore.ts`, `hooks/useProcessedEdges.ts` | Partial. N: `src/server/WorkflowSession.cpp`, `src/graph/EditorScene.cpp` reconnect/reconciliation and runtime painting. | Disconnect mid-run, reconcile original ID without resubmit, server change, late events, running animation stops when idle/disconnected/reduced motion. |
| F28 | Image/video/audio output with locator resolution. W: `components/node/OutputRenderer.tsx`, `components/ui_primitives/VideoPlayer.tsx`, `AudioPlayback.tsx` | Partial. N: `src/media/MediaResolver.cpp`, `qml/MediaPreview.qml`, `tests/media/MediaResolverTests.cpp`, `tests/ui/MediaUiTest.cpp`. Bottom panel supports playback. | Typed asset and temporary refs, authenticated cache, aspect ratio, play/pause/seek/time/volume/mute, loading/failure/retry, source/server switch stops playback. |
| F29 | In-card media, fullscreen, speed and waveform. Same web output path and playback primitives. | Missing extended controls and in-card video/audio. Native image card previews are a subset. | Card vs panel parity, fullscreen escape, speed, waveform/timeline interaction, ended/error/loading state and keyboard controls. |
| F30 | Output arrays/gallery, download/copy and quick actions. W: `components/node/output/AssetGrid.tsx`, `ArrayRenderer.tsx`, `Actions.tsx`, `components/node/OutputQuickActionButtons.tsx` | Missing matching gallery and download/quick actions. | Multiple/mixed outputs, pagination/selection as exposed, resolved download filename/content, cancel/failure, copy and action destinations. |
| F31 | Rich output renderers. W: `components/node/output/` includes `DataframeRenderer.tsx`, `PlotlyRenderer.tsx`, `ImageComparisonRenderer.tsx`, `ToolCallRenderer.tsx`, `RealtimeAudioOutput.tsx`, `TextRenderer.tsx`, `ObjectRenderer.tsx` | Partial generic text/JSON only for these families. | Separate fixture for table, plot, image comparison, tool call/status, Markdown/text ref, streaming PCM audio. Preserve unknown output instead of misclassifying it. |
| F32 | Node history and run/log inspection. W: `components/node/NodeHistoryViewer.tsx`, `components/panels/LogPanel.tsx`, `TracePanel.tsx` | Partial. N: `src/run/RunOutputModel.cpp`, `qml/RunOutput.qml`, `tests/run/RunOutputModelTests.cpp` expose session history, logs and clear. | Select older run, node-specific result navigation, active run survives clear, new output after clear, trace/error selection. Distinguish session from durable history. |

## Documents and workspace

| ID | Web flow and source | Native implementation or gap | Required native acceptance |
| --- | --- | --- | --- |
| F33 | Open/save server workflow, autosave and conflicts. W: `hooks/useWorkflowAutosave.ts`, `components/workspace/WorkflowEditorSurface.tsx`, `hooks/useDocumentConflicts.ts` | Partial. N: `src/server/WorkflowSession.cpp` open/save and conflict handling, `src/ui/EditorWindow.cpp` local atomic save and dirty prompt. No periodic autosave flow observed. | Dirty save/discard/cancel, stale-save conflict recovery, failed save leaves document dirty, local/server identity, reopen exact JSON. Native live test owns server proof. |
| F34 | Browse/create/rename/delete workflows and project-scoped documents. W: `components/workflows/WorkflowList.tsx`, `WorkflowForm.tsx`, `components/panels/DocumentsTree.tsx`, `components/workspace/WorkflowDocumentBar.tsx` | Missing browser/project flow. Native Server Open asks for an ID. | List/search/empty/error, project switch, create/rename/delete confirmation, dirty open and authorized ID resolution. |
| F35 | Multiple document tabs, linked workflows and subgraph tabs. W: `stores/WorkspaceTabsStore.ts`, `components/workspace/LinkedWorkflowsMenu.tsx`, `SubgraphTabContent.tsx` | Missing host integration. N: `qml/TabBar.qml` existence does not establish multi-document state. | Independent graph/undo/runtime per tab, dirty close/cancel, restore, linked navigation and child return. |
| F36 | Chat composer and editor/agent integration. W: `components/panels/CanvasChatWindow.tsx`, `CanvasMediaComposer.tsx`, `components/workspace/WorkflowEditorSurface.tsx` | Missing composer, agent actions and integrated document/chat state. | Draft and attachments, streaming/cancel/error, tool-driven graph edits, selection context and preserved workflow/undo semantics. |
| F37 | Version history/restore, share and document metadata. W: `components/panels/restoreWorkflowVersion.ts`, `components/workflows/WorkflowShareDialogHost.tsx`, `WorkflowForm.tsx` | Missing matching flows. Run history is not workflow version history. | Inspect version without mutation, restore with dirty protection, share permission/error, metadata round trip. |
| F38 | First-use guidance, missing runtime/provider packs and dependencies. W: `components/node_editor/FirstWorkflowGuide.tsx`, `RuntimeInstallDialog.tsx`, `hooks/useAutoEnableNodePacks.ts`, `components/node/NodeDependencyWarning.tsx` | Missing matching setup/install flow. Unknown-node preservation is partial failure handling. | Empty workflow action, missing metadata/runtime, install failure/retry/cancel, retained graph after registry refresh. |

## Visual and platform acceptance

| ID | Web reference | Native implementation or gap | Required native acceptance |
| --- | --- | --- | --- |
| F39 | Card/ports/wires/grid, selected/hover/connectable/running states. W: `styles/nodes.css`, `styles/handle_edge_tooltip.css`, `hooks/useProcessedEdges.ts`, `components/node/selectionStyles.ts` | Partial. N: `src/graph/NodeLayout.cpp`, `EditorScene.cpp`, `qml/EditorRoles.qml`. Comparison guide records fixture limitations and native shadow/selection approximations. | Both themes, actual production context, selected/error/running/disabled cards, wire direction extremes, compatible-handle dim/hover, resize mark, control/Agent handles. Declared constants alone are insufficient. |
| F40 | Zoom/pan/fit, mini-map and inspector overlap. W: `components/node/MiniMapNavigator.tsx`, `components/node_editor/ViewportStatusIndicator.tsx`, `hooks/useClearInspectorOverlap.ts` | Partial. Native zoom/pan/fit and narrow inspector/catalog switching exist. Mini-map missing. | Pointer anchor, fit above overlays, selection reveal without zoom change, narrow/wide transitions, no obscured active controls, both themes. |
| F41 | Catalog/inspector/toolbars/panels and elevations. W: `components/node_editor/NodeInfoPanel.tsx`, `components/panels/FloatingToolBar.tsx`, `components/node_menu/NodeMenu.tsx` | Partial. Native Params/I/O/Help, catalog, rail/output/status exist. Cost/run-selected footer and matching floating shadows missing. | Whole-window captures at matched size/scale, empty/loading/error/focus states and open/closed panels. Component captures do not establish whole-window parity. |
| F42 | Platform input, accessibility and measured interaction performance. Web reference is behavior of the entry points above. | Unverified. Offscreen tests and synthetic projection are limited evidence, as N: `README.md` states. | Real desktop keyboard/focus/screen-reader/IME, high-DPI and mixed-renderer pointer flow. Measure input-to-paint on specified large graphs, report hardware/renderer/fixture and percentile latency. |

## Ordered implementation phases

1. **A1: Finish core graph editing.** Close F02–F06 and F13–F16 before adding
   more generic preserved-value displays. Dynamic-port and bypass command work
   already visible in the shared checkout must gain reachable controls and
   passing native evidence before its status changes.
2. **A2: Finish authored values and graph structures.** Implement F07–F12 and
   F17–F23 with one saved fixture for each value/node family. Validate command
   boundaries and native UI together. Saved JSON preservation is only one part
   of acceptance.
3. **A3: Finish execution and output.** Close F24–F32 with a deterministic native
   replay/server fixture, then the native live-backend suite. Include temporary
   handles, concurrent runs and reconnect. Add media gallery/download and rich
   renderers as separate cases.
4. **A4: Finish document workspace flows.** Close F33–F38 through native tests
   for list/project/tab/history/chat operations and server failures. Do not mark
   run history as version history or ID entry as workflow browsing.
5. **A5: Measure presentation and platform behavior.** Close F39–F42 using
   existing web captures as references and newly captured native evidence.
   Keep fixture gaps visible. Match state and context before comparing pixels.

## Completion record

Record evidence per feature ID: fixture, native test command, result artifact,
capture paths, remaining state differences, and reviewer decision. Maintain an
explicit open-ID list from these rows. Completion requires every row's cases to
be accepted or an explicit user-approved scope change. A passing native test
suite, a successful compile, or a small visual fixture set cannot substitute
for the missing flows in this inventory.
