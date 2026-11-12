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

| Interface | What it holds | Main readers |
|---|---|---|
| `NodeCatalog` (moved) | Node metadata as a list model, categories, ranking, recent and favorite types, quick actions, add or drag a node, close or move the floating menu | `Catalog.qml`, `NodeMenu.qml` |
| `PackSetup` (exists) | Configured keys, optional packs, setup actions, first-workflow guide | `Catalog.qml`, `NodeMenu.qml`, `OptionalPacksSection.qml`, `SetupGuide.qml` |
| `DocumentState` | Read-only state and reason, status message, document and credential epochs | Inspector, property editors, toolbars |
| `Selection` | Selected id, count, summary, disabled state, node context menu | `SelectionToolbar.qml`, `Inspector.qml`, `GenerationHistory.qml`, `PropertyField.qml` |
| `NodeInspector` (moved) | Selection header, property rows, dynamic ports, read-only reason and message, run selected, run progress, cost estimate | `Inspector.qml` |
| `PropertyHost` (moved) | Selected id, read-only state, document and credential epochs, commit and remove a value | `PropertyField.qml` |
| `GenerationReplay` (moved) | Generation history, pinned generation, replay set | `GenerationHistory.qml` |
| `DocumentTabs` (moved) | Workspace tabs, active tab, project name, tab actions, canvas strips (subgraph surfaces), strip offset, settings | `TabBar.qml`, `CanvasTabStrip.qml` |
| `WorkflowHeader` | Workflow name and rename, save readout, undo and redo state | `HeaderRow.qml` |
| `PanelLayout` | Which panels are open and the toggles | `HeaderRow.qml`, `Rail.qml`, `StatusBar.qml`, `RunOutput.qml` |
| `StatusModel` | Connection status and detail, node and edge counts, queue counts, system stats | `StatusBar.qml`, `AuthoredControls.qml`, `WorkflowBrowser.qml` |
| `RunState` | Shown queue and shown run activity, authored group run buttons, ask the agent about a run | `Toolbar.qml`, `QueueOverlay.qml`, `AuthoredControls.qml`, `RunOutput.qml` |
| `Viewport` | Zoom percent and preset, mini-map color mode and popups | `ViewportIndicator.qml`, `MiniMapControls.qml`, `MiniMapPopups.qml` |
| `Notifications` (moved) | Notification list, unread count, open the list, copy an entry | `TabBar.qml`, `NotificationsPanel.qml` |
| `ChatWindow` | Chat window geometry drags | `EditorChat.qml` |
| `EditorCommands` | Named command dispatch (`action`, `userAction`), tooltip | most chrome |

These members should leave the window instead of joining an interface:

- `iconPath` is a lookup in static data. It becomes a `QML_SINGLETON` such as
  `TypeIcons`, so `TypeIcon.qml` needs no host at all.
- `styleOutputMarkdown` is stateless formatting. It becomes a function on a
  singleton or on the run output object.
- `presentation` sends theme roles from `Toolbar.qml` to the canvas painters.
  The root QML item or `EditorWindow` should send them, so the toolbar stops
  owning a canvas concern.
- `height` is the QWidget height. `OptionalPacksSection.qml` should use its
  window or parent height.
- `openWorkflow` and `deleteWorkflow` belong on the existing `WorkflowBrowser`,
  which `WorkflowBrowser.qml` already reads.

`EditorCommands` dispatches by command name, as `action(name)` does now. Typed
methods per command would be cleaner, but the command names are also the
headless harness and replay vocabulary, so this proposal keeps dispatch by
name and only moves it off the window.

The other context properties are already narrow objects. Each reader takes it
as a `required property` instead of reading the global:

- `workflowBrowser`: `WorkflowBrowser.qml`.
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
- Q3. `EditorCommands.action(name)` keeps dispatch by name. Is that acceptable,
  or should the most used commands get typed methods?

## Generated inventory

<!-- INTERFACES -->
```json
{
  "PackSetup": ["packSetup", "setupAction", "guideReadiness", "guideStarted", "guideVisible"],
  "DocumentState": ["readOnly", "message"],
  "Selection": ["selectionInfo", "selectedCount", "selectionDisabled", "selectionMostlyDisabled", "showNodeMenu"],
  "WorkflowHeader": ["workflowName", "workflowRenamable", "renameWorkflow", "documentSaveStatus", "canUndo", "canRedo"],
  "PanelLayout": ["browserVisible", "catalogVisible", "chatVisible", "libraryVisible", "inspectorVisible", "miniMapVisible", "outputVisible", "traceVisible", "versionsVisible", "setMiniMapVisible", "toggleChat", "toggleStatusView"],
  "StatusModel": ["connectionStatus", "connectionDetail", "connectionState", "nodeCount", "edgeCount", "queuedCount", "queueAvailable", "systemStats"],
  "RunState": ["shownQueue", "shownRunActive", "authoredAction", "askRunAgent"],
  "Viewport": ["zoomPercent", "zoomIsPreset", "miniMapColorMode", "setMiniMapColorMode", "showMiniMapPopup", "closeMiniMapPopup"],
  "ChatWindow": ["beginChatGeometry", "changeChatGeometry", "resetChatPosition"],
  "EditorCommands": ["action", "userAction", "showToolTip"],
  "Leaves the window": ["iconPath", "styleOutputMarkdown", "presentation", "height", "openWorkflow", "deleteWorkflow"]
}
```

<!-- BEGIN GENERATED: scripts/component-interfaces.mjs -->
Scanned 78 files in `qml/`. 33 read a root context property, 18 of them read the editor window. `EditorWindow.h` exposes 48 properties and 30 invokable methods or slots (78 members) and 14 signals.

| File | Editor members | Other context properties |
|---|---:|---|
| HeaderRow.qml | 13 |  |
| StatusBar.qml | 13 |  |
| SelectionToolbar.qml | 8 |  |
| Rail.qml | 7 |  |
| Toolbar.qml | 6 | `workflowSession` (2) |
| AuthoredControls.qml | 4 via `host` |  |
| SetupGuide.qml | 4 |  |
| WorkflowBrowser.qml | 4 | `workflowBrowser` (13) |
| EditorChat.qml | 3 via `host` |  |
| OptionalPacksSection.qml | 3 |  |
| RunOutput.qml | 3 | `runOutput` (6) |
| ViewportIndicator.qml | 3 |  |
| MiniMapControls.qml | 2 |  |
| MiniMapPopups.qml | 2 |  |
| LibraryPanel.qml | 1 | `libraryBrowser` (13, passed on), `assetPickerController` (3) |
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

- **HeaderRow.qml**
  - `editor`: action, canRedo, canUndo, chatVisible, documentSaveStatus, inspectorVisible, miniMapVisible, renameWorkflow, setMiniMapVisible, showToolTip, toggleChat, workflowName, workflowRenamable
- **StatusBar.qml**
  - `editor`: action, connectionDetail, connectionStatus, edgeCount, nodeCount, outputVisible, queueAvailable, queuedCount, showToolTip, systemStats, toggleStatusView, traceVisible, versionsVisible
- **SelectionToolbar.qml**
  - `editor`: action, readOnly, selectedCount, selectionDisabled, selectionInfo, selectionMostlyDisabled, showNodeMenu, shownRunActive
- **Rail.qml**
  - `editor`: action, browserVisible, catalogVisible, chatVisible, libraryVisible, showToolTip, toggleChat
- **Toolbar.qml**
  - `editor`: action, presentation, readOnly, showToolTip, shownQueue, shownRunActive
  - `workflowSession`: connected, workflow
- **AuthoredControls.qml**
  - `editor` (as `host`): authoredAction, connectionState, readOnly, shownRunActive
- **SetupGuide.qml**
  - `editor`: guideReadiness, guideStarted, guideVisible, setupAction
- **WorkflowBrowser.qml**
  - `editor`: action, connectionState, deleteWorkflow, openWorkflow
  - `workflowBrowser`: busy, createWorkflow, error, hasNext, loadNext, loading, projectId, projects, projectsLoading, refresh, renameWorkflow, rows, search
- **EditorChat.qml**
  - `editor` (as `host`): beginChatGeometry, changeChatGeometry, resetChatPosition
- **OptionalPacksSection.qml**
  - `editor`: height, packSetup, setupAction
- **RunOutput.qml**
  - `editor`: askRunAgent, message, outputVisible
  - `runOutput`: clear, collections, richEntries, runs, selectRun, selectedRunId
- **ViewportIndicator.qml**
  - `editor`: userAction, zoomIsPreset, zoomPercent
- **MiniMapControls.qml**
  - `editor`: miniMapColorMode, showMiniMapPopup
- **MiniMapPopups.qml**
  - `editor`: closeMiniMapPopup, setMiniMapColorMode
- **LibraryPanel.qml**
  - `editor`: action
  - `libraryBrowser`: assetModel, breadcrumbs, busy, configured, createFolder, error, favoritesOnly, goUp, openFolder, refresh, searchText, tagFilter, typeFilter passed on as browser:
  - `assetPickerController`: on failed, on uploaded, upload
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

- **PackSetup** (5 members, read by 2 files: OptionalPacksSection.qml, SetupGuide.qml)
  - `guideReadiness` property: SetupGuide.qml
  - `guideStarted` property: SetupGuide.qml
  - `guideVisible` property: SetupGuide.qml
  - `packSetup` property: OptionalPacksSection.qml
  - `setupAction` method: OptionalPacksSection.qml, SetupGuide.qml
- **DocumentState** (2 members, read by 4 files: AuthoredControls.qml, RunOutput.qml, SelectionToolbar.qml, Toolbar.qml)
  - `message` property: RunOutput.qml
  - `readOnly` property: AuthoredControls.qml, SelectionToolbar.qml, Toolbar.qml
- **Selection** (5 members, read by 1 files: SelectionToolbar.qml)
  - `selectedCount` property: SelectionToolbar.qml
  - `selectionDisabled` property: SelectionToolbar.qml
  - `selectionInfo` property: SelectionToolbar.qml
  - `selectionMostlyDisabled` property: SelectionToolbar.qml
  - `showNodeMenu` method: SelectionToolbar.qml
- **WorkflowHeader** (6 members, read by 1 files: HeaderRow.qml)
  - `canRedo` property: HeaderRow.qml
  - `canUndo` property: HeaderRow.qml
  - `documentSaveStatus` property: HeaderRow.qml
  - `renameWorkflow` method: HeaderRow.qml
  - `workflowName` property: HeaderRow.qml
  - `workflowRenamable` property: HeaderRow.qml
- **PanelLayout** (12 members, read by 4 files: HeaderRow.qml, Rail.qml, RunOutput.qml, StatusBar.qml)
  - `browserVisible` property: Rail.qml
  - `catalogVisible` property: Rail.qml
  - `chatVisible` property: HeaderRow.qml, Rail.qml
  - `inspectorVisible` property: HeaderRow.qml
  - `libraryVisible` property: Rail.qml
  - `miniMapVisible` property: HeaderRow.qml
  - `outputVisible` property: RunOutput.qml, StatusBar.qml
  - `setMiniMapVisible` method: HeaderRow.qml
  - `toggleChat` method: HeaderRow.qml, Rail.qml
  - `toggleStatusView` method: StatusBar.qml
  - `traceVisible` property: StatusBar.qml
  - `versionsVisible` property: StatusBar.qml
- **StatusModel** (8 members, read by 3 files: AuthoredControls.qml, StatusBar.qml, WorkflowBrowser.qml)
  - `connectionDetail` property: StatusBar.qml
  - `connectionState` property: AuthoredControls.qml, WorkflowBrowser.qml
  - `connectionStatus` property: StatusBar.qml
  - `edgeCount` property: StatusBar.qml
  - `nodeCount` property: StatusBar.qml
  - `queueAvailable` property: StatusBar.qml
  - `queuedCount` property: StatusBar.qml
  - `systemStats` property: StatusBar.qml
- **RunState** (4 members, read by 5 files: AuthoredControls.qml, QueueOverlay.qml, RunOutput.qml, SelectionToolbar.qml, Toolbar.qml)
  - `askRunAgent` method: RunOutput.qml
  - `authoredAction` method: AuthoredControls.qml
  - `shownQueue` property: QueueOverlay.qml, Toolbar.qml
  - `shownRunActive` property: AuthoredControls.qml, SelectionToolbar.qml, Toolbar.qml
- **Viewport** (6 members, read by 3 files: MiniMapControls.qml, MiniMapPopups.qml, ViewportIndicator.qml)
  - `closeMiniMapPopup` method: MiniMapPopups.qml
  - `miniMapColorMode` property: MiniMapControls.qml
  - `setMiniMapColorMode` method: MiniMapPopups.qml
  - `showMiniMapPopup` method: MiniMapControls.qml
  - `zoomIsPreset` property: ViewportIndicator.qml
  - `zoomPercent` property: ViewportIndicator.qml
- **ChatWindow** (3 members, read by 1 files: EditorChat.qml)
  - `beginChatGeometry` method: EditorChat.qml
  - `changeChatGeometry` method: EditorChat.qml
  - `resetChatPosition` method: EditorChat.qml
- **EditorCommands** (3 members, read by 8 files: HeaderRow.qml, LibraryPanel.qml, Rail.qml, SelectionToolbar.qml, StatusBar.qml, Toolbar.qml, ViewportIndicator.qml, WorkflowBrowser.qml)
  - `action` method: HeaderRow.qml, LibraryPanel.qml, Rail.qml, SelectionToolbar.qml, StatusBar.qml, Toolbar.qml, WorkflowBrowser.qml
  - `showToolTip` method: HeaderRow.qml, Rail.qml, StatusBar.qml, Toolbar.qml
  - `userAction` method: ViewportIndicator.qml
- **Leaves the window** (6 members, read by 5 files: OptionalPacksSection.qml, TextOutput.qml, Toolbar.qml, TypeIcon.qml, WorkflowBrowser.qml)
  - `deleteWorkflow` method: WorkflowBrowser.qml
  - `height` QWidget property: OptionalPacksSection.qml
  - `iconPath` method: TypeIcon.qml
  - `openWorkflow` method: WorkflowBrowser.qml
  - `presentation` method: Toolbar.qml
  - `styleOutputMarkdown` method: TextOutput.qml

Members no QML file reads (C++ callers only, or dead): `askAgent`, `cancelCatalogPlacement`, `catalogAtPointer`, `closeAllTabs`, `closeOtherTabs`, `emptyCanvas`, `focusCanvas`, `graphSummary`, `hasUnsavedChanges`, `layoutOverlays`, `openChild`, `outputMedia`, `runActive`, `saveState`, `serverSaveState`, `serverSyncAvailable`, `serverSyncNeedsAttention`, `setProperty`, `setup`.
<!-- END GENERATED -->
