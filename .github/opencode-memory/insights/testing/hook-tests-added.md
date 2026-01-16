# Hook Testing Patterns (2026-01-16)

**Insight**: Created comprehensive test suites for several previously untested hooks.

## Tests Added

### Store Tests Added (2026-01-16)

#### 1. ResultsStore Tests
**File**: `web/src/stores/__tests__/ResultsStore.test.ts`

**Coverage**:
- Initial state verification for all result types
- hashKey function for composite keys
- setResult/getResult with simple and array results
- setOutputResult/getOutputResult
- setProgress/getProgress with chunk accumulation
- addChunk/getChunk for streaming data
- setTask/getTask for task tracking
- setToolCall/getToolCall for tool call tracking
- setEdge/getEdge for edge status
- setPreview/getPreview for preview data
- setPlanningUpdate/getPlanningUpdate for planning updates
- deleteResult for removing specific results
- clearResults/clearOutputResults/clearProgress/clearChunks
- clearTasks/clearToolCalls/clearEdges
- clearPlanningUpdates/clearPreviews
- Workflow isolation between different workflows

**Mock Strategy**:
- No external mocks needed - pure Zustand store
- Uses renderHook from React Testing Library
- Tests isolated state for each workflow ID

#### 2. SessionStateStore Tests
**File**: `web/src/stores/__tests__/SessionStateStore.test.ts`

**Coverage**:
- Initial state (null clipboard, invalid)
- setClipboardData with string and null values
- setIsClipboardValid with true/false
- Complete clipboard workflow (set data, mark valid, clear data)

**Mock Strategy**:
- No external mocks needed - simple Zustand store
- Tests state transitions and independence

### 1. useAutosave Hook Tests
**File**: `web/src/hooks/__tests__/useAutosave.test.ts`

**Coverage**:
- Initial state verification
- Autosave disabled scenario
- Workflow dirty state handling
- Null workflow ID handling
- Backend skipped response handling
- Successful autosave with timestamp update
- Save before run checkpoint functionality
- Disabled saveBeforeRun setting
- Error handling for fetch failures
- Skipped response for null workflow ID

**Mock Strategy**:
- Mocked `SettingsStore` with autosave configuration
- Mocked `VersionHistoryStore` for timestamp tracking
- Mocked `NotificationStore` for notifications
- Mocked global `fetch` for API calls

### 2. useFocusPan Hook Tests
**File**: `web/src/hooks/__tests__/useFocusPan.test.ts`

**Coverage**:
- Returns callback function
- Tab press detection
- Node panning when tab is pressed
- Node not found handling
- Zoom level preservation
- Event listener cleanup
- Tab state reset on keyup

**Mock Strategy**:
- Mocked `@xyflow/react` useReactFlow
- Mocked `NodeContext` useNodes
- Simulated keyboard events with `KeyboardEvent`

### 3. useAlignNodes Hook Tests
**File**: `web/src/hooks/__tests__/useAlignNodes.test.ts`

**Coverage**:
- Returns alignment function
- Less than 2 nodes handling
- Vertical alignment (xRange < yRange)
- Horizontal alignment (xRange >= yRange)
- Spacing arrangement for vertical alignment
- Collapsed state setting
- Non-selected node position preservation
- Nodes without measured dimensions

**Mock Strategy**:
- Mocked `@xyflow/react` useReactFlow
- Mocked `NodeContext` useNodes with selected nodes

### 4. useFitView Hook Tests
**File**: `web/src/hooks/__tests__/useFitView.test.ts`

**Coverage**:
- Returns fit view function
- All nodes fitting when none selected
- Selected nodes fitting
- Specific node IDs fitting
- Custom padding support
- Extra left padding application
- getNodesBounds utility:
  - Empty nodes array handling
  - Single node bounds calculation
  - Multiple nodes bounds calculation
  - Nodes without dimensions
  - Parent position inclusion for child nodes

**Mock Strategy**:
- Mocked `@xyflow/react` useReactFlow
- Mocked `NodeContext` useNodes

## Key Patterns

### Hook Testing Pattern
```typescript
// 1. Mock dependencies at the top level
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    fitView: jest.fn(),
    fitBounds: jest.fn()
  }))
}));

// 2. Use renderHook from testing library
const { result } = renderHook(() => useMyHook());

// 3. Test initial state and return type
expect(typeof result.current).toBe("function");

// 4. Test behavior with act() for state updates
act(() => {
  result.current();
});
```

### Mock Path Resolution
Tests in `hooks/__tests__/` use:
- `../../contexts/NodeContext` for NodeContext
- `@xyflow/react` for ReactFlow
- `../../stores/*` for Zustand stores

### Timer Handling
For hooks using setTimeout/requestAnimationFrame:
```typescript
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});
```

## Coverage Impact

**Previous State**: Many hooks had no test coverage
**New Coverage (2026-01-16)**: 2 store test files added + 4 hook test files

**Total Test Cases**: ~70+ individual test cases covering:
- State initialization
- Conditional behavior
- Edge cases
- Error handling
- Cleanup/integration
- Store state management
- Clipboard operations
- Results tracking

## Files Created

1. `/home/runner/work/nodetool/nodetool/web/src/hooks/__tests__/useAutosave.test.ts`
2. `/home/runner/work/nodetool/nodetool/web/src/hooks/__tests__/useFocusPan.test.ts`
3. `/home/runner/work/nodetool/nodetool/web/src/hooks/__tests__/useAlignNodes.test.ts`
4. `/home/runner/work/nodetool/nodetool/web/src/hooks/__tests__/useFitView.test.ts`
5. `/home/runner/work/nodetool/nodetool/web/src/stores/__tests__/ResultsStore.test.ts` (NEW)
6. `/home/runner/work/nodetool/nodetool/web/src/stores/__tests__/SessionStateStore.test.ts` (NEW)

## Notes

- Tests follow existing patterns in the codebase
- Mock external dependencies to keep tests fast
- Use descriptive test names explaining behavior
- Cover both happy path and edge cases
- Clean up timers and event listeners in afterEach
- Store tests use renderHook with Zustand store directly
