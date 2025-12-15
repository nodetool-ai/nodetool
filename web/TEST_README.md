# Test Documentation Index

Welcome to the NodeTool web application testing documentation! This guide will help you find the right documentation for your needs.

## Quick Start

```bash
cd web
npm install    # Install dependencies
npm test       # Run all tests
```

## Documentation Files

### For Getting Started

📖 **[TESTING.md](./TESTING.md)** - Start here!
- Comprehensive testing guide for the entire project
- Framework overview and configuration
- How to run tests with different options
- Writing tests for different components (components, stores, hooks, utilities)
- Complete mocking strategies
- Best practices and troubleshooting

### For Quick Reference

🔧 **[TEST_HELPERS.md](./TEST_HELPERS.md)** - Quick lookup
- React Testing Library query reference
- User event API examples
- Common test helper functions
- Mock helpers for nodes, edges, assets
- Test data factories
- Debugging utilities

### For Starting New Tests

📝 **[TEST_TEMPLATES.md](./TEST_TEMPLATES.md)** - Copy & paste
- Ready-to-use test templates
- Component test template
- Store (Zustand) test template
- Hook test template
- Utility function test template
- Integration test template
- Form test template
- Quick snippets

### For AI Coding Assistants

🤖 **[../.github/copilot-instructions.md](../.github/copilot-instructions.md)** - AI-specific guidance
- GitHub Copilot code generation patterns
- TypeScript and React conventions
- Project-specific patterns
- Testing checklist for AI-generated code
- What to avoid

## Documentation by Task

### "I need to write a test for..."

| What you're testing | Template to use | Reference docs |
|---------------------|-----------------|----------------|
| React component | [Component Test Template](./TEST_TEMPLATES.md#component-test-template) | [Component Tests](./TESTING.md#component-tests) |
| Zustand store | [Store Test Template](./TEST_TEMPLATES.md#store-test-template-zustand) | [Store Tests](./TESTING.md#store-tests-zustand) |
| Custom hook | [Hook Test Template](./TEST_TEMPLATES.md#hook-test-template) | [Hook Tests](./TESTING.md#hook-tests) |
| Utility function | [Utility Test Template](./TEST_TEMPLATES.md#utility-function-test-template) | [Utility Tests](./TESTING.md#utility-function-tests) |
| Form submission | [Form Test Template](./TEST_TEMPLATES.md#form-test-template) | [Testing Forms](./TESTING.md#testing-forms) |
| Async component | [Async Test Template](./TEST_TEMPLATES.md#async-component-test-template) | [Testing Async Behavior](./TESTING.md#testing-async-behavior) |
| Integration flow | [Integration Test Template](./TEST_TEMPLATES.md#integration-test-template) | [Integration Testing](./TESTING.md#integration-testing-patterns) |

### "I need to know how to..."

| Task | Where to find it |
|------|------------------|
| Run tests | [TESTING.md - Running Tests](./TESTING.md#running-tests) |
| Mock an API call | [TESTING.md - Mocking API Calls](./TESTING.md#mocking-api-calls) |
| Mock a component | [TESTING.md - Mocking React Components](./TESTING.md#mocking-react-components) |
| Test user interactions | [TEST_HELPERS.md - User Event](./TEST_HELPERS.md#user-event) |
| Wait for async updates | [TEST_HELPERS.md - Wait Utilities](./TEST_HELPERS.md#wait-utilities) |
| Debug a failing test | [TESTING.md - Troubleshooting](./TESTING.md#troubleshooting) |
| Find the right query | [TEST_HELPERS.md - React Testing Library Queries](./TEST_HELPERS.md#react-testing-library-queries) |
| Create mock data | [TEST_HELPERS.md - Test Data Factories](./TEST_HELPERS.md#test-data-factories) |

### "I'm getting an error..."

| Error | Solution |
|-------|----------|
| Test timeout | [TESTING.md - Tests Timeout](./TESTING.md#1-tests-timeout) |
| Canvas/WebGL errors | [TESTING.md - Canvas/WebGL Errors](./TESTING.md#2-canvaswebgl-errors) |
| Module not found | [TESTING.md - Module Not Found](./TESTING.md#3-module-not-found) |
| React state update warnings | [TESTING.md - React State Update Warnings](./TESTING.md#4-react-state-update-warnings) |
| Memory leaks | [TESTING.md - Memory Leaks](./TESTING.md#5-memory-leaks) |

## Testing Stack

The project uses:

- **Jest** 29.7.0 - Test framework
- **React Testing Library** 16.1.0 - Component testing
- **@testing-library/user-event** 14.5.2 - User interactions
- **@testing-library/jest-dom** 6.6.3 - DOM matchers
- **ts-jest** 29.2.5 - TypeScript support

## Key Testing Principles

1. ✅ **Test behavior, not implementation** - Focus on what users see and do
2. ✅ **Use accessible queries** - Prefer `getByRole`, `getByLabelText`
3. ✅ **Use userEvent** - More realistic than fireEvent
4. ✅ **Mock external dependencies** - Keep tests isolated
5. ✅ **Keep tests independent** - Each test should work in isolation
6. ✅ **Follow existing patterns** - Check similar tests in the codebase

## Common Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- MyComponent.test.tsx

# Run tests matching pattern
npm test -- --testNamePattern="handles click"

# Run only failed tests
npm test -- --onlyFailures

# Update snapshots
npm test -- -u
```

## CI/CD

Tests run automatically in CI:
1. Type check: `npm run typecheck`
2. Lint: `npm run lint`
3. Test: `npm test`

See [TESTING.md - CI/CD Integration](./TESTING.md#cicd-integration) for details.

## Contributing

When adding new features:

1. ✅ Write tests for new components, hooks, and utilities
2. ✅ Follow existing test patterns
3. ✅ Ensure all tests pass: `npm test`
4. ✅ Maintain or improve code coverage
5. ✅ Update documentation if adding new patterns

## Additional Resources

- Main project documentation: [/AGENTS.md](../AGENTS.md)
- Component architecture: [/web/src/components/AGENTS.md](./src/components/AGENTS.md)
- Store patterns: [/web/src/stores/AGENTS.md](./src/stores/AGENTS.md)
- Jest documentation: https://jestjs.io/
- React Testing Library: https://testing-library.com/react

## Questions?

- Check [TESTING.md - Troubleshooting](./TESTING.md#troubleshooting)
- Look at existing tests for examples
- Search the codebase for similar test scenarios

---

**Happy Testing! 🎉**
