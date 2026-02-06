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

## Testing

```bash
cd web
npm test -- --testPathPattern=stores  # Store tests only
```

- Place tests in `__tests__/` subdirectories.
- Test actions and derived state, not internal implementation.
- Mock API calls and external dependencies.
