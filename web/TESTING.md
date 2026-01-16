# Testing Guide for NodeTool Web Application

This comprehensive guide provides detailed information for AI coding assistants and developers working with the NodeTool web application's test infrastructure.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Testing Framework](#testing-framework)
3. [Test Structure](#test-structure)
4. [Running Tests](#running-tests)
5. [End-to-End Tests](#end-to-end-tests)
6. [Writing Tests](#writing-tests)
7. [Mocking Strategies](#mocking-strategies)
8. [Test Patterns](#test-patterns)
9. [Best Practices](#best-practices)
10. [CI/CD Integration](#cicd-integration)
11. [Troubleshooting](#troubleshooting)

## Quick Start

```bash
# Install dependencies
npm install

# Run unit tests (Jest)
npm test

# Run tests in watch mode (for active development)
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with summary output only
npm run test:summary

# Run end-to-end tests (Playwright)
npm run test:e2e

# Run E2E tests with UI mode
npm run test:e2e:ui

# Run E2E tests in headed mode (see browser)
npm run test:e2e:headed
```

## Testing Framework

The web application uses the following testing stack:

- **Jest** (v29.7.0): Core testing framework
- **React Testing Library** (v16.1.0): For testing React components
- **ts-jest**: TypeScript support for Jest
- **@testing-library/user-event**: For simulating user interactions
- **@testing-library/jest-dom**: Custom matchers for DOM assertions

### Configuration Files

- `jest.config.ts`: Main Jest configuration with module mappings and transforms
- `jest.setup.js`: Pre-test environment setup (canvas mocking, timezone)
- `src/setupTests.ts`: Post-environment setup (jest-dom matchers, global mocks)

## Test Structure

Tests are organized following the source code structure:

```
web/src/
├── __tests__/                    # General integration tests
│   ├── components/
│   └── frontendTools.test.ts
├── components/
│   └── __tests__/                # Component-specific tests
├── stores/
│   └── __tests__/                # Store tests (Zustand)
├── hooks/
│   └── __tests__/                # Custom hooks tests
├── utils/
│   └── __tests__/                # Utility function tests
├── serverState/
│   └── __tests__/                # Server state management tests
└── __mocks__/                    # Global mocks and fixtures
```

### Test File Naming

- Component tests: `ComponentName.test.tsx`
- Store tests: `StoreName.test.ts`
- Hook tests: `useHookName.test.ts`
- Utility tests: `utilityName.test.ts`

## Running Tests

### Basic Commands

```bash
# Run all tests once
npm test

# Watch mode - reruns tests on file changes
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- NodeStore.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should update node position"

# Run only failed tests from last run
npm test -- --onlyFailures

# Update snapshots (if any exist)
npm test -- -u
```

### CI/CD Commands

The GitHub Actions workflow runs:

```bash
npm run typecheck  # TypeScript compilation check
npm run lint       # ESLint
npm test           # Jest tests
```

## End-to-End Tests

The application uses **Playwright** for end-to-end testing. E2E tests run the actual backend and frontend servers to test the complete application flow.

### E2E Test Structure

E2E tests are located in:

```
web/tests/e2e/
├── app-loads.spec.ts          # Basic app loading and navigation tests
└── ...
```

### Configuration

- `playwright.config.ts`: Playwright configuration
  - Test directory: `./tests/e2e`
  - Base URL: `http://localhost:3000`
  - Web servers: Backend (port 7777) and Frontend (port 3000)
  - Browsers: Chromium
  - Retries: 2 in CI, 0 locally

### Running E2E Tests

#### Prerequisites

E2E tests require:

1. **Python environment with nodetool**: The backend server needs to be available
2. **Node.js dependencies**: For the frontend

```bash
# Setup conda environment (one time)
conda env update -f environment.yml --prune
conda activate nodetool

# Install nodetool core and base (one time)
uv pip install git+https://github.com/nodetool-ai/nodetool-core git+https://github.com/nodetool-ai/nodetool-base

# Install Playwright browsers (one time)
npx playwright install --with-deps chromium
```

#### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (recommended for development)
npm run test:e2e:ui

# Run in headed mode (see the browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test app-loads.spec.ts

# Debug a test
npx playwright test --debug

# Run with HTML report
npx playwright show-report
```

### Writing E2E Tests

E2E tests use Playwright's test runner:

```typescript
import { test, expect } from '@playwright/test';

test('should load the home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/NodeTool/);
});

test('should interact with workflow', async ({ page }) => {
  await page.goto('/workflows');
  
  // Wait for element to be visible
  await page.waitForSelector('.workflow-list');
  
  // Click an element
  await page.click('button[aria-label="Create Workflow"]');
  
  // Check navigation
  await expect(page).toHaveURL(/\/workflow\//);
});
```

### E2E Test Best Practices

1. **Skip in Jest**: E2E tests should be skipped when run through Jest:
   ```typescript
   if (process.env.JEST_WORKER_ID) {
     describe.skip("test name (playwright)", () => {
       it("skipped in jest runner", () => {});
     });
   }
   ```

2. **Use Page Object Pattern**: Encapsulate page interactions
   ```typescript
   class WorkflowPage {
     constructor(private page: Page) {}
     
     async createWorkflow(name: string) {
       await this.page.click('[data-testid="create-workflow"]');
       await this.page.fill('[name="workflow-name"]', name);
       await this.page.click('button[type="submit"]');
     }
   }
   ```

3. **Wait for Async Operations**: Use Playwright's auto-waiting or explicit waits
   ```typescript
   // Auto-wait (preferred)
   await page.click('button');
   
   // Explicit wait
   await page.waitForSelector('.result', { state: 'visible' });
   ```

4. **Test Real Scenarios**: E2E tests should test user flows, not implementation details

### GitHub Actions E2E Workflow

The E2E workflow (`.github/workflows/e2e.yml`) runs automatically on:
- Push to `main` branch (when web files change)
- Pull requests to `main` branch (when web files change)

The workflow:
1. Sets up Python 3.11 with conda
2. Installs nodetool-core and nodetool-base
3. Sets up Node.js 20
4. Installs web dependencies
5. Installs Playwright browsers
6. Starts nodetool server in the background (`nodetool serve --port 7777`)
7. Waits for the server to be ready
8. Runs Playwright tests (which start the frontend server)
9. Stops the nodetool server
10. Uploads test reports, results, and server logs as artifacts on failure

### Debugging E2E Test Failures in CI

If E2E tests fail in CI:

1. **Check workflow logs**: View the GitHub Actions run logs
2. **Download artifacts**: Test reports and screenshots are uploaded on failure
3. **Reproduce locally**: 
   ```bash
   CI=true npm run test:e2e
   ```

## Writing Tests

### Component Tests

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('renders with default props', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('handles user interactions', async () => {
    const user = userEvent.setup();
    const onClickMock = jest.fn();
    
    render(<MyComponent onClick={onClickMock} />);
    
    await user.click(screen.getByRole('button'));
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  it('updates when props change', () => {
    const { rerender } = render(<MyComponent value="initial" />);
    expect(screen.getByText('initial')).toBeInTheDocument();
    
    rerender(<MyComponent value="updated" />);
    expect(screen.getByText('updated')).toBeInTheDocument();
  });
});
```

### Store Tests (Zustand)

```typescript
import { createMyStore } from '../myStore';

describe('MyStore', () => {
  let store: ReturnType<typeof createMyStore>;

  beforeEach(() => {
    // Create fresh store instance for each test
    store = createMyStore();
  });

  it('has correct initial state', () => {
    const state = store.getState();
    expect(state.items).toEqual([]);
    expect(state.count).toBe(0);
  });

  it('adds item to state', () => {
    const { addItem } = store.getState();
    addItem({ id: '1', name: 'Test' });
    
    expect(store.getState().items).toHaveLength(1);
    expect(store.getState().items[0].name).toBe('Test');
  });

  it('subscribes to state changes', () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    
    store.getState().addItem({ id: '1', name: 'Test' });
    expect(listener).toHaveBeenCalled();
    
    unsubscribe();
  });
});
```

### Hook Tests

```typescript
import { renderHook, act } from '@testing-library/react';
import { useMyCustomHook } from '../useMyCustomHook';

describe('useMyCustomHook', () => {
  it('returns initial value', () => {
    const { result } = renderHook(() => useMyCustomHook('initial'));
    expect(result.current.value).toBe('initial');
  });

  it('updates value on action', () => {
    const { result } = renderHook(() => useMyCustomHook('initial'));
    
    act(() => {
      result.current.setValue('updated');
    });
    
    expect(result.current.value).toBe('updated');
  });

  it('handles dependencies correctly', () => {
    const { result, rerender } = renderHook(
      ({ dep }) => useMyCustomHook(dep),
      { initialProps: { dep: 'value1' } }
    );
    
    expect(result.current.value).toBe('value1');
    
    rerender({ dep: 'value2' });
    expect(result.current.value).toBe('value2');
  });
});
```

### Utility Function Tests

```typescript
import { myUtilFunction } from '../myUtil';

describe('myUtilFunction', () => {
  it('handles normal input', () => {
    expect(myUtilFunction('test')).toBe('TEST');
  });

  it('handles edge cases', () => {
    expect(myUtilFunction('')).toBe('');
    expect(myUtilFunction(null)).toBe('');
  });

  it('throws on invalid input', () => {
    expect(() => myUtilFunction(undefined)).toThrow('Invalid input');
  });
});
```

## Mocking Strategies

### Available Mocks

The project includes pre-configured mocks in `src/__mocks__/`:

- `apiClientMock.ts`: Mock API client for HTTP requests
- `baseUrlMock.ts`: Mock base URL configuration
- `canvas.ts`: Mock HTML5 Canvas API
- `chroma-js.ts`: Mock chroma-js color library
- `fuse.js.ts`: Mock Fuse.js search library
- `supabaseClientMock.ts`: Mock Supabase client
- `themeMock.ts`: Mock MUI theme
- `styleMock.ts`: Mock CSS imports
- `fileMock.ts`: Mock file imports (images, etc.)
- `svgReactMock.ts`: Mock SVG React components

### Using Existing Mocks

These mocks are automatically applied via `jest.config.ts` module name mapping:

```typescript
// No explicit mock needed - automatically mocked
import { ApiClient } from '../stores/ApiClient';
import chroma from 'chroma-js';
import theme from '../components/themes/ThemeNodetool';
```

### Creating Module Mocks

```typescript
// At the top of your test file, before imports
jest.mock('../path/to/module', () => ({
  functionName: jest.fn().mockReturnValue('mocked value'),
  ClassName: jest.fn().mockImplementation(() => ({
    method: jest.fn()
  }))
}));
```

### Mocking React Components

```typescript
// Mock a component that's not relevant to the test
jest.mock('../ComplexComponent', () => {
  return function MockedComponent(props: any) {
    return <div data-testid="mocked-component">{props.children}</div>;
  };
});
```

### Mocking Hooks

```typescript
jest.mock('../hooks/useMyHook', () => ({
  useMyHook: () => ({
    data: 'mocked data',
    loading: false,
    error: null
  })
}));
```

### Mocking API Calls

```typescript
import { ApiClient } from '../stores/ApiClient';

// Mock specific methods
const mockGet = jest.fn();
jest.spyOn(ApiClient, 'get').mockImplementation(mockGet);

// In test
mockGet.mockResolvedValueOnce({ data: 'test data' });
// or
mockGet.mockRejectedValueOnce(new Error('API Error'));
```

### Mocking Environment Variables

Environment variables are mocked in `setupTests.ts`:

```typescript
// Already configured - available in all tests
import.meta.env.MODE // 'test'
import.meta.env.VITE_API_URL // 'http://localhost:7777'
```

## Test Patterns

### Testing Async Behavior

```typescript
it('loads data asynchronously', async () => {
  render(<AsyncComponent />);
  
  // Wait for loading state to disappear
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
  
  // Assert on loaded content
  expect(screen.getByText('Data loaded')).toBeInTheDocument();
});

it('handles async errors', async () => {
  const mockFetch = jest.fn().mockRejectedValueOnce(new Error('Failed'));
  
  render(<ComponentWithFetch fetch={mockFetch} />);
  
  await waitFor(() => {
    expect(screen.getByText('Error: Failed')).toBeInTheDocument();
  });
});
```

### Testing State Updates

```typescript
it('updates state correctly', async () => {
  const user = userEvent.setup();
  render(<Counter />);
  
  const button = screen.getByRole('button', { name: /increment/i });
  expect(screen.getByText('Count: 0')).toBeInTheDocument();
  
  await user.click(button);
  expect(screen.getByText('Count: 1')).toBeInTheDocument();
  
  await user.click(button);
  expect(screen.getByText('Count: 2')).toBeInTheDocument();
});
```

### Testing Forms

```typescript
it('submits form with valid data', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  
  render(<MyForm onSubmit={onSubmit} />);
  
  await user.type(screen.getByLabelText(/name/i), 'John Doe');
  await user.type(screen.getByLabelText(/email/i), 'john@example.com');
  await user.click(screen.getByRole('button', { name: /submit/i }));
  
  expect(onSubmit).toHaveBeenCalledWith({
    name: 'John Doe',
    email: 'john@example.com'
  });
});
```

### Testing Error Boundaries

```typescript
it('catches errors with error boundary', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  
  const ThrowError = () => {
    throw new Error('Test error');
  };
  
  render(
    <ErrorBoundary fallback={<div>Error occurred</div>}>
      <ThrowError />
    </ErrorBoundary>
  );
  
  expect(screen.getByText('Error occurred')).toBeInTheDocument();
  spy.mockRestore();
});
```

### Testing Context Providers

```typescript
it('provides context value to children', () => {
  const TestComponent = () => {
    const value = useMyContext();
    return <div>{value}</div>;
  };
  
  render(
    <MyContextProvider value="test value">
      <TestComponent />
    </MyContextProvider>
  );
  
  expect(screen.getByText('test value')).toBeInTheDocument();
});
```

### Testing React Query / TanStack Query

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false }
  }
});

it('fetches and displays data', async () => {
  const queryClient = createTestQueryClient();
  
  render(
    <QueryClientProvider client={queryClient}>
      <MyQueryComponent />
    </QueryClientProvider>
  );
  
  await waitFor(() => {
    expect(screen.getByText('Loaded data')).toBeInTheDocument();
  });
});
```

### Testing ReactFlow Components

```typescript
import { ReactFlowProvider } from '@xyflow/react';

it('renders node in ReactFlow', () => {
  render(
    <ReactFlowProvider>
      <MyNodeComponent data={{ label: 'Test Node' }} />
    </ReactFlowProvider>
  );
  
  expect(screen.getByText('Test Node')).toBeInTheDocument();
});
```

## Best Practices

### 1. Test Behavior, Not Implementation

❌ **Bad:**
```typescript
it('sets internal state', () => {
  const component = shallow(<MyComponent />);
  expect(component.state('count')).toBe(0);
});
```

✅ **Good:**
```typescript
it('displays initial count', () => {
  render(<MyComponent />);
  expect(screen.getByText('Count: 0')).toBeInTheDocument();
});
```

### 2. Use Accessible Queries

Prefer queries that mirror how users interact with your app:

```typescript
// Priority order (best to worst):
screen.getByRole('button', { name: /submit/i })  // Best
screen.getByLabelText(/username/i)               // Good for forms
screen.getByPlaceholderText(/enter name/i)       // OK
screen.getByText(/click me/i)                    // Common
screen.getByTestId('custom-element')             // Last resort
```

### 3. Keep Tests Independent

```typescript
// Bad - tests depend on each other
describe('Counter', () => {
  let store;
  
  it('starts at 0', () => {
    store = createStore();
    expect(store.getState().count).toBe(0);
  });
  
  it('increments', () => {
    store.getState().increment(); // Depends on previous test
    expect(store.getState().count).toBe(1);
  });
});

// Good - each test is independent
describe('Counter', () => {
  let store;
  
  beforeEach(() => {
    store = createStore();
  });
  
  it('starts at 0', () => {
    expect(store.getState().count).toBe(0);
  });
  
  it('increments from initial state', () => {
    store.getState().increment();
    expect(store.getState().count).toBe(1);
  });
});
```

### 4. Use Descriptive Test Names

```typescript
// Bad
it('works', () => { /* ... */ });
it('test 1', () => { /* ... */ });

// Good
it('displays error message when API call fails', () => { /* ... */ });
it('disables submit button while form is submitting', () => { /* ... */ });
it('filters nodes by search term in case-insensitive manner', () => { /* ... */ });
```

### 5. Don't Test External Libraries

```typescript
// Bad - testing MUI component
it('renders MUI Button', () => {
  render(<Button>Click</Button>);
  expect(screen.getByRole('button')).toBeInTheDocument();
});

// Good - testing your component's integration
it('calls onSave when save button is clicked', async () => {
  const onSave = jest.fn();
  const user = userEvent.setup();
  
  render(<MyForm onSave={onSave} />);
  await user.click(screen.getByRole('button', { name: /save/i }));
  
  expect(onSave).toHaveBeenCalled();
});
```

### 6. Clean Up Side Effects

```typescript
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Restore spies
  jest.restoreAllMocks();
  
  // Clean up timers
  jest.clearAllTimers();
});
```

### 7. Use waitFor for Async Assertions

```typescript
// Bad
it('loads data', async () => {
  render(<AsyncComponent />);
  await new Promise(resolve => setTimeout(resolve, 100)); // Flaky!
  expect(screen.getByText('Data')).toBeInTheDocument();
});

// Good
it('loads data', async () => {
  render(<AsyncComponent />);
  await waitFor(() => {
    expect(screen.getByText('Data')).toBeInTheDocument();
  });
});
```

### 8. Prefer User Events Over FireEvent

```typescript
// OK
fireEvent.click(button);

// Better - more realistic
const user = userEvent.setup();
await user.click(button);
```

## CI/CD Integration

The project uses GitHub Actions for continuous integration. The workflow is defined in `.github/workflows/test.yml`.

### Workflow Steps

1. **Type Check**: `npm run typecheck`
2. **Lint**: `npm run lint`
3. **Test**: `npm test`

### Running Locally as CI Does

```bash
# Simulate CI environment
npm ci                 # Use exact package-lock.json versions
npm run typecheck      # Must pass
npm run lint           # Must pass
npm test               # Must pass
```

### Pre-commit Hooks

The project uses Husky for pre-commit hooks:

```bash
# Automatically runs before commit
npm run typecheck
npm run lint
npm test
```

## Troubleshooting

### Common Issues

#### 1. Tests Timeout

```typescript
// Increase timeout for slow tests
it('slow operation', async () => {
  // ...
}, 10000); // 10 second timeout
```

#### 2. Canvas/WebGL Errors

Canvas is mocked in `jest.setup.js`. If you see canvas-related errors:
- Check that the mock is properly loaded
- Verify `jest.config.ts` has correct canvas mapping

#### 3. Module Not Found

Add to `jest.config.ts` moduleNameMapper:

```typescript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/src/$1',
  // Add your pattern here
}
```

#### 4. React State Update Warnings

```typescript
// Wrap state updates in act()
act(() => {
  store.getState().updateValue('new value');
});

// Or use waitFor for async updates
await waitFor(() => {
  expect(screen.getByText('Updated')).toBeInTheDocument();
});
```

#### 5. Memory Leaks

```typescript
// Always clean up subscriptions
let unsubscribe: () => void;

beforeEach(() => {
  unsubscribe = store.subscribe(() => {});
});

afterEach(() => {
  unsubscribe();
});
```

### Debug Utilities

```typescript
// Print DOM tree
import { screen } from '@testing-library/react';
screen.debug(); // Prints current DOM
screen.debug(screen.getByRole('button')); // Prints specific element

// Log available roles
import { logRoles } from '@testing-library/react';
const { container } = render(<MyComponent />);
logRoles(container);

// See what queries are available
screen.getByRole(''); // Shows all available roles in error message
```

### Running Single Test File

```bash
npm test -- src/stores/__tests__/NodeStore.test.ts
```

### Running Tests in VSCode

Install Jest extension and use:
- Click "Run" above test/describe blocks
- Set breakpoints for debugging
- View coverage inline

## Resources

- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [User Event Documentation](https://testing-library.com/docs/user-event/intro)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
- [Common Testing Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Contributing

When adding new features:

1. ✅ Write tests for new components, hooks, and utilities
2. ✅ Maintain or improve code coverage
3. ✅ Follow existing test patterns
4. ✅ Update this documentation if adding new test patterns or mocks
5. ✅ Ensure all tests pass before committing: `npm test`
