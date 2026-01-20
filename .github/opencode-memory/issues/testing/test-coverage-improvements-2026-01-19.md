# Test Coverage Improvements (2026-01-19)

## Summary

Added comprehensive unit tests for critical graph utilities and workflow execution components to improve test coverage.

## Files Added

### 1. Graph Utilities Tests
**File**: `web/src/core/__tests__/graph.test.ts`

**Coverage**: Added 16 tests covering:
- `topologicalSort` function (8 tests):
  - Empty edges handling
  - Linear chain sorting
  - Parallel node layering
  - Diamond pattern handling
  - Multiple source nodes
  - Disconnected nodes
  - Nodes with no edges
  - Complex branching graphs

- `subgraph` function (8 tests):
  - Isolated nodes
  - Linear chain extraction
  - Stop node functionality
  - Diamond subgraph extraction
  - Branching without cycles
  - Edge filtering
  - Disconnected start nodes
  - Cycle handling

**Patterns Used**:
- Descriptive test names following AAA pattern
- Helper functions for node/edge creation
- Type-safe Node<NodeData> typing

### 2. Hook Tests
**Files**:
- `web/src/hooks/__tests__/useWorkflowGraphUpdater.test.ts`
- `web/src/hooks/__tests__/useCreateNode.test.ts`

**Coverage**:
- useWorkflowGraphUpdater: 6 tests
  - Return value verification
  - Warning logging for missing workflow/node store
  - Node store updates
  - Auto-layout triggering
  - Empty graph handling

- useCreateNode: 9 tests
  - Callback return type
  - Null reactFlowInstance handling
  - Position selection (click vs center)
  - Node creation with flow position
  - Recent nodes tracking
  - Menu closing
  - Referential identity

**Patterns Used**:
- Inline factory function mocks (following codebase patterns)
- jest.Mock typing for store access
- act() wrapper for async operations

### 3. Workflow Runner Store Tests
**File**: `web/src/stores/__tests__/WorkflowRunner.test.ts`

**Coverage**: Added 12 tests covering:
- Initial state verification
- Message handler behavior
- Status message updates
- Notification management (add, limit)
- Cleanup functionality
- State transitions (idle → connecting → connected → running)
- Connection failure handling
- Streaming methods (streamInput, endInputStream)
- Warning logging for missing job ID

**Patterns Used**:
- Mocked WebSocket manager
- Store factory pattern
- Async/await for connection tests

## Testing Patterns Employed

### 1. Mock Strategy
```typescript
// Inline factory functions for complex dependencies
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    screenToFlowPosition: jest.fn().mockReturnValue({ x: 100, y: 200 }),
  })),
}));
```

### 2. Store Testing
```typescript
// Factory function for creating isolated store instances
let store = createWorkflowRunnerStore("test-workflow-id");
beforeEach(() => {
  jest.clearAllMocks();
  store = createWorkflowRunnerStore("test-workflow-id");
});
```

### 3. Type Safety
- Proper Position enum usage
- Node<NodeData> generic typing
- Notification type with correct fields (content not message)

## Jest Configuration Updates

### Added Mocks
1. `src/__mocks__/WorkflowManagerContext.tsx` - Context provider mock
2. `src/__mocks__/RecentNodesStore.ts` - Recent nodes store mock

### jest.setup.js Enhancement
Added `import.meta` global mock for Vite compatibility:
```javascript
global.import = {
  meta: {
    hot: undefined,
  },
};
```

### jest.config.ts Updates
Added moduleNameMapper entries:
```typescript
"^.*contexts/WorkflowManagerContext$": "<rootDir>/src/__mocks__/WorkflowManagerContext.tsx",
```

## Quality Checks Passed

- ✅ Lint (make lint)
- ✅ TypeScript (make typecheck)
- ✅ Unit tests (npm test)

## Impact

- **16 new tests** for core graph utilities
- **15 new tests** for hooks and store
- **31 total new tests** improving coverage
- No regressions in existing tests
- Follows existing codebase testing patterns
