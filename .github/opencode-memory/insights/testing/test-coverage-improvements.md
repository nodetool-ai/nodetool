# Test Coverage Improvements (2026-01-16)

**Coverage Added**: 3 new store test files with 74 tests

**Tests Added**:
- `ResultsStore.test.ts` - 35 tests for execution results storage
- `SessionStateStore.test.ts` - 8 tests for clipboard state management
- `NodeFocusStore.test.ts` - 31 tests for node keyboard navigation

**Areas Covered**:
- Results (execution outputs, progress, chunks)
- Output results for nodes
- Progress tracking with chunk accumulation
- Edge status tracking
- Tasks and tool calls
- Planning updates and previews
- Clipboard data management
- Node focus navigation (next/prev/directional)
- Focus history management
- Navigation mode switching

**Test Patterns Used**:

1. **Store Testing Pattern**:
```typescript
describe("StoreName", () => {
  beforeEach(() => {
    useStoreName.setState(useStoreName.getInitialState());
  });

  it("should perform action", () => {
    useStoreName.getState().action();
    expect(useStoreName.getState().property).toEqual(expected);
  });
});
```

2. **Multi-workflow Isolation**:
```typescript
it("should isolate state between workflows", () => {
  useStore.getState().setData("wf-1", "node-1", value1);
  useStore.getState().setData("wf-2", "node-1", value2);
  expect(useStore.getState().getData("wf-1", "node-1")).toEqual(value1);
  expect(useStore.getState().getData("wf-2", "node-1")).toEqual(value2);
});
```

3. **Complex State Operations**:
```typescript
it("should handle append operations", () => {
  useStore.getState().append("wf-1", "node-1", item1);
  useStore.getState().append("wf-1", "node-1", item2, true);
  expect(useStore.getState().getData("wf-1", "node-1")).toEqual([item1, item2]);
});
```

**Files Created**:
- `web/src/stores/__tests__/ResultsStore.test.ts`
- `web/src/stores/__tests__/SessionStateStore.test.ts`
- `web/src/stores/__tests__/NodeFocusStore.test.ts`

**Key Learnings**:
1. Always check for existing tests before creating new ones
2. Multi-workflow isolation is critical for NodeTool's architecture
3. Test cleanup in `beforeEach` is essential for test independence
4. Complex state operations (append, clear by prefix) need thorough edge case coverage

**Status**: All 74 tests passing

---

### Test Coverage Improvement (2026-01-16 - Additional)

**Tests Added**: 41 new tests in utility test files

**Tests Added**:
- `NumberInput.utils.test.ts` - 28 tests for NumberInput utility functions
- `edgeValue.test.ts` - 13 tests for edge value resolution

**Areas Covered**:
- Number input step calculation for various ranges and input types
- Decimal place calculation from step size
- Speed factor calculation for drag slowdown
- Slider width calculation with zoom support
- Value constraint application (min/max clamping, rounding, step snapping)
- Edge value resolution from workflow results
- Fallback to node properties when results unavailable
- Source handle resolution from nested objects

**Test Patterns Used**:

1. **Pure Function Testing**:
```typescript
describe("calculateStep", () => {
  it("returns 0.1 for unbounded float input", () => {
    expect(calculateStep(undefined, undefined, "float")).toBe(0.1);
  });
});
```

2. **Edge Case Coverage**:
```typescript
it("clamps negative value below min", () => {
  expect(applyValueConstraints(-150, -100, 100, "int", 0)).toBe(-100);
});
```

3. **Mock-Based Service Testing**:
```typescript
it("returns result from getResult when available", () => {
  mockGetResult.mockReturnValue({ output: "test-value" });
  const result = resolveExternalEdgeValue(edge, workflowId, mockGetResult, mockFindNode);
  expect(result.value).toBe("test-value");
});
```

**Files Created**:
- `web/src/utils/__tests__/NumberInput.utils.test.ts`
- `web/src/utils/__tests__/edgeValue.test.ts`

**Key Learnings**:
1. Pure utility functions are ideal candidates for unit tests
2. Mock dependencies (getResult, findNode) enable isolated testing
3. Test edge cases like invalid bounds, empty values, and boundary conditions
4. Verify both happy path and error scenarios

**Status**: All 41 tests passing

---

### Test Coverage Improvement (2026-01-17)

**Coverage Added**: 2 new utility test files with 17 tests

**Tests Added**:
- `graphEdgeToReactFlowEdge.test.ts` - 9 tests for graph to ReactFlow edge conversion
- `reactFlowEdgeToGraphEdge.test.ts` - 8 tests for ReactFlow to graph edge conversion

**Areas Covered**:
- Basic edge conversion (id, source, target, handles)
- UUID generation when id is not provided
- Handle null/undefined/empty string conversion
- UI properties (className) handling
- Edge cases with special characters

**Test Patterns Used**:

1. **Utility Function Testing Pattern**:
```typescript
describe("functionName", () => {
  it("performs expected conversion", () => {
    const input = { /* test data */ };
    const result = functionName(input);
    expect(result.property).toEqual(expected);
  });

  it("handles edge case", () => {
    const input = { /* edge case data */ };
    const result = functionName(input);
    expect(result.property).toEqual(expected);
  });
});
```

2. **Edge Conversion Testing**:
```typescript
describe("graphEdgeToReactFlowEdge", () => {
  it("converts a basic edge with all required fields", () => {
    const graphEdge: GraphEdge = {
      id: "edge-1",
      source: "node-1",
      sourceHandle: "output",
      target: "node-2",
      targetHandle: "input"
    };

    const result = graphEdgeToReactFlowEdge(graphEdge);

    expect(result.id).toBe("edge-1");
    expect(result.source).toBe("node-1");
    // ... more assertions
  });
});
```

**Files Created**:
- `web/src/stores/__tests__/graphEdgeToReactFlowEdge.test.ts`
- `web/src/stores/__tests__/reactFlowEdgeToGraphEdge.test.ts`

**Key Learnings**:
1. Simple utility functions are easy to test with basic input/output assertions
2. Handle null, undefined, and empty string edge cases explicitly
3. Verify type conversions (e.g., null handles to null, empty strings to null)
4. Graph conversion utilities are critical for workflow editor functionality

**Status**: All 17 tests passing

---

### Test Coverage Improvement (2026-01-17)

**Coverage Added**: 4 new store test files with 51 tests

**Tests Added**:
- `MetadataStore.test.ts` - 16 tests for node metadata and model management
- `ModelManagerStore.test.ts` - 17 tests for model manager UI state
- `FindInWorkflowStore.test.ts` - 14 tests for find/replace functionality
- `InspectedNodeStore.test.ts` - 4 tests for node inspection state

**Areas Covered**:
- Node metadata storage and retrieval
- Recommended models and model packs
- Model manager filter state (search, type, size, status)
- Find/replace dialog state management
- Search results navigation (next/prev, wrapping)
- Node inspection toggling

**Test Patterns Used**:

1. **Store State Testing Pattern**:
```typescript
describe("StoreName", () => {
  beforeEach(() => {
    useStoreName.setState(useStoreName.getInitialState());
  });

  it("initializes with correct default state", () => {
    expect(useStoreName.getState().property).toEqual(defaultValue);
  });

  it("updates state correctly", () => {
    act(() => {
      useStoreName.getState().setProperty(newValue);
    });
    expect(useStoreName.getState().property).toEqual(newValue);
  });
});
```

2. **Navigation Testing Pattern**:
```typescript
it("navigates to next result", () => {
  const mockResults = [result1, result2, result3];
  act(() => {
    useStore.getState().setResults(mockResults);
  });
  expect(useStore.getState().selectedIndex).toBe(0);

  act(() => {
    useStore.getState().navigateNext();
  });
  expect(useStore.getState().selectedIndex).toBe(1);
});

it("wraps around to first result", () => {
  useStore.getState().setSelectedIndex(1);
  act(() => {
    useStore.getState().navigateNext();
  });
  expect(useStore.getState().selectedIndex).toBe(0);
});
```

3. **Toggle Testing Pattern**:
```typescript
it("toggles state on/off", () => {
  expect(useStore.getState().isOpen).toBe(false);

  act(() => {
    useStore.getState().toggle();
  });
  expect(useStore.getState().isOpen).toBe(true);

  act(() => {
    useStore.getState().toggle();
  });
  expect(useStore.getState().isOpen).toBe(false);
});
```

**Files Created**:
- `web/src/stores/__tests__/MetadataStore.test.ts`
- `web/src/stores/__tests__/ModelManagerStore.test.ts`
- `web/src/stores/__tests__/FindInWorkflowStore.test.ts`
- `web/src/stores/__tests__/InspectedNodeStore.test.ts`

**Key Learnings**:
1. Use `useStore.getState()` directly for testing Zustand stores (not renderHook)
2. Always reset store state in `beforeEach` for test isolation
3. Create proper mock data structures matching TypeScript interfaces
4. Test navigation patterns with edge cases (wrapping, empty lists)
5. Test toggle behavior for both on/off states

**Status**: All 51 tests passing
