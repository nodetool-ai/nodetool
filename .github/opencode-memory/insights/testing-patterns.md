# Testing Patterns for NodeTool

This document describes testing patterns used throughout the NodeTool codebase.

## Test File Organization

### Location Convention
- **Stores**: `src/stores/__tests__/StoreName.test.ts`
- **Utils**: `src/utils/__tests__/UtilsName.test.ts`
- **Hooks**: `src/hooks/__tests__/useHookName.test.ts` or `src/hooks/nodes/__tests__/useHookName.test.ts`
- **Lib**: `src/lib/module/__tests__/FileName.test.ts`
- **Components**: `src/components/path/__tests__/Component.test.tsx`

### Naming Convention
- Test files: `*.test.ts` or `*.test.tsx`
- Test patterns follow: `describe` blocks for the unit, `it` blocks for behaviors

## Jest Testing Patterns

### Basic Store Testing
```typescript
// src/stores/__tests__/MyStore.test.ts
import { renderHook, act } from '@testing-library/react';
import { useMyStore } from '../MyStore';

describe('MyStore', () => {
  beforeEach(() => {
    // Reset store state
    useMyStore.setState(useMyStore.getInitialState());
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useMyStore());
    expect(result.current.value).toBe(defaultValue);
  });

  it('updates state correctly', () => {
    const { result } = renderHook(() => useMyStore());
    
    act(() => {
      result.current.setValue('new value');
    });

    expect(result.current.value).toBe('new value');
  });
});
```

### Utility Function Testing
```typescript
// src/utils/__tests__/myUtil.test.ts
import { myUtilFunction } from '../myUtil';

describe('myUtilFunction', () => {
  it('handles happy path', () => {
    expect(myUtilFunction('input')).toEqual('expected');
  });

  it('handles edge cases', () => {
    expect(myUtilFunction('')).toBeFalsy();
    expect(myUtilFunction(null)).toBeUndefined();
  });

  it('throws on invalid input', () => {
    expect(() => myUtilFunction('invalid')).toThrow();
  });
});
```

### Tool/Registry Testing
```typescript
// src/lib/tools/__tests__/frontendTools.test.ts
import { FrontendToolRegistry } from '../frontendTools';

describe('FrontendToolRegistry', () => {
  const testTools: string[] = [];

  afterEach(() => {
    // Cleanup registered tools
    for (const name of testTools) {
      (FrontendToolRegistry as any).registry.delete(name);
    }
    testTools.length = 0;
  });

  it('registers tools with unique names', () => {
    const tool = { name: 'ui_test_unique123', ... };
    FrontendToolRegistry.register(tool);
    testTools.push('ui_test_unique123');
    expect(FrontendToolRegistry.has('ui_test_unique123')).toBe(true);
  });
});
```

## Mock Patterns

### Mocking External Dependencies
```typescript
// Mock module before imports
jest.mock('../../stores/ApiClient', () => ({
  isLocalhost: true,
  client: { GET: jest.fn() }
}));

// Mock WebSocket (avoid in tests - prefer unit tests)
global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket);
```

### Mocking Components
```typescript
jest.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: any) => <div>{children}</div>,
  useReactFlow: () => ({
    fitView: jest.fn(),
    setNodes: jest.fn(),
  }),
}));
```

## Testing Async Operations

### Async/Await
```typescript
it('fetches data successfully', async () => {
  const { result } = renderHook(() => useMyHook());
  
  await waitFor(() => {
    expect(result.current.data).toBeDefined();
  });
});
```

### Promise-based
```typescript
it('resolves with data', async () => {
  const result = await myAsyncFunction();
  expect(result).toEqual(expectedData);
});
```

## Common Testing Challenges

### Challenge 1: Testing WebSocket
**Solution**: Test the WebSocketManager state machine without actual WebSocket connections. Test state transitions, configuration, and logic independently.

```typescript
// Test state transitions without actual connections
const manager = new WebSocketManager({ url: 'ws://localhost' });
expect(manager.getState()).toBe('disconnected');
```

### Challenge 2: Testing Singleton Patterns
**Solution**: Use unique names in tests and cleanup in `afterEach`.

### Challenge 3: Testing Event Emitters
**Solution**: Use `listenerCount` to verify listeners are added/removed.

```typescript
manager.on('event', handler);
expect(manager.listenerCount('event')).toBe(1);
manager.off('event', handler);
expect(manager.listenerCount('event')).toBe(0);
```

## Best Practices

1. **One test file per source file**: Keeps tests co-located and easy to find
2. **Descriptive test names**: Should explain what is being tested
3. **AAA Pattern**: Arrange, Act, Assert
4. **Independent tests**: Each test should run in isolation
5. **Clean up after**: Use `afterEach` to reset state
6. **Test behavior, not implementation**: Focus on public API
7. **Use meaningful assertions**: `toEqual` for objects, `toBe` for primitives

## Coverage Goals

- **High Priority**: Stores, hooks with logic, utility functions
- **Medium Priority**: Components with business logic, API integration
- **Low Priority**: Presentational components, simple wrappers

## Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- --testPathPattern="MyStore.test.ts"

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Related Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Testing Patterns in NodeTool](../stores/__tests__/)
