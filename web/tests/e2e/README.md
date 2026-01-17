# E2E Test Suite Documentation

This directory contains end-to-end tests for the NodeTool web application using Playwright.

## Test Files

### 1. app-loads.spec.ts (Original)
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
- Text file upload
- Image file upload

### 4. auth.spec.ts
**Tests: 4**
- Root redirect behavior (localhost mode)
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
- Collection creation and file upload via drag and drop

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
- All major route navigation (8 routes)
- State maintenance across navigation
- Browser back/forward functionality
- Invalid route handling

### 11. websocket.spec.ts
**Tests: 10**
- WebSocket connection establishment on chat page
- Unified /ws endpoint usage (not legacy /ws/chat or /ws/predict)
- Connection status display
- Chat interface loading after connection
- Thread creation via WebSocket
- GlobalChatStore WebSocket manager initialization
- Connection persistence during navigation
- Command-wrapped message format
- Connection interruption handling
- Disconnection status display

### 12. model-download.spec.ts
**Tests: 3**
- Download a small HuggingFace model successfully
- Connect to download WebSocket endpoint
- Network access to HuggingFace (validates no CI restrictions)

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

## Total Test Coverage

- **Total Files:** 17
- **Total Tests:** ~110+
- **Original Tests:** 3
- **New Tests:** ~107+

## Test Coverage Areas

### Core Features Tested
- ✅ Application loading and initialization
- ✅ Authentication and protected routes
- ✅ Dashboard
- ✅ Asset management
- ✅ Collections
- ✅ Templates/Examples
- ✅ Chat interface
- ✅ MiniApps
- ✅ Model management
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
npx playwright test dashboard.spec.ts
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

See `.github/workflows/e2e.yml` for CI configuration.

## Future Enhancements

Potential areas for additional tests:
- Real chat interactions with AI responses
- Workflow execution and result validation
- Complex node operations (grouping, connections)
- Drag-and-drop node creation
- Multi-tab workflow editing
- Real-time collaboration features
- Performance benchmarking
