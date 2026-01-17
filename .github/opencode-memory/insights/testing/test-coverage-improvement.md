# Testing Patterns - Test Coverage Improvement (2026-01-17)

## Overview

This document captures effective testing patterns used in the NodeTool codebase for improving test coverage.

## Test Coverage Status

- **Total Test Suites**: 222
- **Total Tests**: 2905 (3 skipped)
- **All Tests Passing**: Yes

## Patterns Used

### 1. Zustand Store Testing

**Pattern**: Use `renderHook` from React Testing Library with Zustand stores.

```typescript
import { renderHook, act } from "@testing-library/react";
import { useWorkspaceManagerStore } from "../WorkspaceManagerStore";

describe("WorkspaceManagerStore", () => {
  beforeEach(() => {
    useWorkspaceManagerStore.setState({ isOpen: false });
  });

  it("initializes with correct default state", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore());
    expect(result.current.isOpen).toBe(false);
  });

  it("updates state correctly", () => {
    const { result } = renderHook(() => useWorkspaceManagerStore());
    
    act(() => {
      result.current.setIsOpen(true);
    });

    expect(result.current.isOpen).toBe(true);
  });
});
```

**Key Points**:
- Reset store state in `beforeEach` to ensure test isolation
- Use `act()` for state updates that trigger re-renders
- Test both state transitions and initial state

### 2. WebSocket Update Handler Testing

**Pattern**: Mock external dependencies and test message type handling.

```typescript
import { handleUpdate, MsgpackData } from "../workflowUpdates";

// Mock dependencies
jest.mock("../ResultsStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setResult: jest.fn(),
      // ... other mocks
    }),
  },
}));

describe("workflowUpdates", () => {
  it("handles notification update type", () => {
    const workflow = createMockWorkflow();
    const runnerStore = createMockRunnerStore();

    const msgpackData: MsgpackData = {
      type: "notification",
      content: "Test notification",
      severity: "info",
    } as unknown as MsgpackData;

    handleUpdate(workflow, msgpackData, runnerStore);
  });

  it("handles node_update with error status", () => {
    const nodeUpdate: NodeUpdate = {
      type: "node_update",
      node_type: "test.node",
      node_id: "node-1",
      node_name: "Test Node",
      status: "error",
      error: "Test error message",
    };

    const msgpackData: MsgpackData = nodeUpdate as unknown as MsgpackData;
    handleUpdate(workflow, msgpackData, runnerStore);
  });
});
```

**Key Points**:
- Mock all external dependencies at the top level
- Use TypeScript casting for msgpack data types
- Test different message types independently
- Test state-dependent behavior (e.g., cancelled workflows)

### 3. Fixing Failing Tests

**Issue**: Mock function not accepting override parameters

**Before**:
```typescript
const createMockWorkflow = (): Workflow => ({
  id: "workflow-123",
  name: "Test Workflow",
  // ...
} as unknown as Workflow);

// This doesn't work - function doesn't accept parameters
const workflow = createMockWorkflow({ id: "my-workflow-id" });
```

**After**:
```typescript
const createMockWorkflow = (overrides: Partial<Workflow> = {}): Workflow => ({
  id: "workflow-123",
  name: "Test Workflow",
  ...overrides,
} as unknown as Workflow);

// Now works correctly
const workflow = createMockWorkflow({ id: "my-workflow-id" });
```

## Test Files Created

1. `web/src/stores/__tests__/WorkspaceManagerStore.test.ts`
   - 5 tests covering state management
   - Tests initial state, transitions, and isolation

2. `web/src/stores/__tests__/workflowUpdates.test.ts`
   - 8 tests covering WebSocket update handling
   - Tests subscription, notifications, node/edge updates

## Best Practices

1. **Test Isolation**: Always reset store state in `beforeEach`
2. **Mock External Dependencies**: Jest mocks for stores and services
3. **Use TypeScript**: Proper typing for test data
4. **Descriptive Names**: Test names should explain what is being tested
5. **Test Behavior**: Focus on observable behavior, not implementation

## Verification Commands

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern="workflowUpdates.test.ts"

# Run with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint
npm run lint
```

## Related Documentation

- [Jest Testing Framework](../technology/jest.md)
- [React Testing Library](../technology/react-testing-library.md)
- [Zustand State Management](../architecture/state-management.md)
