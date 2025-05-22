# Testing in the Apps Module

This document provides an overview of testing practices for the NodeTool Apps module.

## Testing Framework

We use Jest along with React Testing Library for testing React components and JavaScript/TypeScript code.

## Running Tests

There are several npm scripts available for running tests:

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage reporting
npm run test:coverage
```

## Test Structure

Tests are organized in the `src/__tests__` directory, mirroring the structure of the source code:

- `src/__tests__/components/`: Tests for React components
- `src/__tests__/stores/`: Tests for state management (Zustand stores)
- `src/__tests__/utils/`: Tests for utility functions

## Writing Tests

### Component Tests

For React components, use React Testing Library to render and interact with components:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from '../../components/MyComponent';

describe('MyComponent', () => {
  test('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  test('handles user interaction', () => {
    render(<MyComponent />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});
```

### Testing Store Logic

For Zustand stores, test the store logic directly:

```tsx
import { createMyStore } from '../../stores/myStore';

describe('MyStore', () => {
  test('initial state is correct', () => {
    const store = createMyStore();
    expect(store.getState().count).toBe(0);
  });

  test('can increment count', () => {
    const store = createMyStore();
    store.getState().increment();
    expect(store.getState().count).toBe(1);
  });
});
```

## Mocking

Jest provides a robust mocking system. Here are some common patterns:

### Mocking Modules

```tsx
// Mock a module
jest.mock('../../utils/api', () => ({
  fetchData: jest.fn().mockResolvedValue({ data: 'mocked data' }),
}));
```

### Mocking Hooks

```tsx
// Mock a React hook
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '123', name: 'Test User' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));
```

## Best Practices

1. **Test behavior, not implementation**: Focus on what the component does, not how it's built.
2. **Use test IDs for stable selection**: Prefer `data-testid` attributes over selecting by text or CSS selectors.
3. **Keep tests focused**: Each test should verify one specific aspect of behavior.
4. **Use descriptive test names**: Make it clear what is being tested and what the expected outcome is.
5. **Avoid testing library internal details**: Focus on your application code, not the libraries you use.
6. **Isolate tests**: Each test should be independent and not rely on the state from previous tests.

## Learning Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
- [Common Testing Library Queries](https://testing-library.com/docs/queries/about/)