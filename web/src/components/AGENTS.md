# Components Directory Guide

This guide helps OpenAI's coding agents understand the React components structure of NodeTool's web application.

## Root Components

- `HandleTooltip.tsx`: Tooltip component for node handles
- `InfiniteScroll.tsx`: Component for loading content incrementally
- `Inspector.tsx`: Component for inspecting node properties and values
- `KeyboardProvider.tsx`: Provider for keyboard shortcuts
- `Login.tsx`: Authentication screen component
- `Logo.tsx`: NodeTool logo component
- `ProtectedRoute.tsx`: Route wrapper for authenticated content
- `SvgFileIcon.tsx`: SVG icon components for files

## Asset Viewer Components (`/asset_viewer`)

Components for displaying different asset types:
- `AudioViewer.tsx`: Audio playback component
- `ImageViewer.tsx`: Image display component
- `PDFViewer.tsx`: PDF document viewer
- `TextViewer.tsx`: Text file viewer
- `VideoViewer.tsx`: Video playback component

## Asset Management Components (`/assets`)

Components for managing assets (files, folders, etc.):
- `AssetExplorer.tsx`: File browser component
- `AssetGrid.tsx`: Grid view of assets
- `AssetTable.tsx`: Table view of assets
- `AssetTree.tsx`: Tree view of assets
- `AssetViewer.tsx`: Asset preview component
- `Dropzone.tsx`: Drag and drop file upload area
- `FolderTree.tsx`: Hierarchical folder navigation

## Chat Components (`/chat`)

Components for chat interfaces:
- `ChatView.tsx`: Generic chat interface
- `HelpChat.tsx`: Help chat assistant
- `WorkflowChat.tsx`: Workflow-specific chat
- `GlobalChat.tsx`: Global chat interface
- `ToolsSelector.tsx`: Tool selection dropdown
- `ChatComposer.tsx`: Message composition component
- `/ui`: Chat UI sub-components (container, controls, header)

## Audio Components (`/audio`)

Audio processing and recording components:
- `AudioControls.tsx`: Playback controls
- `AudioPlayer.tsx`: Audio player component
- `WaveRecorder.tsx`: Audio recording component

## Button Components (`/buttons`)

Reusable button components:
- `CloseButton.tsx`: Button for closing dialogs/panels
- `DeleteButton.tsx`: Button for delete operations
- `FileUploadButton.tsx`: Button for file uploads
- `GoogleAuthButton.tsx`: Google authentication button

## Collection Components (`/collections`)

Components for managing workflow collections:
- `CollectionForm.tsx`: Form for creating/editing collections
- `CollectionList.tsx`: List of collections
- `WorkflowSelect.tsx`: Dropdown for selecting workflows

## Content Components (`/content`)

Static content and documentation:
- `/Help`: Help documentation components
- `/Welcome`: Welcome screen components

## Context Menu Components (`/context_menus`)

Right-click context menus:
- `NodeContextMenu.tsx`: Context menu for nodes
- `InputContextMenu.tsx`: Context menu for node inputs
- `OutputContextMenu.tsx`: Context menu for node outputs
- `PaneContextMenu.tsx`: Context menu for editor pane
- `PropertyContextMenu.tsx`: Context menu for properties
- `SelectionContextMenu.tsx`: Context menu for selected items

## Dialog Components (`/dialogs`)

Modal dialogs:
- `ConfirmDialog.tsx`: Generic confirmation dialog
- `OpenOrCreateDialog.tsx`: Dialog for opening/creating workflows

## Editor Components (`/editor`)

Tab-based editor components:
- `TabHeader.tsx`: Tab header component
- `TabsBar.tsx`: Navigation tabs component
- `TabsNodeEditor.tsx`: Tab-based node editor

## Hugging Face Components (`/hugging_face`)

HuggingFace AI model integration:
- `HuggingFaceModelSearch.tsx`: Model search interface
- `ModelDownloadDialog.tsx`: Dialog for downloading models
- `ModelsManager.tsx`: Model management component
- `RecommendedModels.tsx`: Recommended model suggestions

## Input Components (`/inputs`)

Form input components:
- `ColorPicker.tsx`: Color selection component
- `DatePicker.tsx`: Date selection component
- `EditableInput.tsx`: Editable text input
- `NumberInput.tsx`: Numeric input component
- `Select.tsx`: Dropdown selection component
- `SliderNodes.tsx`: Slider component for node properties

## Menu Components (`/menus`)

Application menus:
- `AppIconMenu.tsx`: App icon main menu
- `CommandMenu.tsx`: Command palette
- `SettingsMenu.tsx`: Settings configuration menu
- `SettingsSidebar.tsx`: Settings sidebar

## Node Components (`/node`)

Core node visualization components:
- `BaseNode.tsx`: Base component for all nodes
- `NodeContent.tsx`: Node content container
- `NodeInputs.tsx`: Node inputs container
- `NodeOutputs.tsx`: Node outputs container
- `NodePropertyForm.tsx`: Property editor form
- `OutputRenderer.tsx`: Component for rendering node outputs
- `ReactFlowWrapper.tsx`: Wrapper for ReactFlow integration

## Node Editor Components (`/node_editor`)

Workflow editor components:
- `NodeEditor.tsx`: Main node graph editor
- `WorkflowCreator.tsx`: Component for creating workflows
- `ConnectionLine.tsx`: Custom connection line renderer
- `NotificationsList.tsx`: Notifications component

## Node Menu Components (`/node_menu`)

Node selection and organization:
- `NodeMenu.tsx`: Menu for browsing/selecting nodes
- `NamespaceList.tsx`: List of node namespaces
- `TypeFilter.tsx`: Filter for node types
- `SearchResults.tsx`: Node search results component

## Panel Components (`/panels`)

UI panels and toolbars:
- `AppHeader.tsx`: Application header
- `AppToolbar.tsx`: Main application toolbar
- `PanelLeft.tsx`: Left sidebar panel
- `StatusMessage.tsx`: Status message display

## Property Components (`/properties`)

Property editors for different data types:
- `StringProperty.tsx`: String property editor
- `NumberProperty.tsx`: Numeric property editor
- `ColorProperty.tsx`: Color property editor
- `ImageProperty.tsx`: Image property editor
- `ModelProperty.tsx`: Model property editor

## Workflow Components (`/workflows`)

Workflow management components:
- `WorkflowList.tsx`: List of workflows
- `WorkflowForm.tsx`: Form for creating/editing workflows
- `WorkflowTile.tsx`: Workflow tile component
- `WorkflowToolbar.tsx`: Workflow-specific toolbar

## Component Architecture

The components follow these design patterns:

1. **Composable Components**: Most complex components are composed of smaller, reusable components
2. **Container/Presentation Pattern**: Many components separate logic (container) from presentation
3. **Context Integration**: Components connect to global state via React context and custom hooks
4. **Responsive Design**: Components adapt to different screen sizes

## Key Component Dependencies

- ReactFlow for node-based visual interface
- Material UI for UI elements
- React hooks for state management
- Custom context providers for global state