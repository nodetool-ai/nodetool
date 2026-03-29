# Contexts Guidelines

**Navigation**: [Root AGENTS.md](../../../AGENTS.md) → [Web](../AGENTS.md) → **Contexts**

## Rules

- Contexts wrap Zustand stores to provide them to the React component tree.
- Use the provided custom hooks (`useNodes`, `useWorkflowManager`) for type-safe access — don't access the context directly.
- Use equality functions (shallow/deep) in custom hooks to optimize re-renders.
- Keep context providers in the correct hierarchy — `WorkflowManagerProvider` wraps `NodeProvider`.

## Patterns

```typescript
// ✅ Good — use the provided hook with selector
const nodes = useNodes(state => state.nodes);

// ❌ Bad — accessing context directly
const context = useContext(NodeContext);
```

## Testing

- Test components that consume contexts by wrapping them in the appropriate providers.
- Mock the underlying Zustand store when testing components in isolation.
