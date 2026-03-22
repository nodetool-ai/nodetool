# Server State Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **ServerState**

## Rules

- Use TanStack Query (React Query) for all server state — don't use `useEffect` + `useState` for API calls.
- Use hierarchical query keys: `['assets', assetId]`, `['workflow', workflowId, 'tools']`.
- Set appropriate `staleTime` based on data volatility (30s for frequent data, 5min+ for rarely changing data).
- Use `enabled` option for conditional queries — don't fetch when IDs are null/undefined.
- Always handle loading, error, and empty states.
- Use `useMutation` for server modifications. Invalidate related queries after success.
- Use optimistic updates for better UX on mutations.
- Place tests in `__tests__/` subdirectories.

## Patterns

```typescript
// ✅ Good — conditional query with proper types
const { data, isLoading, error } = useQuery({
  queryKey: ['asset', assetId],
  queryFn: () => fetchAsset(assetId!),
  enabled: !!assetId,
  staleTime: 60000,
});

// ❌ Bad — fetches even when assetId is null
const { data } = useQuery({
  queryKey: ['asset', assetId],
  queryFn: () => fetchAsset(assetId),
});
```

```typescript
// ✅ Good — mutation with cache invalidation
const { mutate } = useMutation({
  mutationFn: updateResource,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['resources'] });
  },
});
```

## Testing

```bash
cd web
npm test -- --testPathPattern=serverState  # ServerState tests only
```

- Wrap hooks in `QueryClientProvider` with `retry: false` for tests.
- Mock `ApiClient` methods (`GET`, `POST`, `PATCH`, `DELETE`).
- Use `waitFor` for async assertions.
