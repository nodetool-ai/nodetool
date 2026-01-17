# Test Coverage Improvements (2026-01-17)

## Summary

Continued test coverage improvement efforts with focus on fixing existing test issues and verifying test infrastructure.

## Issues Fixed

### 1. AssetSearchInput Test Theme Mock Issue

**Problem**: Tests failing due to incomplete theme mock for MUI v7 CSS variables.

**Solution**: Added missing `grey` color palette to theme mock:
```typescript
// Add grey colors for AssetSearchInput component
grey: {
  0: "#000000",
  50: "#fafafa",
  100: "#f5f5f5",
  200: "#eeeeee",
  300: "#e0e0e0",
  400: "#bdbdbd",
  500: "#9e9e9e",
  600: "#757575",
  700: "#616161",
  800: "#424242",
  900: "#212121",
  1000: "#ffffff"
}
```

**Files Modified**:
- `web/src/__mocks__/themeMock.ts`

**Status**: Partial fix - component uses `theme.vars.palette.grey[400]` which requires full CSS vars setup

### 2. UUID Test Fixes

**Problem**: Tests failing due to incorrect position checks.

**Solution**: Fixed variant bit position check:
```typescript
// Before (incorrect - checking position 17)
expect(["8", "9", "a", "b"]).toContain(char17);

// After (correct - checking position 19 for variant bits)
expect(["8", "9", "a", "b"]).toContain(char19);
```

Also fixed version bit check:
```typescript
// Before (using indexOf which finds first occurrence)
const versionPosition = result.indexOf("4");
expect(versionPosition).toBe(14);

// After (using charAt for specific position)
expect(result.charAt(14)).toBe("4");
```

**Files Modified**:
- `web/src/stores/__tests__/uuidv4.test.ts`

**Status**: Fixed - All 10 tests passing

### 3. useAutosave Test Merge Conflicts

**Problem**: Test file contained merge conflict markers causing syntax errors.

**Solution**: Removed merge conflict markers and resolved conflicting code sections:
- Removed `<<<<<<< HEAD` and `>>>>>>> origin/main` markers
- Kept correct test implementations
- Removed duplicate test definitions

**Files Modified**:
- `web/src/hooks/__tests__/useAutosave.test.ts`

**Status**: Merge conflicts resolved, but some tests still failing due to complex mocking requirements

## Key Learnings

1. **UUID Structure**: Understanding UUID format is critical:
   - Position 14: Version bit (always '4' for UUID v4)
   - Position 19-21: Variant bits (must be 8, 9, a, or b)

2. **Theme Mocking**: MUI v7 CSS variables require comprehensive mock setup:
   - Need `theme.vars.palette` with all nested properties
   - Some components access `theme.vars.palette.grey[400]` directly
   - Using `createTheme()` doesn't automatically create vars property

3. **Merge Conflict Resolution**: When merging test files:
   - Remove all conflict markers
   - Ensure only one test definition per test name
   - Verify closing braces and parentheses match

## Existing Test Coverage

The codebase already has comprehensive test coverage for:

### Stores (40+ test files)
- ResultsStore, SessionStateStore, NodeFocusStore
- ConnectionStore, ErrorStore, LogStore
- GlobalChatStore, AssetStore, CollectionStore
- And many more...

### Hooks (10+ test files)
- useAlignNodes, useAutosave, useDelayedHover
- useFindInWorkflow, useFitView, useFocusPan
- useIsDarkMode, useLoraModels, useSelectConnected
- useSelectionActions, useWorkflowRunnerState

### Utilities (40+ test files)
- ColorUtils, MousePosition, NodeTypeMapping
- NumberInput.utils, PrefixTreeSearch, TypeHandler
- browser, colorConversion, dockviewLayout
- edgeValue, errorHandling, fileExplorer
- And many more...

## Testing Patterns Used

### Store Testing
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

### Utility Testing
```typescript
describe("utilityFunction", () => {
  it("performs expected behavior", () => {
    const result = utilityFunction(input);
    expect(result.property).toEqual(expected);
  });
});
```

## Remaining Issues

1. **AssetSearchInput.test.tsx**: Theme mock incomplete for CSS vars
2. **useAutosave.test.ts**: Complex dependency mocking needs review
3. **WorkspaceManagerStore.test.ts**: Store initialization issues

## Recommendations

1. Consider using MSW (Mock Service Worker) for API mocking
2. Create theme mock factory function for consistency
3. Add integration tests for complex hooks
4. Consider snapshot testing for component rendering

## Files Modified

1. `web/src/__mocks__/themeMock.ts` - Added grey palette colors
2. `web/src/stores/__tests__/uuidv4.test.ts` - Fixed position checks
3. `web/src/hooks/__tests__/useAutosave.test.ts` - Resolved merge conflicts

## Status

Test coverage improvements ongoing. Key fixes applied to uuidv4 tests. Some pre-existing test failures remain due to complex mocking requirements.
