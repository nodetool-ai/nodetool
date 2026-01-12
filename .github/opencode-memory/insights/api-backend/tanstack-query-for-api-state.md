# TanStack Query for API State

**Insight**: TanStack Query (React Query) manages server state with caching and invalidation.

**Benefits**:
- Automatic request deduplication
- Background refetching
- Cache invalidation
- Loading/error states

**Pattern**:
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['workflows', workflowId],
  queryFn: () => fetchWorkflow(workflowId),
});
```

**Date**: 2026-01-10
