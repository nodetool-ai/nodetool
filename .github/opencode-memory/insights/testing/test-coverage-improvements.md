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

### Test Coverage Improvement (2026-01-17 - Additional)

**Tests Added**: 7 new test files with 69 tests

**Tests Added**:
- `getChildNodes.test.ts` - 7 tests for child node retrieval
- `getGroupBounds.test.ts` - 10 tests for group bounds calculation
- `useIsGroupable.test.ts` - 14 tests for node groupable checks
- `useSurroundWithGroup.test.ts` - 13 tests for surrounding nodes with groups
- `useRemoveFromGroup.test.ts` - 12 tests for removing nodes from groups
- `graphCycle.test.ts` - 18 tests for cycle detection in graphs
- `selectionBounds.test.ts` - 17 tests for selection rectangle calculations

**Areas Covered**:
- Child node filtering by parent ID
- Group bounds calculation with padding and dimensions
- Node type checking (Loop, Group, custom nodes)
- Group node creation and positioning
- Node position adjustment when grouping/ungrouping
- Cycle detection (direct, indirect, multi-path)
- Selection rectangle normalization and bounds

**Test Patterns Used**:

1. **Pure Utility Function Testing**:
```typescript
describe("getChildNodes", () => {
  it("returns all direct children of specified parent", () => {
    const nodes = [
      createMockNode("node-1", "parent-1"),
      createMockNode("node-2", "parent-1"),
      createMockNode("node-3", "parent-2")
    ];
    const result = getChildNodes(nodes, "parent-1");
    expect(result).toHaveLength(2);
  });
});
```

2. **Cycle Detection Testing**:
```typescript
describe("wouldCreateCycle", () => {
  it("returns true for simple direct cycle", () => {
    const edges = [
      createEdge("a", "b"),
      createEdge("b", "a")
    ];
    const result = wouldCreateCycle(edges, "a", "b");
    expect(result).toBe(true);
  });
});
```

3. **Selection Bounds Testing**:
```typescript
describe("getSelectionRect", () => {
  it("returns null when selection is too small", () => {
    const result = getSelectionRect(
      createPosition(0, 0),
      createPosition(2, 100)
    );
    expect(result).toBeNull();
  });
});
```

**Files Created**:
- `web/src/hooks/nodes/__tests__/getChildNodes.test.ts`
- `web/src/hooks/nodes/__tests__/getGroupBounds.test.ts`
- `web/src/hooks/nodes/__tests__/useIsGroupable.test.ts`
- `web/src/hooks/nodes/__tests__/useSurroundWithGroup.test.ts`
- `web/src/hooks/nodes/__tests__/useRemoveFromGroup.test.ts`
- `web/src/utils/__tests__/graphCycle.test.ts`
- `web/src/utils/__tests__/selectionBounds.test.ts`

**Key Learnings**:
1. Mock @xyflow/react functions (getNodesBounds) for isolated testing
2. Mock React context providers for hook tests
3. Use beforeEach to set up mock implementations for each test
4. Test both happy path and edge cases (empty arrays, null values)
5. Utility functions with clear inputs/outputs are easy to test
6. Graph algorithms need thorough edge case coverage

**Status**: 69 tests passing
