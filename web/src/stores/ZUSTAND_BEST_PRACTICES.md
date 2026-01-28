# Zustand Best Practices

This document outlines the best practices for using Zustand in the NodeTool codebase. Following these patterns will help maintain code quality, performance, and prevent common bugs.

## Table of Contents

1. [Core Principles](#core-principles)
2. [State Immutability](#state-immutability)
3. [Avoiding Unnecessary get()](#avoiding-unnecessary-get)
4. [Selector Patterns](#selector-patterns)
5. [Common Anti-Patterns](#common-anti-patterns)
6. [Store Architecture](#store-architecture)
7. [Testing Stores](#testing-stores)

---

## Core Principles

### 1. Always Maintain Immutability

Zustand relies on immutable state updates to trigger React re-renders. Never mutate state directly.

```typescript
// ❌ BAD: Direct mutation
const store = create((set, get) => ({
  items: [],
  addItem: (item) => {
    const items = get().items;
    items.push(item);  // ❌ Mutates existing array
    set({ items });
  }
}));

// ✅ GOOD: Immutable update
const store = create((set) => ({
  items: [],
  addItem: (item) => {
    set((state) => ({
      items: [...state.items, item]  // ✅ Creates new array
    }));
  }
}));
```

### 2. Use set() Callback Over get()

Using the `set()` callback function provides access to current state and is more efficient than calling `get()`.

```typescript
// ❌ BAD: Using get()
const store = create((set, get) => ({
  count: 0,
  increment: () => {
    set({ count: get().count + 1 });
  }
}));

// ✅ GOOD: Using set() callback
const store = create((set) => ({
  count: 0,
  increment: () => {
    set((state) => ({ count: state.count + 1 }));
  }
}));
```

### 3. Keep Stores Focused

Each store should manage a single domain of state. Avoid creating monolithic stores that try to do everything.

---

## State Immutability

### Updating Objects

```typescript
// ❌ BAD: Mutating object
clearErrors: (workflowId: string) => {
  const errors = get().errors;
  for (const key in errors) {
    if (key.startsWith(workflowId)) {
      delete errors[key];  // ❌ Direct mutation
    }
  }
  set({ errors });
}

// ✅ GOOD: Creating new object
clearErrors: (workflowId: string) => {
  set((state) => ({
    errors: Object.fromEntries(
      Object.entries(state.errors).filter(
        ([key]) => !key.startsWith(workflowId)
      )
    )
  }));
}
```

### Removing Properties

```typescript
// ❌ BAD: Using delete operator
clearNodeError: (nodeId: string) => {
  const errors = get().errors;
  delete errors[nodeId];  // ❌ Mutation
  set({ errors });
}

// ✅ GOOD: Using destructuring
clearNodeError: (nodeId: string) => {
  set((state) => {
    const { [nodeId]: removed, ...remainingErrors } = state.errors;
    return { errors: remainingErrors };
  });
}
```

### Updating Nested Objects

```typescript
// ❌ BAD: Multiple get() calls
startExecution: (nodeId: string) => {
  set({
    timings: {
      ...get().timings,  // ❌ Calling get()
      [nodeId]: { startTime: Date.now() }
    }
  });
}

// ✅ GOOD: Single set() callback
startExecution: (nodeId: string) => {
  set((state) => ({
    timings: {
      ...state.timings,  // ✅ Using state from callback
      [nodeId]: { startTime: Date.now() }
    }
  }));
}
```

### Updating Arrays

```typescript
// ❌ BAD: Mutating array
addItem: (item) => {
  const items = get().items;
  items.push(item);  // ❌ Mutation
  set({ items });
}

// ✅ GOOD: Creating new array
addItem: (item) => {
  set((state) => ({
    items: [...state.items, item]
  }));
}

// ✅ GOOD: Filtering array
removeItem: (id) => {
  set((state) => ({
    items: state.items.filter(item => item.id !== id)
  }));
}

// ✅ GOOD: Updating item in array
updateItem: (id, updates) => {
  set((state) => ({
    items: state.items.map(item =>
      item.id === id ? { ...item, ...updates } : item
    )
  }));
}
```

---

## Avoiding Unnecessary get()

The `get()` function should be used sparingly, primarily for getter methods and complex conditional logic that can't be easily expressed in `set()`.

### When get() is Acceptable

```typescript
// ✅ GOOD: Getter method
getError: (workflowId: string, nodeId: string) => {
  const key = hashKey(workflowId, nodeId);
  return get().errors[key];
}

// ✅ GOOD: Complex logic requiring current state
isFavorite: (nodeType: string) => {
  return get().favorites.some((f) => f.nodeType === nodeType);
}
```

### When to Avoid get()

```typescript
// ❌ BAD: Using get() in action
toggleFavorite: (nodeType: string) => {
  if (get().isFavorite(nodeType)) {  // ❌ Multiple get() calls
    get().removeFavorite(nodeType);
  } else {
    get().addFavorite(nodeType);
  }
}

// ✅ GOOD: Single set() with conditional logic
toggleFavorite: (nodeType: string) => {
  set((state) => {
    const isFavorite = state.favorites.some((f) => f.nodeType === nodeType);
    if (isFavorite) {
      return {
        favorites: state.favorites.filter((f) => f.nodeType !== nodeType)
      };
    } else {
      return {
        favorites: [
          { nodeType, timestamp: Date.now() },
          ...state.favorites
        ]
      };
    }
  });
}
```

---

## Selector Patterns

### Use Selectors to Prevent Unnecessary Re-renders

```typescript
// ❌ BAD: Subscribing to entire store
const MyComponent = () => {
  const store = useMyStore();  // ❌ Re-renders on any state change
  return <div>{store.count}</div>;
}

// ✅ GOOD: Selective subscription
const MyComponent = () => {
  const count = useMyStore((state) => state.count);  // ✅ Only re-renders when count changes
  return <div>{count}</div>;
}

// ✅ GOOD: Multiple selectors
const MyComponent = () => {
  const count = useMyStore((state) => state.count);
  const increment = useMyStore((state) => state.increment);
  return <button onClick={increment}>{count}</button>;
}
```

### Create Reusable Selectors

```typescript
// ✅ GOOD: Reusable selector functions
const selectActiveItems = (state) => 
  state.items.filter(item => item.active);

const selectItemCount = (state) => 
  state.items.length;

// Use in components
const MyComponent = () => {
  const activeItems = useMyStore(selectActiveItems);
  const itemCount = useMyStore(selectItemCount);
  // ...
}
```

---

## Common Anti-Patterns

### 1. Direct Mutation with Loops

```typescript
// ❌ BAD
clearResults: (workflowId: string) => {
  const results = get().results;
  for (const key in results) {
    if (key.startsWith(workflowId)) {
      delete results[key];  // ❌ Mutation
    }
  }
  set({ results });
}

// ✅ GOOD
clearResults: (workflowId: string) => {
  set((state) => ({
    results: Object.fromEntries(
      Object.entries(state.results).filter(
        ([key]) => !key.startsWith(workflowId)
      )
    )
  }));
}
```

### 2. Calling Actions from Actions

```typescript
// ❌ BAD: Nested action calls
toggleItem: (id: string) => {
  if (get().isSelected(id)) {
    get().deselect(id);  // ❌ Action calling action
  } else {
    get().select(id);
  }
}

// ✅ GOOD: Single set() with logic
toggleItem: (id: string) => {
  set((state) => {
    const isSelected = state.selected.includes(id);
    return {
      selected: isSelected
        ? state.selected.filter(x => x !== id)
        : [...state.selected, id]
    };
  });
}
```

### 3. Multiple get() Calls in Sequence

```typescript
// ❌ BAD: Multiple get() calls
updateWithRelated: (id: string) => {
  const items = get().items;
  const related = get().related;
  const metadata = get().metadata;
  // ... complex logic
  set({ items, related, metadata });
}

// ✅ GOOD: Single set() with all state
updateWithRelated: (id: string) => {
  set((state) => {
    const items = state.items;
    const related = state.related;
    const metadata = state.metadata;
    // ... complex logic
    return { items, related, metadata };
  });
}
```

---

## Store Architecture

### Keep Stores Focused

```typescript
// ❌ BAD: Monolithic store
const useMegaStore = create((set) => ({
  // Workflows
  workflows: [],
  currentWorkflow: null,
  
  // Nodes
  nodes: [],
  selectedNodes: [],
  
  // Assets
  assets: [],
  currentFolder: null,
  
  // Settings
  theme: 'dark',
  language: 'en',
  
  // ... 50+ more properties and actions
}));

// ✅ GOOD: Focused stores
const useWorkflowStore = create(/* workflow state only */);
const useNodeStore = create(/* node state only */);
const useAssetStore = create(/* asset state only */);
const useSettingsStore = create(/* settings only */);
```

### Use Middleware Appropriately

```typescript
// ✅ GOOD: Persist settings
const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme })
    }),
    { name: 'settings-storage' }
  )
);

// ✅ GOOD: Temporal undo/redo for editor
const useNodeStore = create(
  temporal(
    (set) => ({
      nodes: [],
      edges: [],
      // ... editor state
    }),
    { limit: 1000 }
  )
);
```

### Type Safety

```typescript
// ✅ GOOD: Fully typed store
interface MyStoreState {
  count: number;
  items: Item[];
  increment: () => void;
  addItem: (item: Item) => void;
}

const useMyStore = create<MyStoreState>((set) => ({
  count: 0,
  items: [],
  increment: () => set((state) => ({ count: state.count + 1 })),
  addItem: (item) => set((state) => ({ items: [...state.items, item] }))
}));
```

---

## Testing Stores

### Test State Updates

```typescript
import { renderHook, act } from '@testing-library/react';
import useMyStore from './MyStore';

describe('MyStore', () => {
  it('increments count', () => {
    const { result } = renderHook(() => useMyStore());
    
    expect(result.current.count).toBe(0);
    
    act(() => {
      result.current.increment();
    });
    
    expect(result.current.count).toBe(1);
  });
  
  it('maintains immutability', () => {
    const { result } = renderHook(() => useMyStore());
    
    const initialItems = result.current.items;
    
    act(() => {
      result.current.addItem({ id: '1', name: 'Test' });
    });
    
    // Verify new array reference
    expect(result.current.items).not.toBe(initialItems);
    // Verify item was added
    expect(result.current.items).toHaveLength(1);
  });
});
```

---

## Quick Reference Checklist

When creating or updating a Zustand store, verify:

- [ ] All state updates use immutable patterns
- [ ] No direct mutations (no `delete`, `push`, etc. on state)
- [ ] `set()` callback used instead of `get()` where possible
- [ ] Actions don't call other actions via `get()`
- [ ] Store is focused on a single domain
- [ ] Full TypeScript types defined
- [ ] Tests cover immutability and state updates
- [ ] Selectors used in components to prevent unnecessary re-renders

---

## Resources

- [Zustand Documentation](https://docs.pmnd.rs/zustand)
- [React Immutability Patterns](https://react.dev/learn/updating-objects-in-state)
- [NodeTool Stores Guide](./AGENTS.md)

---

## Migration Examples

### Before and After

See the following commits for real-world examples of applying these best practices:

- ErrorStore: Fixed direct mutation patterns
- ResultsStore: Converted 11 methods to immutable updates
- ExecutionTimeStore: Eliminated unnecessary get() calls
- FavoriteNodesStore: Consolidated action logic
- BottomPanelStore: Refactored to single set() callback
