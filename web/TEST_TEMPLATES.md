# Test Templates

Quick-start templates for common test scenarios in the NodeTool web application.

## Component Test Template

```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from '../MyComponent';

// Mock dependencies if needed
jest.mock('../dependency', () => ({
  useDependency: () => ({ data: 'mocked' })
}));

describe('MyComponent', () => {
  // Setup before each test
  beforeEach(() => {
    // Reset mocks, clear stores, etc.
  });

  // Cleanup after each test
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders with default props', () => {
    render(<MyComponent />);
    
    expect(screen.getByRole('heading')).toHaveTextContent('Expected Text');
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();
    
    render(<MyComponent onAction={onAction} />);
    
    await user.click(screen.getByRole('button', { name: /action/i }));
    
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      // expected payload
    }));
  });

  it('displays loading state', () => {
    render(<MyComponent isLoading={true} />);
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays error state', () => {
    const error = new Error('Failed to load');
    
    render(<MyComponent error={error} />);
    
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load');
  });

  it('updates when props change', () => {
    const { rerender } = render(<MyComponent value="initial" />);
    
    expect(screen.getByText('initial')).toBeInTheDocument();
    
    rerender(<MyComponent value="updated" />);
    
    expect(screen.getByText('updated')).toBeInTheDocument();
  });
});
```

## Store Test Template (Zustand)

```typescript
import { createMyStore } from '../MyStore';

describe('MyStore', () => {
  let store: ReturnType<typeof createMyStore>;

  beforeEach(() => {
    // Create fresh store for each test
    store = createMyStore();
  });

  afterEach(() => {
    // Cleanup if needed
    store.destroy?.();
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = store.getState();
      
      expect(state.items).toEqual([]);
      expect(state.selectedId).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('actions', () => {
    it('adds item to state', () => {
      const item = { id: '1', name: 'Test Item' };
      
      store.getState().addItem(item);
      
      expect(store.getState().items).toContainEqual(item);
    });

    it('removes item from state', () => {
      // Setup
      store.setState({ items: [{ id: '1', name: 'Test' }] });
      
      // Action
      store.getState().removeItem('1');
      
      // Assert
      expect(store.getState().items).toHaveLength(0);
    });

    it('updates item in state', () => {
      // Setup
      store.setState({ items: [{ id: '1', name: 'Original' }] });
      
      // Action
      store.getState().updateItem('1', { name: 'Updated' });
      
      // Assert
      expect(store.getState().items[0].name).toBe('Updated');
    });
  });

  describe('selectors', () => {
    it('selects specific item by id', () => {
      const items = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      store.setState({ items });
      
      const item = store.getState().getItemById('1');
      
      expect(item).toEqual(items[0]);
    });
  });

  describe('subscriptions', () => {
    it('notifies subscribers on state change', () => {
      const listener = jest.fn();
      
      const unsubscribe = store.subscribe(listener);
      
      store.getState().addItem({ id: '1', name: 'Test' });
      
      expect(listener).toHaveBeenCalled();
      
      unsubscribe();
    });
  });

  describe('async actions', () => {
    it('loads data successfully', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      const mockFetch = jest.fn().mockResolvedValue(mockData);
      
      await store.getState().loadData(mockFetch);
      
      expect(store.getState().items).toEqual(mockData);
      expect(store.getState().isLoading).toBe(false);
      expect(store.getState().error).toBeNull();
    });

    it('handles load error', async () => {
      const mockError = new Error('Load failed');
      const mockFetch = jest.fn().mockRejectedValue(mockError);
      
      await store.getState().loadData(mockFetch);
      
      expect(store.getState().error).toBe(mockError);
      expect(store.getState().isLoading).toBe(false);
    });
  });
});
```

## Hook Test Template

```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMyHook } from '../useMyHook';

describe('useMyHook', () => {
  it('returns initial value', () => {
    const { result } = renderHook(() => useMyHook('initial'));
    
    expect(result.current.value).toBe('initial');
  });

  it('updates value on action', () => {
    const { result } = renderHook(() => useMyHook('initial'));
    
    act(() => {
      result.current.setValue('updated');
    });
    
    expect(result.current.value).toBe('updated');
  });

  it('handles prop changes', () => {
    const { result, rerender } = renderHook(
      ({ initialValue }) => useMyHook(initialValue),
      { initialProps: { initialValue: 'first' } }
    );
    
    expect(result.current.value).toBe('first');
    
    rerender({ initialValue: 'second' });
    
    expect(result.current.value).toBe('second');
  });

  it('handles async operations', async () => {
    const { result } = renderHook(() => useMyHook());
    
    act(() => {
      result.current.loadData();
    });
    
    expect(result.current.isLoading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(result.current.data).toBeDefined();
  });

  it('cleans up on unmount', () => {
    const cleanup = jest.fn();
    const useTestHook = () => {
      useEffect(() => {
        return cleanup;
      }, []);
    };
    
    const { unmount } = renderHook(() => useTestHook());
    
    unmount();
    
    expect(cleanup).toHaveBeenCalled();
  });
});
```

## Utility Function Test Template

```typescript
import { myUtilFunction } from '../myUtil';

describe('myUtilFunction', () => {
  describe('valid inputs', () => {
    it('handles normal case', () => {
      const result = myUtilFunction('input');
      
      expect(result).toBe('expected output');
    });

    it('handles edge case 1', () => {
      const result = myUtilFunction('');
      
      expect(result).toBe('');
    });

    it('handles edge case 2', () => {
      const result = myUtilFunction(null);
      
      expect(result).toBeNull();
    });
  });

  describe('invalid inputs', () => {
    it('throws on undefined', () => {
      expect(() => myUtilFunction(undefined)).toThrow('Invalid input');
    });

    it('throws on invalid type', () => {
      expect(() => myUtilFunction(123 as any)).toThrow('Expected string');
    });
  });

  describe('special cases', () => {
    it('handles unicode characters', () => {
      const result = myUtilFunction('emoji 😀');
      
      expect(result).toContain('emoji');
    });

    it('handles very long input', () => {
      const longInput = 'x'.repeat(10000);
      
      expect(() => myUtilFunction(longInput)).not.toThrow();
    });
  });
});
```

## Integration Test Template

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MyFeature } from '../MyFeature';

// Helper to render with providers
const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
};

describe('MyFeature Integration', () => {
  beforeEach(() => {
    // Reset global state, clear mocks, etc.
  });

  it('completes full user workflow', async () => {
    const user = userEvent.setup();
    
    renderWithProviders(<MyFeature />);
    
    // Step 1: Initial state
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    
    // Step 2: User action
    await user.click(screen.getByRole('button', { name: /start/i }));
    
    // Step 3: Loading state
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Step 4: Wait for completion
    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
    });
    
    // Step 5: Verify final state
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('handles error in workflow', async () => {
    const user = userEvent.setup();
    
    // Mock API to return error
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(
      new Error('API Error')
    );
    
    renderWithProviders(<MyFeature />);
    
    await user.click(screen.getByRole('button', { name: /start/i }));
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('API Error');
    });
  });
});
```

## Form Test Template

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyForm } from '../MyForm';

describe('MyForm', () => {
  it('submits valid form data', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    
    render(<MyForm onSubmit={onSubmit} />);
    
    // Fill form fields
    await user.type(screen.getByLabelText(/name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email/i), 'john@example.com');
    await user.selectOptions(screen.getByLabelText(/role/i), 'admin');
    
    // Submit form
    await user.click(screen.getByRole('button', { name: /submit/i }));
    
    // Verify submission
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'John Doe',
      email: 'john@example.com',
      role: 'admin'
    });
  });

  it('displays validation errors', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    
    render(<MyForm onSubmit={onSubmit} />);
    
    // Submit without filling required fields
    await user.click(screen.getByRole('button', { name: /submit/i }));
    
    // Verify errors are shown
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    
    // Form should not be submitted
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables submit while submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 100))
    );
    
    render(<MyForm onSubmit={onSubmit} />);
    
    await user.type(screen.getByLabelText(/name/i), 'John');
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);
    
    // Should be disabled during submission
    expect(submitButton).toBeDisabled();
    
    // Should be enabled after completion
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });
  });
});
```

## Async Component Test Template

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { AsyncComponent } from '../AsyncComponent';

// Mock API
jest.mock('../api', () => ({
  fetchData: jest.fn()
}));

import { fetchData } from '../api';
const mockFetchData = fetchData as jest.MockedFunction<typeof fetchData>;

describe('AsyncComponent', () => {
  beforeEach(() => {
    mockFetchData.mockClear();
  });

  it('loads and displays data', async () => {
    mockFetchData.mockResolvedValueOnce({ data: 'Test Data' });
    
    render(<AsyncComponent />);
    
    // Initial loading state
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('Test Data')).toBeInTheDocument();
    });
    
    // Loading indicator should be gone
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('displays error on failure', async () => {
    mockFetchData.mockRejectedValueOnce(new Error('Load failed'));
    
    render(<AsyncComponent />);
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Load failed');
    });
  });

  it('retries on error', async () => {
    const user = userEvent.setup();
    
    mockFetchData.mockRejectedValueOnce(new Error('First attempt failed'));
    mockFetchData.mockResolvedValueOnce({ data: 'Success' });
    
    render(<AsyncComponent />);
    
    // Wait for error
    await waitFor(() => {
      expect(screen.getByText('First attempt failed')).toBeInTheDocument();
    });
    
    // Click retry
    await user.click(screen.getByRole('button', { name: /retry/i }));
    
    // Should succeed
    await waitFor(() => {
      expect(screen.getByText('Success')).toBeInTheDocument();
    });
  });
});
```

## Context Provider Test Template

```typescript
import { render, screen } from '@testing-library/react';
import { MyContextProvider, useMyContext } from '../MyContext';

// Test component that uses the context
const TestComponent = () => {
  const { value, setValue } = useMyContext();
  
  return (
    <div>
      <span>{value}</span>
      <button onClick={() => setValue('updated')}>Update</button>
    </div>
  );
};

describe('MyContext', () => {
  it('provides context value to children', () => {
    render(
      <MyContextProvider initialValue="test">
        <TestComponent />
      </MyContextProvider>
    );
    
    expect(screen.getByText('test')).toBeInTheDocument();
  });

  it('updates context value', async () => {
    const user = userEvent.setup();
    
    render(
      <MyContextProvider initialValue="initial">
        <TestComponent />
      </MyContextProvider>
    );
    
    await user.click(screen.getByRole('button'));
    
    expect(screen.getByText('updated')).toBeInTheDocument();
  });

  it('throws error when used outside provider', () => {
    // Suppress console.error for this test
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => render(<TestComponent />)).toThrow(
      'useMyContext must be used within MyContextProvider'
    );
    
    spy.mockRestore();
  });
});
```

## Quick Copy-Paste Snippets

### Basic Test Structure
```typescript
describe('FeatureName', () => {
  it('does something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = doSomething(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Async Test with waitFor
```typescript
it('async operation', async () => {
  render(<Component />);
  
  await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});
```

### User Event Pattern
```typescript
const user = userEvent.setup();
await user.click(screen.getByRole('button'));
await user.type(screen.getByRole('textbox'), 'text');
```

### Mock Function
```typescript
const mockFn = jest.fn();
mockFn.mockReturnValue('value');
mockFn.mockResolvedValue('async value');
mockFn.mockRejectedValue(new Error('error'));
```

### Store Setup/Cleanup
```typescript
let store: ReturnType<typeof createStore>;

beforeEach(() => {
  store = createStore();
});

afterEach(() => {
  store.destroy?.();
});
```

---

**Tip**: Copy the template that matches your test scenario, replace placeholders with actual names, and customize the test cases to match your requirements.
