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

### Test Coverage Improvement (2026-01-17 - Additional Coverage)

**Coverage Added**: 6 new store test files with 92 tests

**Tests Added**:
- `AppHeaderStore.test.ts` - 15 tests for help dialog state management
- `FindInWorkflowStore.test.ts` - 26 tests for find/replace workflow functionality
- `MiniMapStore.test.ts` - 10 tests for minimap visibility toggling
- `InspectedNodeStore.test.ts` - 10 tests for node inspection state
- `ModelFiltersStore.test.ts` - 19 tests for model filtering (types, sizes, families)
- `MetadataStore.test.ts` - 12 tests for node metadata and model management

**Areas Covered**:
- Help dialog open/close state and navigation
- Find workflow search term, results, and navigation (next/prev)
- Minimap visibility toggle and state management
- Node inspection toggle and selection
- Model filter types (instruct, chat, base, etc.)
- Model size bucket filtering
- Model family filtering
- Clear all filters functionality
- Node metadata storage and retrieval
- Recommended models management
- Node types registration

**Test Patterns Used**:

1. **Simple State Store Pattern**:
```typescript
describe("StoreName", () => {
  beforeEach(() => {
    useStoreName.setState(useStoreName.getInitialState());
  });

  it("should initialize with correct defaults", () => {
    const state = useStoreName.getInitialState();
    expect(state.property).toBe(expectedValue);
  });

  it("should update state on action", () => {
    useStoreName.getState().setProperty(value);
    expect(useStoreName.getState().property).toBe(value);
  });
});
```

2. **Toggle Pattern Testing**:
```typescript
describe("toggleVisible", () => {
  it("should toggle from false to true", () => {
    useStore.setState({ visible: false });
    useStore.getState().toggleVisible();
    expect(useStore.getState().visible).toBe(true);
  });

  it("should toggle multiple times", () => {
    expect(useStore.getState().visible).toBe(false);
    useStore.getState().toggleVisible();
    expect(useStore.getState().visible).toBe(true);
    useStore.getState().toggleVisible();
    expect(useStore.getState().visible).toBe(false);
  });
});
```

3. **Filter Store Pattern**:
```typescript
describe("toggleType", () => {
  it("should add type when not selected", () => {
    useStore.getState().toggleType("instruct");
    expect(useStore.getState().selectedTypes).toContain("instruct");
  });

  it("should remove type when already selected", () => {
    useStore.setState({ selectedTypes: ["instruct", "chat"] });
    useStore.getState().toggleType("instruct");
    expect(useStore.getState().selectedTypes).toEqual(["chat"]);
  });
});
```

4. **Navigation Store Pattern**:
```typescript
describe("navigateNext", () => {
  it("should increment selectedIndex within bounds", () => {
    useStore.setState({ results: [...], selectedIndex: 1 });
    useStore.getState().navigateNext();
    expect(useStore.getState().selectedIndex).toBe(2);
  });

  it("should wrap to 0 when at last result", () => {
    useStore.setState({ results: [...], selectedIndex: lastIndex });
    useStore.getState().navigateNext();
    expect(useStore.getState().selectedIndex).toBe(0);
  });
});
```

5. **Clear All Pattern**:
```typescript
describe("clearAll", () => {
  it("should reset all filter state", () => {
    useStore.setState({
      selectedTypes: ["instruct"],
      sizeBucket: "3-7B",
      families: ["llama"]
    });
    useStore.getState().clearAll();
    expect(useStore.getState().selectedTypes).toEqual([]);
    expect(useStore.getState().sizeBucket).toBeNull();
    expect(useStore.getState().families).toEqual([]);
  });
});
```

**Files Created**:
- `web/src/stores/__tests__/AppHeaderStore.test.ts`
- `web/src/stores/__tests__/FindInWorkflowStore.test.ts`
- `web/src/stores/__tests__/MiniMapStore.test.ts`
- `web/src/stores/__tests__/InspectedNodeStore.test.ts`
- `web/src/stores/__tests__/ModelFiltersStore.test.ts`
- `web/src/stores/__tests__/MetadataStore.test.ts`

**Key Learnings**:
1. Simple Zustand stores with basic actions are straightforward to test
2. Navigation patterns (next/previous with wrapping) need edge case coverage
3. Filter stores with add/remove semantics need both happy path and toggle tests
4. Clear/reset operations should verify all state is properly reset
5. Store initialization should be tested to ensure correct defaults
6. Complex store interactions benefit from full workflow tests

**Status**: All 92 tests passing
