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

## Test Coverage Improvements (2026-01-17)

**Coverage Added**: 6 new test files with 58 tests

**Tests Added**:
- `ApiClient.test.ts` - 3 tests for API client module
- `uuidv4.test.ts` - 6 tests for UUID generation
- `graphNodeToReactFlowNode.test.ts` - 23 tests for graph to ReactFlow node conversion
- `reactFlowNodeToGraphNode.test.ts` - 18 tests for ReactFlow to graph node conversion
- `graphEdgeToReactFlowEdge.test.ts` - 8 tests for graph to ReactFlow edge conversion
- `reactFlowEdgeToGraphEdge.test.ts` - 10 tests for ReactFlow to graph edge conversion

**Areas Covered**:
- UUID v4 format validation (version 4 marker, variant, uniqueness)
- API client module structure and exports
- Node conversion between graph and ReactFlow formats
- Edge conversion between graph and ReactFlow formats
- Default dimensions for special node types (Preview, CompareImages)
- Bypassed node styling
- Parent-child node relationships
- Dynamic properties and outputs mapping
- zIndex handling for group nodes

**Test Patterns Used**:

1. **Pure Function Testing Pattern**:
```typescript
describe("graphNodeToReactFlowNode", () => {
  it("converts basic graph node to ReactFlow node", () => {
    const workflow = createMockWorkflow();
    const graphNode = createMockGraphNode();
    const result = graphNodeToReactFlowNode(workflow, graphNode);
    expect(result.id).toBe("node-1");
    expect(result.type).toBe("test-node");
  });
});
```

2. **Mock Required Dependencies**:
```typescript
jest.mock("../../components/node_types/PlaceholderNode", () => () => null);
jest.mock("@xyflow/react", () => ({
  Node: class Node {},
  Edge: class Edge {},
  Position: { Left: "left", Right: "right" }
}));
```

3. **Edge Case Testing**:
```typescript
it("sets default width for Preview node", () => {
  const graphNode = createMockGraphNode({
    type: "nodetool.workflows.base_node.Preview",
    ui_properties: { position: { x: 0, y: 0 } }
  });
  const result = graphNodeToReactFlowNode(workflow, graphNode);
  expect(result.style?.width).toBe(400);
  expect(result.style?.height).toBe(300);
});
```

4. **Handle Conversion**:
```typescript
it("converts null handles to empty strings", () => {
  const reactFlowEdge: Edge = {
    id: "edge-1",
    source: "node-a",
    target: "node-b",
    sourceHandle: null,
    targetHandle: null
  };
  const result = reactFlowEdgeToGraphEdge(reactFlowEdge);
  expect(result.sourceHandle).toBe("");
  expect(result.targetHandle).toBe("");
});
```

**Files Created**:
- `web/src/stores/__tests__/ApiClient.test.ts`
- `web/src/stores/__tests__/uuidv4.test.ts`
- `web/src/stores/__tests__/graphNodeToReactFlowNode.test.ts`
- `web/src/stores/__tests__/reactFlowNodeToGraphNode.test.ts`
- `web/src/stores/__tests__/graphEdgeToReactFlowEdge.test.ts`
- `web/src/stores/__tests__/reactFlowEdgeToGraphEdge.test.ts`

**Key Learnings**:
1. Mock PlaceholderNode to avoid React context issues in store tests
2. Pure functions are easier to test than stateful stores
3. Test edge cases (null, undefined, special node types)
4. Use descriptive test names that explain expected behavior
5. Test both happy path and error conditions

**Status**: All 58 tests passing
