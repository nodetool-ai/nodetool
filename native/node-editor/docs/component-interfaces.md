# Component interfaces

This page lists what each node editor QML file reads from `EditorWindow` and
the other root context properties, and proposes the narrow interfaces that
replace them. It is the inventory step of the refactor that removes
`setContextProperty` from the editor, so a component can be loaded alone with
only its interface object.

The tables under [Generated inventory](#generated-inventory) come from
`scripts/component-interfaces.mjs`. Regenerate them after a QML change:

```bash
node native/node-editor/scripts/component-interfaces.mjs          # rewrite this page
node native/node-editor/scripts/component-interfaces.mjs --check  # fail when stale
node native/node-editor/scripts/component-interfaces.mjs --json   # raw scan
```

The script fails when a QML file reads a member that is not in the object's
header, when a read member has no proposed interface, when a proposed member is
no longer read, and when it finds no QML files or no `EditorWindow` members.

## What the scan covers

`EditorWindow::EditorWindow` set ten root context properties: `editor`,
`workflowBrowser`, `libraryBrowser`, `runOutput`, `workflowSession`,
`mediaResolver`, `modelPickerController`, `assetPickerController`,
`resourcePickerController` and `documentPickerController`. It now sets none.
The scan still lists `editor`, so it fails if a file reads the window again.

The window used to reach QML under other names. `EditorChat.cpp` and
`InlineTitlePresenter.cpp` passed the window as `host` through
`setInitialProperties`, and `Inspector.qml` passed it on as `propertyHost`.
They now pass `ChatWindow`, `EditorCommands` and `RunState`, and
`NodeInspector`. The scan counts reads of a name listed in `EDITOR_ALIASES` as
reads of the window, and that list is now empty.

The scan reads first-level members only. `editor.packSetup.configuredKeys`
counts as `packSetup`. `packSetup`, `dynamicPorts`, `generationHistory` and
`setup` are already separate QObjects, so a component can take them directly.

It strips comments and string contents first, so `"editor"` in a label or a
role table is not a read. A file that declares `id: editor` is reported as
shadowed, because the local `id` wins over the context property.

## Corrections to the earlier snapshot

- 27 QML files read the window, not 42. 42 files contain the word `editor`.
  `CodePropertyEditor.qml` and `InlinePropertyEditor.qml` declare a local
  `id: editor` for their text area, so every `editor.` in them is local.
  `CodePropertyEditor.qml` reads nothing from the window, and the property
  editors as a group read only `showToolTip` (`AssetPropertyEditor.qml`).
- The heaviest readers are `TabBar.qml` (18 members), `NodeMenu.qml` and
  `Inspector.qml` (14), `HeaderRow.qml` and `StatusBar.qml` (13) and
  `Catalog.qml` (11).
- Members without a QML reader are listed at the end of the generated section.
  They are C++ API or dead, and the refactor does not need to move them.

## Proposed interfaces

Each interface is a QObject that a tab's `EditorWindow` owns by value, used on
the UI thread only, and destroyed with the tab after its panels. QML gets a
non-owning pointer through a `required property`. Members keep their current
names unless a note says otherwise, so each move is a mechanical change.

Every tab is an `EditorWindow` with its own QML engine and panels. The root
window holds the tabs, creates no panels, and forwards its getters to
`activeEditor()`. A tab's interface therefore reads that tab's state and needs
no active-tab forwarding. Today one `panelChanged` signal notifies 44
properties. Each interface gets its own signals, which is also where the
refactor can stop re-evaluating unrelated bindings.

Moved so far:

- `NodeCatalog` (`src/interfaces/NodeCatalog.h`), which `Catalog.qml` and
  `NodeMenu.qml` take with the existing `PackSetup`.
  `tests/ui/NodeMenuComponentTest.cpp` loads `NodeMenu.qml` with a fixture
  catalog and links only `node_editor_interfaces`, `node_editor_qml` and the
  UI primitives.
- `NodeInspector` (`src/interfaces/NodeInspector.h`), which `Inspector.qml`
  takes. It holds a `PropertyHost` for each `PropertyField` and a
  `GenerationReplay` for `GenerationHistory.qml`, and carries its own
  selection and read-only state. `tests/ui/InspectorComponentTest.cpp` loads
  `Inspector.qml` with a fixture inspector. It also builds the editor's media
  QML types and the model picker, which the property editors use.
- `DocumentTabs` (`src/interfaces/DocumentTabs.h`), which `TabBar.qml` and
  `CanvasTabStrip.qml` take, and `Notifications`
  (`src/interfaces/Notifications.h`), which `TabBar.qml` and
  `NotificationsPanel.qml` take. The tab state lives in the root window, and
  each tab copies it into its own objects when the root signals a change.
  The settings button went to `DocumentTabs` and the copy action to
  `Notifications`, so neither file needs `EditorCommands`.
  `tests/ui/TabBarComponentTest.cpp` loads all three files with fixture
  objects and links only `node_editor_interfaces`, `node_editor_qml` and the
  UI primitives.
- `WorkflowHeader` (`src/interfaces/WorkflowHeader.h`), which `HeaderRow.qml`
  takes for the document, and `PanelLayout`
  (`src/interfaces/PanelLayout.h`), which `HeaderRow.qml` and `Rail.qml` take
  for the panel toggles. Their buttons send typed requests such as `undo()` and
  `toggleLibrary()`. `EditorWindow` maps each one to its command name, so the
  `action` vocabulary is unchanged. `tests/ui/HeaderRowComponentTest.cpp`
  loads both files with fixture objects.
- `StatusModel` (`src/interfaces/StatusModel.h`), which `StatusBar.qml` takes
  with `PanelLayout` for its view tabs. The same component test covers it.
- `EditorCommands` (`src/interfaces/EditorCommands.h`), which `Toolbar.qml`,
  `SelectionToolbar.qml` and `AuthoredControls.qml` take for read-only state,
  the debounced run state and commands by name. `Selection`
  (`src/interfaces/Selection.h`) gives `SelectionToolbar.qml` the selection
  count, the single item and the disabled state. `RunState`
  (`src/interfaces/RunState.h`) gives `Toolbar.qml` the shown queue, the
  connection and the workflow id, and `AuthoredControls.qml` the connection
  and the authored group command. Each tab owns one of each, because the
  overlays and group controls belong to that tab's canvas.
  `tests/ui/ToolbarComponentTest.cpp` loads all three files with fixture
  objects.
- `Viewport` (`src/interfaces/Viewport.h`), which `ViewportIndicator.qml`,
  `MiniMapControls.qml` and `MiniMapPopups.qml` take for the zoom, the
  mini-map color mode, the view commands and the popup requests. View
  commands go up by name and count as user input, as `userAction` did.
  `tests/ui/ViewportComponentTest.cpp` loads the three files with a fixture
  viewport.
- `FirstWorkflowGuide` (`src/interfaces/FirstWorkflowGuide.h`), which
  `SetupGuide.qml` takes for whether the guide shows, whether it started, its
  step readiness and its actions. `OptionalPacksSection.qml` takes the
  catalog's `NodeCatalog` and `PackSetup` from `Catalog.qml`. `NodeCatalog`
  gained the window height, which caps the packs popup, and the Runtimes and
  packs request. `tests/ui/SetupGuideComponentTest.cpp` loads both files with
  fixture objects.
- `WorkflowBrowser.qml` takes the existing `WorkflowBrowser` as a required
  property, named `WorkflowBrowserModel` in QML because the panel file already
  names `WorkflowBrowser`. The model moved into `node_editor_interfaces` and
  gained `open`, `confirmDelete` and `reload` requests, which the window maps
  to `openWorkflow`, `deleteWorkflow` and the Refresh workflows command.
  `WorkflowBrowser.qml` and `LibraryPanel.qml` take `PanelLayout` for their
  close buttons and `StatusModel` for the connection and the connect request.
  `StatusModel` gained `connected`. `tests/ui/WorkflowBrowserComponentTest.cpp`
  loads the browser with fixture objects.
- `RunOutput.qml` takes `PanelLayout` for whether the output panel is open,
  `StatusModel`, which gained `message`, and `RunState`, which gained the
  `askAgent` request. `TextOutput.qml` and `TypeIcon.qml` read the
  `OutputStyle` and `TypeIcons` singletons (`src/qml/`), which the QML engine
  owns. The icon paths moved from `NodeLayout.cpp` to `src/graph/IconPaths.cpp`
  in `node_editor_interfaces`. `TypeIcon.qml` now draws its icon in any engine,
  where it drew nothing without the `editor` context property.
  `tests/ui/RunOutputComponentTest.cpp` covers the singletons and the new
  members.
- `ChatWindow` (`src/interfaces/ChatWindow.h`), which `EditorChat.qml` takes as
  `frame` in place of the window as `host`. Its drag, resize and reset requests
  map to `beginChatGeometry`, `changeChatGeometry` and `resetChatPosition`,
  which keep the geometry. `EditorChat.qml` also needs the chat session, so
  `tests/ui/ChatWindowComponentTest.cpp` checks the interface's requests and
  `EditorChatTest::geometryAndPersistence` covers the window wiring.
- The media resolver and the four picker controllers. `PropertyHost` carries
  them as `media`, `modelPicker`, `assetPicker`, `resourcePicker` and
  `documentPicker`, set once by the window through `setServices`.
  `PropertyField.qml` passes them to each property editor as `controller`,
  `resolver` and `resourceController`, `Inspector.qml` passes `media` to the
  History tab, and `InlinePropertyEditor.qml` takes the same `PropertyHost` as
  `host` from `InlinePropertyPresenter`. The media and output views take a
  `resolver` property from their parent: `RunOutput.qml` from the window,
  `CanvasMedia.qml`, `CardMediaPlayer.qml` and the canvas image viewer from
  `CanvasMediaPresenter`. `LibraryPanel.qml` takes the asset picker as
  `assets` for its uploads. The services are `QObject` pointers, and the
  editors declare `var` properties, because the classes live in
  `node_editor_core` and several tests load the editors outside the QML
  module. The tests pass the fixture objects as initial properties.

| Interface | What it holds | Main readers |
|---|---|---|
| `NodeCatalog` (moved) | Node metadata as a list model, categories, ranking, recent and favorite types, quick actions, add or drag a node, close or move the floating menu | `Catalog.qml`, `NodeMenu.qml` |
| `PackSetup` (exists, now a required property) | Configured keys, optional packs | `Catalog.qml`, `NodeMenu.qml`, `OptionalPacksSection.qml` |
| `FirstWorkflowGuide` (moved) | Whether the guide shows, whether it started, step readiness, guide actions | `SetupGuide.qml` |
| `DocumentState` (not needed) | Read-only state and reason, status message, document and credential epochs | Covered by `NodeInspector`, `PropertyHost`, `EditorCommands` and `StatusModel` |
| `Selection` (moved for the selection toolbar) | Selected count, single item, disabled state, node context menu | `SelectionToolbar.qml` |
| `NodeInspector` (moved) | Selection header, property rows, dynamic ports, read-only reason and message, run selected, run progress, cost estimate | `Inspector.qml` |
| `PropertyHost` (moved) | Selected id, read-only state, document and credential epochs, commit and remove a value, media resolver and pickers | `PropertyField.qml`, `InlinePropertyEditor.qml`, `Inspector.qml` |
| `GenerationReplay` (moved) | Generation history, pinned generation, replay set | `GenerationHistory.qml` |
| `GenerationActivity` (new) | Generations across workflows, filter counts, history loading, open the source workflow or open as a workflow | `GenerationsPanel.qml` |
| `DocumentTabs` (moved) | Workspace tabs, active tab, project name, tab actions, canvas strips (subgraph surfaces), strip offset, settings | `TabBar.qml`, `CanvasTabStrip.qml` |
| `WorkflowHeader` (moved) | Workflow name and rename, save readout and its action, undo and redo, More menu | `HeaderRow.qml` |
| `PanelLayout` (moved for the rail, the document bar and the status bar) | Which panels are open and the toggles | `HeaderRow.qml`, `Rail.qml`, `StatusBar.qml`, `RunOutput.qml` |
| `StatusModel` (moved for the status bar and the side panels) | Connection status, detail and state, node and edge counts, queue counts, system stats, status message, connect request | `StatusBar.qml`, `WorkflowBrowser.qml`, `LibraryPanel.qml`, `RunOutput.qml` |
| `RunState` (moved) | Shown queue, connection, workflow id, authored group commands, ask the agent about a run, run output runs and models, cancel, select, clear and report a failed job | `Toolbar.qml`, `AuthoredControls.qml`, `RunOutput.qml`, `QueueOverlay.qml` |
| `Viewport` (moved) | Zoom percent and preset, mini-map color mode and popups, view commands | `ViewportIndicator.qml`, `MiniMapControls.qml`, `MiniMapPopups.qml` |
| `Notifications` (moved) | Notification list, unread count, open the list, copy an entry | `TabBar.qml`, `NotificationsPanel.qml` |
| `ChatWindow` (moved) | Chat window drag, resize and position reset | `EditorChat.qml` |
| `EditorCommands` (moved for the toolbars and the group controls) | Read-only state, shown run activity, named command dispatch, tooltip, theme roles | `Toolbar.qml`, `SelectionToolbar.qml`, `AuthoredControls.qml`, most other chrome |

These members should leave the window instead of joining an interface:

- `iconPath` is a lookup in static data. It is now the `TypeIcons`
  `QML_SINGLETON`, so `TypeIcon.qml` needs no host at all.
- `styleOutputMarkdown` is stateless formatting. It is now
  `OutputStyle.styleMarkdown`, a `QML_SINGLETON`.
- `presentation` sends theme roles from `Toolbar.qml` to the canvas painters.
  The toolbar now sends them through `EditorCommands.present`. The root QML
  item or `EditorWindow` should send them, so the toolbar stops owning a canvas
  concern.
- `height` was the QWidget height. `OptionalPacksSection.qml` now reads it as
  `NodeCatalog.windowHeight`.
- `openWorkflow` and `deleteWorkflow` moved to the existing `WorkflowBrowser`
  as `open` and `confirmDelete` requests.

`EditorCommands` dispatches by command name, as `action(name)` does now. Typed
methods per command would be cleaner, but the command names are also the
headless harness and replay vocabulary, so this proposal keeps dispatch by
name and only moves it off the window.

The other context properties are already narrow objects. Each reader takes it
as a `required property` instead of reading the global:

- `workflowBrowser`: removed. `WorkflowBrowser.qml` takes it as `browser`.
- `libraryBrowser`: removed. `LibraryPanel.qml` takes it as `library`.
- `runOutput`: removed. `RunOutput.qml` and `QueueOverlay.qml` read it through
  `RunState`.
- `workflowSession`: removed. `QueueOverlay.qml` reads it through `RunState`,
  and `ServerSyncPanel.qml` takes it as a required property.
- `mediaResolver`: removed. The media and output views take it as `resolver`.
- The four picker controllers: removed. The property editors take them as
  `controller` and `resourceController` from `PropertyHost`.

## Components the timeline duplicates or needs

From `native/timeline/qml/`. The timeline already builds its QML as the
`NodeTool.Timeline` module with `qt_add_qml_module`, and already imports the
shared `NodeTool.ModelPicker`, `NodeTool.Chat`, `NodeTool.Media` and
`NodeTool.NodeEditor.Media` modules.

| Timeline component | Node editor counterpart | Notes |
|---|---|---|
| `ai/WorkflowClip.qml` | `PropertyField.qml` and the property editors | Renders a workflow's inputs with its own text fields, media pickers and `ModelPickerButton`. The strongest sharing candidate, after the inspector work narrows `PropertyField`. |
| `assets/AssetExplorer.qml`, `AssetGrid.qml`, `AssetPreview.qml` | `LibraryPanel.qml` (`LibraryBrowser`) | Two asset browsers over the same asset API. Sharing needs one browser model. |
| `providersettings/ProviderSettingsDialog.qml` | `editor.openSettings` opens the web settings page | The node editor has no native provider settings. The timeline dialog could serve the node editor, the reverse direction. |
| `assets/AssetPreview.qml`, `reference/ComparisonView.qml` | `MediaPreview.qml`, `ImageViewer.qml`, `ImageComparisonOutput.qml` | Both sit on the shared media module. Check for duplicated viewer chrome before moving anything. |
| `aiassist/TimelineAgentPanel.qml` | `EditorChat.qml` | Both use `NodeTool.Chat`. Nothing to move. |

Step 7 moves a component only after the timeline needs it. This table is the
candidate list, not a plan to move them. After step 6 the timeline needs none
of them: it reads no `TypeIcon`, `OutputStyle`, media view or chrome component,
and the model picker is already the shared `NodeTool.ModelPicker` module.
`WorkflowClip.qml` keeps its own input form. Sharing it with `PropertyField.qml`
would need a neutral property descriptor, a small services interface in place
of `PropertyHost`, and the picker controllers moved out of `node_editor_core`.
That is a separate decision, not part of this refactor.

## Open questions

- Q1. Should `readOnly` live in `DocumentState` only, or should `NodeCatalog`
  also expose `canAddNodes` so the catalog reads one interface? `NodeCatalog`
  now carries its own `readOnly`, so the catalog components read one interface.
- Q2. Should `workflowTabs`, `notifications` and `catalog` become
  `QAbstractListModel` in the same PR as the interface split, or in a follow-up?
  A list model changes delegate bindings (`modelData` to roles), so it is not a
  pure move.
- Q3. `EditorCommands.run(name)` keeps dispatch by name. Is that acceptable,
  or should the most used commands get typed methods?

## Generated inventory

<!-- INTERFACES -->
```json
{
  "Leaves the window": []
}
```

<!-- BEGIN GENERATED: scripts/component-interfaces.mjs -->
Scanned 82 files in `qml/`. 0 read a root context property, 0 of them read the editor window. `EditorWindow.h` exposes 11 properties and 12 invokable methods or slots (23 members) and 14 signals.

| File | Editor members | Other context properties |
|---|---:|---|

Files where a local `id` hides a context property, so their reads are local: CodePropertyEditor.qml (`editor`), InlinePropertyEditor.qml (`editor`).

### Members by file

`passed on` means the file hands the whole object to a child, such as `propertyHost: editor`.


### Editor members by proposed interface

- **Leaves the window** (0 members, read by 0 files: )

Members no QML file reads (C++ callers only, or dead): `action`, `askAgent`, `askRunAgent`, `cancelCatalogPlacement`, `catalogAtPointer`, `closeAllTabs`, `closeOtherTabs`, `emptyCanvas`, `focusCanvas`, `graphSummary`, `hasUnsavedChanges`, `layoutOverlays`, `openChild`, `outputMedia`, `runActive`, `saveState`, `serverSaveState`, `serverSyncAvailable`, `serverSyncNeedsAttention`, `setProperty`, `setup`, `showToolTip`, `toggleChat`.
<!-- END GENERATED -->
