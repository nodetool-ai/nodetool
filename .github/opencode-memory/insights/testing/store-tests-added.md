# Store Testing Patterns (2026-01-16)

**Insight**: Created comprehensive test suites for previously untested Zustand stores following established patterns.

## Tests Added

### 1. FindInWorkflowStore Tests
**File**: `web/src/stores/__tests__/FindInWorkflowStore.test.ts`

**Coverage**:
- Initial state verification (isOpen, searchTerm, results, selectedIndex)
- openFind/closeFind toggle functionality
- Search term management
- Results and selection management
- Navigation methods (navigateNext, navigatePrevious)
- Clear search functionality
- Full workflow integration scenarios

**Key Patterns**:
```typescript
// Reset store before each test
beforeEach(() => {
  useFindInWorkflowStore.setState({
    isOpen: false,
    searchTerm: "",
    results: [],
    selectedIndex: 0
  });
});

// Use act() for state updates
act(() => {
  store.openFind();
});
```

### 2. NodeMenuStore Tests
**File**: `web/src/stores/__tests__/NodeMenuStore.test.ts`

**Coverage**:
- Initial state for all properties
- Menu position and size management
- Search term and filtering
- Path selection and navigation
- Keyboard selection (selectedIndex, moveSelectionUp/Down)
- Documentation panel (open/close documentation)
- Hover state management
- Namespace highlighting
- Node menu open/close lifecycle
- Drag-to-create functionality

**Key Patterns**:
```typescript
// Get initial state for reset
const initialState = useNodeMenuStore.getInitialState();

beforeEach(() => {
  useNodeMenuStore.setState(initialState, true);
  jest.useFakeTimers();
});

// Handle timers in store operations
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});
```

### 3. uuidv4 Utility Tests
**File**: `web/src/stores/__tests__/uuidv4.test.ts`

**Coverage**:
- Output format validation (36 characters, UUID pattern)
- Version bits verification (4 in third section)
- Variant bits verification (8, 9, a, or b in fourth section)
- Uniqueness across multiple generations
- Consistency of format
- Edge cases (multiple calls, object keys)

**Key Patterns**:
```typescript
// Test format pattern
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
expect(result).toMatch(uuidPattern);

// Test uniqueness
const ids = new Set<string>();
for (let i = 0; i < 100; i++) {
  ids.add(uuidv4());
}
expect(ids.size).toBe(100);
```

## Testing Strategies Used

### 1. Store Reset Pattern
Always reset the store to initial state in beforeEach to ensure test isolation:

```typescript
beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true);
});
```

### 2. State Transition Testing
Test state changes through actual store actions:

```typescript
act(() => {
  store.openFind();
  store.setSearchTerm("test");
  store.setResults([mockResult]);
});
expect(store.isOpen).toBe(true);
```

### 3. Edge Case Coverage
Test boundary conditions and error scenarios:

```typescript
it("handles empty results", () => {
  const { getSelectedNode } = store;
  store.setSelectedIndex(-1);
  expect(getSelectedNode()).toBeNull();
});
```

### 4. Integration Scenarios
Test complete workflows through the store:

```typescript
it("full search workflow", () => {
  store.openFind();
  store.setSearchTerm("test");
  store.setResults(mockResults);
  store.navigateNext();
  store.navigatePrevious();
  store.clearSearch();
  store.closeFind();
});
```

## Coverage Impact

**Previous State**: FindInWorkflowStore, NodeMenuStore, and uuidv4 had no test coverage

**New Coverage**:
- FindInWorkflowStore: ~40 test cases
- NodeMenuStore: ~40 test cases  
- uuidv4: ~15 test cases

**Total**: ~95 new test cases covering critical functionality

## Files Created

1. `/home/runner/work/nodetool/nodetool/web/src/stores/__tests__/FindInWorkflowStore.test.ts`
2. `/home/runner/work/nodetool/nodetool/web/src/stores/__tests__/NodeMenuStore.test.ts`
3. `/home/runner/work/nodetool/nodetool/web/src/stores/__tests__/uuidv4.test.ts`

## Notes

- Tests follow existing patterns in the codebase (act(), beforeEach reset)
- Mock timers for async operations when needed
- Cover both happy path and edge cases
- Use descriptive test names that explain the behavior being tested
