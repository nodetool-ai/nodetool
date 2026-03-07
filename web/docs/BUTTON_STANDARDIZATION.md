# Button Standardization - Exhaustive Inventory

This document provides a comprehensive inventory of ALL button implementations in the NodeTool web application, categorized by functional type.

## Table of Contents

1. [Summary Statistics](#summary-statistics)
2. [Button Categories](#button-categories)
3. [Complete Inventory by Category](#complete-inventory-by-category)
4. [Styling Patterns Analysis](#styling-patterns-analysis)
5. [Existing Custom Components](#existing-custom-components)

---

## Summary Statistics

### Component Counts

*Approximate counts based on grep analysis. Some instances may be in comments or conditional code.*

| Component Type | ~Instances | Unique Files |
|---------------|------------|--------------|
| `<Button>` | ~185 | 95 |
| `<IconButton>` | ~142 | 78 |
| `<Fab>` | ~14 | 7 |
| `<ToggleButton>` | ~18 | 6 |
| `<ButtonGroup>` | ~8 | 7 |
| Native `<button>` | ~12 | 8 |

---

## Button Categories

Based on exhaustive analysis, buttons fall into these functional categories:

### Category Overview

| # | Category | Description | Count | Candidate for Custom Component |
|---|----------|-------------|-------|-------------------------------|
| 1 | **Close/Dismiss** | Close dialogs, panels, popovers | 28 | ✅ `CloseButton` (exists) |
| 2 | **Confirm/Cancel Dialog** | Dialog action pairs | 24 | ✅ `DialogActions` wrapper |
| 3 | **Delete/Remove** | Destructive actions | 18 | ✅ `DeleteButton` (exists) |
| 4 | **Create New** | Create workflow, chat, folder, collection | 16 | ✅ `CreateButton` |
| 5 | **Save/Submit** | Save, apply, submit forms | 14 | ✅ `SaveButton` |
| 6 | **Download/Upload** | File transfer actions | 12 | ✅ `FileUploadButton` (exists) |
| 7 | **Navigation** | Navigate between views, back buttons | 18 | ✅ `NavButton` |
| 8 | **Playback Controls** | Play, pause, stop, loop audio/video | 14 | ✅ `PlaybackButton` |
| 9 | **Run/Execute** | Run workflow, execute action | 8 | ✅ `RunButton` |
| 10 | **Copy to Clipboard** | Copy content | 12 | ✅ `CopyButton` (exists) |
| 11 | **Expand/Collapse** | Toggle visibility, accordions | 16 | ✅ `ExpandButton` |
| 12 | **Edit/Rename** | Enter edit mode | 10 | ✅ `EditButton` |
| 13 | **Toolbar Actions** | Editor formatting, node tools | 42 | ✅ `ToolbarButton` |
| 14 | **View Mode Toggle** | Grid/list, sort options | 12 | ✅ `ViewToggle` |
| 15 | **Filter/Tag Toggle** | Tag selection, filters | 8 | ✅ `FilterButton` |
| 16 | **Settings/Config** | Open settings, configure | 6 | ✅ `SettingsButton` |
| 17 | **Refresh/Reset** | Reload, reset state | 8 | ✅ `RefreshButton` |
| 18 | **Quick Actions (FAB)** | Floating primary actions | 14 | ✅ `QuickActionFab` |
| 19 | **Select/Deselect** | Bulk selection controls | 6 | ✅ `SelectButton` |
| 20 | **Zoom Controls** | Zoom in/out, reset | 6 | ✅ `ZoomControls` |

---

## Complete Inventory by Category

### 1. Close/Dismiss Buttons

Icon-only buttons to close dialogs, panels, menus, and popovers.

| File | Element | Icon | Size | Styling |
|------|---------|------|------|---------|
| `buttons/CloseButton.tsx` | `<Button>` | ClearIcon | default | Emotion css |
| `dialogs/FileBrowserDialog.tsx:661` | `<IconButton>` | CloseIcon | small | sx |
| `hugging_face/RequiredModelsDialog.tsx:91` | `<IconButton>` | CloseIcon | small | sx |
| `hugging_face/ReadmeDialog.tsx:73` | `<IconButton>` | CloseIcon | small | sx |
| `hugging_face/RecommendedModelsDialog.tsx:127` | `<IconButton>` | CloseIcon | small | sx |
| `hugging_face/ModelsManager.tsx:136` | `<IconButton>` | CloseIcon | small | className |
| `hugging_face/DownloadManagerDialog.tsx:127` | `<IconButton>` | CloseIcon | small | sx |
| `hugging_face/model_list/ModelCompatibilityDialog.tsx:287` | `<IconButton>` | CloseIcon | small | sx |
| `chat/composer/CollectionsSelector.tsx:191` | `<IconButton>` | CloseIcon | small | className |
| `chat/composer/ToolsSelector.tsx:359` | `<IconButton>` | CloseIcon | small | className |
| `chat/composer/NodeToolsSelector.tsx:312` | `<IconButton>` | CloseIcon | small | className |
| `chat/composer/WorkflowToolsSelector.tsx:298` | `<IconButton>` | CloseIcon | small | className |
| `chat/controls/MobileChatToolbar.tsx:129` | `<IconButton>` | CloseIcon | small | className |
| `node_menu/NodeMenu.tsx:290` | `<IconButton>` | CloseIcon | small | className |
| `menus/MobilePaneMenu.tsx:239` | `<IconButton>` | CloseIcon | small | none |
| `Inspector.tsx:298` | `<IconButton>` | CloseIcon | small | className |
| `Inspector.tsx:407` | `<IconButton>` | CloseIcon | small | className |
| `model_menu/shared/ModelMenuDialogBase.tsx:210` | `<IconButton>` | CloseIcon | small | sx |
| `assets/ImageCompareDialog.tsx:104` | `<IconButton>` | CloseIcon | - | className |
| `assets/AssetViewer.tsx:656` | `<IconButton>` | CloseIcon | - | className |
| `content/Help/DraggableNodeDocumentation.tsx:162` | `<button>` | × | - | className |
| `properties/TextEditorModal.tsx:954` | `<button>` | CloseIcon | - | className |

### 2. Confirm/Cancel Dialog Buttons

Button pairs in dialogs for confirming or canceling actions.

| File | Confirm Element | Cancel Element | Styling |
|------|-----------------|----------------|---------|
| `dialogs/ConfirmDialog.tsx:74-77` | `<Button>` "Confirm" | `<Button>` "Cancel" | className |
| `dialogs/FileBrowserDialog.tsx:838-841` | `<Button>` "Select" | `<Button>` "Cancel" | none |
| `collections/CollectionList.tsx:201-202` | `<Button>` "Delete" | `<Button>` "Cancel" | color prop |
| `collections/CollectionList.tsx:224` | `<Button>` "Close" | - | none |
| `workflows/WorkflowForm.tsx:530-533` | `<Button>` "Save" | `<Button>` "Cancel" | className |
| `assets/AssetCreateFolderConfirmation.tsx:269-275` | `<Button>` "Create" | `<Button>` "Cancel" | className |
| `assets/AssetRenameConfirmation.tsx:219-225` | `<Button>` "Rename" | `<Button>` "Cancel" | className |
| `assets/AssetDeleteConfirmation.tsx:205-208` | `<Button>` "Delete" | `<Button>` "Cancel" | color prop |
| `assets/AssetMoveToFolderConfirmation.tsx:107` | - | `<Button>` "Cancel" | className |
| `node/NodeTitleEditor.tsx:93-96` | `<Button>` "Save" | `<Button>` "Cancel" | className |
| `properties/FolderProperty.tsx:154-157` | `<Button>` "Create" | `<Button>` "Cancel" | className |
| `hugging_face/model_list/DeleteModelDialog.tsx:214-223` | `<Button>` "Delete" | `<Button>` "Cancel" | none |
| `node/NodeOutputs.tsx:187-194` | `<Button>` "Submit" | `<Button>` "Cancel" | variant |
| `node/NodePropertyForm.tsx:217-224` | `<Button>` "Add" | `<Button>` "Cancel" | variant |
| `dashboard/LayoutMenu.tsx:169-170` | `<Button>` "Save" | `<Button>` "Cancel" | none |
| `textEditor/FloatingTextFormatToolbar.tsx:277-278` | `<Button>` "Add" | `<Button>` "Cancel" | variant |
| `node_editor/NodeEditor.tsx:216-217` | `<Button>` "Confirm" | `<Button>` "Cancel" | variant |

### 3. Delete/Remove Buttons

Destructive action buttons for deleting items.

| File | Element | Icon | Context | Styling |
|------|---------|------|---------|---------|
| `buttons/DeleteButton.tsx` | `<Button>` | ClearIcon | Generic | Emotion css |
| `chat/thread/ThreadItem.tsx:52` | `<IconButton>` | DeleteIcon | Thread | className |
| `workflows/WorkflowListItem.tsx:115` | `<Button>` | DeleteIcon | Workflow | className |
| `collections/CollectionForm.tsx:151` | `<IconButton>` | DeleteIcon | Collection | sx |
| `collections/CollectionItem.tsx:197` | `<IconButton>` | DeleteIcon | Collection | sx |
| `properties/ToolsListProperty.tsx:129` | `<IconButton>` | ClearIcon | Tool item | sx |
| `node/DynamicOutputItem.tsx:64` | `<IconButton>` | DeleteIcon | Output | small |
| `node/Column.tsx:77` | `<IconButton>` | DeleteIcon | Column | className |
| `hugging_face/DownloadProgress.tsx:327` | `<IconButton>` | ClearIcon | Download | small |
| `hugging_face/model_card/ModelCardActions.tsx:69` | `<Button>` | DeleteIcon | Model | className |
| `workflows/WorkflowToolbar.tsx:158` | `<Button>` | DeleteIcon | Bulk delete | className |
| `context_menus/ContextMenuItem.tsx:127` | `<IconButton>` | DeleteIcon | Context | sx |
| `node/NodeToolButtons.tsx:107` | `<IconButton>` | RemoveCircleIcon | Node | className |
| `menus/SecretsMenu.tsx:322` | `<IconButton>` | DeleteIcon | Secret | sx |

### 4. Create New Buttons

Buttons for creating new items (workflows, chats, folders, collections).

| File | Element | Label/Icon | What it creates | Styling |
|------|---------|------------|-----------------|---------|
| `chat/thread/NewChatButton.tsx:16` | `<Fab>` | "New Chat" | Chat thread | className |
| `collections/CollectionList.tsx:75` | `<Fab>` | "Create" + AddIcon | Collection | sx |
| `workflows/WorkflowList.tsx:287` | `<Fab>` | "New" + AddIcon | Workflow | variant extended |
| `dashboard/WorkflowsList.tsx:165` | `<Button>` | "New Workflow" | Workflow | className |
| `dialogs/OpenOrCreateDialog.tsx:313` | `<Button>` | "New Workflow" | Workflow | variant outlined |
| `workspaces/WorkspaceTree.tsx:301` | `<Button>` | "Add Folder" | Folder | startIcon |
| `assets/AssetActions.tsx:321` | `<Button>` | "New Folder" | Folder | none |
| `dashboard/AddPanelDropdown.tsx:48` | `<Button>` | "Add Panel" | Dashboard panel | startIcon |
| `chat/composer/NewChatComposerButton.tsx:15` | `<IconButton>` | AddIcon | Chat | sx |
| `properties/RecordTypeProperty.tsx:91` | `<Button>` | "Add Column" | Column | none |
| `properties/DataframeProperty.tsx:105` | `<Button>` | "Add Column" | Column | className |
| `node/DataTable/TableActions.tsx:149` | `<IconButton>` | AddIcon | Row | none |
| `node/NodePropertyForm.tsx:85` | `<IconButton>` | AddIcon | Input | small |

### 5. Save/Submit Buttons

Buttons for saving data or submitting forms.

| File | Element | Label | Variant | Styling |
|------|---------|-------|---------|---------|
| `workflows/WorkflowForm.tsx:533` | `<Button>` | "Save" | - | className |
| `menus/RemoteSettingsMenu.tsx:525` | `<Button>` | "Save" | outlined | className |
| `menus/FoldersSettingsMenu.tsx:316` | `<Button>` | "Save" | outlined | className |
| `menus/SecretsMenu.tsx:409` | `<Button>` | "Save" | contained | none |
| `collections/CollectionForm.tsx:218` | `<Button>` | "Save" | contained | none |
| `collections/CollectionItem.tsx:286` | `<Button>` | "Save" | contained | sx |
| `node/NodeOutputs.tsx:194` | `<Button>` | "Save" | contained | small |
| `dashboard/GettingStartedPanel.tsx:571` | `<Button>` | action | outlined | startIcon |
| `miniapps/components/MiniAppInputsForm.tsx:252` | `<Button>` | "Generate" | contained | className |
| `panels/AppToolbar.tsx:406` | `<Button>` | SaveIcon | - | className |
| `panels/FloatingToolBar.tsx:564` | `<Fab>` | SaveIcon | - | className |

### 6. Download/Upload Buttons

Buttons for file download and upload operations.

| File | Element | Label/Icon | Action | Styling |
|------|---------|------------|--------|---------|
| `buttons/FileUploadButton.tsx:56` | `<IconButton>` | FileUploadIcon | Upload | sx |
| `buttons/FileUploadButton.tsx:68` | `<Button>` | "Upload Files" | Upload | variant outlined |
| `hugging_face/model_card/ModelCardActions.tsx:20` | `<Button>` | "Download" | Model download | className |
| `hugging_face/model_list/ModelListItemActions.tsx:66` | `<Button>` | "Download" | Model download | className |
| `hugging_face/DownloadProgress.tsx:417` | `<Button>` | "Resume" | Resume download | contained |
| `hugging_face/DownloadProgress.tsx:501` | `<Button>` | "Cancel" | Cancel download | className |
| `hugging_face/DownloadManagerDialog.tsx:171` | `<Button>` | "Cancel All" | Cancel all | outlined |
| `hugging_face/DownloadManagerDialog.tsx:178` | `<Button>` | "Clear" | Clear completed | outlined |
| `dashboard/GettingStartedPanel.tsx:264` | `<Button>` | DownloadIcon | Model download | startIcon |
| `assets/AssetViewer.tsx:619` | `<IconButton>` | DownloadIcon | Asset download | className |
| `panels/AppToolbar.tsx:674` | `<Button>` | DownloadIcon | Workflow export | className |

### 7. Navigation Buttons

Buttons for navigating between views, pages, or going back.

| File | Element | Label/Icon | Destination | Styling |
|------|---------|------------|-------------|---------|
| `panels/AppHeader.tsx:163` | `<IconButton>` | DashboardIcon | Dashboard | className |
| `panels/AppHeader.tsx:194` | `<IconButton>` | LibraryBooksIcon | Templates | className |
| `panels/AppHeader.tsx:238` | `<IconButton>` | ChatIcon | Chat | className |
| `panels/AppHeader.tsx:282` | `<IconButton>` | EditIcon | Editor | className |
| `panels/AppHeader.tsx:309` | `<IconButton>` | FolderIcon | Assets | className |
| `panels/AppHeader.tsx:340` | `<IconButton>` | CollectionsIcon | Collections | className |
| `panels/AppHeader.tsx:364` | `<IconButton>` | HelpIcon | Docs | className |
| `dashboard/BackToDashboardButton.tsx:25` | `<Button>` | ArrowBackIcon | Dashboard | startIcon |
| `dashboard/BackToDashboardButton.tsx:35` | `<Button>` | ArrowBackIcon | Dashboard | startIcon |
| `panels/BackToEditorButton.tsx:90` | `<Button>` | ArrowBackIcon | Editor | className |
| `dialogs/OpenOrCreateDialog.tsx:316` | `<Button>` | "Examples" | Example workflows | color |
| `dialogs/OpenOrCreateDialog.tsx:319` | `<Button>` | "Help" | Help | color |
| `menus/SettingsMenu.tsx:294` | `<Button>` | SettingsIcon | Settings | className |
| `hugging_face/ModelsButton.tsx:22` | `<IconButton>` | ModelIcon | Models | className |
| `assets/FolderTree.tsx:103` | `<Button>` | ">" | Folder select | none |
| `assets/AssetViewer.tsx:482` | `<IconButton>` | ChevronLeftIcon | Previous | className |
| `assets/AssetViewer.tsx:491` | `<IconButton>` | ChevronRightIcon | Next | className |

### 8. Playback Controls (Audio/Video)

Buttons for controlling audio and video playback.

| File | Element | Icon | Action | Styling |
|------|---------|------|--------|---------|
| `audio/AudioControls.tsx:195` | `<Button>` | PlayArrow/Pause | Play/Pause | className |
| `audio/AudioControls.tsx:205` | `<Button>` | LoopIcon | Toggle loop | className |
| `audio/AudioControls.tsx:215` | `<Button>` | VolumeOff/Up | Mute toggle | className |
| `audio/AudioControls.tsx:225` | `<Button>` | DownloadIcon | Download audio | className |
| `audio/WaveRecorder.tsx:115` | `<Button>` | MicIcon | Record | className |
| `audio/WaveRecorder.tsx:126` | `<Button>` | DevicesIcon | Device select | className |
| `node/output/RealtimeAudioOutput.tsx:76` | `<Button>` | Play/Stop | Start/Stop | none |
| `node/output/RealtimeAudioOutput.tsx:79` | `<Button>` | "Restart" | Restart | none |
| `chat/composer/StopGenerationButton.tsx:14` | `<IconButton>` | StopIcon | Stop generation | sx |

### 9. Run/Execute Buttons

Buttons for running workflows or executing actions.

| File | Element | Icon | Action | Styling |
|------|---------|------|--------|---------|
| `node/RunGroupButton.tsx:41` | `<Button>` | PlayArrowIcon | Run group | className |
| `panels/AppToolbar.tsx:547` | `<Button>` | PlayArrowIcon | Run workflow | className |
| `panels/AppToolbar.tsx:591` | `<Button>` | StopIcon | Stop workflow | className |
| `panels/FloatingToolBar.tsx:584` | `<Fab>` | PlayArrowIcon | Run workflow | className |
| `panels/FloatingToolBar.tsx:603` | `<Fab>` | StopIcon | Stop workflow | className |
| `node_editor/RunAsAppFab.tsx:14` | `<Fab>` | PlayArrowIcon | Run as app | sx |
| `miniapps/MiniAppPage.tsx:189` | `<Fab>` | EditIcon | Open in editor | sx |
| `panels/AppToolbar.tsx:626` | `<Button>` | PlayArrowIcon | Run as app | className |

### 10. Copy to Clipboard Buttons

Buttons for copying content to clipboard.

| File | Element | Icon | Context | Styling |
|------|---------|------|---------|---------|
| `common/CopyToClipboardButton.tsx:98` | `<IconButton>` | ContentCopyIcon | Generic | sx |
| `node/PreviewNode/PreviewActions.tsx:59` | `<Button>` | ContentCopyIcon | Preview | className |
| `node/DataTable/TableActions.tsx:200` | `<IconButton>` | ContentCopyIcon | Table data | none |
| `node/NodeErrors.tsx:75` | `<IconButton>` | ContentCopyIcon | Error | className |
| `node_editor/NotificationsList.tsx:155` | `<IconButton>` | ContentCopyIcon | Notification | className |
| `chat/message/MessageView.tsx:381` | `<Button>` | ContentCopyIcon | Message | className |
| `hugging_face/model_list/ModelCompatibilityDialog.tsx:210` | - | Copy | Command | className |
| `panels/NotificationButton.tsx:196` | `<IconButton>` | ContentCopyIcon | Notification | className |
| `node_editor/Alert.tsx:230` | - | Copy | Alert | className |
| `assets/AssetViewer.tsx:631` | `<IconButton>` | ContentCopyIcon | Asset | className |

### 11. Expand/Collapse Buttons

Buttons for expanding or collapsing content.

| File | Element | Icon | What it toggles | Styling |
|------|---------|------|-----------------|---------|
| `properties/StringProperty.tsx:92` | `<IconButton>` | ExpandMoreIcon | Text field | small |
| `properties/JSONProperty.tsx:95` | `<IconButton>` | ExpandMoreIcon | JSON viewer | small |
| `node/StepResultDisplay.tsx:192` | `<IconButton>` | ExpandMoreIcon | Step result | className |
| `node/NodeInputs.tsx:244` | `<Button>` | ExpandMoreIcon | Advanced fields | className |
| `chat/message/MessageView.tsx:353` | `<IconButton>` | ExpandMoreIcon | Message | small |
| `dashboard/GettingStartedPanel.tsx:604` | `<IconButton>` | ExpandMoreIcon | Models list | sx |
| `panels/PanelBottom.tsx:178` | `<IconButton>` | ExpandMoreIcon | Panel | - |
| `panels/PanelLeft.tsx:487` | `<IconButton>` | ChevronIcon | Panel | - |
| `panels/PanelRight.tsx:137` | `<IconButton>` | ChevronIcon | Panel | - |
| `dialogs/FileBrowserDialog.tsx:682` | `<IconButton>` | ChevronRightIcon | Folder | sx |
| `miniapps/components/MiniAppResults.tsx:64` | `<IconButton>` | ExpandMoreIcon | Results | sx |
| `hugging_face/model_card/ModelCardContent.tsx:108` | `<Button>` | ExpandMoreIcon | Readme | className |

### 12. Edit/Rename Buttons

Buttons for entering edit mode or renaming items.

| File | Element | Icon | What it edits | Styling |
|------|---------|------|---------------|---------|
| `workflows/WorkflowListItem.tsx:87` | `<Button>` | EditIcon | Workflow | className |
| `node/NodeExplorer.tsx:324` | `<Button>` | EditIcon | Node | className |
| `node/DynamicOutputItem.tsx:59` | `<IconButton>` | EditIcon | Output name | small |
| `menus/SecretsMenu.tsx:264` | `<IconButton>` | EditIcon | Secret | sx |
| `collections/CollectionItem.tsx:197` | `<IconButton>` | EditIcon | Collection | sx |
| `properties/TextEditorModal.tsx:863` | `<button>` | EditIcon | Editor mode | className |

### 13. Toolbar Action Buttons

Icon buttons in toolbars for formatting, node operations, and editor actions.

| File | Element | Icons | Context | Styling |
|------|---------|-------|---------|---------|
| `textEditor/EditorToolbar.tsx:90-138` | `<IconButton>` | Undo, Redo, Search, Wrap, Code | Editor | className |
| `textEditor/FindReplaceBar.tsx:224-305` | `<IconButton>` | Prev, Next, Replace, Close | Find/Replace | className |
| `textEditor/FloatingTextFormatToolbar.tsx` | Multiple | Format icons | Rich text | sx |
| `node/NodeToolButtons.tsx:72-107` | `<IconButton>` | Queue, Copy, Delete | Node actions | className |
| `node/DataTable/TableActions.tsx:149-200` | `<IconButton>` | Add, Delete, Sort, Copy | Table | none |
| `panels/AppToolbar.tsx:367-674` | `<Button>` | Various | Workflow | className |
| `panels/FloatingToolBar.tsx:467-603` | `<Fab>` | Various | Canvas | className |
| `panels/PanelLeft.tsx:403-487` | `<IconButton>` | Various | Left panel | - |
| `panels/PanelRight.tsx:137-192` | `<IconButton>` | Various | Right panel | - |
| `asset_viewer/PDFViewer.tsx:240-266` | `<IconButton>` | Navigate, Zoom | PDF | small |

### 14. View Mode Toggle Buttons

Toggle buttons for switching between view modes (grid/list, sort options).

| File | Element | Options | Context | Styling |
|------|---------|---------|---------|---------|
| `dialogs/OpenOrCreateDialog.tsx:327-337` | `<ToggleButtonGroup>` | Name/Date sort | Workflows | sx |
| `dashboard/WorkflowsList.tsx:154-162` | `<ToggleButtonGroup>` | Name/Date sort | Workflows | sx |
| `hugging_face/model_list/ModelListHeader.tsx:89-132` | `<ToggleButtonGroup>` | All/Installed/Available | Models | sx |
| `content/Help/KeyboardShortcutsView.tsx:316-348` | `<ToggleButtonGroup>` | OS, Language, Category | Shortcuts | exclusive |
| `assets/AssetActions.tsx:351` | `<Button>` | Grid/List icon | Assets | none |

### 15. Filter/Tag Toggle Buttons

Buttons for selecting filters or tags.

| File | Element | Icon | Context | Styling |
|------|---------|------|---------|---------|
| `workflows/TagFilter.tsx:24-56` | `<Button>` | Tags | Tag filter | variant |
| `model_menu/ModelFiltersBar.tsx:77-170` | `<Button>` | Filters | Model filters | sx |
| `chat/composer/CollectionsSelector.tsx:207-210` | `<Button>` | Select All/Clear | Collections | small |

### 16. Settings/Config Buttons

Buttons for opening settings or configuration panels.

| File | Element | Icon | Opens | Styling |
|------|---------|------|-------|---------|
| `menus/SettingsMenu.tsx:294` | `<Button>` | SettingsIcon | Settings menu | className |
| `menus/SettingsMenu.tsx:404-775` | `<Button>` | Various | Setting options | className |
| `dashboard/ProviderSetupPanel.tsx:300` | `<IconButton>` | InfoIcon | Provider info | small |
| `dashboard/ProviderSetupPanel.tsx:374` | `<Button>` | "Configure" | Provider setup | sx |
| `node/ApiKeyValidation.tsx:33` | `<Button>` | "Set API Key" | API key dialog | sx |
| `model_menu/shared/ProviderApiKeyWarningBanner.tsx:66` | `<Button>` | "Set API Key" | Settings | variant |

### 17. Refresh/Reset Buttons

Buttons for refreshing data or resetting state.

| File | Element | Icon | Action | Styling |
|------|---------|------|--------|---------|
| `chat/controls/ResetButton.tsx:19` | `<IconButton>` | RefreshIcon | Reset chat | className |
| `workspaces/WorkspaceTree.tsx:293` | `<IconButton>` | RefreshIcon | Refresh tree | small |
| `ErrorBoundary.tsx:124` | `<Button>` | "Reload" | Reload app | contained |
| `SearchErrorBoundary.tsx:97` | `<Button>` | "Try Again" | Retry search | contained |
| `terminal/Terminal.tsx:426` | `<Button>` | "Reconnect" | Reconnect | outlined |
| `node/DataTable/TableActions.tsx:173` | `<IconButton>` | RefreshIcon | Reset sort | none |
| `miniapps/components/MiniAppHero.tsx:68` | `<Button>` | RefreshIcon | Refresh | className |

### 18. Quick Actions (FAB)

Floating Action Buttons for primary quick actions.

| File | Element | Icon | Action | Styling |
|------|---------|------|--------|---------|
| `panels/FloatingToolBar.tsx:467` | `<Fab>` | MenuIcon | Open menu | className |
| `panels/FloatingToolBar.tsx:497` | `<Fab>` | FlashIcon | Quick actions | className |
| `panels/FloatingToolBar.tsx:524` | `<Fab>` | AddIcon | Node menu | className |
| `panels/FloatingToolBar.tsx:537` | `<Fab>` | AutoLayoutIcon | Auto layout | className |
| `panels/FloatingToolBar.tsx:551` | `<Fab>` | MoreIcon | More actions | className |
| `panels/QuickActions.tsx:370` | `<IconButton>` | Various | Quick add nodes | complex sx |

### 19. Select/Deselect Buttons

Buttons for bulk selection operations.

| File | Element | Label | Action | Styling |
|------|---------|-------|--------|---------|
| `assets/AssetActions.tsx:333` | `<Button>` | "Select All" | Select all | none |
| `assets/AssetActions.tsx:342` | `<Button>` | "Clear" | Deselect all | none |
| `chat/composer/CollectionsSelector.tsx:207` | `<Button>` | "Select All" | Select all | small |
| `chat/composer/CollectionsSelector.tsx:210` | `<Button>` | "Clear" | Clear all | small |
| `workflows/WorkflowToolbar.tsx:114` | `<Button>` | CheckboxIcon | Toggle checkboxes | className |
| `node/PreviewImageGrid.tsx:390` | `<IconButton>` | CloseIcon | Clear selection | sx |

### 20. Zoom Controls

Buttons for zoom operations.

| File | Element | Icon | Action | Styling |
|------|---------|------|--------|---------|
| `asset_viewer/PDFViewer.tsx:260` | `<IconButton>` | ZoomInIcon | Zoom in | small |
| `asset_viewer/PDFViewer.tsx:263` | `<IconButton>` | ZoomOutIcon | Zoom out | small |
| `asset_viewer/PDFViewer.tsx:266` | `<IconButton>` | FitScreenIcon | Reset zoom | small |
| `node/ChunkDisplay.tsx:48` | `<Button>` | ArrowUpIcon | Scroll up | small |
| `node/ChunkDisplay.tsx:51` | `<Button>` | ArrowDownIcon | Scroll down | small |

---

## Styling Patterns Analysis

### Styling Approaches Used

*Note: Many buttons use multiple styling approaches (e.g., className + variant), so counts below may overlap.*

| Approach | Approx Usage | Files | Notes |
|----------|--------------|-------|-------|
| `className` only | ~85 instances | 60+ | Most common, relies on CSS/Emotion |
| `sx` prop | ~72 instances | 50+ | MUI styling, inline |
| Emotion `css` prop | ~12 instances | 8 | Existing custom components |
| MUI `variant`/`color` props | ~45 instances | 35+ | Standard MUI |
| Inline `style` | ~8 instances | 6 | Least recommended |
| Mixed approaches | ~25 instances | 20+ | Inconsistent |

### Common className Patterns

```
.button-confirm       - Dialog confirm buttons
.button-cancel        - Dialog cancel buttons
.close-button         - Close/dismiss buttons
.delete-button        - Delete action buttons
.action-button        - Generic action buttons
.toolbar-button       - Toolbar buttons
.nav-button           - Navigation buttons
.floating-action-button - FAB buttons
.model-download-button - Model downloads
.copy-button          - Copy to clipboard
.save-button          - Save actions
.create-button        - Create new items
.run-workflow         - Run workflow buttons
.stop-workflow        - Stop workflow buttons
```

---

## Existing Custom Components

### Currently Implemented

| Component | Location | Usage | Status |
|-----------|----------|-------|--------|
| `CloseButton` | `buttons/CloseButton.tsx` | Close dialogs/panels | ✅ Exists |
| `DeleteButton` | `buttons/DeleteButton.tsx` | Delete items | ✅ Exists |
| `FileUploadButton` | `buttons/FileUploadButton.tsx` | File upload | ✅ Exists |
| `GoogleAuthButton` | `buttons/GoogleAuthButton.tsx` | Google auth | ✅ Exists |
| `CopyToClipboardButton` | `common/CopyToClipboardButton.tsx` | Copy text | ✅ Exists |

### Recommended Additional Custom Components

Based on the inventory, these wrappers would provide the most value:

1. **DialogActionButtons** - Standardize confirm/cancel pairs
2. **NavButton** - Navigation with consistent styling
3. **ToolbarIconButton** - Toolbar actions with tooltips
4. **CreateFab** - Extended FAB for create actions
5. **PlaybackControls** - Audio/video playback buttons
6. **RunWorkflowButton** - Run/stop workflow actions
7. **ExpandCollapseButton** - Consistent expand/collapse
8. **ViewModeToggle** - Grid/list, sort toggles
9. **RefreshButton** - Refresh/reset actions
10. **SelectionControls** - Select all/clear buttons

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-30 | Initial audit |
| 2.0 | 2024-12-30 | Exhaustive inventory with detailed categorization |
