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

#### 2. dashboard.spec.ts
**Tests: 3**
- Dashboard page loading
- Dashboard sections display
- Navigation from dashboard

#### 3. assets.spec.ts
**Tests: 5**
- Asset explorer page loading
- Asset interface display
- Empty state handling
- File uploads (text and image)

#### 4. auth.spec.ts
**Tests: 4**
- Root redirect behavior
- Dashboard access
- Login page accessibility
- Protected route handling

#### 5. collections.spec.ts
**Tests: 4**
- Collections page loading
- Collections interface display
- Empty state handling
- Collection creation with drag and drop

#### 6. miniapps.spec.ts
**Tests: 3**
- MiniApps page loading
- MiniApps interface display
- Optional workflow ID parameter handling

#### 7. navigation.spec.ts
**Tests: 11**
- All major route navigation
- State maintenance across navigation
- Browser back/forward functionality
- Invalid route handling

#### 8. websocket.spec.ts
**Tests: 10**
- WebSocket connection establishment
- Unified /ws endpoint usage
- Connection status display
- Thread creation via WebSocket
- Connection persistence

#### 9. model-download.spec.ts
### 12. model-download.spec.ts (New)
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

## Total Test Coverage

- **Total Files**: 17 (including mock-data.spec.ts)
- **Total Tests**: ~70+ (varies based on API integration tests)
- **Tests with Mock Support**: 53 tests across 4 files
- **Mock Data Fixtures**: 5 JSON files with realistic data

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
- ✅ Mock data fixtures and validation

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

5. **Mock Data Testing** (NEW)
   - Mocked API responses
   - Deterministic test data
   - Edge case scenarios
   - Fast UI tests without backend

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
