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

### Cache invalidation may be indirect

A mutation must keep the cache in sync, but the `invalidateQueries` call need
not sit inline in `onSuccess`. All three forms are valid and in use here:

- **Named `onSuccess` callback** — `onSuccess: invalidate`, where `invalidate`
  calls `queryClient.invalidateQueries(...)` (`useWorkflowVersions.ts`,
  `useAssets.ts`).
- **Store action in `mutationFn`** — the AssetStore `create`/`update`/`delete`
  actions invalidate `["assets", ...]` themselves, so a mutation that calls them
  needs no extra `onSuccess` (`useAssetDeletion.ts`).
- **Inside `mutationFn`** — invalidate right after the write
  (`DeleteModelDialog.tsx`).

Don't add a second invalidation when one of these already covers the data. The
`react-doctor/query-mutation-missing-invalidation` rule is **off** (it only
matches inline `onSuccess` and flags the patterns above as false positives), so
this convention is review-enforced: when you add a mutation that writes server
data, confirm the cache is invalidated somewhere in the success path.

## Testing

```bash
cd web
npm test -- --testPathPattern=serverState  # ServerState tests only
```

- Wrap hooks in `QueryClientProvider` with `retry: false` for tests.
- Mock `ApiClient` methods (`GET`, `POST`, `PATCH`, `DELETE`).
- Use `waitFor` for async assertions.
