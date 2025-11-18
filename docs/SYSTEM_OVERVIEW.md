# NodeTool Web App – Architecture & Feature Overview

This document describes the NodeTool web UI as implemented under `web/`. It focuses on structure, major components, state management, and how the app connects to the backend and real‑time services.

---

## 1. Role of the Web App

The NodeTool project is a “local‑first agent workbench” (root `README.md`) that lets users visually build and run AI workflows. The `web` folder contains the main React/TypeScript SPA that powers:

- The visual node‑based workflow editor
- A dockable dashboard / workspace
- A global AI assistant chat
- Asset and model management
- A “mini‑app” runner for workflows
- Electron‑wrapped desktop UI (via the separate `electron` project)

Technologies in `web/package.json`:

- React 18, TypeScript, Vite 6 (`web/src/index.tsx:1`, `web/vite.config.ts`)
- Material UI + Emotion theming (`web/src/components/themes/ThemeNodetool.tsx:1`)
- React Router v7 (`react-router-dom`)
- XYFlow (`@xyflow/react`) for the graph editor
- Zustand (`zustand`) for client state
- TanStack React Query (`@tanstack/react-query`) for server state
- Supabase auth (`@supabase/supabase-js`)
- Dockview for the dashboard layout
- Lexical for rich text editing
- Xterm for terminal, Wavesurfer for audio, Plotly for charts, etc.

---

## 2. Entry Point & Routing

### 2.1 Root Application Setup

`web/src/index.tsx:1` is the SPA entry point. It:

- Imports global styles and polyfills:
  - XYFlow styles, various CSS files (`vars.css`, `index.css`, `mobile.css`, dockview styles, etc.)
  - Prism global highlighting (`prismGlobal.ts`)
- Initializes the React tree:
  - `QueryClient` + `QueryClientProvider` for React Query
  - `ThemeProvider` with a custom theme (`ThemeNodetool`)
  - `MobileClassProvider` to add mobile-specific CSS classes
  - `MenuProvider` for app‑wide menu state
  - `WorkflowManagerProvider` (Zustand‑backed workflow context)
  - `KeyboardProvider` for global keyboard handling
  - `RouterProvider` for React Router
  - A `DownloadManagerDialog` for model downloads

On boot, it:

- Calls `useAuth.getState().initialize()` to set up Supabase auth / local dev login
- Calls `initKeyListeners()` (keyboard tracking store)
- Calls `loadMetadata()` to fetch node metadata from `/api/nodes/metadata` before rendering routes; shows a `CircularProgress` or an error message while loading.

### 2.2 Routes

Routes are created via `createBrowserRouter(getRoutes())` in `web/src/index.tsx:15`:

- `/` – `NavigateToStart`:
  - In localhost mode, goes to `/dashboard`.
  - Otherwise decides between `/dashboard` or `/login` based on auth state.

- `/dashboard` – main workspace, renders:
  - `Dashboard` (`web/src/components/dashboard/Dashboard.tsx:1`)
  - Inside `Dashboard`, Dockview panels host workflows list, templates, recent chats, and a chat panel.

- `/login` – login page:
  - `Login` (`web/src/components/Login.tsx`) uses Supabase OAuth via `useAuth`.

- `/chat/:thread_id?` – full‑screen global assistant chat:
  - Wrapped in `ProtectedRoute`
  - Layout: `AppHeader` at top, `PanelLeft`, `GlobalChat`, `PanelBottom`.
  - `GlobalChat` (`web/src/components/chat/containers/GlobalChat.tsx:1`) orchestrates threads, messages, and tool use.

- `/apps/:workflowId?` – mini‑app runner:
  - Protected route with `AppHeader`, `PanelLeft`, `MiniAppPage`, `PanelBottom`.
  - `MiniAppPage` (`web/src/components/miniapps/MiniAppPage.tsx:1`) shows a form UI for a workflow’s inputs and a results panel.

- `/editor` – redirects to root start logic (no editor loaded).

- `assets` – asset explorer:
  - Protected; layout: `PanelLeft` + `AssetExplorer`.
  - `AssetExplorer` (`web/src/components/assets/AssetExplorer.tsx:1`) wraps `AssetGrid` with header and context menus.

- `collections` – collections explorer:
  - Protected; shows `CollectionsExplorer` for asset/workflow collections.

- `templates` – template / example workflows:
  - Protected; `PanelLeft + TemplateGrid`.

- `editor/:workflow` – main node editor:
  - Protected; wrapped in `FetchCurrentWorkflow` so the proper workflow is loaded/activated.
  - Layout:
    - `AppHeader` (fixed top)
    - Main area: `PanelLeft`, `TabsNodeEditor`, `PanelRight`, `PanelBottom`, `Alert`.
  - `TabsNodeEditor` manages multiple editor tabs; it contains `NodeEditor` instances for workflows.

- `models` – model manager:
  - Protected; routes to `ModelListIndex` (Hugging Face / local models listing) with download and filter UI.

- `/layouttest` – dev‑only experimental layout page (only when `isLocalhost` is true).

All routes attach a shared `ErrorBoundary` as `ErrorBoundary` on each `RouteObject`.

---

## 3. Global Data & State Layer

### 3.1 API Client & Environment

- `ApiClient.ts` (`web/src/stores/ApiClient.ts:1`) uses `openapi-fetch` and types generated to `web/src/api.ts` from `/openapi.json`.
- It determines `isLocalhost` based on host or overrides (`VITE_FORCE_LOCALHOST`, query, localStorage).
- For non‑localhost, it:
  - Fetches the current Supabase session and attaches `Authorization: Bearer <token>` and `apikey` headers via a middleware.
  - Exposes `client` for typed HTTP calls (e.g., `client.GET("/api/workflows/")`).

Base URLs:

- `BASE_URL.ts` – backend HTTP base URL.
- `CHAT_URL` and `WORKER_URL` (in `BASE_URL.ts`) are used for WebSocket connections.

Supabase:

- `supabaseClient.ts` (`web/src/lib/supabaseClient.ts:1`) configures the client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, with local fallbacks in dev.

Auth store:

- `useAuth.ts` (`web/src/stores/useAuth.ts:1`) is a Zustand store that:
  - Tracks `session`, `user`, `state` (`init`/`loading`/`error`/`logged_in`/`logged_out`).
  - In localhost mode, fakes a logged‑in user with id `"1"` and skips Supabase.
  - Provides `signInWithProvider` and `signOut` using Supabase OAuth.

### 3.2 Central Stores (Zustand)

Stores are documented in `web/src/stores/AGENTS.md`. Key categories:

**UI state**

- `AppHeaderStore.ts`: state for app header UI (buttons, menus).
- `PanelStore.ts`, `RightPanelStore.ts`, `BottomPanelStore.ts`, `LayoutStore.ts`: manage visibility and sizes of panels and dockview layouts.
- `ContextMenuStore.ts`: context‑menu positioning & visibility.
- `NotificationStore.ts`: toast/notification entries.
- `StatusStore.ts`: per‑workflow node execution status.
- `SettingsStore.ts`: user preferences (e.g., workflow order, welcome panel settings).
- `RemoteSettingStore.ts`: remote configuration from backend.
- `KeyPressedStore.ts`: global keyboard combo tracking.
- `UpdatesStore.ts`, `WebSocketUpdatesStore.ts`: app update state and system stats.
- `SecretsStore.ts`: stored provider/API secrets.

**Assets & files**

- `AssetStore.ts`, `AssetGridStore.ts`: asset collection, paging, selection, and grid layout state.
- `FileStore.ts`: directory/file tree operations.
- `CollectionStore.ts`: collections of assets or workflows.
- `AudioQueueStore.ts`: queue of audio tasks/playback.
- `MiniAppsStore.ts`: mini‑apps-related state.

**Nodes & workflows**

- `NodeStore.ts` (`web/src/stores/NodeStore.ts:1`):
  - Holds `nodes`, `edges`, workflow metadata, selection, viewport, hover, etc.
  - Uses XYFlow node/edge types.
  - Validates edges (`isValidEdge`), sanitizes the graph when metadata changes, and ensures parent relationships are valid.
  - Provides extensive helpers:
    - Selection: `getSelection`, `getSelectedNodes`, `selectNodesByType`, `setSelectedNodes`, `selectAllNodes`.
    - Graph operations: `addNode`, `updateNode`, `updateNodeData`, `deleteNode`, `addEdge`, `deleteEdge`, `onConnect`, `onNodesChange`, `onEdgesChange`.
    - Layout: `autoLayout` via `core/graph.ts`, `setShouldAutoLayout`, `setShouldFitToScreen`, `fitViewTargetNodeIds`.
    - Serialization: `workflowJSON`, `getWorkflow`, `setWorkflowDirty`.
    - ID generation: `generateNodeId(s)`, `generateEdgeId`.
    - Missing models tracking to drive UI prompts.
  - Uses `zundo` temporal middleware for undo/redo on `nodes/edges/workflow`.

- `NodeMenuStore.ts`, `NodePlacementStore.ts`, `ConnectableNodesStore.ts`, `ConnectionStore.ts`: manage node menu search/filter state, node placement hints, allowed connections, and currently active connections.

- `ResultsStore.ts`: streaming outputs, previews, progress, tool calls, planning updates, logs.

- `MetadataStore.ts`: node type metadata and recommended models loaded from the backend.

- `WorkflowRunner.ts` (`web/src/stores/WorkflowRunner.ts:1`):
  - Manages WebSocket job execution for a workflow.
  - State includes `workflow`, `nodes`, `edges`, `job_id`, `state` (`idle`, `connecting`, `connected`, `running`, `error`, `cancelled`), and `statusMessage`.
  - Methods:
    - `ensureConnection` – uses `globalWebSocketManager` to establish a WebSocket connection shared across workflows.
    - `run` – sends a `run_job` command over WebSocket with:
      - `graph` converted from XYFlow to backend graph using `reactFlowNodeToGraphNode` and `reactFlowEdgeToGraphEdge`.
      - `resource_limits` and auth token where needed.
    - `reconnect`, `reconnectWithWorkflow` – reconnect to an ongoing job by job id.
    - `streamInput` / `endInputStream` – send streaming inputs (for audio/etc.).
    - `cancel` – send `cancel_job` and clear local statuses/progress.
    - `addNotification` – passes notifications to `NotificationStore`.
  - `getWorkflowRunnerStore` lazily creates one store per workflow ID.
  - `useWebsocketRunner` returns a selected slice of the runner store based on the current workflow in `WorkflowManagerContext`.

- `WorkflowRunner` integrates with `workflowUpdates.ts` to process job updates into `StatusStore`, `ResultsStore`, etc.

**Models**

- `ModelStore.ts`: definitions & state for models exposed in UI.
- `ModelDownloadStore.ts`: tracks model download tasks; the index component wires it to `QueryClient`.
- `ModelManagerStore.ts`, `ModelMenuStore.ts`, `ModelFiltersStore.ts`, `ModelPreferencesStore.ts`: state for listing, filtering, and choosing models.

**Sessions & system**

- `SessionStateStore.ts`: ephemeral session data (clipboard, temporary UI state).
- `LogStore.ts`, `ErrorStore.ts`: logging and error tracking.
- `WebSocketUpdatesStore.ts`: system stats and streaming updates.
- `GlobalChatStore.ts` (`web/src/stores/GlobalChatStore.ts:1`):
  - Holds chat connection status (`status`, `statusMessage`, `progress`).
  - Thread state: `threads`, `currentThreadId`, `lastUsedThreadId`, `threadsLoaded`.
  - Message caches per thread (`messageCache` + cursors).
  - Agent mode toggle (`agentMode`).
  - Selection state: `selectedModel`, `selectedTools`, `selectedCollections`.
  - Planning & task updates: `currentPlanningUpdate`, `currentTaskUpdate`.
  - Workflow graph updates: `lastWorkflowGraphUpdate` for pushing graph changes to open editors.
  - Chat WebSocket management:
    - Creates a `WebSocketManager` with URL `CHAT_URL`, optionally including a Supabase `api_key`.
    - Listens for varied message types (`Message`, `JobUpdate`, `NodeUpdate`, `ToolCallUpdate`, `PlanningUpdate`, `WorkflowCreatedUpdate`, etc.) and merges them into local state.
  - Threads operations: `fetchThreads`, `createNewThread`, `switchThread`, `deleteThread`, `updateThreadTitle`, `summarizeThread`, `getAgentExecutionMessages`.
  - Message operations: `sendMessage`, `resetMessages`, `stopGeneration`, `addMessageToCache`, `clearMessageCache`.
  - Integrates with `FrontendToolRegistry` to expose UI tools to the backend assistant as callable “frontend tools”.

---

## 4. Contexts & Providers

### 4.1 WorkflowManagerContext

`WorkflowManagerContext.tsx` (`web/src/contexts/WorkflowManagerContext.tsx:1`) creates a React context backed by a Zustand store:

- State: `nodeStores: Record<string, NodeStore>`, `currentWorkflowId`, `openWorkflows`, `systemStats`, `queryClient`.
- LocalStorage persistence:
  - Current workflow id under `"currentWorkflowId"`.
  - List of open workflow ids under `"openWorkflows"`.
- Methods:
  - Creation: `newWorkflow`, `createNew`, `create`, `copy`.
  - Loading: `load`, `loadIDs`, `loadPublic`, `loadTemplates`, `searchTemplates`.
  - Saving: `saveWorkflow` (PUT via API), and `saveExample` (save as example/workflow pack).
  - Deletion: `delete`.
  - Workflow retrieval: `getWorkflow`, `getCurrentWorkflow`, `setCurrentWorkflowId`.
  - Node store management: `addWorkflow` (creates `NodeStore` with `createNodeStore` and adds to `nodeStores`), `removeWorkflow`, `reorderWorkflows`.
  - Validation helpers: `validateAllEdges`.
- `useWorkflowManager` hook reads slices of this store inside components.

`FetchCurrentWorkflow` is a helper component that ties the URL parameter `:workflow` to the active workflow in this context.

### 4.2 NodeContext

`NodeContext.tsx`:

- Provides a per‑workflow `NodeStore` via a React context.
- Exposes:
  - `useNodes(selector)` hook that subscribes to part of a NodeStore state with custom equality.
  - `useTemporalNodes` for accessing the zundo temporal state (undo/redo stack) of that NodeStore.
- Used heavily by `NodeEditor`, properties panel, etc.

### 4.3 Other Providers

- `MenuProvider.tsx`: manages app menus and command palette context.
- `ContextMenuProvider.tsx`: wraps parts of the UI to give them shared context menu behavior.
- `ConnectableNodesProvider.tsx`: computes and provides connectable node information for the editor.
- `KeyboardProvider.tsx`: enables keyboard shortcut handling within the app tree (interacts with `KeyPressedStore`).

---

## 5. Core Graph & Layout Logic

`web/src/core/graph.ts:1` contains graph utilities:

- `topologicalSort(edges, nodes)`:
  - Kahn’s algorithm variant, returns a list of node layers; each layer can be processed in parallel.
  - Logs a warning if there are cycles.

- `subgraph(edges, nodes, startNode, stopNode?)`:
  - DFS‑based subgraph extraction from a starting node, optionally stopping at a node.

- `autoLayout(edges, nodes)`:
  - Uses ELK (`elkjs`) to layout the graph:
    - Filters out comment nodes.
    - Groups nodes by `parentId` (e.g., group nodes).
    - Creates ELK graphs and calculates positions.
    - Updates node positions to match ELK output.
    - Adjusts parent group node sizes to fit contained nodes.
  - Returns new node positions, preserving comment nodes.

This is used by `NodeStore.autoLayout` and by tooling after workflow graph updates (e.g., `useWorkflowGraphUpdater`).

---

## 6. Hooks Overview

Hooks are organized under `web/src/hooks` and `web/src/serverState`. Major categories:

### 6.1 Node editor & workflow hooks

- `useNodeEditorShortcuts.ts`:
  - Registers keyboard combos (from `config/shortcuts.ts`) via `KeyPressedStore`.
  - Handles:
    - Copy, cut, paste using `useCopyPaste`.
    - Node alignment (`useAlignNodes`).
    - Duplicate selection (horizontal/vertical).
    - Grouping (`useSurroundWithGroup`).
    - View controls (zoom, fit view).
    - Save, save as example, close workflow, create new workflow, navigation.
    - Opening the node menu at mouse position.
  - Uses `useWorkflowManager`, `useNodes`, `useTemporalNodes`, `useReactFlow`, notifications, right panel toggling.

- `useFitView.ts`, `useFitNodeEvent.ts`, `useAlignNodes.ts`, `useDuplicate.ts`, `useFocusPan.ts`, `useProcessedEdges.ts`:
  - Convenience wrappers around XYFlow APIs and NodeStore to align, fit, duplicate, and sanitize edges.

- `useWorkflowGraphUpdater.ts`:
  - Subscribes to `GlobalChatStore`’s `lastWorkflowGraphUpdate`.
  - When an assistant modifies a workflow graph, converts the updated graph to XYFlow nodes/edges and updates the corresponding NodeStore, then triggers `autoLayout` and marks the workflow as not dirty.

- `useWorkflowActions.ts`, `useDashboardData.ts`:
  - `useDashboardData` (seen in `Dashboard.tsx`) loads:
    - Workflows from `/api/workflows/`.
    - Templates via `useWorkflowManager.loadTemplates`.
    - Derives sorted workflows and “start templates” subset.
  - `useWorkflowActions` bundles actions like creating, opening, and clicking templates/workflows for the dashboard UI.

### 6.2 Chat & job hooks

- `useChatService.ts`:
  - Combines `GlobalChatStore` operations into a cohesive interface for the dashboard chat panel:
    - `status`, `sendMessage`, `progress`, `statusMessage`, planning & task updates.
    - Thread operations (`onNewThread`, `onSelectThread`, `deleteThread`, `getThreadPreview`).

- `useEnsureChatConnected.ts`:
  - Ensures the global chat WebSocket is connected while certain components (dashboard or global chat page) are mounted.

- `useJobReconnection.ts`:
  - On app load, checks for running jobs and reconnects to them via `WorkflowRunner` and `GlobalWebSocketManager`.

- `useRunningJobs.ts`: provides state and helpers for currently running workflows.

### 6.3 Model, provider, and metadata hooks

- `useHuggingFaceModels.ts`, `useLoraModels.ts`, `useOllamaModels.ts`, `useModelsByProvider.ts`, `useRecommendedModels.ts`, `useRecommendedTaskModels.ts`, `useModelInfo.ts`:
  - Use React Query to fetch model lists from the backend and derive recommended subsets.

- `useProviders.ts`, `useProviderApiKeyValidation.ts`, `useApiKeyValidation.ts`, `useSecrets.ts`:
  - Manage provider lists and validation of API keys stored in `SecretsStore`.

### 6.4 UI & UX hooks

- `useNumberInput.ts`:
  - Provides sophisticated number input behavior (drag‑to‑change, clamping, decimal precision).

- `useDelayedHover.ts`:
  - Introduces delayed hover logic for tooltips and menus.

- `useRenderLogger.tsx`:
  - Debugging hook to log re-render causes.

- `useCollectionDragAndDrop.ts`:
  - Drag‑and‑drop in collections UI.

- `useIsDarkMode.ts`: uses media queries / settings to choose theme.

### 6.5 Browser & desktop hooks

- `useIpcRenderer.ts`:
  - Handles Electron IPC (if `window.api` is available) for desktop integrations (e.g., menus, OS level actions).

- `useRealtimeAudioStream.ts`, `useInputStream.ts`, `useWaveRecorder` (via audio components):
  - Manage audio recording & streaming to backend nodes.

### 6.6 ServerState hooks

Under `web/src/serverState`:

- `useMetadata.ts` + `loadMetadata` (`useMetadata.ts` and `useMetadata.ts` invoked from `index.tsx`):
  - Already covered; fetches node metadata, registers BaseNode, builds connectability matrix.

- Asset hooks: `useAssets.ts`, `useAssetUpload.ts`, `useAssetDeletion.ts`, `useAssetUpdate.ts`, `useAssetSearch.ts`, `useAsset.ts`.
  - Provide TanStack Query wrappers around `/api/assets` endpoints and integrate with `AssetStore`.

- Workflow hooks: `useWorkflow.ts`, `useWorkflowTools.ts`:
  - Fetch a single workflow by id and related “workflow tools” for the assistant.

- `checkHfCache.ts`, `tryCacheFiles.tsx`: check local Hugging Face cache or prefetch files.

---

## 7. Feature Domains & UI Components

### 7.1 Dashboard

`Dashboard.tsx` (`web/src/components/dashboard/Dashboard.tsx:1`) builds a Dockview‑based workspace:

- Layout:
  - `AppHeader` pinned at top inside the dashboard.
  - `DockviewReact` container with panels defined by `PANEL_CONFIG`.
  - Default layout from `config/defaultLayouts.ts` pre–configures splits:
    - A “Workflows” panel.
    - A “Recent chats” panel.

- Panels & content:
  - Uses `createPanelComponents` to map IDs to React components:
    - `welcome` – welcome / getting started content.
    - `setup` – setup panel (providers, local environment).
    - `templates` – “start templates” from `useDashboardData`.
    - `workflows` – list/sorting of workflows.
    - `recent-chats` – `Thread` list using `GlobalChatStore`.
    - `chat` – embedded chat UI.
  - `AddPanelDropdown` and `LayoutMenu` allow adding panels and saving/restoring layouts via `LayoutStore` and Dockview’s JSON export/import.

- Behavior:
  - Uses `useDashboardData` to populate workflows and templates.
  - Uses `useChatService` + `useEnsureChatConnected` to integrate chat into the dashboard.
  - Ensures “welcome” and “setup” panels are automatically shown on startup depending on `SettingsStore`.
  - Persists and restores panel layouts through `LayoutStore` and Dockview’s JSON export/import.

### 7.2 Workflow Editor

Core files:

- `NodeEditor.tsx` (`web/src/components/node_editor/NodeEditor.tsx:1`)
- `TabsNodeEditor.tsx` (`web/src/components/editor/TabsNodeEditor.tsx`)
- `ReactFlowWrapper.tsx` (`web/src/components/node/ReactFlowWrapper.tsx`)
- Node detail components in `web/src/components/node` and `web/src/components/node_types`

Behavior:

- `TabsNodeEditor` manages multiple open workflows as tabs, each tab embedding a `NodeContext` + `NodeEditor`.
- `NodeEditor`:
  - Uses styles from multiple CSS files (`base.css`, `nodes.css`, `properties.css`, etc.) and `node_styles/node-styles.ts`.
  - Wires to `NodeStore` via `useNodes` / `useTemporalNodes`.
  - Uses `useWebsocketRunner` to keep track of workflow run state (connecting, running, etc.).
  - Uses `useAssetUpload` for drag‑and‑drop / file uploads into the editor.
  - Integrates `NodeMenu` for node search and insertion.
  - Shows node help documentation via `DraggableNodeDocumentation` and `KeyboardShortcutsView`.
  - Configures keyboard shortcuts via `useNodeEditorShortcuts` and `KeyPressedStore`.
  - Has a `CommandMenu` (command palette) triggered by `meta+k` / `ctrl+k`.
  - Keeps track of missing models (prompting downloads if needed).

- Node rendering:
  - `BaseNode.tsx` is the generic node component for the majority of node types, driven by metadata.
  - `PlaceholderNode.tsx` is used for unknown or not‑yet‑loaded node types (to keep graphs stable).
  - Node inputs/outputs, labels, handles, and property forms are rendered using:
    - `NodeContent`, `NodeInputs`, `NodeOutputs`, `NodePropertyForm`, `OutputRenderer`.
  - Node connections are drawn with custom `ConnectionLine.tsx` and `EdgeGradientDefinitions.tsx`.

- Node types:
  - Backend metadata defines node types (logically in Python). On the frontend, `loadMetadata` registers all `node_type → BaseNode` mappings.
  - `NodeTypeMapping.ts` maps MIME types and internal type names (e.g., `text`, `image`, `audio`) to input/output node classes (e.g., `nodetool.input.ImageInput`, `nodetool.output.TextOutput`) and constants.

### 7.3 Global Chat & Agent Tools

Components:

- `GlobalChat.tsx` (`web/src/components/chat/containers/GlobalChat.tsx:1`)
- Child structures under `chat/composer`, `chat/message`, `chat/thread`, `chat/controls`.

Features:

- Thread‑centric chat, where each thread:
  - Is persisted on the backend (`Thread` in `ApiTypes`).
  - Can be loaded, deleted, and summarized.
  - Has `Message` history cached locally with pagination.
- Chat connection:
  - `GlobalChatStore.connect()` creates a `WebSocketManager` with `CHAT_URL`, optionally with a Supabase token in the query string.
  - Uses TanStack Query (`useThreadsQuery`) to load thread metadata.
  - `useEnsureChatConnected` automatically connects while the chat UI is present.
- Agent features:
  - `agentMode` toggle: messages flagged as agent mode may trigger more “planning” and tool call behavior.
  - Planning and task updates:
    - AI agent can send `PlanningUpdate` and `TaskUpdate` messages.
    - The UI surfaces them in the dashboard panels and chat view.
  - Frontend tools:
    - `FrontendToolRegistry` (`web/src/lib/tools/frontendTools.ts:19`) defines tools starting with `ui_` that can be invoked by the backend agent (e.g., `ui_add_node`, `ui_align_nodes`, etc.).
    - Built‑in tools are defined in `web/src/lib/tools/builtin/*.ts` and are registered from `index.tsx` imports.
    - Tools operate on the `FrontendToolState` provided by `GlobalChatStore` and `WorkflowManagerContext` (e.g., `getWorkflow()`, `createNew()`, `saveWorkflow()`).
  - Workflow graph updates:
    - The assistant can emit `workflow_created` / `workflow_updated` messages with a graph payload.
    - `GlobalChatStore` stores the last such update in `lastWorkflowGraphUpdate`.
    - `useWorkflowGraphUpdater` picks this up, converts to XYFlow nodes/edges, updates the NodeStore, and triggers auto layout.

### 7.4 Assets & Asset Viewer

Components:

- `AssetExplorer.tsx` (`web/src/components/assets/AssetExplorer.tsx:1`)
- `AssetGrid.tsx`, `AssetGridRow.tsx`, `AssetListView.tsx`, `AssetTable.tsx`
- `FolderTree.tsx`, `FolderList.tsx`, `FolderItem.tsx`
- Confirm dialogs (delete, move, rename), upload overlays.

Asset viewers:

- `asset_viewer/AudioViewer.tsx`, `ImageViewer.tsx`, `PDFViewer.tsx`, `TextViewer.tsx`, `VideoViewer.tsx` handle previewing different asset types, using appropriate viewers (e.g., `react-pdf`, video tags, etc.).

Behavior:

- `AssetExplorer`:
  - Wraps the main asset UI with `AppHeader` and `ContextMenuProvider`.
  - Uses `useAssets()` (serverState hook) to fetch assets grouped by folder.
  - Passes assets into `AssetGrid` with layout parameters.
- `AssetStore` / `AssetGridStore` manage:
  - Sorting, filtering, size of tiles.
  - Selected asset(s).
  - Infinite scroll and virtualization in the grid.

### 7.5 Models & Hugging Face Integration

Components:

- `hugging_face/ModelListIndex.tsx` – main models page.
- `HuggingFaceModelSearch.tsx` – search interface.
- `ModelsManager.tsx` – high‑level model manager UI.
- `ModelDownloadDialog.tsx`, `ModelDownloadList.tsx`, `OverallDownloadProgress.tsx`, `DownloadManagerDialog.tsx`.
- `RecommendedModels.tsx` + `RecommendedModelsDialog.tsx` – recommended models overlay.
- `RequiredModelsDialog.tsx` – shows missing models required by workflows.

Configuration:

- `config/models.ts` defines pre‑curated `UnifiedModel` entries, including:
  - Local/GGUF models (`gpt-oss:20b`, various `llama3.*`, `deepseek-r1:*`, etc.).
  - Other categories like “Granite” and “MiniCPM‑V”.

Model stores:

- `ModelStore`, `ModelDownloadStore`, `ModelManagerStore`, `ModelFiltersStore`, `ModelPreferencesStore`.
- Combined with hooks (`useHuggingFaceModels`, `useLoraModels`, `useOllamaModels`, `useRecommendedModels`) to build the UI.

### 7.6 Mini‑Apps

`MiniAppPage.tsx` (`web/src/components/miniapps/MiniAppPage.tsx:1`) exposes workflows as simpler “apps”:

- Loads the workflow via `useWorkflowManager.fetchWorkflow` + React Query.
- Derives input definitions and current values with `useMiniAppInputs(workflow)`.
- Builds a React form (`MiniAppInputsForm`) for the workflow’s inputs.
- On submit:
  - Clamps numeric values to min/max from metadata via `clampNumber`.
  - Runs the workflow via `useMiniAppRunner`.
  - Converts the saved graph to XYFlow nodes/edges via `graphNodeToReactFlowNode` / `graphEdgeToReactFlowEdge`.
- Displays:
  - Status message with animated status text if running.
  - Progress bar.
  - `MiniAppResults` for outputs.
- Has “Open in Editor” button to jump to `/editor/<workflow.id>`.

### 7.7 Workflows & Workspaces

Workflow list & templates:

- `workflows/WorkflowList.tsx`, `WorkflowListView.tsx`, `WorkflowTile.tsx`, `WorkflowToolbar.tsx`, `WorkflowForm.tsx`, `WorkflowFormModal.tsx`, `WorkflowDeleteDialog.tsx`.
- `ExampleGrid.tsx` – grid of example workflows (templates) with search & tags filters.

Workspace tree:

- `workspaces/WorkspaceTree.tsx` – likely organizes multiple workspaces or remote connections (e.g., local vs remote runtimes / groups of workflows).

### 7.8 Text Editor, Terminal, Audio

Text editor:

- `textEditor/` directory includes Lexical integration:
  - `LexicalEditor.tsx`, `EditorToolbar.tsx`, `EditorStatusBar.tsx`, `FindReplaceBar.tsx`.
  - Plugins like `CodeHighlightPlugin.tsx`, `MarkdownPastePlugin.tsx`, `FloatingTextFormatToolbar.tsx`, `HorizontalRulePlugin.tsx`.
  - Supports markdown export (`exportMarkdown.ts`) and syntax highlighting with Prism.

Terminal:

- `terminal/Terminal.tsx` – xterm.js integration for running commands or showing logs (wired via WebSockets or NodeTool backend).

Audio:

- `audio/AudioControls.tsx`, `AudioPlayer.tsx`, `WaveRecorder.tsx`.
  - Waveform display & audio playback via `wavesurfer.js`.
  - `WaveRecorder` integrates with Web Audio for recording, used in nodes or chat attachments.

---

## 8. Server‑Provided Metadata & Search

### 8.1 Node metadata & node types

`useMetadata.ts` (`web/src/serverState/useMetadata.ts:1`) + `loadMetadata()`:

- Calls `client.GET("/api/nodes/metadata")`.
- Builds:
  - `nodeTypes: NodeTypes` mapping `node_type → BaseNode`.
  - `metadataByType: Record<string, NodeMetadata>` seeded from `defaultMetadata` (contains at least `Preview` node).
  - `recommendedModels: UnifiedModel[]` from all nodes; deduplicated by `(type, repo_id, path)`.
- Stores:
  - Node types + metadata in `MetadataStore`.
  - Recommended models for UI lists.
- Calls `createConnectabilityMatrix` with all metadata, precomputing which output types can connect to which inputs, used by node search and connection validation.

### 8.2 Search & filtering utilities

Under `web/src/utils`:

- `workflowSearch.ts` – search workflows by name/tags.
- `nodeSearch.ts` – fuzzy search node types, used in `NodeMenu`.
- `modelFilters.ts` – filter models by provider, capabilities, etc.
- `highlightText.ts` – highlight search matches.
- `formatDateAndTime.ts` / `groupByDate.ts` – grouping workflows or assets by date.
- `providerDisplay.ts`, `modelFormatting.tsx` – present models/providers nicely.
- `workflowUpdates.ts` – unify job update messages into store updates.
- `dockviewLayout.ts` – safe apply of Dockview layout JSON.

---

## 9. WebSockets & Real‑Time Execution

### 9.1 Global WebSocket Manager (workflows)

`GlobalWebSocketManager.ts` (`web/src/lib/websocket/GlobalWebSocketManager.ts:1`):

- Singleton that owns a single `WebSocketManager` for `WORKER_URL`.
- Ensures only one connection and tracks `isConnected`/`isConnecting`.
- Methods:
  - `ensureConnection()` – establishes or waits for the connection.
  - `subscribe(key, handler)` – register message handler for a workflow id or job id.
  - `send(message)` – send message via underlying WebSocket.
  - `disconnect()` – close connection and reset flags.
- `WorkflowRunner` uses this to:
  - Subscribe to updates for a workflow id and job id.
  - Send commands: `run_job`, `reconnect_job`, `stream_input`, `end_input_stream`, `cancel_job`.

### 9.2 Chat WebSocket manager

`WebSocketManager.ts` (in `lib/websocket`) is a generic WebSocket wrapper used by:

- `GlobalChatStore` for chat WebSocket.
- `GlobalWebSocketManager` for workflow WebSocket.

It supports:

- Auto reconnect with backoff.
- Event listeners for `open`, `message`, `error`, `close`, `reconnecting`.

---

## 10. Theming & Styling

`ThemeNodetool.tsx` (`web/src/components/themes/ThemeNodetool.tsx:1`):

- Creates a MUI CSS‑vars‑based theme with light and dark `palette`s (`paletteLight`, `paletteDark`).
- Configures:
  - Font families (`Inter`, `JetBrains Mono`).
  - Custom font size tokens (`fontSizeGiant`, etc.).
  - Rounded corners for dialogs, nodes, buttons.
  - Z‑index layers for appBar, modals, command menu, popovers, autocomplete, etc.
- Overrides:
  - `MuiTypography`, `MuiButton`, `MuiFormLabel`, `MuiFormControl`, `MuiPopover`, `MuiModal`, etc., to match NodeTool’s visual identity.
- Global CSS:
  - `styles/vars.css`, `styles/index.css`, `styles/nodes.css`, etc., define CSS variables, node shape styling, micro‑tooltips, and mobile adaptations.

---

## 11. Directory Overview

At `web/src`:

- `components/AGENTS.md` – detailed per‑component guidance for agents.
- `components/` – React components organized by domain:
  - `asset_viewer`, `assets`, `audio`, `chat`, `collections`, `content`, `context_menus`, `dialogs`, `editor`, `hugging_face`, `inputs`, `menus`, `miniapps`, `node`, `node_editor`, `node_menu`, `node_types`, `panels`, `properties`, `search`, `terminal`, `textEditor`, `themes`, `ui`, `workflows`, `workspaces`, etc.
- `config/` – core configuration:
  - `constants.ts` (APP_NAME, VERSION, default zoom, default model, search tuning).
  - `models.ts` (LLM recommendations).
  - `shortcuts.ts` (node editor shortcut registry + tooltip helpers).
  - `defaultLayouts.ts` (Dockview default layout).
- `constants/` – colors & data type configurations used across the UI.
- `contexts/` – `NodeContext.tsx`, `WorkflowManagerContext.tsx`, `EditorInsertionContext.tsx`.
- `core/` – graph utilities (`graph.ts`).
- `hooks/` – cross‑cutting hooks; many listed above.
- `icons/` – SVG icons.
- `lib/` – Supabase client, WebSocket helpers, frontend tools, tests.
- `node_styles/` – themeable node CSS settings.
- `serverState/` – React Query hooks for server‑backed state (assets, workflows, metadata).
- `stores/` – Zustand stores (UI, assets, nodes, workflows, models, chat, etc.).
- `styles/` – CSS for global layout, nodes, interactions, tooltips, command menu, dockview, mobile.
- `types/`, `*.d.ts` – TS declaration augmentations for MUI, Emotion, window, etc.
- `utils/` – generic util functions for formatting, search, error handling, node type mapping, etc.

---

If you’d like, we can also derive a shorter “developer onboarding” summary (e.g., how to add a new node type, plug a new provider, or add a new dashboard panel) based on this structure.

