# Testing Memory

## Overview
This directory contains testing-related documentation and insights for NodeTool.

## Quick Links
- **[README.md](README.md)** - Main testing documentation
- **[test-coverage-improvement.md](test-coverage-improvement.md)** - Coverage tracking and improvements

## Testing Infrastructure

### Test Frameworks
- **Jest 29.7** - Unit and integration testing
- **React Testing Library 16.1** - Component testing
- **Playwright 1.57** - E2E testing

### Key Directories
- `src/**/__tests__/` - Unit and integration tests
- `tests/e2e/` - End-to-end tests

### Running Tests
```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# E2E tests
npm run test:e2e
```

### Test Coverage Goals
- **Current**: 3086 passing tests across 236 test suites
- **Target**: 70%+ coverage for critical paths
- **Priority Areas**:
  - Zustand stores
  - Custom hooks
  - Utility functions
  - Critical components

## Best Practices

### Test Structure
- One test file per source file
- Descriptive test names
- AAA pattern (Arrange, Act, Assert)
- Independent tests

### Common Patterns
- Mock external dependencies
- Use `renderHook` for hook testing
- Use `waitFor` for async operations
- Mock Zustand stores for isolated testing

## Related Documentation
- [Build, Test, Lint Requirements](../build-test-lint.md)
- [Code Quality Best Practices](../code-quality/README.md)
