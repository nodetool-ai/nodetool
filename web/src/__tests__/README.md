# Testing in NodeTool

This directory contains tests for the NodeTool web application.

## Testing Structure

Tests in this project follow the convention of being placed next to the code they test:

- Component tests: `src/components/MyComponent/__tests__/MyComponent.test.tsx`
- Utility tests: `src/utils/__tests__/myUtil.test.ts`
- Store tests: `src/stores/__tests__/myStore.test.ts`

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (development)
npm run test:watch

# Generate test coverage report
npm run test:coverage
```

## Testing Tools

- Jest: Test runner
- React Testing Library: Testing React components
- ts-jest: TypeScript support for Jest

## Best Practices

1. Test behavior, not implementation details
2. Use React Testing Library to query elements similarly to how users would find them
3. Mock external dependencies
4. Aim for high test coverage on critical paths
5. Write meaningful test descriptions