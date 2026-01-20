# Testing Patterns and Strategies

Documented: 2026-01-20

## Overview

This document captures effective testing patterns used in NodeTool's test suite, particularly for hooks, stores, and utilities.

---

## Hook Testing Patterns

### 1. useDelayedHover Testing

**Challenge**: Testing hooks with timers (setTimeout/clearTimeout)

**Solution**: Use Jest's fake timers

```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});
```

**Key Techniques**:
- Use `act()` to wrap timer advances
- Test both the delayed callback and timer cleanup
- Test multiple hover cycles
- Test callback updates via ref

**Example**:
```typescript
it("calls callback after delay on mouse enter", () => {
  const callback = jest.fn();
  const { result } = renderHook(() => useDelayedHover(callback, 300));

  act(() => {
    result.current.handleMouseEnter();
  });

  act(() => {
    jest.advanceTimersByTime(300);
  });

  expect(callback).toHaveBeenCalledTimes(1);
});

it("clears timer on mouse leave", () => {
  const callback = jest.fn();
  const { result } = renderHook(() => useDelayedHover(callback, 300));

  act(() => {
    result.current.handleMouseEnter();
  });

  act(() => {
    result.current.handleMouseLeave();
  });

  act(() => {
    jest.advanceTimersByTime(500);
  });

  expect(callback).not.toHaveBeenCalled();
});
```

### 2. useInputMinMax Testing

**Challenge**: Testing hooks that depend on React Context

**Solution**: Mock the context provider

```typescript
jest.mock("../../contexts/NodeContext", () => ({
  NodeContext: React.createContext({
    subscribe: () => () => {},
    getState: () => ({ nodes: [] }),
  }),
}));
```

**Key Techniques**:
- Mock context to return minimal required data
- Test fallback behavior when context doesn't have needed data
- Test edge cases with null/undefined values
- Test different node types (FloatInput, IntegerInput)

**Example**:
```typescript
it("uses defaults when no bounds are provided", () => {
  const { result } = renderHook(() =>
    useInputMinMax({
      nodeType: "nodetool.input.FloatInput",
      nodeId: "test-node",
      propertyName: "value",
    })
  );

  expect(result.current.min).toBe(0);
  expect(result.current.max).toBe(100);
});

it("handles null propertyMin", () => {
  const { result } = renderHook(() =>
    useInputMinMax({
      nodeType: "custom.node",
      nodeId: "test-node",
      propertyName: "value",
      propertyMin: null,
      propertyMax: 100,
    })
  );

  expect(result.current.min).toBe(0);
  expect(result.current.max).toBe(100);
});
```

### 3. useIsDarkMode Testing

**Challenge**: Testing hooks that observe DOM mutations

**Solution**: Mock MutationObserver and document.documentElement.classList

```typescript
beforeEach(() => {
  mockClassList = new DOMTokenList(["light"]);
  Object.defineProperty(document.documentElement, "classList", {
    value: mockClassList,
    writable: true,
  });
});
```

**Key Techniques**:
- Mock classList with writable property
- Use MutationObserver disconnect spy to verify cleanup
- Test state transitions (light → dark → light)
- Test edge cases (empty classList, case sensitivity)

**Example**:
```typescript
it("updates state when dark class is added", async () => {
  mockClassList.value = "light";
  const { result } = renderHook(() => useIsDarkMode());
  expect(result.current).toBe(false);

  act(() => {
    mockClassList.value = "dark light";
  });

  await waitFor(() => {
    expect(result.current).toBe(true);
  });
});
```

---

## Store Utility Testing

### 1. nodeUiDefaults Testing

**Challenge**: Testing TypeScript type definitions and constants

**Solution**: Test both the constant values and type compatibility

**Key Techniques**:
- Test constant values match expected
- Test type accepts valid data structures
- Test edge cases (zero, negative, large values)
- Test optional properties

**Example**:
```typescript
describe("DEFAULT_NODE_WIDTH", () => {
  it("should be equal to 280", () => {
    expect(DEFAULT_NODE_WIDTH).toBe(280);
  });
});

describe("NodeUIProperties type", () => {
  it("should accept all optional properties", () => {
    const uiProperties: NodeUIProperties = {
      position: { x: 100, y: 200 },
      selected: true,
      selectable: true,
      width: 280,
      height: 100,
      zIndex: 1,
      title: "Test Node",
      color: "#ff0000",
      bypassed: false,
    };

    expect(uiProperties.selected).toBe(true);
    expect(uiProperties.width).toBe(280);
  });
});
```

---

## Testing Anti-Patterns to Avoid

### 1. Over-Mocking

**Bad**:
```typescript
// Don't mock everything
jest.mock("axios");
jest.mock("loglevel");
jest.mock("../../utils/helper");
```

**Good**:
```typescript
// Only mock external dependencies that are slow or have side effects
jest.mock("../../contexts/NodeContext", () => ({
  NodeContext: React.createContext({ ... }),
}));
```

### 2. Testing Implementation Details

**Bad**:
```typescript
// Testing internal state
expect(result.current.timerRef.current).not.toBeNull();
```

**Good**:
```typescript
// Testing observable behavior
expect(callback).not.toHaveBeenCalled();
```

### 3. Not Cleaning Up

**Bad**:
```typescript
afterEach(() => {
  // Missing cleanup
});
```

**Good**:
```typescript
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});
```

---

## Best Practices Summary

1. **Test Behavior, Not Implementation**: Focus on what users/other code observe
2. **Use Proper Cleanup**: Prevent test pollution between tests
3. **Mock at the Right Level**: Don't over-mock, but mock external dependencies
4. **Test Edge Cases**: null, undefined, empty, zero, negative, large values
5. **Use Descriptive Test Names**: Clearly describe what's being tested
6. **Follow AAA Pattern**: Arrange, Act, Assert
7. **Keep Tests Independent**: No test should depend on another test's state

---

## Files Referenced

- `web/src/hooks/__tests__/useDelayedHover.test.ts`
- `web/src/hooks/__tests__/useInputMinMax.test.ts`
- `web/src/hooks/__tests__/useIsDarkMode.test.ts`
- `web/src/stores/__tests__/nodeUiDefaults.test.ts`

---

*Last Updated: 2026-01-20*
