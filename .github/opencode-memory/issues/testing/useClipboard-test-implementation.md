# useClipboard Test Implementation (2026-01-17)

## Summary
Added comprehensive test coverage for the `useClipboard` hook which manages clipboard operations for workflow data in the NodeTool editor.

## Files Created
- `web/src/hooks/__tests__/useClipboard.test.ts`

## Test Coverage Added
8 tests covering:
1. Return value properties (clipboardData, isClipboardValid)
2. Function availability (readClipboard, writeClipboard)
3. Writing arbitrary text to clipboard
4. Validating workflow data before writing
5. Blocking invalid workflow data
6. Writing valid workflow data
7. Reading from clipboard
8. Focus-dependent clipboard reading behavior

## Challenges Encountered

### 1. Zustand Store Mocking
**Problem**: The hook uses `useSessionStateStore((state) => ({...}))` with a selector function, but initial mock didn't handle this pattern.

**Solution**: Mock the store to handle both direct state access and selector pattern:
```typescript
jest.mock("../../stores/SessionStateStore", () => ({
  default: jest.fn((selector) => {
    const state = { /* state */ };
    if (typeof selector === "function") {
      return selector(state);
    }
    return state;
  }),
}));
```

### 2. Internal Function Testing
**Problem**: `validateData` function is defined with `useCallback` but not exposed in the hook's return value.

**Solution**: Tested through the public API (writeClipboard behavior) rather than trying to access internal functions.

### 3. Browser API Mocking
**Problem**: Tests failed because `navigator.clipboard` and `document.hasFocus` need explicit mocking in JSDOM environment.

**Solution**: 
```typescript
global.navigator.clipboard = {
  writeText: jest.fn().mockResolvedValue(undefined),
  readText: jest.fn().mockResolvedValue(""),
} as any;

document.hasFocus = jest.fn().mockReturnValue(true);
```

### 4. Mock Initialization Order
**Problem**: Browser mocks need to be set up before the hook is called, especially for `document.hasFocus`.

**Solution**: Set up all mocks in `beforeEach` and ensure they're properly initialized before `renderHook`.

## Key Testing Patterns

### Testing Hook Return Values
```typescript
it("returns clipboard data from store", () => {
  const { result } = renderHook(() => useClipboard());
  expect(result.current.clipboardData).toBeNull();
  expect(result.current.isClipboardValid).toBe(false);
});
```

### Testing Async Functions
```typescript
it("writes text to clipboard", async () => {
  const { result } = renderHook(() => useClipboard());
  await result.current.writeClipboard("test text", true);
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test text");
});
```

## Test Results
- **Tests Passed**: 8/8
- **Test Suites**: 220 passed (web)
- **Total Tests**: 2891 passed (web)

## Related Files
- `web/src/hooks/browser/useClipboard.ts` - The hook being tested
- `web/src/stores/SessionStateStore.ts` - Store used by the hook
