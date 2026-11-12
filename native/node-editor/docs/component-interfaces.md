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

`EditorWindow::EditorWindow` sets ten root context properties, not five:
`editor`, `workflowBrowser`, `libraryBrowser`, `runOutput`, `workflowSession`,
`mediaResolver`, `modelPickerController`, `assetPickerController`,
`resourcePickerController` and `documentPickerController`.

The window also reaches QML under other names. `EditorChat.cpp` and
`InlineTitlePresenter.cpp` pass the window as `host` through
`setInitialProperties`. The scan counts those reads as reads of the window.
`Inspector.qml` used to pass the window on as `propertyHost`; it now takes a
`NodeInspector`.

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

| Interface | What it holds | Main readers |
|---|---|---|
| `NodeCatalog` (moved) | Node metadata as a list model, categories, ranking, recent and favorite types, quick actions, add or drag a node, close or move the floating menu | `Catalog.qml`, `NodeMenu.qml` |
| `PackSetup` (exists, now a required property) | Configured keys, optional packs | `Catalog.qml`, `NodeMenu.qml`, `OptionalPacksSection.qml` |
| `FirstWorkflowGuide` (moved) | Whether the guide shows, whether it started, step readiness, guide actions | `SetupGuide.qml` |
| `DocumentState` | Read-only state and reason, status message, document and credential epochs | Inspector, property editors, toolbars |
| `Selection` (moved for the selection toolbar) | Selected count, single item, disabled state, node context menu | `SelectionToolbar.qml` |
| `NodeInspector` (moved) | Selection header, property rows, dynamic ports, read-only reason and message, run selected, run progress, cost estimate | `Inspector.qml` |
| `PropertyHost` (moved) | Selected id, read-only state, document and credential epochs, commit and remove a value | `PropertyField.qml` |
| `GenerationReplay` (moved) | Generation history, pinned generation, replay set | `GenerationHistory.qml` |
| `DocumentTabs` (moved) | Workspace tabs, active tab, project name, tab actions, canvas strips (subgraph surfaces), strip offset, settings | `TabBar.qml`, `CanvasTabStrip.qml` |
| `WorkflowHeader` (moved) | Workflow name and rename, save readout and its action, undo and redo, More menu | `HeaderRow.qml` |
| `PanelLayout` (moved for the rail, the document bar and the status bar) | Which panels are open and the toggles | `HeaderRow.qml`, `Rail.qml`, `StatusBar.qml`, `RunOutput.qml` |
| `StatusModel` (moved for the status bar and the side panels) | Connection status, detail and state, node and edge counts, queue counts, system stats, connect request | `StatusBar.qml`, `WorkflowBrowser.qml`, `LibraryPanel.qml` |
| `RunState` (moved for the toolbar and the group controls) | Shown queue, connection, workflow id, authored group commands | `Toolbar.qml`, `AuthoredControls.qml`, `QueueOverlay.qml`, `RunOutput.qml` |
| `Viewport` (moved) | Zoom percent and preset, mini-map color mode and popups, view commands | `ViewportIndicator.qml`, `MiniMapControls.qml`, `MiniMapPopups.qml` |
| `Notifications` (moved) | Notification list, unread count, open the list, copy an entry | `TabBar.qml`, `NotificationsPanel.qml` |
| `ChatWindow` | Chat window geometry drags | `EditorChat.qml` |
| `EditorCommands` (moved for the toolbars and the group controls) | Read-only state, shown run activity, named command dispatch, tooltip, theme roles | `Toolbar.qml`, `SelectionToolbar.qml`, `AuthoredControls.qml`, most other chrome |

These members should leave the window instead of joining an interface:

- `iconPath` is a lookup in static data. It becomes a `QML_SINGLETON` such as
  `TypeIcons`, so `TypeIcon.qml` needs no host at all.
- `styleOutputMarkdown` is stateless formatting. It becomes a function on a
  singleton or on the run output object.
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
- `libraryBrowser`: `LibraryPanel.qml`.
- `runOutput`: `RunOutput.qml`, `QueueOverlay.qml`.
- `workflowSession`: `QueueOverlay.qml`, `Toolbar.qml` (`ServerSyncPanel.qml`
  already takes it as a required property).
- `mediaResolver`: the media and output views.
- The four picker controllers: the property editors. They read the global
  through `typeof x === "undefined" ? null : x` guards today, which a required
  property removes.

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
candidate list, not a plan to move them.

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
  "DocumentState": ["message"],
  "PanelLayout": ["outputVisible"],
  "RunState": ["shownQueue", "askRunAgent"],
  "ChatWindow": ["beginChatGeometry", "changeChatGeometry", "resetChatPosition"],
  "Leaves the window": ["iconPath", "styleOutputMarkdown"]
}
```

<!-- BEGIN GENERATED: scripts/component-interfaces.mjs -->
Scanned 78 files in `qml/`. 21 read a root context property, 5 of them read the editor window. `EditorWindow.h` exposes 14 properties and 17 invokable methods or slots (31 members) and 14 signals.

| File | Editor members | Other context properties |
|---|---:|---|
| EditorChat.qml | 3 via `host` |  |
| RunOutput.qml | 3 | `runOutput` (6) |
| QueueOverlay.qml | 1 | `runOutput` (2), `workflowSession` (4) |
| TextOutput.qml | 1 | `mediaResolver` (7) |
| TypeIcon.qml | 1 |  |
| AssetPropertyEditor.qml |  | `mediaResolver` (0, passed on), `assetPickerController` (0, passed on), `resourcePickerController` (0, passed on) |
| CanvasMedia.qml |  | `mediaResolver` (6) |
| CardMediaPlayer.qml |  | `mediaResolver` (6) |
| CollectionPropertyEditor.qml |  | `resourcePickerController` (0, passed on) |
| DocumentPropertyEditor.qml |  | `documentPickerController` (0, passed on) |
| ImageComparisonOutput.qml |  | `mediaResolver` (6) |
| ImageViewer.qml |  | `mediaResolver` (1) |
| InlinePropertyEditor.qml |  | `resourcePickerController` (0, passed on) |
| LibraryPanel.qml |  | `libraryBrowser` (13, passed on), `assetPickerController` (3) |
| MediaParameterPropertyEditor.qml |  | `resourcePickerController` (0, passed on) |
| MediaPreview.qml |  | `mediaResolver` (14) |
| Model3DPropertyEditor.qml |  | `assetPickerController` (0, passed on) |
| ModelPropertyEditor.qml |  | `modelPickerController` (0, passed on) |
| RemainingResourcePropertyEditor.qml |  | `resourcePickerController` (0, passed on) |
| ServerSyncPanel.qml |  | `workflowSession` (11) |
| WorkflowPropertyEditor.qml |  | `resourcePickerController` (0, passed on) |

Files where a local `id` hides a context property, so their reads are local: CodePropertyEditor.qml (`editor`), InlinePropertyEditor.qml (`editor`).

### Members by file

`passed on` means the file hands the whole object to a child, such as `propertyHost: editor`.

- **EditorChat.qml**
  - `editor` (as `host`): beginChatGeometry, changeChatGeometry, resetChatPosition
- **RunOutput.qml**
  - `editor`: askRunAgent, message, outputVisible
  - `runOutput`: clear, collections, richEntries, runs, selectRun, selectedRunId
- **QueueOverlay.qml**
  - `editor`: shownQueue
  - `runOutput`: selectRun, selectedRunId
  - `workflowSession`: cancelJob, connected, queue, workflow
- **TextOutput.qml**
  - `editor`: styleOutputMarkdown
  - `mediaResolver`: cancel, on cleared, on failed, on resolved, release, resolve, resolvedText
- **TypeIcon.qml**
  - `editor`: iconPath
- **AssetPropertyEditor.qml**
  - `mediaResolver`: none passed on as resolver:
  - `assetPickerController`: none passed on as controller:
  - `resourcePickerController`: none passed on as resourceController:
- **CanvasMedia.qml**
  - `mediaResolver`: on assetSaveFailed, on assetSaved, on saveFailed, on saved, saveText, saveTextToAssets
- **CardMediaPlayer.qml**
  - `mediaResolver`: cancel, on cleared, on failed, on resolved, release, resolve
- **CollectionPropertyEditor.qml**
  - `resourcePickerController`: none passed on as controller:
- **DocumentPropertyEditor.qml**
  - `documentPickerController`: none passed on as controller:
- **ImageComparisonOutput.qml**
  - `mediaResolver`: cancel, on cleared, on failed, on resolved, release, resolve
- **ImageViewer.qml**
  - `mediaResolver`: on cleared
- **InlinePropertyEditor.qml**
  - `resourcePickerController`: none passed on as controller:
- **LibraryPanel.qml**
  - `libraryBrowser`: assetModel, breadcrumbs, busy, configured, createFolder, error, favoritesOnly, goUp, openFolder, refresh, searchText, tagFilter, typeFilter passed on as browser:
  - `assetPickerController`: on failed, on uploaded, upload
- **MediaParameterPropertyEditor.qml**
  - `resourcePickerController`: none passed on as controller:
- **MediaPreview.qml**
  - `mediaResolver`: cancel, on assetSaveFailed, on assetSaved, on cleared, on failed, on resolved, on saveFailed, on saved, release, resolve, resolvedBytes, saveResolved, saveToAssets, suggestedFilename
- **Model3DPropertyEditor.qml**
  - `assetPickerController`: none passed on as controller:
- **ModelPropertyEditor.qml**
  - `modelPickerController`: none passed on as controller:
- **RemainingResourcePropertyEditor.qml**
  - `resourcePickerController`: none passed on as controller:
- **ServerSyncPanel.qml**
  - `workflowSession`: autosaveState, conflictPending, conflictWorkflow, mergeConflicts, on credentialsChanged, on errorOccurred, on stateChanged, on workflowOpened, remoteLoading, saving, serverBound
- **WorkflowPropertyEditor.qml**
  - `resourcePickerController`: none passed on as controller:

### Editor members by proposed interface

- **DocumentState** (1 members, read by 1 files: RunOutput.qml)
  - `message` property: RunOutput.qml
- **PanelLayout** (1 members, read by 1 files: RunOutput.qml)
  - `outputVisible` property: RunOutput.qml
- **RunState** (2 members, read by 2 files: QueueOverlay.qml, RunOutput.qml)
  - `askRunAgent` method: RunOutput.qml
  - `shownQueue` property: QueueOverlay.qml
- **ChatWindow** (3 members, read by 1 files: EditorChat.qml)
  - `beginChatGeometry` method: EditorChat.qml
  - `changeChatGeometry` method: EditorChat.qml
  - `resetChatPosition` method: EditorChat.qml
- **Leaves the window** (2 members, read by 2 files: TextOutput.qml, TypeIcon.qml)
  - `iconPath` method: TypeIcon.qml
  - `styleOutputMarkdown` method: TextOutput.qml

Members no QML file reads (C++ callers only, or dead): `action`, `askAgent`, `cancelCatalogPlacement`, `catalogAtPointer`, `closeAllTabs`, `closeOtherTabs`, `emptyCanvas`, `focusCanvas`, `graphSummary`, `hasUnsavedChanges`, `layoutOverlays`, `openChild`, `outputMedia`, `runActive`, `saveState`, `serverSaveState`, `serverSyncAvailable`, `serverSyncNeedsAttention`, `setProperty`, `setup`, `showToolTip`, `toggleChat`.
<!-- END GENERATED -->
