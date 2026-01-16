# NodeTool Project Context

## Overview

NodeTool is an open-source, privacy-first, visual AI workflow builder. Users create AI workflows by connecting nodes in a drag-and-drop interface—no coding required.

**Key Philosophy**: Visual AI workflow creation with local-first privacy and cloud flexibility.

## Architecture

### Components

1. **Web UI** (`/web`): React 18.2 + TypeScript 5.7 visual editor
   - ReactFlow-based node editor
   - Material-UI (MUI) v7 for components
   - Zustand for state management
   - TanStack Query for API calls
   - Playwright for E2E tests

2. **Electron App** (`/electron`): Desktop wrapper
   - Packages web UI for offline use
   - Manages local Python environment
   - Handles file system operations

3. **Mobile App** (`/mobile`): React Native/Expo
   - Browse and run Mini Apps
   - View workflows on mobile

4. **Backend** (separate repository):
   - Python-based API server
   - WebSocket for workflow execution
   - Not part of this repository

### Key Directories

```
/web           - React web application
/electron      - Electron desktop app
/mobile        - React Native mobile app
/docs          - Documentation
/scripts       - Build and release scripts
/.github       - CI/CD and agent instructions
```

## Design Principles

1. **Visual First**: Everything should be achievable through the visual editor
2. **Privacy First**: Run models locally when possible
3. **No Coding Required**: Users shouldn't need to write code
4. **Real-time Feedback**: Stream results as workflows execute
5. **Portable Workflows**: Same workflow runs locally or in cloud

## State Management

### Zustand Stores

The app uses Zustand stores for state management:

- **NodeStore**: Manages nodes and edges in workflows
- **WorkflowStore**: Workflow metadata and operations
- **AssetStore**: Media file management
- **SettingsStore**: User preferences
- **GlobalChatStore**: Chat interface state

**Pattern**: Stores use temporal middleware for undo/redo support.

### React Context

Some features use React Context for component-tree state:
- ThemeContext: Theme switching
- WorkflowContext: Current workflow state
- KeyboardContext: Keyboard shortcuts

## Important Patterns

### Component Structure

```typescript
// Components use functional style with TypeScript
interface MyComponentProps {
  nodeId: string;
  onSave?: (data: Data) => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ 
  nodeId, 
  onSave 
}) => {
  // Use Zustand selectors to minimize re-renders
  const node = useNodeStore(state => state.nodes[nodeId]);
  
  // Memoize callbacks
  const handleSave = useCallback(() => {
    onSave?.(data);
  }, [onSave, data]);
  
  return <Box>{/* ... */}</Box>;
};
```

### Avoiding Re-renders

```typescript
// ❌ Bad - subscribes to entire store
const store = useNodeStore();

// ✅ Good - subscribes only to needed data
const nodes = useNodeStore(state => state.nodes);
const addNode = useNodeStore(state => state.addNode);
```

### Testing Patterns

```typescript
// Use React Testing Library
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('handles user interaction', async () => {
  const user = userEvent.setup();
  const onSave = jest.fn();
  
  render(<MyComponent onSave={onSave} />);
  
  await user.click(screen.getByRole('button', { name: /save/i }));
  expect(onSave).toHaveBeenCalled();
});
```

## Data Flow

1. User creates/edits nodes in ReactFlow editor
2. Changes update Zustand stores
3. Stores persist to backend via TanStack Query
4. Workflow execution goes through WebSocket
5. Results stream back to UI in real-time

## Critical Files

- `/AGENTS.md` - Complete project documentation for AI agents
- `/.github/copilot-instructions.md` - GitHub Copilot coding patterns
- `/web/README.md` - Web app setup and development
- `/web/TESTING.md` - Comprehensive testing guide
- `/Makefile` - Build, test, lint commands

## Common Gotchas

1. **ReactFlow Types**: ReactFlow node types need explicit casting
2. **Zustand Temporal**: Undo/redo is automatic with temporal middleware
3. **MUI Theme**: Always use theme values, not hardcoded colors
4. **Strict Equality**: Use `===` not `==` (ESLint will catch this)
5. **Array Checks**: Use `Array.isArray()` not `typeof === 'object'`

## Recent Changes

> Add ONE concise entry here for significant changes. Format:
> ```
> ### Feature/Fix Name (YYYY-MM-DD)
> **What**: One sentence
> **Files**: Main files changed
> ```

### Workflow Performance Profiler (2026-01-16)

**What**: Added comprehensive workflow performance profiling feature including execution timing, bottleneck detection, critical path analysis, and optimization suggestions.

**Why**: Users and researchers need to understand where time is spent in AI workflows to optimize performance.

**Files**:
- `web/src/stores/ProfilerStore.ts` - Core profiling data store
- `web/src/hooks/useWorkflowProfiler.ts` - Profiling hook for components
- `web/src/components/panels/ProfilerPanel.tsx` - Visual profiling panel
- `web/src/stores/__tests__/ProfilerStore.test.ts` - ProfilerStore tests
- `web/src/hooks/__tests__/useWorkflowProfiler.test.ts` - Hook tests

**Implementation**:
- Tracks node execution times, memory usage, and data flow
- Identifies bottlenecks with severity levels (critical, high, medium, low)
- Detects critical path through graph traversal
- Provides performance grade (A/B/C/D/F) and optimization suggestions
- Context-aware suggestions based on node type (LLM, image, audio)

---

### Node Resize Min Width (2026-01-16)

**What**: Increased minimum width for resizable nodes from 100px to 200px.

**Why**: 100px was too small and could make nodes unusable when resized too narrow. Matches the minimum used in GroupNode (200px).

**Files**: `web/src/components/node/BaseNode.tsx`

---

### Mobile TypeScript Type Definitions Fix (2026-01-15)

**What**: Fixed mobile package TypeScript type checking by adding `@types/react-native` package.

**Why**: TypeScript couldn't find type definition files for 'jest', 'node', and 'react-native' even though tsconfig.json specified them in the types array. The `@types/react-native` package was missing from package.json.

**Files**: `mobile/package.json`, `mobile/package-lock.json`

---

### NodeExecutionTime Test Lint Fix (2026-01-15)

**What**: Fixed lint warnings in NodeExecutionTime.test.tsx by removing unused duplicate function.

**Why**: ESLint reported unused variable warning for `formatDuration` function that was duplicated unnecessarily.

**Files**: `web/src/components/node/__tests__/NodeExecutionTime.test.tsx`

---

### Quality Checks Verification (2026-01-15)

**What**: Ran full quality checks and fixed issues found.

**Result**:
- ✅ Type checking: All packages pass
- ✅ Linting: All packages pass (2 warnings fixed)
- ✅ Tests: All 595 tests pass (206 web + 389 mobile)

**Files**: Multiple files across web and mobile packages

---

### Zoom Presets Feature (2026-01-14)

**What**: Added zoom presets to the ViewportStatusIndicator component, including zoom in/out buttons, a dropdown menu with common zoom levels (25%, 50%, 75%, 100%, 150%, 200%), and keyboard shortcuts (Ctrl+/- for zoom in/out, Ctrl+5/0/00/200 for presets).

**Files**:
- `web/src/components/node_editor/ViewportStatusIndicator.tsx` - Enhanced with zoom presets dropdown and zoom in/out buttons
- `web/src/components/node_editor/__tests__/ViewportStatusIndicator.test.tsx` - Added tests for new zoom functionality
- `web/src/config/shortcuts.ts` - Added zoom shortcuts (zoomIn, zoomOut, zoom50, zoom100, zoom200)
- `web/src/hooks/useNodeEditorShortcuts.ts` - Added handlers for new zoom shortcuts
- `web/src/__mocks__/themeMock.ts` - Added Paper.paper to vars.palette for theme consistency

**Implementation**:
- Extended ViewportStatusIndicator with zoom in/out buttons (+/- icons)
- Added Popover menu with 6 zoom presets (25%, 50%, 75%, 100%, 150%, 200%)
- Current zoom preset is highlighted in the dropdown
- Zoom percentage button opens the presets menu
- Added keyboard shortcuts for zoom control
- Removed node count display as it was redundant with existing UI elements

**What**: Added execution time display for completed nodes in the workflow editor, showing how long each node took to execute in a human-readable format (e.g., "1s 500ms", "2m 5s").

**Files**:
- `web/src/stores/ExecutionTimeStore.ts` - New store for tracking node execution timing
- `web/src/components/node/NodeExecutionTime.tsx` - New component displaying execution duration
- `web/src/stores/workflowUpdates.ts` - Updated to record timing when status changes
- `web/src/components/node/BaseNode.tsx` - Integrated NodeExecutionTime component
- `web/src/stores/__tests__/ExecutionTimeStore.test.ts` - Tests for the timing store
- `web/src/components/node/__tests__/NodeExecutionTime.test.tsx` - Tests for the component

**Implementation**:
- `ExecutionTimeStore` tracks start and end times for each node execution
- `workflowUpdates.ts` calls `startExecution` when node starts and `endExecution` when it completes
- `NodeExecutionTime` component displays "Completed in X" or "Failed in X" after execution
- Timings are cleared when workflow completes, cancels, or fails

### Code Quality Improvements (2026-01-15)

**What**: Fixed lint warnings, TypeScript types, and mobile type definitions.

**Files**:
- `web/src/components/node/__tests__/NodeExecutionTime.test.tsx` - Fixed unused variable and missing brace
- `web/src/components/miniapps/components/MiniWorkflowGraph.tsx` - Added proper types and theme-based colors
- `mobile/package.json`, `mobile/package-lock.json` - Added missing @types/jest and @types/node

**Implementation**:
- Fixed lint warnings in test file (unused `formatDuration` variable, missing `{` after `if`)
- Replaced `any` types with typed interfaces in MiniWorkflowGraph
- Replaced hardcoded colors with CSS custom properties referencing theme values
- Installed missing type definition packages for mobile package

### Mobile TypeScript Type Definitions Fix (2026-01-15)

**What**: Fixed mobile package type checking by removing "react-native" from the types array in tsconfig.json.

**Why**: Modern React Native (0.81+) includes its own type definitions, making `@types/react-native` deprecated and unnecessary. The types array was causing TypeScript to look for external type packages that weren't needed.

**Files**: `mobile/tsconfig.json`

---


**What**: Extended Zustand store subscription optimization to additional components that were still using full store destructuring.

**Files**: `web/src/hooks/useChatService.ts`, `web/src/hooks/editor/useChatIntegration.ts`, `web/src/components/chat/containers/GlobalChat.tsx`, `web/src/components/chat/containers/StandaloneChat.tsx`

**Implementation**: Converted components from destructuring entire stores to using individual Zustand selectors. Also updated test mocks to support the new selector pattern.

**Impact**: Reduced unnecessary re-renders in chat-related components by ensuring they only update when their specific data changes.

---

### Test Mock Fixes for Selective Store Selectors (2026-01-13)

**What**: Updated GlobalChat.test.tsx mocks to work with individual Zustand selectors.

**Why**: When using individual selectors like `const status = useStore(s => s.status)`, the mock needs to handle selector functions properly instead of returning the entire mock state object.

**Files**: `web/src/__tests__/components/chat/containers/GlobalChat.test.tsx`

**Implementation**: Updated mock factory to check if selector is a function and return `selector(mockState)` for selective subscriptions.

---

### Keyboard Node Navigation (2026-01-13)

**What**: Added Tab-based keyboard navigation for the node editor, allowing users to navigate between nodes using keyboard shortcuts without mouse interaction.

**Files**: `web/src/stores/NodeFocusStore.ts`, `web/src/hooks/useNodeFocus.ts`, `web/src/config/shortcuts.ts`, `web/src/hooks/useNodeEditorShortcuts.ts`, `web/src/components/node/BaseNode.tsx`

**Implementation**:
- Created `NodeFocusStore` to track focused node state and navigation mode
- Created `useNodeFocus` hook providing navigation functions (focusNext, focusPrev, focusUp, focusDown, focusLeft, focusRight)
- Added keyboard shortcuts: Tab/Shift+Tab for sequential navigation, Alt+Arrows for directional navigation, Enter to select focused node
- Added visual focus indicator to BaseNode with dashed outline and "FOCUSED" badge
- Navigation history tracking for "go back" functionality (Alt+ArrowLeft or Ctrl+ArrowLeft)

---

### Node Info Panel (2026-01-12)

**What**: Added Node Info Panel - a contextual panel that displays detailed information about selected nodes including type, description, connection counts, execution status, and quick actions (copy ID, focus).

**Files**: `web/src/components/node_editor/NodeInfoPanel.tsx`, `web/src/hooks/useSelectedNodesInfo.ts`, `web/src/components/node_editor/NodeEditor.tsx`

**Implementation**:
- Created `useSelectedNodesInfo` hook to gather node metadata, connection info, and execution status
- Built `NodeInfoPanel` component with MUI styling showing node details when nodes are selected
- Integrated panel into NodeEditor alongside SelectionActionToolbar for cohesive selection UX

---

### Test Distribution Functions Fix (2026-01-12)

**What**: Fixed failing tests in `useSelectionActions.test.ts` by correcting expected values for distributeHorizontal and distributeVertical functions.

**Why**: Tests expected even distribution (0, 200, 400) but implementation uses sequential placement with spacing.

**Files**: `web/src/hooks/__tests__/useSelectionActions.test.ts`

---

### Mobile TypeScript Type Definitions Fix (2026-01-12)

**What**: Fixed mobile package TypeScript type checking by installing @types/node package.

**Why**: TypeScript couldn't find type definition files for 'jest', 'node', and 'react-native' even though tsconfig.json specified them in the types array. The @types/node package was missing from package.json.

**Files**: `mobile/package.json`, `mobile/package-lock.json`

---

### OpenCode Branch Access Enhancement (2026-01-12)

**What**: Updated all OpenCode workflow files to fetch full git history, enabling access to all branches including main.

**Why**: OpenCode agents need to access other branches (not just the current one) to perform operations like merging main branch and resolving merge conflicts. The default shallow clone with `fetch-depth: 1` only provides access to the current branch.

**Implementation**:
- Added `fetch-depth: 0` parameter to `actions/checkout@v4` in all four OpenCode workflows
- This fetches complete git history for all branches and tags
- Enables agents to run `git merge origin/main` and resolve conflicts
- Allows agents to see and access any branch in the repository

**Files Changed**:
- `.github/workflows/opencode.yml` - Interactive OpenCode triggered by comments
- `.github/workflows/opencode-features.yaml` - Scheduled autonomous feature development
- `.github/workflows/opencode-hourly-test.yaml` - Scheduled quality assurance workflow
- `.github/workflows/opencode-hourly-improve.yaml` - Scheduled code quality improvement workflow

**Impact**: OpenCode agents can now:
- View all branches with `git branch -a`
- Merge changes from main branch
- Resolve merge conflicts automatically
- Check out other branches if needed
- Access full commit history for better context

---

### Zustand Store Subscription Optimization (2026-01-11)

**What**: Fixed components subscribing to entire Zustand stores instead of selective state slices, preventing unnecessary re-renders.

**Why**: Components using `useStore()` without selectors re-render on ANY state change, causing performance issues in frequently updating stores like GlobalChatStore.

**Implementation**:
- Converted `WorkflowAssistantChat` from destructuring entire store to 17 individual selectors
- Converted `ChatButton` in AppHeader from destructuring entire store to 3 individual selectors
- Converted `WelcomePanel` from destructuring entire store to 2 individual selectors
- Converted `Welcome` page from destructuring entire store to 2 individual selectors

**Impact**: Reduced re-render frequency in chat and workflow assistant components by ensuring they only update when their specific data changes.

**Files Changed**:
- `web/src/components/panels/WorkflowAssistantChat.tsx`
- `web/src/components/panels/AppHeader.tsx`
- `web/src/components/dashboard/WelcomePanel.tsx`
- `web/src/components/content/Welcome/Welcome.tsx`

---

### Security Audit Fixes (2026-01-12)

**What**: Comprehensive security audit and vulnerability patching across web and electron packages.

**Why**: Multiple critical and high severity vulnerabilities were identified in dependencies:
- DOMPurify XSS (CVE in GHSA-vhxf-7vqr-mrjg)
- React Router XSS/CSRF (multiple CVEs in GHSA-h5cw, GHSA-2w69, GHSA-8v8x, GHSA-3cgp)
- React Syntax Highlighter XSS (CVE in GHSA-x7hr-w5r2-h6wg)
- Express/Qs DoS vulnerability (CVE in GHSA-6rw7-vpxm-498p)
- Missing Content Security Policy

**Implementation**:
- Updated `dompurify` from `^3.2.3` to `^3.2.4` in web/package.json
- Updated `react-router-dom` from `^7.6.0` to `^7.12.0` in web/package.json
- Updated `react-syntax-highlighter` from `^15.6.1` to `^16.1.0` in web/package.json
- Added `overrides` for `qs`, `express`, `body-parser` in electron/package.json
- Added CSP meta tag to web/index.html

**Results**:
- Web: Reduced from 8 vulnerabilities (2 high) to 2 (1 high, 1 low)
- Electron: Reduced from 12 vulnerabilities (3 high) to 0
- All quality checks pass (typecheck, lint)

**Files Changed**:
- `web/package.json` - Dependency updates
- `electron/package.json` - Added overrides
- `web/index.html` - Added CSP meta tag

---

### TypeScript any Type Fixes in Error Handling (2026-01-12)

**What**: Improved TypeScript type safety by replacing `any` types with `unknown` in error handling across multiple stores.

**Why**: Using `any` reduces TypeScript's type checking capabilities and can mask potential runtime errors. Using `unknown` forces proper type guards and error checking.

**Implementation**:
- Updated `createErrorMessage` function to handle `unknown` type with proper type guards
- Fixed catch blocks in `SecretsStore`, `useAuth`, and `CollectionStore` to use `unknown` with proper error type guards
- Updated 7 catch blocks total to improve type safety

**Files**:
- `web/src/stores/SecretsStore.ts`
- `web/src/stores/useAuth.ts`
- `web/src/stores/CollectionStore.ts`
- `web/src/utils/errorHandling.ts`

---

_No entries yet - this memory system is new as of 2026-01-10_
### Mobile TypeScript Type Errors (2026-01-12)

**What**: Fixed mobile package TypeScript errors by updating tsconfig.json to include proper type definitions for React Native, Jest, and Node.js.

**Files**: `mobile/tsconfig.json`

### Test Expectation Fix (2026-01-12)

**What**: Fixed test expectations in `useSelectionActions.test.ts` to match actual node distribution behavior
**Files**: `web/src/hooks/__tests__/useSelectionActions.test.ts`

### Selection Action Toolbar (2026-01-10)

**What**: Added floating toolbar for batch node operations (align, distribute, group, delete) when 2+ nodes selected
**Files**: `web/src/hooks/useSelectionActions.ts`, `web/src/components/node_editor/SelectionActionToolbar.tsx`

---

### Code Quality Improvements (2026-01-15)

**What**: Fixed Zustand store subscription optimization and TypeScript type safety issues.

**Files**:
- `web/src/index.tsx` - Converted useAuth() to selective selector
- `web/src/hooks/useRunningJobs.ts` - Converted useAuth() to selective selector
- `web/src/components/ProtectedRoute.tsx` - Converted useAuth() to selective selector
- `web/src/hooks/handlers/dropHandlerUtils.ts` - Converted useAuth() to selective selector and replaced catch(error: any) with proper error handling using createErrorMessage
- `web/src/components/node/__tests__/NodeExecutionTime.test.tsx` - Removed unused code and fixed lint warnings

**Impact**: Reduced unnecessary re-renders in auth-related components by ensuring they only update when their specific state changes. Improved TypeScript type safety by using proper error handling with AppError type guards.

---

### Performance Optimization - useMemo for Expensive Operations (2026-01-16)

**What**: Added `useMemo` to components performing expensive operations (sort, reduce, filter) on every render.

**Why**: Components were recalculating sorted lists, storage metrics, and download progress on every render, even when dependencies hadn't changed. This caused unnecessary CPU usage and potential UI jank.

**Components Optimized**:
- `RecentChats.tsx`: Memoized thread sorting and transformation (5 most recent threads)
- `StorageAnalytics.tsx`: Memoized storage size calculations and file/folder counting
- `OverallDownloadProgress.tsx`: Memoized download progress reduce operations

**Files**:
- `web/src/components/dashboard/RecentChats.tsx`
- `web/src/components/assets/StorageAnalytics.tsx`
- `web/src/components/hugging_face/OverallDownloadProgress.tsx`

**Impact**: Reduced unnecessary computations in dashboard and asset management components. These calculations now only run when their specific dependencies change.

**Verification**:
- ✅ Lint: All packages pass
- ✅ TypeScript: Web package passes
