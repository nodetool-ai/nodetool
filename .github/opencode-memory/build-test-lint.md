# Build, Test, and Lint Requirements

## 🛡️ Automated Quality Guardrails

**NEW**: OpenCode workflows now enforce quality standards automatically!

All OpenCode workflows include:
- **Pre-flight checks**: Baseline quality assessment before agent runs
- **Post-change verification**: Ensures no NEW errors introduced
- **Automatic failure**: Workflow fails if quality degrades

**See [Quality Guardrails Documentation](./quality-guardrails.md) for complete details.**

## Mandatory Commands

**All PRs must pass these three commands before merging:**

```bash
make typecheck  # TypeScript type checking
make lint       # ESLint code quality checks
make test       # Jest unit and integration tests
```

### Keep it Green

These commands MUST exit with code 0. If any fail:
1. Fix the reported errors
2. Re-run the failing command
3. Continue until all pass

## Individual Package Commands

### Web Package

```bash
cd web

# Type checking
npm run typecheck         # Check types only

# Linting
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues

# Testing
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
npm run test:summary      # Summary output

# E2E Testing
npm run test:e2e          # Run E2E tests (requires backend)
npm run test:e2e:ui       # Interactive mode
npm run test:e2e:headed   # See browser

# Build
npm run build             # Production build
```

### Electron Package

```bash
cd electron

# Type checking
npm run typecheck         # Check types only

# Linting
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues

# Testing
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report

# E2E Testing
npm run test:e2e          # Run E2E tests
npm run test:e2e:ui       # Interactive mode
npm run test:e2e:headed   # See browser

# Build
npm run build             # Production build
```

### Mobile Package

```bash
cd mobile

# Type checking
npm run typecheck         # Check types only

# Testing
npm test                  # Run all tests
```

## Make Commands

The Makefile provides unified commands across all packages:

```bash
# Run all checks
make check                # typecheck + lint + test

# Individual checks
make typecheck            # All packages
make typecheck-web        # Web only
make typecheck-electron   # Electron only
make typecheck-mobile     # Mobile only

make lint                 # All packages
make lint-web             # Web only
make lint-electron        # Electron only

make lint-fix             # Auto-fix all packages
make format               # Alias for lint-fix

make test                 # All packages
make test-web             # Web only
make test-electron        # Electron only
make test-mobile          # Mobile only

# Build
make build                # All packages
make build-web            # Web only
make build-electron       # Electron only

# Combined
make all                  # install + typecheck + lint + test + build
```

## Testing Requirements

### Unit/Integration Tests

- **Location**: `src/**/__tests__/**/*.test.ts(x)`
- **Framework**: Jest 29.7 with React Testing Library 16.1
- **Coverage**: Not required but encouraged for new features
- **Patterns**: Follow existing test patterns in the codebase

### E2E Tests

- **Location**: `tests/e2e/**/*.spec.ts` (web), `electron/tests/e2e/**/*.spec.ts` (electron)
- **Framework**: Playwright 1.57
- **Backend**: E2E tests require Python backend running on port 7777
- **Setup**: Tests automatically start/stop servers via Playwright config

### Test Guidelines

1. **Test Behavior**: Test what users see/do, not implementation
2. **Accessible Queries**: Use `getByRole`, `getByLabelText`, not `getByTestId`
3. **User Events**: Use `userEvent` not `fireEvent`
4. **Mock External**: Mock API calls and external dependencies
5. **Isolate Tests**: Each test should be independent
6. **Follow Patterns**: Look at existing tests in the same area

## Linting Rules

### TypeScript

- **Strict Mode**: Enabled
- **No `any`**: Use explicit types
- **No `var`**: Use `const` or `let`
- **Explicit Returns**: Function return types required

### React

- **Functional Components**: No class components
- **Hooks Rules**: Follow Rules of Hooks
- **Props Types**: Explicit interfaces for all props
- **No Unused**: No unused variables or imports

### Code Quality

- **Strict Equality**: Use `===` not `==`
- **Array Checks**: Use `Array.isArray()` not `typeof`
- **Curly Braces**: Always use braces for control statements
- **Error Objects**: Throw `new Error()` not strings
- **Catch Comments**: Explain empty catch blocks

## Common Lint Errors

### `@typescript-eslint/no-explicit-any`

```typescript
// ❌ Bad
const data: any = fetchData();

// ✅ Good
interface Data {
  id: string;
  name: string;
}
const data: Data = fetchData();
```

### `eqeqeq` - Require Strict Equality

```typescript
// ❌ Bad
if (value == null) { }

// ✅ Good
if (value === null) { }
// Or for null/undefined check:
if (value == null) { } // Exception: checking both null and undefined
```

### `curly` - Require Braces

```typescript
// ❌ Bad
if (condition) doSomething();

// ✅ Good
if (condition) {
  doSomething();
}
```

### `@typescript-eslint/no-throw-literal`

```typescript
// ❌ Bad
throw "Error message";

// ✅ Good
throw new Error("Error message");
```

### `no-empty` - No Empty Blocks

```typescript
// ❌ Bad
try {
  JSON.parse(str);
} catch (e) {}

// ✅ Good
try {
  JSON.parse(str);
} catch (e) {
  // JSON parse failed, continue with default
}
```

## TypeScript Errors

### Common Type Issues

1. **ReactFlow Node Types**: Need explicit casting
2. **Zustand Store Types**: Define state interface first
3. **Event Handlers**: Use React event types
4. **Async Functions**: Promise return types required

## Build Errors

### Web Build

- **Memory**: Large builds may need `NODE_OPTIONS=--max-old-space-size=4096`
- **Dependencies**: Run `npm ci` not `npm install` in CI
- **Assets**: Static assets go in `/public`

### Electron Build

- **Web First**: Build web package before electron
- **Native Modules**: Some require rebuild for Electron

## CI/CD

GitHub Actions runs these checks automatically:
- `.github/workflows/test.yml` - Run tests on PRs
- `.github/workflows/e2e.yml` - E2E tests on web changes
- `.github/workflows/autofix.yml` - Auto-fix lint issues

## Quick Reference

| Command | Purpose | Exit Code |
|---------|---------|-----------|
| `make typecheck` | Check TypeScript types | Must be 0 |
| `make lint` | Check code quality | Must be 0 |
| `make test` | Run unit tests | Must be 0 |
| `make lint-fix` | Auto-fix lint issues | Use before commit |
| `make check` | All checks | Must be 0 |

## Tips for OpenCode Workflows

1. **Run checks early**: Run `make check` before making complex changes
2. **Fix incrementally**: Fix lint/type errors as you introduce them
3. **Use lint-fix**: Run `make lint-fix` to auto-fix many issues
4. **Check existing tests**: Look at similar tests for patterns
5. **Test before PR**: Always run `make check` before opening PR

---

## Testing Patterns (2026-01-19)

### Hook Testing with Inline Mocks

The codebase uses inline factory function mocks for complex dependencies:

```typescript
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    screenToFlowPosition: jest.fn().mockReturnValue({ x: 100, y: 200 }),
  })),
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const mockState = {
      addNode: jest.fn(),
      createNode: jest.fn().mockReturnValue({ id: "new-node-1" }),
    };
    if (typeof selector === "function") {
      return selector(mockState);
    }
    return mockState;
  }),
}));
```

### Store Testing with Factory Pattern

Create isolated store instances for testing:

```typescript
let store: ReturnType<typeof createWorkflowRunnerStore>;

beforeEach(() => {
  jest.clearAllMocks();
  store = createWorkflowRunnerStore("test-workflow-id");
});

afterEach(() => {
  store.getState().cleanup();
});
```

### Vite Compatibility for Tests

Add to `jest.setup.js` for `import.meta` support:

```javascript
global.import = {
  meta: {
    hot: undefined,
  },
};
```

### NodeData Type Usage

Use proper Node<NodeData> typing with Position enum:

```typescript
import { Edge, Node, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";

const createNode = (id: string): Node<NodeData> => ({
  id,
  type: "test",
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test",
  },
});
```

### Notification Type

Use `content` field, not `message`:

```typescript
store.getState().addNotification({
  type: "info",
  content: "Test message",
});
```

### Mock Files Added

1. `src/__mocks__/WorkflowManagerContext.tsx` - Context provider mock
2. `src/__mocks__/RecentNodesStore.ts` - Recent nodes store mock

---

## Test Coverage Improvement (2026-01-20)

### Tests Added

**5 new test files** covering critical stores, utilities, and hooks:

1. **`src/stores/__tests__/SessionStateStore.test.ts`**
   - Tests clipboard data management (set/get/clear)
   - Tests clipboard validity state tracking
   - Tests complete clipboard workflow

2. **`src/utils/__tests__/graphDiff.test.ts`**
   - Tests graph diff computation for nodes and edges
   - Tests added/removed/modified node detection
   - Tests edge change detection
   - Tests UI property change tracking
   - Tests diff summary generation

3. **`src/utils/__tests__/errorHandling.test.ts`**
   - Tests AppError class creation
   - Tests createErrorMessage utility for different error types
   - Tests detail extraction from various error formats

4. **`src/hooks/__tests__/useAutosave.test.ts`**
   - Tests autosave enable/disable logic
   - Tests checkpoint save functionality
   - Tests workflow ID changes
   - Tests notification on successful save
   - Tests error handling

5. **`src/hooks/__tests__/useFocusPan.test.ts`**
   - Tests callback function return
   - Tests keyboard event listener setup/cleanup
   - Tests Tab key tracking behavior

### Patterns Used

1. **Store Testing**: Reset store state in beforeEach/afterEach hooks
2. **Hook Testing**: Mock external dependencies (stores, fetch, window events)
3. **Utility Testing**: Test pure functions with various inputs including edge cases
4. **Mocking**: Use jest.mock for external dependencies and context providers

### Files Created

- `web/src/stores/__tests__/SessionStateStore.test.ts`
- `web/src/utils/__tests__/graphDiff.test.ts`
- `web/src/utils/__tests__/errorHandling.test.ts`
- `web/src/hooks/__tests__/useAutosave.test.ts`
- `web/src/hooks/__tests__/useFocusPan.test.ts`

### Test Results

- All new tests pass successfully
- No type errors in new test files
- No lint errors in new test files

---

## Test Coverage Improvement (2026-01-20 - Additional Tests)

### Tests Added

**2 new test files** covering critical workflow update processing and edge handling:

1. **`src/stores/__tests__/workflowUpdates.test.ts`**
   - Tests handleUpdate function for various update types (log_update, job_update, node_update, output_update, node_progress, edge_update)
   - Tests job state transitions (running, completed, cancelled, failed, suspended, paused)
   - Tests node status handling including error cases
   - Tests edge update handling with cancelled/error state checks
   - Tests subscription management (subscribeToWorkflowUpdates, unsubscribeFromWorkflowUpdates)
   - Tests __UPDATES__ global tracking

2. **`src/hooks/__tests__/useProcessedEdges.test.ts`**
   - Tests empty edge processing
   - Tests default type handling when no metadata
   - Tests edge style computation (stroke, strokeWidth)
   - Tests edge status handling (message-sent class, counter labels)
   - Tests bypass node handling (from-bypassed class)
   - Tests selection caching during drag operations
   - Tests label styling for message counters
   - Tests data preservation in processed edges

### Patterns Used

1. **Store Testing**: Create isolated runner stores, mock WebSocket and store dependencies
2. **Hook Testing**: Use renderHook from React Testing Library
3. **Type Safety**: Use proper TypeScript types and interfaces
4. **Mocking**: Mock global stores (ResultsStore, StatusStore, LogStore, ErrorStore, etc.)
5. **Cleanup**: Proper afterEach cleanup to prevent test pollution

### Files Created

- `web/src/stores/__tests__/workflowUpdates.test.ts`
- `web/src/hooks/__tests__/useProcessedEdges.test.ts`

### Test Results

- **31 tests added** (19 in workflowUpdates, 12 in useProcessedEdges)
- All tests pass successfully
- TypeScript compilation passes
- ESLint passes
- Coverage increased for critical workflow execution paths
