# Testing Electron Code

This directory contains unit tests for the NodeTool Electron application. For end-to-end tests, see `tests/e2e/` in the electron root directory.

## Testing Structure

Tests are organized by module, with each test file corresponding to a source file:

- `src/utils.ts` → `src/__tests__/utils.test.ts`
- `src/window.ts` → `src/__tests__/window.test.ts`

## Running Unit Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode (development)
npm run test:watch

# Generate test coverage report
npm run test:coverage
```

## Running E2E Tests

End-to-end tests are located in `tests/e2e/` and use Playwright:

```bash
# Build the app first
npm run vite:build && npx tsc

# Run e2e tests
npm run test:e2e          # Run all e2e tests
npm run test:e2e:ui       # Run with Playwright UI (interactive)
npm run test:e2e:headed   # Run in headed mode (see the window)
```

See the main [README.md](../../README.md) for more details on e2e testing.

## Mocking Strategy

When testing Electron code, we need to mock the Electron APIs. We use the following approach:

1. Create mock implementations in `src/__mocks__/electron.ts`
2. Import mocks at the top of test files:
   ```typescript
   jest.mock('electron', () => {
     return require('../__mocks__/electron');
   });
   ```
3. Mock other dependencies as needed using Jest's mocking capabilities

## Best Practices

1. Test individual functions and modules in isolation
2. Mock external dependencies and electron APIs
3. Focus on testing business logic rather than Electron-specific behavior
4. Separate main process and renderer process tests
5. Use descriptive test names that explain what the test is checking