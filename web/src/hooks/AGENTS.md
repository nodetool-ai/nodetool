# Hooks Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Hooks**

## Rules

- Always prefix with `use`.
- Use descriptive names matching the domain: `useWorkflowActions` not `useActions`.
- Include TypeScript types for all parameters and return values.
- Return objects (not arrays) for multiple return values.
- Place tests in `__tests__/` subdirectories.

## React Hook Rules

### useEffect

- **Use for**: side effects (network, subscriptions, timers, DOM mutations).
- **Don't use for**: deriving data from props/state — compute it during render instead.
- Every value used inside must be in the dependency array.

```typescript
// ❌ Bad — should be: const value = a + b
useEffect(() => setValue(a + b), [a, b]);
```

### useMemo

- **Use for**: expensive computation, referential stability for child props or dependency arrays.
- **Don't use for**: cheap computation.

```typescript
// ❌ Bad — pointless memoization
const sum = useMemo(() => a + b, [a, b]);
```

### useCallback

- **Use for**: passing functions to memoized children, function is a dependency of useEffect/useMemo.
- **Don't use for**: functions used only locally, children that aren't memoized.

### React.memo

- **Use for**: pure component, stable props, renders often, expensive rendering.
- **Don't use for**: props that change every render, small/cheap components.

**Never add these "just in case." If performance is fine, do nothing.**

## Store-Based Hooks

```typescript
// ✅ Good — selective subscription
const selectedNodes = useNodeStore(state => state.nodes.filter(n => n.selected));

// ❌ Bad — subscribes to entire store
const store = useNodeStore();
```

## Run-driving hooks: concurrency

Hooks that launch and track workflow runs (`sketch/useGenerateLayer`,
`timeline/useGenerateClip`, `useRegenerateStaleLayers`, miniapp runners, node
exec-state hooks) must assume **multiple runs of the same workflow execute at
once**. Lessons from shipped fixes:

- **Resolve a job's output/error from that job's own messages, not a shared
  store.** Capture each job's `output_update` value and node errors into per-job
  maps keyed by `jobId` from the live stream; on completion read
  `extractAssetId(jobOutputs.get(jobId))`. Resolving via
  `resolveOutputAssetId(workflowId, nodeId)` against the shared `ResultsStore`
  lets concurrent runs read each other's results.
- **Use `jobId` returned from `run()`** — don't read `runnerStore.job_id` after
  starting a run (it may point at a different, still-active job).
- **Guard shared-slot resets on `store.job_id === jobId`** before clearing
  per-workflow runner state from a terminal `job_update`.
- **Per-node status is the source of truth for "running now", not the coarse
  run-level `RunState`** — run-level state lags per-node updates (a run can
  execute nodes while still `queued`). Use run-level state only as a negative
  filter (skip `TERMINAL_RUN_STATES`), as `useNodeActiveRunCount` does.
- **Regression test with two concurrent same-workflow jobs** driven through the
  real handler (see `*.concurrency.test.ts`, `ambientLiveness.repro.test.ts`).

## Testing

```bash
cd web
npm test -- --testPathPattern=hooks  # Hook tests only
```

- Use `renderHook` from `@testing-library/react`.
- Use `act` for state updates.
- Mock stores and external dependencies.
