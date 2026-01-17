# Test Coverage Improvements (2026-01-17)

**Coverage Added**: 8 new test files with 117 tests

**Tests Added**:
- `MiniMapStore.test.ts` - 8 tests for minimap UI state management
- `PanelStore.test.ts` - 17 tests for panel layout and resizing
- `VersionHistoryStore.test.ts` - 16 tests for version history and autosave tracking
- `ConnectionStore.test.ts` - 12 tests for node connection state
- `AssetGridStore.test.ts` - 35 tests for asset grid state management
- `ModelManagerStore.test.ts` - 18 tests for model manager UI state
- `uuidv4.test.ts` - 6 tests for UUID generation
- `graphCycle.test.ts` - 17 tests for cycle detection
- `selectionBounds.test.ts` - 17 tests for selection rectangle calculation

**Areas Covered**:
- MiniMap visibility state and toggling
- Panel resizing with min/max constraints
- Panel view switching and visibility management
- Version selection and comparison modes
- Edit count tracking per workflow
- Autosave timestamp management
- Node connection initiation and termination
- Asset selection, filtering, and dialog management
- Model filtering and search
- UUID generation format validation
- Cycle detection in graphs
- Selection rectangle calculation for drag selection

**Test Patterns Used**:

1. **Zustand Store Testing Pattern** (without renderHook):
```typescript
describe("StoreName", () => {
  beforeEach(() => {
    useStoreName.setState({
      // explicit initial state
    });
  });

  test("should perform action", () => {
    useStoreName.getState().action();
    expect(useStoreName.getState().property).toEqual(expected);
  });
});
```

2. **Pure Utility Function Testing**:
```typescript
describe("utilityFunction", () => {
  it("performs expected transformation", () => {
    const result = utilityFunction(input);
    expect(result.property).toEqual(expected);
  });
});
```

3. **Cycle Detection Testing**:
```typescript
it("returns true when cycle exists", () => {
  const nodes = [...];
  const edges = [...];
  expect(hasCycle(nodes, edges)).toBe(true);
});
```

**Files Created**:
- `web/src/stores/__tests__/MiniMapStore.test.ts`
- `web/src/stores/__tests__/VersionHistoryStore.test.ts`
- `web/src/stores/__tests__/ConnectionStore.test.ts`
- `web/src/stores/__tests__/AssetGridStore.test.ts`
- `web/src/stores/__tests__/ModelManagerStore.test.ts`
- `web/src/utils/__tests__/uuidv4.test.ts`
- `web/src/utils/__tests__/graphCycle.test.ts`
- `web/src/utils/__tests__/selectionBounds.test.ts`

**Key Learnings**:
1. Zustand stores with persist middleware don't expose getInitialState() - use explicit state in beforeEach
2. Use `useStore.getState()` directly instead of renderHook for better performance
3. Utility functions are ideal candidates for unit tests - pure functions with predictable outputs
4. Graph algorithms need thorough edge case coverage (empty graphs, single nodes, self-loops, etc.)
5. Panel resizing requires testing min/max constraints and edge cases

**Status**: All 117 tests passing

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
