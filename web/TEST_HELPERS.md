# Test Helpers and Utilities Reference

Quick reference guide for common test utilities, helpers, and patterns used in the NodeTool web application tests.

## Table of Contents

1. [Test Utilities](#test-utilities)
2. [Common Test Helpers](#common-test-helpers)
3. [Mock Helpers](#mock-helpers)
4. [Custom Matchers](#custom-matchers)
5. [Test Data Factories](#test-data-factories)

## Test Utilities

### React Testing Library Queries

```typescript
import { render, screen, within } from '@testing-library/react';

// Recommended query priority (most to least):
screen.getByRole('button', { name: /submit/i })       // 1. By role (most accessible)
screen.getByLabelText(/username/i)                    // 2. By label (forms)
screen.getByPlaceholderText(/search/i)                // 3. By placeholder
screen.getByText(/welcome/i)                          // 4. By text content
screen.getByDisplayValue(/john/i)                     // 5. By current input value
screen.getByAltText(/profile picture/i)               // 6. By alt text (images)
screen.getByTitle(/close/i)                           // 7. By title attribute
screen.getByTestId('custom-element')                  // 8. By test ID (last resort)

// Query variants:
getBy...     // Throws error if not found
queryBy...   // Returns null if not found (use for asserting non-existence)
findBy...    // Async, waits for element (use for async elements)

// Multiple elements:
getAllBy...  // Array, throws if none found
queryAllBy... // Array, returns [] if none found
findAllBy... // Async array
```

### User Event

```typescript
import userEvent from '@testing-library/user-event';

const user = userEvent.setup();

// Interactions:
await user.click(element);
await user.dblClick(element);
await user.tripleClick(element);
await user.hover(element);
await user.unhover(element);
await user.type(input, 'Hello World');
await user.clear(input);
await user.selectOptions(select, 'option1');
await user.deselectOptions(select, 'option1');
await user.upload(fileInput, file);
await user.keyboard('{Shift>}A{/Shift}'); // Shift+A
await user.paste('pasted text');
```

### Wait Utilities

```typescript
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';

// Wait for assertion to pass
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
}, { timeout: 3000 });

// Wait for element to be removed
await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));

// Wait with options
await waitFor(
  () => expect(mockFn).toHaveBeenCalled(),
  { 
    timeout: 5000,
    interval: 100,
    onTimeout: error => {
      console.log('Timeout waiting for mock to be called');
      throw error;
    }
  }
);
```

## Common Test Helpers

### Render with Providers

```typescript
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactFlowProvider } from '@xyflow/react';

export const renderWithProviders = (
  ui: React.ReactElement,
  {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    }),
    ...options
  } = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ReactFlowProvider>
        {children}
      </ReactFlowProvider>
    </QueryClientProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
};

// Usage:
renderWithProviders(<MyComponent />);
```

### Create Test Store

```typescript
import { createNodeStore } from '../stores/NodeStore';

export const createTestNodeStore = (initialState = {}) => {
  const store = createNodeStore();
  
  // Set initial state
  store.setState({
    ...store.getState(),
    ...initialState
  });
  
  return store;
};

// Usage in tests:
const store = createTestNodeStore({
  nodes: [testNode1, testNode2],
  edges: [testEdge1]
});
```

### Wait for Store Update

```typescript
export const waitForStoreUpdate = <T>(
  store: any,
  selector: (state: any) => T,
  expectedValue: T,
  timeout = 3000
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Store update timeout'));
    }, timeout);

    const unsubscribe = store.subscribe((state: any) => {
      if (selector(state) === expectedValue) {
        clearTimeout(timeoutId);
        unsubscribe();
        resolve();
      }
    });
  });
};

// Usage:
await waitForStoreUpdate(
  store,
  state => state.nodes.length,
  5
);
```

### Async Act Helper

```typescript
import { act } from '@testing-library/react';

export const actAsync = async (callback: () => Promise<void>) => {
  await act(async () => {
    await callback();
  });
};

// Usage:
await actAsync(async () => {
  await store.getState().loadData();
});
```

## Mock Helpers

### Create Mock Node

```typescript
import { Node } from '@xyflow/react';
import { NodeData } from '../stores/NodeData';

export const createMockNode = (
  overrides: Partial<Node<NodeData>> = {}
): Node<NodeData> => ({
  id: `node-${Math.random()}`,
  type: 'default',
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: 'test-workflow'
  },
  ...overrides
});

// Usage:
const node = createMockNode({
  id: 'custom-id',
  position: { x: 100, y: 100 },
  data: {
    properties: { name: 'Test Node' },
    dynamic_properties: {},
    selectable: true,
    workflow_id: 'test-workflow'
  }
});
```

### Create Mock Edge

```typescript
import { Edge } from '@xyflow/react';

export const createMockEdge = (
  source: string,
  target: string,
  overrides: Partial<Edge> = {}
): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: null,
  targetHandle: null,
  ...overrides
});

// Usage:
const edge = createMockEdge('node-1', 'node-2', {
  sourceHandle: 'output',
  targetHandle: 'input'
});
```

### Create Mock Asset

```typescript
export const createMockAsset = (overrides = {}) => ({
  id: `asset-${Math.random()}`,
  name: 'test-asset.png',
  content_type: 'image/png',
  size: 1024,
  created_at: new Date().toISOString(),
  workflow_id: 'test-workflow',
  ...overrides
});
```

### Mock API Client

```typescript
import { ApiClient } from '../stores/ApiClient';

export const mockApiClient = () => {
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockPut = jest.fn();
  const mockDelete = jest.fn();

  jest.spyOn(ApiClient, 'get').mockImplementation(mockGet);
  jest.spyOn(ApiClient, 'post').mockImplementation(mockPost);
  jest.spyOn(ApiClient, 'put').mockImplementation(mockPut);
  jest.spyOn(ApiClient, 'delete').mockImplementation(mockDelete);

  return {
    mockGet,
    mockPost,
    mockPut,
    mockDelete,
    restore: () => {
      jest.restoreAllMocks();
    }
  };
};

// Usage:
const api = mockApiClient();
api.mockGet.mockResolvedValueOnce({ data: testData });
// ... test code ...
api.restore();
```

### Mock WebSocket

```typescript
import { Server } from 'mock-socket';

export const createMockWebSocket = (url: string = 'ws://localhost:8000') => {
  const mockServer = new Server(url);
  const messages: any[] = [];

  mockServer.on('connection', socket => {
    socket.on('message', data => {
      messages.push(JSON.parse(data.toString()));
    });
  });

  return {
    server: mockServer,
    messages,
    send: (data: any) => {
      mockServer.emit('message', JSON.stringify(data));
    },
    close: () => {
      mockServer.close();
    }
  };
};

// Usage:
const ws = createMockWebSocket();
// ... test code ...
ws.close();
```

## Custom Matchers

### Additional Jest-DOM Matchers

```typescript
// Already available from '@testing-library/jest-dom'

expect(element).toBeInTheDocument();
expect(element).toBeVisible();
expect(element).toBeEmptyDOMElement();
expect(element).toBeDisabled();
expect(element).toBeEnabled();
expect(element).toBeInvalid();
expect(element).toBeRequired();
expect(element).toBeValid();
expect(element).toContainElement(child);
expect(element).toContainHTML('<span>text</span>');
expect(element).toHaveAccessibleDescription('description');
expect(element).toHaveAccessibleName('name');
expect(element).toHaveAttribute('attr', 'value');
expect(element).toHaveClass('className');
expect(element).toHaveFocus();
expect(element).toHaveFormValues({ field: 'value' });
expect(element).toHaveStyle({ color: 'red' });
expect(element).toHaveTextContent('text');
expect(element).toHaveValue('value');
expect(element).toHaveDisplayValue('display');
expect(element).toBeChecked();
expect(element).toBePartiallyChecked();
```

### Custom Store Matchers

```typescript
// Helper for asserting store state
export const expectStoreState = <T>(
  store: any,
  selector: (state: any) => T,
  expected: T
) => {
  const actual = selector(store.getState());
  expect(actual).toEqual(expected);
};

// Usage:
expectStoreState(
  nodeStore,
  state => state.nodes.length,
  5
);
```

## Test Data Factories

### Workflow Factory

```typescript
export const workflowFactory = {
  build: (overrides = {}) => ({
    id: `workflow-${Math.random()}`,
    name: 'Test Workflow',
    description: 'Test Description',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    graph: {
      nodes: [],
      edges: []
    },
    ...overrides
  }),

  buildMany: (count: number, overrides = {}) => {
    return Array.from({ length: count }, (_, i) =>
      workflowFactory.build({ name: `Workflow ${i}`, ...overrides })
    );
  }
};

// Usage:
const workflow = workflowFactory.build({ name: 'My Workflow' });
const workflows = workflowFactory.buildMany(5);
```

### Node Metadata Factory

```typescript
export const nodeMetadataFactory = {
  build: (overrides = {}) => ({
    node_type: 'test.node',
    title: 'Test Node',
    description: 'A test node',
    namespace: 'test',
    layout: 'default',
    outputs: [],
    properties: [],
    ...overrides
  })
};
```

## Common Test Scenarios

### Testing Loading States

```typescript
it('shows loading state', () => {
  const { rerender } = render(<MyComponent isLoading={true} />);
  expect(screen.getByText('Loading...')).toBeInTheDocument();
  
  rerender(<MyComponent isLoading={false} />);
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
});
```

### Testing Error States

```typescript
it('displays error message', () => {
  const error = new Error('Failed to load');
  render(<MyComponent error={error} />);
  
  expect(screen.getByText('Failed to load')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
```

### Testing Form Submission

```typescript
it('submits form data', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  
  render(<MyForm onSubmit={onSubmit} />);
  
  await user.type(screen.getByLabelText(/name/i), 'John');
  await user.type(screen.getByLabelText(/email/i), 'john@example.com');
  await user.click(screen.getByRole('button', { name: /submit/i }));
  
  expect(onSubmit).toHaveBeenCalledWith({
    name: 'John',
    email: 'john@example.com'
  });
});
```

### Testing Keyboard Shortcuts

```typescript
it('triggers action on keyboard shortcut', async () => {
  const user = userEvent.setup();
  const onSave = jest.fn();
  
  render(<MyComponent onSave={onSave} />);
  
  await user.keyboard('{Control>}s{/Control}');
  
  expect(onSave).toHaveBeenCalled();
});
```

### Testing Debounced Functions

```typescript
it('debounces search input', async () => {
  const user = userEvent.setup();
  const onSearch = jest.fn();
  
  render(<SearchComponent onSearch={onSearch} />);
  
  const input = screen.getByRole('textbox');
  await user.type(input, 'test');
  
  // Shouldn't be called immediately
  expect(onSearch).not.toHaveBeenCalled();
  
  // Wait for debounce
  await waitFor(() => {
    expect(onSearch).toHaveBeenCalledWith('test');
  }, { timeout: 1000 });
});
```

### Testing Drag and Drop

```typescript
it('handles drag and drop', async () => {
  const onDrop = jest.fn();
  
  render(<DragDropComponent onDrop={onDrop} />);
  
  const draggable = screen.getByText('Drag me');
  const dropzone = screen.getByText('Drop here');
  
  fireEvent.dragStart(draggable);
  fireEvent.dragEnter(dropzone);
  fireEvent.dragOver(dropzone);
  fireEvent.drop(dropzone);
  
  expect(onDrop).toHaveBeenCalled();
});
```

## Debugging Utilities

### Log DOM Tree

```typescript
import { screen } from '@testing-library/react';

// Log entire DOM
screen.debug();

// Log specific element
screen.debug(screen.getByRole('button'));

// Log with max depth
screen.debug(undefined, 10000);
```

### Log Available Roles

```typescript
import { logRoles } from '@testing-library/react';

const { container } = render(<MyComponent />);
logRoles(container);
```

### Pause Test Execution

```typescript
import { screen } from '@testing-library/react';

// Pause and open DOM in browser (for debugging)
await screen.findByText('text', {}, { timeout: 999999 });
```

## Performance Testing

### Measure Render Count

```typescript
let renderCount = 0;

const MyComponent = () => {
  renderCount++;
  return <div>Renders: {renderCount}</div>;
};

it('renders only once', () => {
  renderCount = 0;
  render(<MyComponent />);
  expect(renderCount).toBe(1);
});
```

### Test Memoization

```typescript
it('memoizes expensive calculation', () => {
  const expensiveCalc = jest.fn((x) => x * 2);
  
  const MyComponent = ({ value }) => {
    const result = useMemo(() => expensiveCalc(value), [value]);
    return <div>{result}</div>;
  };
  
  const { rerender } = render(<MyComponent value={5} />);
  expect(expensiveCalc).toHaveBeenCalledTimes(1);
  
  // Same value - shouldn't recalculate
  rerender(<MyComponent value={5} />);
  expect(expensiveCalc).toHaveBeenCalledTimes(1);
  
  // Different value - should recalculate
  rerender(<MyComponent value={10} />);
  expect(expensiveCalc).toHaveBeenCalledTimes(2);
});
```

## Integration Testing Patterns

### Test Complete User Flow

```typescript
describe('Node Creation Flow', () => {
  it('creates and connects nodes', async () => {
    const user = userEvent.setup();
    
    render(<WorkflowEditor />);
    
    // Open node menu
    await user.click(screen.getByRole('button', { name: /add node/i }));
    
    // Select node type
    await user.click(screen.getByText('Image Node'));
    
    // Verify node created
    expect(screen.getByText('Image Node')).toBeInTheDocument();
    
    // Add another node
    await user.click(screen.getByRole('button', { name: /add node/i }));
    await user.click(screen.getByText('Text Node'));
    
    // Connect nodes (implementation specific)
    // ...
    
    // Verify connection
    expect(screen.getByTestId('edge-1-2')).toBeInTheDocument();
  });
});
```

## Best Practices Summary

1. ✅ Use `userEvent` over `fireEvent`
2. ✅ Query by role/label before test IDs
3. ✅ Use `findBy` for async elements
4. ✅ Use `queryBy` for asserting absence
5. ✅ Wrap state updates in `act()` or `waitFor()`
6. ✅ Create factories for test data
7. ✅ Use descriptive test names
8. ✅ Test behavior, not implementation
9. ✅ Mock external dependencies
10. ✅ Clean up after each test

## Quick Command Reference

```bash
# Run specific test
npm test -- MyComponent.test.tsx

# Run tests matching pattern
npm test -- --testNamePattern="handles click"

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Update snapshots
npm test -- -u

# Run only changed tests
npm test -- --onlyChanged

# Run with verbose output
npm test -- --verbose
```
