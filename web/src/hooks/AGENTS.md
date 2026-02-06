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

## Testing

```bash
cd web
npm test -- --testPathPattern=hooks  # Hook tests only
```

- Use `renderHook` from `@testing-library/react`.
- Use `act` for state updates.
- Mock stores and external dependencies.
