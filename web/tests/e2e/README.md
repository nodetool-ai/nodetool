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
**Tests: 3**
- Asset explorer page loading
- Asset interface display
- Empty state handling

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

## Total Test Coverage

- **Total Files:** 10
- **Total Tests:** 40
- **Original Tests:** 3
- **New Tests:** 37

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
- ✅ Navigation and routing
- ✅ Browser history navigation
- ✅ Backend API connectivity

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

See `.github/workflows/e2e.yml` for CI configuration.

## Future Enhancements

Potential areas for additional tests:
- Workflow creation and editing (node operations)
- Asset upload and management
- Form submissions
- Real chat interactions
- Model downloads
- User settings
- Keyboard shortcuts
- Mobile responsive behavior
