# AGENT RULES

This file provides guidance to Agents when working with code in this repository.

## 📚 Quick Navigation to Specialized Guides

This repository has multiple AGENTS.md files organized by directory to help you quickly find relevant information:

### Web Application (`/web/src/`)
- **[Web UI Overview](web/src/AGENTS.md)** - React application structure and patterns
- **[Components](web/src/components/AGENTS.md)** - UI component architecture and best practices  
- **[Stores](web/src/stores/AGENTS.md)** - Zustand state management patterns
- **[Contexts](web/src/contexts/AGENTS.md)** - React context integration with stores
- **[Hooks](web/src/hooks/AGENTS.md)** - Custom React hooks and patterns
- **[Utils](web/src/utils/AGENTS.md)** - Utility functions and helpers
- **[ServerState](web/src/serverState/AGENTS.md)** - TanStack Query and API integration
- **[Lib](web/src/lib/AGENTS.md)** - Third-party library integrations (WebSocket, Supabase, Frontend Tools)
- **[Config](web/src/config/AGENTS.md)** - Configuration management and constants

### Desktop Application
- **[Electron](electron/src/AGENTS.md)** - Electron desktop app, IPC, and system integration

### Mobile Application
- **[Mobile README](mobile/README.md)** - React Native/Expo mobile app setup and usage
- **[Mobile Quick Start](mobile/QUICKSTART.md)** - Step-by-step guide to run the mobile app
- **[Mobile Architecture](mobile/ARCHITECTURE.md)** - Architecture and implementation details

### Documentation & Build
- **[Documentation](docs/AGENTS.md)** - Documentation structure and writing guidelines
- **[Scripts](scripts/AGENTS.md)** - Build and release scripts
- **[Workflow Runner](workflow_runner/AGENTS.md)** - Standalone workflow execution app

### Additional Resources
- **[GitHub Copilot Instructions](.github/copilot-instructions.md)** - GitHub Copilot-specific patterns and examples
- **[Web README](web/README.md)** - Web application setup and development
- **[Web Testing Guide](web/TESTING.md)** - Comprehensive testing documentation

> **💡 Tip**: When working on a specific area, consult the relevant AGENTS.md file first for specialized guidance. Each file includes cross-references to related documentation.

---

## Project Overview

NodeTool is an open-source, privacy-first, no-code platform for rapidly building and automating AI workflows. It enables users to create sophisticated AI solutions visually through a drag-and-drop interface with no coding required.

## Architecture

NodeTool follows a client-server architecture with multiple components:

1. **Frontend Components:**

   - Web UI (React/TypeScript): Visual editor for building AI workflows
   - Electron Wrapper: Packages the web UI into a desktop application
   - Mobile App (React Native/Expo): Browse and run Mini Apps on iOS/Android

2. **Backend Components:**

   - API Server: HTTP endpoints for workflow management
   - WebSocket Runner: Real-time communication during workflow execution
   - Backend is not part of this repository

3. **Data Flow:**
   - User creates workflows in the editor
   - Workflows are executed through the WebSocket Runner
   - Workers process the workflow nodes (local or cloud)
   - Results are streamed back to the UI in real-time

## Key Directories

- `/web`: Main React web application (editor UI)
- `/electron`: Electron desktop app wrapper
- `/mobile`: React Native mobile app (Mini Apps viewer)
- `/docs`: Documentation files
- `/scripts`: Build and release scripts

## Important Commands

### Development Setup

1. **Environment Activation (Local Development Only):**
   When running Python commands locally, use conda:

   ```bash
   conda activate nodetool
   ```

   **Note:** GitHub CI and Copilot Agent use a different setup via `.github/workflows/copilot-setup-steps.yml` - no conda needed there.

2. **Web UI Development:**

   ```bash
   cd web
   npm install
   npm start
   ```

   - Access at <http://localhost:3000>

3. **Electron App Development:**

   ```bash
   # Build the web UI first
   cd web
   npm install
   npm run build
   cd ..

   # Run with Electron
   cd electron
   npm install
   npm start
   ```

4. **E2E Testing Setup:**

   E2E tests require both Python backend and Node.js frontend:

   ```bash
   # 1. Create Python environment (first time only)
   conda env create -f environment.yml -n nodetool

   # 2. Activate and install packages
   conda activate nodetool
   uv pip install git+https://github.com/nodetool-ai/nodetool-core git+https://github.com/nodetool-ai/nodetool-base

   # 3. Verify nodetool installation
   nodetool --help

   # 4. Install web dependencies and Playwright browsers
   cd web
   npm install
   npx playwright install chromium

   # 5. Run e2e tests (automatically starts servers)
   npm run test:e2e
   ```

   **NodeTool Server Details:**
   
   The server provides:
   - REST API endpoints at `http://localhost:7777/api/`
   - Health check at `http://localhost:7777/health`
   - WebSocket connections for workflow execution
   - Models API for managing AI models

   **Manual Testing** (for debugging):
   ```bash
   # Terminal 1: Start backend
   conda activate nodetool
   nodetool serve --port 7777

   # Terminal 2: Start frontend
   cd web
   npm start

   # Terminal 3: Run tests
   cd web
   npx playwright test
   ```

### Build Commands

1. **Web UI Build:**

   ```bash
   cd web
   npm run build
   ```

2. **Electron App Build:**

   ```bash
   cd electron
   npm run build
   ```

### Linting & Type Checking

1. **Using Make (Recommended):**

   ```bash
   make typecheck        # Type check all packages
   make lint             # Lint all packages
   make lint-fix         # Auto-fix linting issues
   ```

2. **Web UI:**

   ```bash
   cd web
   npm run lint        # Run ESLint
   npm run lint:fix    # Fix linting issues
   npm run typecheck   # Check TypeScript types
   ```

3. **Electron App:**

   ```bash
   cd electron
   npm run lint
   npm run lint:fix
   npm run typecheck
   ```

### Testing

1. **Web UI Tests (Unit/Integration):**

   ```bash
   cd web
   npm test                    # Run all tests
   npm run test:watch          # Watch mode for development
   npm run test:coverage       # Generate coverage report
   npm run test:summary        # Summary output only
   ```

2. **E2E Tests (End-to-End):**

   ```bash
   cd web
   npm run test:e2e           # Run all e2e tests
   npm run test:e2e:ui        # Interactive UI mode
   npm run test:e2e:headed    # Run in headed mode (see browser)
   ```

3. **Test Documentation:**
   - See `/web/TESTING.md` for comprehensive testing guide
   - See `/web/TEST_HELPERS.md` for test utilities and patterns
   - See `.github/copilot-instructions.md` for AI-specific guidelines

4. **Test Structure:**
   - Component tests: `src/components/__tests__/`
   - Store tests: `src/stores/__tests__/`
   - Hook tests: `src/hooks/__tests__/`
   - Utility tests: `src/utils/__tests__/`
   - E2E tests: `tests/e2e/`

5. **Testing Frameworks:**
   - **Unit/Integration**: Jest 29.7 with ts-jest for TypeScript support
   - **Component Testing**: React Testing Library 16.1
   - **User Interactions**: @testing-library/user-event
   - **DOM Matchers**: @testing-library/jest-dom
   - **E2E Testing**: Playwright 1.57

6. **Key Testing Principles:**
   - Test behavior, not implementation details
   - Use accessible queries (getByRole, getByLabelText)
   - Use userEvent for realistic user interactions
   - Mock external dependencies and API calls
   - Keep tests independent and isolated
   - Follow existing test patterns in the codebase

## Mandatory Post-Change Verification

After making any code changes, you MUST run the following commands to ensure code quality:

```bash
make install    # Install all dependencies first (required for typecheck)
make typecheck  # Type check all packages
make lint       # Lint all packages
make test       # Run all tests
```

**Note**: The mobile package requires dependencies to be installed before type checking.

**Keep it green** - All three commands must pass with exit code 0 before considering the task complete.

If any of these commands fail:
1. Fix the errors reported
2. Re-run the failing command(s)
3. Continue until all three pass

This ensures:
- Type safety across the codebase
- Consistent code style and patterns
- No regressions in existing functionality

---

## Development Workflow

When working on this codebase:

1. Respect the component architecture in the frontend
2. Keep UI changes consistent with the existing design system
3. Use TypeScript for all new code
4. Run linting and type checking before submitting changes

## React Best Practices

### Hooks Guidelines

1. **Custom Hooks:**

   - Prefix with `use` (e.g., `useWorkflow`, `useNodeSelection`)
   - Extract reusable logic into custom hooks
   - Keep hooks focused on single responsibilities
   - Use TypeScript for all hook parameters and return types

2. **Built-in Hooks:**

   - Use `useCallback` for functions passed to child components
   - Use `useMemo` for expensive calculations, not for object references
   - Prefer `useEffect` cleanup functions to prevent memory leaks
   - Use `useRef` for DOM manipulation and storing mutable values

3. **Hook Dependencies:**
   - Always include all dependencies in useEffect arrays
   - Use ESLint exhaustive-deps rule to catch missing dependencies
   - Consider using `useCallback` for functions used in dependencies

### Existing Custom Hooks Reference

The project includes many specialized hooks organized by functionality:

#### Model Management Hooks

- **`useLoraModels`**: Manages LoRA (Low-Rank Adaptation) model data
- **`useModelBasePaths`**: Provides base cache directories for HuggingFace Hub and Ollama models
- **`useModelsWithSize`**: Fetches model data with size information for storage planning
- **`useOllamaModels`**: Manages Ollama model integration and caching
- **`useRecommendedModels`**: Provides curated model recommendations based on use cases
- **`useModelInfo`**: Detailed model metadata and specifications

_Usage: Import these hooks in components that need AI model selection, configuration, or display._

#### Node Editor Hooks

- **`useNodeEditorShortcuts`**: Comprehensive keyboard shortcuts for the visual editor (copy, paste, delete, etc.)
- **`useCreateNode`**: Factory hook for creating new nodes with proper metadata and positioning
- **`useFitView`**: Handles viewport fitting and auto-centering of node graphs
- **`useProcessedEdges`**: Processes and validates connections between nodes
- **`useAlignNodes`**: Provides node alignment and grid snapping functionality
- **`useDuplicate`**: Handles node and edge duplication with proper ID generation
- **`useFocusPan`**: Manages camera focus and panning to specific nodes or areas

_Usage: These hooks are essential for the visual workflow editor interface._

#### Workflow Management Hooks

- **`useWorkflowGraphUpdater`**: Syncs workflow updates from GlobalChatStore with React context
- **`useNamespaceTree`**: Manages hierarchical organization of workflow components

_Usage: Import in components that manage workflow state and synchronization._

#### UI Interaction Hooks

- **`useNumberInput`**: Advanced number input with drag-to-change, constraints, and decimal precision
- **`useRenderLogger`**: Debug hook for tracking component re-render triggers (development only)
- **`useDelayedHover`**: Implements hover delays for tooltips and popover triggers
- **`useCollectionDragAndDrop`**: Handles drag-and-drop operations for asset collections

_Usage: These hooks enhance user interaction patterns and provide debugging capabilities._

#### File & Asset Management Hooks

- **`useFileDrop`** (in `/handlers/`): Handles file drag-and-drop with type validation and asset uploading
- **`useDropHandler`**: Manages dropping files onto the canvas to create nodes
- **`useCopyPaste`**: Implements copy/paste functionality for nodes and edges
- **`useAssetUpload`**: Handles asset upload with progress tracking and error handling
- **`addNodeFromAsset`**: Creates appropriate nodes from uploaded assets

_Usage: Import these for file handling, asset management, and node creation from assets._

#### Browser & Hardware Hooks

- **`useWaveRecorder`**: Audio recording functionality using Web Audio API
- **`useIpcRenderer`**: Electron IPC communication for desktop app features

_Usage: These hooks provide browser API access and desktop app integration._

#### Connection & Context Hooks

- **`useConnectionHandlers`**: Manages node connections, validation, and connection logic
- **`useResizePanel`**: Handles resizable panel behavior for sidebars and drawers
- **Context menu hooks**: Various hooks for right-click context menus

_Usage: These hooks manage graph connections and UI panel behaviors._

#### Hook Usage Patterns

1. **Model Hooks**: Use React Query patterns with proper cache keys and stale times

   ```typescript
   const { data: models, isLoading, error } = useHuggingFaceModels();
   ```

2. **Editor Hooks**: Often return handler functions and state

   ```typescript
   const { handleCopy, handlePaste, selectedNodes } = useCopyPaste();
   ```

3. **UI Hooks**: Return event handlers and state for component interaction

   ```typescript
   const { handleMouseEnter, handleMouseLeave } = useDelayedHover(
     callback,
     300
   );
   ```

4. **File Hooks**: Handle complex file operations with loading states

   ```typescript
   const { onDragOver, onDrop, uploading, filename } = useFileDrop({
     type: "image",
     uploadAsset: true,
     onChangeAsset: handleAssetChange,
   });
   ```

### Zustand State Management

1. **Store Structure:**

   - Keep stores focused on specific domains (e.g., `workflowStore`, `nodeStore`)
   - Use TypeScript interfaces for store state
   - Implement actions as methods within the store

2. **State Updates:**

   - Use Immer for complex state updates via `immer` middleware
   - Keep state updates immutable when not using Immer
   - Use shallow comparison for selectors when possible

3. **Store Organization:**

   ```typescript
   interface WorkflowState {
     workflows: Workflow[];
     activeWorkflow: Workflow | null;
     actions: {
       addWorkflow: (workflow: Workflow) => void;
       setActiveWorkflow: (id: string) => void;
     };
   }
   ```

### Existing Zustand Stores Reference

The application uses Zustand for state management with stores organized by domain:

#### Core Infrastructure Stores

- **`ApiClient.ts`**: HTTP client for backend API communication with authentication
- **`ApiTypes.ts`**: TypeScript definitions for all API data structures and responses
- **`useAuth.ts`**: Authentication store managing Supabase sessions and user state

_Usage: These form the foundation for all API interactions and type safety._

#### UI State Management Stores

- **`AppHeaderStore.ts`**: Application header state (help dialogs, navigation)
- **`PanelStore.ts`**: Resizable panel dimensions, visibility, and dragging state
- **`RightPanelStore.ts`**: Right panel view state (inspector, assistant)
- **`ContextMenuStore.ts`**: Context menu positioning and visibility
- **`KeyPressedStore.ts`**: Keyboard state tracking and combo handling
- **`NotificationStore.ts`**: Toast notifications and alert system
- **`SettingsStore.ts`**: User preferences and application settings (persisted)
- **`RemoteSettingStore.ts`**: Server-side settings synchronization

_Usage: Import these stores in UI components that need to manage interface state._

#### Asset & File Management Stores

- **`AssetStore.ts`**: Central asset management (upload, delete, search, organization)
- **`AssetGridStore.ts`**: Asset grid view state (size, filters, selection, dialogs)
- **`FileStore.ts`**: File system operations and directory tree management
- **`CollectionStore.ts`**: Asset collection management and organization

_Usage: Use these stores in components dealing with file uploads, asset browsers, and media management._

#### Node & Workflow Management Stores

- **`NodeStore.ts`**: Core node graph state (35KB - largest store)

  - Manages nodes, edges, selection, and connections
  - Handles workflow serialization and auto-layout
  - Provides undo/redo via temporal state (zundo)
  - Integrates with ReactFlow for visual editing

- **`NodeMenuStore.ts`**: Node selection menu (search, filtering, documentation)
- **`ConnectableNodesStore.ts`**: Node connection validation and possibilities
- **`ConnectionStore.ts`**: Active connection state and edge management
- **`WorkflowRunner.ts`**: Workflow execution control and WebSocket communication

_Usage: These stores power the visual node editor and workflow execution engine._

#### AI Model Management Stores

- **`ModelStore.ts`**: AI model definitions and metadata
- **`ModelDownloadStore.ts`**: Model download progress and queue management
- **`ModelManagerStore.ts`**: Model source management (downloaded vs recommended)
- **`MetadataStore.ts`**: Node metadata and model recommendations

_Usage: Import these in components that handle AI model selection, downloading, and configuration._

#### Execution & Results Stores

- **`ResultsStore.ts`**: Node execution results, progress, and output chunks
- **`StatusStore.ts`**: Node execution status tracking
- **`ErrorStore.ts`**: Error handling and reporting across workflows
- **`LogStore.ts`**: Application logging and debug information

_Usage: These stores handle workflow execution state and results display._

#### Real-time Communication Stores

- **`GlobalChatStore.ts`**: Global chat interface with WebSocket integration (24KB)

  - Manages chat messages and streaming
  - Handles tool calls and planning updates
  - Integrates with Supabase for persistence
  - Manages WebSocket connections

- **`WebSocketUpdatesStore.ts`**: System stats and real-time updates
- **`SessionStateStore.ts`**: Session-level state (clipboard, temporary data)

_Usage: These stores handle real-time communication and global chat functionality._

#### Utility & Helper Files

- **`customEquality.ts`**: Custom equality functions for Zustand state updates
- **`formatNodeDocumentation.ts`**: Node documentation formatting utilities
- **`fuseOptions.ts`**: Fuse.js configuration for fuzzy search
- **`uuidv4.ts`**: UUID generation utility
- **`workflowUpdates.ts`**: Workflow update operations and sync

#### ReactFlow Integration Utilities

- **`graphNodeToReactFlowNode.ts`**: Converts backend graph nodes to ReactFlow format
- **`reactFlowNodeToGraphNode.ts`**: Converts ReactFlow nodes to backend format
- **`graphEdgeToReactFlowEdge.ts`**: Converts backend edges to ReactFlow format
- **`reactFlowEdgeToGraphEdge.ts`**: Converts ReactFlow edges to backend format

_Usage: These utilities handle data transformation between backend API and ReactFlow._

#### Store Usage Patterns

1. **Basic Store Usage:**

   ```typescript
   // Select specific state with selectors
   const nodes = useNodeStore((state) => state.nodes);
   const addNode = useNodeStore((state) => state.addNode);

   // Use shallow equality for objects
   const { selectedAssets, searchTerm } = useAssetGridStore(
     (state) => ({
       selectedAssets: state.selectedAssets,
       searchTerm: state.searchTerm,
     }),
     shallow
   );
   ```

2. **Persisted Store Pattern:**

   ```typescript
   // Settings store uses persistence
   const useSettingsStore = create<SettingsState>()(
     persist(
       (set) => ({
         gridSnap: 20,
         updateGridSnap: (value) => set({ gridSnap: value }),
       }),
       { name: "settings" }
     )
   );
   ```

3. **Temporal Store Pattern (Undo/Redo):**

   ```typescript
   // NodeStore uses temporal middleware
   const useNodeStore = create<NodeState>()(
     temporal(
       (set, get) => ({
         nodes: [],
         undo: () => get().temporal.undo(),
         redo: () => get().temporal.redo(),
       }),
       { limit: 100 }
     )
   );
   ```

4. **Store with Computed Values:**

   ```typescript
   // Use selectors for derived state
   const selectedNodes = useNodeStore((state) =>
     state.nodes.filter((node) => node.selected)
   );
   ```

#### Store Architecture Best Practices

1. **Domain Separation**: Each store focuses on a specific domain (assets, nodes, UI)
2. **Action Collocation**: Actions are defined within the store alongside state
3. **Selector Optimization**: Use selectors to prevent unnecessary re-renders
4. **Persistence**: Settings and preferences are persisted to localStorage
5. **Real-time Sync**: WebSocket stores handle real-time updates
6. **Error Handling**: Dedicated error stores for centralized error management

### Material-UI (MUI) Guidelines

1. **Component Usage:**

   - Use MUI components over custom HTML elements when available
   - Leverage MUI's built-in accessibility features
   - Use `sx` prop for component-specific styling
   - Prefer composition over deep prop drilling

2. **Theming:**

   - Define custom theme extensions in theme configuration
   - Use theme breakpoints for responsive design
   - Leverage theme palette for consistent colors
   - Use theme typography variants for consistent text styling

3. **Performance:**
   - Use `styled()` utility for reusable styled components
   - Avoid inline styles and sx props for frequently re-rendering components
   - Use MUI's `unstable_useEnhancedEffect` for server-side rendering compatibility

### TanStack Query (React Query)

1. **Query Keys:**

   - Use hierarchical query keys: `['workflows', 'list']` or `['workflow', workflowId]`
   - Create query key factories for consistency
   - Use TypeScript for query key types

2. **Query Configuration:**

   - Set appropriate `staleTime` and `cacheTime` values
   - Use `enabled` option for conditional queries
   - Implement proper error handling with `onError` callbacks
   - Use `refetchOnWindowFocus` judiciously

3. **Mutations:**
   - Use optimistic updates for better UX
   - Implement proper rollback on mutation failures
   - Invalidate related queries after successful mutations
   - Use `useMutation` hooks for side effects

### TanStack Router

1. **Route Definition:**

   - Use TypeScript for route parameters and search params
   - Implement proper route guards and authentication
   - Use nested routing for hierarchical UI structures
   - Define route-specific data loading

2. **Navigation:**

   - Use `useNavigate` for programmatic navigation
   - Implement proper loading states during route transitions
   - Use route-based code splitting for performance
   - Handle navigation errors gracefully

3. **Route Data:**
   - Use route loaders for data fetching
   - Implement proper error boundaries for route-level errors
   - Use route context for sharing data between route components

### MUI Theming Best Practices

1. **Theme Structure:**

   ```typescript
   const theme = createTheme({
     palette: {
       primary: { main: "#1976d2" },
       secondary: { main: "#dc004e" },
       background: { default: "#f5f5f5" },
     },
     typography: {
       fontFamily: "Inter, sans-serif",
       h1: { fontWeight: 600 },
     },
     components: {
       MuiButton: {
         styleOverrides: {
           root: { textTransform: "none" },
         },
       },
     },
   });
   ```

2. **Custom Theme Extensions:**

   - Extend theme interface for custom properties
   - Use module augmentation for TypeScript support
   - Create semantic color tokens (e.g., `success`, `warning`)
   - Define consistent spacing and sizing scales

3. **Dark Mode Support:**
   - Use `useMediaQuery` to detect system preference
   - Implement theme switching with proper state management
   - Test components in both light and dark modes
   - Use theme-aware colors throughout the application

### Emotion CSS Guidelines

1. **Styled Components:**

   - Use `styled()` for reusable component styling
   - Implement theme-aware styled components
   - Use props for dynamic styling logic
   - Keep styled components co-located with their usage

2. **CSS-in-JS Patterns:**

   ```typescript
   const StyledButton = styled(Button)(({ theme, variant }) => ({
     borderRadius: theme.spacing(1),
     padding: theme.spacing(1, 2),
     ...(variant === "primary" && {
       backgroundColor: theme.vars.palette.primary.main,
       color: theme.vars.palette.primary.contrastText,
     }),
   }));
   ```

3. **Performance Considerations:**
   - Use CSS prop sparingly for one-off styles
   - Prefer `sx` prop for MUI components
   - Use `css` helper for shared style objects
   - Avoid recreating style objects on every render

### Component Architecture

1. **Component Organization:**

   - Keep components focused on single responsibilities
   - Use composition over inheritance
   - Implement proper prop interfaces with TypeScript
   - Use `React.memo` for performance optimization when needed

2. **File Structure:**

   - Co-locate related files (component, styles, tests)
   - Use index files for clean imports
   - Separate presentation and container components
   - Keep components tree-shakeable

3. **Error Handling:**
   - Implement error boundaries for component trees
   - Use proper TypeScript error types
   - Provide meaningful error messages to users
   - Log errors appropriately for debugging

## Technologies Used

Technologies in `web/package.json`:

- **React 18**: UI framework with TypeScript
- **Vite 6**: Build tool and dev server (`web/vite.config.ts`)
- **Material UI + Emotion**: Theming and component library (`web/src/components/themes/ThemeNodetool.tsx`)
- **React Router v7**: Client-side routing (`react-router-dom`)
- **XYFlow** (`@xyflow/react`): Visual node graph editor
- **Zustand**: Client state management
- **TanStack React Query** (`@tanstack/react-query`): Server state management
- **Supabase** (`@supabase/supabase-js`): Authentication and persistence
- **Dockview**: Dashboard layout system
- **Lexical**: Rich text editing
- **Xterm.js**: Terminal emulation
- **Wavesurfer.js**: Audio waveform visualization
- **Plotly**: Data visualization and charts
- **ELK.js** (`elkjs`): Graph auto-layout algorithm

Backend:

- **Python**: Core language
- **FastAPI**: API framework
- **WebSockets**: Real-time communication
- **AI Integration**: Supports Hugging Face, Ollama, OpenAI, Anthropic, and more

Desktop:

- **Electron**: Desktop app wrapper

---

## Application Entry Point & Routing

### Entry Point

`web/src/index.tsx` is the SPA entry point that:

- Imports global styles and polyfills:
  - XYFlow styles, various CSS files (`vars.css`, `index.css`, `mobile.css`, dockview styles, etc.)
  - Prism global highlighting (`prismGlobal.ts`)
- Initializes the React tree with providers:
  - `QueryClient` + `QueryClientProvider` for React Query
  - `ThemeProvider` with custom theme (`ThemeNodetool`)
  - `MobileClassProvider` for mobile-specific CSS classes
  - `MenuProvider` for app-wide menu state
  - `WorkflowManagerProvider` (Zustand-backed workflow context)
  - `KeyboardProvider` for global keyboard handling
  - `RouterProvider` for React Router
  - `DownloadManagerDialog` for model downloads

On boot, it:

- Calls `useAuth.getState().initialize()` to set up Supabase auth / local dev login
- Calls `initKeyListeners()` (keyboard tracking store)
- Calls `loadMetadata()` to fetch node metadata from `/api/nodes/metadata` before rendering routes; shows a `CircularProgress` or error message while loading

### Routes

Routes are created via `createBrowserRouter(getRoutes())`:

- `/` – `NavigateToStart`:
  - In localhost mode, goes to `/dashboard`
  - Otherwise decides between `/dashboard` or `/login` based on auth state

- `/dashboard` – main workspace:
  - Renders `Dashboard` (`web/src/components/dashboard/Dashboard.tsx`)
  - Inside `Dashboard`, Dockview panels host workflows list, templates, recent chats, and chat panel

- `/login` – login page:
  - `Login` component uses Supabase OAuth via `useAuth`

- `/chat/:thread_id?` – full-screen global assistant chat:
  - Wrapped in `ProtectedRoute`
  - Layout: `AppHeader` at top, `PanelLeft`, `GlobalChat`, `PanelBottom`
  - `GlobalChat` (`web/src/components/chat/containers/GlobalChat.tsx`) orchestrates threads, messages, and tool use

- `/editor` – redirects to root start logic (no editor loaded)

- `/assets` – asset explorer:
  - Protected; layout: `PanelLeft` + `AssetExplorer`
  - `AssetExplorer` (`web/src/components/assets/AssetExplorer.tsx`) wraps `AssetGrid` with header and context menus

- `/collections` – collections explorer:
  - Protected; shows `CollectionsExplorer` for asset/workflow collections

- `/templates` – template / example workflows:
  - Protected; `PanelLeft + TemplateGrid`

- `/editor/:workflow` – main node editor:
  - Protected; wrapped in `FetchCurrentWorkflow` so proper workflow is loaded/activated
  - Layout:
    - `AppHeader` (fixed top)
    - Main area: `PanelLeft`, `TabsNodeEditor`, `PanelRight`, `PanelBottom`, `Alert`
  - `TabsNodeEditor` manages multiple editor tabs; contains `NodeEditor` instances for workflows

- `/models` – model manager:
  - Protected; routes to `ModelListIndex` (Hugging Face / local models listing) with download and filter UI

- `/layouttest` – dev-only experimental layout page (only when `isLocalhost` is true)

All routes attach a shared `ErrorBoundary`.

---

## Global Data & State Layer

### API Client & Environment

- `ApiClient.ts` (`web/src/stores/ApiClient.ts`) uses `openapi-fetch` and types generated to `web/src/api.ts` from `/openapi.json`
- Determines `isLocalhost` based on host or overrides (`VITE_FORCE_LOCALHOST`, query, localStorage)
- For non-localhost:
  - Fetches current Supabase session and attaches `Authorization: Bearer <token>` and `apikey` headers via middleware
  - Exposes `client` for typed HTTP calls (e.g., `client.GET("/api/workflows/")`)

Base URLs:

- `BASE_URL.ts` – backend HTTP base URL
- `CHAT_URL` and `WORKER_URL` (in `BASE_URL.ts`) – WebSocket connection URLs

Supabase:

- `supabaseClient.ts` (`web/src/lib/supabaseClient.ts`) configures the client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, with local fallbacks in dev

Auth store:

- `useAuth.ts` (`web/src/stores/useAuth.ts`) is a Zustand store that:
  - Tracks `session`, `user`, `state` (`init`/`loading`/`error`/`logged_in`/`logged_out`)
  - In localhost mode, fakes a logged-in user with id `"1"` and skips Supabase
  - Provides `signInWithProvider` and `signOut` using Supabase OAuth

### Additional Store Details

The following stores have been expanded with implementation details:

#### Node & Workflow Management Stores (Expanded)

- **`NodeStore.ts`** (`web/src/stores/NodeStore.ts`):
  - Holds `nodes`, `edges`, workflow metadata, selection, viewport, hover, etc.
  - Uses XYFlow node/edge types
  - Validates edges (`isValidEdge`), sanitizes the graph when metadata changes, and ensures parent relationships are valid
  - Provides extensive helpers:
    - Selection: `getSelection`, `getSelectedNodes`, `selectNodesByType`, `setSelectedNodes`, `selectAllNodes`
    - Graph operations: `addNode`, `updateNode`, `updateNodeData`, `deleteNode`, `addEdge`, `deleteEdge`, `onConnect`, `onNodesChange`, `onEdgesChange`
    - Layout: `autoLayout` via `core/graph.ts`, `setShouldAutoLayout`, `setShouldFitToScreen`, `fitViewTargetNodeIds`
    - Serialization: `workflowJSON`, `getWorkflow`, `setWorkflowDirty`
    - ID generation: `generateNodeId(s)`, `generateEdgeId`
    - Missing models tracking to drive UI prompts
  - Uses `zundo` temporal middleware for undo/redo on `nodes/edges/workflow`

- **`WorkflowRunner.ts`** (`web/src/stores/WorkflowRunner.ts`):
  - Manages WebSocket job execution for a workflow
  - State includes `workflow`, `nodes`, `edges`, `job_id`, `state` (`idle`, `connecting`, `connected`, `running`, `error`, `cancelled`), and `statusMessage`
  - Methods:
    - `ensureConnection` – uses `globalWebSocketManager` to establish a WebSocket connection shared across workflows
    - `run` – sends a `run_job` command over WebSocket with:
      - `graph` converted from XYFlow to backend graph using `reactFlowNodeToGraphNode` and `reactFlowEdgeToGraphEdge`
      - `resource_limits` and auth token where needed
    - `reconnect`, `reconnectWithWorkflow` – reconnect to an ongoing job by job id
    - `streamInput` / `endInputStream` – send streaming inputs (for audio/etc.)
    - `cancel` – send `cancel_job` and clear local statuses/progress
    - `addNotification` – passes notifications to `NotificationStore`
  - `getWorkflowRunnerStore` lazily creates one store per workflow ID
  - `useWebsocketRunner` returns a selected slice of the runner store based on the current workflow in `WorkflowManagerContext`
  - Integrates with `workflowUpdates.ts` to process job updates into `StatusStore`, `ResultsStore`, etc.

#### Real-time Communication Stores (Expanded)

- **`GlobalChatStore.ts`** (`web/src/stores/GlobalChatStore.ts`):
  - Holds chat connection status (`status`, `statusMessage`, `progress`)
  - Thread state: `threads`, `currentThreadId`, `lastUsedThreadId`, `threadsLoaded`
  - Message caches per thread (`messageCache` + cursors)
  - Agent mode toggle (`agentMode`)
  - Selection state: `selectedModel`, `selectedTools`, `selectedCollections`
  - Planning & task updates: `currentPlanningUpdate`, `currentTaskUpdate`
  - Workflow graph updates: `lastWorkflowGraphUpdate` for pushing graph changes to open editors
  - Chat WebSocket management:
    - Creates a `WebSocketManager` with URL `CHAT_URL`, optionally including a Supabase `api_key`
    - Listens for varied message types (`Message`, `JobUpdate`, `NodeUpdate`, `ToolCallUpdate`, `PlanningUpdate`, `WorkflowCreatedUpdate`, etc.) and merges them into local state
  - Threads operations: `fetchThreads`, `createNewThread`, `switchThread`, `deleteThread`, `updateThreadTitle`, `summarizeThread`, `getAgentExecutionMessages`
  - Message operations: `sendMessage`, `resetMessages`, `stopGeneration`, `addMessageToCache`, `clearMessageCache`
  - Integrates with `FrontendToolRegistry` to expose UI tools to the backend assistant as callable "frontend tools"

---

## Contexts & Providers

### WorkflowManagerContext

`WorkflowManagerContext.tsx` (`web/src/contexts/WorkflowManagerContext.tsx`) creates a React context backed by a Zustand store:

- State: `nodeStores: Record<string, NodeStore>`, `currentWorkflowId`, `openWorkflows`, `systemStats`, `queryClient`
- LocalStorage persistence:
  - Current workflow id under `"currentWorkflowId"`
  - List of open workflow ids under `"openWorkflows"`
- Methods:
  - Creation: `newWorkflow`, `createNew`, `create`, `copy`
  - Loading: `load`, `loadIDs`, `loadPublic`, `loadTemplates`, `searchTemplates`
  - Saving: `saveWorkflow` (PUT via API), and `saveExample` (save as example/workflow pack)
  - Deletion: `delete`
  - Workflow retrieval: `getWorkflow`, `getCurrentWorkflow`, `setCurrentWorkflowId`
  - Node store management: `addWorkflow` (creates `NodeStore` with `createNodeStore` and adds to `nodeStores`), `removeWorkflow`, `reorderWorkflows`
  - Validation helpers: `validateAllEdges`
- `useWorkflowManager` hook reads slices of this store inside components

`FetchCurrentWorkflow` is a helper component that ties the URL parameter `:workflow` to the active workflow in this context.

### NodeContext

`NodeContext.tsx`:

- Provides a per-workflow `NodeStore` via a React context
- Exposes:
  - `useNodes(selector)` hook that subscribes to part of a NodeStore state with custom equality
  - `useTemporalNodes` for accessing the zundo temporal state (undo/redo stack) of that NodeStore
- Used heavily by `NodeEditor`, properties panel, etc.

### Other Providers

- `MenuProvider.tsx`: manages app menus and command palette context
- `ContextMenuProvider.tsx`: wraps parts of the UI to give them shared context menu behavior
- `ConnectableNodesProvider.tsx`: computes and provides connectable node information for the editor
- `KeyboardProvider.tsx`: enables keyboard shortcut handling within the app tree (interacts with `KeyPressedStore`)

---

## Core Graph & Layout Logic

`web/src/core/graph.ts` contains graph utilities:

- **`topologicalSort(edges, nodes)`**:
  - Kahn's algorithm variant, returns a list of node layers; each layer can be processed in parallel
  - Logs a warning if there are cycles

- **`subgraph(edges, nodes, startNode, stopNode?)`**:
  - DFS-based subgraph extraction from a starting node, optionally stopping at a node

- **`autoLayout(edges, nodes)`**:
  - Uses ELK (`elkjs`) to layout the graph:
    - Filters out comment nodes
    - Groups nodes by `parentId` (e.g., group nodes)
    - Creates ELK graphs and calculates positions
    - Updates node positions to match ELK output
    - Adjusts parent group node sizes to fit contained nodes
  - Returns new node positions, preserving comment nodes
  - Used by `NodeStore.autoLayout` and by tooling after workflow graph updates (e.g., `useWorkflowGraphUpdater`)

---

## Detailed Hooks Overview

Hooks are organized under `web/src/hooks` and `web/src/serverState`. Major categories:

### Node Editor & Workflow Hooks (Expanded)

- **`useNodeEditorShortcuts.ts`**:
  - Registers keyboard combos (from `config/shortcuts.ts`) via `KeyPressedStore`
  - Handles:
    - Copy, cut, paste using `useCopyPaste`
    - Node alignment (`useAlignNodes`)
    - Duplicate selection (horizontal/vertical)
    - Grouping (`useSurroundWithGroup`)
    - View controls (zoom, fit view)
    - Save, save as example, close workflow, create new workflow, navigation
    - Opening the node menu at mouse position
  - Uses `useWorkflowManager`, `useNodes`, `useTemporalNodes`, `useReactFlow`, notifications, right panel toggling

- **`useFitView.ts`**, **`useFitNodeEvent.ts`**, **`useAlignNodes.ts`**, **`useDuplicate.ts`**, **`useFocusPan.ts`**, **`useProcessedEdges.ts`**:
  - Convenience wrappers around XYFlow APIs and NodeStore to align, fit, duplicate, and sanitize edges

- **`useWorkflowGraphUpdater.ts`**:
  - Subscribes to `GlobalChatStore`'s `lastWorkflowGraphUpdate`
  - When an assistant modifies a workflow graph, converts the updated graph to XYFlow nodes/edges and updates the corresponding NodeStore, then triggers `autoLayout` and marks the workflow as not dirty

- **`useWorkflowActions.ts`**, **`useDashboardData.ts`**:
  - `useDashboardData` (seen in `Dashboard.tsx`) loads:
    - Workflows from `/api/workflows/`
    - Templates via `useWorkflowManager.loadTemplates`
    - Derives sorted workflows and "start templates" subset
  - `useWorkflowActions` bundles actions like creating, opening, and clicking templates/workflows for the dashboard UI

### Chat & Job Hooks

- **`useChatService.ts`**:
  - Combines `GlobalChatStore` operations into a cohesive interface for the dashboard chat panel:
    - `status`, `sendMessage`, `progress`, `statusMessage`, planning & task updates
    - Thread operations (`onNewThread`, `onSelectThread`, `deleteThread`, `getThreadPreview`)

- **`useEnsureChatConnected.ts`**:
  - Ensures the global chat WebSocket is connected while certain components (dashboard or global chat page) are mounted

- **`useJobReconnection.ts`**:
  - On app load, checks for running jobs and reconnects to them via `WorkflowRunner` and `GlobalWebSocketManager`

- **`useRunningJobs.ts`**: provides state and helpers for currently running workflows

### Model, Provider, and Metadata Hooks

- **`useHuggingFaceModels.ts`**, **`useLoraModels.ts`**, **`useOllamaModels.ts`**, **`useModelsByProvider.ts`**, **`useRecommendedModels.ts`**, **`useRecommendedTaskModels.ts`**, **`useModelInfo.ts`**:
  - Use React Query to fetch model lists from the backend and derive recommended subsets

- **`useProviders.ts`**, **`useProviderApiKeyValidation.ts`**, **`useApiKeyValidation.ts`**, **`useSecrets.ts`**:
  - Manage provider lists and validation of API keys stored in `SecretsStore`

### UI & UX Hooks (Expanded)

- **`useNumberInput.ts`**:
  - Provides sophisticated number input behavior (drag-to-change, clamping, decimal precision)

- **`useDelayedHover.ts`**:
  - Introduces delayed hover logic for tooltips and menus

- **`useRenderLogger.tsx`**:
  - Debugging hook to log re-render causes

- **`useCollectionDragAndDrop.ts`**:
  - Drag-and-drop in collections UI

- **`useIsDarkMode.ts`**: uses media queries / settings to choose theme

### Browser & Desktop Hooks

- **`useIpcRenderer.ts`**:
  - Handles Electron IPC (if `window.api` is available) for desktop integrations (e.g., menus, OS level actions)

- **`useRealtimeAudioStream.ts`**, **`useInputStream.ts`**, **`useWaveRecorder`** (via audio components):
  - Manage audio recording & streaming to backend nodes

### ServerState Hooks

Under `web/src/serverState`:

- **`useMetadata.ts`** + **`loadMetadata`**:
  - Fetches node metadata, registers BaseNode, builds connectability matrix
  - Calls `client.GET("/api/nodes/metadata")`
  - Builds:
    - `nodeTypes: NodeTypes` mapping `node_type → BaseNode`
    - `metadataByType: Record<string, NodeMetadata>` seeded from `defaultMetadata` (contains at least `Preview` node)
    - `recommendedModels: UnifiedModel[]` from all nodes; deduplicated by `(type, repo_id, path)`
  - Stores node types + metadata in `MetadataStore`
  - Calls `createConnectabilityMatrix` with all metadata, precomputing which output types can connect to which inputs

- **Asset hooks**: `useAssets.ts`, `useAssetUpload.ts`, `useAssetDeletion.ts`, `useAssetUpdate.ts`, `useAssetSearch.ts`, `useAsset.ts`
  - Provide TanStack Query wrappers around `/api/assets` endpoints and integrate with `AssetStore`

- **Workflow hooks**: `useWorkflow.ts`, `useWorkflowTools.ts`
  - Fetch a single workflow by id and related "workflow tools" for the assistant

- **`checkHfCache.ts`**, **`tryCacheFiles.tsx`**: check local Hugging Face cache or prefetch files

---

## Feature Domains & UI Components

### Dashboard

`Dashboard.tsx` (`web/src/components/dashboard/Dashboard.tsx`) builds a Dockview-based workspace:

- Layout:
  - `AppHeader` pinned at top inside the dashboard
  - `DockviewReact` container with panels defined by `PANEL_CONFIG`
  - Default layout from `config/defaultLayouts.ts` pre-configures splits:
    - A "Workflows" panel
    - A "Recent chats" panel

- Panels & content:
  - Uses `createPanelComponents` to map IDs to React components:
    - `welcome` – welcome / getting started content
    - `setup` – setup panel (providers, local environment)
    - `templates` – "start templates" from `useDashboardData`
    - `workflows` – list/sorting of workflows
    - `recent-chats` – `Thread` list using `GlobalChatStore`
    - `chat` – embedded chat UI
  - `AddPanelDropdown` and `LayoutMenu` allow adding panels and saving/restoring layouts via `LayoutStore` and Dockview's JSON export/import

- Behavior:
  - Uses `useDashboardData` to populate workflows and templates
  - Uses `useChatService` + `useEnsureChatConnected` to integrate chat into the dashboard
  - Ensures "welcome" and "setup" panels are automatically shown on startup depending on `SettingsStore`
  - Persists and restores panel layouts through `LayoutStore` and Dockview's JSON export/import

### Workflow Editor

Core files:

- `NodeEditor.tsx` (`web/src/components/node_editor/NodeEditor.tsx`)
- `TabsNodeEditor.tsx` (`web/src/components/editor/TabsNodeEditor.tsx`)
- `ReactFlowWrapper.tsx` (`web/src/components/node/ReactFlowWrapper.tsx`)
- Node detail components in `web/src/components/node` and `web/src/components/node_types`

Behavior:

- `TabsNodeEditor` manages multiple open workflows as tabs, each tab embedding a `NodeContext` + `NodeEditor`
- `NodeEditor`:
  - Uses styles from multiple CSS files (`base.css`, `nodes.css`, `properties.css`, etc.) and `node_styles/node-styles.ts`
  - Wires to `NodeStore` via `useNodes` / `useTemporalNodes`
  - Uses `useWebsocketRunner` to keep track of workflow run state (connecting, running, etc.)
  - Uses `useAssetUpload` for drag-and-drop / file uploads into the editor
  - Integrates `NodeMenu` for node search and insertion
  - Shows node help documentation via `DraggableNodeDocumentation` and `KeyboardShortcutsView`
  - Configures keyboard shortcuts via `useNodeEditorShortcuts` and `KeyPressedStore`
  - Has a `CommandMenu` (command palette) triggered by `meta+k` / `ctrl+k`
  - Keeps track of missing models (prompting downloads if needed)

- Node rendering:
  - `BaseNode.tsx` is the generic node component for the majority of node types, driven by metadata
  - `PlaceholderNode.tsx` is used for unknown or not-yet-loaded node types (to keep graphs stable)
  - Node inputs/outputs, labels, handles, and property forms are rendered using:
    - `NodeContent`, `NodeInputs`, `NodeOutputs`, `NodePropertyForm`, `OutputRenderer`
  - Node connections are drawn with custom `ConnectionLine.tsx` and `EdgeGradientDefinitions.tsx`

- Node types:
  - Backend metadata defines node types (logically in Python). On the frontend, `loadMetadata` registers all `node_type → BaseNode` mappings
  - `NodeTypeMapping.ts` maps MIME types and internal type names (e.g., `text`, `image`, `audio`) to input/output node classes (e.g., `nodetool.input.ImageInput`, `nodetool.output.Output`) and constants

### Global Chat & Agent Tools

Components:

- `GlobalChat.tsx` (`web/src/components/chat/containers/GlobalChat.tsx`)
- Child structures under `chat/composer`, `chat/message`, `chat/thread`, `chat/controls`

Features:

- Thread-centric chat, where each thread:
  - Is persisted on the backend (`Thread` in `ApiTypes`)
  - Can be loaded, deleted, and summarized
  - Has `Message` history cached locally with pagination
- Chat connection:
  - `GlobalChatStore.connect()` creates a `WebSocketManager` with `CHAT_URL`, optionally with a Supabase token in the query string
  - Uses TanStack Query (`useThreadsQuery`) to load thread metadata
  - `useEnsureChatConnected` automatically connects while the chat UI is present
- Agent features:
  - `agentMode` toggle: messages flagged as agent mode may trigger more "planning" and tool call behavior
  - Planning and task updates:
    - AI agent can send `PlanningUpdate` and `TaskUpdate` messages
    - The UI surfaces them in the dashboard panels and chat view
  - Frontend tools:
    - `FrontendToolRegistry` (`web/src/lib/tools/frontendTools.ts`) defines tools starting with `ui_` that can be invoked by the backend agent (e.g., `ui_add_node`, `ui_align_nodes`, etc.)
    - Built-in tools are defined in `web/src/lib/tools/builtin/*.ts` and are registered from `index.tsx` imports
    - Tools operate on the `FrontendToolState` provided by `GlobalChatStore` and `WorkflowManagerContext` (e.g., `getWorkflow()`, `createNew()`, `saveWorkflow()`)
  - Workflow graph updates:
    - The assistant can emit `workflow_created` / `workflow_updated` messages with a graph payload
    - `GlobalChatStore` stores the last such update in `lastWorkflowGraphUpdate`
    - `useWorkflowGraphUpdater` picks this up, converts to XYFlow nodes/edges, updates the NodeStore, and triggers auto layout

### Assets & Asset Viewer

Components:

- `AssetExplorer.tsx` (`web/src/components/assets/AssetExplorer.tsx`)
- `AssetGrid.tsx`, `AssetGridRow.tsx`, `AssetListView.tsx`, `AssetTable.tsx`
- `FolderTree.tsx`, `FolderList.tsx`, `FolderItem.tsx`
- Confirm dialogs (delete, move, rename), upload overlays

Asset viewers:

- `asset_viewer/AudioViewer.tsx`, `ImageViewer.tsx`, `PDFViewer.tsx`, `TextViewer.tsx`, `VideoViewer.tsx` handle previewing different asset types, using appropriate viewers (e.g., `react-pdf`, video tags, etc.)

Behavior:

- `AssetExplorer`:
  - Wraps the main asset UI with `AppHeader` and `ContextMenuProvider`
  - Uses `useAssets()` (serverState hook) to fetch assets grouped by folder
  - Passes assets into `AssetGrid` with layout parameters
- `AssetStore` / `AssetGridStore` manage:
  - Sorting, filtering, size of tiles
  - Selected asset(s)
  - Infinite scroll and virtualization in the grid

### Models & Hugging Face Integration

Components:

- `hugging_face/ModelListIndex.tsx` – main models page
- `HuggingFaceModelSearch.tsx` – search interface
- `ModelsManager.tsx` – high-level model manager UI
- `ModelDownloadDialog.tsx`, `ModelDownloadList.tsx`, `OverallDownloadProgress.tsx`, `DownloadManagerDialog.tsx`
- `RecommendedModels.tsx` + `RecommendedModelsDialog.tsx` – recommended models overlay
- `RequiredModelsDialog.tsx` – shows missing models required by workflows

Configuration:

- `config/models.ts` defines pre-curated `UnifiedModel` entries, including:
  - Local/GGUF models (`gpt-oss:20b`, various `llama3.*`, `deepseek-r1:*`, etc.)
  - Other categories like "Granite" and "MiniCPM-V"

Model stores:

- `ModelStore`, `ModelDownloadStore`, `ModelManagerStore`, `ModelFiltersStore`, `ModelPreferencesStore`
- Combined with hooks (`useHuggingFaceModels`, `useLoraModels`, `useOllamaModels`, `useRecommendedModels`) to build the UI

### Mini-Apps

`MiniAppPage.tsx` (`web/src/components/miniapps/MiniAppPage.tsx`) exposes workflows as simpler "apps":

- Loads the workflow via `useWorkflowManager.fetchWorkflow` + React Query
- Derives input definitions and current values with `useMiniAppInputs(workflow)`
- Builds a React form (`MiniAppInputsForm`) for the workflow's inputs
- On submit:
  - Clamps numeric values to min/max from metadata via `clampNumber`
  - Runs the workflow via `useMiniAppRunner`
  - Converts the saved graph to XYFlow nodes/edges via `graphNodeToReactFlowNode` / `graphEdgeToReactFlowEdge`
- Displays:
  - Status message with animated status text if running
  - Progress bar
  - `MiniAppResults` for outputs
- Has "Open in Editor" button to jump to `/editor/<workflow.id>`

### Workflows & Workspaces

Workflow list & templates:

- `workflows/WorkflowList.tsx`, `WorkflowListView.tsx`, `WorkflowTile.tsx`, `WorkflowToolbar.tsx`, `WorkflowForm.tsx`, `WorkflowFormModal.tsx`, `WorkflowDeleteDialog.tsx`
- `ExampleGrid.tsx` – grid of example workflows (templates) with search & tags filters

Workspace tree:

- `workspaces/WorkspaceTree.tsx` – organizes multiple workspaces or remote connections (e.g., local vs remote runtimes / groups of workflows)

### Text Editor, Terminal, Audio

Text editor:

- `textEditor/` directory includes Lexical integration:
  - `LexicalEditor.tsx`, `EditorToolbar.tsx`, `EditorStatusBar.tsx`, `FindReplaceBar.tsx`
  - Plugins like `CodeHighlightPlugin.tsx`, `MarkdownPastePlugin.tsx`, `FloatingTextFormatToolbar.tsx`, `HorizontalRulePlugin.tsx`
  - Supports markdown export (`exportMarkdown.ts`) and syntax highlighting with Prism

Terminal:

- `terminal/Terminal.tsx` – xterm.js integration for running commands or showing logs (wired via WebSockets or NodeTool backend)

Audio:

- `audio/AudioControls.tsx`, `AudioPlayer.tsx`, `WaveRecorder.tsx`
  - Waveform display & audio playback via `wavesurfer.js`
  - `WaveRecorder` integrates with Web Audio for recording, used in nodes or chat attachments

---

## Server-Provided Metadata & Search

### Node Metadata & Node Types

`useMetadata.ts` (`web/src/serverState/useMetadata.ts`) + `loadMetadata()`:

- Calls `client.GET("/api/nodes/metadata")`
- Builds:
  - `nodeTypes: NodeTypes` mapping `node_type → BaseNode`
  - `metadataByType: Record<string, NodeMetadata>` seeded from `defaultMetadata` (contains at least `Preview` node)
  - `recommendedModels: UnifiedModel[]` from all nodes; deduplicated by `(type, repo_id, path)`
- Stores:
  - Node types + metadata in `MetadataStore`
  - Recommended models for UI lists
- Calls `createConnectabilityMatrix` with all metadata, precomputing which output types can connect to which inputs, used by node search and connection validation

### Search & Filtering Utilities

Under `web/src/utils`:

- `workflowSearch.ts` – search workflows by name/tags
- `nodeSearch.ts` – fuzzy search node types, used in `NodeMenu`
- `modelFilters.ts` – filter models by provider, capabilities, etc.
- `highlightText.ts` – highlight search matches
- `formatDateAndTime.ts` / `groupByDate.ts` – grouping workflows or assets by date
- `providerDisplay.ts`, `modelFormatting.tsx` – present models/providers nicely
- `workflowUpdates.ts` – unify job update messages into store updates
- `dockviewLayout.ts` – safe apply of Dockview layout JSON

---

## WebSockets & Real-Time Execution

### Global WebSocket Manager (Workflows)

`GlobalWebSocketManager.ts` (`web/src/lib/websocket/GlobalWebSocketManager.ts`):

- Singleton that owns a single `WebSocketManager` for `WORKER_URL`
- Ensures only one connection and tracks `isConnected`/`isConnecting`
- Methods:
  - `ensureConnection()` – establishes or waits for the connection
  - `subscribe(key, handler)` – register message handler for a workflow id or job id
  - `send(message)` – send message via underlying WebSocket
  - `disconnect()` – close connection and reset flags
- `WorkflowRunner` uses this to:
  - Subscribe to updates for a workflow id and job id
  - Send commands: `run_job`, `reconnect_job`, `stream_input`, `end_input_stream`, `cancel_job`

### Chat WebSocket Manager

`WebSocketManager.ts` (in `lib/websocket`) is a generic WebSocket wrapper used by:

- `GlobalChatStore` for chat WebSocket
- `GlobalWebSocketManager` for workflow WebSocket

It supports:

- Auto reconnect with backoff
- Event listeners for `open`, `message`, `error`, `close`, `reconnecting`

---

## Theming & Styling

`ThemeNodetool.tsx` (`web/src/components/themes/ThemeNodetool.tsx`):

- Creates a MUI CSS-vars-based theme with light and dark `palette`s (`paletteLight`, `paletteDark`)
- Configures:
  - Font families (`Inter`, `JetBrains Mono`)
  - Custom font size tokens (`fontSizeGiant`, etc.)
  - Rounded corners for dialogs, nodes, buttons
  - Z-index layers for appBar, modals, command menu, popovers, autocomplete, etc.
- Overrides:
  - `MuiTypography`, `MuiButton`, `MuiFormLabel`, `MuiFormControl`, `MuiPopover`, `MuiModal`, etc., to match NodeTool's visual identity
- Global CSS:
  - `styles/vars.css`, `styles/index.css`, `styles/nodes.css`, etc., define CSS variables, node shape styling, micro-tooltips, and mobile adaptations

---

## Directory Overview

At `web/src`:

- `components/AGENTS.md` – detailed per-component guidance for agents
- `components/` – React components organized by domain:
  - `asset_viewer`, `assets`, `audio`, `chat`, `collections`, `content`, `context_menus`, `dialogs`, `editor`, `hugging_face`, `inputs`, `menus`, `miniapps`, `node`, `node_editor`, `node_menu`, `node_types`, `panels`, `properties`, `search`, `terminal`, `textEditor`, `themes`, `ui`, `workflows`, `workspaces`, etc.
- `config/` – core configuration:
  - `constants.ts` (APP_NAME, VERSION, default zoom, default model, search tuning)
  - `models.ts` (LLM recommendations)
  - `shortcuts.ts` (node editor shortcut registry + tooltip helpers)
  - `defaultLayouts.ts` (Dockview default layout)
- `constants/` – colors & data type configurations used across the UI
- `contexts/` – `NodeContext.tsx`, `WorkflowManagerContext.tsx`, `EditorInsertionContext.tsx`
- `core/` – graph utilities (`graph.ts`)
- `hooks/` – cross-cutting hooks; many listed above
- `icons/` – SVG icons
- `lib/` – Supabase client, WebSocket helpers, frontend tools, tests
- `node_styles/` – themeable node CSS settings
- `serverState/` – React Query hooks for server-backed state (assets, workflows, metadata)
- `stores/` – Zustand stores (UI, assets, nodes, workflows, models, chat, etc.)
- `styles/` – CSS for global layout, nodes, interactions, tooltips, command menu, dockview, mobile
- `types/`, `*.d.ts` – TS declaration augmentations for MUI, Emotion, window, etc.
- `utils/` – generic util functions for formatting, search, error handling, node type mapping, etc.

---

## AI Agent Documentation System

This repository includes a comprehensive AGENTS.md documentation system to guide AI coding assistants through the codebase:

### Documentation Structure

```
📁 nodetool/
├── 📄 AGENTS.md (this file)           # Root guide with navigation to all specialized guides
├── 📁 web/src/
│   ├── 📄 AGENTS.md                   # Web application overview
│   ├── 📁 components/
│   │   └── 📄 AGENTS.md               # UI component architecture
│   ├── 📁 stores/
│   │   └── 📄 AGENTS.md               # Zustand state management
│   ├── 📁 contexts/
│   │   └── 📄 AGENTS.md               # React contexts integration
│   ├── 📁 hooks/
│   │   └── 📄 AGENTS.md               # Custom React hooks guide
│   ├── 📁 utils/
│   │   └── 📄 AGENTS.md               # Utility functions reference
│   ├── 📁 serverState/
│   │   └── 📄 AGENTS.md               # TanStack Query patterns
│   ├── 📁 lib/
│   │   └── 📄 AGENTS.md               # Library integrations
│   └── 📁 config/
│       └── 📄 AGENTS.md               # Configuration management
 ├── 📁 electron/src/
 │   └── 📄 AGENTS.md                   # Electron desktop app
 ├── 📁 mobile/
 │   ├── 📄 README.md                   # Mobile app setup and usage
 │   ├── 📄 QUICKSTART.md                # Quick start guide for mobile
 │   └── 📄 ARCHITECTURE.md             # Mobile app architecture
 ├── 📁 docs/
 │   └── 📄 AGENTS.md                   # Documentation guidelines
 ├── 📁 scripts/
 │   └── 📄 AGENTS.md                   # Build and release scripts
 └── 📁 workflow_runner/
     └── 📄 AGENTS.md                   # Standalone workflow runner
 ```

### Complete File List

**Root Level:**
- `/AGENTS.md` - Main entry point with quick navigation (this file)
- `/.github/copilot-instructions.md` - GitHub Copilot-specific patterns

**Web Application (9 files):**
- `/web/src/AGENTS.md` - React app overview
- `/web/src/components/AGENTS.md` - Component architecture (detailed)
- `/web/src/stores/AGENTS.md` - State management with Zustand
- `/web/src/contexts/AGENTS.md` - React contexts and providers
- `/web/src/hooks/AGENTS.md` - Custom hooks patterns
- `/web/src/utils/AGENTS.md` - Utility functions guide
- `/web/src/serverState/AGENTS.md` - Server state with TanStack Query
- `/web/src/lib/AGENTS.md` - Third-party integrations
- `/web/src/config/AGENTS.md` - Configuration and constants

**Mobile Application (3 files):**
- `/mobile/README.md` - React Native/Expo mobile app setup and usage
- `/mobile/QUICKSTART.md` - Step-by-step guide to run the mobile app
- `/mobile/ARCHITECTURE.md` - Architecture and implementation details

**Other Components (4 files):**
- `/electron/src/AGENTS.md` - Desktop application
- `/docs/AGENTS.md` - Documentation writing
- `/scripts/AGENTS.md` - Build automation
- `/workflow_runner/AGENTS.md` - Standalone runner

**Total: 17 documentation files** providing comprehensive guidance across the entire codebase.

### Navigation Features

1. **Breadcrumb Navigation**: Each AGENTS.md file includes breadcrumbs showing its location in the hierarchy
2. **Cross-References**: Files link to related documentation
3. **Quick Navigation**: This root file provides a quick navigation index at the top
4. **Consistent Structure**: All files follow similar organization patterns
5. **Related Documentation**: Each specialized guide links to relevant resources

### When to Use Which Guide

- **Starting a new feature?** → Check the root AGENTS.md Quick Navigation
- **Working on UI components?** → `/web/src/components/AGENTS.md`
- **Adding state management?** → `/web/src/stores/AGENTS.md`
- **Creating custom hooks?** → `/web/src/hooks/AGENTS.md`
- **Writing utilities?** → `/web/src/utils/AGENTS.md`
- **API integration?** → `/web/src/serverState/AGENTS.md`
- **Third-party library?** → `/web/src/lib/AGENTS.md`
- **Configuration changes?** → `/web/src/config/AGENTS.md`
- **Electron features?** → `/electron/src/AGENTS.md`
- **Documentation updates?** → `/docs/AGENTS.md`
- **Build scripts?** → `/scripts/AGENTS.md`

### Contributing to AGENTS.md Files

When adding new sections or directories:

1. Create an `AGENTS.md` file in the new directory
2. Add breadcrumb navigation at the top
3. Include cross-references to related guides
4. Follow the established structure and patterns
5. Update this root file's Quick Navigation section
6. Keep content focused on what AI agents need to know
7. Include practical examples and code patterns

### Documentation Maintenance

Keeping AGENTS.md files up to date is essential:

1. **Update When Making Changes**: When modifying core functionality, update the relevant AGENTS.md
2. **Review Periodically**: Check documentation monthly for stale content or broken links
3. **Test Examples**: Verify all code examples still work
4. **Sync with Codebase**: Ensure docs reflect current implementation
5. **Version Tagging**: For major changes, consider adding version notes

**Last Updated**: January 2026

---
