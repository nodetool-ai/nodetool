# E2E Test Mock Data Guide

This guide explains how to use mock data in Playwright e2e tests to create fast, reliable, and deterministic tests without requiring a running backend server.

## Overview

The mock data system provides:
- **Prepopulated workflows** with realistic node graphs
- **Chat threads and messages** including tool calls
- **Model metadata** for HuggingFace, providers, and recommendations
- **Template workflows** for example use cases
- **Easy-to-use utilities** for setting up mock routes

## File Structure

```
tests/e2e/fixtures/
├── workflows.json      # Sample workflows with nodes and edges
├── threads.json        # Chat threads
├── messages.json       # Messages for each thread
├── models.json         # Model metadata (HuggingFace, providers, etc.)
├── templates.json      # Example workflow templates
└── mockData.ts         # Utilities for loading and using mock data
```

## Quick Start

### Basic Usage

```typescript
import { test, expect } from "@playwright/test";
import { setupMockApiRoutes } from "./fixtures/mockData";

test.describe("My Feature with Mocks", () => {
  test.beforeEach(async ({ page }) => {
    // Setup all mock routes before each test
    await setupMockApiRoutes(page);
  });

  test("should load page with mocked data", async ({ page }) => {
    await page.goto("/models");
    await page.waitForLoadState("networkidle");
    
    // Your test assertions here
  });
});
```

### Selective Mocking

If you only want to mock specific APIs:

```typescript
import { setupSelectiveMockRoutes } from "./fixtures/mockData";

test.beforeEach(async ({ page }) => {
  await setupSelectiveMockRoutes(page, {
    mockWorkflows: true,
    mockModels: true,
    mockTemplates: false,  // Use real API for templates
    mockThreads: false,    // Use real API for threads
    mockMessages: false    // Use real API for messages
  });
});
```

### Accessing Mock Data Directly

You can also import and use the mock data in your tests:

```typescript
import { workflows, threads, messages, models, templates } from "./fixtures/mockData";

test("should validate workflow structure", () => {
  expect(workflows.workflows.length).toBeGreaterThan(0);
  expect(workflows.workflows[0]).toHaveProperty("graph");
});
```

## Mock Data Contents

### Workflows (`workflows.json`)

Contains 3 sample workflows:
- **Image Generation Workflow**: Text-to-image with Stable Diffusion
- **Chat Assistant Workflow**: LLM-based chat
- **Simple Text Processing**: Basic text transformation

Each workflow includes:
- Unique ID and metadata
- Graph with nodes and edges
- Node properties and positions
- Timestamp data

### Threads & Messages (`threads.json`, `messages.json`)

Contains 3 chat threads with corresponding messages:
- **Thread 1**: Getting started conversation (includes tool calls)
- **Thread 2**: Image generation questions
- **Thread 3**: Workflow debugging discussion

Messages include:
- User and assistant messages
- Text content
- Tool calls (function calls)
- Timestamps

### Models (`models.json`)

Contains model metadata:
- **HuggingFace models**: 4 models (Stable Diffusion, Llama, Whisper)
- **Recommended models**: Curated list for different use cases
- **Language models**: LLMs for text generation
- **Image models**: Diffusion models
- **Providers**: OpenAI, Anthropic, HuggingFace, Ollama, Replicate

### Templates (`templates.json`)

Contains 5 example workflow templates:
- Text to Image
- Chat with GPT
- Audio Transcription
- Image Analysis
- Text Processing Pipeline

## API Routes Mocked

When using `setupMockApiRoutes`, the following endpoints are mocked:

### Workflows
- `GET /api/workflows` - List workflows
- `GET /api/workflows/{id}` - Get specific workflow
- `GET /api/workflows/examples` - Get template workflows
- `GET /api/workflows/examples/search?query=...` - Search templates

### Threads & Messages
- `GET /api/threads` - List threads
- `GET /api/threads/{id}` - Get specific thread
- `GET /api/threads/{id}/messages` - Get messages for thread

### Models
- `GET /api/models/huggingface` - Get HuggingFace models
- `GET /api/models/recommended` - Get recommended models
- `GET /api/models/recommended/language` - Get recommended language models
- `GET /api/models/recommended/image` - Get recommended image models
- `GET /api/models/providers` - Get model providers

## Advanced Usage

### Custom Mock Responses

You can add custom mock routes in your tests:

```typescript
test("should handle custom mock", async ({ page }) => {
  await page.route("**/api/custom-endpoint", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ custom: "data" })
    });
  });
  
  // Your test code
});
```

### Combining Mocks with Real API

You can use selective mocking to test interactions between mocked and real data:

```typescript
test.beforeEach(async ({ page }) => {
  // Mock static reference data
  await setupSelectiveMockRoutes(page, {
    mockModels: true,
    mockTemplates: true
  });
  // Let user-specific data come from real API
  // (workflows, threads, messages)
});
```

### Testing Error Scenarios

Modify mock responses to test error handling:

```typescript
test("should handle API errors", async ({ page }) => {
  await page.route("**/api/workflows", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Internal Server Error" })
    });
  });
  
  await page.goto("/dashboard");
  // Assert error handling
});
```

## Benefits of Mock Data

### Speed
- No backend server required for basic UI tests
- Tests run much faster without network calls
- Parallel test execution without backend load

### Reliability
- Deterministic data eliminates flaky tests
- No dependency on backend availability
- Consistent test results across environments

### Flexibility
- Easy to test edge cases and error scenarios
- Can modify mock data for specific test needs
- Test UI behavior independent of backend changes

## When to Use Mocks vs Real API

### Use Mocks For:
- UI component behavior tests
- Navigation and routing tests
- Data display and formatting tests
- Error handling and edge cases
- Fast smoke tests

### Use Real API For:
- Integration tests
- End-to-end workflow execution
- WebSocket functionality
- Authentication flows
- File uploads and downloads

## Maintenance

### Adding New Mock Data

1. **Add data to JSON files**: Update the appropriate fixture file
2. **Update mockData.ts**: Add route handlers if needed
3. **Document in README**: Update this file with new data
4. **Add tests**: Create tests using the new mock data

### Keeping Mocks in Sync

Mock data should reflect realistic API responses:
- Review mock data when API schemas change
- Update fixtures when adding new features
- Ensure mock data matches production data structure
- Validate fixtures in tests (see `mock-data.spec.ts`)

## Examples

See the following test files for examples:
- `chat.spec.ts` - Chat interface with mocked threads/messages
- `models.spec.ts` - Model management with mocked model data
- `templates.spec.ts` - Template workflows with mocked examples
- `mock-data.spec.ts` - Comprehensive mock data validation

## Troubleshooting

### Mocks Not Working

If mocks aren't being used:
1. Check that `setupMockApiRoutes` is called in `beforeEach`
2. Verify the API URL pattern matches in route handler
3. Check browser console for route errors
4. Use `page.on("response", ...)` to debug API calls

### TypeScript Errors

If you get JSON import errors:
- Ensure `tsconfig.e2e.json` has `"resolveJsonModule": true`
- Verify JSON files are valid (use JSON linter)
- Check file paths in imports

### Mock Data Structure Issues

If tests fail with mock data:
- Validate fixture structure matches API schema
- Check that IDs are consistent across fixtures
- Ensure dates are valid ISO 8601 strings
- Verify nested objects match expected shape

## Contributing

When adding new mock data:
1. Keep data realistic and representative
2. Include diverse examples (different types, sizes, etc.)
3. Document the structure and purpose
4. Add validation tests
5. Update this README

## Related Documentation

- [Main Testing Guide](../TESTING.md)
- [E2E Tests README](./README.md)
- [Playwright Documentation](https://playwright.dev)
