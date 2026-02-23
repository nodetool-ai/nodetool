# NodeTool Feature List

Existing features in NodeTool. **Read before adding new features to avoid duplicates.**

Format: `- **Feature Name**: Brief description`

Last updated: 2026-02-23

- **Quick Add Node Dialog (2026-02-23)**: Fast, keyboard-accessible dialog for searching and adding nodes to workflows; accessible via Ctrl+Shift+A / Cmd+Shift+A; supports fuzzy search by node name, type, and namespace; displays results count and keyboard hints
- **Minimap Type-Based Coloring (2026-02-10)**: Enhanced minimap with color-by-node-type mode, configurable via settings popover; includes interactive legend showing Input (blue), Constant (purple), Processing (slate), Group (indigo), Comment (green), and Output (amber) nodes

- **Store JSDoc Documentation (2026-01-19)**: Added module-level JSDoc to ResultsStore, AssetStore, and StatusStore for consistent documentation across all critical stores

- **Documentation Audit (2026-01-18)**: Fixed table formatting in docs/AGENTS.md, removed duplicate entry, updated file structure tree to match actual docs directory

- **Workflow Settings UI**: Removed "Basic Information" headline, added descriptions to Execution and Advanced sections

- **Auto-save Interval Fix**: Fixed auto-save interval settings not being applied when changed by user

- **Node Resize Min Width**: Increased minimum node width from 100px to 200px for better UX

---

- **Improved Workspace Error Messages**: Better user-friendly error and empty state messages in workspace explorer with helpful guidance

## Core Application Features

### Workflow Editor
- **Visual Node Editor**: Drag-and-drop interface using ReactFlow for creating AI workflows
- **Node Connection**: Visual edge connections between node inputs/outputs with validation
- **Undo/Redo**: Temporal middleware for undo/redo operations in workflows
- **Auto-Layout**: Automatic node positioning algorithms for cleaner workflows
- **Zoom & Pan**: Navigation controls for large workflows
- **Viewport Status Indicator**: Real-time zoom percentage with zoom presets (25%-200%), zoom in/out buttons, and fit view
- **Zoom Presets**: Quick access to common zoom levels (25%, 50%, 75%, 100%, 150%, 200%) via dropdown menu and keyboard shortcuts
- **Minimap**: Overview minimap for workflow navigation with configurable color modes (default or type-based coloring)
- **Minimap Type Colors**: Optional color-by-type display with interactive legend showing node categories (Input, Constant, Processing, Group, Comment, Output)
- **Multi-Select**: Select and manipulate multiple nodes simultaneously
- **Copy/Paste**: Copy and paste nodes within and across workflows
- **Find in Workflow**: Search for nodes by name, type, or properties
- **Node Placement**: Smart node placement with collision avoidance
- **Selection Action Toolbar**: Floating toolbar for batch operations on selected nodes (align, distribute, group, delete)
- **Keyboard Node Navigation**: Tab-based keyboard navigation for focus selection and directional arrow navigation between nodes
- **Quick Add Node**: Fast, keyboard-accessible dialog (Ctrl+Shift+A / Cmd+Shift+A) for searching and adding nodes by name, type, or namespace without opening the node menu

### Node Management
- **Node Menu**: Categorized browser for all available node types with search
- **Node Search**: Fuzzy search for finding nodes by name/description (Fuse.js)
- **Node Properties**: Property editors for different data types (text, number, color, date, etc.)
- **Node Inspector**: Inspect node inputs, outputs, and execution results
- **Node Info Panel**: Contextual panel showing selected node details (type, description, connections, status, quick actions)
- **Quick Constant Nodes**: Quick access tiles for adding constant value nodes (String, Integer, Float, Boolean) directly from the node menu
- **Node Context Menu**: Right-click menu for node operations (delete, duplicate, etc.)
- **Node Tooltips**: Hover tooltips showing node handle information
- **Node Documentation**: Inline documentation for each node type
- **Favorite Nodes**: Mark frequently used nodes as favorites
- **Recent Nodes**: Track recently used nodes for quick access
- **Node Groups**: Group related nodes together (Loop nodes)
- **Connectable Nodes**: Visual indicators showing which nodes can connect

### Workflow Management
- **Workflow Creation**: Create new workflows from scratch or templates
- **Workflow Saving**: Auto-save and manual save workflows
- **Workflow Loading**: Load and open existing workflows
- **Workflow Templates**: Pre-built workflow templates for common tasks
- **Workflow Collections**: Organize workflows into collections
- **Favorite Workflows**: Mark workflows as favorites
- **Workflow Sharing**: Share workflows with unique URLs
- **Version History**: Track workflow changes over time
- **Workflow Export/Import**: Export workflows as JSON files
- **Workflow Actions**: Batch operations on workflows

### Workflow Execution
- **Run Workflows**: Execute workflows with real-time progress
- **Stream Results**: Real-time streaming of workflow results via WebSocket
- **Result Viewer**: View and inspect execution results for each node
- **Error Handling**: Display and track execution errors
- **Execution History**: View past workflow executions
- **Cancel Execution**: Stop running workflows
- **Audio Queue**: Queue and manage audio generation tasks
- **Node Execution Time**: Display execution duration for completed nodes

### Asset Management
- **Asset Explorer**: File browser for managing workflow assets
- **Asset Grid**: Grid view of assets with thumbnails
- **Asset Table**: Table view with sorting and filtering
- **Asset Tree**: Hierarchical folder navigation
- **Asset Upload**: Drag-and-drop file upload (Dropzone)
- **Asset Preview**: Preview different asset types (images, audio, video, PDF, text)
- **Asset Metadata**: View and edit asset metadata
- **Asset Search**: Search assets by name and type
- **Folder Management**: Create, rename, delete folders

### Asset Viewers
- **Image Viewer**: Display images with zoom and pan
- **Image Size Display**: Shows image dimensions (width × height) in bottom right of image output nodes
- **Audio Viewer**: Audio playback with controls
- **Video Viewer**: Video playback with controls
- **PDF Viewer**: PDF document viewer
- **Text Viewer**: Text file viewer with syntax highlighting

### Authentication & User Management
- **Login/Logout**: User authentication system
- **Google OAuth**: Google authentication integration
- **Protected Routes**: Route protection for authenticated content
- **Session Management**: User session state tracking
- **Remote Settings**: Sync user settings across devices
- **Secrets Management**: Store and manage API keys securely
- **Secrets Search**: Sticky search input to filter secrets by key or description

---

## UI Components & Features

### Chat & Assistants
- **Global Chat**: AI chat interface for natural language interactions
- **Workflow Generator**: Generate workflows from natural language descriptions
- **Chat View**: Generic chat interface component
- **Chat Composer**: Rich message composition with file attachments
- **Tool Selector**: Select which AI tools to use in chat
- **Message Streaming**: Real-time streaming of AI responses

### Dashboard & Navigation
- **Dashboard**: Landing page with workflow overview and quick actions
- **Getting Started**: Welcome screen and onboarding flow
- **Help Documentation**: In-app help documentation
- **Navigation Menu**: Application navigation with breadcrumbs
- **Workspaces**: Organize work into separate workspaces
- **Tab-based Editor**: Multiple workflows open in tabs

### UI Controls
- **Color Picker**: Color selection with swatches and hex input
- **Date Picker**: Calendar-based date selection
- **File Upload Button**: Button component for file uploads
- **Infinite Scroll**: Load content incrementally on scroll
- **Context Menus**: Right-click menus for various elements (nodes, edges, pane, properties)
- **Keyboard Shortcuts**: Configurable keyboard shortcuts system including undo/redo, copy/paste, align, distribute, find, and reset zoom
- **Close Button**: Consistent close button component
- **Delete Button**: Consistent delete button component

### Theming & Appearance
- **Theme Switcher**: Switch between light and dark themes
- **Custom Themes**: Create and customize color themes
- **Color Palettes**: Predefined color palettes for themes
- **Responsive Design**: Mobile-responsive interface
- **Logo Component**: Application branding

### Panels & Layout
- **Left Panel**: Collapsible left sidebar with node menu
- **Right Panel**: Collapsible right sidebar with properties
- **Bottom Panel**: Collapsible bottom panel for logs and results
- **Panel Resizing**: Adjustable panel dimensions
- **Layout Persistence**: Remember panel states across sessions
- **Title Bar**: Custom title bar for Electron app

---

## Model & AI Integration

### Model Management
- **Model Manager**: Browse and manage AI models
- **Model Download**: Download models from HuggingFace and other sources
- **Model Menu**: Select models for different node types
- **Model Filters**: Filter models by type, size, task
- **Model Preferences**: Set default models for node types
- **HuggingFace Integration**: Direct integration with HuggingFace Hub
- **HF Cache Status**: Monitor HuggingFace cache usage
- **Model Download Progress**: Track model download progress

---

## Developer Features

### State Management
- **Zustand Stores**: 40+ specialized stores for different domains
- **Temporal Middleware**: Undo/redo support via temporal middleware
- **Store Persistence**: Save store state to localStorage
- **Custom Equality**: Optimized equality checks for state updates
- **Selective Subscriptions**: Fine-grained store subscriptions to prevent re-renders

### Testing Infrastructure
- **Jest Unit Tests**: Unit testing framework with React Testing Library
- **Playwright E2E Tests**: End-to-end testing for critical flows
- **Test Coverage**: Code coverage reporting
- **Component Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions
- **Mock API**: Mock API client for testing

### Build & Development
- **Vite Dev Server**: Fast development server with HMR
- **TypeScript**: Strict type checking throughout
- **ESLint**: Code quality and style enforcement
- **Prettier**: Automatic code formatting via ESLint
- **Make Commands**: Unified build commands (`make typecheck`, `make lint`, `make test`)
- **Code Splitting**: React.lazy for on-demand component loading

### Accessibility
- **ARIA Labels**: Accessible labels for UI elements
- **Keyboard Navigation**: Full keyboard navigation support
- **Screen Reader Support**: Compatible with screen readers
- **Focus Management**: Proper focus management for modals and dialogs
- **Color Contrast**: WCAG-compliant color contrast

---

## Platform-Specific Features

### Electron Desktop App
- **Desktop Wrapper**: Package web UI as desktop application
- **IPC Communication**: Inter-process communication for desktop features
- **File System Access**: Direct file system operations
- **Custom Title Bar**: Custom title bar for desktop app
- **Native Menus**: Native application menus
- **Sound Notifications**: System beep on workflow completion (Electron-only)

### Mobile App (React Native)
- **Mini Apps Viewer**: Browse and run mini apps on mobile
- **Mobile Navigation**: Mobile-optimized navigation
- **Touch Gestures**: Touch-friendly interface
- **Mobile Responsive**: Responsive design for mobile screens

### Mini Apps
- **Full Mini App Route** (`/apps/:workflowId`): Full UI with chrome
- **Standalone Mini App** (`/miniapp/:workflowId`): Minimal UI for embedding
- **Code Splitting**: Lazy-loaded mini app components
- **Fast Loading**: Optimized for fast load times

---

## Technical Features

### API & Data Management
- **REST API Client**: Centralized API client for backend communication
- **WebSocket Connection**: Real-time communication for workflow execution
- **TanStack Query**: Server state management with caching
- **Optimistic Updates**: Update UI before server confirmation
- **API Type Safety**: Full TypeScript types for API requests/responses

### Logging & Monitoring
- **Application Logs**: Log viewer for debugging
- **Error Tracking**: Track and display errors
- **Status Messages**: Display status updates to users
- **Notifications**: Toast notifications for user actions
- **Terminal Component**: Terminal-style log viewer

### Data Structures
- **Graph Nodes**: Custom node data structures
- **Graph Edges**: Custom edge data structures
- **ReactFlow Conversion**: Convert between graph and ReactFlow formats
- **Node Type Mapping**: Map API node types to UI components
- **Property Schemas**: Define property types and validation

### Search & Filtering
- **Fuzzy Search**: Fuse.js-powered fuzzy search
- **Node Filtering**: Filter nodes by category, type, favorites
- **Asset Filtering**: Filter assets by type and metadata
- **Search Error Boundary**: Graceful error handling for search failures

### Performance Optimizations
- **React.memo**: Memoized components to prevent unnecessary re-renders
- **useCallback**: Memoized callbacks for stable references
- **useMemo**: Memoized expensive calculations
- **Selective Zustand Subscriptions**: Subscribe only to needed state slices
- **Virtualized Lists**: Asset list and grid use react-window for efficient rendering of 1000+ items

---

## Existing Patterns & Conventions

### Component Patterns
- **Functional Components**: All components use React hooks
- **TypeScript Props**: Explicit interfaces for all component props
- **MUI Styling**: Material-UI components with theme integration
- **Emotion CSS**: CSS-in-JS with emotion library

### Code Quality
- **Strict TypeScript**: No `any` types, strict mode enabled
- **ESLint Rules**: Enforce strict equality, proper error throwing, etc.
- **Test Coverage**: Unit and integration tests for critical features
- **Accessibility Standards**: WCAG compliance focus

### Architecture
- **Component Co-location**: Components grouped by feature domain
- **Custom Hooks**: Reusable logic extracted to hooks
- **Context Providers**: React context for cross-cutting concerns
- **Store Pattern**: Zustand stores for global state

---

## Features NOT Yet Implemented

*(Update this section when considering these features in the future)*

- **Offline Mode**: Full offline workflow editing and execution
- **Collaborative Editing**: Real-time multi-user editing
- **Workflow Versioning UI**: Visual diff and merge for workflow versions
- **Advanced Analytics**: Workflow performance analytics and profiling
- **Plugin System**: Third-party plugin architecture
- **Custom Node Types**: User-defined custom node types via UI
- **Workflow Marketplace**: Share and discover community workflows
- **Integration Testing E2E**: More E2E test coverage
- **Performance Profiling UI**: Built-in performance profiling tools

---

## How to Use This File

### Before Planning Features
1. **Search this file** for keywords related to your feature idea
2. **Check similar features** that might already exist
3. **Read component guides** to understand existing implementations
4. **Consider enhancements** to existing features vs. new features

### When Adding Features
1. **Update this file** with the new feature in the appropriate section
2. **Document key decisions** in insights.md or common-issues.md
3. **Cross-reference** with relevant AGENTS.md files

### Feature Naming Convention
- Use **bold** for feature names
- Keep descriptions **concise** (1-2 lines max)
- Focus on **what** the feature does, not how
- Group related features together

---

**Note**: This list represents the current state of NodeTool. Check git history and recent PRs for the most up-to-date information on new features.

---

### Documentation Port Consistency Fixes (2026-01-17)

**Areas Improved**:
- Fixed port 8000 → 7777 in mobile/IMPLEMENTATION_SUMMARY.md
- Added port clarification comments to workflow_runner/AGENTS.md code examples
- Ensured consistent development port (7777) across all mobile and standalone app documentation

**Issues Fixed**:
- mobile/IMPLEMENTATION_SUMMARY.md: Server URL setup section now correctly defaults to port 7777
- workflow_runner/AGENTS.md: Code examples now use 7777 with explanatory comments about dev/prod distinction

**Impact**: Mobile and workflow runner documentation now correctly directs developers to port 7777 for local development, matching the web application and other documentation.

**Files Updated**:
- mobile/IMPLEMENTATION_SUMMARY.md
- workflow_runner/AGENTS.md
- .memory/issues/git-ci/documentation-port-inconsistency.md

---

### Documentation Quality Assurance (2026-01-16)

**Areas Improved**:
- Fixed port inconsistencies in mobile documentation (port 8000 → 7777)
- Fixed markdown code block escaping in docs/AGENTS.md
- Added documentation best practices to memory insights
- Comprehensive audit of all 27 documentation files (AGENTS.md + README)
- Verified port consistency, command accuracy, and code examples across all docs

**Issues Fixed**:
- mobile/README.md: Fixed Android emulator URL in troubleshooting
- mobile/QUICKSTART.md: Fixed emulator URLs and firewall port reference
- docs/AGENTS.md: Fixed 4 incorrectly escaped code block examples
- All docs verified to use correct npm commands from package.json
- All code examples verified to compile and match current implementation

**Impact**: Documentation now correctly references port 7777 for development scenarios. Code examples in docs/AGENTS.md render properly in markdown viewers. All 27 documentation files verified accurate and complete.

**Files Updated**:
- mobile/README.md
- mobile/QUICKSTART.md
- docs/AGENTS.md
- .memory/issues/git-ci/documentation-port-inconsistency.md
- .memory/insights/code-quality/documentation-best-practices.md
- .memory/issues/documentation/documentation-audit-2026-01-16.md (NEW)

---

### Documentation Improvements (2026-01-16)

**Areas Improved**: Mobile app documentation
**Issues Fixed**: Deprecated Expo build commands updated to EAS Build
**Impact**: Developers following documentation will now use current Expo build tooling. EAS Build is the recommended approach for production builds, replacing deprecated `expo build:android` and `expo build:ios` commands.

**Files Updated**:
- `mobile/README.md` - Replaced deprecated commands with EAS Build instructions
  - Added EAS CLI installation and login steps
  - Added Android APK/AAB build instructions
  - Added iOS IPA build instructions
  - Added multi-platform build commands
  - Added EAS Build profiles documentation
  - Added app store submission instructions
  - Added local build alternatives
  - Added troubleshooting section

**Related Memory**:
- `.memory/insights/code-quality/documentation-best-practices.md` - Documentation standards

---

**Issue**: Development-focused documentation incorrectly referenced port 8000 instead of 7777 for the local NodeTool server.

**Affected Files Fixed**:
- `mobile/QUICKSTART.md` - Updated 5 port references to 7777
- `web/src/stores/BASE_URL.ts` - Fixed comment to reference correct port
- `web/.env.example` - Updated VITE_API_URL to use port 7777

**Key Distinction**:
- **Development**: `nodetool serve` defaults to port 7777
- **Production**: `nodetool serve --production` and `nodetool worker` default to port 8000

**Impact**: Developers following documentation will now correctly connect to the development server on port 7777.

---

### Documentation Quality Audit & JSDoc Improvements (2026-01-17)

**Areas Improved**: Hook documentation (useAlignNodes)

**Issues Fixed**: Missing JSDoc documentation on useAlignNodes hook

**Improvement Made**: Added JSDoc documentation to web/src/hooks/useAlignNodes.ts:
- Added module-level type documentation
- Documented AlignNodesOptions type with @param tags
- Added @returns tag describing the callback function
- Included @example code block showing usage patterns

**Impact**: Improved hook discoverability and developer experience. Hooks now follow the same documentation standards as critical stores (NodeStore, WorkflowRunner, GlobalChatStore).

**Files Updated**:
- web/src/hooks/useAlignNodes.ts

**Related Memory**:
- `.memory/insights/code-quality/documentation-best-practices.md` - Documentation standards
- `.memory/issues/documentation/documentation-quality-audit-2026-01-17.md` - Audit findings

---

### JSDoc Documentation Improvements (2026-01-17)

**Areas Improved**: Hook documentation coverage (5 critical hooks)

**Issues Fixed**: Multiple critical hooks lacked JSDoc documentation

**Improvements Made**: Added JSDoc documentation to 5 critical hooks:

1. **useChatService.ts** - Chat service interface
   - Added module-level documentation explaining the hook's purpose
   - Documented all return values with descriptions
   - Included @example code block showing usage patterns
   - Documented complex thread management and message sending logic

2. **useNodeEditorShortcuts.ts** - Editor keyboard shortcuts (largest hook, 19KB)
   - Added comprehensive module documentation
   - Documented all supported keyboard shortcuts
   - Included examples of common shortcuts (Ctrl+C, Ctrl+V, etc.)
   - Explained shortcut registration pattern with KeyPressedStore

3. **useNumberInput.ts** - Number input with drag handling
   - Added documentation to useValueCalculation helper hook
   - Added documentation to useDragHandling main hook
   - Documented complex drag behavior (threshold, speed control, shift key)
   - Included detailed @param and @returns documentation
   - Added behavior examples (drag zones, shift key, threshold)

4. **useProcessedEdges.ts** - Edge processing and type resolution
   - Added documentation to ProcessedEdgesOptions interface
   - Added documentation to ProcessedEdgesResult interface
   - Added comprehensive module documentation explaining:
     - Type resolution through Reroute nodes
     - Visual styling based on data types
     - Execution status tracking
     - Performance optimizations
   - Included usage examples

5. **useNamespaceTree.ts** - Namespace tree for node organization
   - Added documentation to NamespaceTree interface
   - Added comprehensive module documentation explaining:
     - Tree structure and organization pattern
     - API key validation and namespace disabling
     - Sorting and first-disabled tracking
   - Included interface example and structure explanation

**Impact**: Improved developer experience and code discoverability. Critical hooks now follow the same documentation standards as existing well-documented stores (NodeStore, WorkflowRunner, GlobalChatStore).

**Files Updated**:
- web/src/hooks/useChatService.ts
- web/src/hooks/useNodeEditorShortcuts.ts
- web/src/hooks/useNumberInput.ts
- web/src/hooks/useProcessedEdges.ts
- web/src/hooks/useNamespaceTree.ts

**Verification**:
- ✅ TypeScript compilation: No errors
- ✅ ESLint: No warnings
- ✅ All documentation follows established JSDoc patterns

**Related Memory**:
- `.memory/insights/code-quality/documentation-best-practices.md` - Documentation standards
- `.memory/issues/documentation/jsdoc-improvements-2026-01-17.md` - Detailed improvements

---

### Hook JSDoc Documentation Improvements (2026-01-18)

**Areas Improved**: Code documentation for critical hooks

**Issues Fixed**: 29 hooks lacked JSDoc documentation across two batches

**Improvements Made**: Added JSDoc documentation to frequently-used hooks:

**Batch 1 (10 hooks)**:
1. `useWorkflowActions.ts` - Workflow creation and navigation handlers
2. `useCollectionDragAndDrop.ts` - File drag-and-drop operations
3. `useSelectionActions.ts` - Node alignment and distribution
4. `useDashboardData.ts` - Workflow and template data loading
5. `useSelectedNodesInfo.ts` - Node information gathering
6. `useNodeFocus.ts` - Keyboard node navigation
7. `useDelayedHover.ts` - Delayed hover behavior
8. `useSelectConnected.ts` - Connected node traversal
9. `useInputMinMax.ts` - Numeric input bounds
10. `useRealtimeAudioStream.ts` - Real-time audio streaming

**Batch 2 (19 hooks)**:
11. `useRecommendedTaskModels.ts` - Task-based model recommendations
12. `useFileDrop.ts` - File drag-and-drop handling
13. `useDropHandler.ts` - Canvas drop event handling
14. `useConnectionEvents.ts` - Edge connection validation
15. `useNodeEvents.ts` - Node event handling
16. `usePaneEvents.ts` - Canvas pane events
17. `useEdgeHandlers.ts` - Edge interaction handlers
18. `useMonacoEditor.ts` - Lazy Monaco editor loading
19. `useSelect.ts` - Select dropdown management
20. `useSurroundWithGroup.ts` - Node grouping

All hooks now include module-level JSDoc with @param, @returns, and @example tags following established documentation patterns.

**Impact**: Improved developer experience with consistent documentation across all hooks. Code examples provide clear usage patterns.

**Files Updated**:
- All 29 hook files listed above

**Verification**:
- ✅ Linting: Passes
- ✅ Documentation follows established JSDoc patterns

---

### Documentation Quality Audit (2026-01-19)

**Areas Improved**: Documentation accuracy and completeness

**Issues Fixed**:
- Removed invalid reference to non-existent `.github/claude-instructions.md` from AGENTS.md
- Fixed incorrect file extension in `web/src/hooks/AGENTS.md` (`useCopyPaste.ts` → `useCopyPaste.tsx`)
- Enhanced `web/README.md` with documentation (38 → 115 lines)

**Verification Results**:
- All npm commands verified against package.json ✅
- Port consistency verified (7777 dev, 8000 prod) ✅
- Linting passes (web, electron) ✅
- Web tests: 3086/3092 pass ✅
- Electron tests: 206/206 pass ✅
- Mobile type checking fails (regression - missing type definitions) ⚠️

**Files Audited**: 23 documentation files across all packages

**Related Memory**:
- `.memory/issues/documentation/documentation-quality-audit-2026-01-19.md`

---

**Note**: This list represents the current state of NodeTool. Check git history and recent PRs for the most up-to-date information on new features.

---

### Documentation Port Consistency Fixes (2026-01-17)
