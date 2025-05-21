# Web UI - React App Navigation

This guide helps OpenAI's coding agents navigate the React web application structure.

## Application Overview

The web UI is the main visual editor for NodeTool that allows users to build AI workflows through a drag-and-drop interface. It's built with React, TypeScript, and ReactFlow.

## Directory Structure

- `/components`: UI components organized by functionality
  - `/asset_viewer`: Components for viewing different asset types (audio, image, PDF, etc.)
  - `/assets`: Asset management components (explorer, grid, actions, etc.)
  - `/assistants`: Chat interfaces and workflow generators
  - `/audio`: Audio playback and recording components
  - `/buttons`: Reusable button components
  - `/collections`: Components for managing workflow collections
  - `/content`: Help documentation and welcome screens
  - `/context_menus`: Context menu components for different UI elements
  - `/dialogs`: Modal dialogs and confirmations
  - `/editor`: Tab-based editor components
  - `/hugging_face`: HuggingFace model integration components
  - `/inputs`: Form input components (color picker, date picker, etc.)
  - `/menus`: Application menus and settings
  - `/node`: Node visualization and editing components
  - `/node_editor`: The main workflow editor components
  - `/node_menu`: Components for node selection and organization
  - `/node_types`: Custom node type implementations
  - `/panels`: UI panels and toolbars
  - `/properties`: Property editors for different data types
  - `/search`: Search functionality components
  - `/themes`: Theming components and color palettes
  - `/workflows`: Workflow management components

- `/config`: Application configuration
- `/constants`: Application constants
- `/contexts`: React contexts for state management
- `/core`: Core functionality (graph logic)
- `/hooks`: Custom React hooks
  - `/assets`: Asset-related hooks
  - `/browser`: Browser interaction hooks
  - `/contextmenus`: Context menu hooks
  - `/handlers`: Event handler hooks
  - `/nodes`: Node manipulation hooks
- `/icons`: SVG icons for different data types and UI elements
- `/lib`: External library integrations
- `/providers`: React context providers
- `/serverState`: Server state management hooks
- `/stores`: Application state stores
- `/styles`: CSS styles
- `/utils`: Utility functions

## Key Components

- `NodeEditor.tsx`: The main workflow editor component
- `WorkflowCreator.tsx`: Component for creating new workflows
- `NodeMenu.tsx`: Component for browsing and selecting nodes
- `BaseNode.tsx`: The base component for all nodes
- `AssetExplorer.tsx`: File/asset browser component

## State Management

The application uses a custom store system with files in the `/stores` directory:
- `NodeStore.ts`: Manages node state
- `WorkflowRunner.ts`: Handles workflow execution
- `AssetStore.ts`: Manages assets
- `SettingsStore.ts`: Application settings

## Core Workflows

1. **Creating Workflows**:
   - `WorkflowCreator.tsx`
   - `NodeEditor.tsx`
   - `NodeMenu.tsx`

2. **Running Workflows**:
   - `WorkflowRunner.ts`
   - `NodeStore.ts`

3. **Managing Assets**:
   - `AssetExplorer.tsx`
   - `AssetGrid.tsx`
   - `AssetViewer.tsx`

## Development Notes

- The application uses ReactFlow for the node graph visualization
- Custom hooks in `/hooks` handle most of the UI interaction logic
- Node type mapping and handling is in `/utils/NodeTypeMapping.ts`
- Theme configuration is in `/styles` and `/themes`