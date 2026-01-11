# NodeTool Feature List

This document lists all existing features in NodeTool to help OpenCode agents avoid creating redundant functionality. **Always read this file before planning new features.**

Last updated: 2026-01-10

---

## Core Application Features

### Workflow Editor
- **Visual Node Editor**: Drag-and-drop interface using ReactFlow for creating AI workflows
- **Node Connection**: Visual edge connections between node inputs/outputs with validation
- **Undo/Redo**: Temporal middleware for undo/redo operations in workflows
- **Auto-Layout**: Automatic node positioning algorithms for cleaner workflows
- **Zoom & Pan**: Navigation controls for large workflows
- **Minimap**: Overview minimap for workflow navigation
- **Multi-Select**: Select and manipulate multiple nodes simultaneously
- **Copy/Paste**: Copy and paste nodes within and across workflows
- **Find in Workflow**: Search for nodes by name, type, or properties
- **Node Placement**: Smart node placement with collision avoidance

### Node Management
- **Node Menu**: Categorized browser for all available node types with search
- **Node Search**: Fuzzy search for finding nodes by name/description (Fuse.js)
- **Node Properties**: Property editors for different data types (text, number, color, date, etc.)
- **Node Inspector**: Inspect node inputs, outputs, and execution results
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
- **Keyboard Shortcuts**: Configurable keyboard shortcuts system
- **Close Button**: Consistent close button component
- **Delete Button**: Consistent delete button component

### Panels & Layout
- **Left Panel**: Collapsible left sidebar with node menu
- **Right Panel**: Collapsible right sidebar with properties
- **Bottom Panel**: Collapsible bottom panel for logs and results
- **Panel Resizing**: Adjustable panel dimensions
- **Layout Persistence**: Remember panel states across sessions
- **Title Bar**: Custom title bar for Electron app
- **Statistics Panel**: Real-time workflow statistics (node count, complexity, connectivity)

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
- **Virtualization Ready**: Structure supports virtualized lists (not yet implemented)

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

- **Virtualized Lists**: Large list virtualization for performance
- **Offline Mode**: Full offline workflow editing and execution
- **Collaborative Editing**: Real-time multi-user editing
- **Workflow Versioning UI**: Visual diff and merge for workflow versions
- **Advanced Analytics**: Workflow performance analytics and profiling
- **Plugin System**: Third-party plugin architecture
- **Custom Node Types**: User-defined custom node types via UI
- **Workflow Marketplace**: Share and discover community workflows
- **Integration Testing E2E**: More comprehensive E2E test coverage
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
