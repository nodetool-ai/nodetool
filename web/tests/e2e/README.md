# E2E Test Suite Documentation

This directory contains end-to-end tests for the NodeTool web application using Playwright.

## Test Files

### 1. app-loads.spec.ts (Original)
**Tests: 3**
- Basic application loading
- Navigation functionality
- Backend API connectivity

### 2. dashboard.spec.ts (New)
**Tests: 3**
- Dashboard page loading
- Dashboard sections display
- Navigation from dashboard

### 3. assets.spec.ts (New)
**Tests: 5**
- Asset explorer page loading
- Asset interface display
- Empty state handling
- Text file upload
- Image file upload

### 4. auth.spec.ts (New)
**Tests: 4**
- Root redirect behavior (localhost mode)
- Dashboard access
- Login page accessibility
- Protected route handling (editor routes)

### 5. chat.spec.ts (New)
**Tests: 3**
- Chat page loading
- Chat interface elements
- Thread ID navigation

### 6. collections.spec.ts (New)
**Tests: 4**
- Collections page loading
- Collections interface display
- Empty state handling
- Collection creation and file upload via drag and drop

### 7. templates.spec.ts (New)
**Tests: 3**
- Templates page loading
- Templates interface display
- Empty state handling

### 8. models.spec.ts (New)
**Tests: 3**
- Models page loading
- Models interface display
- Navigation to models page

### 9. miniapps.spec.ts (New)
**Tests: 3**
- MiniApps page loading
- MiniApps interface display
- Optional workflow ID parameter handling

### 10. navigation.spec.ts (New)
**Tests: 11**
- All major route navigation (8 routes)
- State maintenance across navigation
- Browser back/forward functionality
- Invalid route handling

### 11. websocket.spec.ts (New)
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

### 12. model-download.spec.ts (New)
**Tests: 3**
- Download a small HuggingFace model successfully
- Connect to download WebSocket endpoint
- Network access to HuggingFace (validates no CI restrictions)

### 13. mock-data.spec.ts (New)
**Tests: 20**
- Mock server data loading tests (uses `--mock` flag)
- Chat threads API integration
- Workflows API integration
- Assets API integration
- Models API integration
- Providers API integration
- Cross-feature integration tests

## Total Test Coverage

- **Total Files:** 13
- **Total Tests:** 69
- **Original Tests:** 3
- **New Tests:** 66

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
- ✅ Mock data loading (chat threads, workflows, assets, models, providers)

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
- Workflow creation and editing (node operations)
- Asset upload and management
- Form submissions
- Real chat interactions
- User settings
- Keyboard shortcuts
- Mobile responsive behavior
