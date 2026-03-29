# E2E Test Fixture Data

This directory contains fixture data files used as reference data in tests.

> **Note**: E2E Playwright tests use the **real backend server** for all API calls.
> API mocking via `setupMockApiRoutes` is not used in e2e tests.
> The JSON fixture files are kept for reference and may be used in unit tests.

## File Structure

```
tests/e2e/fixtures/
├── workflows.json      # Sample workflows with nodes and edges
├── threads.json        # Chat threads
├── messages.json       # Messages for each thread
├── models.json         # Model metadata (HuggingFace, providers, etc.)
├── templates.json      # Example workflow templates
├── mockData.ts         # Data loaders (kept for reference, not used in e2e)
└── test-document.txt   # Test document for file upload tests
```

## Fixture Data Contents

### Workflows (`workflows.json`)

Contains 3 sample workflows with nodes and edges.

### Threads & Messages (`threads.json`, `messages.json`)

Contains sample chat threads with corresponding messages.

### Models (`models.json`)

Contains model metadata for HuggingFace models, providers, and recommendations.

### Templates (`templates.json`)

Contains example workflow templates.

## Usage in Tests

E2E tests connect to the real backend server. To create test data, use
Playwright's `request` fixture to create resources via the API:

```typescript
import { BACKEND_API_URL } from "../support/backend";

test.beforeAll(async ({ request }) => {
  const res = await request.post(`${BACKEND_API_URL}/workflows/`, {
    data: { name: "test-workflow", access: "private" },
  });
  const workflow = await res.json();
  workflowId = workflow.id;
});

test.afterAll(async ({ request }) => {
  await request.delete(`${BACKEND_API_URL}/workflows/${workflowId}`).catch(() => {});
});
```

## Testing Error Scenarios

Use `page.route()` only for testing specific error conditions:

```typescript
test("should handle 500 API responses", async ({ page }) => {
  await page.route("**/api/workflows/**", (route) => {
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Internal server error" })
    });
  });

  await page.goto("/dashboard");
  // Assert error handling
});
```
