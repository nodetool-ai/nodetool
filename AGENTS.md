# AGENT RULES

This file provides guidance to Agents when working with code in this repository.

## Project Overview

NodeTool is an open-source, privacy-first, no-code platform for rapidly building and automating AI workflows. It enables users to create sophisticated AI solutions visually through a drag-and-drop interface with no coding required.

## Architecture

NodeTool follows a client-server architecture with multiple components:

1. **Frontend Components:**

   - Web UI (React/TypeScript): Visual editor for building AI workflows
   - Electron Wrapper: Packages the web UI into a desktop application
   - Apps UI: Standalone mini-applications created from workflows

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
- `/apps`: Mini-app builder components
- `/docs`: Documentation files
- `/scripts`: Build and release scripts

## Important Commands

### Development Setup

1. **Environment Activation:**
   Before running python commands always do:

   ```bash
   conda activate nodetool
   ```

2. **Web UI Development:**

   ```bash
   cd web
   npm install
   npm start
   ```

   - Access at http://localhost:3000

3. **Electron App Development:**

   ```bash
   # Build the web UI first
   cd web
   npm install
   npm run build
   cd ..

   # Build the apps UI
   cd apps
   npm install
   npm run build
   cd ..

   # Run with Electron
   cd electron
   npm install
   npm start
   ```

### Build Commands

1. **Web UI Build:**

   ```bash
   cd web
   npm run build
   ```

2. **Apps UI Build:**

   ```bash
   cd apps
   npm run build
   ```

3. **Electron App Build:**
   ```bash
   cd electron
   npm run build
   ```

### Linting & Type Checking

1. **Web UI:**

   ```bash
   cd web
   npm run lint        # Run ESLint
   npm run lint:fix    # Fix linting issues
   npm run typecheck   # Check TypeScript types
   ```

2. **Apps UI:**

   ```bash
   cd apps
   npm run lint
   npm run lint:fix
   npm run typecheck
   ```

3. **Electron App:**
   ```bash
   cd electron
   npm run lint
   npm run lint:fix
   npm run typecheck
   ```

### Testing

1. **Web UI Tests:**
   ```bash
   cd web
   npm test                    # Run all tests
   npm run test:watch          # Watch mode for development
   npm run test:coverage       # Generate coverage report
   npm run test:summary        # Summary output only
   ```

2. **Test Documentation:**
   - See `/web/TESTING.md` for comprehensive testing guide
   - See `/web/TEST_HELPERS.md` for test utilities and patterns
   - See `.github/copilot-instructions.md` for AI-specific guidelines

3. **Test Structure:**
   - Component tests: `src/components/__tests__/`
   - Store tests: `src/stores/__tests__/`
   - Hook tests: `src/hooks/__tests__/`
   - Utility tests: `src/utils/__tests__/`

4. **Testing Framework:**
   - Jest 29.7 with ts-jest for TypeScript support
   - React Testing Library 16.1 for component testing
   - @testing-library/user-event for user interactions
   - @testing-library/jest-dom for DOM matchers

5. **Key Testing Principles:**
   - Test behavior, not implementation details
   - Use accessible queries (getByRole, getByLabelText)
   - Use userEvent for realistic user interactions
   - Mock external dependencies and API calls
   - Keep tests independent and isolated
   - Follow existing test patterns in the codebase

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

- **Frontend:** React, TypeScript, Vite, Material UI, ReactFlow
- **Backend:** Python, FastAPI, WebSockets
- **AI Integration:** Supports Hugging Face, Ollama, OpenAI, Anthropic, and more
- **Packaging:** Electron for desktop app

## Project Structure

- The codebase is modular with clear separation between UI components and backend services
- The web UI follows a React component structure with stores for state management
- The electron app wraps the web UI and provides desktop integration features
- The apps component handles mini-app functionality

## AI Agent Documentation

The repository includes several AGENTS.md files to guide AI coding assistants through the codebase structure:

- `/AGENTS.md`: Root documentation for OpenAI's coding agents (similar to this CLAUDE.md file)
- `/web/src/AGENTS.md`: Overview of the React web application structure
- `/web/src/components/AGENTS.md`: Detailed guide to React UI components
- `/web/src/stores/AGENTS.md`: Documentation for Zustand state management stores
- `/web/src/contexts/AGENTS.md`: Guide to React contexts and their integration with stores
