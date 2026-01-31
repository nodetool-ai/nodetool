# E2E Test Suite Documentation

This directory contains end-to-end tests for the NodeTool web application using Playwright.

## Test Organization

### Standard Tests (With Real Backend)

Tests that require a running backend server to test full integration:

### Tests with Mock Data Support

Tests enhanced with mock data capabilities for faster, more reliable testing:

#### chat.spec.ts
**Tests: 9** (3 original + 6 with mocks)
- Chat page loading and interface
- Mocked thread and message display
- Chat with tool calls
- Thread navigation

#### models.spec.ts  
**Tests: 14** (3 original + 5 with mocks + 6 API integration)
- Models page loading and interface
- Mocked HuggingFace model display
- Model type filtering
- Recommended models and providers
- API integration tests

#### templates.spec.ts
**Tests: 13** (8 original + 5 with mocks)
- Templates page loading and interface
- Mocked template workflow display
- Template categorization
- Workflow graph validation
- API integration and search tests

#### mock-data.spec.ts
**Tests: 17** (new)
- Mock data fixture validation
- Mock API route setup verification
- Content validation for all mock data types
- Integration scenario testing

### Other Test Files

#### 1. app-loads.spec.ts
**Tests: 3**
- Basic application loading
- Navigation functionality
- Backend API connectivity

### 2. dashboard.spec.ts
**Tests: 3**
- Dashboard page loading
- Dashboard sections display
- Navigation from dashboard

### 3. assets.spec.ts
**Tests: 5**
- Asset explorer page loading
- Asset interface display
- Empty state handling
- File uploads (text and image)

### 4. auth.spec.ts
**Tests: 4**
- Root redirect behavior
- Dashboard access
- Login page accessibility
- Protected route handling (editor routes)

### 5. chat.spec.ts
**Tests: 3**
- Chat page loading
- Chat interface elements
- Thread ID navigation

### 6. collections.spec.ts
**Tests: 4**
- Collections page loading
- Collections interface display
- Empty state handling
- Collection creation with drag and drop

### 7. templates.spec.ts
**Tests: 3**
- Templates page loading
- Templates interface display
- Empty state handling

### 8. models.spec.ts
**Tests: 3**
- Models page loading
- Models interface display
- Navigation to models page

### 9. miniapps.spec.ts
**Tests: 3**
- MiniApps page loading
- MiniApps interface display
- Optional workflow ID parameter handling

### 10. navigation.spec.ts
**Tests: 11**
- All major route navigation
- State maintenance across navigation
- Browser back/forward functionality
- Invalid route handling

### 11. websocket.spec.ts
**Tests: 10**
- WebSocket connection establishment
- Unified /ws endpoint usage
- Connection status display
- Thread creation via WebSocket
- Connection persistence

### 12. model-download.spec.ts
**Tests: 3**
- HuggingFace model download
- Download WebSocket endpoint
- Network access validation

## Mock Data System

The test suite includes a comprehensive mock data system for testing without a backend server.

### Features
- ✅ Prepopulated workflows with realistic node graphs
- ✅ Chat threads and messages with tool calls
- ✅ Model metadata (HuggingFace, providers, recommendations)
- ✅ Template workflows for example use cases
- ✅ Easy-to-use mock API route utilities

### Quick Start

```typescript
import { setupMockApiRoutes } from "./fixtures/mockData";

test.describe("Feature with Mocks", () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApiRoutes(page);
  });

  test("should work with mocked data", async ({ page }) => {
    await page.goto("/models");
    // Test with mocked model data
  });
});
```

### Documentation
- **[Mock Data Guide](./fixtures/README.md)** - Complete guide to using mock data
- **Mock Data Files**: `tests/e2e/fixtures/*.json`
- **Mock Utilities**: `tests/e2e/fixtures/mockData.ts`

### Benefits
- 🚀 **Faster**: No backend server needed for UI tests
- 🎯 **Reliable**: Deterministic data eliminates flaky tests
- 🔧 **Flexible**: Easy to test edge cases and error scenarios

### 13. mock-data.spec.ts (New)
**Tests: 20**
- Mock server data loading tests (uses `--mock` flag)
- Chat threads API integration
- Workflows API integration
- Assets API integration
- Models API integration
- Providers API integration
- Cross-feature integration tests

### 13. workflow-editor.spec.ts (New)
**Tests: 10**
- Workflow creation via API and opening in editor
- Editor toolbar and controls display
- Workflow save action handling
- Canvas panning functionality
- Zoom controls support
- Node menu opening via right-click
- Node menu opening via keyboard shortcut
- Workflow data fetching on load
- Handling non-existent workflows gracefully

### 14. search.spec.ts (New)
**Tests: 12**
- Template search input presence
- Template filtering when searching
- Search results clearing
- Asset search functionality
- Asset search API handling
- Command palette search support
- Node search in editor
- Keyboard navigation in search results
- Search focus keyboard shortcuts
- Valid search results from templates API
- Empty search query handling
- Special characters in search handling
- Search performance (response time)

### 15. keyboard-shortcuts.spec.ts (New)
**Tests: 16**
- Escape key to close dialogs
- Meta+K for command palette
- Undo shortcut (Cmd/Ctrl+Z)
- Redo shortcut (Cmd/Ctrl+Shift+Z)
- Select all shortcut (Cmd/Ctrl+A)
- Copy/paste shortcuts
- Delete shortcut
- Fit to screen shortcut
- Navigation shortcuts
- Chat Enter to send message
- Chat Shift+Enter for new line
- Modal closing with Escape
- Zoom in (Cmd/Ctrl++)
- Zoom out (Cmd/Ctrl+-)
- Reset zoom (Cmd/Ctrl+0)

### 16. settings.spec.ts (New)
**Tests: 16**
- Settings panel access from dashboard
- Settings display in sidebar/header
- Dark/light mode support
- Theme preference persistence
- LocalStorage settings save
- Settings restoration on page reload
- Panel layout persistence
- Panel resize handling
- Editor view state persistence
- Selected model persistence
- Model settings in chat interface
- API key configuration option
- Workflow organization support
- Open workflows persistence
- Current workflow persistence
- Agent mode preference persistence
- Selected tools persistence
- LocalStorage clearing handling

### 17. responsive.spec.ts (New)
**Tests: 24**
- Dashboard display on desktop
- Dashboard display on laptop
- Dashboard display on tablet
- Dashboard display on mobile
- Dashboard display on mobile landscape
- Chat interface adaptation for mobile
- Chat input on tablet
- Templates grid layout adaptation
- Asset grid adaptation for mobile
- Asset functionality on tablet
- Model list adaptation for mobile
- Model cards on tablet
- Navigation adaptation for mobile
- Sidebar on desktop
- Viewport resize handling
- State maintenance during resize
- Touch-friendly element sizing
- Mobile scrolling behavior
- Horizontal scroll handling
- Editor responsiveness on smaller screens
- Portrait to landscape orientation changes
- Tablet orientation changes
- Content overflow handling

### 18. node-operations.spec.ts (New)
**Tests: 28**
- Node selection (single, multi-select with Cmd/Ctrl+click)
- Clear selection on canvas click
- Node deletion with Delete key
- Node deletion with Backspace key
- Delete multiple selected nodes
- Drag node to new position
- Drag multiple selected nodes together
- Node duplication with Cmd/Ctrl+D
- Node context menu on right-click
- Select all nodes with Cmd/Ctrl+A
- Edge creation between nodes
- Display existing edges
- Delete edge on click and delete
- Node grouping operations
- Bulk delete on multiple nodes
- Copy-paste of nodes

### 19. drag-drop.spec.ts (New)
**Tests: 22**
- Drag canvas with middle mouse button
- Drag canvas with spacebar + mouse
- Drag node to reposition
- Snap node to grid during drag
- Prevent node drag outside canvas bounds
- Create edge by dragging from handle
- Show edge path preview during drag
- Validate handle compatibility
- Create selection box by dragging on canvas
- Select multiple nodes with selection box
- Handle file drop on canvas
- Prevent dropping invalid files
- Open node palette
- Handle drag from node palette to canvas
- Support touch drag on nodes (mobile)
- Support pinch-to-zoom on canvas (mobile)

### 20. tabs.spec.ts (New)
**Tests: 24**
- Open workflow in new tab
- Handle multiple workflow tabs via navigation
- Open workflow in same tab by default
- Switch between workflows via browser navigation
- Maintain workflow state when switching tabs
- Preserve zoom level when switching workflows
- Preserve canvas position when switching workflows
- Handle unsaved changes when switching workflows
- Track active workflow ID
- Handle rapid tab switching
- Handle opening multiple workflows sequentially
- Cleanup resources when leaving workflow
- Don't interfere with workflow execution state
- Respect workflow-specific shortcuts
- Handle undo/redo across workflow switches
- Handle workflow not found in one tab
- Recover from failed workflow load
- Handle network errors during tab switch
- Maintain browser history for tab navigation
- Support forward navigation
- Isolate workflow changes between tabs
- Don't share selection state between workflows

### 21. error-handling.spec.ts (New)
**Tests: 21**
- Invalid workflow ID handling
- Invalid route handling
- Navigation recovery from bad URLs
- Deep invalid route handling
- Failed API request handling
- Slow API response handling
- 404 API response handling
- 500 API response handling
- Malformed JSON response handling
- Empty form submission handling
- State recovery after page refresh
- localStorage corruption handling
- Cleared localStorage handling
- Fallback UI on component error
- Navigation after error
- Navigation history preservation after error
- Multiple failed request handling
- Request timeout handling
- Chat with invalid thread ID
- WebSocket connection failure
- Editor with invalid/missing data

### 22. workflow-execution.spec.ts (New)
**Tests: 25**
- Run button display in editor
- Stop/cancel button visibility
- Execution status area display
- Run button click handling
- Keyboard shortcut for run
- Empty workflow execution
- Execution progress tracking
- Node execution state display
- Job status after execution
- Output preview after execution
- Execution error handling
- Jobs API list fetch
- Job cancellation request
- WebSocket connection for execution
- Real-time execution updates
- Execution queue status display
- Multiple execution request handling
- Execution history access
- Mini app execution view
- Mini app with workflow ID
- Standalone mini app route

### 23. help-documentation.spec.ts (New)
**Tests: 24**
- Help menu access from dashboard
- Help icon in editor
- Keyboard shortcut for help
- Node info on hover
- Node details in inspector panel
- Node type documentation
- Button tooltips
- Node handle tooltips
- Property tooltips in inspector
- Node metadata API fetch
- Node metadata structure validation
- Version information display
- Settings/about section
- Clear error messages
- Actionable form error feedback
- First-time user experience
- Templates for learning
- Easy navigation to examples
- Keyboard shortcuts documentation
- Available shortcuts in editor
- External documentation links
- Community/support links
- Contextual help in node menu
- Help for node properties
- Model recommendation info

### 24. workflow-import-export.spec.ts (New)
**Tests: 22**
- Export option in editor
- Export via keyboard shortcut
- Copy workflow JSON to clipboard
- Import option in dashboard/editor
- Import via file input
- Paste workflow from clipboard
- Fetch workflow data from API
- Create workflow via API (import)
- Update workflow via API
- Template loading from templates page
- Navigation from template to editor
- Workflow creation from template
- Workflow duplication
- Duplicate via keyboard shortcut
- Workflow versions API fetch
- Version history display in editor
- Share option for workflow
- Workflow access level update
- Workflow structure validation on import
- Corrupted workflow data handling
- Cross-browser compatible export format

## Total Test Coverage

- **Total Files:** 24
- **Total Tests:** 276
- **Original Tests:** 184
- **New Tests in this PR:** 92 (21 + 25 + 24 + 22)

## Test Coverage Areas

### Core Features Tested
- ✅ Application loading and initialization
- ✅ Authentication and protected routes
- ✅ Dashboard
- ✅ Asset management
- ✅ Collections
- ✅ Templates/Examples with mock data
- ✅ Chat interface with mock threads and messages
- ✅ MiniApps
- ✅ Model management with mock model data
- ✅ Model downloads
- ✅ Navigation and routing
- ✅ Browser history navigation
- ✅ Backend API connectivity
- ✅ WebSocket integration (unified /ws endpoint)
- ✅ Workflow editor (canvas, nodes, zoom, pan)
- ✅ Search functionality (templates, assets, nodes)
- ✅ Keyboard shortcuts (editor, chat, navigation)
- ✅ Settings and preferences (localStorage, theme)
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ **NEW: Advanced node operations** (selection, deletion, dragging, duplication, grouping)
- ✅ **NEW: Drag-and-drop interactions** (canvas drag, node drag, edge creation, selection box, file drop)
- ✅ **NEW: Multi-tab workflow editing** (tab switching, state preservation, error handling)
- ✅ **NEW: Error handling and recovery** (invalid routes, API errors, network issues, corrupted data)
- ✅ **NEW: Workflow execution** (run, cancel, status tracking, jobs API, WebSocket events)
- ✅ **NEW: Help and documentation** (tooltips, node info, API metadata, contextual help)
- ✅ **NEW: Workflow import/export** (export, import, templates, duplication, versioning, sharing)

### Test Patterns Used

1. **Page Load Verification**
   - URL matching
   - Network idle state
   - Error-free loading

2. **Content Display**
   - Element presence
   - Non-empty content
   - Interface rendering

3. **Navigation**
   - Route transitions
   - State preservation
   - Back/forward functionality

4. **Error Handling**
   - Empty states
   - Invalid routes
   - Server error detection

5. **API Integration**
   - Direct API calls with Playwright request context
   - Response validation
   - Error response handling

6. **Keyboard Interactions**
   - Shortcut testing
   - Focus management
   - Modal handling

7. **Responsive Testing**
   - Multiple viewport sizes
   - Orientation changes
   - Touch target validation

## Running the Tests

### All Tests
```bash
npm run test:e2e
```

### Specific Test File
```bash
npx playwright test chat.spec.ts          # Chat tests with mocks
npx playwright test models.spec.ts        # Model tests with mocks
npx playwright test templates.spec.ts     # Template tests with mocks
npx playwright test mock-data.spec.ts     # Mock data validation
```

### Run Only Mock Data Tests
```bash
npx playwright test mock-data.spec.ts chat.spec.ts models.spec.ts templates.spec.ts
```

### With UI Mode (Recommended for Development)
```bash
npm run test:e2e:ui
```

### In Headed Mode (See Browser)
```bash
npm run test:e2e:headed
```

### Debug Mode
```bash
npx playwright test --debug
```

### Run Tests Without Backend (Mock Only)

To run tests using only mock data (no backend required):

```bash
# Set environment variable to skip backend startup
E2E_START_BACKEND=false npm run test:e2e
```

Note: Only tests using `setupMockApiRoutes` will work without a backend.

## Test Structure

Each test file follows this pattern:

```typescript
import { test, expect } from "@playwright/test";

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Feature Name", () => {
    test("should do something", async ({ page }) => {
      // Test implementation
    });
  });
}
```

## Best Practices Followed

1. **Independent Tests**: Each test can run independently
2. **Proper Waits**: Using `waitForLoadState("networkidle")`
3. **URL Assertions**: Using regex patterns for flexibility
4. **Error Detection**: Checking for server errors
5. **Timeout Handling**: Using appropriate timeouts for async operations
6. **Clean Code**: Following TypeScript and Playwright best practices
7. **Resource Cleanup**: Deleting test data after tests complete
8. **API Testing**: Using Playwright's request context for API validation

## CI/CD Integration

These tests run automatically in GitHub Actions:
- On push to `main` branch (when web files change)
- On pull requests to `main` branch (when web files change)

The CI workflow starts the nodetool server with the `--mock` flag, which creates dummy data for:
- Chat threads
- Workflows
- Assets
- Models
- Providers

This allows tests to verify data loading and display without requiring external services or real user data.

See `.github/workflows/e2e.yml` for CI configuration.

## Mock Server

The e2e tests use the nodetool server's `--mock` flag to generate consistent test data.

### Starting the Mock Server Locally

```bash
# Start the server with mock data
conda run -n nodetool nodetool serve --port 7777 --mock
```

### Mock Data Available

When running with `--mock`, the server provides:
- **Chat Threads**: Pre-populated conversation threads
- **Workflows**: Example workflows with nodes and connections
- **Assets**: Sample assets (images, text files, etc.)
- **Models**: Mock model configurations
- **Providers**: Mock AI provider configurations

## Future Enhancements

Potential areas for additional tests:
- Real chat interactions with AI responses
- ~~Workflow execution and result validation~~ ✅ **Completed**
- ~~Complex node operations (grouping, connections)~~ ✅ **Completed**
- ~~Drag-and-drop node creation~~ ✅ **Completed**
- ~~Multi-tab workflow editing~~ ✅ **Completed**
- ~~Error handling and recovery~~ ✅ **Completed**
- ~~Help and documentation access~~ ✅ **Completed**
- ~~Workflow import/export~~ ✅ **Completed**
- Real-time collaboration features
- Performance benchmarking
- Additional file system operations
- Native menu integration testing
- Advanced clipboard operations
