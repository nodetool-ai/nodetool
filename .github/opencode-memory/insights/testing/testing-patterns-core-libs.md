# Testing Patterns for Core Libraries (2026-01-21)

## Overview

This document captures effective testing patterns discovered while adding tests for core library files including graph utilities, frontend tools, and drag-drop serialization.

## Patterns Discovered

### 1. Testing Graph Algorithms

**Files Tested**: `src/core/graph.ts`, `src/core/workflow/graphMapping.ts`

**Key Patterns**:
- Use Kahn's algorithm for topological sort testing with various graph topologies
- Test linear chains, diamond patterns, and parallel execution scenarios
- Test cycle detection with proper console warning assertions
- For `subgraph` extraction, test stop node behavior and edge filtering

**Example Test Structure**:
```typescript
describe("topologicalSort", () => {
  it("sorts linear chain A->B->C into separate layers", () => {
    const nodes = [createNode("A"), createNode("B"), createNode("C")];
    const edges = [createEdge("A", "B"), createEdge("B", "C")];
    const result = topologicalSort(edges, nodes);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(["A"]);
  });
});
```

### 2. Testing Singleton Registries

**Files Tested**: `src/lib/tools/frontendTools.ts`

**Key Patterns**:
- Singletons require cleanup between tests to prevent state leakage
- Add a `clearRegistry()` method specifically for testing
- Use `beforeEach` and `afterAll` hooks for proper isolation
- Test both registration/unregistration and manifest generation

**Example**:
```typescript
beforeEach(() => {
  FrontendToolRegistry.abortAll();
  FrontendToolRegistry.clearRegistry();
});

afterAll(() => {
  FrontendToolRegistry.abortAll();
  FrontendToolRegistry.clearRegistry();
});
```

**Why Needed**: FrontendToolRegistry is a module-level singleton that persists across tests. Without cleanup, tests pollute each other.

### 3. Testing Browser API Mocks

**Files Tested**: `src/lib/dragdrop/serialization.ts`

**Key Patterns**:
- Create mock DataTransfer objects with proper TypeScript typing
- Use `as unknown as DataTransfer` for complex browser APIs
- Test both new unified format and legacy fallback formats
- Verify backward compatibility with existing code

**Example Mock**:
```typescript
const createMockDataTransfer = (): DataTransfer => {
  const data: Record<string, string> = {};
  return {
    getData: (key: string) => data[key] || "",
    setData: (key: string, value: string) => { data[key] = value; },
    items: { length: 0, [Symbol.iterator]: () => emptyIterator() },
    files: [],
  } as unknown as DataTransfer;
};
```

### 4. Testing Edge Validation Logic

**Files Tested**: `src/core/workflow/graphMapping.ts`

**Key Patterns**:
- Test valid edges with matching handles
- Test edge rejection for missing nodes
- Test edge rejection for invalid handles
- Test sanitization of parent references

**Critical Test Cases**:
- Edges to non-existent nodes
- Edges with invalid source/target handles
- Dynamic node handling (allows any input)
- Parent reference cleanup

### 5. TypeScript Testing Specifics

**Issues Resolved**:
1. **Unused imports**: Remove `NodeStore` when not used
2. **Null type assertions**: Use `as unknown as { aborted: boolean }` for complex null checks
3. **Singleton cleanup**: Add `clearRegistry()` method for test isolation

**Type Assertion Pattern**:
```typescript
expect((receivedSignal as unknown as { aborted: boolean }).aborted).toBe(false);
```

This pattern avoids TypeScript's strict null checking when the signal is assigned inside async code.

## Test Files Added

1. `src/core/workflow/__tests__/graphMapping.test.ts` - Graph edge validation
2. `src/core/__tests__/graph.test.ts` - Graph algorithms (topologicalSort, subgraph)
3. `src/lib/__tests__/frontendTools.test.ts` - Frontend tool registry
4. `src/lib/dragdrop/__tests__/serialization.test.ts` - Drag-drop serialization (verified complete)

## Results

- **240 test suites** pass
- **3150 tests** passing
- All type checks pass
- Lint warnings reduced (1 unrelated warning remains)

## Related Files

- See `build-test-lint.md` for overall testing guidelines
- See existing tests in `src/stores/__tests__/` for store testing patterns
- See `src/hooks/__tests__/` for hook testing patterns
