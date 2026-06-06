# Stores Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Stores**

Also see: **[Zustand Best Practices](./ZUSTAND_BEST_PRACTICES.md)**

## Rules

- Each store must focus on a single domain (e.g., assets, nodes, UI panels).
- Define a TypeScript interface for all store state and actions.
- Use selectors to subscribe to only the needed state — avoid subscribing to entire stores.
- Use `shallow` equality for object selections to prevent unnecessary re-renders.
- Define actions within the store alongside state.
- Use `persist` middleware for settings that should survive page refreshes.
- Use `temporal` (zundo) middleware for stores that need undo/redo.
- Keep state updates immutable. Use Immer middleware for complex nested updates.

## Patterns

```typescript
// ✅ Good — selective subscription
const nodes = useNodeStore(state => state.nodes);
const addNode = useNodeStore(state => state.addNode);

// ❌ Bad — subscribes to entire store, causes unnecessary re-renders
const store = useNodeStore();
```

```typescript
// ✅ Good — shallow equality for multi-value selection
const { selectedAssets, searchTerm } = useAssetGridStore(
  state => ({ selectedAssets: state.selectedAssets, searchTerm: state.searchTerm }),
  shallow
);
```

## Concurrent runs — state must be keyed by `jobId`

A single workflow can have **multiple runs in flight at once**. Every piece of
run-related state must be scoped to the `jobId` it belongs to, or concurrent
runs will clobber each other. These rules come straight from shipped bug fixes:

- **Return the id from whatever starts an async run — never re-read a global
  afterward.** `WorkflowRunner.run()` returns the `job_id` it actually started
  (it may queue a fresh job while `runnerStore.job_id` still points at the
  active one). Callers must use the returned id; reading `runnerStore.job_id`
  right after `run()` subscribes to the wrong job.
- **Capture a job's outputs/errors from the live message stream into a per-job
  `Map` keyed by `jobId`** — don't resolve a finished run's result by reading a
  workflow- or node-keyed shared store (`ResultsStore`/`ErrorStore`) at
  completion time. A sibling run will have overwritten that slot. Clean the map
  up on unsubscribe.
- **Guard every shared-slot reset/clear on ownership.** Before resetting
  per-workflow run state from a terminal `job_update`, check the slot still
  belongs to this job (`store.job_id === jobId`). A terminal event from one job
  must never reset another's state.
- **Don't clear shared state at workflow scope to "reset" one run.**
  `clearErrors(workflowId)` wipes every concurrent run's errors. Job-keyed state
  is already empty for a fresh `jobId`, so clear at the narrowest key (`jobId`)
  or not at all.
- **An async/background task that resolves later must not call a focus-grabbing,
  latest-run-wins action unconditionally.** `recordRun` auto-focuses the latest
  run; result hydration writes under `HYDRATED_JOB_ID` always but only
  `recordRun`s when no real run exists (`getRuns(workflowId)` shows none),
  otherwise it steals focus from a live run.

## Testing

```bash
cd web
npm test -- --testPathPattern=stores  # Store tests only
```

- Place tests in `__tests__/` subdirectories.
- Test actions and derived state, not internal implementation.
- Mock API calls and external dependencies.
- **Regression-test run-state code with two concurrent same-workflow jobs**
  driven through the real reducer/handler (see `WorkflowRunner.test.ts`,
  `workflowResultHydration.focus.test.ts`). Single-job tests miss every bug above.
