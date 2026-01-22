# React Query Hook Testing Patterns

**Insight**: Testing React Query hooks requires proper setup of QueryClientProvider and careful handling of async state transitions.

## Key Patterns

### 1. QueryClientProvider Wrapper
```typescript
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
```

### 2. Mocking API Calls
```typescript
jest.mock("../stores/ApiClient");
const mockClient = client as jest.Mocked<typeof client>;

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.GET.mockResolvedValueOnce({
    data: mockData,
    error: null,
  });
});
```

### 3. Testing Async State
```typescript
await waitFor(() => {
  expect(result.current.isLoading).toBe(false);
});
expect(result.current.data).toEqual(expectedData);
```

### 4. Mocking Authentication State
```typescript
jest.mock("../stores/useAuth");
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

mockUseAuth.mockReturnValue({
  user: { id: "test-user" },
  state: "logged_in",
} as any);
```

## Common Issues

### Timeout Issues
- Tests timeout when mock isn't resolved properly
- Solution: Use `waitFor` with proper assertions, not promises

### State Transitions
- React Query hooks have multiple states (loading, success, error)
- Test the actual states returned, not assumed states

### Mock Hoisting
- Jest hoists `jest.mock` calls automatically
- Ensure mocks are set up before rendering hooks

## Files Using These Patterns

- `web/src/hooks/__tests__/useRunningJobs.test.tsx`
- `web/src/hooks/__tests__/useJobReconnection.test.tsx`
- `web/src/hooks/__tests__/useProviders.test.tsx`

**Date**: 2026-01-22
