# ⚡ Bolt: Optimizing Large Record Filtering in Zustand Stores

## What
Replaced all occurrences of `Object.fromEntries(Object.entries(state.records).filter(...))` with explicit `for...in` loops in `ErrorStore.ts`, `ExecutionTimeStore.ts`, and `VibeCodingStore.ts`.

## Why
When filtering large state dictionaries in Zustand stores (e.g., clearing errors for a specific workflow or node, clearing timings, persisting unsaved vibe coding sessions), `Object.entries(record).filter(...)` creates expensive intermediate arrays (an array of entries, followed by a filtered array of entries) which consume extra memory and processing time. The `for...in` loop approach avoids creating these intermediate arrays entirely.

## Impact
- **Reduced Memory Usage:** Eliminates intermediate array allocations (`[string, T][]`) during state updates and serialization.
- **Faster Execution:** Provides O(N) performance without the overhead of intermediate object mapping and array instantiation.
- **Improved Performance:** Noticeable improvement when updating states or persisting large objects in these specific stores.

## Measurement
Verify that intermediate arrays are no longer created when clearing errors, timings, or persisting vibe coding sessions.

## Testing
- `cd web && npm run typecheck`
- `cd web && npm run lint`
- `make test-web`
